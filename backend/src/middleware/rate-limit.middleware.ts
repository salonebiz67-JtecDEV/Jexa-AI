import { Request, Response, NextFunction } from 'express';
import { scrubSecretsAndUrls } from '../../../shared/types/provider';
import { SecurityAuditService } from '../services/security-audit.service';

export interface RateLimiterOptions {
  prefix: string;
  windowMs: number;
  max: number;
  message?: string;
  criticalEndpoint?: boolean;
  failClosed?: boolean;
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

export interface RateLimitingStatus {
  mode: 'upstash_redis' | 'in_memory' | 'degraded_memory_fallback' | 'fail_closed_unavailable';
  upstashConfigured: boolean;
  failClosedPolicy: 'always' | 'critical_prod' | 'disabled';
  failClosedActiveForCritical: boolean;
  activeMemoryBuckets: number;
  maxMemoryKeys: number;
  upstashErrorsCount: number;
  fallbackCount: number;
  failClosedRejectionsCount: number;
  lastUpstashError?: string;
  lastUpstashErrorAt?: string;
  lastUpstashSuccessAt?: string;
}

export class RateLimitStore {
  private static memoryBuckets = new Map<string, MemoryBucket>();
  private static readonly MAX_MEMORY_KEYS = 10_000;
  private static upstashErrorsCount = 0;
  private static fallbackCount = 0;
  private static failClosedRejectionsCount = 0;
  private static lastUpstashError?: string;
  private static lastUpstashErrorAtMs?: number;
  private static lastUpstashSuccessAtMs?: number;
  private static lastDegradedAuditAtMs = 0;

  public static clearMemory(): void {
    this.memoryBuckets.clear();
  }

  public static resetTelemetryForTesting(): void {
    this.memoryBuckets.clear();
    this.upstashErrorsCount = 0;
    this.fallbackCount = 0;
    this.failClosedRejectionsCount = 0;
    this.lastUpstashError = undefined;
    this.lastUpstashErrorAtMs = undefined;
    this.lastUpstashSuccessAtMs = undefined;
    this.lastDegradedAuditAtMs = 0;
  }

  public static isUpstashConfigured(redisUrlOverride?: string, redisTokenOverride?: string): boolean {
    const redisUrl = (redisUrlOverride ?? process.env.UPSTASH_REDIS_REST_URL ?? '').trim();
    const redisToken = (redisTokenOverride ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '').trim();
    return Boolean(redisUrl && redisToken);
  }

  public static isFailClosed(criticalEndpoint = false, explicitOverride?: boolean): boolean {
    if (typeof explicitOverride === 'boolean') return explicitOverride;
    const raw = (process.env.RATE_LIMIT_FAIL_CLOSED || '').trim().toLowerCase();
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return process.env.NODE_ENV === 'production' && criticalEndpoint;
  }

  public static getStatus(): RateLimitingStatus {
    const upstashConfigured = this.isUpstashConfigured();
    const rawPolicy = (process.env.RATE_LIMIT_FAIL_CLOSED || '').trim().toLowerCase();
    const failClosedPolicy: RateLimitingStatus['failClosedPolicy'] =
      rawPolicy === 'true' ? 'always' : rawPolicy === 'false' ? 'disabled' : 'critical_prod';

    const failClosedActiveForCritical = this.isFailClosed(true);
    const recentlyFailed =
      Boolean(this.lastUpstashErrorAtMs) &&
      (!this.lastUpstashSuccessAtMs || this.lastUpstashErrorAtMs! > this.lastUpstashSuccessAtMs);

    const mode: RateLimitingStatus['mode'] = !upstashConfigured
      ? 'in_memory'
      : recentlyFailed
      ? failClosedActiveForCritical
        ? 'fail_closed_unavailable'
        : 'degraded_memory_fallback'
      : 'upstash_redis';

    return {
      mode,
      upstashConfigured,
      failClosedPolicy,
      failClosedActiveForCritical,
      activeMemoryBuckets: this.memoryBuckets.size,
      maxMemoryKeys: this.MAX_MEMORY_KEYS,
      upstashErrorsCount: this.upstashErrorsCount,
      fallbackCount: this.fallbackCount,
      failClosedRejectionsCount: this.failClosedRejectionsCount,
      lastUpstashError: this.lastUpstashError,
      lastUpstashErrorAt: this.lastUpstashErrorAtMs
        ? new Date(this.lastUpstashErrorAtMs).toISOString()
        : undefined,
      lastUpstashSuccessAt: this.lastUpstashSuccessAtMs
        ? new Date(this.lastUpstashSuccessAtMs).toISOString()
        : undefined,
    };
  }

  public static async checkUpstashHealth(
    redisUrlOverride?: string,
    redisTokenOverride?: string
  ): Promise<{ configured: boolean; reachable: boolean; latencyMs: number; error?: string }> {
    const redisUrl = (redisUrlOverride ?? process.env.UPSTASH_REDIS_REST_URL ?? '').trim().replace(/\/+$/, '');
    const redisToken = (redisTokenOverride ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '').trim();

    if (!redisUrl || !redisToken) {
      return {
        configured: false,
        reachable: false,
        latencyMs: 0,
        error: 'UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is not configured.',
      };
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);

    try {
      const res = await fetch(redisUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['PING']),
        signal: controller.signal,
      });

      if (!res.ok) {
        const msg = `Upstash PING returned HTTP ${res.status}`;
        this.recordUpstashFailure(msg, false);
        return {
          configured: true,
          reachable: false,
          latencyMs: Date.now() - startTime,
          error: msg,
        };
      }

