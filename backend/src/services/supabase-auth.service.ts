import crypto from 'node:crypto';

export interface VerifiedAuthUser {
  id: string;
  email?: string;
  role: string;
  isOwner: boolean;
}

export interface TokenVerificationResult {
  valid: boolean;
  user?: VerifiedAuthUser;
  reason?: string;
}

interface CachedVerification {
  expiresAtMs: number;
  result: TokenVerificationResult;
}

const TOKEN_CACHE_TTL_MS = 15_000;
const TOKEN_CACHE_MAX = 200;

function isValidHttpUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function decodeJwtExpiryMs(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);
    if (typeof payload?.exp === 'number') {
      return payload.exp * 1000;
    }
    return null;
  } catch {
    return null;
  }
}

export class SupabaseAuthService {
  private static cache = new Map<string, CachedVerification>();

  public static getConfig(): {
    configured: boolean;
    supabaseUrl: string;
    apiKey: string;
    ownerEmail?: string;
    ownerUserId?: string;
  } {
    const rawUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
    const apiKey = serviceRoleKey || anonKey;
    const ownerEmail = (process.env.OWNER_EMAIL || '').trim() || undefined;
    const ownerUserId = (process.env.OWNER_USER_ID || '').trim() || undefined;

    const configured = Boolean(rawUrl && isValidHttpUrl(rawUrl) && apiKey);
    return {
      configured,
      supabaseUrl: configured ? rawUrl : '',
      apiKey: configured ? apiKey : '',
      ownerEmail,
      ownerUserId,
    };
  }

  public static isConfigured(): boolean {
    return this.getConfig().configured;
  }

  public static evaluateIsOwner(user: {
    id?: string;
    email?: string;
    app_metadata?: Record<string, any>;
  }): { role: string; isOwner: boolean } {
    const cfg = this.getConfig();
    const appRole =
      typeof user.app_metadata?.role === 'string'
        ? user.app_metadata.role.trim().toLowerCase()
        : 'user';

    const matchesOwnerId = Boolean(cfg.ownerUserId && user.id && user.id === cfg.ownerUserId);
    const matchesOwnerEmail = Boolean(
      cfg.ownerEmail && user.email && user.email.trim().toLowerCase() === cfg.ownerEmail.toLowerCase()
    );
    const hasServerAdminRole = appRole === 'owner' || appRole === 'admin';

    return {
      role: hasServerAdminRole || matchesOwnerId || matchesOwnerEmail ? 'owner' : appRole || 'user',
      isOwner: Boolean(matchesOwnerId || matchesOwnerEmail || hasServerAdminRole),
    };
  }

  public static async verifyAccessToken(token: string): Promise<TokenVerificationResult> {
    if (!token || typeof token !== 'string') {
      return { valid: false, reason: 'Missing access token.' };
    }

    const trimmed = token.trim();
    if (trimmed.length < 20 || trimmed.length > 4096 || trimmed.split('.').length !== 3) {
      return { valid: false, reason: 'Malformed bearer token.' };
    }

    const expMs = decodeJwtExpiryMs(trimmed);
    if (expMs !== null && Date.now() >= expMs) {
      return { valid: false, reason: 'Access token has expired.' };
    }

    const cfg = this.getConfig();
    if (!cfg.configured) {
      return { valid: false, reason: 'Supabase Auth is not configured on the server.' };
    }

    const cacheKey = crypto.createHash('sha256').update(trimmed).digest('hex');
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAtMs) {
      return cached.result;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${cfg.supabaseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${trimmed}`,
          apikey: cfg.apiKey,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          valid: false,
          reason: response.status === 401 || response.status === 403 ? 'Invalid or expired access token.' : 'Authentication verification failed.',
        };
      }

      const userData: any = await response.json();
      if (!userData || typeof userData.id !== 'string' || !userData.id.trim()) {
        return { valid: false, reason: 'Invalid user payload from auth provider.' };
      }

      const { role, isOwner } = this.evaluateIsOwner({
        id: userData.id,
        email: typeof userData.email === 'string' ? userData.email : undefined,
        app_metadata: userData.app_metadata && typeof userData.app_metadata === 'object' ? userData.app_metadata : undefined,
      });

      const result: TokenVerificationResult = {
        valid: true,
        user: {
          id: userData.id,
          email: typeof userData.email === 'string' ? userData.email : undefined,
          role,
          isOwner,
        },
      };

      const maxCacheExpiry = expMs !== null ? Math.min(Date.now() + TOKEN_CACHE_TTL_MS, expMs) : Date.now() + TOKEN_CACHE_TTL_MS;
      if (this.cache.size >= TOKEN_CACHE_MAX) {
        const oldest = this.cache.keys().next().value;
        if (oldest) this.cache.delete(oldest);
      }
      this.cache.set(cacheKey, { expiresAtMs: maxCacheExpiry, result });

      return result;
    } catch (err: any) {
      return {
        valid: false,
        reason: controller.signal.aborted ? 'Auth verification timed out.' : 'Auth verification unavailable.',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  public static clearCache(): void {
    this.cache.clear();
  }
}
