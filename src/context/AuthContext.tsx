import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { User, Session } from '@supabase/supabase-js';
import {
  getBrowserSupabase,
  signInWithPassword as supabaseSignInPassword,
  signUpWithPassword as supabaseSignUpPassword,
  signOut as supabaseSignOut,
  syncUserProfile,
  checkSupabaseDiagnostics,
  SafeAuthDiagnostics,
  purgePwaCacheAndReload,
} from '../services/supabaseAuth';
import { setAuthenticatedUser } from '../services/api.client';
import { safeStorage } from '../services/storage';

export type AuthStatusCategory =
  | 'idle'
  | 'config_missing'
  | 'auth_failed'
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
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<{ confirmationSent?: boolean }>;
  signOut: () => Promise<void>;
  continueAsGuest: () => void;
  forcePurgeCache: () => Promise<void>;
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

  // Initial session restoration and auth state listener
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const diag = await runDiagnostics();
        if (!mounted) return;

        // Check if user previously chose Guest mode
        const isGuestMode = safeStorage.getItem('jexa_guest_mode') === 'true';
        if (isGuestMode) {
          setUser(DEFAULT_GUEST_USER);
          setAuthenticatedUser(DEFAULT_GUEST_USER.id, null);
          setAuthStatus('success');
          setIsLoading(false);
          return;
        }

        const supabase = await getBrowserSupabase();
        if (!supabase) {
          if (mounted) {
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
          safeStorage.setItem('jexa_auth_user', JSON.stringify(authUser));
          safeStorage.setItem('jexa_persistent_user_id', authUser.id);
          setAuthStatus('success');
          // Background sync profile
          syncUserProfile(sessionData.session.user).catch(console.warn);
        } else {
          // Check cached local storage fallback
          const cached = safeStorage.getItem('jexa_auth_user');
          if (cached && mounted) {
            try {
              const parsed = JSON.parse(cached);
              if (parsed?.id) {
                setUser(parsed);
                setAuthenticatedUser(parsed.id, null);
                safeStorage.setItem('jexa_persistent_user_id', parsed.id);
              }
            } catch {
              safeStorage.removeItem('jexa_auth_user');
            }
          }
        }

        // 2. Subscribe to auth state changes
        const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
          if (!mounted) return;
          console.log('[AuthContext] Auth event:', event);

          if (event === 'SIGNED_IN' && newSession?.user) {
            const authUser = mapSupabaseUser(newSession.user);
            setUser(authUser);
            setSession(newSession);
            setAuthenticatedUser(authUser.id, newSession.access_token);
            safeStorage.setItem('jexa_auth_user', JSON.stringify(authUser));
            safeStorage.setItem('jexa_persistent_user_id', authUser.id);
            safeStorage.removeItem('jexa_guest_mode');
            setAuthStatus('success');
            setError(null);
            syncUserProfile(newSession.user).catch(console.warn);
          } else if (event === 'SIGNED_OUT') {
            setUser(null);
            setSession(null);
            setAuthenticatedUser(null, null);
            safeStorage.removeItem('jexa_auth_user');
            safeStorage.removeItem('jexa_persistent_user_id');
            safeStorage.removeItem('jexa_guest_mode');
            setAuthStatus('idle');
          } else if (event === 'TOKEN_REFRESHED' && newSession?.user) {
            setSession(newSession);
            setAuthenticatedUser(newSession.user.id, newSession.access_token);
          }
        });

        return () => {
          listener?.subscription?.unsubscribe();
        };
      } catch (err: any) {
        console.error('[AuthContext] Auth initialization error:', err);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initAuth();

    return () => {
      mounted = false;
    };
  }, [mapSupabaseUser, runDiagnostics]);

  // Email & Password Sign-in Handler
  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const diag = await checkSupabaseDiagnostics();
      setDiagnostics(diag);

      const result = await supabaseSignInPassword(email, password);
      if (result.error) {
        setAuthStatus('auth_failed');
        setError(result.error.message || 'Login failed. Please check your credentials.');
        throw result.error;
      }

      if (result.user) {
        const authUser = mapSupabaseUser(result.user);
        setUser(authUser);
        setSession(result.session);
        setAuthenticatedUser(authUser.id, result.session?.access_token);
        safeStorage.setItem('jexa_auth_user', JSON.stringify(authUser));
        safeStorage.setItem('jexa_persistent_user_id', authUser.id);
        safeStorage.removeItem('jexa_guest_mode');
        setAuthStatus('success');
        setError(null);
      }
    } catch (err: any) {
      console.error('[AuthContext] Email sign-in error:', err);
      setError(err?.message || 'Login failed. Please check your email and password.');
      throw err;
    }
  }, [mapSupabaseUser]);

  // Email & Password Sign-up Handler
  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const diag = await checkSupabaseDiagnostics();
      setDiagnostics(diag);

      const result = await supabaseSignUpPassword(email, password);
      if (result.error) {
        setAuthStatus('auth_failed');
        setError(result.error.message || 'Sign up failed.');
        throw result.error;
      }

      if (result.user && result.session) {
        const authUser = mapSupabaseUser(result.user);
        setUser(authUser);
        setSession(result.session);
        setAuthenticatedUser(authUser.id, result.session.access_token);
        safeStorage.setItem('jexa_auth_user', JSON.stringify(authUser));
        safeStorage.setItem('jexa_persistent_user_id', authUser.id);
        safeStorage.removeItem('jexa_guest_mode');
        setAuthStatus('success');
        setError(null);
      }

      return { confirmationSent: result.confirmationSent };
    } catch (err: any) {
      console.error('[AuthContext] Email sign-up error:', err);
      setError(err?.message || 'Registration failed.');
      throw err;
    }
  }, [mapSupabaseUser]);

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
    safeStorage.setItem('jexa_persistent_user_id', DEFAULT_GUEST_USER.id);
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
      signInWithEmail,
      signUpWithEmail,
      signOut,
      continueAsGuest,
      forcePurgeCache: purgePwaCacheAndReload,
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
      signInWithEmail,
      signUpWithEmail,
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
