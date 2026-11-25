import { Request, Response } from 'express';
import { SupabaseAuthService } from '../services/supabase-auth.service';
import { SecurityAuditService } from '../services/security-audit.service';
import { extractBearerToken } from '../middleware/auth.middleware';
import { AIProviderRegistry } from '../../../ai/providers/registry';
import { RateLimitStore } from '../middleware/rate-limit.middleware';
import { UsageTracker } from '../services/usage-tracker.service';
import { scrubSecretsAndUrls } from '../../../shared/types/provider';

const REFRESH_COOKIE_NAME = 'jexa_refresh_token';
const REFRESH_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 14; // 14 days

function parseCookies(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return result;

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = pair.slice(0, eqIdx).trim();
    const val = pair.slice(eqIdx + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

function isHttpsRequest(req: Request): boolean {
  if (req.secure) return true;
  const fwdProto = req.headers['x-forwarded-proto'];
  if (typeof fwdProto === 'string' && fwdProto.toLowerCase().includes('https')) {
    return true;
  }
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.startsWith('https://')) {
    return true;
  }
  return false;
}

function buildCookieString(req: Request, value: string, maxAgeSec: number): string {
  const encoded = encodeURIComponent(value);
  const parts = [
    `${REFRESH_COOKIE_NAME}=${encoded}`,
    'HttpOnly',
    'Path=/api/auth',
    `Max-Age=${maxAgeSec}`,
  ];
  if (isHttpsRequest(req)) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  return parts.join('; ');
}

function setRefreshCookie(req: Request, res: Response, refreshToken: string): void {
  res.setHeader('Set-Cookie', buildCookieString(req, refreshToken, REFRESH_COOKIE_MAX_AGE_SEC));
}

function clearRefreshCookie(req: Request, res: Response): void {
  res.setHeader('Set-Cookie', buildCookieString(req, '', 0));
}

export class AuthController {
  public static async login(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const { email, password } = req.body as { email: string; password: string };

    const result = await SupabaseAuthService.signInWithPassword(email, password);
    if (!result.success || !result.accessToken || !result.user) {
      SecurityAuditService.record({
        eventType: 'auth_login_failed',
        severity: 'warning',
        actorEmail: email,
        actorRole: 'anonymous',
        ip: clientIp,
        method: req.method,
        path: req.originalUrl || req.path,
        statusCode: result.statusCode || 401,
        summary: `Failed authentication attempt for email.`,
        details: {
          code: result.code || 'INVALID_CREDENTIALS',
        },
      });

      res.status(result.statusCode || 401).json({
        success: false,
        code: result.code || 'INVALID_CREDENTIALS',
        error: result.error || 'Invalid email or password.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (result.refreshToken) {
      setRefreshCookie(req, res, result.refreshToken);
    }

    SecurityAuditService.record({
      eventType: result.user.isOwner ? 'owner_login_success' : 'user_login_success',
      severity: 'info',
      actorUserId: result.user.id,
      actorEmail: result.user.email,
      actorRole: result.user.role,
      ip: clientIp,
      method: req.method,
      path: req.originalUrl || req.path,
      statusCode: 200,
      summary: result.user.isOwner
        ? 'Verified owner signed in successfully.'
        : 'Standard user signed in.',
    });

    res.status(200).json({
      success: true,
      data: {
        authenticated: true,
        accessToken: result.accessToken,
        expiresAtMs: result.expiresAtMs,
        expiresIn: result.expiresIn,
        user: result.user,
        setup: SupabaseAuthService.getSetupStatus(),
      },
      timestamp: new Date().toISOString(),
    });
  }

  public static async refresh(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const cookies = parseCookies(req.headers.cookie);
    const refreshToken = cookies[REFRESH_COOKIE_NAME];

    if (!refreshToken) {
      res.status(401).json({
        success: false,
        code: 'NO_REFRESH_SESSION',
        error: 'No active session to restore.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const result = await SupabaseAuthService.refreshSession(refreshToken);
    if (!result.success || !result.accessToken || !result.user) {
      clearRefreshCookie(req, res);
      SecurityAuditService.record({
        eventType: 'auth_refresh_failed',
        severity: 'warning',
        actorRole: 'anonymous',
        ip: clientIp,
        method: req.method,
        path: req.originalUrl || req.path,
        statusCode: result.statusCode || 401,
        summary: 'Session restoration failed; cleared stale refresh cookie.',
        details: { code: result.code || 'SESSION_EXPIRED' },
      });

      res.status(result.statusCode || 401).json({
        success: false,
        code: result.code || 'SESSION_EXPIRED',
        error: result.error || 'Session has expired. Please sign in again.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (result.refreshToken) {
      setRefreshCookie(req, res, result.refreshToken);
    }

    SecurityAuditService.record({
      eventType: 'session_restored',
      severity: 'info',
      actorUserId: result.user.id,
      actorEmail: result.user.email,
      actorRole: result.user.role,
      ip: clientIp,
      method: req.method,
      path: req.originalUrl || req.path,
      statusCode: 200,
      summary: `${result.user.isOwner ? 'Owner' : 'User'} session restored via refresh cookie.`,
    });

    res.status(200).json({
      success: true,
      data: {
        authenticated: true,
        accessToken: result.accessToken,
        expiresAtMs: result.expiresAtMs,
        expiresIn: result.expiresIn,
        user: result.user,
        setup: SupabaseAuthService.getSetupStatus(),
      },
      timestamp: new Date().toISOString(),
    });
  }

  public static async logout(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const token = extractBearerToken(req);

    await SupabaseAuthService.revokeSession(token);
    clearRefreshCookie(req, res);

    if (req.auth?.authenticated) {
      SecurityAuditService.record({
        eventType: req.auth.isOwner ? 'owner_logout' : 'user_logout',
        severity: 'info',
        actorUserId: req.auth.userId,
        actorEmail: req.auth.email,
        actorRole: req.auth.role,
        ip: clientIp,
        method: req.method,
        path: req.originalUrl || req.path,
        statusCode: 200,
        summary: req.auth.isOwner
          ? 'Verified owner logged out and revoked session.'
          : 'User logged out and revoked session.',
      });
    }

    res.status(200).json({
      success: true,
      data: { loggedOut: true },
      timestamp: new Date().toISOString(),
    });
  }

  public static async getSession(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    const setup = SupabaseAuthService.getSetupStatus();

    if (req.auth?.invalidToken) {
      res.status(401).json({
        success: false,
        code: 'INVALID_TOKEN',
        error: req.auth.authError || 'Invalid or expired access token.',
        data: {
          authenticated: false,
          user: null,
          setup,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        authenticated: Boolean(req.auth?.authenticated),
        expiresAtMs: req.auth?.expiresAtMs,
        user: req.auth?.authenticated
          ? {
              id: req.auth.userId,
              email: req.auth.email,
              role: req.auth.role,
              isOwner: req.auth.isOwner,
            }
          : null,
        setup,
      },
      timestamp: new Date().toISOString(),
    });
  }

  public static async getAuditLogs(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    const limitParam = Number(req.query.limit);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 100;
    const eventType =
      typeof req.query.eventType === 'string' && req.query.eventType.trim()
        ? req.query.eventType.trim()
        : undefined;

    const summary = await SecurityAuditService.getDurableSummary(limit, eventType);
    res.status(200).json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    });
  }

  public static async getSecurityStatus(_req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    const setup = SupabaseAuthService.getSetupStatus();
    const authDiagnostics = SupabaseAuthService.getAuthDiagnostics();
    const registry = AIProviderRegistry.getInstance();
    const providerStatus = registry.getStatus(false);

    const [gatewayHealth, upstashHealth, auditSummary] = await Promise.all([
      registry.checkGatewayHealth(),
      RateLimitStore.checkUpstashHealth(),
      SecurityAuditService.getDurableSummary(10),
    ]);

    const rlStatus = RateLimitStore.getStatus();
    const usageSummary = UsageTracker.getSummary();
    const recentGatewayErrors = (usageSummary.failedCalls || [])
      .filter((c) => c.provider === 'litellm' || c.provider.startsWith('litellm:'))
      .slice(0, 8)
      .map((c) => ({
        id: c.id,
        timestamp: c.createdAt,
        timestampMs: c.timestampMs,
        model: c.model,
        statusCode: c.errorStatusCode,
        code: c.errorCode,
        message: scrubSecretsAndUrls(c.errorMessage || 'Gateway call failed'),
      }));

    res.status(200).json({
      success: true,
      data: {
        setup,
        gatewayActive: gatewayHealth.active,
        gatewayEnforced: gatewayHealth.enforced,
        gateway: {
          ...gatewayHealth,
          error: gatewayHealth.error ? scrubSecretsAndUrls(gatewayHealth.error) : undefined,
          textProvider: providerStatus.textProvider.type,
          model: registry.getActiveTextModel(),
          backupModel: registry.getActiveBackupModel(),
        },
        providers: {
          text: {
            type: providerStatus.textProvider.type,
            status: providerStatus.textProvider.status,
            configured: providerStatus.textProvider.isConfigured,
            model: providerStatus.textProvider.model,
            backupModel: providerStatus.textProvider.backupModel,
          },
          voice: {
            type: providerStatus.voiceProvider.type,
            status: providerStatus.voiceProvider.status,
            configured: providerStatus.voiceProvider.isConfigured,
            model: providerStatus.voiceProvider.model,
          },
        },
        rateLimiting: {
          ...rlStatus,
          upstashHealth: {
            ...upstashHealth,
            error: upstashHealth.error ? scrubSecretsAndUrls(upstashHealth.error) : undefined,
          },
        },
        auditPersistence: auditSummary.durability,
        auth: authDiagnostics,
        countsLast24h: auditSummary.countsLast24h,
        recentGatewayErrors,
      },
      timestamp: new Date().toISOString(),
    });
  }
}
