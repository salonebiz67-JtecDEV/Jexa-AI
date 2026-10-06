import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { User, Session } from '@supabase/supabase-js';
import {
  getBrowserSupabase,
  signInWithGoogle as supabaseSignInGoogle,
  signOut as supabaseSignOut,
  syncUserProfile,
  fetchAuthConfig,
} from '../services/supabaseAuth';
import { setAuthenticatedUser } from '../services/api.client';
import { safeStorage } from '../services/storage';

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
  error: string | null;
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
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

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
        const config = await fetchAuthConfig();
        if (mounted) {
          setIsConfigured(config.configured);
        }

        if (!config.configured) {
          // Check if previously in guest mode
          const savedGuest = safeStorage.getItem('jexa_guest_mode');
          if (savedGuest === 'true' && mounted) {
            setUser(DEFAULT_GUEST_USER);
            setAuthenticatedUser(DEFAULT_GUEST_USER.id, null);
          }
          if (mounted) setIsLoading(false);
          return;
        }

        const supabase = await getBrowserSupabase();
        if (!supabase) {
          if (mounted) setIsLoading(false);
          return;
        }

        // 1. Get current active session
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) {
          console.warn('[AuthContext] Session retrieval error:', sessionErr.message);
        }

        if (sessionData?.session?.user && mounted) {
          const authUser = mapSupabaseUser(sessionData.session.user);
          setUser(authUser);
          setSession(sessionData.session);
          setAuthenticatedUser(authUser.id, sessionData.session.access_token);
          safeStorage.removeItem('jexa_guest_mode');

          // Sync profile with PostgreSQL backend
          syncUserProfile(sessionData.session.user).catch((err) =>
            console.warn('[AuthContext] Profile sync error:', err)
          );
        } else {
          // Check if user previously chose guest mode
          const savedGuest = safeStorage.getItem('jexa_guest_mode');
          if (savedGuest === 'true' && mounted) {
            setUser(DEFAULT_GUEST_USER);
            setAuthenticatedUser(DEFAULT_GUEST_USER.id, null);
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
              safeStorage.removeItem('jexa_guest_mode');
              setError(null);

              // Clean up OAuth tokens from URL if present
              if (typeof window !== 'undefined' && (window.location.hash || window.location.search.includes('code='))) {
                window.history.replaceState({}, document.title, window.location.pathname);
              }

              // Background profile sync
              syncUserProfile(newSession.user).catch(console.warn);
            }
          } else if (event === 'SIGNED_OUT') {
            setUser(null);
            setSession(null);
            setAuthenticatedUser(null, null);
            safeStorage.removeItem('jexa_guest_mode');
          }
        });

        return () => {
          listener.subscription.unsubscribe();
        };
      } catch (err: any) {
        console.error('[AuthContext] Auth initialization error:', err);
        if (mounted) setError(err.message || 'Failed to initialize authentication.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initAuth();

    return () => {
      mounted = false;
    };
  }, [mapSupabaseUser]);

  // Google OAuth Sign-in Handler
  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      const { error: signInErr } = await supabaseSignInGoogle();
      if (signInErr) {
        throw signInErr;
      }
    } catch (err: any) {
      console.error('[AuthContext] Google sign-in error:', err);
      setError(
        err.message ||
          'Failed to connect to Google OAuth. Please check Supabase Google provider configuration.'
      );
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
    setError(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      session,
      isLoading,
      isConfigured,
      error,
      signInWithGoogle,
      signOut,
      continueAsGuest,
      clearError,
    }),
    [user, session, isLoading, isConfigured, error, signInWithGoogle, signOut, continueAsGuest, clearError]
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
