import {
  ChatMessage,
  Conversation,
  SendMessagePayload,
  ChatResponsePayload,
  BrainProfile,
  MemoryItem,
  MemoryCreateInput,
  ProviderStatus,
  VoiceSynthesisRequest,
  VoiceSynthesisResponse,
  HealthCheckResponse,
  TextProviderType,
  VoiceProviderType,
  VoiceHealthResponse,
  ProviderHealthStatus,
  PersonalVoiceStatusResponse,
  PersonalVoiceReferenceMetadata,
  DatabaseHealthResponse,
  DatabaseDiagnosticsResult,
} from '../../shared/types';
import { safeStorage } from './storage';

let authenticatedUserId: string | null = null;
let authenticatedToken: string | null = null;

export function setAuthenticatedUser(userId: string | null, token?: string | null): void {
  authenticatedUserId = userId;
  authenticatedToken = token || null;
  if (userId) {
    safeStorage.setItem('jexa_persistent_user_id', userId);
  }
}

export function getClientUserId(): string {
  if (authenticatedUserId) {
    return authenticatedUserId;
  }
  const STORAGE_KEY = 'jexa_persistent_user_id';
  let uid = safeStorage.getItem(STORAGE_KEY);
  if (!uid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
    uid = '00000000-0000-0000-0000-000000000001';
    safeStorage.setItem(STORAGE_KEY, uid);
  }
  return uid;
}

// =========================================================================
// Centralized API Configuration for GitHub Pages & Render Deployment
// =========================================================================
// - In local dev / monolithic mode: defaults to '/api' (proxied by Vite/Express)
// - In GitHub Pages production: points to Render backend via VITE_API_BASE_URL
//   or falls back automatically to the official deployed production service
const DEFAULT_PROD_RENDER_URL = 'https://jexa-ai.onrender.com';
const isGitHubPages =
  typeof window !== 'undefined' && window.location.hostname.includes('github.io');

const configuredBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
const resolvedBackendOrigin =
  configuredBase || (isGitHubPages ? DEFAULT_PROD_RENDER_URL : '');

export const API_BASE = resolvedBackendOrigin
  ? `${resolvedBackendOrigin.replace(/\/+$/, '')}/api`
  : '/api';

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

