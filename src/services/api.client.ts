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

import { isNative } from '../utils/platform';

// =========================================================================
// Centralized API Configuration for Native Android, GitHub Pages & Render
// =========================================================================
const DEFAULT_PROD_RENDER_URL = 'https://jexa-ai.onrender.com';
const isGitHubPages =
  typeof window !== 'undefined' && window.location.hostname.includes('github.io');

const configuredBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
const resolvedBackendOrigin =
  configuredBase || (isNative() || isGitHubPages ? DEFAULT_PROD_RENDER_URL : '');

export const API_BASE = resolvedBackendOrigin
  ? `${resolvedBackendOrigin.replace(/\/+$/, '')}/api`
  : '/api';

type ReachabilityListener = (unreachable: boolean) => void;
const reachabilityListeners = new Set<ReachabilityListener>();
let isServerUnreachable = false;

export function reportServerUnreachable(): void {
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
  listener(isServerUnreachable);
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

    console.warn(`[ApiClient] Network failure requesting ${url}:`, netErr);
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

export const ApiClient = {
  // Chat
  async sendMessage(payload: SendMessagePayload): Promise<ChatResponsePayload> {
    const cleanPayload: SendMessagePayload = {
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
      stream: false,
      isVoiceMode: Boolean(payload?.isVoiceMode),
      userContext: payload?.userContext,
    };
    return fetchJson<ChatResponsePayload>(`${API_BASE}/chat`, {
      method: 'POST',
      body: JSON.stringify(cleanPayload),
    });
  },

  // Streaming Chat with Server-Sent Events (SSE) and Real-Time Dynamic Status
  async sendMessageStream(
    payload: SendMessagePayload,
    options?: SendMessageStreamOptions
  ): Promise<ChatResponsePayload> {
    const cleanPayload: SendMessagePayload = {
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
      stream: true,
      isVoiceMode: Boolean(payload?.isVoiceMode),
      userContext: payload?.userContext,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
    };

    try {
      const response = await fetchWithTimeout(
        `${API_BASE}/chat`,
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
        options?.onError?.(err);
        throw err;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let finalResult: ChatResponsePayload | null = null;

        try {
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
        } catch (streamErr: any) {
          throw streamErr;
        }

        if (finalResult) {
          return finalResult;
        }
        throw new Error('Stream ended without receiving final payload.');
      }

      // Fallback: If server responded with application/json
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
      options?.onError?.(normalizedErr);
      throw normalizedErr;
    }
  },

  async generateConversationTitle(userMessage: string, assistantMessage?: string): Promise<string> {
    const res = await fetchJson<{ title: string }>(`${API_BASE}/chat/title`, {
      method: 'POST',
      body: JSON.stringify({ userMessage, assistantMessage }),
    });
    return (res?.title || '').trim();
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

    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${API_BASE}/voice`,
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
      throw new ApiError(errorMsg, res.status, body?.code, body?.provider);
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

  // Voice Synthesis (Gemini TTS — handles binary audio Blob and JSON data URLs safely)
  async requestVoiceSynthesis(payload: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    const cleanPayload: VoiceSynthesisRequest = {
      text: typeof payload?.text === 'string' ? payload.text : '',
      voiceId: payload?.voiceId,
      provider: 'gemini',
      model: typeof payload?.model === 'string' ? payload.model : undefined,
      speed: payload?.speed,
      pitch: payload?.pitch,
    };

    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${API_BASE}/voice`,
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
      throw new ApiError(errorMsg, res.status, body?.code, body?.provider);
    }
    return (body.data !== undefined ? body.data : body) as VoiceSynthesisResponse;
  },

  async synthesizeBinaryAudio(payload: VoiceSynthesisRequest): Promise<Blob> {
    const cleanPayload: VoiceSynthesisRequest = {
      text: typeof payload?.text === 'string' ? payload.text : '',
      voiceId: payload?.voiceId,
      provider: 'gemini',
      model: typeof payload?.model === 'string' ? payload.model : undefined,
      speed: payload?.speed,
      pitch: payload?.pitch,
    };

    const res = await fetchWithTimeout(`${API_BASE}/voice/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/wav, audio/*',
      },
      body: JSON.stringify(cleanPayload),
    });

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || contentType.includes('application/json')) {
      try {
        const errJson = await res.json();
        throw new ApiError(errJson.message || errJson.error || 'Voice synthesis failed', res.status, errJson.code, errJson.provider);
      } catch (e: any) {
        if (e instanceof ApiError) throw e;
        throw new ApiError(`Voice provider returned error HTTP ${res.status}`, res.status);
      }
    }

    return await res.blob();
  },

  async getVoiceHealth(): Promise<VoiceHealthResponse> {
    return fetchJson<VoiceHealthResponse>(`${API_BASE}/voice/health`);
  },

  // Brain Profile & Providers
  async getBrainProfile(): Promise<{ profile: BrainProfile; providerStatus: ProviderStatus }> {
    return fetchJson<{ profile: BrainProfile; providerStatus: ProviderStatus }>(`${API_BASE}/ai/brain-profile`);
  },

  async updateBrainProfile(updates: Partial<BrainProfile>): Promise<BrainProfile> {
    return fetchJson<BrainProfile>(`${API_BASE}/ai/brain-profile`, {
      method: 'POST',
      body: JSON.stringify(updates),
    });
  },

  // Provider Status & Testing (Gemini Only)
  async getProviderStatus(): Promise<ProviderStatusSummary> {
    return fetchJson<ProviderStatusSummary>(`${API_BASE}/providers/status`);
  },

  async testTextProvider(provider: TextProviderType = 'gemini', model?: string): Promise<ProviderTestResult> {
    return fetchJson<ProviderTestResult>(`${API_BASE}/providers/test-text`, {
      method: 'POST',
      body: JSON.stringify({ provider, model }),
    });
  },

  async selectProviders(selection: {
    textProvider?: TextProviderType;
    voiceProvider?: VoiceProviderType;
    textModel?: string;
    backupModel?: string;
    voiceModel?: string;
    theme?: string;
  }): Promise<{ success: boolean; data: any }> {
    return fetchJson<{ success: boolean; data: any }>(`${API_BASE}/providers/select`, {
      method: 'POST',
      body: JSON.stringify(selection),
    });
  },

  async testVoiceProvider(provider: VoiceProviderType = 'gemini', text?: string, model?: string): Promise<ProviderTestResult> {
    try {
      return await fetchJson<ProviderTestResult>(`${API_BASE}/voice/test`, {
        method: 'POST',
        body: JSON.stringify({ provider, text, model }),
      });
    } catch {
      return await fetchJson<ProviderTestResult>(`${API_BASE}/providers/test-voice`, {
        method: 'POST',
        body: JSON.stringify({ provider, model }),
      });
    }
  },

  // Health
  async getHealth(): Promise<HealthCheckResponse> {
    return fetchJson<HealthCheckResponse>(`${API_BASE}/health`, undefined, false);
  },

  async checkServerReachability(): Promise<boolean> {
    try {
      await fetchJson<HealthCheckResponse>(`${API_BASE}/health`, undefined, false);
      reportServerReachable();
      return true;
    } catch {
      reportServerUnreachable();
      return false;
    }
  },

  // Usage Tracker & Tools
  async getUsageSummary(): Promise<any> {
    return fetchJson<any>(`${API_BASE}/usage/summary`);
  },

  async getToolsStatus(): Promise<{ tools: any[] }> {
    return fetchJson<{ tools: any[] }>(`${API_BASE}/tools/status`);
  },

  async toggleTool(toolName: string, enabled?: boolean): Promise<{ success: boolean; toolName: string; enabled: boolean }> {
    return fetchJson<{ success: boolean; toolName: string; enabled: boolean }>(`${API_BASE}/tools/toggle`, {
      method: 'POST',
      body: JSON.stringify({ toolName, enabled }),
    });
  },

  async testTool(toolName: string): Promise<ToolTestResult> {
    let response: Response;
    try {
      response = await fetchWithTimeout(`${API_BASE}/tools/test`, {
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

  // Authentication & Owner Session Management
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
    return fetchJson(`${API_BASE}/auth/login`, {
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
    return fetchJson(`${API_BASE}/auth/refresh`, {
      method: 'POST',
    }, false);
  },

  async logoutSession(): Promise<{ loggedOut: boolean }> {
    return fetchJson(`${API_BASE}/auth/logout`, {
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
    return fetchJson(`${API_BASE}/auth/session`, undefined, false);
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
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (eventType) params.set('eventType', eventType);
    return fetchJson(`${API_BASE}/security/audit-logs?${params.toString()}`, undefined, false);
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
    return fetchJson(`${API_BASE}/security/status`, undefined, false);
  },
};
