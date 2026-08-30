import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';
import { env } from '../env.js';

/** Short-lived bearer credential. Kept small so revocation latency is bounded. */
const ACCESS_TTL_S = 15 * 60;
/** Long-lived, revocable, rotated on every use. */
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const ACCESS_COOKIE = 'sthir_token';
export const REFRESH_COOKIE = 'sthir_refresh';

export interface AccessPayload {
  sub: string;
  email: string;
}

/** Refresh tokens are stored hashed so a database leak cannot be replayed. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    // Cross-site (web and API on different domains) needs SameSite=None, which
    // requires Secure — so only over HTTPS. Dev over http falls back to Lax.
    sameSite: env.COOKIE_SECURE ? ('none' as const) : ('lax' as const),
    maxAge,
    path: '/',
  };
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ACCESS_TTL_S });
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessPayload;
}

/** Creates a session row and returns the raw refresh token (shown only once). */
export async function createSession(userId: string, userAgent?: string): Promise<string> {
  const token = randomBytes(48).toString('base64url');
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      userAgent: userAgent?.slice(0, 255),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return token;
}

/**
 * Validates a refresh token and rotates it: the presented token is revoked and a
 * fresh one issued. Returns null when the token is unknown, expired or already
 * revoked — which includes the replay case, since rotation revokes on first use.
 */
export async function rotateSession(
  token: string,
  userAgent?: string,
): Promise<{ userId: string; email: string; refreshToken: string } | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;

  const next = randomBytes(48).toString('base64url');
  await prisma.$transaction([
    prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    }),
    prisma.session.create({
      data: {
        userId: session.userId,
        tokenHash: hashToken(next),
        userAgent: userAgent?.slice(0, 255) ?? session.userAgent,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    }),
  ]);

  return { userId: session.userId, email: session.user.email, refreshToken: next };
}

export async function revokeSession(token: string): Promise<void> {
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Used by password reset and "sign out everywhere". */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, cookieOptions(ACCESS_TTL_S * 1000));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(REFRESH_TTL_MS));
}

export function clearAuthCookies(res: Response): void {
  const base = { path: '/', sameSite: env.COOKIE_SECURE ? ('none' as const) : ('lax' as const), secure: env.COOKIE_SECURE };
  res.clearCookie(ACCESS_COOKIE, base);
  res.clearCookie(REFRESH_COOKIE, base);
}

export function readRefreshToken(req: Request): string | undefined {
  return (req.body as { refreshToken?: string } | undefined)?.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
}
