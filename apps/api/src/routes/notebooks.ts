import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';

export const notebooksRouter = Router();

const createSchema = z.object({
  stackId: z.string().uuid(),
  title: z.string().min(1),
  position: z.number().int().optional(),
});
const updateSchema = z.object({
  title: z.string().min(1).optional(),
  position: z.number().int().optional(),
  stackId: z.string().uuid().optional(),
});

notebooksRouter.get('/', async (req, res) => {
  const stackId = req.query.stackId as string | undefined;
  const notebooks = await prisma.notebook.findMany({
    where: { userId: req.userId!, deletedAt: null, ...(stackId ? { stackId } : {}) },
    orderBy: { position: 'asc' },
  });
  res.json(notebooks);
});

notebooksRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  // Ensure the parent stack belongs to the user.
  const stack = await prisma.stack.findFirst({
    where: { id: parsed.data.stackId, userId: req.userId! },
  });
  if (!stack) {
    res.status(404).json({ error: 'Stack not found' });
    return;
  }
  const notebook = await prisma.notebook.create({
    data: { ...parsed.data, userId: req.userId! },
  });
  res.status(201).json(notebook);
});

notebooksRouter.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const result = await prisma.notebook.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: { ...parsed.data, updatedAt: new Date() },
  });
  if (result.count === 0) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(await prisma.notebook.findUnique({ where: { id: req.params.id } }));
});

notebooksRouter.delete('/:id', async (req, res) => {
  const now = new Date();
  await prisma.$transaction([
    prisma.notebook.updateMany({
      where: { id: req.params.id, userId: req.userId! },
      data: { deletedAt: now, updatedAt: now },
    }),
    prisma.note.updateMany({
      where: { notebookId: req.params.id, userId: req.userId! },
      data: { deletedAt: now, updatedAt: now },
    }),
  ]);
  res.json({ ok: true });
});
