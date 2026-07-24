import { Extension } from '@tiptap/core';
import { NodeSelection, TextSelection, type Selection } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { CellSelection } from '@tiptap/pm/tables';

/** Returns the table position/node when the whole table is selected. */
function wholeTable(sel: Selection): { tablePos: number; tableNode: PMNode } | null {
  if (sel instanceof NodeSelection && sel.node.type.name === 'table') {
    return { tablePos: sel.from, tableNode: sel.node };
  }
  if (sel instanceof CellSelection && sel.isRowSelection() && sel.isColSelection()) {
    const $a = sel.$anchorCell;
    for (let d = $a.depth; d > 0; d--) {
      if ($a.node(d).type.name === 'table') {
        return { tablePos: $a.before(d), tableNode: $a.node(d) };
      }
    }
  }
  return null;
}

/** Empty every cell of the table but keep its structure. */
function clearTable(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  tablePos: number,
  tableNode: PMNode,
): boolean {
  const ranges: Array<[number, number]> = [];
  state.doc.nodesBetween(tablePos, tablePos + tableNode.nodeSize, (node, pos) => {
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      ranges.push([pos + 1, pos + node.nodeSize - 1]);
    }
    return true;
  });
  if (ranges.length === 0) return false;
  if (!dispatch) return true;

  const tr = state.tr;
  const paragraph = state.schema.nodes.paragraph;
  // Replace back-to-front so earlier positions stay valid.
  for (let i = ranges.length - 1; i >= 0; i--) {
    const [from, to] = ranges[i];
    const empty = paragraph.createAndFill();
    if (empty) tr.replaceWith(from, to, empty);
  }
  const caret = ranges[0][0] + 1;
  tr.setSelection(TextSelection.create(tr.doc, Math.min(caret, tr.doc.content.size)));
  dispatch(tr);
  return true;
}

/**
 * When the whole table is selected: Delete removes the table, Backspace clears
 * its contents but keeps the table.
 */
export const TableKeymap = Extension.create({
  name: 'tableKeymap',
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      // Nesting a list item takes precedence over table cell navigation, so
      // Tab / Shift-Tab indent/outdent bullet & to-do items even inside a table
      // cell. When there's no list item to sink/lift we return false so the
      // table's own Tab (move to next/previous cell) still works.
      Tab: () => {
        const e = this.editor;
        if (e.can().sinkListItem('listItem')) return e.chain().focus().sinkListItem('listItem').run();
        if (e.can().sinkListItem('taskItem')) return e.chain().focus().sinkListItem('taskItem').run();
        return false;
      },
      'Shift-Tab': () => {
        const e = this.editor;
        if (e.can().liftListItem('listItem')) return e.chain().focus().liftListItem('listItem').run();
        if (e.can().liftListItem('taskItem')) return e.chain().focus().liftListItem('taskItem').run();
        return false;
      },
      Backspace: () => {
        const { state, view } = this.editor;
        const whole = wholeTable(state.selection);
        if (!whole) return false;
        return clearTable(state, view.dispatch, whole.tablePos, whole.tableNode);
      },
      Delete: () => {
        const whole = wholeTable(this.editor.state.selection);
        if (!whole) return false;
        return this.editor.chain().focus().deleteTable().run();
      },
    };
  },
});
