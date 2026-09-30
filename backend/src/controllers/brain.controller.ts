import { Request, Response } from 'express';
import { DatabaseService } from '../database/db-service';
import { AIProviderRegistry } from '../../../ai/providers/registry';

export class BrainController {
  public static async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const profile = await DatabaseService.getBrainProfile();
      const isDbConnected = await DatabaseService.isConnected();
      const providerStatus = AIProviderRegistry.getInstance().getStatus(isDbConnected);

      res.status(200).json({
        success: true,
        data: {
          profile,
          providerStatus,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public static async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const updates = req.body;
      const updated = await DatabaseService.updateBrainProfile(updates);
      res.status(200).json({
        success: true,
        data: updated,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
