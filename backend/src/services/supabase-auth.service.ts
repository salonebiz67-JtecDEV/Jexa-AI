import crypto from 'node:crypto';

export interface VerifiedAuthUser {
  id: string;
  email?: string;
  emailConfirmed?: boolean;
  role: string;
  isOwner: boolean;
}

export interface TokenVerificationResult {
  valid: boolean;
  user?: VerifiedAuthUser;
  expiresAtMs?: number;
  reason?: string;
}

export interface AuthSessionGrantResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  expiresAtMs?: number;
  user?: VerifiedAuthUser;
  error?: string;
  code?: string;
  statusCode?: number;
}

export interface OwnerSetupStatus {
  authConfigured: boolean;
  hasOwnerConfigured: boolean;
  ownerUserIdConfigured: boolean;
  ownerEmailConfigured: boolean;
  serviceRoleConfigured: boolean;
  requireAuthForChat: boolean;
}

interface CachedVerification {
  expiresAtMs: number;
  result: TokenVerificationResult;
}

const TOKEN_CACHE_TTL_MS = 15_000;
const TOKEN_CACHE_MAX = 200;
const REVOKED_TOKEN_MAX = 1000;

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

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class SupabaseAuthService {
  private static cache = new Map<string, CachedVerification>();
  private static revokedTokens = new Map<string, number>();

  public static getConfig(): {
    configured: boolean;
    supabaseUrl: string;
    apiKey: string;
    publicApiKey: string;
    serviceRoleConfigured: boolean;
    ownerEmail?: string;
    ownerUserId?: string;
  } {
    const rawUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
    const apiKey = serviceRoleKey || anonKey;
    const publicApiKey = anonKey || serviceRoleKey;
    const ownerEmail = (process.env.OWNER_EMAIL || '').trim() || undefined;
    const ownerUserId = (process.env.OWNER_USER_ID || '').trim() || undefined;

    const configured = Boolean(rawUrl && isValidHttpUrl(rawUrl) && apiKey);
    return {
      configured,
      supabaseUrl: configured ? rawUrl : '',
      apiKey: configured ? apiKey : '',
      publicApiKey: configured ? publicApiKey : '',
      serviceRoleConfigured: Boolean(serviceRoleKey),
      ownerEmail,
      ownerUserId,
    };
  }

  public static isConfigured(): boolean {
    return this.getConfig().configured;
  }

  public static hasOwnerConfigured(): boolean {
    const cfg = this.getConfig();
    return Boolean(cfg.ownerUserId || cfg.ownerEmail);
  }

  public static getSetupStatus(): OwnerSetupStatus {
    const cfg = this.getConfig();
    return {
      authConfigured: cfg.configured,
      hasOwnerConfigured: Boolean(cfg.ownerUserId || cfg.ownerEmail),
      ownerUserIdConfigured: Boolean(cfg.ownerUserId),
      ownerEmailConfigured: Boolean(cfg.ownerEmail),
      serviceRoleConfigured: cfg.serviceRoleConfigured,
      requireAuthForChat: process.env.REQUIRE_AUTH_FOR_CHAT === 'true',
    };
  }

  /**
   * Determines administrator privileges strictly from trusted server-side configuration.
   * Never trusts client-supplied role/ID/email or editable user_metadata, and never auto-promotes users.
   */
  public static evaluateIsOwner(user: {
    id?: string;
    email?: string;
    email_confirmed_at?: string | null;
    confirmed_at?: string | null;
    app_metadata?: Record<string, any>;
  }): { role: string; isOwner: boolean } {
    const cfg = this.getConfig();

    const emailConfirmed =
      user.email_confirmed_at === undefined && user.confirmed_at === undefined
        ? true
        : Boolean(user.email_confirmed_at || user.confirmed_at);

    // 1. Strict immutable Owner User ID allowlist takes highest precedence
    if (cfg.ownerUserId) {
      const matchesId = Boolean(user.id && user.id.trim() === cfg.ownerUserId);
      return {
        role: matchesId ? 'owner' : 'user',
        isOwner: matchesId,
      };
    }

    // 2. Trusted Owner Email allowlist (requires confirmed email if confirmation status is present)
    if (cfg.ownerEmail) {
      const matchesEmail = Boolean(
        emailConfirmed &&
          user.email &&
          user.email.trim().toLowerCase() === cfg.ownerEmail.toLowerCase()
      );
      return {
        role: matchesEmail ? 'owner' : 'user',
        isOwner: matchesEmail,
      };
    }

    // 3. Server-managed Supabase app_metadata.role ONLY (never user_metadata)
    const appRole =
      typeof user.app_metadata?.role === 'string'
        ? user.app_metadata.role.trim().toLowerCase()
        : 'user';
    const hasServerAdminRole = appRole === 'owner' || appRole === 'admin';

    return {
      role: hasServerAdminRole ? 'owner' : 'user',
      isOwner: hasServerAdminRole,
    };
  }

  private static pruneRevokedTokens(): void {
    const now = Date.now();
    for (const [key, exp] of this.revokedTokens.entries()) {
      if (now >= exp) {
        this.revokedTokens.delete(key);
      }
    }
    while (this.revokedTokens.size >= REVOKED_TOKEN_MAX) {
      const oldest = this.revokedTokens.keys().next().value;
      if (oldest) this.revokedTokens.delete(oldest);
      else break;
    }
  }

  public static invalidateToken(token: string): void {
    if (!token || typeof token !== 'string') return;
    const trimmed = token.trim();
    if (!trimmed) return;
    const tokenHash = hashToken(trimmed);
    this.cache.delete(tokenHash);
    this.pruneRevokedTokens();
    const expMs = decodeJwtExpiryMs(trimmed);
    const revokeUntil = expMs && expMs > Date.now() ? expMs : Date.now() + 3600_000;
    this.revokedTokens.set(tokenHash, revokeUntil);
  }

  private static isTokenRevoked(tokenHash: string): boolean {
    const exp = this.revokedTokens.get(tokenHash);
    if (!exp) return false;
    if (Date.now() >= exp) {
      this.revokedTokens.delete(tokenHash);
      return false;
    }
    return true;
  }

  private static buildVerifiedUser(userData: any): VerifiedAuthUser {
    const email = typeof userData.email === 'string' ? userData.email : undefined;
    const emailConfirmed =
      userData.email_confirmed_at === undefined && userData.confirmed_at === undefined
        ? true
        : Boolean(userData.email_confirmed_at || userData.confirmed_at);

    const { role, isOwner } = this.evaluateIsOwner({
      id: userData.id,
      email,
      email_confirmed_at: userData.email_confirmed_at,
      confirmed_at: userData.confirmed_at,
      app_metadata:
        userData.app_metadata && typeof userData.app_metadata === 'object'
          ? userData.app_metadata
          : undefined,
    });

    return {
      id: userData.id,
      email,
      emailConfirmed,
      role,
      isOwner,
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

    const tokenHash = hashToken(trimmed);
    if (this.isTokenRevoked(tokenHash)) {
      return { valid: false, reason: 'Session has been logged out. Please sign in again.' };
    }

    const expMs = decodeJwtExpiryMs(trimmed);
    if (expMs !== null && Date.now() >= expMs) {
      return { valid: false, reason: 'Access token has expired.' };
    }

    const cfg = this.getConfig();
    if (!cfg.configured) {
      return { valid: false, reason: 'Supabase Auth is not configured on the server.' };
    }

    const cached = this.cache.get(tokenHash);
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
          reason:
            response.status === 401 || response.status === 403
              ? 'Invalid or expired access token.'
              : 'Authentication verification failed.',
        };
      }

      const userData: any = await response.json();
      if (!userData || typeof userData.id !== 'string' || !userData.id.trim()) {
        return { valid: false, reason: 'Invalid user payload from auth provider.' };
      }

      const verifiedUser = this.buildVerifiedUser(userData);

      const result: TokenVerificationResult = {
        valid: true,
        user: verifiedUser,
        expiresAtMs: expMs ?? undefined,
      };

      const maxCacheExpiry =
        expMs !== null
          ? Math.min(Date.now() + TOKEN_CACHE_TTL_MS, expMs)
          : Date.now() + TOKEN_CACHE_TTL_MS;
      if (this.cache.size >= TOKEN_CACHE_MAX) {
        const oldest = this.cache.keys().next().value;
        if (oldest) this.cache.delete(oldest);
      }
      this.cache.set(tokenHash, { expiresAtMs: maxCacheExpiry, result });

      return result;
    } catch {
      return {
        valid: false,
        reason: controller.signal.aborted
          ? 'Auth verification timed out.'
          : 'Auth verification unavailable.',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  public static async signInWithPassword(
    email: string,
    password: string
  ): Promise<AuthSessionGrantResult> {
    const cfg = this.getConfig();
    if (!cfg.configured) {
      return {
        success: false,
        statusCode: 503,
        code: 'AUTH_NOT_CONFIGURED',
        error: 'Supabase Auth is not configured on the backend server.',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.publicApiKey,
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
        signal: controller.signal,
      });

      const body: any = await response.json().catch(() => ({}));
      if (!response.ok || !body?.access_token || !body?.user?.id) {
        const rawErr =
          body?.error_description || body?.msg || body?.message || 'Invalid email or password.';
        const statusCode = response.status === 400 || response.status === 401 ? 401 : response.status || 401;
        return {
          success: false,
          statusCode,
          code: body?.error_code || 'INVALID_CREDENTIALS',
          error:
            typeof rawErr === 'string' && rawErr.trim()
              ? rawErr
              : 'Invalid email or password.',
        };
      }

      const verifiedUser = this.buildVerifiedUser(body.user);
      const jwtExpMs = decodeJwtExpiryMs(body.access_token);
      const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600;
      const expiresAtMs = jwtExpMs ?? Date.now() + expiresIn * 1000;

      return {
        success: true,
        accessToken: body.access_token,
        refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
        expiresIn,
        expiresAtMs,
        user: verifiedUser,
      };
    } catch {
      return {
        success: false,
        statusCode: 503,
        code: 'AUTH_UNAVAILABLE',
        error: controller.signal.aborted
          ? 'Authentication server timed out.'
          : 'Unable to reach authentication server.',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  public static async refreshSession(refreshToken: string): Promise<AuthSessionGrantResult> {
    const cfg = this.getConfig();
    if (!cfg.configured) {
      return {
        success: false,
        statusCode: 503,
        code: 'AUTH_NOT_CONFIGURED',
        error: 'Supabase Auth is not configured on the backend server.',
      };
    }

    if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim().length < 8) {
      return {
        success: false,
        statusCode: 401,
        code: 'INVALID_REFRESH_TOKEN',
        error: 'Missing or invalid refresh session.',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.publicApiKey,
        },
        body: JSON.stringify({
          refresh_token: refreshToken.trim(),
        }),
        signal: controller.signal,
      });

      const body: any = await response.json().catch(() => ({}));
      if (!response.ok || !body?.access_token || !body?.user?.id) {
        return {
          success: false,
          statusCode: 401,
          code: 'SESSION_EXPIRED',
          error: 'Session has expired. Please sign in again.',
        };
      }

      const verifiedUser = this.buildVerifiedUser(body.user);
      const jwtExpMs = decodeJwtExpiryMs(body.access_token);
      const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600;
      const expiresAtMs = jwtExpMs ?? Date.now() + expiresIn * 1000;

      return {
        success: true,
        accessToken: body.access_token,
        refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
        expiresIn,
        expiresAtMs,
        user: verifiedUser,
      };
    } catch {
      return {
        success: false,
        statusCode: 503,
        code: 'AUTH_UNAVAILABLE',
        error: 'Unable to refresh session right now.',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  public static async revokeSession(accessToken?: string | null): Promise<void> {
    if (accessToken) {
      this.invalidateToken(accessToken);
    }

    const cfg = this.getConfig();
    if (!cfg.configured || !accessToken) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    try {
      await fetch(`${cfg.supabaseUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken.trim()}`,
          apikey: cfg.publicApiKey,
        },
        signal: controller.signal,
      });
    } catch {
      // Best-effort remote revocation; local revocation is already enforced
    } finally {
      clearTimeout(timer);
    }
  }

  public static clearCache(): void {
    this.cache.clear();
    this.revokedTokens.clear();
  }
}
