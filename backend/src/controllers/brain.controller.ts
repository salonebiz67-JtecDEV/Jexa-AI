import { Request, Response } from 'express';
import { DatabaseService } from '../database/db-service';
import { AIProviderRegistry } from '../../../ai/providers/registry';
import { getResolvedUserId } from '../middleware/auth.middleware';
import { isTtsModel } from '../../../shared/types/provider';

export class BrainController {
  public static async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = getResolvedUserId(req);
      const profile = await DatabaseService.getBrainProfile(userId);
      const isDbConnected = await DatabaseService.isConnected();
      const providerStatus = AIProviderRegistry.getInstance().getStatus(
        isDbConnected,
        'gemini',
        'gemini',
        profile.selectedTextModel,
        profile.selectedBackupModel,
        profile.selectedVoiceModel
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
      const updates = { ...(req.body || {}) };
      const userId = getResolvedUserId(req);

      if (updates.selectedTextModel && isTtsModel(updates.selectedTextModel)) {
        res.status(400).json({
          success: false,
          error: `Voice/TTS model '${updates.selectedTextModel}' cannot be used as the chat model.`,
        });
        return;
      }

      if (updates.selectedBackupModel && isTtsModel(updates.selectedBackupModel)) {
        res.status(400).json({
          success: false,
          error: `Voice/TTS model '${updates.selectedBackupModel}' cannot be used as the backup chat model.`,
        });
        return;
      }

      if (updates.selectedVoiceModel && !isTtsModel(updates.selectedVoiceModel)) {
        res.status(400).json({
          success: false,
          error: `Chat model '${updates.selectedVoiceModel}' cannot be used for voice. Select a TTS voice model.`,
        });
        return;
      }

      updates.selectedTextProvider = 'gemini';
      updates.selectedVoiceProvider = 'gemini';

      const updated = await DatabaseService.updateBrainProfile(updates, userId);

      const registry = AIProviderRegistry.getInstance();
      registry.setDefaultTextType('gemini');
      registry.setDefaultVoiceType('gemini');
      registry.setSelectedModels({
        textModel: updated.selectedTextModel,
        backupModel: updated.selectedBackupModel,
        voiceModel: updated.selectedVoiceModel,
      });

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
