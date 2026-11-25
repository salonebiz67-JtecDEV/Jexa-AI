import {
  DEFAULT_BACKUP_MODEL,
  DEFAULT_BACKGROUND_MODEL,
  DEFAULT_CHAT_MODEL,
  DEFAULT_VOICE_MODEL,
  isTtsModel,
} from '../types/provider';

export interface ConfigSource {
  name: string;
  get(key: string): string | undefined;
  getAsync?(key: string): Promise<string | undefined>;
  listKeys?(): string[];
}

export interface GeminiLocalConfig {
  apiKey?: string;
  voiceApiKey?: string;
  textModel: string;
  backupModel: string;
  backgroundModel: string;
  voiceModel: string;
  voiceName: string;
  temperature: number;
  maxTokens: number;
}

function readProcessEnv(key: string): string | undefined {
  try {
    if (typeof process !== 'undefined' && process.env && Object.prototype.hasOwnProperty.call(process.env, key)) {
      const val = process.env[key];
      if (typeof val === 'string') {
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }
    }
  } catch {
    // Ignore restricted global process access in sandboxed webviews
  }
  return undefined;
}

function normalizeOptionalString(val: unknown): string | undefined {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Runtime-agnostic configuration manager shared between Node providers and browser/Capacitor runtime.
 * Priority:
 *  1. In-memory explicit overrides (tests/runtime hooks)
 *  2. Registered local device/runtime sources (e.g. Android SecureStorage / localStorage)
 *  3. Node process.env
 *
 * Security rule: Never log or serialize raw variable values.
 */
class LocalConfigManagerImpl {
  private sources: ConfigSource[] = [];
  private overrides = new Map<string, string>();

  public registerSource(source: ConfigSource): () => void {
    this.sources = [...this.sources.filter((s) => s.name !== source.name), source];
    return () => {
      this.sources = this.sources.filter((s) => s.name !== source.name);
    };
  }

  public setOverride(key: string, value: string): void {
    const cleanKey = (key || '').trim();
    if (!cleanKey) return;
    this.overrides.set(cleanKey, value);
  }

  public removeOverride(key: string): void {
    const cleanKey = (key || '').trim();
    if (!cleanKey) return;
    this.overrides.delete(cleanKey);
  }

  public clearOverrides(): void {
    this.overrides.clear();
  }

  public get(key: string): string | undefined {
    const cleanKey = (key || '').trim();
    if (!cleanKey) return undefined;

    if (this.overrides.has(cleanKey)) {
      return normalizeOptionalString(this.overrides.get(cleanKey));
    }

    // Search newest registered sources first
    for (let i = this.sources.length - 1; i >= 0; i--) {
      try {
        const val = normalizeOptionalString(this.sources[i].get(cleanKey));
        if (val !== undefined) {
          return val;
        }
      } catch {
        // Ignore single source read failure
      }
    }

    return readProcessEnv(cleanKey);
  }

  public async getAsync(key: string): Promise<string | undefined> {
    const syncVal = this.get(key);
    if (syncVal !== undefined) return syncVal;

    const cleanKey = (key || '').trim();
    if (!cleanKey) return undefined;

    for (let i = this.sources.length - 1; i >= 0; i--) {
      const src = this.sources[i];
      if (typeof src.getAsync === 'function') {
        try {
          const val = normalizeOptionalString(await src.getAsync(cleanKey));
          if (val !== undefined) {
            return val;
          }
        } catch {
          // Ignore single async source read failure
        }
      }
    }

    return undefined;
  }

  public has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  public listKeys(): string[] {
    const keys = new Set<string>();
    this.overrides.forEach((_v, k) => keys.add(k));
    for (const src of this.sources) {
      if (typeof src.listKeys === 'function') {
        try {
          for (const k of src.listKeys()) {
            if (k && k.trim()) keys.add(k.trim());
          }
        } catch {
          // ignore
        }
      }
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }

  public getGeminiConfig(): GeminiLocalConfig {
    const apiKey =
      this.get('GEMINI_API_KEY') ||
      this.get('TEXT_AI_API_KEY') ||
      this.get('AI_API_KEY');

    const voiceApiKey =
      this.get('GEMINI_API_KEY') ||
      this.get('VOICE_AI_API_KEY') ||
      this.get('AI_API_KEY') ||
      apiKey;

    const rawTextModel =
      this.get('TEXT_AI_MODEL') ||
      this.get('GEMINI_MODEL') ||
      DEFAULT_CHAT_MODEL;
    const textModel = isTtsModel(rawTextModel) ? DEFAULT_CHAT_MODEL : rawTextModel;

    const rawBackupModel =
      this.get('TEXT_AI_BACKUP_MODEL') ||
      DEFAULT_BACKUP_MODEL;
    const backupModel = isTtsModel(rawBackupModel) ? DEFAULT_BACKUP_MODEL : rawBackupModel;

    const rawBackgroundModel =
      this.get('BACKGROUND_AI_MODEL') ||
      DEFAULT_BACKGROUND_MODEL;
    const backgroundModel = isTtsModel(rawBackgroundModel) ? DEFAULT_BACKGROUND_MODEL : rawBackgroundModel;

    const rawVoiceModel =
      this.get('VOICE_AI_MODEL') ||
      this.get('GEMINI_VOICE_MODEL') ||
      DEFAULT_VOICE_MODEL;
    const voiceModel = isTtsModel(rawVoiceModel) ? rawVoiceModel : DEFAULT_VOICE_MODEL;

    const voiceName = this.get('VOICE_AI_VOICE_ID') || 'aura';

    const parsedTemp = parseFloat(this.get('TEXT_AI_TEMPERATURE') || '0.7');
    const temperature = Number.isFinite(parsedTemp) ? parsedTemp : 0.7;

    const parsedMaxTokens = parseInt(this.get('TEXT_AI_MAX_TOKENS') || '4096', 10);
    const maxTokens = Number.isFinite(parsedMaxTokens) && parsedMaxTokens > 0 ? parsedMaxTokens : 4096;

    return {
      apiKey,
      voiceApiKey,
      textModel,
      backupModel,
      backgroundModel,
      voiceModel,
      voiceName,
      temperature,
      maxTokens,
    };
  }
}

export const LocalConfigManager = new LocalConfigManagerImpl();
