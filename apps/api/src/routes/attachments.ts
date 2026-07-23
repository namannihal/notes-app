import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { blobKeyFor, deleteBlob, downloadUrl, uploadUrl } from '../storage/blob.js';

export const attachmentsRouter = Router();

/** Safety hard cap (no user-facing limit; guards against runaway uploads). */
const MAX_BYTES = 200 * 1024 * 1024;
const ALLOWED_MIME: Record<string, 'image' | 'pdf'> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'application/pdf': 'pdf',
};

const uploadReqSchema = z.object({
  id: z.string().uuid().optional(),
  noteId: z.string().uuid(),
  filename: z.string().min(1),
  mimeType: z.string().refine((m) => m in ALLOWED_MIME, 'Unsupported file type'),
  byteSize: z.number().int().positive().max(MAX_BYTES),
  checksum: z.string().min(16),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  pageCount: z.number().int().optional(),
});

/**
 * Step 1: client asks for an upload URL. We create a pending attachment row and
 * a content-addressed blob key, then return a short-lived SAS PUT URL. If the
 * checksum already exists (dedupe), the client can skip the upload.
 */
attachmentsRouter.post('/upload-url', async (req, res) => {
  const parsed = uploadReqSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const userId = req.userId!;

  const note = await prisma.note.findFirst({ where: { id: data.noteId, userId } });
  if (!note) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }

  const storageKey = blobKeyFor(userId, data.checksum);
  const existing = await prisma.attachment.findFirst({
    where: { userId, checksum: data.checksum, status: 'ready' },
  });

  const fields = {
    noteId: data.noteId,
    userId,
    kind: ALLOWED_MIME[data.mimeType],
    filename: data.filename,
    mimeType: data.mimeType,
    byteSize: data.byteSize,
    checksum: data.checksum,
    storageKey,
    width: data.width,
    height: data.height,
    pageCount: data.pageCount,
    status: existing ? ('ready' as const) : ('pending' as const),
  };

  // Upsert by the client-provided id so attachment ids stay stable across
  // devices (the note content references this id).
  const attachment = data.id
    ? await prisma.attachment.upsert({
        where: { id: data.id },
        create: { id: data.id, ...fields },
        update: fields,
      })
    : await prisma.attachment.create({ data: fields });

  res.status(201).json({
    attachmentId: attachment.id,
    storageKey,
    // When bytes already exist, no upload is needed.
    uploadUrl: existing ? null : uploadUrl(storageKey),
    alreadyExists: Boolean(existing),
  });
});

/** Step 2: client confirms the upload finished; mark the attachment ready. */
attachmentsRouter.post('/:id/commit', async (req, res) => {
  const result = await prisma.attachment.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: { status: 'ready', updatedAt: new Date() },
  });
  if (result.count === 0) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ ok: true });
});

/** On-demand read URL for viewing/downloading a blob. */
attachmentsRouter.get('/:id/download-url', async (req, res) => {
  const attachment = await prisma.attachment.findFirst({
    where: { id: req.params.id, userId: req.userId!, deletedAt: null },
  });
  if (!attachment) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ url: downloadUrl(attachment.storageKey), filename: attachment.filename });
});

attachmentsRouter.delete('/:id', async (req, res) => {
  const attachment = await prisma.attachment.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!attachment) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await prisma.attachment.update({
    where: { id: attachment.id },
    data: { deletedAt: new Date(), updatedAt: new Date() },
  });

  // Only delete the blob if no other live attachment references the checksum.
  const others = await prisma.attachment.count({
    where: { userId: req.userId!, checksum: attachment.checksum, deletedAt: null },
  });
  if (others === 0) {
    await deleteBlob(attachment.storageKey);
  }
  res.json({ ok: true });
});