export interface ProviderStatusSummary {
  text: {
    provider: string;
    model: string;
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

async function fetchWithTimeout(url: string, options?: RequestInit, timeoutMs = 25000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const uid = getClientUserId();
  const customHeaders: Record<string, string> = {
    'x-user-id': uid,
  };
  if (authenticatedToken) {
    customHeaders['Authorization'] = `Bearer ${authenticatedToken}`;
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...customHeaders,
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
    // If aborted due to timeout
    if (netErr?.name === 'AbortError') {
      throw new ApiError('Request timed out while waiting for server response.', 408, 'REQUEST_TIMEOUT');
    }

    // Single retry for transient network failure
    if (allowRetry && (!options?.method || options.method === 'GET')) {
      try {
        await new Promise((r) => setTimeout(r, 600));
        return await fetchJson<T>(url, options, false);
      } catch {
        // Fall through to standard error
      }
    }

    console.warn(`[ApiClient] Network failure requesting ${url}:`, netErr);
    throw new ApiError(
      `Unable to reach backend at ${url}. Please verify internet connectivity or backend status.`,
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

  if (!response.ok || body.success === false) {
    const errorMsg = body?.error || body?.message || `HTTP ${response.status}: ${response.statusText}`;
    throw new ApiError(errorMsg, response.status, body?.code, body?.provider);
  }

  return (body.data !== undefined ? body.data : (body as unknown as T)) as T;
}

export const ApiClient = {
  // Chat
  async sendMessage(payload: SendMessagePayload): Promise<ChatResponsePayload> {
    const cleanPayload: SendMessagePayload = {
      message: typeof payload?.message === 'string' ? payload.message : '',
      conversationId: typeof payload?.conversationId === 'string' ? payload.conversationId : undefined,
      personaId: typeof payload?.personaId === 'string' ? payload.personaId : undefined,
      textProvider: payload?.textProvider,
      stream: Boolean(payload?.stream),
      isVoiceMode: Boolean(payload?.isVoiceMode),
      userContext: payload?.userContext,
    };
    return fetchJson<ChatResponsePayload>(`${API_BASE}/chat`, {
      method: 'POST',
      body: JSON.stringify(cleanPayload),
    });
  },

  // Voice Synthesis (handles binary audio Blob and JSON data URLs safely)
  async requestVoiceSynthesis(payload: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    const cleanPayload: VoiceSynthesisRequest = {
      text: typeof payload?.text === 'string' ? payload.text : '',
      voiceId: payload?.voiceId,
      provider: payload?.provider,
      speed: payload?.speed,
      pitch: payload?.pitch,
    };

    const res = await fetchWithTimeout(`${API_BASE}/voice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/*, application/json',
      },
      body: JSON.stringify(cleanPayload),
    });

    const contentType = res.headers.get('content-type') || '';

    // Direct binary audio response (audio/mpeg, audio/wav, audio/pcm)
    if (contentType.includes('audio/') || contentType.includes('application/octet-stream')) {
      if (!res.ok) {
        throw new ApiError(`Voice provider failed with status ${res.status}.`, res.status);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      return {
        audioUrl: objectUrl,
        format: contentType.includes('mpeg') ? 'audio/mpeg' : 'audio/wav',
        isSimulated: false,
        message: 'Voice synthesized successfully.',
        provider: payload.provider,
      };
    }

    // JSON response (includes data URL or error)
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
      provider: payload?.provider,
      speed: payload?.speed,
      pitch: payload?.pitch,
    };

    const res = await fetchWithTimeout(`${API_BASE}/voice/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg, audio/wav, audio/*',
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

  // Conversations
  async getConversations(): Promise<Conversation[]> {
    return fetchJson<Conversation[]>(`${API_BASE}/conversations`);
  },

  async createConversation(title?: string, personaId?: string): Promise<Conversation> {
    const cleanTitle = typeof title === 'string' ? title : 'New Conversation';
    const cleanPersonaId = typeof personaId === 'string' ? personaId : undefined;
    return fetchJson<Conversation>(`${API_BASE}/conversations`, {
      method: 'POST',
      body: JSON.stringify({ title: cleanTitle, personaId: cleanPersonaId }),
    });
  },

  async getConversation(id: string): Promise<Conversation> {
    return fetchJson<Conversation>(`${API_BASE}/conversations/${id}`);
  },

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    return fetchJson<ChatMessage[]>(`${API_BASE}/conversations/${conversationId}/messages`);
  },

  async renameConversation(id: string, title: string): Promise<Conversation> {
    return fetchJson<Conversation>(`${API_BASE}/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  },

  async togglePinConversation(id: string, pinned: boolean): Promise<Conversation> {
    return fetchJson<Conversation>(`${API_BASE}/conversations/${id}/pin`, {
      method: 'PATCH',
      body: JSON.stringify({ pinned }),
    });
  },

  async deleteConversation(id: string): Promise<boolean> {
    const res = await fetchJson<{ id: string; deleted: boolean }>(`${API_BASE}/conversations/${id}`, {
      method: 'DELETE',
    });
    return res.deleted;
  },

  // Memories
  async getMemories(): Promise<MemoryItem[]> {
    return fetchJson<MemoryItem[]>(`${API_BASE}/memories`);
  },

  async createMemory(input: MemoryCreateInput): Promise<MemoryItem> {
    return fetchJson<MemoryItem>(`${API_BASE}/memories`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async deleteMemory(id: string): Promise<boolean> {
    const res = await fetchJson<{ id: string; deleted: boolean }>(`${API_BASE}/memories/${id}`, {
      method: 'DELETE',
    });
    return res.deleted;
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

  // Provider Status & Testing
  async getProviderStatus(): Promise<ProviderStatusSummary> {
    return fetchJson<ProviderStatusSummary>(`${API_BASE}/providers/status`);
  },

  async testTextProvider(provider: TextProviderType): Promise<ProviderTestResult> {
    return fetchJson<ProviderTestResult>(`${API_BASE}/providers/test-text`, {
      method: 'POST',
      body: JSON.stringify({ provider }),
    });
  },

  async selectProviders(selection: {
    textProvider?: TextProviderType;
    voiceProvider?: VoiceProviderType;
    textModel?: string;
    voiceModel?: string;
    theme?: string;
  }): Promise<{ success: boolean; data: any }> {
    return fetchJson<{ success: boolean; data: any }>(`${API_BASE}/providers/select`, {
      method: 'POST',
      body: JSON.stringify(selection),
    });
  },

  async testVoiceProvider(provider: VoiceProviderType, text?: string): Promise<ProviderTestResult> {
    try {
      return await fetchJson<ProviderTestResult>(`${API_BASE}/voice/test`, {
        method: 'POST',
        body: JSON.stringify({ provider, text }),
      });
    } catch {
      return await fetchJson<ProviderTestResult>(`${API_BASE}/providers/test-voice`, {
        method: 'POST',
        body: JSON.stringify({ provider }),
      });
    }
  },

  // Personal Voice Engine Endpoints
  async getPersonalVoiceStatus(): Promise<PersonalVoiceStatusResponse> {
    const res = await fetchJson<{ success: boolean; data: PersonalVoiceStatusResponse }>(
      `${API_BASE}/voice/personal/status`
    );
    return res.data;
  },

  async savePersonalVoiceReference(payload: {
    name: string;
    audioData?: string;
    format?: string;
    durationSeconds?: number;
    sampleRate?: number;
  }): Promise<{ success: boolean; data: PersonalVoiceReferenceMetadata }> {
    return fetchJson<{ success: boolean; data: PersonalVoiceReferenceMetadata }>(
      `${API_BASE}/voice/personal/reference`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  async deletePersonalVoiceReference(): Promise<{ success: boolean; message: string }> {
    return fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/voice/personal/reference`,
      {
        method: 'DELETE',
      }
    );
  },

  async testPersonalVoice(text?: string): Promise<ProviderTestResult> {
    return fetchJson<ProviderTestResult>(`${API_BASE}/voice/personal/test`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },

  // Database Health & Real Diagnostics
  async getDatabaseHealth(): Promise<DatabaseHealthResponse> {
    return fetchJson<DatabaseHealthResponse>(`${API_BASE}/database/health`);
  },

  async runDatabaseTest(): Promise<DatabaseDiagnosticsResult> {
    return fetchJson<DatabaseDiagnosticsResult>(`${API_BASE}/database/test`, {
      method: 'POST',
    });
  },

  async getDatabaseSchema(): Promise<{ sql: string }> {
    return fetchJson<{ sql: string }>(`${API_BASE}/database/schema`);
  },

  // Authentication & User Profile
  async getAuthConfig(): Promise<{ configured: boolean; supabaseUrl: string; supabaseAnonKey: string }> {
    return fetchJson<{ success: boolean; data: { configured: boolean; supabaseUrl: string; supabaseAnonKey: string } }>(
      `${API_BASE}/auth/config`
    ).then((r) => r.data);
  },

  async syncUserProfile(profile: { id: string; email?: string; fullName?: string; avatarUrl?: string }): Promise<any> {
    return fetchJson<{ success: boolean; data: any }>(`${API_BASE}/auth/profile`, {
      method: 'POST',
      body: JSON.stringify(profile),
    }).then((r) => r.data);
  },

  async getUserProfile(userId?: string): Promise<any> {
    const url = userId ? `${API_BASE}/auth/me?userId=${encodeURIComponent(userId)}` : `${API_BASE}/auth/me`;
    return fetchJson<{ success: boolean; data: any }>(url).then((r) => r.data);
  },

  // Health
  async getHealth(): Promise<HealthCheckResponse> {
    return fetchJson<HealthCheckResponse>(`${API_BASE}/health`);
  },
};
