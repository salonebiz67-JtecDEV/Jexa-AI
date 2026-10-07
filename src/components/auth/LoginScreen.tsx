import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  Sparkles,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Database,
  ArrowRight,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
} from 'lucide-react';

export const LoginScreen: React.FC = () => {
  const {
    signInWithGoogle,
    continueAsGuest,
    error,
    clearError,
    isConfigured,
    authStatus,
    diagnostics,
    runDiagnostics,
  } = useAuth();

  const [isConnecting, setIsConnecting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isRunningCheck, setIsRunningCheck] = useState(false);

  // Auto-run diagnostics on mount if not loaded yet
  useEffect(() => {
    if (!diagnostics) {
      runDiagnostics().catch(console.warn);
    }
  }, [diagnostics, runDiagnostics]);

  const handleGoogleSignIn = async () => {
    setIsConnecting(true);
    setLocalError(null);
    clearError();
    try {
      await signInWithGoogle();
      // Redirects to Google consent screen
    } catch (err: any) {
      setIsConnecting(false);
      setLocalError(err?.message || 'Authentication could not be initiated.');
    }
  };

  const handleRefreshDiagnostics = async () => {
    setIsRunningCheck(true);
    try {
      await runDiagnostics();
    } finally {
      setIsRunningCheck(false);
    }
  };

  const displayError = localError || error;

  // Determine user-friendly category guidance
  const renderCategorizedNotice = () => {
    if (authStatus === 'config_missing' || !isConfigured) {
      return (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200/90 space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 font-semibold text-amber-300">
            <Database className="w-4 h-4 shrink-0" />
            <span>Frontend Supabase Configuration Missing</span>
          </div>
          <p className="text-slate-300 leading-relaxed text-[11px]">
            The GitHub Pages frontend requires public Supabase variables to initiate Google OAuth.
            Add <code className="text-amber-200 bg-amber-950/60 px-1 py-0.5 rounded font-mono">VITE_SUPABASE_URL</code> and{' '}
            <code className="text-amber-200 bg-amber-950/60 px-1 py-0.5 rounded font-mono">VITE_SUPABASE_ANON_KEY</code> in{' '}
            <span className="text-white font-medium">GitHub Repo Settings → Secrets and variables → Actions → Variables</span>.
          </p>
          <div className="pt-1 flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={() => setShowDiagnostics(true)}
              className="text-amber-400 hover:text-amber-200 underline font-medium"
            >
              View Configuration Diagnostics
            </button>
            <span className="text-slate-400 text-[10px]">
              Requires VITE_SUPABASE_* variables
            </span>
          </div>
        </div>
      );
    }

    if (authStatus === 'oauth_not_configured') {
      return (
        <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 text-xs text-indigo-200/90 space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 font-semibold text-indigo-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Google OAuth Not Configured in Supabase</span>
          </div>
          <p className="text-slate-300 leading-relaxed text-[11px]">
            The Supabase client is connected, but Google sign-in is not enabled in your Supabase project dashboard.
            Navigate to <span className="text-white font-medium">Authentication → Providers → Google</span> in Supabase and toggle it on.
          </p>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                setLocalError(null);
                clearError();
              }}
              className="text-[11px] text-indigo-400 hover:text-indigo-200 underline"
            >
              Dismiss Notice
            </button>
          </div>
        </div>
      );
    }

    if (authStatus === 'user_cancelled') {
      return (
        <div className="p-3.5 rounded-2xl bg-slate-500/10 border border-slate-500/25 text-xs text-slate-300 space-y-1.5 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <Info className="w-4 h-4 shrink-0 text-slate-400" />
            <span>Google Sign-In Cancelled</span>
          </div>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            The authentication prompt was closed or declined. You can continue whenever you are ready.
          </p>
          <button
            type="button"
            onClick={() => {
              setLocalError(null);
              clearError();
            }}
            className="text-[11px] text-slate-400 hover:text-white underline"
          >
            Dismiss
          </button>
        </div>
      );
    }

    if (displayError) {
      return (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 space-y-1.5 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 font-semibold text-rose-200">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>Authentication Error</span>
          </div>
          <p className="leading-relaxed text-[11px]">{displayError}</p>
          <div className="pt-1 flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={() => {
                setLocalError(null);
                clearError();
              }}
              className="text-rose-400 hover:text-rose-200 underline"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="text-slate-400 hover:text-white underline"
            >
              Check Diagnostics
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-[#070a12] text-slate-100 overflow-hidden px-4 selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Ambient background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-gradient-to-tr from-emerald-500/10 via-cyan-500/10 to-teal-500/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Grid texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px]"
        aria-hidden="true"
      />

      {/* Centered Authentication Card */}
      <div className="relative w-full max-w-md bg-[#0c111e]/90 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-8 sm:p-10 shadow-[0_24px_64px_rgba(0,0,0,0.6)] space-y-6 animate-in fade-in zoom-in-95 duration-300">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          {/* Glowing Neural Companion Orb */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500/20 via-cyan-500/15 to-teal-500/10 border border-emerald-500/30 shadow-[0_0_28px_rgba(16,185,129,0.25)] relative mb-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 animate-pulse shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 blur-sm pointer-events-none" />
          </div>

          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-white font-['Syne',sans-serif]">
              JEXA
            </h1>
            <p className="text-xs font-semibold tracking-wider uppercase text-emerald-400/90 font-mono">
              Powered by JOHNEY TEC
            </p>
          </div>

          <p className="text-slate-400 text-sm font-normal pt-1">
            Your personal AI companion.
          </p>
        </div>

        {/* Categorized Notice (Missing Config, Not Enabled, Cancelled, Failure) */}
        {renderCategorizedNotice()}

        {/* Primary Action Section */}
        <div className="space-y-3.5 pt-1">
          {/* REAL Google OAuth Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isConnecting}
            className="w-full flex items-center justify-center gap-3.5 px-5 py-3.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-sm shadow-[0_4px_16px_rgba(255,255,255,0.12)] hover:shadow-[0_6px_22px_rgba(255,255,255,0.2)] transition-all duration-200 active:scale-[0.98] disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed group"
          >
            {isConnecting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-slate-700" />
                <span>Connecting to Google...</span>
              </>
            ) : (
              <>
                {/* Official Google G Icon */}
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>
        </div>

        {/* Collapsible Safe Diagnostics Section */}
        <div className="pt-2 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="w-full flex items-center justify-between p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>Supabase Auth Diagnostics</span>
            </div>
            {showDiagnostics ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>

          {showDiagnostics && (
            <div className="mt-2.5 p-3.5 rounded-2xl bg-black/60 border border-white/[0.08] space-y-2.5 text-xs font-mono">
              <div className="flex items-center justify-between text-[11px] pb-1.5 border-b border-white/[0.06]">
                <span className="text-slate-400">Environment Verification</span>
                <button
                  type="button"
                  onClick={handleRefreshDiagnostics}
                  disabled={isRunningCheck}
                  className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isRunningCheck ? 'animate-spin' : ''}`} />
                  <span>Re-check</span>
                </button>
              </div>

              {/* Status 1: Supabase URL */}
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Supabase URL configured:</span>
                {diagnostics?.supabaseUrlConfigured ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> true
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-400 font-semibold text-[11px]">
                    <XCircle className="w-3.5 h-3.5" /> false
                  </span>
                )}
              </div>

              {/* Status 2: Supabase Public Key */}
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Supabase public key configured:</span>
                {diagnostics?.supabaseKeyConfigured ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> true
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-400 font-semibold text-[11px]">
                    <XCircle className="w-3.5 h-3.5" /> false
                  </span>
                )}
              </div>

              {/* Status 3: Supabase Client */}
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Supabase client initialized:</span>
                {diagnostics?.supabaseClientInitialized ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> true
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-400 font-semibold text-[11px]">
                    <XCircle className="w-3.5 h-3.5" /> false
                  </span>
                )}
              </div>

              {/* Status 4: Auth Service */}
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Auth service reachable:</span>
                {diagnostics?.authServiceReachable ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> true
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-400 font-semibold text-[11px]">
                    <XCircle className="w-3.5 h-3.5" /> false
                  </span>
                )}
              </div>

              {/* Source & Redirect URI */}
              <div className="pt-2 border-t border-white/[0.04] text-[10px] space-y-1 text-slate-500">
                <div className="flex items-center justify-between">
                  <span>Source:</span>
                  <span className="text-slate-300 capitalize">
                    {diagnostics?.configSource === 'vite_env'
                      ? 'Vite Build Environment (VITE_*)'
                      : diagnostics?.configSource === 'backend_proxy'
                      ? 'Render Backend Proxy'
                      : 'None'}
                  </span>
                </div>
                <div className="truncate">
                  <span className="block mb-0.5">OAuth Redirect URI:</span>
                  <span className="text-slate-300 select-all" title={diagnostics?.redirectUrl}>
                    {diagnostics?.redirectUrl || 'Detecting...'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Security & Isolation Callout */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/80" />
            <span>Isolated User Memory (RLS)</span>
          </div>
          <span className="font-mono text-[10px]">Supabase Auth</span>
        </div>
      </div>
    </div>
  );
};
