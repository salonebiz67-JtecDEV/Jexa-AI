import {
  SendMessagePayload,
  ChatResponsePayload,
  BrainProfile,
  ProviderStatus,
  VoiceSynthesisRequest,
  VoiceSynthesisResponse,
  HealthCheckResponse,
  TextProviderType,
  VoiceProviderType,
  VoiceHealthResponse,
  ProviderHealthStatus,
  AIActivityStatus,
  StreamChatEvent,
  WebSearchResultItem,
} from '../../shared/types';
import { LocalConfigManager } from '../../shared/config/local-config';
import { LocalGeminiError, LocalGeminiService } from './localGemini.service';
import { isNative } from '../utils/platform';

// =========================================================================
// Dynamic Backend Origin Resolution (Render Disconnected by Default)
// =========================================================================
const isGitHubPages =
  typeof window !== 'undefined' && window.location.hostname.includes('github.io');

const BUILD_TIME_API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim();

function normalizeOrigin(raw: string | undefined): string {
  const trimmed = (raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
    }
  } catch {
    // Ignore invalid backend URL strings
  }
  return '';
}

export function getBackendOrigin(): string {
  const variableBackend =
    LocalConfigManager.get('BACKEND_URL') || LocalConfigManager.get('API_BASE_URL');
  return normalizeOrigin(variableBackend) || normalizeOrigin(BUILD_TIME_API_BASE);
}

export function hasConfiguredBackend(): boolean {
  if (getBackendOrigin()) {
    return true;
  }
  // Same-origin /api is only valid when served directly from a local/hosted Express server,
  // never inside Capacitor native WebView or static GitHub Pages.
  if (isNative() || isGitHubPages) {
    return false;
  }
  if (typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)) {
    return true;
  }
  return false;
}

export function getApiBase(): string {
  const origin = getBackendOrigin();
  return origin ? `${origin}/api` : '/api';
}

// Preserved static export for legacy callers; prefer getApiBase() for live variable updates
export const API_BASE = getApiBase();

type ReachabilityListener = (unreachable: boolean) => void;
const reachabilityListeners = new Set<ReachabilityListener>();
let isServerUnreachable = false;

export function reportServerUnreachable(): void {
  if (!hasConfiguredBackend()) {
    if (isServerUnreachable) {
      isServerUnreachable = false;
      reachabilityListeners.forEach((fn) => fn(false));
    }
    return;
  }
  if (!isServerUnreachable) {
    isServerUnreachable = true;
    reachabilityListeners.forEach((fn) => fn(true));
  }
}

export function reportServerReachable(): void {
  if (isServerUnreachable) {
    isServerUnreachable = false;
    reachabilityListeners.forEach((fn) => fn(false));
  }
}

export function subscribeServerReachability(listener: ReachabilityListener): () => void {
  reachabilityListeners.add(listener);
  listener(hasConfiguredBackend() ? isServerUnreachable : false);
  return () => {
    reachabilityListeners.delete(listener);
  };
}

export interface ProviderTestResult {
  success: boolean;
  provider: string;
  model?: string;
  voiceId?: string;
  latencyMs?: number;
  message?: string;
  code?: string;
  status?: ProviderHealthStatus;
  error?: string;
  audioUrl?: string;
}

export interface ToolTestResult {
  success: boolean;
  toolName: string;
  durationMs: number;
  message: string;
  error?: string;
  preview?: string;
}

export interface ProviderStatusSummary {
  text: {
    provider: string;
    model: string;
    backupModel?: string;
    configured: boolean;
    status?: ProviderHealthStatus;
    error?: string;
  };
  voice: {
    provider: string;
    model: string;
    configured: boolean;
    voiceId?: string;
    status?: ProviderHealthStatus;
    error?: string;
    lastSuccessfulTest?: {
      timestamp: string;
      latencyMs: number;
    };
  };
  availableText?: Array<{
    type: string;
    name: string;
    isConfigured: boolean;
    model: string;
    description?: string;
    status: ProviderHealthStatus;
    error?: string;
  }>;
  availableVoice?: Array<{
    type: string;
    name: string;
    isConfigured: boolean;
    model: string;
    voiceId?: string;
    description?: string;
    status: ProviderHealthStatus;
    error?: string;
    lastSuccessfulTest?: {
      timestamp: string;
      latencyMs: number;
    };
  }>;
}

export class ApiError extends Error {
  public status: number;
  public code?: string;
  public provider?: string;

