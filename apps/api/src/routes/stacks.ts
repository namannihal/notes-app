import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';

export const stacksRouter = Router();

const createSchema = z.object({ title: z.string().min(1), position: z.number().int().optional() });
const updateSchema = z.object({
  title: z.string().min(1).optional(),
  position: z.number().int().optional(),
});

stacksRouter.get('/', async (req, res) => {
  const stacks = await prisma.stack.findMany({
    where: { userId: req.userId!, deletedAt: null },
    orderBy: { position: 'asc' },
  });
  res.json(stacks);
});

stacksRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const stack = await prisma.stack.create({
    data: { ...parsed.data, userId: req.userId! },
  });
  res.status(201).json(stack);
});

stacksRouter.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const result = await prisma.stack.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: { ...parsed.data, updatedAt: new Date() },
  });
  if (result.count === 0) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(await prisma.stack.findUnique({ where: { id: req.params.id } }));
});

stacksRouter.delete('/:id', async (req, res) => {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.stack.updateMany({
      where: { id: req.params.id, userId: req.userId! },
      data: { deletedAt: now, updatedAt: now },
    });
    const notebooks = await tx.notebook.findMany({
      where: { stackId: req.params.id, userId: req.userId! },
      select: { id: true },
    });
    const nbIds = notebooks.map((n) => n.id);
    await tx.notebook.updateMany({
      where: { stackId: req.params.id, userId: req.userId! },
      data: { deletedAt: now, updatedAt: now },
    });
    await tx.note.updateMany({
      where: { notebookId: { in: nbIds }, userId: req.userId! },
      data: { deletedAt: now, updatedAt: now },
    });
  });
  res.json({ ok: true });
});
