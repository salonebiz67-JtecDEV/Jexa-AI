import { Request, Response, NextFunction } from 'express';
import { SupabaseAuthService } from '../services/supabase-auth.service';
import { SecurityAuditService } from '../services/security-audit.service';

export interface AuthContext {
  authenticated: boolean;
  userId?: string;
  email?: string;
  role: 'owner' | 'user' | 'anonymous' | string;
  isOwner: boolean;
  expiresAtMs?: number;
  invalidToken?: boolean;
  authError?: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) return null;
  return match[1].trim() || null;
}

/**
 * Attaches verified auth context from Authorization: Bearer <jwt> if supplied.
 * Never treats CORS, Origin, or client-supplied identity headers/fields as authentication.
 */
export async function attachAuthContext(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const rawAuthHeader = req.headers.authorization;
  const token = extractBearerToken(req);

  if (!rawAuthHeader) {
    req.auth = {
      authenticated: false,
      role: 'anonymous',
      isOwner: false,
    };
    next();
    return;
  }

  if (!token) {
    req.auth = {
      authenticated: false,
      role: 'anonymous',
      isOwner: false,
      invalidToken: true,
      authError: 'Authorization header must use Bearer token format.',
    };
    next();
    return;
  }

  const verification = await SupabaseAuthService.verifyAccessToken(token);
  if (!verification.valid || !verification.user) {
    req.auth = {
      authenticated: false,
      role: 'anonymous',
      isOwner: false,
      invalidToken: true,
      authError: verification.reason || 'Invalid or expired access token.',
    };
    next();
    return;
  }

  req.auth = {
    authenticated: true,
    userId: verification.user.id,
    email: verification.user.email,
    role: verification.user.role,
    isOwner: verification.user.isOwner,
    expiresAtMs: verification.expiresAtMs,
  };
  next();
}

/**
 * Strictly requires a verified authenticated session.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth?.authenticated) {
    res.status(401).json({
      success: false,
      code: 'AUTH_REQUIRED',
      error: req.auth?.authError || 'Authentication required. Provide a valid Bearer token.',
      timestamp: new Date().toISOString(),
    });
    return;
  }
  next();
}

/**
 * Protects normal chat/voice routes when REQUIRE_AUTH_FOR_CHAT=true,
 * and ALWAYS rejects malformed/invalid/expired Bearer tokens when an Authorization header is sent,
 * while preserving normal chat/voice access for unauthenticated and normal USER sessions by default.
 */
export function requireAuthIfConfigured(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.invalidToken) {
    res.status(401).json({
      success: false,
      code: 'INVALID_TOKEN',
      error: req.auth.authError || 'Invalid or expired Bearer token.',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const requireChatAuth = process.env.REQUIRE_AUTH_FOR_CHAT === 'true';

  if (requireChatAuth && !req.auth?.authenticated) {
    res.status(401).json({
      success: false,
      code: 'AUTH_REQUIRED',
      error: 'Authentication required. Please sign in to continue.',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
}

export function isOwnerAuthEnforced(): boolean {
  if (process.env.ENFORCE_OWNER_AUTH === 'true') return true;
  if (process.env.DISABLE_OWNER_AUTH === 'true') return false;
  return SupabaseAuthService.isConfigured();
}

/**
 * Strictly protects administrative & provider-configuration endpoints when auth is configured/enforced.
 * In local development mode (when Supabase Auth is not configured and ENFORCE_OWNER_AUTH !== 'true'),
 * allows direct developer access without requiring login or OWNER_USER_ID.
 */
export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  if (!isOwnerAuthEnforced()) {
    req.auth = {
      authenticated: true,
      role: 'owner',
      isOwner: true,
    };
    next();
    return;
  }

  const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
  const reqPath = req.originalUrl || req.path;

  if (!req.auth?.authenticated) {
    const authConfigured = SupabaseAuthService.isConfigured();
    SecurityAuditService.record({
      eventType: 'unauthorized_admin_access',
      severity: 'warning',
      actorRole: 'anonymous',
      ip: clientIp,
      method: req.method,
      path: reqPath,
      statusCode: 401,
      summary: `Blocked unauthenticated admin access attempt (${req.method} ${reqPath}).`,
      details: {
        invalidToken: Boolean(req.auth?.invalidToken),
        reason: req.auth?.authError || 'missing_credentials',
      },
    });

    res.status(401).json({
      success: false,
      code: authConfigured ? 'OWNER_AUTH_REQUIRED' : 'OWNER_AUTH_UNCONFIGURED',
      error: authConfigured
        ? req.auth?.authError || 'Owner authentication required.'
        : 'Owner authentication required. Configure Supabase Auth credentials to access administrative endpoints.',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (!req.auth.isOwner) {
    SecurityAuditService.record({
      eventType: 'unauthorized_admin_access',
      severity: 'critical',
      actorUserId: req.auth.userId,
      actorEmail: req.auth.email,
      actorRole: req.auth.role,
      ip: clientIp,
      method: req.method,
      path: reqPath,
      statusCode: 403,
      summary: `Blocked non-owner user admin access attempt (${req.method} ${reqPath}).`,
      details: {
        reason: 'insufficient_privileges',
      },
    });

    res.status(403).json({
      success: false,
      code: 'FORBIDDEN',
      error: 'Owner privileges are required to perform this action.',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
}
