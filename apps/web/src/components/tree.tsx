'use client';

import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ChevronDown,
  ChevronRight,
  FileUp,
  Library,
  Notebook as NotebookIcon,
  PanelLeftClose,
  Plus,
  Trash,
  Trash2,
} from 'lucide-react';
import { db } from '@/db/db';
import {
  createNotebook,
  createStack,
  deleteNotebook,
  deleteStack,
  moveNote,
  moveNotebook,
  renameNotebook,
  renameStack,
  reorderNotebooks,
  reorderStacks,
} from '@/db/queries';
import { useAppStore } from '@/stores/useAppStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useDialog } from '@/components/dialog-provider';
import { api } from '@/lib/api';
import { runSync } from '@/sync/engine';
import { toast } from '@/stores/useToast';
import { TrashDialog } from '@/components/trash-dialog';

const COLLAPSED_KEY = 'sthir-collapsed-stacks';

export function Tree() {
  const { selectedNotebookId, selectNotebook, toggleTree } = useAppStore();
  const dialog = useDialog();
  const dragStack = useRef<string | null>(null);
  const dragNotebook = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importStackId = useRef<string | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);

  function pickEnex(stackId: string) {
    importStackId.current = stackId;
    fileInputRef.current?.click();
  }

  async function onEnexFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const stackId = importStackId.current;
    if (!file || !stackId) return;
    try {
      const xml = await file.text();
      const title = file.name.replace(/\.enex$/i, '') || 'Imported from Evernote';
      const res = await api.importEnex(stackId, title, xml);
      await runSync();
      toast(
        `Imported ${res.notesImported} note${res.notesImported === 1 ? '' : 's'} into "${title}".`,
        'success',
      );
    } catch {
      toast('Could not import that .enex file. Make sure you are online and signed in.', 'error');
    }
  }

  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set<string>(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]')),
  );

  function toggleStack(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  const stacks = useLiveQuery(
    async () => (await db.stacks.orderBy('position').toArray()).filter((s) => !s.deletedAt),
    [],
  );
  const notebooks = useLiveQuery(
    async () => (await db.notebooks.orderBy('position').toArray()).filter((n) => !n.deletedAt),
    [],
  );

  async function addStack() {
    const title = await dialog.prompt({
      title: 'New stack',
      label: 'Name',
      placeholder: 'e.g. GS Paper 2',
      confirmText: 'Create',
    });
    if (title) await createStack(title);
  }

  async function addNotebook(stackId: string) {
    const title = await dialog.prompt({
      title: 'New notebook',
      label: 'Name',
      placeholder: 'e.g. Polity',
      confirmText: 'Create',
    });
    if (title) await createNotebook(stackId, title);
  }

  async function editStack(id: string, current: string) {
    const title = await dialog.prompt({ title: 'Rename stack', label: 'Name', defaultValue: current });
    if (title) await renameStack(id, title);
  }

  async function editNotebook(id: string, current: string) {
    const title = await dialog.prompt({ title: 'Rename notebook', label: 'Name', defaultValue: current });
    if (title) await renameNotebook(id, title);
  }

  async function removeStack(id: string, title: string) {
    const ok = await dialog.confirm({
      title: 'Delete stack',
      message: `Delete "${title}" and all its notebooks and notes?`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const selectedInStack =
      notebooks?.find((nb) => nb.id === selectedNotebookId)?.stackId === id;
    await deleteStack(id);
    if (selectedInStack) selectNotebook(null);
  }

  async function removeNotebook(id: string, title: string) {
    const ok = await dialog.confirm({
      title: 'Delete notebook',
      message: `Delete "${title}" and all its notes?`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await deleteNotebook(id);
    if (selectedNotebookId === id) selectNotebook(null);
  }

  function onStackDrop(e: React.DragEvent, targetStackId: string) {
    const nbId = e.dataTransfer.getData('sthir/notebook');
    if (nbId) {
      dragNotebook.current = null;
      void moveNotebook(nbId, targetStackId);
      return;
    }
    if (!dragStack.current || !stacks || dragStack.current === targetStackId) return;
    const ids = stacks.map((s) => s.id);
    const from = ids.indexOf(dragStack.current);
    const to = ids.indexOf(targetStackId);
    if (from < 0 || to < 0) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    dragStack.current = null;
    void reorderStacks(ids);
  }

  function onNotebookDrop(e: React.DragEvent, stackId: string, targetNbId: string) {
    const noteId = e.dataTransfer.getData('sthir/note');
    if (noteId) {
      void moveNote(noteId, targetNbId);
      return;
    }
    if (!dragNotebook.current || !notebooks || dragNotebook.current === targetNbId) return;
    const siblings = notebooks.filter((n) => n.stackId === stackId).map((n) => n.id);
    const from = siblings.indexOf(dragNotebook.current);
    const to = siblings.indexOf(targetNbId);
    if (from < 0 || to < 0) return;
    const [moved] = siblings.splice(from, 1);
    siblings.splice(to, 0, moved);
    dragNotebook.current = null;
    void reorderNotebooks(siblings);
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".enex,application/xml,text/xml"
        className="hidden"
        onChange={onEnexFile}
      />
      <TrashDialog open={trashOpen} onOpenChange={setTrashOpen} />
      <header className="flex h-12 items-center justify-between border-b px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Stacks
        </h2>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" title="Trash" onClick={() => setTrashOpen(true)}>
            <Trash />
          </Button>
          <Button variant="ghost" size="icon-sm" title="New stack" onClick={addStack}>
            <Plus />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Collapse sidebar" onClick={toggleTree}>
            <PanelLeftClose />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-2">
        {stacks?.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">
            No stacks yet. Create one to begin.
          </p>
        )}

        {stacks?.map((stack) => {
          const isCollapsed = collapsed.has(stack.id);
          const children = notebooks?.filter((nb) => nb.stackId === stack.id) ?? [];
          return (
            <div key={stack.id} className="mb-1">
              <div className="group flex items-center rounded-md pr-1 hover:bg-accent"
                draggable
                onDragStart={(e) => {
                  dragStack.current = stack.id;
                  e.dataTransfer.setData('sthir/stack', stack.id);
                  e.stopPropagation();
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onStackDrop(e, stack.id)}
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1.5 text-sm font-medium"
                  onClick={() => toggleStack(stack.id)}
                  onDoubleClick={() => editStack(stack.id, stack.title)}
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <Library className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{stack.title}</span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 opacity-0 group-hover:opacity-100"
                  title="Import Evernote .enex"
                  onClick={() => pickEnex(stack.id)}
                >
                  <FileUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 opacity-0 group-hover:opacity-100"
                  title="New notebook"
                  onClick={() => addNotebook(stack.id)}
                >
                  <Plus />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 opacity-0 group-hover:opacity-100"
                  title="Delete stack"
                  onClick={() => removeStack(stack.id, stack.title)}
                >
                  <Trash2 />
                </Button>
              </div>

              {!isCollapsed && (
                <div className="ml-4 border-l pl-2">
                  {children.length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">No notebooks</p>
                  )}
                  {children.map((nb) => (
                    <div
                      key={nb.id}
                      draggable
                      onDragStart={(e) => {
                        dragNotebook.current = nb.id;
                        e.dataTransfer.setData('sthir/notebook', nb.id);
                        e.stopPropagation();
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => onNotebookDrop(e, stack.id, nb.id)}
                      className={cn(
                        'group flex items-center rounded-md pr-1 hover:bg-accent',
                        selectedNotebookId === nb.id && 'bg-accent',
                      )}
                    >
                      <button
                        className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-sm"
                        onClick={() => selectNotebook(nb.id)}
                        onDoubleClick={() => editNotebook(nb.id, nb.title)}
                      >
                        <NotebookIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{nb.title}</span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-7 opacity-0 group-hover:opacity-100"
                        title="Delete notebook"
                        onClick={() => removeNotebook(nb.id, nb.title)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
