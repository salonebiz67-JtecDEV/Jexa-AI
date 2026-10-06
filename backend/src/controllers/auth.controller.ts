import { Request, Response } from 'express';
import { DatabaseService } from '../database/db-service';
import { isSupabaseConfigured } from '../database/supabase';

export class AuthController {
  /**
   * GET /api/auth/config
   * Returns public Supabase client credentials (URL & ANON KEY only).
   * NEVER returns SERVICE_ROLE_KEY or internal secrets.
   */
  public static async getConfig(_req: Request, res: Response): Promise<void> {
    try {
      const supabaseUrl = process.env.SUPABASE_URL?.trim() || '';
      const supabaseAnonKey =
        process.env.SUPABASE_ANON_KEY?.trim() ||
        process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
        '';

      res.status(200).json({
        success: true,
        data: {
          configured: Boolean(supabaseUrl && supabaseAnonKey),
          supabaseUrl,
          supabaseAnonKey,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to retrieve auth configuration',
      });
    }
  }

  /**
   * GET /api/auth/me
   * Fetches the profile of the current user based on the x-user-id header.
   */
  public static async getMe(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.headers['x-user-id'] as string) || (req.query.userId as string);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized: User ID required' });
        return;
      }

      const profile = await DatabaseService.getUserProfile(userId);
      res.status(200).json({
        success: true,
        data: profile,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to retrieve user profile',
      });
    }
  }

  /**
   * POST /api/auth/profile
   * Creates or updates the user's profile upon Google OAuth sign-in.
   */
  public static async syncProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.headers['x-user-id'] as string) || req.body?.id;
      const { email, fullName, avatarUrl } = req.body || {};

      if (!userId) {
        res.status(400).json({ success: false, error: 'User ID is required' });
        return;
      }

      const updated = await DatabaseService.upsertUserProfile({
        id: userId,
        email,
        fullName,
        avatarUrl,
      });

      res.status(200).json({
        success: true,
        data: updated,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[AuthController] syncProfile error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to sync user profile',
      });
    }
  }
}
