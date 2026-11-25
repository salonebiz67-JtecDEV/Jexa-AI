import {
  BrainProfile,
  ChatMessage,
  ChatResponsePayload,
  DEFAULT_BACKUP_MODEL,
  DEFAULT_CHAT_MODEL,
  DEFAULT_VOICE_MODEL,
  RESILIENT_GEMINI_FALLBACK_MODELS,
  ProviderHealthStatus,
  ProviderStatus,
  SendMessagePayload,
  VoiceSynthesisRequest,
  isTtsModel,
  formatCleanProviderError,
} from '../../shared/types';
import { LocalConfigManager } from '../../shared/config/local-config';
import { initVariablesStorage } from './variablesStorage';
import { safeStorage } from './storage';
import { PERSONALITY_PRESETS } from '../../ai/brain/personality';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class LocalGeminiError extends Error {
  public status: number;
  public code: string;
  public provider = 'gemini';
  public model?: string;
  public fallbackUsed?: boolean;

  constructor(
    message: string,
    status: number,
    code: string,
    model?: string,
    fallbackUsed?: boolean
  ) {
    super(message);
    this.name = 'LocalGeminiError';
    this.status = status;
    this.code = code;
    this.model = model;
    this.fallbackUsed = fallbackUsed;
  }
}

export interface LocalStreamCallbacks {
  onStatusUpdate?: (
    status: string,
    details?: {
      provider?: string;
      model?: string;
      fallbackUsed?: boolean;
      error?: string;
    }
  ) => void;
  onChunk?: (chunk: string) => void;
  onComplete?: (response: ChatResponsePayload) => void;
}

const VOICE_MAP: Record<string, string> = {
  aura: 'Aoede',
  'aura-jexa-serene': 'Aoede',
  atlas: 'Fenrir',
  lyra: 'Kore',
  puck: 'Puck',
  charon: 'Charon',
};

const RETIRED_GEMINI_MODELS = new Set([
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
]);

function isGemini4Model(modelName: string): boolean {
  return /^gemini-4(?:-|$)/i.test((modelName || '').trim());
}

function isTransientLocalFailure(err: any): boolean {
  if (!err) return false;
  if (err.code === 'AUTHENTICATION_ERROR' || err.code === 'MISSING_CREDENTIALS' || err.status === 401 || err.status === 403) {
    return false;
  }
  return (
    err.status === 503 ||
    err.status === 429 ||
    err.code === 'PROVIDER_UNAVAILABLE' ||
    (err.code === 'QUOTA_EXHAUSTED' && !/current quota/i.test(err.message || ''))
  );
}

function buildLocalFallbackOrder(primaryModel: string, backupModel: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const m of [primaryModel, backupModel, ...RESILIENT_GEMINI_FALLBACK_MODELS]) {
    const clean = (m || '').trim();
    if (clean && !isTtsModel(clean) && !seen.has(clean)) {
      seen.add(clean);
      ordered.push(clean);
    }
  }
  return ordered;
}

function resolveSavedChatModel(requested?: string, fallback: string = DEFAULT_CHAT_MODEL): string {
  const candidates = [
    requested,
    safeStorage.getItem('jexa_text_model') || undefined,
    LocalConfigManager.getGeminiConfig().textModel,
    fallback,
  ];
  for (const c of candidates) {
    const trimmed = (c || '').trim();
    if (trimmed && !isTtsModel(trimmed) && !RETIRED_GEMINI_MODELS.has(trimmed)) {
      return trimmed;
    }
  }
  return fallback;
}

function resolveSavedBackupModel(requested?: string): string {
  const candidates = [
    requested,
    safeStorage.getItem('jexa_backup_model') || undefined,
    LocalConfigManager.getGeminiConfig().backupModel,
    DEFAULT_BACKUP_MODEL,
  ];
  for (const c of candidates) {
    const trimmed = (c || '').trim();
    if (trimmed && !isTtsModel(trimmed) && !RETIRED_GEMINI_MODELS.has(trimmed)) {
      return trimmed;
    }
  }
  return DEFAULT_BACKUP_MODEL;
}

