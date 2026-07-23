'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { ArrowDown, ArrowUp, CaseSensitive, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function FindReplace({
  editor,
  open,
  onClose,
}: {
  editor: Editor;
  open: boolean;
  onClose: () => void;
}) {
  const [term, setTerm] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [, force] = useReducer((x) => x + 1, 0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fn = () => force();
    editor.on('transaction', fn);
    return () => {
      editor.off('transaction', fn);
    };
  }, [editor]);

  useEffect(() => {
    if (open) {
      editor.commands.setSearchTerm(term);
      inputRef.current?.focus();
    } else {
      editor.commands.clearSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) editor.commands.setSearchTerm(term);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  if (!open) return null;

  const storage = editor.storage.searchReplace as
    | { results: unknown[]; index: number }
    | undefined;
  const count = storage?.results.length ?? 0;
  const current = count === 0 ? 0 : (storage?.index ?? 0) + 1;

  return (
    <div className="absolute right-4 top-3 z-20 w-80 rounded-md border bg-popover p-2 shadow-md">
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          value={term}
          placeholder="Find"
          className="h-8"
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              editor.commands.findNext();
            }
            if (e.key === 'Escape') onClose();
          }}
        />
        <span className="w-14 shrink-0 text-center text-xs text-muted-foreground">
          {count === 0 ? '0/0' : `${current}/${count}`}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Match case"
          className={cn(caseSensitive && 'bg-primary text-primary-foreground')}
          onClick={() => {
            const next = !caseSensitive;
            setCaseSensitive(next);
            editor.commands.setCaseSensitive(next);
          }}
        >
          <CaseSensitive />
        </Button>
        <Button variant="ghost" size="icon-sm" title="Previous" onClick={() => editor.commands.findPrev()}>
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon-sm" title="Next" onClick={() => editor.commands.findNext()}>
          <ArrowDown />
        </Button>
        <Button variant="ghost" size="icon-sm" title="Close" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        <Input
          value={replacement}
          placeholder="Replace with"
          className="h-8"
          onChange={(e) => setReplacement(e.target.value)}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          onClick={() => editor.commands.replaceCurrent(replacement)}
        >
          Replace
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          onClick={() => editor.commands.replaceAll(replacement)}
        >
          All
        </Button>
      </div>
    </div>
  );
}
