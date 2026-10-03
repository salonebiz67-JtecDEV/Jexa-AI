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
  ApiResponse,
  HealthCheckResponse,
} from '../../shared/types';

// =========================================================================
// Centralized API Configuration for GitHub Pages & Render Deployment
// =========================================================================
// - In local dev / monolithic mode: defaults to '/api' (proxied by Vite/Express)
// - In GitHub Pages production: points to Render backend via VITE_API_BASE_URL
//   (e.g., VITE_API_BASE_URL=https://jexa-backend.onrender.com)
const RAW_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim();
export const API_BASE = RAW_BASE ? `${RAW_BASE.replace(/\/+$/, '')}/api` : '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  // If running in production on GitHub Pages without VITE_API_BASE_URL set, fail visibly with actionable guidance
  const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io');
  if (isGitHubPages && !RAW_BASE && url.startsWith('/api')) {
    throw new Error(
      'JEXA Backend URL is not configured. Please set the VITE_API_BASE_URL repository variable in GitHub Settings -> Secrets and variables -> Actions to your Render service URL (e.g. https://your-service.onrender.com).'
    );
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });
  } catch (netErr: any) {
    console.error(`[ApiClient] Network failure requesting ${url}:`, netErr);
    throw new Error(
      `Unable to reach the JEXA backend at ${url}. If using Render, please verify the backend service is running and VITE_API_BASE_URL is set in your environment.`
    );
  }

  let body: any;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Server returned an invalid response (${response.status} ${response.statusText}).`);
  }

  if (!response.ok || body.success === false) {
    throw new Error(body.error || `HTTP ${response.status}: ${response.statusText}`);
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

  // Health
  async getHealth(): Promise<HealthCheckResponse> {
    return fetchJson<HealthCheckResponse>(`${API_BASE}/health`);
  },
};
