import type { NextFunction, Request, Response } from 'express';
import { ACCESS_COOKIE, verifyAccessToken } from './tokens.js';

/** Attaches req.userId; rejects with 401 when no valid access token is present. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Prefer the Authorization: Bearer header (works on mobile browsers that
  // block cross-site cookies); fall back to the httpOnly cookie.
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const token = bearer ?? req.cookies?.[ACCESS_COOKIE];
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const decoded = verifyAccessToken(token);
    req.userId = decoded.sub;
    req.userEmail = decoded.email;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
