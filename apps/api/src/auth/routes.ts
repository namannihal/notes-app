import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { clearToken, issueToken, requireAuth } from './middleware.js';

export const authRouter = Router();

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

authRouter.post('/login', async (req, res) => {
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid credentials format' });
    return;
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  // Constant-ish response to avoid user enumeration.
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !ok) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  issueToken(res, { sub: user.id, email: user.email });
  res.json({ id: user.id, email: user.email });
});

authRouter.post('/logout', (_req, res) => {
  clearToken(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.userId, email: req.userEmail });
});
