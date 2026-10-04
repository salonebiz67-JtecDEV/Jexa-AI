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
            status: status.textProvider.status,
            error: status.textProvider.lastError,
          },
          voice: {
            provider: status.voiceProvider.type,
            model: status.voiceProvider.model,
            configured: status.voiceProvider.isConfigured,
            status: status.voiceProvider.status,
            voiceId: status.voiceProvider.voiceId,
            error: status.voiceProvider.lastError,
            lastSuccessfulTest: status.voiceProvider.lastSuccessfulTest,
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

  public static async selectProviders(req: Request, res: Response): Promise<void> {
    try {
      const textProvider: TextProviderType | undefined = req.body?.textProvider;
      const voiceProvider: VoiceProviderType | undefined = req.body?.voiceProvider;
      const registry = AIProviderRegistry.getInstance();

      if (textProvider) {
        registry.setDefaultTextType(textProvider);
      }
      if (voiceProvider) {
        registry.setDefaultVoiceType(voiceProvider);
      }

      try {
        await DatabaseService.updateBrainProfile({
          selectedTextProvider: textProvider,
          selectedVoiceProvider: voiceProvider,
        });
      } catch (dbErr: any) {
        console.warn('[ProviderController] Failed to persist provider selection in DB:', dbErr.message);
      }

      res.status(200).json({
        success: true,
        message: 'Active AI providers updated successfully.',
        data: {
          textProvider: registry.getDefaultTextType(),
          voiceProvider: registry.getDefaultVoiceType(),
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
          status: result.status,
          code: result.code,
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
          voiceId: (result as any).voiceId,
          latencyMs: result.latencyMs,
          audioUrl: (result as any).audioUrl,
          status: (result as any).status,
          code: (result as any).code,
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