function resolveSavedVoiceModel(requested?: string): string {
  const candidates = [
    requested,
    safeStorage.getItem('jexa_voice_model') || undefined,
    LocalConfigManager.getGeminiConfig().voiceModel,
    DEFAULT_VOICE_MODEL,
  ];
  for (const c of candidates) {
    const trimmed = (c || '').trim();
    if (trimmed && isTtsModel(trimmed)) {
      return trimmed;
    }
  }
  return DEFAULT_VOICE_MODEL;
}

function resolveSavedVoiceName(requested?: string): string {
  return (
    (requested || '').trim() ||
    (safeStorage.getItem('jexa_voice_name') || '').trim() ||
    LocalConfigManager.getGeminiConfig().voiceName ||
    'aura'
  );
}

function buildSystemInstruction(payload: SendMessagePayload): string {
  const personality = PERSONALITY_PRESETS.empathetic_companion;
  const nowUtc = new Date().toISOString().split('T')[0];

  const parts: string[] = [
    `You are JEXA, a warm, intelligent, and thoughtful personal AI assistant.`,
    personality.systemPromptModifier,
    `Current UTC date: ${nowUtc}.`,
    `Mode: Standalone On-Device Gemini mode (no backend server connected). Be honest about capabilities: you do not have access to live web search (web_search), URL link fetching (open_link), or server diagnostics unless a backend URL is configured. Never invent live news or pretend to browse the web.`,
  ];

  if (payload.isVoiceMode) {
    parts.push(
      'The user is speaking in Live Voice Mode. Keep replies concise, conversational, and natural to hear spoken aloud (avoid markdown formatting and long bullet lists unless asked).'
    );
  }

  if (payload.aboutMe && payload.aboutMe.trim()) {
    parts.push(`User profile & preferences:\n${payload.aboutMe.trim()}`);
  }

  if (payload.behaviorInstructions && payload.behaviorInstructions.trim()) {
    parts.push(`Custom behavior instructions:\n${payload.behaviorInstructions.trim()}`);
  }

  return parts.join('\n\n');
}