  constructor(message: string, status: number, code?: string, provider?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.provider = provider;
  }
}

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof LocalGeminiError) {
    const apiErr = new ApiError(err.message, err.status, err.code, err.provider);
    (apiErr as any).model = err.model;
    (apiErr as any).fallbackUsed = err.fallbackUsed;
    return apiErr;
  }
  const anyErr = err as any;
  const apiErr = new ApiError(
    anyErr?.message || 'Request failed.',
    typeof anyErr?.status === 'number' ? anyErr.status : 500,
    anyErr?.code,
    anyErr?.provider
  );
  if (anyErr?.model) (apiErr as any).model = anyErr.model;
  if (anyErr?.fallbackUsed !== undefined) (apiErr as any).fallbackUsed = anyErr.fallbackUsed;
  return apiErr;
}

function hasLocalGeminiKey(): boolean {
  return Boolean(LocalConfigManager.getGeminiConfig().apiKey);
}

function shouldFallbackToLocalGemini(err: any): boolean {
  if (!hasLocalGeminiKey()) return false;
  return (
    err?.code === 'MISSING_CREDENTIALS' ||
    err?.code === 'NOT_CONFIGURED' ||
    err?.code === 'NETWORK_FAILURE' ||
    err?.code === 'REQUEST_TIMEOUT'
  );
}

function requireBackendConfigured(featureLabel: string): string {
  if (!hasConfiguredBackend()) {
    throw new ApiError(
      `${featureLabel} requires a connected backend server. Configure BACKEND_URL in Variables or VITE_API_BASE_URL.`,
      503,
      'BACKEND_REQUIRED'
    );
  }
  return getApiBase();
}

type AccessTokenProvider = () => Promise<string | null> | string | null;
let accessTokenProvider: AccessTokenProvider | null = null;

export function setAccessTokenProvider(provider: AccessTokenProvider | null): void {
  accessTokenProvider = provider;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!accessTokenProvider) return {};
  try {
    const token = await accessTokenProvider();
    if (typeof token === 'string' && token.trim()) {
      return { Authorization: `Bearer ${token.trim()}` };
    }
  } catch {
    // Ignore token provider lookup failures
  }
  return {};
}

