import { v4 as uuid } from 'uuid';
import type { JSONContent } from '@tiptap/react';
import { db } from './db';
import type { Note, Notebook, Stack } from './types';

const now = () => Date.now();

const emptyDoc: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

// --- Stacks ---------------------------------------------------------------

export async function createStack(title: string): Promise<Stack> {
  const count = await db.stacks.count();
  const stack: Stack = {
    id: uuid(),
    title: title.trim() || 'New Stack',
    position: count,
    createdAt: now(),
    updatedAt: now(),
    deletedAt: null,
    _dirty: true,
  };
  await db.stacks.add(stack);
  return stack;
}

export async function renameStack(id: string, title: string): Promise<void> {
  await db.stacks.update(id, { title: title.trim() || 'Untitled', updatedAt: now(), _dirty: true });
}

export async function deleteStack(id: string): Promise<void> {
  const ts = now();
  await db.transaction('rw', db.stacks, db.notebooks, db.notes, async () => {
    await db.stacks.update(id, { deletedAt: ts, updatedAt: ts, _dirty: true });
    const notebooks = await db.notebooks.where('stackId').equals(id).toArray();
    for (const nb of notebooks) {
      await db.notebooks.update(nb.id, { deletedAt: ts, updatedAt: ts, _dirty: true });
      const notes = await db.notes.where('notebookId').equals(nb.id).toArray();
      await Promise.all(
        notes.map((n) => db.notes.update(n.id, { deletedAt: ts, updatedAt: ts, _dirty: true })),
      );
    }
  });
}

// --- Notebooks ------------------------------------------------------------

export async function createNotebook(stackId: string, title: string): Promise<Notebook> {
  const count = await db.notebooks.where('stackId').equals(stackId).count();
  const notebook: Notebook = {
    id: uuid(),
    stackId,
    title: title.trim() || 'New Notebook',
    position: count,
    createdAt: now(),
    updatedAt: now(),
    deletedAt: null,
    _dirty: true,
  };
  await db.notebooks.add(notebook);
  return notebook;
}

export async function renameNotebook(id: string, title: string): Promise<void> {
  await db.notebooks.update(id, {
    title: title.trim() || 'Untitled',
    updatedAt: now(),
    _dirty: true,
  });
}

export async function deleteNotebook(id: string): Promise<void> {
  const ts = now();
  await db.transaction('rw', db.notebooks, db.notes, async () => {
    await db.notebooks.update(id, { deletedAt: ts, updatedAt: ts, _dirty: true });
    const notes = await db.notes.where('notebookId').equals(id).toArray();
    await Promise.all(
      notes.map((n) => db.notes.update(n.id, { deletedAt: ts, updatedAt: ts, _dirty: true })),
    );
  });
}

// --- Notes ----------------------------------------------------------------

export async function createNote(notebookId: string, title = 'Untitled'): Promise<Note> {
  const count = await db.notes.where('notebookId').equals(notebookId).count();
  const note: Note = {
    id: uuid(),
    notebookId,
    title,
    contentJson: emptyDoc,
    contentText: '',
    version: 1,
    position: count,
    createdAt: now(),
    updatedAt: now(),
    deletedAt: null,
    _dirty: true,
    _syncedAt: null,
  };
  await db.notes.add(note);
  return note;
}

export async function saveNote(
  id: string,
  patch: { title?: string; contentJson?: JSONContent; contentText?: string },
): Promise<void> {
  const existing = await db.notes.get(id);
  if (!existing) return;
  await db.notes.update(id, {
    ...patch,
    version: existing.version + 1,
    updatedAt: now(),
    _dirty: true,
  });
}

export async function deleteNote(id: string): Promise<void> {
  const ts = now();
  await db.notes.update(id, { deletedAt: ts, updatedAt: ts, _dirty: true });
}

// --- Reordering (drag-and-drop) ------------------------------------------

export async function reorderStacks(orderedIds: string[]): Promise<void> {
  const ts = now();
  await db.transaction('rw', db.stacks, async () => {
    await Promise.all(
      orderedIds.map((id, i) => db.stacks.update(id, { position: i, updatedAt: ts, _dirty: true })),
    );
  });
}

export async function reorderNotebooks(orderedIds: string[]): Promise<void> {
  const ts = now();
  await db.transaction('rw', db.notebooks, async () => {
    await Promise.all(
      orderedIds.map((id, i) =>
        db.notebooks.update(id, { position: i, updatedAt: ts, _dirty: true }),
      ),
    );
  });
}

export async function reorderNotes(orderedIds: string[]): Promise<void> {
  const ts = now();
  await db.transaction('rw', db.notes, async () => {
    await Promise.all(
      orderedIds.map((id, i) => db.notes.update(id, { position: i, updatedAt: ts, _dirty: true })),
    );
  });
}

/** Move a note into a different notebook (appended to the end). */
export async function moveNote(id: string, notebookId: string): Promise<void> {
  const count = await db.notes.where('notebookId').equals(notebookId).count();
  await db.notes.update(id, { notebookId, position: count, updatedAt: now(), _dirty: true });
}

/** Move a notebook into a different stack (appended to the end). */
export async function moveNotebook(id: string, stackId: string): Promise<void> {
  const count = await db.notebooks.where('stackId').equals(stackId).count();
  await db.notebooks.update(id, { stackId, position: count, updatedAt: now(), _dirty: true });
}
