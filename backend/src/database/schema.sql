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
-- 9. SUPABASE AUTH USER SYNCHRONIZATION TRIGGER
-- =========================================================================
-- Automatically mirrors new Supabase Auth users (Google OAuth) into public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', NULL)
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
        updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger runs on auth.users when a user signs in or registers via Google OAuth
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
        DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
        CREATE TRIGGER on_auth_user_created
            AFTER INSERT OR UPDATE ON auth.users
            FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
    END IF;
END $$;

-- =========================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================
-- Strict per-user isolation: User A cannot read or modify User B's data
-- Service role retains full administrative access for backend tasks
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.database_diagnostics_test ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- 1. Users table policies
    DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
    CREATE POLICY "Users can read own profile" ON public.users
        FOR SELECT USING (auth.uid() = id OR auth.role() = 'service_role');

    DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
    CREATE POLICY "Users can update own profile" ON public.users
        FOR UPDATE USING (auth.uid() = id OR auth.role() = 'service_role')
        WITH CHECK (auth.uid() = id OR auth.role() = 'service_role');

    DROP POLICY IF EXISTS "Allow user insert" ON public.users;
    CREATE POLICY "Allow user insert" ON public.users
        FOR INSERT WITH CHECK (auth.uid() = id OR auth.role() = 'service_role');

    -- 2. Conversations table policies
    DROP POLICY IF EXISTS "Users can access own conversations" ON public.conversations;
    CREATE POLICY "Users can access own conversations" ON public.conversations
        FOR ALL USING (auth.uid() = user_id OR auth.role() = 'service_role')
        WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

    -- 3. Messages table policies
    DROP POLICY IF EXISTS "Users can access own messages" ON public.messages;
    CREATE POLICY "Users can access own messages" ON public.messages
        FOR ALL USING (
            conversation_id IN (SELECT id FROM public.conversations WHERE user_id = auth.uid())
            OR auth.role() = 'service_role'
        )
        WITH CHECK (
            conversation_id IN (SELECT id FROM public.conversations WHERE user_id = auth.uid())
            OR auth.role() = 'service_role'
        );

    -- 4. User Settings table policies
    DROP POLICY IF EXISTS "Users can access own settings" ON public.user_settings;
    CREATE POLICY "Users can access own settings" ON public.user_settings
        FOR ALL USING (auth.uid() = user_id OR auth.role() = 'service_role')
        WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

    -- 5. AI Settings table policies
    DROP POLICY IF EXISTS "Users can access own ai_settings" ON public.ai_settings;
    CREATE POLICY "Users can access own ai_settings" ON public.ai_settings
        FOR ALL USING (auth.uid() = user_id OR auth.role() = 'service_role')
        WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

    -- 6. User Preferences table policies
    DROP POLICY IF EXISTS "Users can access own user_preferences" ON public.user_preferences;
    CREATE POLICY "Users can access own user_preferences" ON public.user_preferences
        FOR ALL USING (auth.uid() = user_id OR auth.role() = 'service_role')
        WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

    -- 7. Memories table policies
    DROP POLICY IF EXISTS "Users can access own memories" ON public.memories;
    CREATE POLICY "Users can access own memories" ON public.memories
        FOR ALL USING (auth.uid() = user_id OR auth.role() = 'service_role')
        WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

    -- 8. Diagnostics test table
    DROP POLICY IF EXISTS "Allow diagnostics for tests" ON public.database_diagnostics_test;
    CREATE POLICY "Allow diagnostics for tests" ON public.database_diagnostics_test
        FOR ALL USING (true) WITH CHECK (true);
END $$;