async function fetchWithTimeout(url: string, options?: RequestInit, timeoutMs = 25000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const authHeaders = await getAuthHeaders();

  try {
    const res = await fetch(url, {
      ...options,
      credentials: options?.credentials || 'include',
      headers: {
        ...authHeaders,
        ...(options?.headers || {}),
      },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(url: string, options?: RequestInit, allowRetry = true): Promise<T> {
  let response: Response;

  try {
    response = await fetchWithTimeout(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });
  } catch (netErr: any) {
    if (netErr?.name === 'AbortError') {
      reportServerUnreachable();
      throw new ApiError('Cannot reach server (request timed out).', 408, 'REQUEST_TIMEOUT');
    }

    if (allowRetry && (!options?.method || options.method === 'GET')) {
      try {
        await new Promise((r) => setTimeout(r, 600));
        return await fetchJson<T>(url, options, false);
      } catch {
        // Fall through to standard error
      }
    }

    console.warn(`[ApiClient] Network failure requesting ${url}:`, netErr?.message || 'network error');
    reportServerUnreachable();
    throw new ApiError(
      'Cannot reach server. Please check your connection and try again.',
      0,
      'NETWORK_FAILURE'
    );
  }

  let body: any;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(
      `Server returned an unparseable response (${response.status} ${response.statusText}).`,
      response.status,
      'INVALID_RESPONSE'
    );
  }

  reportServerReachable();

  if (!response.ok || body.success === false) {
    if (
      response.status === 401 &&
      typeof window !== 'undefined' &&
      !url.includes('/auth/login') &&
      !url.includes('/auth/refresh') &&
      (body?.code === 'AUTH_REQUIRED' ||
        body?.code === 'INVALID_TOKEN' ||
        body?.code === 'SESSION_EXPIRED' ||
        !body?.code)
    ) {
      window.dispatchEvent(new CustomEvent('jexa:auth-expired'));
    }
    const errorMsg = body?.error || body?.message || `HTTP ${response.status}: ${response.statusText}`;
    throw new ApiError(errorMsg, response.status, body?.code, body?.provider);
  }

  return (body.data !== undefined ? body.data : (body as unknown as T)) as T;
}

export interface SendMessageStreamOptions {
  onStatusUpdate?: (
    status: AIActivityStatus,
    details?: {
      query?: string;
      sourcesCount?: number;
      error?: string;
      sources?: WebSearchResultItem[];
      searchStatus?: 'success' | 'failed' | 'missing_key' | 'unneeded' | 'no_results';
      searchTrigger?: 'manual' | 'automatic' | 'none';
      provider?: string;
      model?: string;
      fallbackUsed?: boolean;
    }
  ) => void;
  onChunk?: (chunk: string) => void;
  onComplete?: (response: ChatResponsePayload) => void;
  onError?: (error: Error) => void;
}

function buildCleanMessagePayload(payload: SendMessagePayload, stream: boolean): SendMessagePayload {
  return {
    message: typeof payload?.message === 'string' ? payload.message : '',
    conversationId: typeof payload?.conversationId === 'string' ? payload.conversationId : undefined,
    personaId: typeof payload?.personaId === 'string' ? payload.personaId : undefined,
    textProvider: payload?.textProvider,
    textModel: typeof payload?.textModel === 'string' ? payload.textModel : undefined,
    backupModel: typeof payload?.backupModel === 'string' ? payload.backupModel : undefined,
    history: Array.isArray(payload?.history) ? payload.history.slice(-8) : undefined,
    aboutMe: typeof payload?.aboutMe === 'string' ? payload.aboutMe.slice(0, 1500) : undefined,
    behaviorInstructions:
      typeof payload?.behaviorInstructions === 'string'
        ? payload.behaviorInstructions.slice(0, 1500)
        : undefined,
    stream,
    isVoiceMode: Boolean(payload?.isVoiceMode),
    userContext: payload?.userContext,
  };
}

export const ApiClient = {
  // Chat
  async sendMessage(payload: SendMessagePayload): Promise<ChatResponsePayload> {
    const cleanPayload = buildCleanMessagePayload(payload, false);

    if (!hasConfiguredBackend()) {
      try {
        return await LocalGeminiService.sendMessage(cleanPayload);
      } catch (err) {
        throw toApiError(err);
      }
    }

    try {
      return await fetchJson<ChatResponsePayload>(`${getApiBase()}/chat`, {
        method: 'POST',
        body: JSON.stringify(cleanPayload),
      });
    } catch (err: any) {
      if (shouldFallbackToLocalGemini(err)) {
        try {
          reportServerReachable();
          return await LocalGeminiService.sendMessage(cleanPayload);
        } catch (localErr) {
          throw toApiError(localErr);
        }
      }
      throw err;
    }
  },

  // Streaming Chat with Server-Sent Events (SSE) or Direct On-Device Gemini Stream
  async sendMessageStream(
    payload: SendMessagePayload,
    options?: SendMessageStreamOptions
  ): Promise<ChatResponsePayload> {
    const cleanPayload = buildCleanMessagePayload(payload, true);

    const runLocalStream = async (): Promise<ChatResponsePayload> => {
      try {
        return await LocalGeminiService.sendMessageStream(cleanPayload, {
          onStatusUpdate: (status, details) => {
            options?.onStatusUpdate?.(status as AIActivityStatus, details);
          },
          onChunk: options?.onChunk,
          onComplete: options?.onComplete,
        });
      } catch (err) {
        const apiErr = toApiError(err);
        options?.onError?.(apiErr);
        throw apiErr;
      }
    };

    if (!hasConfiguredBackend()) {
      return runLocalStream();
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
    };

    let emittedChunks = false;

    try {
      const response = await fetchWithTimeout(
        `${getApiBase()}/chat`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(cleanPayload),
        },
        75000
      );

      reportServerReachable();

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
        let errorCode: string | undefined;
        let errorProvider: string | undefined;
        let errorModel: string | undefined;
        try {
          const body = await response.json();
          errorMsg = body?.error || body?.message || errorMsg;
          errorCode = body?.code;
          errorProvider = body?.provider;
          errorModel = body?.model;
        } catch {
          // ignore
        }
        const err = new ApiError(errorMsg, response.status, errorCode, errorProvider);
        (err as any).model = errorModel;
        if (shouldFallbackToLocalGemini(err)) {
          return await runLocalStream();
        }
        options?.onError?.(err);
        throw err;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let finalResult: ChatResponsePayload | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (!dataStr) continue;

            let event: StreamChatEvent;
            try {
              event = JSON.parse(dataStr);
            } catch (parseErr) {
              console.warn('[ApiClient] Failed to parse SSE event chunk:', dataStr, parseErr);
              continue;
            }

            if (event.type === 'status') {
              options?.onStatusUpdate?.(event.status, event.details);
            } else if (event.type === 'chunk') {
              emittedChunks = true;
              options?.onChunk?.(event.chunk);
            } else if (event.type === 'complete') {
              finalResult = event.data;
              options?.onComplete?.(event.data);
            } else if (event.type === 'error') {
              const err = new ApiError(event.error || 'Server error during chat stream.', 500, event.code, event.provider);
              (err as any).model = event.model;
              (err as any).fallbackUsed = event.fallbackUsed;
              throw err;
            }
          }
        }

        if (finalResult) {
          return finalResult;
        }
        throw new Error('Stream ended without receiving final payload.');
      }

      const body = await response.json();
      if (body.success === false) {
        const errorMsg = body?.error || body?.message || 'Chat request failed';
        const err = new ApiError(errorMsg, response.status, body?.code, body?.provider || body?.details?.provider);
        (err as any).model = body?.model || body?.details?.model;
        (err as any).fallbackUsed = body?.fallbackUsed || body?.details?.fallbackUsed;
        throw err;
      }
      const result: ChatResponsePayload = body.data !== undefined ? body.data : body;
      options?.onStatusUpdate?.('Answer complete');
      options?.onComplete?.(result);
      return result;
    } catch (err: any) {
      let normalizedErr = err;
      if (!(err instanceof ApiError)) {
        if (err?.name === 'AbortError') {
          reportServerUnreachable();
          normalizedErr = new ApiError('Cannot reach server (request timed out).', 408, 'REQUEST_TIMEOUT');
        } else if (err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(err?.message || '')) {
          reportServerUnreachable();
          normalizedErr = new ApiError(
            'Cannot reach server. Please check your connection and try again.',
            0,
            'NETWORK_FAILURE'
          );
        }
      } else if (err.status === 0 || err.code === 'NETWORK_FAILURE') {
        reportServerUnreachable();
      }

      if (!emittedChunks && shouldFallbackToLocalGemini(normalizedErr)) {
        reportServerReachable();
        return await runLocalStream();
      }

      options?.onError?.(normalizedErr);
      throw normalizedErr;
    }
  },

  async generateConversationTitle(userMessage: string, assistantMessage?: string): Promise<string> {
    if (!hasConfiguredBackend()) {
      return LocalGeminiService.generateConversationTitle(userMessage, assistantMessage);
    }

    try {
      const res = await fetchJson<{ title: string }>(`${getApiBase()}/chat/title`, {
        method: 'POST',
        body: JSON.stringify({ userMessage, assistantMessage }),
      });
      return (res?.title || '').trim();
    } catch (err) {
      if (shouldFallbackToLocalGemini(err)) {
        return LocalGeminiService.generateConversationTitle(userMessage, assistantMessage);
      }
      return '';
    }
  },

  async synthesizeVoiceBlob(payload: VoiceSynthesisRequest): Promise<{
    blob: Blob;
    mimeType: string;
    model?: string;
    provider?: string;
  }> {
    const cleanPayload: VoiceSynthesisRequest = {
      text: typeof payload?.text === 'string' ? payload.text : '',
      voiceId: payload?.voiceId,
      provider: 'gemini',
      model: typeof payload?.model === 'string' ? payload.model : undefined,
      speed: payload?.speed,
      pitch: payload?.pitch,
    };

    if (!hasConfiguredBackend()) {
      try {
        return await LocalGeminiService.synthesizeSpeechBlob(cleanPayload);
      } catch (err) {
        throw toApiError(err);
      }
    }

    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${getApiBase()}/voice`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'audio/*, application/json',
          },
          body: JSON.stringify(cleanPayload),
        },
        25000
      );
    } catch (err: any) {
      if (hasLocalGeminiKey()) {
        reportServerReachable();
        return await LocalGeminiService.synthesizeSpeechBlob(cleanPayload);
      }
      if (err.name === 'AbortError') {
        throw new ApiError('Voice synthesis timed out after 25 seconds.', 504, 'VOICE_TIMEOUT');
      }
      if (err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(err?.message || '')) {
        reportServerUnreachable();
        throw new ApiError('Cannot reach server. Please check your connection and try again.', 0, 'NETWORK_FAILURE');
      }
      throw err;
    }
    reportServerReachable();

    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('audio/') || contentType.includes('application/octet-stream')) {
      if (!res.ok) {
        throw new ApiError(`Voice provider failed with status ${res.status}.`, res.status);
      }
      const blob = await res.blob();
      return {
        blob,
        mimeType: contentType.split(';')[0] || blob.type || 'audio/wav',
        model: cleanPayload.model,
        provider: 'gemini',
      };
    }

    const body: any = await res.json();
    if (!res.ok || body.success === false) {
      const errorMsg = body?.message || body?.error || `Voice synthesis failed (${res.status})`;
      const apiErr = new ApiError(errorMsg, res.status, body?.code, body?.provider);
      if (shouldFallbackToLocalGemini(apiErr) || (body?.code === 'NOT_CONFIGURED' && hasLocalGeminiKey())) {
        return await LocalGeminiService.synthesizeSpeechBlob(cleanPayload);
      }
      throw apiErr;
    }

    const data = (body.data !== undefined ? body.data : body) as VoiceSynthesisResponse;
    if (!data?.audioUrl) {
      throw new ApiError(data?.message || 'Voice provider returned no audio.', 502, undefined, 'gemini');
    }

    const audioResp = await fetch(data.audioUrl);
    const blob = await audioResp.blob();
    return {
      blob,
      mimeType: data.contentType || data.format || blob.type || 'audio/wav',
      model: data.model || cleanPayload.model,
      provider: data.provider || 'gemini',
    };
  },

  // Voice Synthesis (Gemini TTS — handles binary audio Blob, JSON data URLs, and direct on-device mode)
  async requestVoiceSynthesis(payload: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    const cleanPayload: VoiceSynthesisRequest = {
      text: typeof payload?.text === 'string' ? payload.text : '',
      voiceId: payload?.voiceId,
      provider: 'gemini',
      model: typeof payload?.model === 'string' ? payload.model : undefined,
      speed: payload?.speed,
      pitch: payload?.pitch,
    };

    if (!hasConfiguredBackend()) {
      try {
        const synth = await LocalGeminiService.synthesizeSpeechBlob(cleanPayload);
        const objectUrl = URL.createObjectURL(synth.blob);
        return {
          audioUrl: objectUrl,
          format: 'audio/wav',
          isSimulated: false,
          message: 'Voice synthesized on device.',
          provider: 'gemini',
          model: synth.model,
        };
      } catch (err) {
        throw toApiError(err);
      }
    }

    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${getApiBase()}/voice`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'audio/*, application/json',
          },
          body: JSON.stringify(cleanPayload),
        },
        25000
      );
    } catch (err: any) {
      if (hasLocalGeminiKey()) {
        const synth = await LocalGeminiService.synthesizeSpeechBlob(cleanPayload);
        return {
          audioUrl: URL.createObjectURL(synth.blob),
          format: 'audio/wav',
          isSimulated: false,
          message: 'Voice synthesized on device.',
          provider: 'gemini',
          model: synth.model,
        };
      }
      if (err.name === 'AbortError') {
        throw new ApiError('Voice synthesis timed out after 25 seconds.', 504, 'VOICE_TIMEOUT');
      }
      throw err;
    }

    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('audio/') || contentType.includes('application/octet-stream')) {
      if (!res.ok) {
        throw new ApiError(`Voice provider failed with status ${res.status}.`, res.status);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      return {
        audioUrl: objectUrl,
        format: 'audio/wav',
        isSimulated: false,
        message: 'Voice synthesized successfully.',
        provider: 'gemini',
        model: cleanPayload.model,
      };
    }

    const body: any = await res.json();
    if (!res.ok || body.success === false) {
      const errorMsg = body?.message || body?.error || `Voice synthesis failed (${res.status})`;
      const apiErr = new ApiError(errorMsg, res.status, body?.code, body?.provider);
      if (shouldFallbackToLocalGemini(apiErr) || (body?.code === 'NOT_CONFIGURED' && hasLocalGeminiKey())) {
        const synth = await LocalGeminiService.synthesizeSpeechBlob(cleanPayload);
        return {
          audioUrl: URL.createObjectURL(synth.blob),
          format: 'audio/wav',
          isSimulated: false,
          message: 'Voice synthesized on device.',
          provider: 'gemini',
          model: synth.model,
        };
      }
      throw apiErr;
    }
    return (body.data !== undefined ? body.data : body) as VoiceSynthesisResponse;
  },

  async synthesizeBinaryAudio(payload: VoiceSynthesisRequest): Promise<Blob> {
    const synth = await this.synthesizeVoiceBlob(payload);
    return synth.blob;
  },

  async getVoiceHealth(): Promise<VoiceHealthResponse> {
    if (!hasConfiguredBackend()) {
      const status = LocalGeminiService.getLocalProviderStatus();
      return {
        gemini: {
          configured: status.voiceProvider.isConfigured,
          provider: 'gemini',
          model: status.voiceProvider.model,
        },
      };
    }
    return fetchJson<VoiceHealthResponse>(`${getApiBase()}/voice/health`);
  },

  // Brain Profile & Providers
  async getBrainProfile(): Promise<{ profile: BrainProfile; providerStatus: ProviderStatus }> {
    if (!hasConfiguredBackend()) {
      return LocalGeminiService.getLocalBrainProfile();
    }
    try {
      const data = await fetchJson<{ profile: BrainProfile; providerStatus: ProviderStatus }>(
        `${getApiBase()}/ai/brain-profile`
      );
      // If server has no Gemini key configured but device has one in Variables, show configured locally
      if (!data.providerStatus?.textProvider?.isConfigured && hasLocalGeminiKey()) {
        const local = LocalGeminiService.getLocalProviderStatus();
        return {
          profile: data.profile,
          providerStatus: {
            ...data.providerStatus,
            textProvider: local.textProvider,
            voiceProvider: local.voiceProvider,
            availableTextProviders: local.availableTextProviders,
            availableVoiceProviders: local.availableVoiceProviders,
            isProductionReady: local.isProductionReady,
          },
        };
      }
      return data;
    } catch (err) {
      if (shouldFallbackToLocalGemini(err) || !hasConfiguredBackend()) {
        return LocalGeminiService.getLocalBrainProfile();
      }
      return LocalGeminiService.getLocalBrainProfile();
    }
  },

  async updateBrainProfile(updates: Partial<BrainProfile>): Promise<BrainProfile> {
    if (!hasConfiguredBackend()) {
      const { profile } = LocalGeminiService.getLocalBrainProfile();
      return { ...profile, ...updates };
    }
    try {
      return await fetchJson<BrainProfile>(`${getApiBase()}/ai/brain-profile`, {
        method: 'POST',
        body: JSON.stringify(updates),
      });
    } catch (err) {
      if (shouldFallbackToLocalGemini(err) || hasLocalGeminiKey()) {
        const { profile } = LocalGeminiService.getLocalBrainProfile();
        return { ...profile, ...updates };
      }
      throw err;
    }
  },

  // Provider Status & Testing (Gemini Only)
  async getProviderStatus(): Promise<ProviderStatusSummary> {
    const buildLocalSummary = (): ProviderStatusSummary => {
      const st = LocalGeminiService.getLocalProviderStatus();
      return {
        text: {
          provider: st.textProvider.type,
          model: st.textProvider.model,
          backupModel: st.textProvider.backupModel,
          configured: st.textProvider.isConfigured,
          status: st.textProvider.status,
          error: st.textProvider.lastError,
        },
        voice: {
          provider: st.voiceProvider.type,
          model: st.voiceProvider.model,
          configured: st.voiceProvider.isConfigured,
          voiceId: st.voiceProvider.voiceId,
          status: st.voiceProvider.status,
          error: st.voiceProvider.lastError,
        },
        availableText: st.availableTextProviders,
        availableVoice: st.availableVoiceProviders,
      };
    };

    if (!hasConfiguredBackend()) {
      return buildLocalSummary();
    }

    try {
      const data = await fetchJson<ProviderStatusSummary>(`${getApiBase()}/providers/status`);
      if (!data?.text?.configured && hasLocalGeminiKey()) {
        return buildLocalSummary();
      }
      return data;
    } catch (err) {
      if (shouldFallbackToLocalGemini(err) || hasLocalGeminiKey()) {
        return buildLocalSummary();
      }
      throw err;
    }
  },

  async testTextProvider(provider: TextProviderType = 'gemini', model?: string): Promise<ProviderTestResult> {
    if (!hasConfiguredBackend()) {
      return LocalGeminiService.testTextConnection(model);
    }
    try {
      return await fetchJson<ProviderTestResult>(`${getApiBase()}/providers/test-text`, {
        method: 'POST',
        body: JSON.stringify({ provider, model }),
      });
    } catch (err) {
      if (shouldFallbackToLocalGemini(err)) {
        return LocalGeminiService.testTextConnection(model);
      }
      throw err;
    }
  },

  async selectProviders(selection: {
    textProvider?: TextProviderType;
    voiceProvider?: VoiceProviderType;
    textModel?: string;
    backupModel?: string;
    voiceModel?: string;
    theme?: string;
  }): Promise<{ success: boolean; data: any }> {
    if (!hasConfiguredBackend()) {
      return { success: true, data: selection };
    }
    try {
      return await fetchJson<{ success: boolean; data: any }>(`${getApiBase()}/providers/select`, {
        method: 'POST',
        body: JSON.stringify(selection),
      });
    } catch (err) {
      if (shouldFallbackToLocalGemini(err)) {
        return { success: true, data: selection };
      }
      throw err;
    }
  },

  async testVoiceProvider(provider: VoiceProviderType = 'gemini', text?: string, model?: string): Promise<ProviderTestResult> {
    if (!hasConfiguredBackend()) {
      return LocalGeminiService.testVoiceConnection(model);
    }
    try {
      return await fetchJson<ProviderTestResult>(`${getApiBase()}/voice/test`, {
        method: 'POST',
        body: JSON.stringify({ provider, text, model }),
      });
    } catch (err) {
      if (shouldFallbackToLocalGemini(err)) {
        return LocalGeminiService.testVoiceConnection(model);
      }
      try {
        return await fetchJson<ProviderTestResult>(`${getApiBase()}/providers/test-voice`, {
          method: 'POST',
          body: JSON.stringify({ provider, model }),
        });
      } catch (err2) {
        if (shouldFallbackToLocalGemini(err2)) {
          return LocalGeminiService.testVoiceConnection(model);
        }
        throw err2;
      }
    }
  },

  // Health (no automatic ping when backend is disconnected)
  async getHealth(): Promise<HealthCheckResponse> {
    const base = requireBackendConfigured('Backend health check');
    return fetchJson<HealthCheckResponse>(`${base}/health`, undefined, false);
  },

  async checkServerReachability(): Promise<boolean> {
    if (!hasConfiguredBackend()) {
      reportServerReachable();
      return false;
    }
    try {
      await fetchJson<HealthCheckResponse>(`${getApiBase()}/health`, undefined, false);
      reportServerReachable();
      return true;
    } catch {
      reportServerUnreachable();
      return false;
    }
  },

  // Backend-only Usage Tracker, Tools & Security Admin Endpoints
  async getUsageSummary(): Promise<any> {
    const base = requireBackendConfigured('Usage telemetry');
    return fetchJson<any>(`${base}/usage/summary`);
  },

  async getToolsStatus(): Promise<{ tools: any[] }> {
    const base = requireBackendConfigured('Backend tools status');
    return fetchJson<{ tools: any[] }>(`${base}/tools/status`);
  },

  async toggleTool(toolName: string, enabled?: boolean): Promise<{ success: boolean; toolName: string; enabled: boolean }> {
    const base = requireBackendConfigured('Tool toggling');
    return fetchJson<{ success: boolean; toolName: string; enabled: boolean }>(`${base}/tools/toggle`, {
      method: 'POST',
      body: JSON.stringify({ toolName, enabled }),
    });
  },

  async testTool(toolName: string): Promise<ToolTestResult> {
    const base = requireBackendConfigured('Tool testing');
    let response: Response;
    try {
      response = await fetchWithTimeout(`${base}/tools/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName }),
      }, 20000);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new ApiError('Tool test timed out after 20 seconds.', 408, 'REQUEST_TIMEOUT');
      }
      throw new ApiError(
        err?.message || 'Unable to reach backend to run tool test.',
        0,
        'NETWORK_FAILURE'
      );
    }

    let body: any;
    try {
      body = await response.json();
    } catch {
      throw new ApiError(
        `Server returned an unparseable response (${response.status} ${response.statusText}).`,
        response.status,
        'INVALID_RESPONSE'
      );
    }

    if (!response.ok) {
      throw new ApiError(
        body?.error || body?.message || `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        body?.code
      );
    }

    return {
      success: Boolean(body?.success),
      toolName: body?.toolName || toolName,
      durationMs: typeof body?.durationMs === 'number' ? body.durationMs : 0,
      message: body?.message || body?.error || (body?.success ? 'Tool test passed.' : 'Tool test failed.'),
      error: body?.error,
      preview: body?.preview,
    };
  },

  // Authentication & Owner Session Management (Backend-dependent)
  async loginWithEmail(email: string, password: string): Promise<{
    authenticated: boolean;
    accessToken: string;
    expiresAtMs: number;
    expiresIn: number;
    user: { id: string; email?: string; role: string; isOwner: boolean; emailConfirmed?: boolean };
    setup: {
      authConfigured: boolean;
      hasOwnerConfigured: boolean;
      ownerUserIdConfigured: boolean;
      ownerEmailConfigured: boolean;
      serviceRoleConfigured: boolean;
      requireAuthForChat: boolean;
    };
  }> {
    const base = requireBackendConfigured('Owner authentication');
    return fetchJson(`${base}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, false);
  },

  async refreshAuthSession(): Promise<{
    authenticated: boolean;
    accessToken: string;
    expiresAtMs: number;
    expiresIn: number;
    user: { id: string; email?: string; role: string; isOwner: boolean; emailConfirmed?: boolean };
    setup: {
      authConfigured: boolean;
      hasOwnerConfigured: boolean;
      ownerUserIdConfigured: boolean;
      ownerEmailConfigured: boolean;
      serviceRoleConfigured: boolean;
      requireAuthForChat: boolean;
    };
  }> {
    const base = requireBackendConfigured('Session refresh');
    return fetchJson(`${base}/auth/refresh`, {
      method: 'POST',
    }, false);
  },

  async logoutSession(): Promise<{ loggedOut: boolean }> {
    if (!hasConfiguredBackend()) {
      return { loggedOut: true };
    }
    return fetchJson(`${getApiBase()}/auth/logout`, {
      method: 'POST',
    }, false);
  },

  async getAuthSession(): Promise<{
    authenticated: boolean;
    expiresAtMs?: number;
    user: { id: string; email?: string; role: string; isOwner: boolean } | null;
    setup: {
      authConfigured: boolean;
      hasOwnerConfigured: boolean;
      ownerUserIdConfigured: boolean;
      ownerEmailConfigured: boolean;
      serviceRoleConfigured: boolean;
      requireAuthForChat: boolean;
    };
  }> {
    if (!hasConfiguredBackend()) {
      return {
        authenticated: false,
        user: null,
        setup: {
          authConfigured: false,
          hasOwnerConfigured: false,
          ownerUserIdConfigured: false,
          ownerEmailConfigured: false,
          serviceRoleConfigured: false,
          requireAuthForChat: false,
        },
      };
    }
    return fetchJson(`${getApiBase()}/auth/session`, undefined, false);
  },

  async getSecurityAuditLogs(limit = 100, eventType?: string): Promise<{
    totalRecorded: number;
    durability?: {
      mode: 'supabase_durable' | 'in_memory_only';
      durableConfigured: boolean;
      tableName: string;
      persistedCount: number;
      persistenceErrorCount: number;
      lastPersistenceError?: string;
      lastPersistenceSuccessAt?: string;
      bufferedInMemory: number;
      maxMemoryEntries: number;
    };
    countsLast24h: {
      ownerLogins: number;
      failedAuthAttempts: number;
      unauthorizedAdminAttempts: number;
      configChanges: number;
    };
    events: Array<{
      id: string;
      timestamp: string;
      timestampMs: number;
      eventType: string;
      severity: 'info' | 'warning' | 'critical';
      actorUserId?: string;
      actorEmail?: string;
      actorRole?: string;
      ip?: string;
      method?: string;
      path?: string;
      statusCode?: number;
      summary: string;
      details?: Record<string, any>;
    }>;
  }> {
    const base = requireBackendConfigured('Security audit logs');
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (eventType) params.set('eventType', eventType);
    return fetchJson(`${base}/security/audit-logs?${params.toString()}`, undefined, false);
  },

  async getSecurityStatus(): Promise<{
    setup: {
      authConfigured: boolean;
      hasOwnerConfigured: boolean;
      ownerUserIdConfigured: boolean;
      ownerEmailConfigured: boolean;
      serviceRoleConfigured: boolean;
      requireAuthForChat: boolean;
    };
    gatewayActive: boolean;
    gatewayEnforced?: boolean;
    gateway?: {
      configured: boolean;
      active: boolean;
      enforced: boolean;
      reachable: boolean;
      latencyMs: number;
      error?: string;
      textProvider: string;
      model: string;
      backupModel: string;
    };
    providers?: {
      text: {
        type: string;
        status: string;
        configured: boolean;
        model: string;
        backupModel?: string;
      };
      voice: {
        type: string;
        status: string;
        configured: boolean;
        model: string;
      };
    };
    rateLimiting: {
      mode: string;
      upstashConfigured?: boolean;
      failClosedPolicy?: string;
      failClosedActiveForCritical?: boolean;
      activeMemoryBuckets?: number;
      maxMemoryKeys?: number;
      upstashErrorsCount?: number;
      fallbackCount?: number;
      failClosedRejectionsCount?: number;
      lastUpstashError?: string;
      upstashHealth?: {
        configured: boolean;
        reachable: boolean;
        latencyMs: number;
        error?: string;
      };
    };
    auditPersistence?: {
      mode: 'supabase_durable' | 'in_memory_only';
      durableConfigured: boolean;
      tableName: string;
      persistedCount: number;
      persistenceErrorCount: number;
      lastPersistenceError?: string;
      lastPersistenceSuccessAt?: string;
      bufferedInMemory: number;
      maxMemoryEntries: number;
    };
    auth?: {
      cacheTtlMs: number;
      cachedTokensCount: number;
      revokedTokensCount: number;
    };
    countsLast24h: {
      ownerLogins: number;
      failedAuthAttempts: number;
      unauthorizedAdminAttempts: number;
      configChanges: number;
    };
    recentGatewayErrors?: Array<{
      id: string;
      timestamp: string;
      timestampMs: number;
      model: string;
      statusCode?: number;
      code?: string;
      message: string;
    }>;
  }> {
    const base = requireBackendConfigured('Security status');
    return fetchJson(`${base}/security/status`, undefined, false);
  },
};
