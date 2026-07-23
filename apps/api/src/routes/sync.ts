import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';

export const syncRouter = Router();

/**
 * PULL: everything changed since `since` (ISO timestamp). Includes soft-deletes
 * because they set updated_at. First sync sends no `since` and gets everything.
 */
syncRouter.get('/pull', async (req, res) => {
  const sinceRaw = req.query.since as string | undefined;
  const since = sinceRaw ? new Date(sinceRaw) : new Date(0);
  const where = { userId: req.userId!, updatedAt: { gt: since } };

  const [stacks, notebooks, notes, attachments] = await Promise.all([
    prisma.stack.findMany({ where }),
    prisma.notebook.findMany({ where }),
    prisma.note.findMany({ where }),
    prisma.attachment.findMany({ where }),
  ]);

  res.json({ stacks, notebooks, notes, attachments, serverTime: new Date().toISOString() });
});

const changeSchema = z.object({
  entityType: z.enum(['stack', 'notebook', 'note']),
  entityId: z.string().uuid(),
  operation: z.enum(['create', 'update', 'delete']),
  version: z.number().int().optional(),
  payload: z.record(z.unknown()),
});

const pushSchema = z.object({ changes: z.array(changeSchema) });

/**
 * PUSH: apply queued local changes. Version-based optimistic concurrency for
 * notes; on mismatch we return the server copy as a conflict (client resolves
 * last-write-wins and keeps a local backup — see spec §5.3).
 */
syncRouter.post('/push', async (req, res) => {
  const parsed = pushSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const accepted: string[] = [];
  const conflicts: { id: string; serverCopy: unknown }[] = [];
  const userId = req.userId!;

  for (const change of parsed.data.changes) {
    const { entityType, entityId, operation, payload, version } = change;

    if (entityType === 'note') {
      if (operation === 'delete') {
        await prisma.note.updateMany({
          where: { id: entityId, userId },
          data: { deletedAt: new Date(), updatedAt: new Date() },
        });
        accepted.push(entityId);
        continue;
      }
      const existing = await prisma.note.findFirst({ where: { id: entityId, userId } });
      if (existing && version !== undefined && existing.version !== version) {
        conflicts.push({ id: entityId, serverCopy: existing });
        continue;
      }
      await prisma.note.upsert({
        where: { id: entityId },
        create: { id: entityId, userId, ...(payload as object) } as never,
        update: {
          ...(payload as object),
          version: (existing?.version ?? 0) + 1,
          updatedAt: new Date(),
        } as never,
      });
      accepted.push(entityId);
      continue;
    }

    // Stacks and notebooks: no version tracking, last-write-wins by design.
    const model = entityType === 'stack' ? prisma.stack : prisma.notebook;
    if (operation === 'delete') {
      // @ts-expect-error union of two delegates with identical shape
      await model.updateMany({
        where: { id: entityId, userId },
        data: { deletedAt: new Date(), updatedAt: new Date() },
      });
    } else {
      // @ts-expect-error union of two delegates with identical shape
      await model.upsert({
        where: { id: entityId },
        create: { id: entityId, userId, ...(payload as object) },
        update: { ...(payload as object), updatedAt: new Date() },
      });
    }
    accepted.push(entityId);
  }

  res.json({ accepted, conflicts, serverTime: new Date().toISOString() });
});
