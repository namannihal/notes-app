import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { mailer, passwordResetMail } from '../mail/mailer.js';
import { requireAuth } from './middleware.js';
import { rateLimit } from './rate-limit.js';
import {
  clearAuthCookies,
  createSession,
  hashToken,
  readRefreshToken,
  revokeAllSessions,
  revokeSession,
  rotateSession,
  setAuthCookies,
  signAccessToken,
} from './tokens.js';

export const authRouter = Router();

const BCRYPT_ROUNDS = 12;
const RESET_TTL_MS = 60 * 60 * 1000;

/**
 * A bcrypt hash of a value nobody knows. Compared against when the email is not
 * found so that a login attempt costs the same either way — otherwise response
 * time reveals which addresses are registered.
 */
const DUMMY_HASH = bcrypt.hashSync(randomBytes(32).toString('hex'), BCRYPT_ROUNDS);

const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200, 'Password is too long');

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80).optional(),
  inviteCode: z.string().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({ token: z.string().min(20), password: passwordSchema });

/** Constant-time compare that tolerates differing lengths. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Brute-force protection: generous enough not to bother a real user on a flaky
// connection, tight enough to make online guessing impractical.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });
const forgotLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });

async function issue(res: Response, user: { id: string; email: string }, userAgent?: string) {
  const refreshToken = await createSession(user.id, userAgent);
  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  setAuthCookies(res, accessToken, refreshToken);
  return { accessToken, refreshToken };
}

// --- Registration ---------------------------------------------------------

/** Lets the sign-in screen show the right affordances without guessing. */
authRouter.get('/config', (_req, res) => {
  res.json({
    signupMode: env.SIGNUP_MODE,
    inviteRequired: env.SIGNUP_MODE === 'invite',
    signupAvailable:
      env.SIGNUP_MODE === 'open' ||
      (env.SIGNUP_MODE === 'invite' && Boolean(env.SIGNUP_INVITE_CODE)),
  });
});

authRouter.post('/register', registerLimiter, async (req, res) => {
  if (env.SIGNUP_MODE === 'closed') {
    res.status(403).json({ error: 'Registration is closed.' });
    return;
  }
  if (env.SIGNUP_MODE === 'invite' && !env.SIGNUP_INVITE_CODE) {
    // Fail closed: an unset code must never be read as "anyone may register".
    res.status(503).json({ error: 'Registration is not configured.' });
    return;
  }

  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid details' });
    return;
  }
  const { password, displayName, inviteCode } = parsed.data;

  if (env.SIGNUP_MODE === 'invite' && !safeEqual(inviteCode ?? '', env.SIGNUP_INVITE_CODE!)) {
    res.status(403).json({ error: 'That invite code is not valid.' });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    res.status(409).json({ error: 'An account with that email already exists.' });
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      displayName: displayName ?? null,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    },
  });

  const { accessToken, refreshToken } = await issue(res, user, req.headers['user-agent']);
  res.status(201).json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    token: accessToken,
    refreshToken,
  });
});

// --- Session lifecycle ----------------------------------------------------

authRouter.post('/login', loginLimiter, async (req, res) => {
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid credentials format' });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const { accessToken, refreshToken } = await issue(res, user, req.headers['user-agent']);
  res.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    token: accessToken,
    refreshToken,
  });
});

/** Exchanges a refresh token for a new access token, rotating the refresh token. */
authRouter.post('/refresh', async (req, res) => {
  const presented = readRefreshToken(req);
  if (!presented) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const rotated = await rotateSession(presented, req.headers['user-agent']);
  if (!rotated) {
    clearAuthCookies(res);
    res.status(401).json({ error: 'Session expired' });
    return;
  }
  const accessToken = signAccessToken({ sub: rotated.userId, email: rotated.email });
  setAuthCookies(res, accessToken, rotated.refreshToken);
  res.json({
    id: rotated.userId,
    email: rotated.email,
    token: accessToken,
    refreshToken: rotated.refreshToken,
  });
});

authRouter.post('/logout', async (req, res) => {
  const presented = readRefreshToken(req);
  if (presented) await revokeSession(presented);
  clearAuthCookies(res);
  res.json({ ok: true });
});

authRouter.post('/logout-all', requireAuth, async (req, res) => {
  await revokeAllSessions(req.userId!);
  clearAuthCookies(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { id: true, email: true, displayName: true, createdAt: true },
  });
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.json(user);
});

// --- Password management --------------------------------------------------

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid password' });
    return;
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    res.status(400).json({ error: 'Current password is incorrect' });
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
  });
  // Other devices must re-authenticate with the new password.
  await revokeAllSessions(user.id);
  const { accessToken, refreshToken } = await issue(res, user, req.headers['user-agent']);
  res.json({ ok: true, token: accessToken, refreshToken });
});

authRouter.post('/forgot-password', forgotLimiter, async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  // Always answer identically, whether or not the address exists — otherwise
  // this endpoint is an account-enumeration oracle.
  if (!parsed.success) {
    res.json({ ok: true });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.json({ ok: true });
    return;
  }

  // Supersede outstanding tokens so only the newest link works.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = randomBytes(32).toString('base64url');
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });

  const link = `${env.APP_URL.replace(/\/$/, '')}/reset-password?token=${token}`;
  try {
    await mailer.send(passwordResetMail(user.email, link));
  } catch (e) {
    // Never surface delivery failures: that would leak existence too.
    console.error('Password reset mail failed:', e);
  }
  res.json({ ok: true });
});

authRouter.post('/reset-password', async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }
  const { token, password } = parsed.data;

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    res.status(400).json({ error: 'That reset link is invalid or has expired.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  // A reset is recovery from possible compromise: drop every existing session.
  await revokeAllSessions(record.userId);

  const { accessToken, refreshToken } = await issue(res, record.user, req.headers['user-agent']);
  res.json({
    id: record.user.id,
    email: record.user.email,
    token: accessToken,
    refreshToken,
  });
});
