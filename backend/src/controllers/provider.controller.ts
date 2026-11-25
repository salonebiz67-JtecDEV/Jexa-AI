import { Request, Response } from 'express';
import { AIProviderRegistry } from '../../../ai/providers/registry';
import { isTtsModel, scrubSecretsAndUrls } from '../../../shared/types/provider';
import { getInMemoryBrainProfile, updateInMemoryBrainProfile } from './brain.controller';
import { SecurityAuditService } from '../services/security-audit.service';
import { isOwnerAuthEnforced } from '../middleware/auth.middleware';

export class ProviderController {
  public static async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const profile = getInMemoryBrainProfile();
      const registry = AIProviderRegistry.getInstance();
      const defaultTextType = registry.getDefaultTextType();
      const isOwner = Boolean(req.auth?.isOwner) || !isOwnerAuthEnforced();
      const status = registry.getStatus(
        false,
        defaultTextType,
        'gemini',
        profile.selectedTextModel,
        profile.selectedBackupModel,
        profile.selectedVoiceModel
      );

      res.status(200).json({
        success: true,
        data: {
          gatewayActive: registry.isGatewayActive(),
          text: {
            provider: status.textProvider.type,
            model: status.textProvider.model,
            backupModel: status.textProvider.backupModel,
            configured: status.textProvider.isConfigured,
            status: status.textProvider.status,
            error: isOwner ? status.textProvider.lastError : undefined,
          },
          voice: {
            provider: status.voiceProvider.type,
            model: status.voiceProvider.model,
            configured: status.voiceProvider.isConfigured,
            status: status.voiceProvider.status,
            voiceId: profile.voiceSettings?.voiceId || status.voiceProvider.voiceId,
            error: isOwner ? status.voiceProvider.lastError : undefined,
            lastSuccessfulTest: isOwner ? status.voiceProvider.lastSuccessfulTest : undefined,
          },
          availableText: status.availableTextProviders?.map((p) => ({
            ...p,
            error: isOwner ? p.error : undefined,
          })),
          availableVoice: status.availableVoiceProviders?.map((p) => ({
            ...p,
            error: isOwner ? p.error : undefined,
            lastSuccessfulTest: isOwner ? p.lastSuccessfulTest : undefined,
          })),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: scrubSecretsAndUrls(err?.message || 'Failed to read provider status.'),
      });
    }
  }

  public static async selectProviders(req: Request, res: Response): Promise<void> {
    try {
      const textModel: string | undefined =
        typeof req.body?.textModel === 'string' && req.body.textModel.trim()
          ? req.body.textModel.trim()
          : undefined;
      const backupModel: string | undefined =
        typeof req.body?.backupModel === 'string' && req.body.backupModel.trim()
          ? req.body.backupModel.trim()
          : undefined;
      const voiceModel: string | undefined =
        typeof req.body?.voiceModel === 'string' && req.body.voiceModel.trim()
          ? req.body.voiceModel.trim()
          : undefined;
      const theme: any = req.body?.theme;

      if (textModel && isTtsModel(textModel)) {
        res.status(400).json({
          success: false,
          error: `Voice/TTS model '${textModel}' cannot be used as the chat model.`,
        });
        return;
      }

      if (backupModel && isTtsModel(backupModel)) {
        res.status(400).json({
          success: false,
          error: `Voice/TTS model '${backupModel}' cannot be used as the backup chat model.`,
        });
        return;
      }

      if (voiceModel && !isTtsModel(voiceModel)) {
        res.status(400).json({
          success: false,
          error: `Chat model '${voiceModel}' cannot be used for voice. Select a TTS voice model.`,
        });
        return;
      }

      const registry = AIProviderRegistry.getInstance();
      const activeTextType = registry.getDefaultTextType();
      registry.setDefaultTextType(activeTextType);
      registry.setDefaultVoiceType('gemini');
      registry.setSelectedModels({
        ...(textModel ? { textModel } : {}),
        ...(backupModel ? { backupModel } : {}),
        ...(voiceModel ? { voiceModel } : {}),
      });

      const updated = updateInMemoryBrainProfile({
        selectedTextProvider: activeTextType,
        selectedVoiceProvider: 'gemini',
        ...(textModel ? { selectedTextModel: textModel } : {}),
        ...(backupModel ? { selectedBackupModel: backupModel } : {}),
        ...(voiceModel ? { selectedVoiceModel: voiceModel } : {}),
        ...(theme ? { theme } : {}),
      });

      SecurityAuditService.record({
        eventType: registry.isGatewayActive() ? 'gateway_config_changed' : 'provider_config_changed',
        severity: 'info',
        actorUserId: req.auth?.userId,
        actorEmail: req.auth?.email,
        actorRole: req.auth?.role,
        ip: req.ip || req.socket?.remoteAddress || 'unknown',
        method: req.method,
        path: req.originalUrl || req.path,
        statusCode: 200,
        summary: `Owner updated active provider models (${updated.selectedTextModel} / ${updated.selectedBackupModel} / ${updated.selectedVoiceModel}).`,
        details: {
          textProvider: activeTextType,
          textModel: updated.selectedTextModel,
          backupModel: updated.selectedBackupModel,
          voiceModel: updated.selectedVoiceModel,
        },
      });

      res.status(200).json({
        success: true,
        message: 'Active AI models and preferences updated successfully.',
        data: {
          textProvider: activeTextType,
          voiceProvider: 'gemini',
          textModel: updated.selectedTextModel,
          backupModel: updated.selectedBackupModel,
          voiceModel: updated.selectedVoiceModel,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[ProviderController] selectProviders error:', err);
      res.status(500).json({
        success: false,
        error: scrubSecretsAndUrls(err?.message || "Couldn't save. Please try again."),
      });
    }
  }

  public static async testText(req: Request, res: Response): Promise<void> {
    try {
      const requestedModel: string | undefined =
        typeof req.body?.model === 'string' && req.body.model.trim()
          ? req.body.model.trim()
          : undefined;

      if (requestedModel && isTtsModel(requestedModel)) {
        res.status(400).json({
          success: false,
          error: `Voice/TTS model '${requestedModel}' cannot be used as a chat model.`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const registry = AIProviderRegistry.getInstance();
      const activeTextType = registry.getDefaultTextType();
      const result = await registry.testTextProvider(activeTextType, requestedModel);

      SecurityAuditService.record({
        eventType: 'provider_tested',
        severity: 'info',
        actorUserId: req.auth?.userId,
        actorEmail: req.auth?.email,
        actorRole: req.auth?.role,
        ip: req.ip || req.socket?.remoteAddress || 'unknown',
        method: req.method,
        path: req.originalUrl || req.path,
        statusCode: 200,
        summary: `Owner tested text provider (${activeTextType}:${result.model}): ${result.success ? 'connected' : 'failed'}.`,
      });

      res.status(200).json({
        success: result.success,
        data: {
          provider: activeTextType,
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
        error: scrubSecretsAndUrls(err?.message || 'Text provider test failed.'),
        timestamp: new Date().toISOString(),
      });
    }
  }

  public static async testVoice(req: Request, res: Response): Promise<void> {
    try {
      const requestedModel: string | undefined =
        typeof req.body?.model === 'string' && req.body.model.trim()
          ? req.body.model.trim()
          : undefined;

      if (requestedModel && !isTtsModel(requestedModel)) {
        res.status(400).json({
          success: false,
          error: `Chat model '${requestedModel}' cannot be used for voice. Select a TTS voice model.`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const registry = AIProviderRegistry.getInstance();
      const result = await registry.testVoiceProvider('gemini', requestedModel);

      SecurityAuditService.record({
        eventType: 'provider_tested',
        severity: 'info',
        actorUserId: req.auth?.userId,
        actorEmail: req.auth?.email,
        actorRole: req.auth?.role,
        ip: req.ip || req.socket?.remoteAddress || 'unknown',
        method: req.method,
        path: req.originalUrl || req.path,
        statusCode: 200,
        summary: `Owner tested voice provider (gemini:${result.model}): ${result.success ? 'connected' : 'failed'}.`,
      });

      res.status(200).json({
        success: result.success,
        data: {
          provider: 'gemini',
          model: result.model,
          voiceId: result.voiceId,
          latencyMs: result.latencyMs,
          audioUrl: result.audioUrl,
          status: result.status,
          code: result.code,
          message: result.success ? 'Voice generated successfully' : result.error,
          error: result.error,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: scrubSecretsAndUrls(err?.message || 'Voice provider test failed.'),
        timestamp: new Date().toISOString(),
      });
    }
  }
}
