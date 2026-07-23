'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { Editor, Range } from '@tiptap/core';
import { cn } from '@/lib/utils';

export interface SlashItem {
  title: string;
  description?: string;
  icon: React.ReactNode;
  command: (opts: { editor: Editor; range: Range }) => void;
}

export interface SlashMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface Props {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export const SlashMenu = forwardRef<SlashMenuRef, Props>(function SlashMenu(
  { items, command },
  ref,
) {
  const [selected, setSelected] = useState(0);

  useEffect(() => setSelected(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (event.key === 'ArrowUp') {
        setSelected((s) => (s + items.length - 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelected((s) => (s + 1) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        if (items[selected]) command(items[selected]);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) return null;

  return (
    <div className="z-50 max-h-72 w-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
      {items.map((item, i) => (
        <button
          key={item.title}
          type="button"
          className={cn(
            'flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-sm',
            i === selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent',
          )}
          onMouseEnter={() => setSelected(i)}
          onClick={() => command(item)}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded border bg-background [&_svg]:size-4">
            {item.icon}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{item.title}</span>
            {item.description && (
              <span className="block truncate text-xs text-muted-foreground">
                {item.description}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
});
