import { v4 as uuid } from 'uuid';
import { db } from './db';
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
  const record = await db.blobs.get(attachment.checksum);
  if (!record) return null;

  await db.blobs.update(attachment.checksum, { lastAccessed: Date.now() });
  const url = URL.createObjectURL(record.blob);
  urlCache.set(attachmentId, url);
  return url;
}