function buildGeminiContents(payload: SendMessagePayload): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  const history = Array.isArray(payload.history) ? payload.history.slice(-8) : [];

  for (const item of history) {
    if (!item || typeof item.content !== 'string' || !item.content.trim()) continue;
    const role: 'user' | 'model' = item.role === 'assistant' ? 'model' : 'user';
    const prev = contents[contents.length - 1];
    if (prev && prev.role === role) {
      prev.parts.push({ text: item.content });
    } else {
      contents.push({ role, parts: [{ text: item.content }] });
    }
  }

  while (contents.length > 0 && contents[0].role === 'model') {
    contents.shift();
  }

  const msg = (payload.message || '').trim();
  const prev = contents[contents.length - 1];
  if (prev && prev.role === 'user') {
    prev.parts.push({ text: msg });
  } else {
    contents.push({ role: 'user', parts: [{ text: msg }] });
  }

  return contents;
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function pcmToWavBlob(pcmChunks: Uint8Array[], sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Blob {
  const dataSize = pcmChunks.reduce((acc, c) => acc + c.byteLength, 0);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const out = new Uint8Array(buffer);
  let offset = 44;
  for (const chunk of pcmChunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function mapHttpFailure(status: number, rawBody: string, model: string, fallbackUsed = false): LocalGeminiError {
  let errObj: any = null;
  try {
    errObj = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    errObj = null;
  }
  const msg = errObj?.error?.message || errObj?.message || `Gemini returned HTTP ${status}`;
  const formatted = formatCleanProviderError({
    status,
    statusCode: status,
    message: msg,
    code: errObj?.error?.status,
    provider: 'gemini',
    model,
  });
  return new LocalGeminiError(
    formatted.cleanMessage,
    formatted.statusCode,
    formatted.code,
    model,
    fallbackUsed
  );
}

function extractTextFromCandidate(json: any): string {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((p: any) => typeof p?.text === 'string' && !p?.thought)
    .map((p: any) => p.text)
    .join('');
}

async function generateOnce(params: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
  temperature: number;
  maxOutputTokens: number;
}): Promise<{
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}> {
  const generationConfig: Record<string, any> = {
    maxOutputTokens: params.maxOutputTokens,
  };
  if (!isGemini4Model(params.model)) {
    generationConfig.temperature = params.temperature;
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);
    try {
      const res = await fetch(
        `${GEMINI_API_BASE}/models/${encodeURIComponent(params.model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': params.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: params.systemInstruction }] },
            contents: params.contents,
            generationConfig,
          }),
          signal: controller.signal,
        }
      );

      const rawText = await res.text();
      if (!res.ok) {
        throw mapHttpFailure(res.status, rawText, params.model);
      }

      const json = rawText ? JSON.parse(rawText) : {};
      const content = extractTextFromCandidate(json);
      const usage = json?.usageMetadata;
      const promptTokens = usage?.promptTokenCount ?? Math.max(1, Math.ceil(JSON.stringify(params.contents).length / 4));
      const completionTokens = usage?.candidatesTokenCount ?? Math.max(1, Math.ceil(content.length / 4));
      const totalTokens = usage?.totalTokenCount ?? promptTokens + completionTokens;

      return { content, promptTokens, completionTokens, totalTokens };
    } catch (err: any) {
      const mapped =
        err instanceof LocalGeminiError
          ? err
          : err?.name === 'AbortError'
          ? new LocalGeminiError('Gemini request timed out after 35 seconds.', 504, 'PROVIDER_TIMEOUT', params.model)
          : new LocalGeminiError(
              err?.message || 'Unable to reach Google Gemini API. Check your internet connection.',
              0,
              'NETWORK_FAILURE',
              params.model
            );

      if (attempt < 2 && isTransientLocalFailure(mapped)) {
        await new Promise((r) => setTimeout(r, 400 + Math.floor(Math.random() * 150)));
        continue;
      }
      throw mapped;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new LocalGeminiError('Gemini request failed.', 500, 'PROVIDER_ERROR', params.model);
}

async function streamOnce(params: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
  temperature: number;
  maxOutputTokens: number;
  onChunk?: (chunk: string) => void;
}): Promise<{
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}> {
  const generationConfig: Record<string, any> = {
    maxOutputTokens: params.maxOutputTokens,
  };
  if (!isGemini4Model(params.model)) {
    generationConfig.temperature = params.temperature;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    let res: Response | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      res = await fetch(
        `${GEMINI_API_BASE}/models/${encodeURIComponent(params.model)}:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream, application/json',
            'x-goog-api-key': params.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: params.systemInstruction }] },
            contents: params.contents,
            generationConfig,
          }),
          signal: controller.signal,
        }
      );

      if (res.ok || attempt >= 2 || (res.status !== 503 && res.status !== 429)) {
        break;
      }
      await new Promise((r) => setTimeout(r, 400 + Math.floor(Math.random() * 150)));
    }

    if (!res || !res.ok || !res.body) {
      const rawErr = res ? await res.text().catch(() => '') : '';
      throw mapHttpFailure(res?.status || 0, rawErr, params.model);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';
    let usage: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        const lines = block.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed?.usageMetadata) {
              usage = parsed.usageMetadata;
            }
            const piece = extractTextFromCandidate(parsed);
            if (piece) {
              fullText += piece;
              params.onChunk?.(piece);
            }
          } catch {
            // Skip malformed SSE event
          }
        }
      }
    }

    const promptTokens = usage?.promptTokenCount ?? Math.max(1, Math.ceil(JSON.stringify(params.contents).length / 4));
    const completionTokens = usage?.candidatesTokenCount ?? Math.max(1, Math.ceil(fullText.length / 4));
    const totalTokens = usage?.totalTokenCount ?? promptTokens + completionTokens;

    return { content: fullText, promptTokens, completionTokens, totalTokens };
  } catch (err: any) {
    if (err instanceof LocalGeminiError) throw err;
    if (err?.name === 'AbortError') {
      throw new LocalGeminiError('Gemini stream timed out.', 504, 'PROVIDER_TIMEOUT', params.model);
    }
    throw new LocalGeminiError(
      err?.message || 'Unable to reach Google Gemini API. Check your internet connection.',
      0,
      'NETWORK_FAILURE',
      params.model
    );
  } finally {
    clearTimeout(timer);
  }
}

