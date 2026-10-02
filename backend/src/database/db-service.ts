import { getSupabaseClient, isSupabaseConfigured } from './supabase';
import { Conversation, ChatMessage } from '../../../shared/types/chat';
import { MemoryItem, MemoryCreateInput } from '../../../shared/types/memory';
import { BrainProfile } from '../../../shared/types/brain';
import { JEXA_IDENTITY } from '../../../ai/brain/identity';

// In-Memory Storage state for development or fallback
class InMemoryDatabase {
  public conversations: Map<string, Conversation> = new Map();
  public messages: Map<string, ChatMessage[]> = new Map();
  public memories: Map<string, MemoryItem> = new Map();
  public brainProfile: BrainProfile;

  constructor() {
    this.brainProfile = {
      id: 'default-profile',
      name: JEXA_IDENTITY.name,
      tagline: JEXA_IDENTITY.tagline,
      creator: JEXA_IDENTITY.creator,
      version: JEXA_IDENTITY.version,
      activePersonality: 'empathetic_companion',
      traits: ['Empathetic', 'Adaptive', 'Curious', 'Honest', 'Nuanced'],
      toneParameters: {
        warmth: 0.85,
        humor: 0.6,
        conciseness: 0.5,
        curiosity: 0.8,
      },
      voiceSettings: {
        voiceId: 'aura-jexa-serene',
        speed: 1.0,
        pitch: 1.0,
        autoSpeak: false,
      },
      memorySettings: {
        enabled: true,
        autoExtract: true,
        maxContextMemories: 5,
      },
    };

    // Seed default starter conversation
    const starterConvId = 'conv-welcome';
    const starterConv: Conversation = {
      id: starterConvId,
      title: 'Welcome to JEXA',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date().toISOString(),
      previewMessage: 'Greetings! I am JEXA, your AI companion powered by JOHNEY TEC.',
      messageCount: 1,
      personaId: 'empathetic_companion',
    };
    this.conversations.set(starterConvId, starterConv);

    this.messages.set(starterConvId, [
      {
        id: 'msg-starter-1',
        conversationId: starterConvId,
        role: 'assistant',
        content: `Hello! I'm **JEXA**, your personal AI assistant powered by **JOHNEY TEC**.\n\nI can help you brainstorm ideas, write content or code, organize projects, schedule tasks, and explore questions. What would you like to work on today?`,
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        status: 'complete',
        metadata: {
          isDevelopmentMock: false,
          model: 'jexa-foundation-v1',
        },
      },
    ]);

    // Seed initial demo memories to demonstrate memory retrieval
    const seedMemories: MemoryItem[] = [
      {
        id: 'mem-1',
        category: 'goal',
        fact: 'User is building a production-grade AI companion application.',
        confidence: 0.95,
        lastReinforcedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'mem-2',
        category: 'preference',
        fact: 'User values clean modular architecture, dark elegant aesthetics, and responsiveness.',
        confidence: 0.92,
        lastReinforcedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ];

    for (const mem of seedMemories) {
      this.memories.set(mem.id, mem);
    }
  }
}

const memoryStore = new InMemoryDatabase();

export class DatabaseService {
  public static async isConnected(): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    const client = getSupabaseClient();
    if (!client) return false;
    try {
      const { error } = await client.from('conversations').select('id').limit(1);
      return !error;
    } catch {
      return false;
    }
  }

  // Conversation Methods
  public static async listConversations(): Promise<Conversation[]> {
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client
        .from('conversations')
        .select('*')
        .order('pinned', { ascending: false })
        .order('updated_at', { ascending: false });

      if (!error && data) {
        return data.map((d) => ({
          id: d.id,
          title: d.title,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
          previewMessage: d.preview_message,
          messageCount: d.message_count,
          personaId: d.persona_id,
          pinned: Boolean(d.pinned),
        }));
      }
    }

