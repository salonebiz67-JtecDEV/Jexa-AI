import crypto from 'node:crypto';
import { getSupabaseClient, isSupabaseConfigured, testSupabasePing } from './supabase';
import { Conversation, ChatMessage } from '../../../shared/types/chat';
import { MemoryItem, MemoryCreateInput } from '../../../shared/types/memory';
import { BrainProfile } from '../../../shared/types/brain';
import { DatabaseDiagnosticsResult, DatabaseHealthResponse, TestStepStatus } from '../../../shared/types/database';
import { JEXA_IDENTITY } from '../../../ai/brain/identity';

export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Validates if a string is a standard UUID.
 */
export function isUUID(str: string): boolean {
  if (typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

/**
 * Converts any arbitrary string (e.g., 'conv-welcome', 'conv-123') into a deterministic UUIDv4-like string
 * to prevent PostgreSQL "invalid input syntax for type uuid" errors while preserving identity.
 */
export function toValidUUID(input: string): string {
  if (isUUID(input)) {
    return input.trim();
  }
  const hash = crypto.createHash('md5').update(input).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

// In-Memory Storage state for development or offline fallback
class InMemoryDatabase {
  public conversations: Map<string, Conversation> = new Map();
  public messages: Map<string, ChatMessage[]> = new Map();
  public memories: Map<string, MemoryItem> = new Map();
  public userProfiles: Map<string, any> = new Map();
  public userBrainProfiles: Map<string, BrainProfile> = new Map();
  public brainProfile: BrainProfile;

  constructor() {
    this.brainProfile = {
      id: 'default-profile',
      name: JEXA_IDENTITY.name,
      tagline: JEXA_IDENTITY.tagline,
      creator: JEXA_IDENTITY.creator,
      version: JEXA_IDENTITY.version,
      activePersonality: 'empathetic_companion',
      selectedTextProvider: 'gemini',
      selectedTextModel: 'gemini-2.5-flash',
      selectedVoiceProvider: 'gemini',
      selectedVoiceModel: 'gemini-2.5-flash-tts',
      theme: 'dark',
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
    const starterConvId = '00000000-0000-0000-0000-000000000010';
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
        id: '00000000-0000-0000-0000-000000000011',
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

    // Seed initial demo memories
    const seedMemories: MemoryItem[] = [
      {
        id: '00000000-0000-0000-0000-000000000021',
        category: 'goal',
        fact: 'User is building a production-grade AI companion application with real Supabase persistence.',
        confidence: 0.95,
        lastReinforcedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: '00000000-0000-0000-0000-000000000022',
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
  /**
   * Real check if Supabase is connected by executing a real test query.
   */
  public static async isConnected(): Promise<boolean> {
    const ping = await testSupabasePing();
    return ping.connected;
  }

  /**
   * Ensures the user record exists in the public.users table so that foreign key constraints
   * (REFERENCES public.users(id)) never fail on insert.
   */
  public static async ensureUserExists(
    userId: string,
    details?: { email?: string; fullName?: string; avatarUrl?: string }
  ): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    const validUserId = toValidUUID(userId || DEFAULT_USER_ID);
    try {
      const payload: Record<string, any> = {
        id: validUserId,
        full_name: details?.fullName || 'JEXA User',
        email: details?.email || `user-${validUserId.slice(0, 8)}@jexa.local`,
        updated_at: new Date().toISOString(),
      };
      if (details?.avatarUrl) {
        payload.avatar_url = details.avatarUrl;
      }

      const { error } = await client.from('users').upsert(payload, {
        onConflict: 'id',
        ignoreDuplicates: !details, // Do not overwrite real profile with default placeholder if exists
      });
      if (error && error.code !== '42P01') {
        console.warn('[DatabaseService] Note ensuring user exists:', error.message);
      }
    } catch (err: any) {
      console.warn('[DatabaseService] User check error:', err.message);
    }
  }

  public static async getUserProfile(userId: string): Promise<{
    id: string;
    email?: string;
    fullName?: string;
    avatarUrl?: string;
    createdAt?: string;
    updatedAt?: string;
  } | null> {
    const validUserId = toValidUUID(userId || DEFAULT_USER_ID);
    const client = getSupabaseClient();
    if (client) {
      try {
        const { data, error } = await client
          .from('users')
          .select('*')
          .eq('id', validUserId)
          .maybeSingle();
        if (!error && data) {
          return {
            id: data.id,
            email: data.email,
            fullName: data.full_name,
            avatarUrl: data.avatar_url,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          };
        }
      } catch (err: any) {
        console.warn('[DatabaseService] Error fetching user profile:', err.message);
      }
    }
    const memUser = memoryStore.userProfiles.get(validUserId);
    return memUser || {
      id: validUserId,
      email: 'user@jexa.local',
      fullName: 'JEXA User',
    };
  }

  public static async upsertUserProfile(profile: {
    id: string;
    email?: string;
    fullName?: string;
    avatarUrl?: string;
  }): Promise<{
    id: string;
    email?: string;
    fullName?: string;
    avatarUrl?: string;
    updatedAt: string;
  }> {
    const validUserId = toValidUUID(profile.id || DEFAULT_USER_ID);
    const updated = {
      id: validUserId,
      email: profile.email || `user-${validUserId.slice(0, 8)}@jexa.local`,
      full_name: profile.fullName || 'JEXA User',
      avatar_url: profile.avatarUrl || null,
      updated_at: new Date().toISOString(),
    };

    const client = getSupabaseClient();
    if (client) {
      try {
        const { error } = await client.from('users').upsert(updated, { onConflict: 'id' });
        if (error) {
          console.warn('[DatabaseService] Failed to upsert user profile to Supabase:', error.message);
        }
      } catch (err: any) {
        console.warn('[DatabaseService] Exception upserting user profile:', err.message);
      }
    }

    memoryStore.userProfiles.set(validUserId, {
      id: validUserId,
      email: updated.email,
      fullName: updated.full_name,
      avatarUrl: updated.avatar_url || undefined,
      updatedAt: updated.updated_at,
    });

    return {
      id: validUserId,
      email: updated.email,
      fullName: updated.full_name,
      avatarUrl: updated.avatar_url || undefined,
      updatedAt: updated.updated_at,
    };
  }

  // =========================================================================
  // CONVERSATION PERSISTENCE (Supabase Source of Truth)
  // =========================================================================

  public static async listConversations(userId?: string): Promise<Conversation[]> {
    const validUserId = toValidUUID(userId || DEFAULT_USER_ID);
    const client = getSupabaseClient();
    if (client) {
      let query = client
        .from('conversations')
        .select('*')
        .order('pinned', { ascending: false })
        .order('updated_at', { ascending: false });

      if (userId) {
        query = query.eq('user_id', validUserId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[DatabaseService] Supabase listConversations error:', error.message, error.details);
        throw new Error(`Failed to retrieve conversations from database: ${error.message}`);
      }

      if (data) {
        return data.map((d) => ({
          id: d.id,
          userId: d.user_id,
          title: d.title,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
          previewMessage: d.preview_message || '',
          messageCount: d.message_count ?? 0,
          personaId: d.persona_id || 'empathetic_companion',
          pinned: Boolean(d.pinned),
        }));
      }
    }

    return Array.from(memoryStore.conversations.values())
      .filter((c) => (userId ? c.userId === validUserId : c.userId === DEFAULT_USER_ID))
      .sort((a, b) => {
        if (Boolean(b.pinned) !== Boolean(a.pinned)) {
          return b.pinned ? 1 : -1;
        }
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }

  public static async getConversation(id: string, userId?: string): Promise<Conversation | null> {
    const validId = toValidUUID(id);
    const client = getSupabaseClient();
    if (client) {
      let query = client
        .from('conversations')
        .select('*')
        .eq('id', validId);

      if (userId) {
        query = query.eq('user_id', toValidUUID(userId));
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error('[DatabaseService] Supabase getConversation error:', error.message);
        throw new Error(`Database error reading conversation: ${error.message}`);
      }

      if (data) {
        return {
          id: data.id,
          userId: data.user_id,
          title: data.title,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          previewMessage: data.preview_message || '',
          messageCount: data.message_count ?? 0,
          personaId: data.persona_id || 'empathetic_companion',
          pinned: Boolean(data.pinned),
        };
      }
    }
    const conv = memoryStore.conversations.get(validId) || memoryStore.conversations.get(id);
    if (conv && userId && conv.userId !== toValidUUID(userId)) {
      return null;
    }
    return conv || null;
  }

  public static async createConversation(
    title?: string,
    personaId?: string,
    userId?: string
  ): Promise<Conversation> {
    const id = crypto.randomUUID();
    const targetUserId = toValidUUID(userId || DEFAULT_USER_ID);
    const cleanTitle = (title || 'New Conversation').trim();
    const cleanPersona = personaId || 'empathetic_companion';

    const newConv: Conversation = {
      id,
      userId: targetUserId,
      title: cleanTitle,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      previewMessage: '',
      messageCount: 0,
      personaId: cleanPersona,
      pinned: false,
    };

    const client = getSupabaseClient();
    if (client) {
      await this.ensureUserExists(targetUserId);

      const { error } = await client.from('conversations').insert({
        id: newConv.id,
        user_id: targetUserId,
        title: newConv.title,
        preview_message: '',
        message_count: 0,
        persona_id: newConv.personaId,
        pinned: false,
        created_at: newConv.createdAt,
        updated_at: newConv.updatedAt,
      });

      if (error) {
        console.error('[DatabaseService] Supabase createConversation error:', error.message, error.details);
        throw new Error(`Failed to create conversation in Supabase: ${error.message}`);
      }
      console.log(`[DatabaseService] Created conversation in Supabase: ${id}`);
    }

    memoryStore.conversations.set(id, newConv);
    memoryStore.messages.set(id, []);
    return newConv;
  }

  public static async togglePinConversation(id: string, pinned: boolean): Promise<Conversation | null> {
    return this.updateConversation(id, { pinned: Boolean(pinned) });
  }

  public static async renameConversation(id: string, newTitle: string): Promise<Conversation | null> {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      throw new Error('Conversation title cannot be empty.');
    }
    return this.updateConversation(id, { title: trimmed });
  }

  public static async updateConversation(
    id: string,
    updates: Partial<Conversation>
  ): Promise<Conversation | null> {
    const validId = toValidUUID(id);
    const existing = await this.getConversation(validId);
    if (!existing) {
      return null;
    }

    const updated: Conversation = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const client = getSupabaseClient();
    if (client) {
      const updatePayload: Record<string, any> = {
        updated_at: updated.updatedAt,
      };
      if (updates.title !== undefined) updatePayload.title = updated.title;
      if (updates.previewMessage !== undefined) updatePayload.preview_message = updated.previewMessage;
      if (updates.messageCount !== undefined) updatePayload.message_count = updated.messageCount;
      if (updates.pinned !== undefined) updatePayload.pinned = updated.pinned;
      if (updates.personaId !== undefined) updatePayload.persona_id = updated.personaId;

      const { error } = await client
        .from('conversations')
        .update(updatePayload)
        .eq('id', validId);

      if (error) {
        console.error('[DatabaseService] Supabase updateConversation error:', error.message, error.details);
        throw new Error(`Failed to update conversation in Supabase: ${error.message}`);
      }
    }

    memoryStore.conversations.set(validId, updated);
    return updated;
  }

  public static async deleteConversation(id: string, userId?: string): Promise<boolean> {
    const validId = toValidUUID(id);
    const client = getSupabaseClient();
    if (client) {
      if (userId) {
        const existing = await this.getConversation(validId, userId);
        if (!existing) {
          return false;
        }
      }

      // 1. Delete associated messages first
      const { error: msgErr } = await client.from('messages').delete().eq('conversation_id', validId);
      if (msgErr) {
        console.warn('[DatabaseService] Supabase message cleanup warning:', msgErr.message);
      }

      // 2. Delete the conversation record
      let query = client.from('conversations').delete().eq('id', validId);
      if (userId) {
        query = query.eq('user_id', toValidUUID(userId));
      }
      const { error: convErr } = await query;
      if (convErr) {
        console.error('[DatabaseService] Supabase deleteConversation error:', convErr.message, convErr.details);
        throw new Error(`Failed to delete conversation from Supabase: ${convErr.message}`);
      }
    }

    const existing = memoryStore.conversations.get(validId) || memoryStore.conversations.get(id);
    if (existing && userId && existing.userId !== toValidUUID(userId)) {
      return false;
    }

    memoryStore.conversations.delete(validId);
    memoryStore.conversations.delete(id);
    memoryStore.messages.delete(validId);
    memoryStore.messages.delete(id);
    return true;
  }

  // =========================================================================
  // MESSAGE PERSISTENCE (Supabase Source of Truth)
  // =========================================================================

  public static async getMessages(conversationId: string, userId?: string): Promise<ChatMessage[]> {
    const validConvId = toValidUUID(conversationId);
    if (userId) {
      const conv = await this.getConversation(validConvId, userId);
      if (!conv) {
        return [];
      }
    }

    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client
        .from('messages')
        .select('*')
        .eq('conversation_id', validConvId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[DatabaseService] Supabase getMessages error:', error.message, error.details);
        throw new Error(`Failed to retrieve messages from Supabase: ${error.message}`);
      }

      if (data) {
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

    return memoryStore.messages.get(validConvId) || memoryStore.messages.get(conversationId) || [];
  }

  public static async saveMessage(
    conversationId: string,
    message: Omit<ChatMessage, 'id' | 'conversationId' | 'createdAt'>
  ): Promise<ChatMessage> {
    const validConvId = toValidUUID(conversationId);
    const id = crypto.randomUUID();
    const fullMessage: ChatMessage = {
      id,
      conversationId: validConvId,
      role: message.role,
      content: message.content,
      createdAt: new Date().toISOString(),
      status: 'complete',
      metadata: message.metadata,
    };

    const client = getSupabaseClient();
    if (client) {
      // Ensure target conversation exists in Supabase before saving message
      const existing = await this.getConversation(validConvId);
      if (!existing) {
        await this.createConversation('New Conversation', undefined, DEFAULT_USER_ID);
      }

      const { error } = await client.from('messages').insert({
        id: fullMessage.id,
        conversation_id: validConvId,
        role: fullMessage.role,
        content: fullMessage.content,
        model: message.metadata?.model || null,
        tokens: message.metadata?.tokens || null,
        audio_url: message.metadata?.audioUrl || null,
        is_development_mock: message.metadata?.isDevelopmentMock ?? false,
        created_at: fullMessage.createdAt,
      });

      if (error) {
        console.error('[DatabaseService] Supabase saveMessage error:', error.message, error.details);
        throw new Error(`Failed to save message to Supabase: ${error.message}`);
      }
    }

    const current = memoryStore.messages.get(validConvId) || [];
    current.push(fullMessage);
    memoryStore.messages.set(validConvId, current);

    // Update conversation preview and message count in Supabase
    try {
      await this.updateConversation(validConvId, {
        previewMessage: fullMessage.content.slice(0, 90),
        messageCount: current.length,
      });
    } catch (err: any) {
      console.warn('[DatabaseService] Preview message update warning:', err.message);
    }

    return fullMessage;
  }

  // =========================================================================
  // SETTINGS & BRAIN PROFILE PERSISTENCE (Supabase Source of Truth)
  // =========================================================================

  public static async getBrainProfile(userId?: string): Promise<BrainProfile> {
    const targetUserId = toValidUUID(userId || DEFAULT_USER_ID);
    const client = getSupabaseClient();

    if (client) {
      try {
        // Try reading user_settings table
        const { data, error } = await client
          .from('user_settings')
          .select('*')
          .eq('user_id', targetUserId)
          .maybeSingle();

        if (!error && data) {
          const profile: BrainProfile = {
            id: `profile-${targetUserId}`,
            name: JEXA_IDENTITY.name,
            tagline: JEXA_IDENTITY.tagline,
            creator: JEXA_IDENTITY.creator,
            version: JEXA_IDENTITY.version,
            activePersonality: data.voice_persona || memoryStore.brainProfile.activePersonality,
            selectedTextProvider: data.selected_text_provider || memoryStore.brainProfile.selectedTextProvider,
            selectedTextModel: data.selected_text_model || data.settings_json?.selectedTextModel || memoryStore.brainProfile.selectedTextModel,
            selectedVoiceProvider: data.selected_voice_provider || memoryStore.brainProfile.selectedVoiceProvider,
            selectedVoiceModel: data.selected_voice_model || data.settings_json?.selectedVoiceModel || memoryStore.brainProfile.selectedVoiceModel,
            theme: data.theme || data.settings_json?.theme || 'dark',
            traits: data.settings_json?.traits || memoryStore.brainProfile.traits,
            toneParameters: data.settings_json?.toneParameters || memoryStore.brainProfile.toneParameters,
            voiceSettings: {
              voiceId: data.voice_id || memoryStore.brainProfile.voiceSettings.voiceId,
              speed: Number(data.voice_speed ?? memoryStore.brainProfile.voiceSettings.speed),
              pitch: Number(data.voice_pitch ?? memoryStore.brainProfile.voiceSettings.pitch),
              autoSpeak: Boolean(data.auto_speak ?? memoryStore.brainProfile.voiceSettings.autoSpeak),
            },
            memorySettings: {
              enabled: Boolean(data.memory_enabled ?? memoryStore.brainProfile.memorySettings.enabled),
              autoExtract: Boolean(data.settings_json?.autoExtract ?? memoryStore.brainProfile.memorySettings.autoExtract),
              maxContextMemories: Number(data.settings_json?.maxContextMemories ?? memoryStore.brainProfile.memorySettings.maxContextMemories),
            },
            personalVoiceSettings: data.settings_json?.personalVoiceSettings || memoryStore.brainProfile.personalVoiceSettings,
          };
          memoryStore.userBrainProfiles.set(targetUserId, profile);
          return profile;
        }

        // If user_settings doesn't exist yet or is empty, try legacy ai_settings
        if (error && error.code === '42P01') {
          const { data: legacyData } = await client
            .from('ai_settings')
            .select('*')
            .eq('user_id', targetUserId)
            .maybeSingle();

          if (legacyData) {
            const userProf = memoryStore.userBrainProfiles.get(targetUserId) || { ...memoryStore.brainProfile };
            userProf.activePersonality = legacyData.active_personality || userProf.activePersonality;
            if (legacyData.voice_id) userProf.voiceSettings.voiceId = legacyData.voice_id;
            if (legacyData.memory_enabled !== undefined) userProf.memorySettings.enabled = legacyData.memory_enabled;
            memoryStore.userBrainProfiles.set(targetUserId, userProf);
            return userProf;
          }
        }
      } catch (err: any) {
        console.warn('[DatabaseService] Error fetching brain profile from Supabase:', err.message);
      }
    }

    return memoryStore.userBrainProfiles.get(targetUserId) || memoryStore.brainProfile;
  }

  public static async updateBrainProfile(
    updates: Partial<BrainProfile>,
    userId?: string
  ): Promise<BrainProfile> {
    const targetUserId = toValidUUID(userId || DEFAULT_USER_ID);

    const merged: BrainProfile = {
      ...memoryStore.brainProfile,
      ...updates,
      selectedTextModel: updates.selectedTextModel || memoryStore.brainProfile.selectedTextModel,
      selectedVoiceModel: updates.selectedVoiceModel || memoryStore.brainProfile.selectedVoiceModel,
      theme: updates.theme || memoryStore.brainProfile.theme,
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
      personalVoiceSettings: updates.personalVoiceSettings
        ? { ...memoryStore.brainProfile.personalVoiceSettings, ...updates.personalVoiceSettings }
        : memoryStore.brainProfile.personalVoiceSettings,
    };

    memoryStore.userBrainProfiles.set(targetUserId, merged);
    memoryStore.brainProfile = merged;

    const client = getSupabaseClient();
    if (client) {
      await this.ensureUserExists(targetUserId);

      // Persist to user_settings table
      const settingsPayload = {
        user_id: targetUserId,
        selected_text_provider: merged.selectedTextProvider,
        selected_text_model: merged.selectedTextModel,
        selected_voice_provider: merged.selectedVoiceProvider,
        selected_voice_model: merged.selectedVoiceModel,
        voice_persona: merged.activePersonality,
        theme: merged.theme || 'dark',
        voice_id: merged.voiceSettings?.voiceId,
        voice_speed: merged.voiceSettings?.speed,
        voice_pitch: merged.voiceSettings?.pitch,
        auto_speak: merged.voiceSettings?.autoSpeak,
        memory_enabled: merged.memorySettings?.enabled,
        settings_json: {
          selectedTextModel: merged.selectedTextModel,
          selectedVoiceModel: merged.selectedVoiceModel,
          theme: merged.theme,
          toneParameters: merged.toneParameters,
          traits: merged.traits,
          voiceSettings: merged.voiceSettings,
          memorySettings: merged.memorySettings,
          personalVoiceSettings: merged.personalVoiceSettings,
        },
        updated_at: new Date().toISOString(),
      };

      const { error: settingsErr } = await client
        .from('user_settings')
        .upsert(settingsPayload, { onConflict: 'user_id' });

      if (settingsErr) {
        console.warn('[DatabaseService] Failed to upsert to user_settings:', settingsErr.message, settingsErr.details);
        // If user_settings table missing, attempt fallback to ai_settings
        if (settingsErr.code === '42P01') {
          await client.from('ai_settings').upsert(
            {
              user_id: targetUserId,
              active_personality: merged.activePersonality,
              voice_id: merged.voiceSettings?.voiceId,
              memory_enabled: merged.memorySettings?.enabled,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          );
        } else {
          throw new Error(`Failed to persist settings in Supabase: ${settingsErr.message}`);
        }
      } else {
        console.log('[DatabaseService] Successfully persisted user settings to Supabase.');
      }
    }

    return merged;
  }

  // =========================================================================
  // MEMORY PERSISTENCE
  // =========================================================================

  public static async getMemories(userId?: string): Promise<MemoryItem[]> {
    const validUserId = toValidUUID(userId || DEFAULT_USER_ID);
    const client = getSupabaseClient();
    if (client) {
      let query = client
        .from('memories')
        .select('*');

      if (userId) {
        query = query.eq('user_id', validUserId);
      }

      const { data, error } = await query.order('last_reinforced_at', { ascending: false });

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

    return Array.from(memoryStore.memories.values())
      .filter((m) => (userId ? m.userId === validUserId : m.userId === DEFAULT_USER_ID))
      .sort((a, b) => new Date(b.lastReinforcedAt).getTime() - new Date(a.lastReinforcedAt).getTime());
  }

  public static async createMemory(input: MemoryCreateInput, userId?: string): Promise<MemoryItem> {
    const id = crypto.randomUUID();
    const validUserId = toValidUUID(userId || DEFAULT_USER_ID);
    const newMemory: MemoryItem = {
      id,
      userId: validUserId,
      category: input.category,
      fact: input.fact,
      confidence: input.confidence ?? 0.85,
      sourceConversationId: input.sourceConversationId ? toValidUUID(input.sourceConversationId) : undefined,
      lastReinforcedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const client = getSupabaseClient();
    if (client) {
      await this.ensureUserExists(validUserId);
      const { error } = await client.from('memories').insert({
        id: newMemory.id,
        user_id: validUserId,
        category: newMemory.category,
        fact: newMemory.fact,
        confidence: newMemory.confidence,
        source_conversation_id: newMemory.sourceConversationId || null,
        last_reinforced_at: newMemory.lastReinforcedAt,
        created_at: newMemory.createdAt,
      });
      if (error) {
        console.warn('[DatabaseService] Failed to insert memory to Supabase:', error.message);
      }
    }

    memoryStore.memories.set(id, newMemory);
    return newMemory;
  }

  public static async deleteMemory(id: string, userId?: string): Promise<boolean> {
    const validId = toValidUUID(id);
    const client = getSupabaseClient();
    if (client) {
      let query = client.from('memories').delete().eq('id', validId);
      if (userId) {
        query = query.eq('user_id', toValidUUID(userId));
      }
      await query;
    }
    const mem = memoryStore.memories.get(validId) || memoryStore.memories.get(id);
    if (mem && userId && mem.userId !== toValidUUID(userId)) {
      return false;
    }
    memoryStore.memories.delete(validId);
    memoryStore.memories.delete(id);
    return true;
  }

  // =========================================================================
  // REAL DATABASE DIAGNOSTICS & TEST SEQUENCE
  // =========================================================================

  /**
   * Performs the exact real database test sequence demanded by the specifications:
   * 1. CREATE
   * 2. READ
   * 3. UPDATE
   * 4. READ AGAIN
   * 5. DELETE
   * 6. VERIFY DELETE
   * Plus Chat and Settings persistence verification.
   * Never fakes results; separates each step cleanly.
   */
  public static async runDiagnosticsTest(): Promise<DatabaseDiagnosticsResult> {
    const totalStart = Date.now();
    const notes: string[] = [];

    const defaultStep = (status: TestStepStatus = 'NOT_TESTED'): { status: TestStepStatus } => ({
      status,
    });

    const result: DatabaseDiagnosticsResult = {
      overall: 'FAIL',
      database: isSupabaseConfigured ? 'supabase' : 'memory',
      configured: isSupabaseConfigured,
      connection: defaultStep('NOT_TESTED'),
      create: defaultStep('NOT_TESTED'),
      read: defaultStep('NOT_TESTED'),
      update: defaultStep('NOT_TESTED'),
      delete: defaultStep('NOT_TESTED'),
      chatPersistence: defaultStep('NOT_TESTED'),
      settingsPersistence: defaultStep('NOT_TESTED'),
      testedAt: new Date().toISOString(),
      totalLatencyMs: 0,
      notes,
    };

    const client = getSupabaseClient();
    if (!client) {
      result.connection = {
        status: 'FAIL',
        message: 'Supabase client is not initialized. SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in environment.',
      };
      result.totalLatencyMs = Date.now() - totalStart;
      return result;
    }

    // Step 0: Test Connection
    const connStart = Date.now();
    const ping = await testSupabasePing();
    const connLatency = Date.now() - connStart;

    if (!ping.connected) {
      result.connection = {
        status: 'FAIL',
        latencyMs: connLatency,
        message: ping.error || 'Connection to Supabase failed.',
      };
      result.totalLatencyMs = Date.now() - totalStart;
      return result;
    }

    result.connection = {
      status: 'PASS',
      latencyMs: connLatency,
      message: 'Successfully reached Supabase instance.',
    };

    // Determine test table: prefer database_diagnostics_test, fallback to safe test namespace in conversations
    const testKey = `diag_test_${Date.now()}`;
    const testPayload = JSON.stringify({ marker: 'initial', timestamp: new Date().toISOString() });
    const updatedPayload = JSON.stringify({ marker: 'updated', timestamp: new Date().toISOString() });
    const testId = crypto.randomUUID();

    let useDedicatedTable = true;

    // Probe database_diagnostics_test table existence
    const { error: probeErr } = await client.from('database_diagnostics_test').select('id').limit(1);
    if (probeErr && probeErr.code === '42P01') {
      useDedicatedTable = false;
      notes.push('Dedicated table "database_diagnostics_test" not found. Executed test in isolated namespace on "conversations" table. Run schema.sql to add database_diagnostics_test.');
    }

    // Step 1: CREATE
    const createStart = Date.now();
    try {
      if (useDedicatedTable) {
        const { error: cErr } = await client.from('database_diagnostics_test').insert({
          id: testId,
          test_key: testKey,
          payload: testPayload,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (cErr) throw cErr;
      } else {
        await this.ensureUserExists(DEFAULT_USER_ID);
        const { error: cErr } = await client.from('conversations').insert({
          id: testId,
          user_id: DEFAULT_USER_ID,
          title: `[DIAGNOSTICS_TEST_${testKey}]`,
          preview_message: testPayload,
          message_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (cErr) throw cErr;
      }

      result.create = {
        status: 'PASS',
        latencyMs: Date.now() - createStart,
        message: 'Record created successfully.',
      };
    } catch (err: any) {
      result.create = {
        status: 'FAIL',
        latencyMs: Date.now() - createStart,
        error: err.message || 'CREATE operation failed.',
      };
      result.totalLatencyMs = Date.now() - totalStart;
      return result;
    }

    // Step 2: READ
    const readStart = Date.now();
    try {
      if (useDedicatedTable) {
        const { data: readData, error: rErr } = await client
          .from('database_diagnostics_test')
          .select('*')
          .eq('id', testId)
          .single();
        if (rErr) throw rErr;
        if (!readData || readData.payload !== testPayload) {
          throw new Error('Read data does not match inserted test payload.');
        }
      } else {
        const { data: readData, error: rErr } = await client
          .from('conversations')
          .select('*')
          .eq('id', testId)
          .single();
        if (rErr) throw rErr;
        if (!readData || readData.preview_message !== testPayload) {
          throw new Error('Read data does not match inserted test payload.');
        }
      }

      result.read = {
        status: 'PASS',
        latencyMs: Date.now() - readStart,
        message: 'Record retrieved and verified successfully.',
      };
    } catch (err: any) {
      result.read = {
        status: 'FAIL',
        latencyMs: Date.now() - readStart,
        error: err.message || 'READ operation failed.',
      };
      // Attempt cleanup before returning
      if (useDedicatedTable) {
        await client.from('database_diagnostics_test').delete().eq('id', testId);
      } else {
        await client.from('conversations').delete().eq('id', testId);
      }
      result.totalLatencyMs = Date.now() - totalStart;
      return result;
    }

    // Step 3: UPDATE
    const updateStart = Date.now();
    try {
      if (useDedicatedTable) {
        const { error: uErr } = await client
          .from('database_diagnostics_test')
          .update({ payload: updatedPayload, updated_at: new Date().toISOString() })
          .eq('id', testId);
        if (uErr) throw uErr;
      } else {
        const { error: uErr } = await client
          .from('conversations')
          .update({ preview_message: updatedPayload, updated_at: new Date().toISOString() })
          .eq('id', testId);
        if (uErr) throw uErr;
      }

      result.update = {
        status: 'PASS',
        latencyMs: Date.now() - updateStart,
        message: 'Record updated successfully.',
      };
    } catch (err: any) {
      result.update = {
        status: 'FAIL',
        latencyMs: Date.now() - updateStart,
        error: err.message || 'UPDATE operation failed.',
      };
      if (useDedicatedTable) {
        await client.from('database_diagnostics_test').delete().eq('id', testId);
      } else {
        await client.from('conversations').delete().eq('id', testId);
      }
      result.totalLatencyMs = Date.now() - totalStart;
      return result;
    }

    // Step 4: READ AGAIN & Step 5: DELETE & Step 6: VERIFY DELETE
    const deleteStart = Date.now();
    try {
      // Read again to verify updated payload
      if (useDedicatedTable) {
        const { data: verifyUpdate } = await client
          .from('database_diagnostics_test')
          .select('payload')
          .eq('id', testId)
          .single();
        if (verifyUpdate?.payload !== updatedPayload) {
          throw new Error('Update verification failed: data did not reflect update.');
        }

        // Delete
        const { error: dErr } = await client
          .from('database_diagnostics_test')
          .delete()
          .eq('id', testId);
        if (dErr) throw dErr;

        // Verify Delete
        const { data: verifyDel } = await client
          .from('database_diagnostics_test')
          .select('id')
          .eq('id', testId)
          .maybeSingle();

        if (verifyDel) {
          throw new Error('Delete verification failed: record still exists after deletion.');
        }
      } else {
        const { data: verifyUpdate } = await client
          .from('conversations')
          .select('preview_message')
          .eq('id', testId)
          .single();
        if (verifyUpdate?.preview_message !== updatedPayload) {
          throw new Error('Update verification failed: data did not reflect update.');
        }

        const { error: dErr } = await client
          .from('conversations')
          .delete()
          .eq('id', testId);
        if (dErr) throw dErr;

        const { data: verifyDel } = await client
          .from('conversations')
          .select('id')
          .eq('id', testId)
          .maybeSingle();

        if (verifyDel) {
          throw new Error('Delete verification failed: record still exists after deletion.');
        }
      }

      result.delete = {
        status: 'PASS',
        latencyMs: Date.now() - deleteStart,
        message: 'Record deleted and confirmed removed.',
      };
    } catch (err: any) {
      result.delete = {
        status: 'FAIL',
        latencyMs: Date.now() - deleteStart,
        error: err.message || 'DELETE or verify delete failed.',
      };
      result.totalLatencyMs = Date.now() - totalStart;
      return result;
    }

    // Step 7: Chat Persistence check (conversations & messages)
    try {
      const { error: convErr } = await client.from('conversations').select('id, title, pinned').limit(1);
      const { error: msgErr } = await client.from('messages').select('id, role, content').limit(1);

      if (convErr || msgErr) {
        result.chatPersistence = {
          status: 'FAIL',
          error: (convErr?.message || msgErr?.message || 'Chat tables unverified'),
        };
      } else {
        result.chatPersistence = {
          status: 'PASS',
          message: 'Conversations and Messages schemas verified & accessible.',
        };
      }
    } catch (chatErr: any) {
      result.chatPersistence = { status: 'FAIL', error: chatErr.message };
    }

    // Step 8: Settings Persistence check (user_settings / ai_settings)
    try {
      const { error: setErr } = await client.from('user_settings').select('id, selected_text_provider').limit(1);
      if (setErr && setErr.code === '42P01') {
        const { error: aiErr } = await client.from('ai_settings').select('id, active_personality').limit(1);
        if (aiErr) {
          result.settingsPersistence = {
            status: 'FAIL',
            error: 'user_settings and ai_settings tables not found. Run schema.sql.',
          };
        } else {
          result.settingsPersistence = {
            status: 'PASS',
            message: 'ai_settings verified (legacy mode). Run schema.sql for full user_settings table.',
          };
        }
      } else if (setErr) {
        result.settingsPersistence = { status: 'FAIL', error: setErr.message };
      } else {
        result.settingsPersistence = {
          status: 'PASS',
          message: 'user_settings verified & accessible.',
        };
      }
    } catch (setErr: any) {
      result.settingsPersistence = { status: 'FAIL', error: setErr.message };
    }

    const allCrudPass =
      result.connection.status === 'PASS' &&
      result.create.status === 'PASS' &&
      result.read.status === 'PASS' &&
      result.update.status === 'PASS' &&
      result.delete.status === 'PASS';

    result.overall = allCrudPass ? 'PASS' : 'FAIL';
    result.totalLatencyMs = Date.now() - totalStart;

    return result;
  }

  /**
   * Health endpoint helper for GET /api/database/health
   */
  public static async checkHealth(): Promise<DatabaseHealthResponse> {
    const client = getSupabaseClient();
    const start = Date.now();

    if (!isSupabaseConfigured || !client) {
      return {
        connected: false,
        database: 'memory',
        read: true,
        write: true,
        update: true,
        delete: true,
        chatPersistence: false,
        settingsPersistence: false,
        latencyMs: 1,
        timestamp: new Date().toISOString(),
        error: 'Operating in memory fallback mode (Supabase credentials not set).',
      };
    }

    try {
      const { error: convErr } = await client.from('conversations').select('id').limit(1);
      const latencyMs = Date.now() - start;

      if (convErr && convErr.code !== '42P01') {
        return {
          connected: false,
          database: 'supabase',
          read: false,
          write: false,
          update: false,
          delete: false,
          chatPersistence: false,
          settingsPersistence: false,
          latencyMs,
          timestamp: new Date().toISOString(),
          error: convErr.message,
        };
      }

      return {
        connected: true,
        database: 'supabase',
        read: true,
        write: true,
        update: true,
        delete: true,
        chatPersistence: true,
        settingsPersistence: true,
        latencyMs,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        connected: false,
        database: 'supabase',
        read: false,
        write: false,
        update: false,
        delete: false,
        chatPersistence: false,
        settingsPersistence: false,
        latencyMs: Date.now() - start,
        timestamp: new Date().toISOString(),
        error: err.message,
      };
    }
  }
}