export const LocalGeminiService = {
  getLocalBrainProfile(): { profile: BrainProfile; providerStatus: ProviderStatus } {
    const cfg = LocalConfigManager.getGeminiConfig();
    const textModel = resolveSavedChatModel();
    const backupModel = resolveSavedBackupModel();
    const voiceModel = resolveSavedVoiceModel();
    const voiceId = resolveSavedVoiceName();
    const hasKey = Boolean(cfg.apiKey);

    const providerStatus = this.getLocalProviderStatus();

    const profile: BrainProfile = {
      id: 'local-device-brain',
      name: 'JEXA',
      tagline: 'Personal AI Assistant',
      creator: 'JOHNEY TEC',
      version: '1.0',
      activePersonality: 'empathetic_companion',
      selectedTextProvider: 'gemini',
      selectedTextModel: textModel,
      selectedBackupModel: backupModel,
      selectedVoiceProvider: 'gemini',
      selectedVoiceModel: voiceModel,
      theme: 'dark',
      traits: ['warm', 'thoughtful', 'clear', 'honest'],
      toneParameters: {
        warmth: 0.85,
        humor: 0.4,
        conciseness: 0.7,
        curiosity: 0.8,
      },
      voiceSettings: {
        voiceId,
        speed: 1.0,
        pitch: 1.0,
        autoSpeak: false,
      },
    };

    if (!hasKey) {
      providerStatus.textProvider.lastError = 'Add GEMINI_API_KEY in Variables to chat on-device.';
      providerStatus.voiceProvider.lastError = 'Add GEMINI_API_KEY in Variables to use voice.';
    }

    return { profile, providerStatus };
  },

  getLocalProviderStatus(): ProviderStatus {
    const cfg = LocalConfigManager.getGeminiConfig();
    const textModel = resolveSavedChatModel();
    const backupModel = resolveSavedBackupModel();
    const voiceModel = resolveSavedVoiceModel();
    const hasTextKey = Boolean(cfg.apiKey);
    const hasVoiceKey = Boolean(cfg.voiceApiKey);

    const textHealth: ProviderHealthStatus = hasTextKey ? 'CONNECTED' : 'NOT_CONFIGURED';
    const voiceHealth: ProviderHealthStatus = hasVoiceKey ? 'READY' : 'NOT_CONFIGURED';

    return {
      textProvider: {
        type: 'gemini',
        isConfigured: hasTextKey,
        hasApiKey: hasTextKey,
        model: textModel,
        backupModel,
        status: textHealth,
        description: hasTextKey
          ? 'Google Gemini direct on-device execution'
          : 'GEMINI_API_KEY missing in Variables',
      },
      voiceProvider: {
        type: 'gemini',
        isConfigured: hasVoiceKey,
        hasApiKey: hasVoiceKey,
        model: voiceModel,
        voiceId: 'Aoede / Fenrir / Kore',
        status: voiceHealth,
        description: hasVoiceKey
          ? 'Gemini Neural Voice direct on-device'
          : 'GEMINI_API_KEY missing in Variables',
      },
      availableTextProviders: [
        {
          type: 'gemini',
          name: 'Google Gemini (On-Device)',
          isConfigured: hasTextKey,
          model: textModel,
          description: 'Direct Google Gemini API using your local Variables key',
          status: textHealth,
        },
      ],
      availableVoiceProviders: [
        {
          type: 'gemini',
          name: 'Gemini Voice TTS (On-Device)',
          isConfigured: hasVoiceKey,
          model: voiceModel,
          voiceId: 'Aoede (Aura) / Fenrir (Atlas) / Kore (Lyra)',
          description: 'Direct Gemini Neural TTS using your local Variables key',
          status: voiceHealth,
        },
      ],
      database: {
        type: 'in_memory_fallback',
        isConfigured: false,
        status: 'unconfigured_fallback',
      },
      isProductionReady: hasTextKey && hasVoiceKey,
    };
  },

  async sendMessage(payload: SendMessagePayload): Promise<ChatResponsePayload> {
    await initVariablesStorage();
    const cfg = LocalConfigManager.getGeminiConfig();
    if (!cfg.apiKey) {
      throw new LocalGeminiError(
        'GEMINI_API_KEY is not configured. Open Variables in the sidebar to add your GEMINI_API_KEY.',
        503,
        'MISSING_CREDENTIALS'
      );
    }

    const primaryModel = resolveSavedChatModel(payload.textModel, cfg.textModel);
    const backupModel = resolveSavedBackupModel(payload.backupModel);
    const systemInstruction = buildSystemInstruction(payload);
    const contents = buildGeminiContents(payload);
    const startedAt = Date.now();

    const candidates = buildLocalFallbackOrder(primaryModel, backupModel);
    let usedModel = primaryModel;
    let fallbackUsed = false;
    let result: { content: string; promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
    let lastError: any = null;

    for (let i = 0; i < candidates.length; i++) {
      const model = candidates[i];
      if (i > 0) {
        fallbackUsed = true;
      }
      try {
        result = await generateOnce({
          apiKey: cfg.apiKey,
          model,
          systemInstruction,
          contents,
          temperature: cfg.temperature,
          maxOutputTokens: cfg.maxTokens,
        });
        usedModel = model;
        break;
      } catch (err: any) {
        lastError = err;
        if (err?.code === 'AUTHENTICATION_ERROR' || err?.code === 'MISSING_CREDENTIALS' || err?.status === 401 || err?.status === 403) {
          throw err;
        }
      }
    }

    if (!result) {
      if (lastError && typeof lastError === 'object') {
        lastError.fallbackUsed = fallbackUsed;
      }
      throw lastError;
    }

    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      conversationId: payload.conversationId || `conv-${Date.now()}`,
      role: 'assistant',
      content: result.content,
      createdAt: new Date().toISOString(),
      status: 'complete',
      metadata: {
        provider: 'gemini',
        model: usedModel,
        fallbackUsed,
        tokens: result.totalTokens,
        inputTokens: result.promptTokens,
        outputTokens: result.completionTokens,
        latencyMs: Date.now() - startedAt,
      },
    };

    return {
      conversationId: message.conversationId,
      message,
      isNewConversation: !payload.conversationId,
    };
  },

  async sendMessageStream(
    payload: SendMessagePayload,
    callbacks?: LocalStreamCallbacks
  ): Promise<ChatResponsePayload> {
    await initVariablesStorage();
    const cfg = LocalConfigManager.getGeminiConfig();
    if (!cfg.apiKey) {
      throw new LocalGeminiError(
        'GEMINI_API_KEY is not configured. Open Variables in the sidebar to add your GEMINI_API_KEY.',
        503,
        'MISSING_CREDENTIALS'
      );
    }

    const primaryModel = resolveSavedChatModel(payload.textModel, cfg.textModel);
    const backupModel = resolveSavedBackupModel(payload.backupModel);
    const systemInstruction = buildSystemInstruction(payload);
    const contents = buildGeminiContents(payload);
    const startedAt = Date.now();

    const candidates = buildLocalFallbackOrder(primaryModel, backupModel);
    let usedModel = primaryModel;
    let fallbackUsed = false;
    let streamedAnyChunk = false;
    let result: { content: string; promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
    let lastError: any = null;

    for (let i = 0; i < candidates.length; i++) {
      const model = candidates[i];
      const isFallback = i > 0;
      if (isFallback) {
        fallbackUsed = true;
        callbacks?.onStatusUpdate?.('Retrying…', {
          provider: 'gemini',
          model,
          fallbackUsed: true,
        });
      } else {
        callbacks?.onStatusUpdate?.('Thinking...', {
          provider: 'gemini',
          model,
          fallbackUsed: false,
        });
      }

      try {
        result = await streamOnce({
          apiKey: cfg.apiKey,
          model,
          systemInstruction,
          contents,
          temperature: cfg.temperature,
          maxOutputTokens: cfg.maxTokens,
          onChunk: (chunk) => {
            if (chunk) streamedAnyChunk = true;
            callbacks?.onChunk?.(chunk);
          },
        });
        usedModel = model;
        break;
      } catch (err: any) {
        lastError = err;
        if (
          streamedAnyChunk ||
          err?.code === 'AUTHENTICATION_ERROR' ||
          err?.code === 'MISSING_CREDENTIALS' ||
          err?.status === 401 ||
          err?.status === 403
        ) {
          throw err;
        }
      }
    }

    if (!result) {
      if (lastError && typeof lastError === 'object') {
        lastError.fallbackUsed = fallbackUsed;
      }
      throw lastError;
    }

    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      conversationId: payload.conversationId || `conv-${Date.now()}`,
      role: 'assistant',
      content: result.content,
      createdAt: new Date().toISOString(),
      status: 'complete',
      metadata: {
        provider: 'gemini',
        model: usedModel,
        fallbackUsed,
        tokens: result.totalTokens,
        inputTokens: result.promptTokens,
        outputTokens: result.completionTokens,
        latencyMs: Date.now() - startedAt,
      },
    };

    const response: ChatResponsePayload = {
      conversationId: message.conversationId,
      message,
      isNewConversation: !payload.conversationId,
    };

    callbacks?.onStatusUpdate?.('Answer complete', {
      provider: 'gemini',
      model: usedModel,
      fallbackUsed,
    });
    callbacks?.onComplete?.(response);
    return response;
  },

  async generateConversationTitle(userMessage: string, assistantMessage?: string): Promise<string> {
    await initVariablesStorage();
    const cfg = LocalConfigManager.getGeminiConfig();
    if (!cfg.apiKey || !userMessage.trim()) return '';

    const titleModel = resolveSavedChatModel(cfg.backgroundModel || cfg.textModel);
    const snippet = [
      `User: ${userMessage.slice(0, 300)}`,
      assistantMessage ? `Assistant: ${assistantMessage.slice(0, 200)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const res = await generateOnce({
        apiKey: cfg.apiKey,
        model: titleModel,
        systemInstruction:
          'Write a concise 2 to 5 word title for this conversation. Output only the title without quotes or punctuation.',
        contents: [{ role: 'user', parts: [{ text: snippet }] }],
        temperature: 0.3,
        maxOutputTokens: 24,
      });
      return res.content.replace(/^["']|["']$/g, '').trim().slice(0, 60);
    } catch {
      return '';
    }
  },

  async synthesizeSpeechBlob(payload: VoiceSynthesisRequest): Promise<{
    blob: Blob;
    mimeType: string;
    model: string;
    provider: 'gemini';
  }> {
    await initVariablesStorage();
    const cfg = LocalConfigManager.getGeminiConfig();
    const apiKey = cfg.voiceApiKey || cfg.apiKey;
    const targetModel = resolveSavedVoiceModel(payload.model);

    if (!apiKey) {
      throw new LocalGeminiError(
        'GEMINI_API_KEY is not configured. Add it in Variables to use Gemini Voice.',
        503,
        'MISSING_CREDENTIALS',
        targetModel
      );
    }

    const cleanText = (payload.text || '').replace(/[*#`_\[\]]/g, '').trim();
    if (!cleanText) {
      throw new LocalGeminiError('No valid text provided for speech synthesis.', 400, 'INVALID_INPUT', targetModel);
    }

    const requestedVoice = resolveSavedVoiceName(payload.voiceId).toLowerCase();
    const voiceName = VOICE_MAP[requestedVoice] || 'Aoede';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(
        `${GEMINI_API_BASE}/models/${encodeURIComponent(targetModel)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: cleanText }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
            },
          }),
          signal: controller.signal,
        }
      );

      const rawText = await res.text();
      if (!res.ok) {
        throw mapHttpFailure(res.status, rawText, targetModel);
      }

      const json = rawText ? JSON.parse(rawText) : {};
      const pcmChunks: Uint8Array[] = [];
      for (const candidate of json?.candidates || []) {
        for (const part of candidate?.content?.parts || []) {
          const b64 = part?.inlineData?.data;
          if (typeof b64 === 'string' && b64.length > 0) {
            pcmChunks.push(decodeBase64ToBytes(b64));
          }
        }
      }

      if (pcmChunks.length === 0) {
        throw new LocalGeminiError(
          'Gemini voice synthesis returned empty audio data.',
          502,
          'EMPTY_AUDIO',
          targetModel
        );
      }

      const blob = pcmToWavBlob(pcmChunks, 24000, 1, 16);
      return {
        blob,
        mimeType: 'audio/wav',
        model: targetModel,
        provider: 'gemini',
      };
    } catch (err: any) {
      if (err instanceof LocalGeminiError) throw err;
      if (err?.name === 'AbortError') {
        throw new LocalGeminiError('Voice synthesis timed out after 30 seconds.', 504, 'VOICE_TIMEOUT', targetModel);
      }
      throw new LocalGeminiError(
        err?.message || 'Unable to reach Gemini Voice API.',
        0,
        'NETWORK_FAILURE',
        targetModel
      );
    } finally {
      clearTimeout(timer);
    }
  },

  async testTextConnection(customModel?: string): Promise<{
    success: boolean;
    provider: 'gemini';
    model: string;
    latencyMs: number;
    code?: string;
    status: ProviderHealthStatus;
    error?: string;
  }> {
    await initVariablesStorage();
    const cfg = LocalConfigManager.getGeminiConfig();
    const model = resolveSavedChatModel(customModel, cfg.textModel);

    if (!cfg.apiKey) {
      return {
        success: false,
        provider: 'gemini',
        model,
        latencyMs: 0,
        code: 'MISSING_CREDENTIALS',
        status: 'NOT_CONFIGURED',
        error: 'GEMINI_API_KEY is not set in Variables.',
      };
    }

    const startedAt = Date.now();
    try {
      await generateOnce({
        apiKey: cfg.apiKey,
        model,
        systemInstruction: 'Respond with exactly one word: ping',
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        temperature: 0.1,
        maxOutputTokens: 16,
      });
      return {
        success: true,
        provider: 'gemini',
        model,
        latencyMs: Date.now() - startedAt,
        code: 'CONNECTED',
        status: 'CONNECTED',
      };
    } catch (err: any) {
      return {
        success: false,
        provider: 'gemini',
        model,
        latencyMs: Date.now() - startedAt,
        code: err?.code || 'UNAVAILABLE',
        status: (err?.code as ProviderHealthStatus) || 'UNAVAILABLE',
        error: err?.message || 'Gemini chat connection failed.',
      };
    }
  },

  async testVoiceConnection(customModel?: string): Promise<{
    success: boolean;
    provider: 'gemini';
    model: string;
    voiceId?: string;
    latencyMs: number;
    audioUrl?: string;
    code?: string;
    status: ProviderHealthStatus;
    error?: string;
    message?: string;
  }> {
    await initVariablesStorage();
    const model = resolveSavedVoiceModel(customModel);
    const cfg = LocalConfigManager.getGeminiConfig();

    if (!cfg.voiceApiKey && !cfg.apiKey) {
      return {
        success: false,
        provider: 'gemini',
        model,
        voiceId: 'Aoede (Aura)',
        latencyMs: 0,
        code: 'NOT_CONFIGURED',
        status: 'NOT_CONFIGURED',
        error: 'GEMINI_API_KEY is not set in Variables.',
      };
    }

    const startedAt = Date.now();
    try {
      const synth = await this.synthesizeSpeechBlob({
        text: 'JEXA voice system online.',
        voiceId: resolveSavedVoiceName(),
        provider: 'gemini',
        model,
      });
      const audioUrl = URL.createObjectURL(synth.blob);
      return {
        success: true,
        provider: 'gemini',
        model,
        voiceId: 'Aoede (Aura)',
        latencyMs: Date.now() - startedAt,
        audioUrl,
        code: 'CONNECTED',
        status: 'CONNECTED',
        message: 'Voice generated successfully',
      };
    } catch (err: any) {
      return {
        success: false,
        provider: 'gemini',
        model,
        voiceId: 'Aoede (Aura)',
        latencyMs: Date.now() - startedAt,
        code: err?.code || 'UNAVAILABLE',
        status: (err?.code as ProviderHealthStatus) || 'UNAVAILABLE',
        error: err?.message || 'Gemini Voice test failed.',
      };
    }
  },
};
