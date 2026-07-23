import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';

export const COOKIE_NAME = 'sthir_token';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface TokenPayload {
  sub: string;
  email: string;
}

export function issueToken(res: Response, payload: TokenPayload): void {
  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    // Cross-site (web and API on different domains) needs SameSite=None; that
    // requires Secure, so only in production (HTTPS). Dev over http uses Lax.
    sameSite: env.COOKIE_SECURE ? 'none' : 'lax',
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

export function clearToken(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/', sameSite: env.COOKIE_SECURE ? 'none' : 'lax', secure: env.COOKIE_SECURE });
}

/** Attaches req.userId; rejects with 401 when no valid token is present. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    req.userId = decoded.sub;
    req.userEmail = decoded.email;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
