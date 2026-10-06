import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { safeStorage } from './storage';

export interface AuthConfig {
  configured: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface UserProfile {
  id: string;
  email?: string;
  fullName?: string;
  avatarUrl?: string;
  updatedAt?: string;
}

let supabaseClientInstance: SupabaseClient | null = null;
let clientInitPromise: Promise<SupabaseClient | null> | null = null;

/**
 * Resolves the Supabase URL and public Anon Key from Vite environment variables
 * or dynamically from the backend server (/api/auth/config).
 */
export async function fetchAuthConfig(): Promise<AuthConfig> {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (envUrl && envKey) {
    return {
      configured: true,
      supabaseUrl: envUrl,
      supabaseAnonKey: envKey,
    };
  }

  try {
    const res = await fetch('/api/auth/config');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.data?.supabaseUrl && data.data?.supabaseAnonKey) {
        return {
          configured: true,
          supabaseUrl: data.data.supabaseUrl,
          supabaseAnonKey: data.data.supabaseAnonKey,
        };
      }
    }
  } catch (err) {
    console.warn('[SupabaseAuth] Could not fetch auth config from /api/auth/config:', err);
  }

  return {
    configured: false,
    supabaseUrl: '',
    supabaseAnonKey: '',
  };
}

/**
 * Initializes and caches the Supabase browser client for authentication.
 */
export async function getBrowserSupabase(): Promise<SupabaseClient | null> {
  if (supabaseClientInstance) {
    return supabaseClientInstance;
  }

  if (clientInitPromise) {
    return clientInitPromise;
  }

  clientInitPromise = (async () => {
    const config = await fetchAuthConfig();
    if (config.configured && config.supabaseUrl && config.supabaseAnonKey) {
      try {
        supabaseClientInstance = createClient(config.supabaseUrl, config.supabaseAnonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage: typeof window !== 'undefined' ? window.localStorage : undefined,
          },
        });
        return supabaseClientInstance;
      } catch (err) {
        console.error('[SupabaseAuth] Failed to initialize Supabase client:', err);
        return null;
      }
    }
    return null;
  })();

  return clientInitPromise;
}

/**
 * Initiates the real Google OAuth sign-in flow via Supabase Auth.
 */
export async function signInWithGoogle(): Promise<{ error?: any }> {
  const client = await getBrowserSupabase();
  if (!client) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY.');
  }

  const redirectUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
    },
  });

  return { error };
}

/**
 * Signs the user out from Supabase Auth and clears local session cache.
 */
export async function signOut(): Promise<void> {
  const client = await getBrowserSupabase();
  if (client) {
    try {
      await client.auth.signOut();
    } catch (err) {
      console.warn('[SupabaseAuth] Sign out error:', err);
    }
  }
  safeStorage.removeItem('jexa_auth_user');
  safeStorage.removeItem('jexa_persistent_user_id');
}

/**
 * Syncs the authenticated user profile with the backend PostgreSQL database.
 */
export async function syncUserProfile(user: User): Promise<UserProfile | null> {
  try {
    const payload = {
      id: user.id,
      email: user.email,
      fullName: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0],
      avatarUrl: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
    };

    const res = await fetch('/api/auth/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': user.id,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return data.data;
      }
    }
  } catch (err) {
    console.warn('[SupabaseAuth] Background profile sync warning:', err);
  }
  return null;
}
