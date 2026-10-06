import { Request, Response } from 'express';
import { AIProviderRegistry } from '../../../ai/providers/registry';
import { DatabaseService } from '../database/db-service';
import { TextProviderType, VoiceProviderType } from '../../../shared/types/provider';

export class ProviderController {
  public static async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.headers['x-user-id'] as string) || (req.query.userId as string);
      const isDbConnected = await DatabaseService.isConnected();
      const profile = await DatabaseService.getBrainProfile(userId);
      const registry = AIProviderRegistry.getInstance();
      const status = registry.getStatus(isDbConnected, profile.selectedTextProvider, profile.selectedVoiceProvider);

      res.status(200).json({
        success: true,
        data: {
          text: {
            provider: status.textProvider.type,
            model: profile.selectedTextModel || status.textProvider.model,
            configured: status.textProvider.isConfigured,
            status: status.textProvider.status,
            error: status.textProvider.lastError,
          },
          voice: {
            provider: status.voiceProvider.type,
            model: profile.selectedVoiceModel || status.voiceProvider.model,
            configured: status.voiceProvider.isConfigured,
            status: status.voiceProvider.status,
            voiceId: profile.voiceSettings?.voiceId || status.voiceProvider.voiceId,
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
      const textModel: string | undefined = req.body?.textModel;
      const voiceModel: string | undefined = req.body?.voiceModel;
      const theme: any = req.body?.theme;
      const userId = (req.headers['x-user-id'] as string) || req.body?.userId;
      const registry = AIProviderRegistry.getInstance();

      if (textProvider) {
        registry.setDefaultTextType(textProvider);
      }
      if (voiceProvider) {
        registry.setDefaultVoiceType(voiceProvider);
      }

      await DatabaseService.updateBrainProfile({
        ...(textProvider ? { selectedTextProvider: textProvider } : {}),
        ...(textModel ? { selectedTextModel: textModel } : {}),
        ...(voiceProvider ? { selectedVoiceProvider: voiceProvider } : {}),
        ...(voiceModel ? { selectedVoiceModel: voiceModel } : {}),
        ...(theme ? { theme } : {}),
      }, userId);

      res.status(200).json({
        success: true,
        message: 'Active AI providers and preferences updated successfully.',
        data: {
          textProvider: registry.getDefaultTextType(),
          voiceProvider: registry.getDefaultVoiceType(),
          textModel,
          voiceModel,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[ProviderController] selectProviders error:', err);
      res.status(500).json({ success: false, error: err.message || "Couldn't save. Please try again." });
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
