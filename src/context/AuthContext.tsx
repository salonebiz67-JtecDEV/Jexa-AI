import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient, hasConfiguredBackend, setAccessTokenProvider } from '../services/api.client';

export interface AuthUser {
  id: string;
  email?: string;
  role: string;
  isOwner: boolean;
}

export interface AuthSetupInfo {
  authConfigured: boolean;
  hasOwnerConfigured: boolean;
  ownerUserIdConfigured: boolean;
  ownerEmailConfigured: boolean;
  serviceRoleConfigured: boolean;
  requireAuthForChat: boolean;
}

interface AuthContextValue {
  authenticated: boolean;
  isOwner: boolean;
  user: AuthUser | null;
  expiresAtMs: number | null;
  setup: AuthSetupInfo;
  isLoading: boolean;
  isSubmitting: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string; isOwner?: boolean }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  clearAuthError: () => void;
}

const DEFAULT_SETUP: AuthSetupInfo = {
  authConfigured: false,
  hasOwnerConfigured: false,
  ownerUserIdConfigured: false,
  ownerEmailConfigured: false,
  serviceRoleConfigured: false,
  requireAuthForChat: false,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Authentication tokens are held ONLY in React/JS memory (never in localStorage or sessionStorage)
  const accessTokenRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const [setup, setSetup] = useState<AuthSetupInfo>(DEFAULT_SETUP);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const clearScheduledRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const clearMemorySession = useCallback(
    (errorMsg?: string | null) => {
      clearScheduledRefresh();
      accessTokenRef.current = null;
      setUser(null);
      setExpiresAtMs(null);
      if (errorMsg !== undefined) {
        setAuthError(errorMsg);
      }
    },
    [clearScheduledRefresh]
  );

  // Register in-memory Bearer token provider on ApiClient
  useEffect(() => {
    setAccessTokenProvider(() => {
      const tok = accessTokenRef.current;
      if (!tok) return null;
      return tok;
    });
    return () => {
      setAccessTokenProvider(null);
    };
  }, []);

  const scheduleProactiveRefresh = useCallback(
    (nextExpiresAtMs: number | undefined, doRefresh: () => Promise<boolean>) => {
      clearScheduledRefresh();
      if (!nextExpiresAtMs) return;
      const msUntilRefresh = Math.max(15_000, nextExpiresAtMs - Date.now() - 45_000);
      refreshTimerRef.current = setTimeout(() => {
        void doRefresh();
      }, msUntilRefresh);
    },
    [clearScheduledRefresh]
  );

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const res = await ApiClient.refreshAuthSession();
      accessTokenRef.current = res.accessToken;
      setUser(res.user);
      setExpiresAtMs(res.expiresAtMs || null);
      if (res.setup) setSetup(res.setup);
      setAuthError(null);
      scheduleProactiveRefresh(res.expiresAtMs, refreshSession);
      return true;
    } catch {
      clearMemorySession();
      return false;
    }
  }, [clearMemorySession, scheduleProactiveRefresh]);

  // Restore session cleanly via HttpOnly cookie on startup (only when backend is configured)
  useEffect(() => {
    let active = true;
    const initSession = async () => {
      if (!hasConfiguredBackend()) {
        setSetup(DEFAULT_SETUP);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const sessionStatus = await ApiClient.getAuthSession();
        if (!active) return;
        if (sessionStatus?.setup) {
          setSetup(sessionStatus.setup);
        }
        if (sessionStatus?.setup?.authConfigured) {
          try {
            const refreshed = await ApiClient.refreshAuthSession();
            if (!active) return;
            accessTokenRef.current = refreshed.accessToken;
            setUser(refreshed.user);
            setExpiresAtMs(refreshed.expiresAtMs || null);
            if (refreshed.setup) setSetup(refreshed.setup);
            scheduleProactiveRefresh(refreshed.expiresAtMs, refreshSession);
          } catch {
            // No active HttpOnly refresh cookie; stay cleanly signed out
          }
        }
      } catch {
        // Server unreachable or unconfigured
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void initSession();

    const handleExpired = () => {
      if (accessTokenRef.current) {
        clearMemorySession('Your session expired. Please sign in again.');
      }
    };

    window.addEventListener('jexa:auth-expired', handleExpired);
    return () => {
      active = false;
      clearScheduledRefresh();
      window.removeEventListener('jexa:auth-expired', handleExpired);
    };
  }, [clearMemorySession, clearScheduledRefresh, refreshSession, scheduleProactiveRefresh]);

  const login = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ ok: boolean; error?: string; isOwner?: boolean }> => {
      setIsSubmitting(true);
      setAuthError(null);
      try {
        const res = await ApiClient.loginWithEmail(email, password);
        accessTokenRef.current = res.accessToken;
        setUser(res.user);
        setExpiresAtMs(res.expiresAtMs || null);
        if (res.setup) setSetup(res.setup);
        scheduleProactiveRefresh(res.expiresAtMs, refreshSession);
        return { ok: true, isOwner: res.user.isOwner };
      } catch (err: any) {
        const msg = err?.message || 'Sign-in failed. Check your email and password.';
        setAuthError(msg);
        return { ok: false, error: msg };
      } finally {
        setIsSubmitting(false);
      }
    },
    [refreshSession, scheduleProactiveRefresh]
  );

  const logout = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await ApiClient.logoutSession();
    } catch {
      // Clear local session regardless of network error
    } finally {
      clearMemorySession(null);
      setIsSubmitting(false);
    }
  }, [clearMemorySession]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <AuthContext.Provider
      value={{
        authenticated: Boolean(user && accessTokenRef.current),
        isOwner: Boolean(user?.isOwner && accessTokenRef.current),
        user,
        expiresAtMs,
        setup,
        isLoading,
        isSubmitting,
        authError,
        login,
        logout,
        refreshSession,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
