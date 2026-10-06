import { Request, Response } from 'express';
import { AIProviderRegistry } from '../../../ai/providers/registry';
import { VoiceService } from '../services/voice.service';
import { DatabaseService } from '../database/db-service';
import {
  PersonalVoiceReferenceMetadata,
  PersonalVoiceStatusResponse,
  formatCleanProviderError,
} from '../../../shared/types/provider';

/**
 * Controller for JEXA Personal Voice Engine
 * Never exposes API keys or secrets to the frontend.
 * Provides real status, reference sample management, and engine orchestration.
 */
export class PersonalVoiceController {
  /**
   * GET /api/voice/personal/status
   */
  public static async getStatus(_req: Request, res: Response): Promise<void> {
    try {
      const registry = AIProviderRegistry.getInstance();
      const provider = registry.getVoiceProvider('personal') as any;
      const profile = await DatabaseService.getBrainProfile();

      const refMeta = provider?.referenceMetadata || (profile?.personalVoiceSettings ? {
        id: profile.personalVoiceSettings.referenceId || 'ref-default',
        name: profile.personalVoiceSettings.sampleName || 'Personal Voice Reference',
        durationSeconds: profile.personalVoiceSettings.durationSeconds,
        recordedAt: profile.personalVoiceSettings.recordedAt || new Date().toISOString(),
      } : null);

      const isConfigured = Boolean(provider?.isConfigured);
      const engine = provider?.engine || 'none';
      const hasReference = Boolean(refMeta || provider?.referenceId);
      const isReady = Boolean(isConfigured && hasReference);
      const status = provider?.getStatus ? provider.getStatus() : (isConfigured ? 'CONNECTED' : (hasReference ? 'READY' : 'NOT_CONFIGURED'));

      const responseData: PersonalVoiceStatusResponse = {
        configured: isConfigured,
        engine,
        referenceVoice: hasReference,
        referenceMetadata: refMeta,
        ready: isReady,
        model: provider?.modelName || (engine !== 'none' ? `personal-${engine}` : 'none'),
        message: isConfigured
          ? `Personal voice engine (${engine}) configured and ready.`
          : hasReference
          ? `Voice sample recorded. Engine is not configured (PERSONAL_VOICE_ENGINE=${engine}).`
          : 'Personal voice engine not configured.',
        status,
      };

      res.status(200).json({
        success: true,
        configured: isConfigured,
        engine,
        referenceVoice: hasReference,
        ready: isReady,
        model: responseData.model,
        status,
        data: responseData,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[PersonalVoiceController] getStatus error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/voice/personal/reference
   * Saves or uploads the user's reference voice sample metadata
   */
  public static async saveReference(req: Request, res: Response): Promise<void> {
    try {
      const { name, format, durationSeconds, sampleRate, audioData } = req.body;

      const metadata: PersonalVoiceReferenceMetadata = {
        id: `ref-${Date.now()}`,
        name: typeof name === 'string' && name.trim() ? name.trim() : 'My Voice Sample',
        format: format || 'audio/webm',
        durationSeconds: typeof durationSeconds === 'number' ? durationSeconds : undefined,
        sampleRate: typeof sampleRate === 'number' ? sampleRate : undefined,
        recordedAt: new Date().toISOString(),
        sizeBytes: typeof audioData === 'string' ? Math.round(audioData.length * 0.75) : undefined,
        isLocalOnly: false,
      };

      const registry = AIProviderRegistry.getInstance();
      const provider = registry.getVoiceProvider('personal') as any;
      if (provider?.setReferenceMetadata) {
        provider.setReferenceMetadata(metadata);
      }

      // Persist in profile
      await DatabaseService.updateBrainProfile({
        personalVoiceSettings: {
          referenceId: metadata.id,
          sampleName: metadata.name,
          durationSeconds: metadata.durationSeconds,
          recordedAt: metadata.recordedAt,
          engine: provider?.engine || 'none',
          model: provider?.modelName,
        },
      });

      console.log(`[PersonalVoiceController] Saved voice sample reference: '${metadata.name}' (${metadata.id})`);

      res.status(200).json({
        success: true,
        message: 'Personal voice reference sample saved successfully.',
        data: metadata,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[PersonalVoiceController] saveReference error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * DELETE /api/voice/personal/reference
   * Clears the user's reference voice sample
   */
  public static async deleteReference(_req: Request, res: Response): Promise<void> {
    try {
      const registry = AIProviderRegistry.getInstance();
      const provider = registry.getVoiceProvider('personal') as any;
      if (provider?.setReferenceMetadata) {
        provider.setReferenceMetadata(null);
      }

      await DatabaseService.updateBrainProfile({
        personalVoiceSettings: undefined,
      });

      console.log('[PersonalVoiceController] Deleted voice sample reference.');

      res.status(200).json({
        success: true,
        message: 'Personal voice reference sample removed.',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[PersonalVoiceController] deleteReference error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/voice/personal/test
   * Runs a genuine synthesis test on personal voice.
   * If not configured, returns clear unconfigured status without faking audio.
   */
  public static async testPersonalVoice(req: Request, res: Response): Promise<void> {
    try {
      const result = await VoiceService.testProvider('personal', req.body?.text);
      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.warn('[PersonalVoiceController] Test personal voice rejected:', error.message);
      const formatted = formatCleanProviderError(error);
      res.status(200).json({
        success: false,
        data: {
          provider: 'personal',
          status: 'NOT_CONFIGURED',
          code: formatted.code,
          error: formatted.cleanMessage,
          message: formatted.cleanMessage,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * POST /api/voice/personal/synthesize
   * Synthesizes speech using Personal Voice
   */
  public static async synthesize(req: Request, res: Response): Promise<void> {
    try {
      const result = await VoiceService.speak({
        text: req.body?.text,
        provider: 'personal',
        speed: req.body?.speed,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.warn('[PersonalVoiceController] Synthesis failed:', error.message);
      const formatted = formatCleanProviderError(error);
      res.status(formatted.statusCode).json({
        success: false,
        provider: 'personal',
        code: formatted.code,
        message: formatted.cleanMessage,
        error: formatted.cleanMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
