import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';

export const notesRouter = Router();

const createSchema = z.object({
  notebookId: z.string().uuid(),
  title: z.string().default('Untitled'),
  contentJson: z.unknown(),
  contentText: z.string().optional(),
  position: z.number().int().optional(),
});

const updateSchema = z.object({
  title: z.string().optional(),
  contentJson: z.unknown().optional(),
  contentText: z.string().optional(),
  position: z.number().int().optional(),
  notebookId: z.string().uuid().optional(),
});

notesRouter.get('/', async (req, res) => {
  const notebookId = req.query.notebookId as string | undefined;
  const notes = await prisma.note.findMany({
    where: { userId: req.userId!, deletedAt: null, ...(notebookId ? { notebookId } : {}) },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(notes);
});

notesRouter.get('/search', async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  if (!q) {
    res.json([]);
    return;
  }
  // Postgres full-text search over the plain-text extract.
  const rows = await prisma.$queryRaw`
    SELECT id, title, notebook_id, updated_at
    FROM notes
    WHERE user_id = ${req.userId}::uuid
      AND deleted_at IS NULL
      AND to_tsvector('english', coalesce(content_text, '')) @@ plainto_tsquery('english', ${q})
    ORDER BY updated_at DESC
    LIMIT 50
  `;
  res.json(rows);
});

notesRouter.get('/:id', async (req, res) => {
  const note = await prisma.note.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!note) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(note);
});

notesRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const notebook = await prisma.notebook.findFirst({
    where: { id: parsed.data.notebookId, userId: req.userId! },
  });
  if (!notebook) {
    res.status(404).json({ error: 'Notebook not found' });
    return;
  }
  const note = await prisma.note.create({
    data: {
      notebookId: parsed.data.notebookId,
      title: parsed.data.title,
      contentJson: (parsed.data.contentJson ?? {}) as object,
      contentText: parsed.data.contentText,
      position: parsed.data.position ?? 0,
      userId: req.userId!,
    },
  });
  res.status(201).json(note);
});

notesRouter.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.note.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const data = parsed.data;
  const note = await prisma.note.update({
    where: { id: req.params.id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.contentJson !== undefined ? { contentJson: data.contentJson as object } : {}),
      ...(data.contentText !== undefined ? { contentText: data.contentText } : {}),
      ...(data.position !== undefined ? { position: data.position } : {}),
      ...(data.notebookId !== undefined ? { notebookId: data.notebookId } : {}),
      version: existing.version + 1,
      updatedAt: new Date(),
    },
  });
  res.json(note);
});

notesRouter.delete('/:id', async (req, res) => {
  const now = new Date();
  const result = await prisma.note.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: { deletedAt: now, updatedAt: now },
  });
  if (result.count === 0) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ ok: true });
});
