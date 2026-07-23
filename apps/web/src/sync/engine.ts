'use client';

import { api, type ServerRecord, type SyncChange } from '@/lib/api';
import { db } from '@/db/db';
import type { Attachment, Note, Notebook, Stack } from '@/db/types';

const LAST_SYNC_KEY = 'sthir-last-sync';

const toMs = (v: unknown): number =>
  typeof v === 'string' ? Date.parse(v) : typeof v === 'number' ? v : 0;
const toMsOrNull = (v: unknown): number | null => (v ? toMs(v) : null);

let running = false;

// --- PUSH: send local dirty changes --------------------------------------

async function pushChanges(): Promise<void> {
  const [stacks, notebooks, notes] = await Promise.all([
    db.stacks.filter((s) => Boolean(s._dirty)).toArray(),
    db.notebooks.filter((n) => Boolean(n._dirty)).toArray(),
    db.notes.filter((n) => Boolean(n._dirty)).toArray(),
  ]);

  const changes: SyncChange[] = [];

  for (const s of stacks) {
    changes.push({
      entityType: 'stack',
      entityId: s.id,
      operation: s.deletedAt ? 'delete' : 'update',
      payload: { title: s.title, position: s.position },
    });
  }
  for (const n of notebooks) {
    changes.push({
      entityType: 'notebook',
      entityId: n.id,
      operation: n.deletedAt ? 'delete' : 'update',
      payload: { stackId: n.stackId, title: n.title, position: n.position },
    });
  }
  for (const n of notes) {
    changes.push({
      entityType: 'note',
      entityId: n.id,
      operation: n.deletedAt ? 'delete' : 'update',
      // No version sent → server upserts (last-write-wins), avoiding false conflicts.
      payload: {
        notebookId: n.notebookId,
        title: n.title,
        contentJson: n.contentJson,
        contentText: n.contentText,
        position: n.position,
        pinned: Boolean(n.pinned),
        tags: n.tags ?? [],
      },
    });
  }

  if (changes.length === 0) return;

  const res = await api.push(changes);
  const accepted = new Set(res.accepted);

  await Promise.all([
    ...stacks.filter((s) => accepted.has(s.id)).map((s) => db.stacks.update(s.id, { _dirty: false })),
    ...notebooks
      .filter((n) => accepted.has(n.id))
      .map((n) => db.notebooks.update(n.id, { _dirty: false })),
    ...notes.filter((n) => accepted.has(n.id)).map((n) => db.notes.update(n.id, { _dirty: false })),
  ]);
}

// --- PUSH: upload attachment blobs ----------------------------------------

async function uploadAttachments(): Promise<void> {
  const pending = await db.attachments
    .filter((a) => !a._uploaded && !a.deletedAt)
    .toArray();

  for (const att of pending) {
    const blobRec = await db.blobs.get(att.checksum);
    if (!blobRec) continue; // bytes not available locally
    try {
      const resp = await api.requestUpload({
        id: att.id,
        noteId: att.noteId,
        filename: att.filename,
        mimeType: att.mimeType,
        byteSize: att.byteSize,
        checksum: att.checksum,
        width: att.width,
        height: att.height,
        pageCount: att.pageCount,
      });
      if (resp.uploadUrl) {
        await fetch(resp.uploadUrl, {
          method: 'PUT',
          headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': att.mimeType },
          body: blobRec.blob,
        });
      }
      await api.commitUpload(att.id);
      await db.attachments.update(att.id, { _uploaded: true });
    } catch {
      // Leave unmarked; retried on the next sync.
    }
  }
}

// --- PULL: merge server changes into IndexedDB ----------------------------

function stackFromServer(r: ServerRecord): Stack {
  return {
    id: r.id as string,
    title: r.title as string,
    position: (r.position as number) ?? 0,
    createdAt: toMs(r.createdAt),
    updatedAt: toMs(r.updatedAt),
    deletedAt: toMsOrNull(r.deletedAt),
    _dirty: false,
  };
}

function notebookFromServer(r: ServerRecord): Notebook {
  return {
    id: r.id as string,
    stackId: r.stackId as string,
    title: r.title as string,
    position: (r.position as number) ?? 0,
    createdAt: toMs(r.createdAt),
    updatedAt: toMs(r.updatedAt),
    deletedAt: toMsOrNull(r.deletedAt),
    _dirty: false,
  };
}

function noteFromServer(r: ServerRecord): Note {
  return {
    id: r.id as string,
    notebookId: r.notebookId as string,
    title: r.title as string,
    contentJson: (r.contentJson as Note['contentJson']) ?? { type: 'doc', content: [] },
    contentText: (r.contentText as string) ?? '',
    version: (r.version as number) ?? 1,
    position: (r.position as number) ?? 0,
    pinned: Boolean(r.pinned),
    tags: (r.tags as string[]) ?? [],
    createdAt: toMs(r.createdAt),
    updatedAt: toMs(r.updatedAt),
    deletedAt: toMsOrNull(r.deletedAt),
    _dirty: false,
    _syncedAt: Date.now(),
  };
}

function attachmentFromServer(r: ServerRecord): Attachment {
  return {
    id: r.id as string,
    noteId: r.noteId as string,
    kind: r.kind as Attachment['kind'],
    filename: r.filename as string,
    mimeType: r.mimeType as string,
    byteSize: (r.byteSize as number) ?? 0,
    checksum: r.checksum as string,
    width: r.width as number | undefined,
    height: r.height as number | undefined,
    pageCount: r.pageCount as number | undefined,
    createdAt: toMs(r.createdAt),
    updatedAt: toMs(r.updatedAt),
    deletedAt: toMsOrNull(r.deletedAt),
    _uploaded: true,
  };
}

async function mergeInto<T extends { id: string; updatedAt: number; _dirty?: boolean }>(
  table: import('dexie').Table<T, string>,
  incoming: T[],
): Promise<void> {
  for (const rec of incoming) {
    const local = await table.get(rec.id);
    // Local unsynced edits that are newer win; they'll be pushed next round.
    if (local && local._dirty && local.updatedAt >= rec.updatedAt) continue;
    await table.put(rec);
  }
}

async function pullChanges(): Promise<void> {
  const since = localStorage.getItem(LAST_SYNC_KEY) ?? undefined;
  const res = await api.pull(since);

  await mergeInto(db.stacks, res.stacks.map(stackFromServer));
  await mergeInto(db.notebooks, res.notebooks.map(notebookFromServer));
  await mergeInto(db.notes, res.notes.map(noteFromServer));
  // Attachments have no _dirty flag; upsert straight in.
  for (const rec of res.attachments.map(attachmentFromServer)) {
    await db.attachments.put(rec);
  }

  localStorage.setItem(LAST_SYNC_KEY, res.serverTime);
}

/** One full sync cycle: push local changes, upload blobs, pull server changes. */
export async function runSync(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await pushChanges();
    await uploadAttachments();
    await pullChanges();
  } finally {
    running = false;
  }
}

/** Reset local sync cursor (e.g. on logout) so the next login pulls everything. */
export function resetSyncCursor(): void {
  localStorage.removeItem(LAST_SYNC_KEY);
}
