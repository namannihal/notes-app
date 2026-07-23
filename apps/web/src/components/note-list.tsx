'use client';

import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDownUp, GripVertical, PanelLeftClose, Plus, Search, Trash2, X } from 'lucide-react';
import { db } from '@/db/db';
import { createNote, deleteNote, reorderNotes } from '@/db/queries';
import { useAppStore, type NoteSort } from '@/stores/useAppStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDialog } from '@/components/dialog-provider';
import type { Note } from '@/db/types';

const SORT_LABELS: Record<NoteSort, string> = {
  updated: 'Date updated',
  created: 'Date created',
  title: 'Title (A–Z)',
  manual: 'Manual',
};

function sortNotes(notes: Note[], sort: NoteSort): Note[] {
  const copy = [...notes];
  switch (sort) {
    case 'created':
      return copy.sort((a, b) => b.createdAt - a.createdAt);
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case 'manual':
      return copy.sort((a, b) => a.position - b.position);
    default:
      return copy.sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

export function NoteList() {
  const {
    selectedNotebookId,
    selectedNoteId,
    selectNote,
    selectNotebook,
    noteSort,
    setNoteSort,
    toggleList,
  } = useAppStore();
  const dialog = useDialog();
  const dragId = useRef<string | null>(null);
  const [query, setQuery] = useState('');
  const trimmed = query.trim().toLowerCase();

  const notebook = useLiveQuery(
    () => (selectedNotebookId ? db.notebooks.get(selectedNotebookId) : undefined),
    [selectedNotebookId],
  );

  const results = useLiveQuery(async () => {
    if (!trimmed) return [];
    const all = await db.notes.toArray();
    return all
      .filter((n) => !n.deletedAt)
      .filter((n) => `${n.title} ${n.contentText}`.toLowerCase().includes(trimmed))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50);
  }, [trimmed]);

  const notes = useLiveQuery(async () => {
    if (!selectedNotebookId) return [];
    const rows = await db.notes.where('notebookId').equals(selectedNotebookId).toArray();
    return rows.filter((n) => !n.deletedAt);
  }, [selectedNotebookId]);

  const sorted = notes ? sortNotes(notes, noteSort) : [];

  async function addNote() {
    if (!selectedNotebookId) return;
    const note = await createNote(selectedNotebookId);
    selectNote(note.id);
  }

  async function removeNote(id: string, title: string) {
    const ok = await dialog.confirm({
      title: 'Delete note',
      message: `Delete "${title || 'Untitled'}"?`,
      confirmText: 'Delete',
      danger: true,
    });
    if (ok) await deleteNote(id);
  }

  function onDrop(targetId: string) {
    if (!dragId.current || dragId.current === targetId) return;
    const ids = sorted.map((n) => n.id);
    const from = ids.indexOf(dragId.current);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    dragId.current = null;
    void reorderNotes(ids);
    if (noteSort !== 'manual') setNoteSort('manual');
  }

  return (
    <>
      <header className="flex h-12 items-center justify-between gap-1 border-b px-3">
        <h2 className="truncate text-sm font-semibold">
          {notebook && !notebook.deletedAt ? notebook.title : 'Notes'}
        </h2>
        <div className="flex items-center gap-0.5">
          {selectedNotebookId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" title="Sort">
                  <ArrowDownUp />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(Object.keys(SORT_LABELS) as NoteSort[]).map((key) => (
                  <DropdownMenuItem
                    key={key}
                    onClick={() => setNoteSort(key)}
                    className={cn(noteSort === key && 'font-semibold')}
                  >
                    {SORT_LABELS[key]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {selectedNotebookId && (
            <Button variant="ghost" size="icon-sm" title="New note" onClick={addNote}>
              <Plus />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden md:inline-flex"
            title="Collapse notes"
            onClick={toggleList}
          >
            <PanelLeftClose />
          </Button>
        </div>
      </header>

      <div className="border-b p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all notes"
            className="h-8 pl-8 pr-8"
          />
          {query && (
            <button
              type="button"
              title="Clear search"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {trimmed ? (
          <>
            {results?.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">No matches.</p>
            )}
            {results?.map((note) => (
              <button
                key={note.id}
                className={cn(
                  'flex w-full flex-col items-start border-b px-3 py-3 text-left hover:bg-accent',
                  selectedNoteId === note.id && 'bg-accent',
                )}
                onClick={() => {
                  selectNotebook(note.notebookId);
                  selectNote(note.id);
                }}
              >
                <span className="w-full truncate text-sm font-semibold">
                  {note.title || 'Untitled'}
                </span>
                <span className="w-full truncate text-xs text-muted-foreground">
                  {note.contentText.slice(0, 90) || 'Empty note'}
                </span>
              </button>
            ))}
          </>
        ) : (
          <>
            {!selectedNotebookId && (
              <p className="p-6 text-center text-sm text-muted-foreground">Select a notebook.</p>
            )}
            {selectedNotebookId && sorted.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">No notes yet.</p>
            )}

            {sorted.map((note) => (
              <div
                key={note.id}
                draggable
                onDragStart={(e) => {
                  dragId.current = note.id;
                  e.dataTransfer.setData('sthir/note', note.id);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(note.id)}
                className={cn(
                  'group relative flex cursor-pointer items-start gap-1 border-b px-3 py-3 hover:bg-accent',
                  selectedNoteId === note.id && 'bg-accent shadow-[inset_3px_0_0_var(--primary)]',
                )}
                onClick={() => selectNote(note.id)}
              >
                <GripVertical className="mt-0.5 size-4 shrink-0 cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100" />
                <div className="min-w-0 flex-1">
                  <div className="truncate pr-6 text-sm font-semibold">
                    {note.title || 'Untitled'}
                  </div>
                  <div className="truncate pr-6 text-xs text-muted-foreground">
                    {note.contentText.slice(0, 90) || 'Empty note'}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-2 top-2 size-7 opacity-0 group-hover:opacity-100"
                  title="Delete note"
                  onClick={(e) => {
                    e.stopPropagation();
                    void removeNote(note.id, note.title);
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
