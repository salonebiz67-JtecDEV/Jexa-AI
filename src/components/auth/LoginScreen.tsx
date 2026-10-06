import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Sparkles, AlertCircle, RefreshCw, ShieldCheck, Database, ArrowRight } from 'lucide-react';

export const LoginScreen: React.FC = () => {
  const { signInWithGoogle, continueAsGuest, error, clearError, isConfigured } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setIsConnecting(true);
    setLocalError(null);
    clearError();
    try {
      await signInWithGoogle();
      // Browser redirects to Google OAuth consent
    } catch (err: any) {
      setIsConnecting(false);
      setLocalError(
        err?.message ||
          'Failed to initialize Google Sign-in. Please ensure Google OAuth is enabled in your Supabase project.'
      );
    }
  };

  const displayError = localError || error;

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
      <div className="relative w-full max-w-md bg-[#0c111e]/90 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-8 sm:p-10 shadow-[0_24px_64px_rgba(0,0,0,0.6)] space-y-8 animate-in fade-in zoom-in-95 duration-300">
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

        {/* Error Notification Alert */}
        {displayError && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-3 text-xs text-rose-300 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="font-medium">{displayError}</p>
              <button
                type="button"
                onClick={() => {
                  setLocalError(null);
                  clearError();
                }}
                className="text-[11px] text-rose-400 hover:text-rose-200 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Primary Action Section */}
        <div className="space-y-3.5">
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

          {/* Sandbox Guest Mode Option */}
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={continueAsGuest}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-300 transition-colors py-1 px-3 rounded-lg hover:bg-white/[0.04]"
            >
              <span>Explore as Guest / Sandbox User</span>
              <ArrowRight className="w-3 h-3 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Configuration Notice if Supabase is pending setup */}
        {!isConfigured && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300/90 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-amber-200">
              <Database className="w-3.5 h-3.5" />
              <span>Supabase Cloud Integration</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              To enable live Google OAuth and cloud persistence, configure <code className="text-amber-200 bg-amber-950/40 px-1 py-0.5 rounded">SUPABASE_URL</code> and <code className="text-amber-200 bg-amber-950/40 px-1 py-0.5 rounded">SUPABASE_ANON_KEY</code> in Render Environment or <code className="text-amber-200 bg-amber-950/40 px-1 py-0.5 rounded">.env</code>.
            </p>
          </div>
        )}

        {/* Security & Isolation Callout */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/80" />
            <span>Isolated User Memory (RLS)</span>
          </div>
          <span className="font-mono text-[10px]">v1.0 • Supabase Auth</span>
        </div>
      </div>
    </div>
  );
};
