import { NextFunction, Request, Response } from 'express';

interface Entry { count: number; resetAt: number }
export const rateLimit = (windowMs: number, limit: number) => {
  // Each limiter owns its window; the API and auth limiters must not reset one another.
  const buckets = new Map<string, Entry>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip || 'unknown';
    if (!buckets.has(key) && buckets.size >= 10_000) {
      for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
      if (buckets.size >= 10_000) {
        res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ error: 'Too many requests' });
      }
    }
    const current = buckets.get(key);
    const entry = !current || current.resetAt <= now
      ? { count: 1, resetAt: now + windowMs }
      : { count: current.count + 1, resetAt: current.resetAt };
    buckets.set(key, entry);
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - entry.count)));
    if (entry.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests' });
    }
    next();
  };
};
