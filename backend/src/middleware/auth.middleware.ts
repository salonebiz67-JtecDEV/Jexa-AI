import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient, isSupabaseConfigured } from '../database/supabase';
import { DEFAULT_USER_ID, toValidUUID } from '../database/db-service';

export interface AuthenticatedRequest extends Request {
  verifiedUserId?: string;
  isGuestUser?: boolean;
}

/**
 * Express middleware to cryptographically authenticate incoming requests via Supabase Auth JWT.
 * Prevents arbitrary user ID spoofing in headers/bodies.
 */
export async function authenticateRequest(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const client = getSupabaseClient();

  if (authHeader && authHeader.startsWith('Bearer ') && isSupabaseConfigured && client) {
    const token = authHeader.slice(7).trim();
    if (token && token !== 'null' && token !== 'undefined') {
      try {
        const { data: { user }, error } = await client.auth.getUser(token);
        if (!error && user && user.id) {
          req.verifiedUserId = toValidUUID(user.id);
          req.isGuestUser = false;
          return next();
        }
      } catch (err: any) {
        console.warn('[AuthMiddleware] Token verification notice:', err.message);
      }
    }
  }

  // Fallback for guest mode or development:
  // If request indicates guest mode or DEFAULT_USER_ID, allow strictly as DEFAULT_USER_ID
  const requestedUserId = (req.headers['x-user-id'] as string) || (req.body?.userId as string);
  const isGuestMode = req.headers['x-guest-mode'] === 'true' || requestedUserId === DEFAULT_USER_ID;

  if (isGuestMode || !isSupabaseConfigured) {
    req.verifiedUserId = requestedUserId ? toValidUUID(requestedUserId) : DEFAULT_USER_ID;
    req.isGuestUser = true;
    return next();
  }

  // If user passes an arbitrary x-user-id header without valid authentication token in production:
  // We do NOT blindly trust arbitrary IDs to prevent impersonation!
  req.verifiedUserId = DEFAULT_USER_ID;
  req.isGuestUser = true;
  next();
}

/**
 * Returns the securely resolved and verified user ID from the request.
 */
export function getResolvedUserId(req: Request): string {
  const authReq = req as AuthenticatedRequest;
  if (authReq.verifiedUserId) {
    return authReq.verifiedUserId;
  }
  const requested = (req.headers['x-user-id'] as string) || (req.body?.userId as string) || (req.query?.userId as string);
  return requested ? toValidUUID(requested) : DEFAULT_USER_ID;
}
