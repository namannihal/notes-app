import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window limiter held in process memory. Deliberately dependency-free and
 * sufficient for a single App Service instance; if the API is ever scaled out,
 * swap the map for Redis — the middleware signature stays the same.
 */
export function rateLimit(opts: { windowMs: number; max: number; key?: (req: Request) => string }) {
  const { windowMs, max } = opts;
  const keyOf = opts.key ?? ((req: Request) => req.ip ?? 'unknown');
  const buckets = new Map<string, Bucket>();
  let lastSweep = Date.now();

  return function limiter(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();

    // Amortised cleanup so the map cannot grow without bound.
    if (now - lastSweep > windowMs) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
      lastSweep = now;
    }

    const key = keyOf(req);
    const existing = buckets.get(key);
    const bucket =
      existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: `Too many attempts. Try again in ${retryAfter}s.` });
      return;
    }
    next();
  };
}