      const json: any = await res.json().catch(() => null);
      const ok = json?.result === 'PONG' || res.ok;
      if (ok) {
        this.lastUpstashSuccessAtMs = Date.now();
        this.lastUpstashError = undefined;
      }
      return {
        configured: true,
        reachable: ok,
        latencyMs: Date.now() - startTime,
        error: ok ? undefined : 'Unexpected Upstash PING response.',
      };
    } catch (err: any) {
      const msg = controller.signal.aborted
        ? 'Upstash PING timed out.'
        : scrubSecretsAndUrls(err?.message || 'Unable to reach Upstash Redis.');
      this.recordUpstashFailure(msg, false);
      return {
        configured: true,
        reachable: false,
        latencyMs: Date.now() - startTime,
        error: msg,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private static recordUpstashFailure(message: string, willFailClosed: boolean, prefix?: string): void {
    const now = Date.now();
    this.upstashErrorsCount += 1;
    if (willFailClosed) {
      this.failClosedRejectionsCount += 1;
    } else {
      this.fallbackCount += 1;
    }
    this.lastUpstashError = scrubSecretsAndUrls(message).slice(0, 180) || 'Upstash unavailable';
    this.lastUpstashErrorAtMs = now;

    if (now - this.lastDegradedAuditAtMs >= 30_000) {
      this.lastDegradedAuditAtMs = now;
      SecurityAuditService.record({
        eventType: 'rate_limiter_degraded',
        severity: willFailClosed ? 'critical' : 'warning',
        summary: willFailClosed
          ? `Upstash rate limiter unavailable (${prefix || 'api'}); failing closed with 503.`
          : `Upstash rate limiter unavailable (${prefix || 'api'}); falling back to bounded memory store.`,
        details: {
          prefix: prefix || 'health',
          failClosed: willFailClosed,
          reason: this.lastUpstashError,
        },
      });
    }
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

      this.lastUpstashSuccessAtMs = Date.now();
      this.lastUpstashError = undefined;

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

  public static handleUpstashErrorForLimiter(
    err: any,
    prefix: string,
    willFailClosed: boolean
  ): void {
    const msg = scrubSecretsAndUrls(err?.message || String(err || 'Upstash unavailable'));
    this.recordUpstashFailure(msg, willFailClosed, prefix);
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
  const {
    prefix,
    windowMs,
    max,
    message,
    criticalEndpoint = false,
    failClosed,
    redisUrlOverride,
    redisTokenOverride,
  } = options;

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
        const shouldFailClosed = RateLimitStore.isFailClosed(criticalEndpoint, failClosed);
        RateLimitStore.handleUpstashErrorForLimiter(err, prefix, shouldFailClosed);
        console.warn(
          `[RateLimiter:${prefix}] Upstash unavailable (${shouldFailClosed ? 'failing closed 503' : 'falling back to memory'}):`,
          scrubSecretsAndUrls(err?.message || String(err))
        );

        if (shouldFailClosed) {
          res.setHeader('Retry-After', '15');
          res.setHeader('X-RateLimit-Mode', 'fail-closed');
          res.status(503).json({
            success: false,
            code: 'RATE_LIMIT_BACKEND_UNAVAILABLE',
            error: 'Rate-limiting backend is temporarily unavailable. Please try again shortly.',
            retryAfterSeconds: 15,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        outcome = RateLimitStore.consumeInMemory(key, windowMs, max);
        res.setHeader('X-RateLimit-Mode', 'memory-fallback');
      }
    } else {
      outcome = RateLimitStore.consumeInMemory(key, windowMs, max);
      res.setHeader('X-RateLimit-Mode', 'memory');
    }

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(outcome.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(outcome.resetAtMs / 1000)));
    if (outcome.backend === 'upstash') {
      res.setHeader('X-RateLimit-Mode', 'upstash');
    }

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

// Expensive chat & streaming AI endpoint: 20 requests per 60s per user/IP (critical)
export const chatRateLimiter = createRateLimiter({
  prefix: 'chat',
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_CHAT_MAX) || 20,
  criticalEndpoint: true,
  message: 'Too many chat messages sent in a short time. Please wait a moment before trying again.',
});

// Expensive voice synthesis endpoint: 15 requests per 60s (critical)
export const voiceRateLimiter = createRateLimiter({
  prefix: 'voice',
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_VOICE_MAX) || 15,
  criticalEndpoint: true,
  message: 'Too many voice synthesis requests. Please wait a moment before trying again.',
});

// Administrative & diagnostic endpoints: 30 requests per 60s (critical)
export const expensiveAdminRateLimiter = createRateLimiter({
  prefix: 'admin',
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_ADMIN_MAX) || 30,
  criticalEndpoint: true,
  message: 'Too many administrative requests. Please slow down.',
});

// General lightweight API endpoints: 60 requests per 60s
export const generalApiRateLimiter = createRateLimiter({
  prefix: 'general',
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_GENERAL_MAX) || 60,
  criticalEndpoint: false,
  message: 'Too many API requests. Please slow down.',
});

// Authentication login & refresh endpoints: 10 requests per 60s to resist brute-force attempts (critical)
export const authRateLimiter = createRateLimiter({
  prefix: 'auth',
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_AUTH_MAX) || 10,
  criticalEndpoint: true,
  message: 'Too many authentication attempts. Please wait a minute and try again.',
});
