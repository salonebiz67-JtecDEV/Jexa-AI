import { Request, Response, NextFunction } from 'express';
import { SupabaseAuthService } from '../services/supabase-auth.service';

export interface AuthContext {
  authenticated: boolean;
  userId?: string;
  email?: string;
  role: 'owner' | 'user' | 'anonymous' | string;
  isOwner: boolean;
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
 * Never treats CORS, Origin, or client-supplied identity headers as authentication.
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
 * Enforces authentication whenever Supabase Auth is configured or REQUIRE_AUTH_FOR_CHAT=true,
 * and ALWAYS rejects malformed/invalid Bearer tokens when an Authorization header is sent.
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

  const requireChatAuth =
    process.env.REQUIRE_AUTH_FOR_CHAT === 'true' || SupabaseAuthService.isConfigured();

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

/**
 * Strictly protects administrative & provider-configuration endpoints.
 * Always fails closed: rejects unauthenticated callers (401) and non-owners (403).
 */
export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth?.authenticated) {
    const authConfigured = SupabaseAuthService.isConfigured();
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
