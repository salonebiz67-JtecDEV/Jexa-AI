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
} from '../../shared/types';

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
  latencyMs?: number;
  message?: string;
  code?: string;
  error?: string;
}

export interface ProviderStatusSummary {
  text: {
    provider: string;
    model: string;
    configured: boolean;
  };
  voice: {
    provider: string;
    model: string;
    configured: boolean;
  };
  availableText?: Array<{
    type: string;
    name: string;
    isConfigured: boolean;
    model: string;
    description?: string;
  }>;
  availableVoice?: Array<{
    type: string;
    name: string;
    isConfigured: boolean;
    model: string;
    description?: string;
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

  try {
    const res = await fetch(url, {
      ...options,
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

  // Voice
  async requestVoiceSynthesis(payload: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    const cleanPayload: VoiceSynthesisRequest = {
      text: typeof payload?.text === 'string' ? payload.text : '',
      voiceId: payload?.voiceId,
      provider: payload?.provider,
      speed: payload?.speed,
      pitch: payload?.pitch,
    };
    return fetchJson<VoiceSynthesisResponse>(`${API_BASE}/voice`, {
      method: 'POST',
      body: JSON.stringify(cleanPayload),
    });
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

  async testVoiceProvider(provider: VoiceProviderType): Promise<ProviderTestResult> {
    return fetchJson<ProviderTestResult>(`${API_BASE}/providers/test-voice`, {
      method: 'POST',
      body: JSON.stringify({ provider }),
    });
  },

  // Health
  async getHealth(): Promise<HealthCheckResponse> {
    return fetchJson<HealthCheckResponse>(`${API_BASE}/health`);
  },
};
