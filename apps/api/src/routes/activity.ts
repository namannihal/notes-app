import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';

export const activityRouter = Router();

/** 'YYYY-MM-DD' — the client's LOCAL date, so streaks match the user's own days. */
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const recordSchema = z.object({
  days: z.array(daySchema).min(1).max(400),
});

/**
 * Writing days for the streak. Returned oldest-first; the client keeps its own
 * copy in IndexedDB so the streak still renders offline.
 */
activityRouter.get('/', async (req, res) => {
  const days = await prisma.writingDay.findMany({
    where: { userId: req.userId! },
    select: { day: true, noteCount: true },
    orderBy: { day: 'asc' },
  });
  res.json({ days });
});

/**
 * Records one or more days as written-on. Idempotent by (userId, day): repeated
 * syncs of the same day increment the count but never create duplicates, so the
 * streak cannot drift.
 */
activityRouter.post('/', async (req, res) => {
  const parsed = recordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid days' });
    return;
  }
  const userId = req.userId!;
  const unique = [...new Set(parsed.data.days)];

  await prisma.$transaction(
    unique.map((day) =>
      prisma.writingDay.upsert({
        where: { userId_day: { userId, day } },
        create: { userId, day, noteCount: 1 },
        update: { noteCount: { increment: 1 }, updatedAt: new Date() },
      }),
    ),
  );

  res.json({ ok: true, recorded: unique.length });
});