    return Array.from(memoryStore.conversations.values()).sort((a, b) => {
      if (Boolean(b.pinned) !== Boolean(a.pinned)) {
        return b.pinned ? 1 : -1;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }

  public static async getConversation(id: string): Promise<Conversation | null> {
    const client = getSupabaseClient();
    if (client) {
      const { data } = await client.from('conversations').select('*').eq('id', id).single();
      if (data) {
        return {
          id: data.id,
          title: data.title,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          previewMessage: data.preview_message,
          messageCount: data.message_count,
          personaId: data.persona_id,
          pinned: Boolean(data.pinned),
        };
      }
    }
    return memoryStore.conversations.get(id) || null;
  }

  public static async createConversation(title?: string, personaId?: string): Promise<Conversation> {
    const id = `conv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newConv: Conversation = {
      id,
      title: title || 'New Conversation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      previewMessage: '',
      messageCount: 0,
      personaId: personaId || 'empathetic_companion',
      pinned: false,
    };

    const client = getSupabaseClient();
    if (client) {
      await client.from('conversations').insert({
        id: newConv.id,
        title: newConv.title,
        created_at: newConv.createdAt,
        updated_at: newConv.updatedAt,
        persona_id: newConv.personaId,
        pinned: false,
      });
    }

    memoryStore.conversations.set(id, newConv);
    memoryStore.messages.set(id, []);
    return newConv;
  }

  public static async togglePinConversation(id: string, pinned: boolean): Promise<Conversation | null> {
    return this.updateConversation(id, { pinned });
  }

  public static async renameConversation(id: string, newTitle: string): Promise<Conversation | null> {
    return this.updateConversation(id, { title: newTitle.trim() });
  }

  public static async updateConversation(
    id: string,
    updates: Partial<Conversation>
  ): Promise<Conversation | null> {
    const existing = await this.getConversation(id);
    if (!existing) return null;

    const updated: Conversation = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const client = getSupabaseClient();
    if (client) {
      await client
        .from('conversations')
        .update({
          title: updated.title,
          preview_message: updated.previewMessage,
          message_count: updated.messageCount,
          pinned: updated.pinned ?? false,
          updated_at: updated.updatedAt,
        })
        .eq('id', id);
    }

    memoryStore.conversations.set(id, updated);
    return updated;
  }

  public static async deleteConversation(id: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (client) {
      // Delete associated messages first then conversation
      await client.from('messages').delete().eq('conversation_id', id);
      await client.from('conversations').delete().eq('id', id);
    }
    memoryStore.conversations.delete(id);
    memoryStore.messages.delete(id);
    return true;
  }

  // Message Methods
  public static async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        return data.map((m) => ({
          id: m.id,
          conversationId: m.conversation_id,
          role: m.role,
          content: m.content,
          createdAt: m.created_at,
          status: 'complete',
          metadata: {
            model: m.model,
            tokens: m.tokens,
            audioUrl: m.audio_url,
            isDevelopmentMock: m.is_development_mock,
          },
        }));
      }
    }

    return memoryStore.messages.get(conversationId) || [];
  }

  public static async saveMessage(
    conversationId: string,
    message: Omit<ChatMessage, 'id' | 'conversationId' | 'createdAt'>
  ): Promise<ChatMessage> {
    const id = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const fullMessage: ChatMessage = {
      id,
      conversationId,
      role: message.role,
      content: message.content,
      createdAt: new Date().toISOString(),
      status: 'complete',
      metadata: message.metadata,
    };

    const client = getSupabaseClient();
    if (client) {
      await client.from('messages').insert({
        id: fullMessage.id,
        conversation_id: conversationId,
        role: fullMessage.role,
        content: fullMessage.content,
        created_at: fullMessage.createdAt,
        model: message.metadata?.model,
        tokens: message.metadata?.tokens,
        is_development_mock: message.metadata?.isDevelopmentMock ?? false,
      });
    }

    const current = memoryStore.messages.get(conversationId) || [];
    current.push(fullMessage);
    memoryStore.messages.set(conversationId, current);

    // Update conversation preview and count
    await this.updateConversation(conversationId, {
      previewMessage: fullMessage.content.slice(0, 90),
      messageCount: current.length,
    });

    return fullMessage;
  }

  // Memory Methods
  public static async getMemories(): Promise<MemoryItem[]> {
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client
        .from('memories')
        .select('*')
        .order('last_reinforced_at', { ascending: false });

      if (!error && data) {
        return data.map((d) => ({
          id: d.id,
          userId: d.user_id,
          category: d.category,
          fact: d.fact,
          confidence: parseFloat(d.confidence || '0.85'),
          sourceConversationId: d.source_conversation_id,
          lastReinforcedAt: d.last_reinforced_at,
          createdAt: d.created_at,
        }));
      }
    }

    return Array.from(memoryStore.memories.values()).sort(
      (a, b) => new Date(b.lastReinforcedAt).getTime() - new Date(a.lastReinforcedAt).getTime()
    );
  }

  public static async createMemory(input: MemoryCreateInput): Promise<MemoryItem> {
    const id = `mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newMemory: MemoryItem = {
      id,
      category: input.category,
      fact: input.fact,
      confidence: input.confidence ?? 0.85,
      sourceConversationId: input.sourceConversationId,
      lastReinforcedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const client = getSupabaseClient();
    if (client) {
      await client.from('memories').insert({
        id: newMemory.id,
        category: newMemory.category,
        fact: newMemory.fact,
        confidence: newMemory.confidence,
        source_conversation_id: newMemory.sourceConversationId,
        last_reinforced_at: newMemory.lastReinforcedAt,
        created_at: newMemory.createdAt,
      });
    }

    memoryStore.memories.set(id, newMemory);
    return newMemory;
  }

  public static async deleteMemory(id: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (client) {
      await client.from('memories').delete().eq('id', id);
    }
    memoryStore.memories.delete(id);
    return true;
  }

  // Brain Profile Methods
  public static async getBrainProfile(): Promise<BrainProfile> {
    return memoryStore.brainProfile;
  }

  public static async updateBrainProfile(updates: Partial<BrainProfile>): Promise<BrainProfile> {
    memoryStore.brainProfile = {
      ...memoryStore.brainProfile,
      ...updates,
      toneParameters: {
        ...memoryStore.brainProfile.toneParameters,
        ...(updates.toneParameters || {}),
      },
      voiceSettings: {
        ...memoryStore.brainProfile.voiceSettings,
        ...(updates.voiceSettings || {}),
      },
      memorySettings: {
        ...memoryStore.brainProfile.memorySettings,
        ...(updates.memorySettings || {}),
      },
    };
    return memoryStore.brainProfile;
  }
}
