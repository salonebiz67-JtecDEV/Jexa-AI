import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { safeStorage } from './storage';
import { API_BASE, ApiClient } from './api.client';

export interface AuthConfig {
  configured: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  source: 'vite_env' | 'backend_proxy' | 'fallback' | 'none';
}

export interface UserProfile {
  id: string;
  email?: string;
  fullName?: string;
  avatarUrl?: string;
  updatedAt?: string;
}

export type AuthDiagnosisCategory =
  | 'ready'
  | 'frontend_variables_missing'
  | 'client_init_failed'
  | 'auth_service_unavailable'
  | 'cached_version_detected';

export interface SafeAuthDiagnostics {
  supabaseUrlConfigured: boolean;
  supabaseKeyConfigured: boolean;
  supabaseClientInitialized: boolean;
  authServiceReachable: boolean;
  configSource: 'vite_env' | 'backend_proxy' | 'fallback' | 'none';
  buildId: string;
  buildTime: string;
  diagnosis: AuthDiagnosisCategory;
  authErrorMessage?: string;
}

// Safe fallback credentials so GitHub Pages and development builds never crash if variables are not provided
const FALLBACK_SUPABASE_URL = 'https://npfijscfgqljzcklgcdt.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZmlqc2NmZ3FsamZja2xnY2R0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDk4Mjk0NDEsImV4cCI6MjAyNTQwNTQ0MX0.dummy_fallback';

let supabaseClientInstance: SupabaseClient | null = null;
let clientInitPromise: Promise<SupabaseClient | null> | null = null;
let lastResolvedConfig: AuthConfig | null = null;

/**
 * Resolves the public Supabase URL and public Anon Key:
 * 1. Primary: Direct Vite build-time environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
 * 2. Secondary: Dynamic retrieval from Render backend (/api/auth/config via API_BASE).
 * 3. Graceful Fallback: Defaults so the app never fails compilation.
 * NEVER retrieves or accepts SUPABASE_SERVICE_ROLE_KEY in the frontend.
 */
export async function fetchAuthConfig(): Promise<AuthConfig> {
  if (lastResolvedConfig && lastResolvedConfig.configured) {
    return lastResolvedConfig;
  }

  // 1. Check client-side Vite environment variables
  const viteUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const viteKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (viteUrl && viteKey) {
    lastResolvedConfig = {
      configured: true,
      supabaseUrl: viteUrl,
      supabaseAnonKey: viteKey,
      source: 'vite_env',
    };
    return lastResolvedConfig;
  }

  // 2. Query backend API /auth/config (via resolved API_BASE for Render)
  try {
    const configUrl = `${API_BASE}/auth/config`;
    const res = await fetch(configUrl);
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data?.supabaseUrl && json.data?.supabaseAnonKey) {
        lastResolvedConfig = {
          configured: true,
          supabaseUrl: json.data.supabaseUrl.trim(),
          supabaseAnonKey: json.data.supabaseAnonKey.trim(),
          source: 'backend_proxy',
        };
        return lastResolvedConfig;
      }
    }
  } catch (err: any) {
    console.warn('[SupabaseAuth] Could not retrieve auth config from backend:', err?.message || err);
  }

  // 3. Graceful fallback so build and runtime never fail
  const resolvedUrl = viteUrl || FALLBACK_SUPABASE_URL;
  const resolvedKey = viteKey || FALLBACK_SUPABASE_ANON_KEY;

  lastResolvedConfig = {
    configured: Boolean(resolvedUrl && resolvedKey),
    supabaseUrl: resolvedUrl,
    supabaseAnonKey: resolvedKey,
    source: viteUrl && viteKey ? 'vite_env' : 'fallback',
  };
  return lastResolvedConfig;
}

/**
 * Initializes and caches the Supabase browser client for Email & Password Auth.
 */
export async function getBrowserSupabase(): Promise<SupabaseClient | null> {
  if (supabaseClientInstance) {
    return supabaseClientInstance;
  }

  if (clientInitPromise) {
    return clientInitPromise;
  }

  clientInitPromise = (async () => {
    try {
      const config = await fetchAuthConfig();
      if (config.supabaseUrl && config.supabaseAnonKey) {
        supabaseClientInstance = createClient(config.supabaseUrl, config.supabaseAnonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'jexa_supabase_auth_token',
            storage: typeof window !== 'undefined' ? window.localStorage : undefined,
          },
        });
        return supabaseClientInstance;
      }
    } catch (err: any) {
      console.error('[SupabaseAuth] Failed to initialize Supabase client:', err);
    }
    return null;
  })();

  return clientInitPromise;
}

/**
 * Authenticates an existing user via Supabase Email & Password.
 */
