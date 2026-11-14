import { Request, Response } from 'express';
import { AIProviderRegistry } from '../../../ai/providers/registry';
import { JEXA_IDENTITY } from '../../../ai/brain/identity';
import { BrainProfile } from '../../../shared/types/brain';
import { isTtsModel } from '../../../shared/types/provider';

let inMemoryBrainProfile: BrainProfile | null = null;

export function getInMemoryBrainProfile(): BrainProfile {
  const registry = AIProviderRegistry.getInstance();
  if (!inMemoryBrainProfile) {
    inMemoryBrainProfile = {
      id: 'default-jexa-profile',
      name: JEXA_IDENTITY.name,
      tagline: JEXA_IDENTITY.tagline,
      creator: JEXA_IDENTITY.creator,
      version: JEXA_IDENTITY.version,
      activePersonality: 'empathetic_companion',
      selectedTextProvider: 'gemini',
      selectedTextModel: registry.getActiveTextModel(),
      selectedBackupModel: registry.getActiveBackupModel(),
      selectedVoiceProvider: 'gemini',
      selectedVoiceModel: registry.getActiveVoiceModel(),
      theme: 'midnight',
      traits: [
        'Context-Aware Companion',
        'Calmly Confident',
        'Warm & Grounded',
        'Intellectually Sharp',
      ],
      toneParameters: {
        warmth: 0.78,
        humor: 0.35,
        conciseness: 0.65,
        curiosity: 0.82,
      },
      voiceSettings: {
        voiceId: 'aura',
        speed: 1.0,
        pitch: 1.0,
        autoSpeak: false,
      },
    };
  }
  return inMemoryBrainProfile;
}

export function updateInMemoryBrainProfile(updates: Partial<BrainProfile>): BrainProfile {
  const current = getInMemoryBrainProfile();
  inMemoryBrainProfile = {
    ...current,
    ...updates,
    toneParameters: {
      ...current.toneParameters,
      ...(updates.toneParameters || {}),
    },
    voiceSettings: {
      ...current.voiceSettings,
      ...(updates.voiceSettings || {}),
    },
  };
  return inMemoryBrainProfile;
}

export class BrainController {
  public static async getProfile(_req: Request, res: Response): Promise<void> {
    try {
      const profile = getInMemoryBrainProfile();
      const providerStatus = AIProviderRegistry.getInstance().getStatus(
        false,
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

      const updated = updateInMemoryBrainProfile(updates);

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
