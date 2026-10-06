-- =========================================================================
-- JEXA AI Companion Database Schema (Supabase / PostgreSQL)
-- Powered by JOHNEY TEC
-- =========================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================================
-- 1. USERS TABLE (Profiles)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed default user for standalone/guest mode so foreign key references never fail
INSERT INTO public.users (id, full_name, email)
VALUES ('00000000-0000-0000-0000-000000000001', 'JEXA Primary User', 'user@jexa.local')
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- 2. CONVERSATIONS TABLE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New Conversation',
    preview_message TEXT,
    persona_id TEXT DEFAULT 'empathetic_companion',
    pinned BOOLEAN DEFAULT false,
    message_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON public.conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_pinned_updated ON public.conversations(pinned DESC, updated_at DESC);

-- =========================================================================
-- 3. MESSAGES TABLE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    model TEXT,
    tokens INT,
    audio_url TEXT,
    is_development_mock BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at ASC);

-- =========================================================================
-- 4. USER SETTINGS TABLE (Persistent AI Model, Voice, Persona, and Theme Preferences)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
    selected_text_provider TEXT DEFAULT 'gemini',
    selected_text_model TEXT DEFAULT 'gemini-2.5-flash',
    selected_voice_provider TEXT DEFAULT 'gemini',
    selected_voice_model TEXT DEFAULT 'gemini-2.5-flash-tts',
    voice_persona TEXT DEFAULT 'empathetic_companion',
    theme TEXT DEFAULT 'dark',
    voice_id TEXT DEFAULT 'aura-jexa-serene',
    voice_speed NUMERIC(3, 2) DEFAULT 1.0,
    voice_pitch NUMERIC(3, 2) DEFAULT 1.0,
    auto_speak BOOLEAN DEFAULT false,
    memory_enabled BOOLEAN DEFAULT true,
    settings_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user ON public.user_settings(user_id);

-- =========================================================================
-- 5. AI SETTINGS TABLE (Backward Compatibility)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.ai_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    active_personality TEXT DEFAULT 'empathetic_companion',
    warmth NUMERIC(3, 2) DEFAULT 0.85,
    humor NUMERIC(3, 2) DEFAULT 0.60,
    conciseness NUMERIC(3, 2) DEFAULT 0.50,
    curiosity NUMERIC(3, 2) DEFAULT 0.80,
    memory_enabled BOOLEAN DEFAULT true,
    voice_id TEXT DEFAULT 'aura-jexa-serene',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =========================================================================
-- 6. USER PREFERENCES TABLE (Backward Compatibility)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.user_preferences (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    preferred_name TEXT,
    timezone TEXT DEFAULT 'UTC',
    location TEXT,
    interaction_pace TEXT DEFAULT 'balanced',
    voice_speed NUMERIC(3, 2) DEFAULT 1.0,
    voice_pitch NUMERIC(3, 2) DEFAULT 1.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =========================================================================
-- 7. MEMORIES TABLE (Long-term user knowledge & facts)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('user_fact', 'preference', 'goal', 'relationship', 'milestone', 'interest')),
    fact TEXT NOT NULL,
    confidence NUMERIC(3, 2) DEFAULT 0.85,
    source_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    last_reinforced_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_user_category ON public.memories(user_id, category);
CREATE INDEX IF NOT EXISTS idx_memories_reinforced ON public.memories(last_reinforced_at DESC);

-- =========================================================================
-- 8. DATABASE DIAGNOSTICS TEST TABLE (Dedicated test table for health & CRUD verification)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.database_diagnostics_test (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_key TEXT NOT NULL,
    payload TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =========================================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.database_diagnostics_test ENABLE ROW LEVEL SECURITY;

-- Permissive policies for server-side service role and client access
DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow all for conversations" ON public.conversations;
    CREATE POLICY "Allow all for conversations" ON public.conversations FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow all for messages" ON public.messages;
    CREATE POLICY "Allow all for messages" ON public.messages FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow all for users" ON public.users;
    CREATE POLICY "Allow all for users" ON public.users FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow all for user_settings" ON public.user_settings;
    CREATE POLICY "Allow all for user_settings" ON public.user_settings FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow all for ai_settings" ON public.ai_settings;
    CREATE POLICY "Allow all for ai_settings" ON public.ai_settings FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow all for user_preferences" ON public.user_preferences;
    CREATE POLICY "Allow all for user_preferences" ON public.user_preferences FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow all for memories" ON public.memories;
    CREATE POLICY "Allow all for memories" ON public.memories FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow all for diagnostics" ON public.database_diagnostics_test;
    CREATE POLICY "Allow all for diagnostics" ON public.database_diagnostics_test FOR ALL USING (true) WITH CHECK (true);
END $$;
