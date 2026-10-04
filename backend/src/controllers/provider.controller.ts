import { Request, Response } from 'express';
import { AIProviderRegistry } from '../../../ai/providers/registry';
import { DatabaseService } from '../database/db-service';
import { TextProviderType, VoiceProviderType } from '../../../shared/types/provider';

export class ProviderController {
  public static async getStatus(_req: Request, res: Response): Promise<void> {
    try {
      const isDbConnected = await DatabaseService.isConnected();
      const profile = await DatabaseService.getBrainProfile();
      const registry = AIProviderRegistry.getInstance();
      const status = registry.getStatus(isDbConnected, profile.selectedTextProvider, profile.selectedVoiceProvider);

      res.status(200).json({
        success: true,
        data: {
          text: {
            provider: status.textProvider.type,
            model: status.textProvider.model,
            configured: status.textProvider.isConfigured,
          },
          voice: {
            provider: status.voiceProvider.type,
            model: status.voiceProvider.model,
            configured: status.voiceProvider.isConfigured,
          },
          availableText: status.availableTextProviders,
          availableVoice: status.availableVoiceProviders,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async testText(req: Request, res: Response): Promise<void> {
    try {
      const provider: TextProviderType = req.body?.provider || 'gemini';
      const registry = AIProviderRegistry.getInstance();
      const result = await registry.testTextProvider(provider);

      res.status(200).json({
        success: result.success,
        data: {
          provider,
          model: result.model,
          latencyMs: result.latencyMs,
          message: result.success ? `${result.model} connected successfully.` : result.error,
          error: result.error,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  public static async testVoice(req: Request, res: Response): Promise<void> {
    try {
      const provider: VoiceProviderType = req.body?.provider || 'gemini';
      const registry = AIProviderRegistry.getInstance();
      const result = await registry.testVoiceProvider(provider);

      res.status(200).json({
        success: result.success,
        data: {
          provider,
          model: result.model,
          latencyMs: result.latencyMs,
          audioUrl: (result as any).audioUrl,
          message: result.success ? 'Voice generated successfully' : result.error,
          error: result.error,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
