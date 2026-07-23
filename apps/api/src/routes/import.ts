import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { importEnex } from '../import/enex.js';

export const importRouter = Router();

const querySchema = z.object({
  stackId: z.string().uuid(),
  notebookTitle: z.string().min(1).default('Imported from Evernote'),
});

/**
 * POST /api/import/enex?stackId=...&notebookTitle=...
 * Body: raw ENEX XML (Content-Type: application/xml or text/xml).
 */
importRouter.post('/enex', async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { stackId, notebookTitle } = parsed.data;

  const stack = await prisma.stack.findFirst({ where: { id: stackId, userId: req.userId! } });
  if (!stack) {
    res.status(404).json({ error: 'Stack not found' });
    return;
  }

  const xml = typeof req.body === 'string' ? req.body : req.body?.toString?.();
  if (!xml) {
    res.status(400).json({ error: 'Empty ENEX body' });
    return;
  }

  try {
    const result = await importEnex(xml, req.userId!, stackId, notebookTitle);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Import failed' });
  }
});
