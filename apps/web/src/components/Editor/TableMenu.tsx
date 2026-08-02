'use client';

import { useReducer, useEffect } from 'react';
import { BubbleMenu, type Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { CellSelection } from '@tiptap/pm/tables';
import { Heading, PaintBucket, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** Fill swatches offered for table cells. */
const CELL_FILLS = [
  '#fee2e2',
  '#ffedd5',
  '#fef9c3',
  '#dcfce7',
  '#dbeafe',
  '#ede9fe',
  '#fce7f3',
  '#f1f5f9',
  '#e2e8f0',
  '#cbd5e1',
];

type Kind = 'row' | 'col' | 'table' | 'cells';

function selectionKind(editor: Editor): Kind {
  const sel = editor.state.selection;
  if (sel instanceof NodeSelection && sel.node.type.name === 'table') return 'table';
  if (sel instanceof CellSelection) {
    const row = sel.isRowSelection();
    const col = sel.isColSelection();
    if (row && col) return 'table';
    if (row) return 'row';
    if (col) return 'col';
    return 'cells';
  }
  return 'cells';
}

function Item({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Fill colour for the selected cell(s). `setCellAttribute` applies to every
 * cell in a CellSelection, and to the caret's cell when there is no selection,
 * so this works for a single cell, a row/column, or the whole table.
 */
function CellFill({ editor }: { editor: Editor }) {
  const apply = (color: string | null) =>
    editor.chain().focus().setCellAttribute('backgroundColor', color).run();

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onMouseDown={(e) => e.preventDefault()}
            >
              <PaintBucket />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Cell background</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="space-y-2">
          <div className="grid grid-cols-5 gap-1">
            {CELL_FILLS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => apply(c)}
                className="size-6 rounded border"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply(null)}
          >
            No fill
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TableMenu({ editor }: { editor: Editor }) {
  const [, rerender] = useReducer((x) => x + 1, 0);

  // Keep the menu labels in sync with the current table selection.
  useEffect(() => {
    editor.on('selectionUpdate', rerender);
    return () => {
      editor.off('selectionUpdate', rerender);
    };
  }, [editor]);

  const kind = selectionKind(editor);
  const deleteLabel =
    kind === 'row' ? 'Delete row' : kind === 'col' ? 'Delete column' : 'Delete table';

  function smartDelete() {
    const k = selectionKind(editor);
    const sel = editor.state.selection;
    const $pos: ResolvedPos | undefined =
      (sel as unknown as { $anchorCell?: ResolvedPos }).$anchorCell ?? sel.$from;
    let table: PMNode | null = null;
    if ($pos) {
      for (let d = $pos.depth; d > 0; d--) {
        const n = $pos.node(d);
        if (n.type.name === 'table') {
          table = n;
          break;
        }
      }
    }
    const rowCount = table?.childCount ?? 0;
    const colCount = table?.firstChild?.childCount ?? 0;

    if (k === 'row') {
      if (rowCount <= 1) editor.chain().focus().deleteTable().run();
      else editor.chain().focus().deleteRow().run();
    } else if (k === 'col') {
      if (colCount <= 1) editor.chain().focus().deleteTable().run();
      else editor.chain().focus().deleteColumn().run();
    } else {
      editor.chain().focus().deleteTable().run();
    }
  }

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableMenu"
      shouldShow={({ editor }) => {
        const sel = editor.state.selection;
        if (sel instanceof CellSelection) return true;
        return sel instanceof NodeSelection && sel.node.type.name === 'table';
      }}
      updateDelay={0}
      tippyOptions={{ placement: 'top', maxWidth: 'none' }}
    >
      <TooltipProvider delayDuration={300}>
        <div className="flex items-center gap-0.5 rounded-md border bg-popover p-1 shadow-md">
          <Item
            label="Toggle header row"
            onClick={() => editor.chain().focus().toggleHeaderRow().run()}
          >
            <Heading />
          </Item>
          <CellFill editor={editor} />
          <span className="mx-0.5 h-6 w-px bg-border" />
          <Item label={deleteLabel} onClick={smartDelete}>
            <Trash2 />
          </Item>
        </div>
      </TooltipProvider>
    </BubbleMenu>
  );
}
