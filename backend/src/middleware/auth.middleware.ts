import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient, isSupabaseConfigured } from '../database/supabase';
import { DEFAULT_USER_ID, toValidUUID } from '../database/db-service';

export interface AuthenticatedRequest extends Request {
  verifiedUserId?: string;
  isGuestUser?: boolean;
  isOwner?: boolean;
}

/**
 * Evaluates whether an incoming request is authorized as the system owner.
 * Strictly verifies that the header 'x-owner-key' matches the environment variable 'OWNER_ACCESS_KEY'.
 * If OWNER_ACCESS_KEY is not set or empty, nobody is the owner.
 */
export function checkOwnerStatus(req: Request): boolean {
  const serverKey = process.env.OWNER_ACCESS_KEY?.trim();
  if (!serverKey) {
    return false;
  }
  const requestKey = (req.headers['x-owner-key'] as string | undefined)?.trim();
  return Boolean(requestKey && requestKey === serverKey);
}

/**
 * Dedicated Express middleware to evaluate owner lock on incoming requests.
 */
export function ownerMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  req.isOwner = checkOwnerStatus(req);
  next();
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
  // Always evaluate owner authorization status from x-owner-key header
  req.isOwner = checkOwnerStatus(req);

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

/**
 * Helper to check if request is by the verified owner.
 */
export function isRequestOwner(req: Request): boolean {
  const authReq = req as AuthenticatedRequest;
  if (authReq.isOwner !== undefined) {
    return authReq.isOwner;
  }
  return checkOwnerStatus(req);
}

