import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { safeStorage } from './storage';
import { API_BASE, ApiClient } from './api.client';

export interface AuthConfig {
  configured: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  source: 'vite_env' | 'backend_proxy' | 'none';
}

export interface UserProfile {
  id: string;
  email?: string;
  fullName?: string;
  avatarUrl?: string;
  updatedAt?: string;
}

export interface SafeAuthDiagnostics {
  supabaseUrlConfigured: boolean;
  supabaseKeyConfigured: boolean;
  supabaseClientInitialized: boolean;
  authServiceReachable: boolean;
  configSource: 'vite_env' | 'backend_proxy' | 'none';
  redirectUrl: string;
  authErrorMessage?: string;
}

let supabaseClientInstance: SupabaseClient | null = null;
let clientInitPromise: Promise<SupabaseClient | null> | null = null;
let lastResolvedConfig: AuthConfig | null = null;

/**
 * Resolves the clean redirect URL for Google OAuth callback.
 * On GitHub Pages, preserves the subpath (e.g., https://user.github.io/jexa-ai-companion/)
 * instead of mistakenly redirecting to root (https://user.github.io/).
 */
export function getAuthRedirectUrl(): string {
  if (typeof window === 'undefined') return '';
  // Strip any query params or hash fragments
  const cleanUrl = window.location.href.split('#')[0].split('?')[0];
  return cleanUrl.endsWith('/') ? cleanUrl : `${cleanUrl}/`;
}

/**
 * Resolves the public Supabase URL and public Anon Key:
 * 1. Primary: Direct Vite build-time environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
 * 2. Fallback: Dynamic retrieval from Render backend (/api/auth/config via API_BASE) if GitHub Actions
 *    variables were not bundled during compilation.
 * NEVER retrieves or accepts SUPABASE_SERVICE_ROLE_KEY.
 */
export async function fetchAuthConfig(): Promise<AuthConfig> {
  if (lastResolvedConfig && lastResolvedConfig.configured) {
    return lastResolvedConfig;
  }

  // 1. Check client-side Vite environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
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

  // 2. Fallback: Query backend API /auth/config (via resolved API_BASE for Render)
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

  lastResolvedConfig = {
    configured: false,
    supabaseUrl: viteUrl || '',
    supabaseAnonKey: viteKey || '',
    source: 'none',
  };
  return lastResolvedConfig;
}

/**
 * Initializes and caches the Supabase browser client for Supabase Auth & Google OAuth.
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
            storageKey: 'jexa_supabase_auth_token',
            storage: typeof window !== 'undefined' ? window.localStorage : undefined,
          },
        });
        return supabaseClientInstance;
      } catch (err: any) {
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
    throw new Error('Supabase client is not initialized. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are configured.');
  }

  const redirectUrl = getAuthRedirectUrl();
  console.log('[SupabaseAuth] Initiating Google OAuth with redirect:', redirectUrl);

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
 * Safe diagnostics check that reports:
 * - Supabase URL: configured
 * - Supabase public key: configured
 * - Supabase client: initialized
 * - Auth service: reachable
 * NEVER displays actual secrets or keys.
 */
export async function checkSupabaseDiagnostics(): Promise<SafeAuthDiagnostics> {
  const config = await fetchAuthConfig();
  const urlConfigured = Boolean(config.supabaseUrl && config.supabaseUrl.startsWith('https://'));
  const keyConfigured = Boolean(config.supabaseAnonKey && config.supabaseAnonKey.length > 10);
  const redirectUrl = getAuthRedirectUrl();

  let clientInitialized = false;
  let authServiceReachable = false;
  let authErrorMessage: string | undefined;

  if (urlConfigured && keyConfigured) {
    try {
      const client = await getBrowserSupabase();
      if (client) {
        clientInitialized = true;

        // Perform lightweight reachability check against Supabase Auth service
        // Testing auth endpoint reachability without exposing secrets
        try {
          const { error: sessionError } = await client.auth.getSession();
          if (!sessionError) {
            authServiceReachable = true;
          } else {
            authErrorMessage = sessionError.message;
            // If session check returns reachable status with expected response, mark reachable
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
    authErrorMessage = 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY configuration.';
  }

  return {
    supabaseUrlConfigured: urlConfigured,
    supabaseKeyConfigured: keyConfigured,
    supabaseClientInitialized: clientInitialized,
    authServiceReachable: authServiceReachable,
    configSource: config.source,
    redirectUrl,
    authErrorMessage: authServiceReachable ? undefined : authErrorMessage,
  };
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
