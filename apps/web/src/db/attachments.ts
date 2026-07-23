import { v4 as uuid } from 'uuid';
import { db } from './db';
import { api } from '../lib/api';
import type { Attachment, AttachmentKind } from './types';

/** Safety hard cap to avoid blowing IndexedDB quota (no user-facing limit). */
const MAX_BYTES = 200 * 1024 * 1024;
const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function kindFor(mime: string): AttachmentKind {
  return mime === 'application/pdf' ? 'pdf' : 'image';
}

async function imageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not read image'));
      img.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Store a file in the local blob store (deduped by checksum) and create the
 * attachment metadata row. Returns the attachment.
 */
export async function saveAttachment(file: File, noteId: string): Promise<Attachment> {
  if (!ALLOWED.has(file.type)) {
    throw new Error(`Unsupported file type: ${file.type || 'unknown'}`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error('File is too large.');
  }

  const buffer = await file.arrayBuffer();
  const checksum = await sha256(buffer);
  const kind = kindFor(file.type);

  const existingBlob = await db.blobs.get(checksum);
  if (!existingBlob) {
    await db.blobs.add({ checksum, blob: file, pinned: true, lastAccessed: Date.now() });
  }

  const dims = kind === 'image' ? await imageDimensions(file) : undefined;

  const attachment: Attachment = {
    id: uuid(),
    noteId,
    kind,
    filename: file.name,
    mimeType: file.type,
    byteSize: file.size,
    checksum,
    width: dims?.width,
    height: dims?.height,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
  };
  await db.attachments.add(attachment);
  return attachment;
}

const urlCache = new Map<string, string>();

/** Resolve an attachment id to a blob object URL, cached for the session. */
export async function getAttachmentUrl(attachmentId: string): Promise<string | null> {
  const cached = urlCache.get(attachmentId);
  if (cached) return cached;

  const attachment = await db.attachments.get(attachmentId);
  if (!attachment) return null;

  let record = await db.blobs.get(attachment.checksum);

  // Not stored locally (e.g. synced from another device) — fetch on demand.
  if (!record) {
    try {
      const { url } = await api.downloadUrl(attachmentId);
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      await db.blobs.put({ checksum: attachment.checksum, blob, pinned: false, lastAccessed: Date.now() });
      record = { checksum: attachment.checksum, blob, pinned: false, lastAccessed: Date.now() };
    } catch {
      return null;
    }
  }

  await db.blobs.update(attachment.checksum, { lastAccessed: Date.now() });
  const url = URL.createObjectURL(record.blob);
  urlCache.set(attachmentId, url);
  return url;
}

/** Collect attachment ids referenced by image/pdf nodes in a TipTap doc. */
function collectAttachmentIds(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  const n = node as { type?: string; attrs?: { attachmentId?: string }; content?: unknown[] };
  if ((n.type === 'image' || n.type === 'pdfBlock') && n.attrs?.attachmentId) {
    out.add(n.attrs.attachmentId);
  }
  if (Array.isArray(n.content)) {
    for (const child of n.content) collectAttachmentIds(child, out);
  }
}

/**
 * Reconcile a note's attachments after a save. Referenced attachments that
 * belong to a different note are re-homed to this one (so an image dragged or
 * pasted into another note keeps working). Unreferenced rows are NOT deleted
 * here — a moved image now lives elsewhere — orphans are swept by
 * gcOrphanAttachments().
 */
export async function reconcileNoteAttachments(
  noteId: string,
  contentJson: unknown,
): Promise<void> {
  const used = new Set<string>();
  collectAttachmentIds(contentJson, used);

  for (const id of used) {
    const att = await db.attachments.get(id);
    if (att && att.noteId !== noteId) {
      // Re-home to this note and re-sync so the server row's note matches.
      await db.attachments.update(id, { noteId, updatedAt: Date.now(), _uploaded: false });
      urlCache.delete(id);
    }
  }
}

/**
 * Global sweep: delete attachment rows not referenced by any live note, and any
 * blob no remaining attachment points to. Recently-created rows are spared in
 * case their note hasn't autosaved yet.
 */
export async function gcOrphanAttachments(): Promise<void> {
  const GRACE_MS = 60_000;
  const notes = await db.notes.toArray();
  const referenced = new Set<string>();
  for (const n of notes) {
    if (n.deletedAt) continue;
    collectAttachmentIds(n.contentJson, referenced);
  }

  const all = await db.attachments.toArray();
  for (const att of all) {
    if (referenced.has(att.id)) continue;
    if (Date.now() - att.createdAt < GRACE_MS) continue;
    await db.attachments.delete(att.id);
    urlCache.delete(att.id);
  }

  const usedChecksums = new Set((await db.attachments.toArray()).map((a) => a.checksum));
  const blobs = await db.blobs.toArray();
  for (const b of blobs) {
    if (!usedChecksums.has(b.checksum)) await db.blobs.delete(b.checksum);
  }
}

/**
 * Overwrite an attachment's bytes in place (used by image crop). Stores the new
 * blob, updates checksum/size/dimensions, and marks it for re-upload.
 */
export async function replaceAttachmentBlob(attachmentId: string, blob: Blob): Promise<void> {
  const att = await db.attachments.get(attachmentId);
  if (!att) return;

  const buffer = await blob.arrayBuffer();
  const checksum = await sha256(buffer);
  const existing = await db.blobs.get(checksum);
  if (!existing) {
    await db.blobs.add({ checksum, blob, pinned: true, lastAccessed: Date.now() });
  }
  const dims = att.kind === 'image' ? await imageDimensions(blob) : undefined;
  await db.attachments.update(attachmentId, {
    checksum,
    byteSize: blob.size,
    width: dims?.width,
    height: dims?.height,
    updatedAt: Date.now(),
    _uploaded: false,
  });
  urlCache.delete(attachmentId);
}
