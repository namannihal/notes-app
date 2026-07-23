'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { RotateCcw, Trash2 } from 'lucide-react';
import { db } from '@/db/db';
import { purgeNote, restoreNote } from '@/db/queries';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Lists soft-deleted notes with restore / permanent-delete actions. */
export function TrashDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const deleted = useLiveQuery(async () => {
    const all = await db.notes.toArray();
    return all.filter((n) => n.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
  }, []);

  const [confirming, setConfirming] = useState(false);

  async function emptyAll() {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    for (const n of deleted ?? []) await purgeNote(n.id);
    setConfirming(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Trash</DialogTitle>
          <DialogDescription>Restore notes or delete them permanently.</DialogDescription>
        </DialogHeader>
        {deleted && deleted.length > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={emptyAll}
              className="text-xs font-medium text-destructive hover:underline"
            >
              {confirming ? 'Click again to delete all permanently' : 'Empty trash'}
            </button>
          </div>
        )}
        <div className="max-h-[50vh] overflow-y-auto">
          {(!deleted || deleted.length === 0) && (
            <p className="py-8 text-center text-sm text-muted-foreground">Trash is empty.</p>
          )}
          {deleted?.map((note) => (
            <div key={note.id} className="flex items-center gap-2 border-b py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{note.title || 'Untitled'}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {note.contentText.slice(0, 80) || 'Empty note'}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Restore"
                onClick={() => void restoreNote(note.id)}
              >
                <RotateCcw />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Delete forever"
                onClick={() => void purgeNote(note.id)}
              >
                <Trash2 className="text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
