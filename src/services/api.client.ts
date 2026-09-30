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

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });

  const body: ApiResponse<T> = await response.json();
  if (!response.ok || body.success === false) {
    throw new Error(body.error || `HTTP error ${response.status}: ${response.statusText}`);
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
      stream: Boolean(payload?.stream),
      userContext: payload?.userContext,
    };
    return fetchJson<ChatResponsePayload>(`${API_BASE}/chat`, {
      method: 'POST',
      body: JSON.stringify(cleanPayload),
    });
  },

  // Voice
  async requestVoiceSynthesis(payload: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    return fetchJson<VoiceSynthesisResponse>(`${API_BASE}/voice`, {
      method: 'POST',
      body: JSON.stringify(payload),
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
    const res = await fetch(`${API_BASE}/health`);
    return res.json();
  },
};
