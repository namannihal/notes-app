import { v4 as uuid } from 'uuid';
import type { JSONContent } from '@tiptap/react';
import { db } from './db';
import { recordWritingDay } from './activity';
import type { Bucket, Note, Notebook, Stack } from './types';

const now = () => Date.now();

const emptyDoc: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

// --- Buckets --------------------------------------------------------------

export async function createBucket(title: string): Promise<Bucket> {
  const count = await db.buckets.count();
  const bucket: Bucket = {
    id: uuid(),
    title: title.trim() || 'New Bucket',
    position: count,
    createdAt: now(),
    updatedAt: now(),
    deletedAt: null,
    _dirty: true,
  };
  await db.buckets.add(bucket);
  return bucket;
}

export async function renameBucket(id: string, title: string): Promise<void> {
  await db.buckets.update(id, { title: title.trim() || 'Untitled', updatedAt: now(), _dirty: true });
}

/** Soft-delete a bucket and ungroup (keep) its stacks. */
export async function deleteBucket(id: string): Promise<void> {
  const ts = now();
  await db.transaction('rw', db.buckets, db.stacks, async () => {
    await db.buckets.update(id, { deletedAt: ts, updatedAt: ts, _dirty: true });
    const stacks = await db.stacks.where('bucketId').equals(id).toArray();
    await Promise.all(
      stacks.map((s) => db.stacks.update(s.id, { bucketId: null, updatedAt: ts, _dirty: true })),
    );
  });
}

export async function reorderBuckets(orderedIds: string[]): Promise<void> {
  const ts = now();
  await db.transaction('rw', db.buckets, async () => {
    await Promise.all(
      orderedIds.map((id, i) => db.buckets.update(id, { position: i, updatedAt: ts, _dirty: true })),
    );
  });
}

// --- Stacks ---------------------------------------------------------------

export async function createStack(title: string, bucketId: string | null = null): Promise<Stack> {
  const count = await db.stacks.count();
  const stack: Stack = {
    id: uuid(),
    bucketId,
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

/** Move a stack into a bucket (or out to the top level when bucketId is null). */
export async function moveStackToBucket(id: string, bucketId: string | null): Promise<void> {
  const all = await db.stacks.toArray();
  const count = all.filter((s) => !s.deletedAt && (s.bucketId ?? null) === bucketId).length;
  await db.stacks.update(id, { bucketId, position: count, updatedAt: now(), _dirty: true });
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
  void recordWritingDay();
}

export async function deleteNote(id: string): Promise<void> {
  const ts = now();
  await db.notes.update(id, { deletedAt: ts, updatedAt: ts, _dirty: true });
}

/** Restore a soft-deleted note from the trash. */
export async function restoreNote(id: string): Promise<void> {
  await db.notes.update(id, { deletedAt: null, updatedAt: now(), _dirty: true });
}

/** Permanently remove a note locally (server keeps the soft-delete tombstone). */
export async function purgeNote(id: string): Promise<void> {
  await db.notes.delete(id);
}

/** Toggle a note's pinned state. */
export async function setNotePinned(id: string, pinned: boolean): Promise<void> {
  await db.notes.update(id, { pinned, updatedAt: now(), _dirty: true });
}

/** Replace a note's tags. */
export async function setNoteTags(id: string, tags: string[]): Promise<void> {
  const clean = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
  await db.notes.update(id, { tags: clean, updatedAt: now(), _dirty: true });
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
