import { Request, Response } from 'express';
import { DatabaseService } from '../database/db-service';
import { AIProviderRegistry } from '../../../ai/providers/registry';

export class BrainController {
  public static async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.headers['x-user-id'] as string) || (req.query.userId as string);
      const profile = await DatabaseService.getBrainProfile(userId);
      const isDbConnected = await DatabaseService.isConnected();
      const providerStatus = AIProviderRegistry.getInstance().getStatus(
        isDbConnected,
        profile.selectedTextProvider,
        profile.selectedVoiceProvider
      );

      res.status(200).json({
        success: true,
        data: {
          profile,
          providerStatus,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[BrainController] getProfile error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch brain profile.' });
    }
  }

  public static async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const updates = req.body;
      const userId = (req.headers['x-user-id'] as string) || req.body?.userId;
      const updated = await DatabaseService.updateBrainProfile(updates, userId);

      const registry = AIProviderRegistry.getInstance();
      if (updated.selectedTextProvider) {
        registry.setDefaultTextType(updated.selectedTextProvider);
      }
      if (updated.selectedVoiceProvider) {
        registry.setDefaultVoiceType(updated.selectedVoiceProvider);
      }

      res.status(200).json({
        success: true,
        data: updated,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[BrainController] updateProfile error:', error);
      res.status(500).json({ success: false, error: error.message || "Couldn't save settings. Please try again." });
    }
  }
}