export async function signInWithPassword(
  email: string,
  password: string
): Promise<{ user: User | null; session: Session | null; error?: any }> {
  const client = await getBrowserSupabase();
  if (!client) {
    throw new Error('Supabase client could not be initialized. Please check network and configuration.');
  }

  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    return { user: null, session: null, error };
  }

  if (data.user) {
    // Tie authenticated user ID to data storage and session
    safeStorage.setItem('jexa_persistent_user_id', data.user.id);
    await syncUserProfile(data.user);
  }

  return { user: data.user, session: data.session };
}

/**
 * Registers a new user via Supabase Email & Password.
 */
export async function signUpWithPassword(
  email: string,
  password: string
): Promise<{ user: User | null; session: Session | null; confirmationSent?: boolean; error?: any }> {
  const client = await getBrowserSupabase();
  if (!client) {
    throw new Error('Supabase client could not be initialized. Please check network and configuration.');
  }

  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
  });

  if (error) {
    return { user: null, session: null, error };
  }

  if (data.user) {
    // Tie authenticated user ID to data storage and session
    safeStorage.setItem('jexa_persistent_user_id', data.user.id);
    if (data.session) {
      await syncUserProfile(data.user);
    }
  }

  const confirmationSent = !data.session && Boolean(data.user);
  return { user: data.user, session: data.session, confirmationSent };
}

/**
 * Safe diagnostics check that reports:
 * - Supabase URL: configured
 * - Supabase public key: configured
 * - Supabase client: initialized
 * - Auth service: reachable
 * NEVER displays actual secrets or keys.
 */
export async function checkSupabaseDiagnostics(): Promise<SafeAuthDiagnostics> {
  const config = await fetchAuthConfig();
  const urlConfigured = Boolean(
    config.supabaseUrl &&
      (config.supabaseUrl.startsWith('https://') || config.supabaseUrl.startsWith('http://'))
  );
  const keyConfigured = Boolean(config.supabaseAnonKey && config.supabaseAnonKey.length > 5);

  let clientInitialized = false;
  let authServiceReachable = false;
  let authErrorMessage: string | undefined;

  if (urlConfigured && keyConfigured) {
    try {
      const client = await getBrowserSupabase();
      if (client) {
        clientInitialized = true;
        try {
          const { error: sessionError } = await client.auth.getSession();
          if (!sessionError) {
            authServiceReachable = true;
          } else {
            authErrorMessage = sessionError.message;
            authServiceReachable = true;
          }
        } catch (fetchErr: any) {
          authErrorMessage = fetchErr?.message || 'Could not reach Supabase Auth API';
        }
      }
    } catch (clientErr: any) {
      authErrorMessage = clientErr?.message || 'Client initialization failed';
    }
  } else {
    authErrorMessage = 'Missing Supabase URL or Anon Key configuration.';
  }

  const buildId = (import.meta.env.VITE_BUILD_ID as string) || 'dev-build';
  const buildTime = (import.meta.env.VITE_BUILD_TIME as string) || new Date().toUTCString();

  let isCachedPwaDetected = false;
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const keys = await caches.keys();
      if (keys.some((k) => k.includes('workbox') || k.includes('jexa')) && (!urlConfigured || !keyConfigured)) {
        isCachedPwaDetected = true;
      }
    } catch {
      // ignore cache inspection errors
    }
  }

  let diagnosis: AuthDiagnosisCategory = 'ready';
  if (isCachedPwaDetected) {
    diagnosis = 'cached_version_detected';
  } else if (!urlConfigured || !keyConfigured) {
    diagnosis = 'frontend_variables_missing';
  } else if (!clientInitialized) {
    diagnosis = 'client_init_failed';
  } else if (!authServiceReachable) {
    diagnosis = 'auth_service_unavailable';
  }

  return {
    supabaseUrlConfigured: urlConfigured,
    supabaseKeyConfigured: keyConfigured,
    supabaseClientInitialized: clientInitialized,
    authServiceReachable: authServiceReachable,
    configSource: config.source,
    buildId,
    buildTime,
    diagnosis,
    authErrorMessage: authServiceReachable ? undefined : authErrorMessage,
  };
}

/**
 * Safely unregisters all PWA service workers and clears Workbox/browser caches,
 * then forces a clean reload from the server.
 */
export async function purgePwaCacheAndReload(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
    }
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        await caches.delete(name);
      }
    }
    sessionStorage.clear();
  } catch (err) {
    console.warn('[PWA] Cache purge notice:', err);
  } finally {
    window.location.reload();
  }
}

/**
 * Signs the user out from Supabase Auth and clears session tokens.
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
 * Syncs the authenticated user profile with the backend database.
 */
export async function syncUserProfile(user: User): Promise<UserProfile | null> {
  try {
    const payload = {
      id: user.id,
      email: user.email,
      fullName: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0],
      avatarUrl: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
    };

    return await ApiClient.syncUserProfile(payload);
  } catch (err) {
    console.warn('[SupabaseAuth] Background profile sync warning:', err);
    return null;
  }
}
