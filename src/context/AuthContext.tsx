import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { User, Session } from '@supabase/supabase-js';
import {
  getBrowserSupabase,
  signInWithGoogle as supabaseSignInGoogle,
  signOut as supabaseSignOut,
  syncUserProfile,
  fetchAuthConfig,
  checkSupabaseDiagnostics,
  SafeAuthDiagnostics,
} from '../services/supabaseAuth';
import { setAuthenticatedUser } from '../services/api.client';
import { safeStorage } from '../services/storage';

export type AuthStatusCategory =
  | 'idle'
  | 'config_missing'
  | 'oauth_not_configured'
  | 'auth_failed'
  | 'user_cancelled'
  | 'success';

export interface AuthUser {
  id: string;
  email?: string;
  fullName?: string;
  avatarUrl?: string;
  isGuest?: boolean;
}

export interface AuthContextValue {
  user: AuthUser | null;
  session: Session | null;
  isLoading: boolean;
  isConfigured: boolean;
  authStatus: AuthStatusCategory;
  error: string | null;
  diagnostics: SafeAuthDiagnostics | null;
  runDiagnostics: () => Promise<SafeAuthDiagnostics>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  continueAsGuest: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_GUEST_USER: AuthUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'guest@jexa.local',
  fullName: 'Sandbox Guest',
  avatarUrl: undefined,
  isGuest: true,
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isConfigured, setIsConfigured] = useState<boolean>(true);
  const [authStatus, setAuthStatus] = useState<AuthStatusCategory>('idle');
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<SafeAuthDiagnostics | null>(null);

  const clearError = useCallback(() => {
    setError(null);
    setAuthStatus(user ? 'success' : isConfigured ? 'idle' : 'config_missing');
  }, [user, isConfigured]);

  const runDiagnostics = useCallback(async (): Promise<SafeAuthDiagnostics> => {
    const diag = await checkSupabaseDiagnostics();
    setDiagnostics(diag);
    setIsConfigured(diag.supabaseUrlConfigured && diag.supabaseKeyConfigured);
    return diag;
  }, []);

  // Format Supabase User into AuthUser
  const mapSupabaseUser = useCallback((supabaseUser: User): AuthUser => {
    return {
      id: supabaseUser.id,
      email: supabaseUser.email,
      fullName:
        supabaseUser.user_metadata?.full_name ||
        supabaseUser.user_metadata?.name ||
        supabaseUser.email?.split('@')[0] ||
        'JEXA User',
      avatarUrl:
        supabaseUser.user_metadata?.avatar_url ||
        supabaseUser.user_metadata?.picture ||
        undefined,
      isGuest: false,
    };
  }, []);

  // Parse any OAuth error parameters returned in URL search or hash
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check search query (?error=...) and hash (#error=...)
    const searchParams = new URLSearchParams(window.location.search);
    const hashStr = window.location.hash.startsWith('#')
      ? window.location.hash.substring(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(hashStr);

    const err = searchParams.get('error') || hashParams.get('error');
    const errDesc = searchParams.get('error_description') || hashParams.get('error_description');

    if (err || errDesc) {
      console.warn('[AuthContext] OAuth redirect reported error:', err, errDesc);
      const descLower = (errDesc || '').toLowerCase();

      if (err === 'access_denied' || descLower.includes('cancel') || descLower.includes('declined')) {
        setAuthStatus('user_cancelled');
        setError('Google sign-in was cancelled. You can try again whenever you are ready.');
      } else if (
        descLower.includes('provider is not enabled') ||
        descLower.includes('not enabled') ||
        descLower.includes('disabled')
      ) {
        setAuthStatus('oauth_not_configured');
        setError(
          'Google OAuth is not enabled in your Supabase project. Enable Google in Supabase Dashboard -> Authentication -> Providers.'
        );
      } else {
        setAuthStatus('auth_failed');
        setError(errDesc || `Authentication failed (${err}). Please check Supabase Auth settings.`);
      }

      // Clean URL without losing path
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Initial session restoration and auth state listener
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const diag = await runDiagnostics();
        if (!mounted) return;

        if (!diag.supabaseUrlConfigured || !diag.supabaseKeyConfigured) {
          setIsConfigured(false);
          setAuthStatus('config_missing');
          // Check if user previously used sandbox mode
          const savedGuest = safeStorage.getItem('jexa_guest_mode');
          if (savedGuest === 'true' && mounted) {
            setUser(DEFAULT_GUEST_USER);
            setAuthenticatedUser(DEFAULT_GUEST_USER.id, null);
            setAuthStatus('success');
          }
          if (mounted) setIsLoading(false);
          return;
        }

        setIsConfigured(true);

        const supabase = await getBrowserSupabase();
        if (!supabase) {
          if (mounted) {
            setIsConfigured(false);
            setAuthStatus('config_missing');
            setIsLoading(false);
          }
          return;
        }

        // 1. Get current active session
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) {
          console.warn('[AuthContext] Session check warning:', sessionErr.message);
        }

        if (sessionData?.session?.user && mounted) {
          const authUser = mapSupabaseUser(sessionData.session.user);
          setUser(authUser);
          setSession(sessionData.session);
          setAuthenticatedUser(authUser.id, sessionData.session.access_token);
          setAuthStatus('success');
          safeStorage.removeItem('jexa_guest_mode');

          // Sync profile with PostgreSQL backend
          syncUserProfile(sessionData.session.user).catch((err) =>
            console.warn('[AuthContext] Profile sync error:', err)
          );
        } else {
          // Check if previously in guest mode
          const savedGuest = safeStorage.getItem('jexa_guest_mode');
          if (savedGuest === 'true' && mounted) {
            setUser(DEFAULT_GUEST_USER);
            setAuthenticatedUser(DEFAULT_GUEST_USER.id, null);
            setAuthStatus('success');
          }
        }

        // 2. Subscribe to auth changes (Sign In, Sign Out, Token Refresh)
        const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
          if (!mounted) return;

          console.log(`[AuthContext] Auth event: ${event}`);

          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
            if (newSession?.user) {
              const authUser = mapSupabaseUser(newSession.user);
              setUser(authUser);
              setSession(newSession);
              setAuthenticatedUser(authUser.id, newSession.access_token);
              setAuthStatus('success');
              setError(null);
              safeStorage.removeItem('jexa_guest_mode');

              // Clean up OAuth tokens from URL if present
              if (
                typeof window !== 'undefined' &&
                (window.location.hash.includes('access_token') ||
                  window.location.search.includes('code='))
              ) {
                window.history.replaceState({}, document.title, window.location.pathname);
              }

              // Background profile sync
              syncUserProfile(newSession.user).catch(console.warn);
            }
          } else if (event === 'SIGNED_OUT') {
            setUser(null);
            setSession(null);
            setAuthenticatedUser(null, null);
            setAuthStatus('idle');
            safeStorage.removeItem('jexa_guest_mode');
          }
        });

        return () => {
          listener.subscription.unsubscribe();
        };
      } catch (err: any) {
        console.error('[AuthContext] Auth initialization error:', err);
        if (mounted) {
          setError(err.message || 'Failed to initialize authentication.');
          setAuthStatus('auth_failed');
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initAuth();

    return () => {
      mounted = false;
    };
  }, [mapSupabaseUser, runDiagnostics]);

  // Google OAuth Sign-in Handler
  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      // Re-verify diagnostics before triggering OAuth
      const diag = await checkSupabaseDiagnostics();
      setDiagnostics(diag);

      if (!diag.supabaseUrlConfigured || !diag.supabaseKeyConfigured) {
        setIsConfigured(false);
        setAuthStatus('config_missing');
        const msg =
          'Supabase frontend configuration is missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in GitHub Actions or environment.';
        setError(msg);
        throw new Error(msg);
      }

      const { error: signInErr } = await supabaseSignInGoogle();
      if (signInErr) {
        const msgLower = (signInErr.message || '').toLowerCase();
        if (msgLower.includes('not enabled') || msgLower.includes('provider')) {
          setAuthStatus('oauth_not_configured');
        } else {
          setAuthStatus('auth_failed');
        }
        setError(signInErr.message);
        throw signInErr;
      }
    } catch (err: any) {
      console.error('[AuthContext] Google sign-in trigger error:', err);
      const msgLower = (err?.message || '').toLowerCase();
      if (msgLower.includes('not enabled') || msgLower.includes('provider')) {
        setAuthStatus('oauth_not_configured');
      }
      throw err;
    }
  }, []);

  // Sign out Handler
  const signOut = useCallback(async () => {
    setError(null);
    try {
      await supabaseSignOut();
      setUser(null);
      setSession(null);
      setAuthenticatedUser(null, null);
      setAuthStatus('idle');
      safeStorage.removeItem('jexa_guest_mode');
    } catch (err: any) {
      console.error('[AuthContext] Sign out error:', err);
      setError(err.message || 'Error signing out.');
    }
  }, []);

  // Guest/Sandbox mode fallback
  const continueAsGuest = useCallback(() => {
    setUser(DEFAULT_GUEST_USER);
    setAuthenticatedUser(DEFAULT_GUEST_USER.id, null);
    safeStorage.setItem('jexa_guest_mode', 'true');
    setAuthStatus('success');
    setError(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      session,
      isLoading,
      isConfigured,
      authStatus,
      error,
      diagnostics,
      runDiagnostics,
      signInWithGoogle,
      signOut,
      continueAsGuest,
      clearError,
    }),
    [
      user,
      session,
      isLoading,
      isConfigured,
      authStatus,
      error,
      diagnostics,
      runDiagnostics,
      signInWithGoogle,
      signOut,
      continueAsGuest,
      clearError,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
