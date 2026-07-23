'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import { Plus } from 'lucide-react';

interface Bar {
  start: number;
  size: number;
  cellPos: number;
}

interface Geom {
  corner: { top: number; left: number };
  width: number;
  height: number;
  cols: Bar[];
  rows: Bar[];
  tablePos: number;
}

const BAR = 16;

/**
 * Evernote-style table selection bars. Shown while hovering a table (mouse) or
 * when the caret is inside a table (touch). A top-left square selects the whole
 * table; bars above columns / beside rows select those; and + bars at the
 * bottom/right add a row/column.
 */
export function TableControls({
  editor,
  containerRef,
}: {
  editor: Editor;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [geom, setGeom] = useState<Geom | null>(null);
  const geomRef = useRef<Geom | null>(null);
  geomRef.current = geom;
  const lastTable = useRef<HTMLTableElement | null>(null);

  const cellPosOf = useCallback(
    (el: HTMLElement): number => {
      try {
        return editor.view.posAtDOM(el, 0) - 1;
      } catch {
        return 0;
      }
    },
    [editor],
  );

  const compute = useCallback(
    (tableEl: HTMLTableElement): Geom | null => {
      const cont = containerRef.current;
      if (!cont) return null;
      const cr = cont.getBoundingClientRect();
      const offX = -cr.left + cont.scrollLeft;
      const offY = -cr.top + cont.scrollTop;
      const tr = tableEl.getBoundingClientRect();

      let tablePos = 0;
      try {
        const inner = editor.view.posAtDOM(tableEl, 0);
        const resolved = editor.state.doc.resolve(inner);
        for (let d = resolved.depth; d > 0; d--) {
          if (resolved.node(d).type.name === 'table') {
            tablePos = resolved.before(d);
            break;
          }
        }
      } catch {
        return null;
      }

      const rowEls = Array.from(tableEl.rows);
      const rows: Bar[] = rowEls.map((rowEl) => {
        const rr = rowEl.getBoundingClientRect();
        const firstCell = rowEl.cells[0] as HTMLElement | undefined;
        return {
          start: rr.top + offY,
          size: rr.height,
          cellPos: firstCell ? cellPosOf(firstCell) : 0,
        };
      });

      const cols: Bar[] = [];
      const firstRow = rowEls[0];
      if (firstRow) {
        for (const cellEl of Array.from(firstRow.cells) as HTMLElement[]) {
          const rc = cellEl.getBoundingClientRect();
          cols.push({ start: rc.left + offX, size: rc.width, cellPos: cellPosOf(cellEl) });
        }
      }

      return {
        corner: { top: tr.top + offY, left: tr.left + offX },
        width: tr.width,
        height: tr.height,
        cols,
        rows,
        tablePos,
      };
    },
    [editor, containerRef, cellPosOf],
  );

  // Mouse hover.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function onMove(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-table-ctl]')) return; // over controls → keep
      const cont = containerRef.current;
      const tableEl = (target?.closest('table') as HTMLTableElement | null) ?? null;
      if (tableEl && cont && cont.contains(tableEl)) {
        lastTable.current = tableEl;
        setGeom(compute(tableEl));
        return;
      }
      // Keep the controls visible while the pointer is in the margin around the
      // last table (where the selection bars and + buttons live).
      const lt = lastTable.current;
      if (lt && cont && cont.contains(lt)) {
        const r = lt.getBoundingClientRect();
        const m = BAR * 2 + 20;
        if (
          e.clientX >= r.left - m &&
          e.clientX <= r.right + m &&
          e.clientY >= r.top - m &&
          e.clientY <= r.bottom + m
        ) {
          return;
        }
      }
      lastTable.current = null;
      setGeom(null);
    }
    function onLeave() {
      setGeom(null);
    }

    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);
    return () => {
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
    };
  }, [compute, containerRef]);

  // Caret / touch / edits: keep bars in sync with the table under the caret.
  useEffect(() => {
    function fromSelection(forceHide: boolean) {
      const sel = editor.state.selection;
      const $pos = (sel as unknown as { $anchorCell?: typeof sel.$from }).$anchorCell ?? sel.$from;
      let tablePos = -1;
      for (let d = $pos.depth; d > 0; d--) {
        if ($pos.node(d).type.name === 'table') {
          tablePos = $pos.before(d);
          break;
        }
      }
      if (tablePos < 0) {
        if (forceHide) {
          lastTable.current = null;
          setGeom(null);
        }
        return;
      }
      // Measure after layout settles (e.g. right after add/delete row/column).
      requestAnimationFrame(() => {
        const dom = editor.view.nodeDOM(tablePos) as HTMLElement | null;
        const tableEl =
          dom && dom.tagName === 'TABLE' ? dom : (dom?.querySelector('table') ?? null);
        if (tableEl) {
          lastTable.current = tableEl as HTMLTableElement;
          setGeom(compute(tableEl as HTMLTableElement));
        }
      });
    }
    const onSel = () => fromSelection(true);
    const onUpd = () => fromSelection(false);
    editor.on('selectionUpdate', onSel);
    editor.on('update', onUpd);
    return () => {
      editor.off('selectionUpdate', onSel);
      editor.off('update', onUpd);
    };
  }, [editor, compute]);

  function selectAll() {
    const g = geomRef.current;
    if (!g) return;
    editor
      .chain()
      .focus()
      .command(({ tr, dispatch }) => {
        if (dispatch) tr.setSelection(NodeSelection.create(tr.doc, g.tablePos));
        return true;
      })
      .run();
  }

  function applyCell(make: () => CellSelection) {
    try {
      const sel = make();
      editor.view.dispatch(editor.view.state.tr.setSelection(sel));
      editor.view.focus();
    } catch {
      /* ignore invalid selections */
    }
  }

  function selectCol(cellPos: number) {
    applyCell(() => CellSelection.colSelection(editor.state.doc.resolve(cellPos)));
  }

  function selectRow(cellPos: number) {
    applyCell(() => CellSelection.rowSelection(editor.state.doc.resolve(cellPos)));
  }

  function addRowBottom() {
    const g = geomRef.current;
    if (!g || g.rows.length === 0) return;
    const last = g.rows[g.rows.length - 1];
    editor.chain().focus().setTextSelection(last.cellPos + 2).addRowAfter().run();
  }

  function addRowTop() {
    const g = geomRef.current;
    if (!g || g.rows.length === 0) return;
    const first = g.rows[0];
    editor.chain().focus().setTextSelection(first.cellPos + 2).addRowBefore().run();
  }

  function addColRight() {
    const g = geomRef.current;
    if (!g || g.cols.length === 0) return;
    const last = g.cols[g.cols.length - 1];
    editor.chain().focus().setTextSelection(last.cellPos + 2).addColumnAfter().run();
  }

  function addColLeft() {
    const g = geomRef.current;
    if (!g || g.cols.length === 0) return;
    const first = g.cols[0];
    editor.chain().focus().setTextSelection(first.cellPos + 2).addColumnBefore().run();
  }

  if (!geom) return null;

  return (
    <div data-table-ctl className="pointer-events-none">
      <button
        data-table-ctl
        type="button"
        title="Select table"
        onClick={selectAll}
        className="pointer-events-auto absolute z-20 rounded-sm border bg-muted hover:bg-primary/40"
        style={{ top: geom.corner.top - BAR, left: geom.corner.left - BAR, width: BAR, height: BAR }}
      />
      {geom.cols.map((c, i) => (
        <button
          key={`c${i}`}
          data-table-ctl
          type="button"
          title="Select column"
          onClick={() => selectCol(c.cellPos)}
          className="pointer-events-auto absolute z-20 border bg-muted hover:bg-primary/40"
          style={{ top: geom.corner.top - BAR, left: c.start, width: c.size, height: BAR }}
        />
      ))}
      {geom.rows.map((r, i) => (
        <button
          key={`r${i}`}
          data-table-ctl
          type="button"
          title="Select row"
          onClick={() => selectRow(r.cellPos)}
          className="pointer-events-auto absolute z-20 border bg-muted hover:bg-primary/40"
          style={{ top: r.start, left: geom.corner.left - BAR, width: BAR, height: r.size }}
        />
      ))}
      <button
        data-table-ctl
        type="button"
        title="Add row above"
        onClick={addRowTop}
        className="pointer-events-auto absolute z-20 flex items-center justify-center rounded-sm border bg-muted text-muted-foreground hover:bg-primary/40 hover:text-foreground"
        style={{ top: geom.corner.top - BAR * 2 - 3, left: geom.corner.left, width: geom.width, height: BAR }}
      >
        <Plus className="size-3" />
      </button>
      <button
        data-table-ctl
        type="button"
        title="Add row below"
        onClick={addRowBottom}
        className="pointer-events-auto absolute z-20 flex items-center justify-center rounded-sm border bg-muted text-muted-foreground hover:bg-primary/40 hover:text-foreground"
        style={{ top: geom.corner.top + geom.height + 3, left: geom.corner.left, width: geom.width, height: BAR }}
      >
        <Plus className="size-3" />
      </button>
      <button
        data-table-ctl
        type="button"
        title="Add column left"
        onClick={addColLeft}
        className="pointer-events-auto absolute z-20 flex items-center justify-center rounded-sm border bg-muted text-muted-foreground hover:bg-primary/40 hover:text-foreground"
        style={{ top: geom.corner.top, left: geom.corner.left - BAR * 2 - 3, width: BAR, height: geom.height }}
      >
        <Plus className="size-3" />
      </button>
      <button
        data-table-ctl
        type="button"
        title="Add column right"
        onClick={addColRight}
        className="pointer-events-auto absolute z-20 flex items-center justify-center rounded-sm border bg-muted text-muted-foreground hover:bg-primary/40 hover:text-foreground"
        style={{ top: geom.corner.top, left: geom.corner.left + geom.width + 3, width: BAR, height: geom.height }}
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}
