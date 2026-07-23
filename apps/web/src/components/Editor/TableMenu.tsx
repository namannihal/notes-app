'use client';

import { useReducer, useEffect } from 'react';
import { BubbleMenu, type Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { CellSelection } from '@tiptap/pm/tables';
import { Heading, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
          <span className="mx-0.5 h-6 w-px bg-border" />
          <Item label={deleteLabel} onClick={smartDelete}>
            <Trash2 />
          </Item>
        </div>
      </TooltipProvider>
    </BubbleMenu>
  );
}
