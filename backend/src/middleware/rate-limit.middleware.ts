import { Request, Response, NextFunction } from 'express';

export interface RateLimiterOptions {
  prefix: string;
  windowMs: number;
  max: number;
  message?: string;
  redisUrlOverride?: string;
  redisTokenOverride?: string;
}

interface MemoryBucket {
  count: number;
  resetAtMs: number;
}

const UPSTASH_FIXED_WINDOW_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
`;

export class RateLimitStore {
  private static memoryBuckets = new Map<string, MemoryBucket>();
  private static readonly MAX_MEMORY_KEYS = 10_000;

  public static clearMemory(): void {
    this.memoryBuckets.clear();
  }

  private static pruneMemory(now: number): void {
    if (this.memoryBuckets.size < this.MAX_MEMORY_KEYS) return;
    for (const [k, bucket] of this.memoryBuckets.entries()) {
      if (now >= bucket.resetAtMs) {
        this.memoryBuckets.delete(k);
      }
    }
    while (this.memoryBuckets.size >= this.MAX_MEMORY_KEYS) {
      const oldest = this.memoryBuckets.keys().next().value;
      if (oldest) this.memoryBuckets.delete(oldest);
      else break;
    }
  }

  public static consumeInMemory(key: string, windowMs: number, max: number): {
    allowed: boolean;
    count: number;
    remaining: number;
    resetAtMs: number;
    retryAfterSeconds: number;
    backend: 'memory';
  } {
    const now = Date.now();
    this.pruneMemory(now);

    let bucket = this.memoryBuckets.get(key);
    if (!bucket || now >= bucket.resetAtMs) {
      bucket = { count: 0, resetAtMs: now + windowMs };
    }

    bucket.count += 1;
    this.memoryBuckets.set(key, bucket);

    const remaining = Math.max(0, max - bucket.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAtMs - now) / 1000));

    return {
      allowed: bucket.count <= max,
      count: bucket.count,
      remaining,
      resetAtMs: bucket.resetAtMs,
      retryAfterSeconds,
      backend: 'memory',
    };
  }

  public static async consumeUpstash(
    key: string,
    windowMs: number,
    max: number,
    redisUrl: string,
    redisToken: string
  ): Promise<{
    allowed: boolean;
    count: number;
    remaining: number;
    resetAtMs: number;
    retryAfterSeconds: number;
    backend: 'upstash';
  }> {
    const cleanUrl = redisUrl.trim().replace(/\/+$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);

    try {
      const res = await fetch(cleanUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['EVAL', UPSTASH_FIXED_WINDOW_SCRIPT, '1', key, String(windowMs)]),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Upstash HTTP ${res.status}`);
      }

      const json: any = await res.json();
      const resultArr = Array.isArray(json?.result) ? json.result : null;
      if (!resultArr || resultArr.length < 2) {
        throw new Error('Unexpected Upstash EVAL response.');
      }

      const count = Number(resultArr[0]) || 1;
      const ttlMs = Math.max(1000, Number(resultArr[1]) || windowMs);
      const resetAtMs = Date.now() + ttlMs;

      return {
        allowed: count <= max,
        count,
        remaining: Math.max(0, max - count),
        resetAtMs,
        retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
        backend: 'upstash',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

function getClientIdentifier(req: Request): string {
  if (req.auth?.authenticated && req.auth.userId) {
    return `user:${req.auth.userId}`;
  }
  const ip = (req.ip || req.socket?.remoteAddress || 'unknown').replace(/[^a-zA-Z0-9:._-]/g, '_');
  return `ip:${ip}`;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const { prefix, windowMs, max, message, redisUrlOverride, redisTokenOverride } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const clientKey = getClientIdentifier(req);
    const key = `jexa:rl:${prefix}:${clientKey}`;

    const redisUrl = (redisUrlOverride ?? process.env.UPSTASH_REDIS_REST_URL ?? '').trim();
    const redisToken = (redisTokenOverride ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '').trim();
    const hasUpstash = Boolean(redisUrl && redisToken);

    let outcome: {
      allowed: boolean;
      count: number;
      remaining: number;
      resetAtMs: number;
      retryAfterSeconds: number;
      backend: 'upstash' | 'memory';
    };

    if (hasUpstash) {
      try {
        outcome = await RateLimitStore.consumeUpstash(key, windowMs, max, redisUrl, redisToken);
      } catch (err: any) {
        console.warn(`[RateLimiter:${prefix}] Upstash unavailable, falling back to in-memory limiter:`, err?.message || err);
        outcome = RateLimitStore.consumeInMemory(key, windowMs, max);
      }
    } else {
      outcome = RateLimitStore.consumeInMemory(key, windowMs, max);
    }

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(outcome.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(outcome.resetAtMs / 1000)));

    if (!outcome.allowed) {
      res.setHeader('Retry-After', String(outcome.retryAfterSeconds));
      res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        error: message || 'Too many requests. Please wait a moment and try again.',
        retryAfterSeconds: outcome.retryAfterSeconds,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
}

// Expensive chat & streaming AI endpoint: 20 requests per 60s per user/IP
export const chatRateLimiter = createRateLimiter({
  prefix: 'chat',
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_CHAT_MAX) || 20,
  message: 'Too many chat messages sent in a short time. Please wait a moment before trying again.',
});

// Expensive voice synthesis & provider test endpoints: 15 requests per 60s
export const voiceRateLimiter = createRateLimiter({
  prefix: 'voice',
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_VOICE_MAX) || 15,
  message: 'Too many voice synthesis requests. Please wait a moment before trying again.',
});

// Administrative & diagnostic endpoints: 30 requests per 60s
export const expensiveAdminRateLimiter = createRateLimiter({
  prefix: 'admin',
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_ADMIN_MAX) || 30,
  message: 'Too many administrative requests. Please slow down.',
});

// General lightweight API endpoints: 60 requests per 60s
export const generalApiRateLimiter = createRateLimiter({
  prefix: 'general',
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_GENERAL_MAX) || 60,
  message: 'Too many API requests. Please slow down.',
});
