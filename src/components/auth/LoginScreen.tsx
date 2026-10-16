import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  Sparkles,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Database,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  ArrowRight,
} from 'lucide-react';

export const LoginScreen: React.FC = () => {
  const {
    signInWithEmail,
    signUpWithEmail,
    continueAsGuest,
    error,
    clearError,
    isConfigured,
    authStatus,
    diagnostics,
    runDiagnostics,
    forcePurgeCache,
  } = useAuth();

  const [email, setEmail] = useState('fatormajohn999@gmail.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<'login' | 'signup' | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isRunningCheck, setIsRunningCheck] = useState(false);

  // Auto-run diagnostics on mount if not loaded yet
  useEffect(() => {
    if (!diagnostics) {
      runDiagnostics().catch(console.warn);
    }
  }, [diagnostics, runDiagnostics]);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email.trim()) {
      setLocalError('Please enter your email address.');
      return;
    }
    if (!password) {
      setLocalError('Please enter your password.');
      return;
    }

    setSubmittingAction('login');
    setLocalError(null);
    setSuccessNotice(null);
    clearError();

    try {
      await signInWithEmail(email.trim(), password);
    } catch (err: any) {
      setLocalError(err?.message || 'Login failed. Please verify your credentials.');
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleSignUp = async () => {
    if (!email.trim()) {
      setLocalError('Please enter an email address to register.');
      return;
    }
    if (!password || password.length < 6) {
      setLocalError('Please provide a password of at least 6 characters.');
      return;
    }

    setSubmittingAction('signup');
    setLocalError(null);
    setSuccessNotice(null);
    clearError();

    try {
      const res = await signUpWithEmail(email.trim(), password);
      if (res?.confirmationSent) {
        setSuccessNotice(
          `Confirmation email sent to ${email.trim()}. Please verify your inbox, then click Log In.`
        );
      } else {
        setSuccessNotice('Account created successfully! Logging you in...');
      }
    } catch (err: any) {
      setLocalError(err?.message || 'Sign up failed. Please try again.');
    } finally {
      setSubmittingAction(null);
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

  // Render contextual diagnostic notices
  const renderCategorizedNotice = () => {
    // Diagnosis E: Cached PWA bundle detected
    if (diagnostics?.diagnosis === 'cached_version_detected') {
      return (
        <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 text-xs text-cyan-200/90 space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 font-semibold text-cyan-300">
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>Diagnosis E: Cached PWA Version Detected</span>
          </div>
          <p className="text-slate-300 leading-relaxed text-[11px]">
            Your browser or device is running a cached bundle from a previous build.
            Click below to purge local cache storage and load the newest build.
          </p>
          <div className="pt-1 flex items-center justify-between text-[11px] gap-2">
            <button
              type="button"
              onClick={forcePurgeCache}
              className="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 font-medium transition-colors"
            >
              Purge Cache & Reload
            </button>
            <button
              type="button"
              onClick={() => setShowDiagnostics(true)}
              className="text-cyan-400 hover:text-cyan-200 underline"
            >
              View Version
            </button>
          </div>
        </div>
      );
    }

    // Diagnosis A: Frontend variables missing notice
    if (diagnostics?.diagnosis === 'frontend_variables_missing' || authStatus === 'config_missing' || !isConfigured) {
      return (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200/90 space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 font-semibold text-amber-300">
            <Database className="w-4 h-4 shrink-0" />
            <span>Supabase Configuration Notice</span>
          </div>
          <p className="text-slate-300 leading-relaxed text-[11px]">
            Operating with graceful build fallbacks. For production authentication, ensure{' '}
            <code className="text-amber-200 bg-amber-950/60 px-1 py-0.5 rounded font-mono break-all">VITE_SUPABASE_URL</code> and{' '}
            <code className="text-amber-200 bg-amber-950/60 px-1 py-0.5 rounded font-mono break-all">VITE_SUPABASE_ANON_KEY</code> are set in your GitHub repository variables.
          </p>
          <div className="pt-1 flex items-center justify-between text-[11px] gap-2">
            <button
              type="button"
              onClick={() => setShowDiagnostics(true)}
              className="text-amber-400 hover:text-amber-200 underline font-medium"
            >
              View Diagnostics Details
            </button>
            <button
              type="button"
              onClick={forcePurgeCache}
              className="text-slate-400 hover:text-amber-300 transition-colors flex items-center gap-1"
              title="Clears any stale PWA cache on this browser"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Purge Cache</span>
            </button>
          </div>
        </div>
      );
    }

    if (successNotice) {
      return (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-200 space-y-1.5 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 font-semibold text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Success</span>
          </div>
          <p className="leading-relaxed text-[11px] text-slate-200">{successNotice}</p>
        </div>
      );
    }

    if (displayError) {
      return (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 space-y-1.5 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 font-semibold text-rose-200">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>Authentication Notice</span>
          </div>
          <p className="leading-relaxed text-[11px]">{displayError}</p>
          <div className="pt-1 flex items-center justify-between text-[11px] gap-2">
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
    <div className="relative min-h-[100dvh] w-full flex flex-col items-center justify-start sm:justify-center overflow-y-auto overflow-x-hidden bg-[#070a12] text-slate-100 selection:bg-emerald-500/20 selection:text-emerald-300 px-3.5 sm:px-6 py-6 sm:py-12 overscroll-y-contain pt-safe pb-safe">
      {/* Ambient background glow effects (fixed to avoid layout stretching) */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] max-w-[90vw] h-[500px] bg-gradient-to-tr from-emerald-500/10 via-cyan-500/10 to-teal-500/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="fixed bottom-10 right-10 w-72 max-w-[80vw] h-72 bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Grid texture overlay */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px]"
        aria-hidden="true"
      />

      {/* Flexible & Responsive Authentication Card */}
      <div className="relative w-full max-w-md my-auto bg-[#0c111e]/90 backdrop-blur-2xl border border-white/[0.08] rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-[0_24px_64px_rgba(0,0,0,0.6)] space-y-5 sm:space-y-6 animate-in fade-in zoom-in-95 duration-300">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          {/* Glowing Neural Companion Orb */}
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-emerald-500/20 via-cyan-500/15 to-teal-500/10 border border-emerald-500/30 shadow-[0_0_24px_rgba(16,185,129,0.25)] relative mb-0.5">
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 animate-pulse shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 blur-sm pointer-events-none" />
          </div>

          <div className="space-y-0.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-['Syne',sans-serif]">
              JEXA
            </h1>
            <p className="text-[10px] sm:text-[11px] font-semibold tracking-wider uppercase text-emerald-400/90 font-mono">
              Powered by JOHNEY TEC
            </p>
          </div>

          <p className="text-slate-400 text-xs sm:text-sm font-normal">
            Autonomous Cognitive AI Companion
          </p>
        </div>

        {/* Categorized Notice */}
        {renderCategorizedNotice()}

        {/* Email & Password Authentication Form */}
        <form onSubmit={handleLogin} className="space-y-3.5 sm:space-y-4">
          {/* Email Field */}
          <div className="space-y-1 text-left">
            <label className="block text-xs font-medium text-slate-300">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck="false"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-10 pr-4 py-2.5 sm:py-3 rounded-xl bg-white/[0.04] border border-white/[0.1] focus:border-emerald-500/50 focus:bg-white/[0.07] text-white placeholder-slate-500 text-base sm:text-sm outline-none transition-all duration-200 min-h-[44px]"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-1 text-left">
            <label className="block text-xs font-medium text-slate-300">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-11 py-2.5 sm:py-3 rounded-xl bg-white/[0.04] border border-white/[0.1] focus:border-emerald-500/50 focus:bg-white/[0.07] text-white placeholder-slate-500 text-base sm:text-sm outline-none transition-all duration-200 min-h-[44px]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer min-h-[44px]"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Action Buttons: Log In & Sign Up */}
          <div className="pt-1.5 grid grid-cols-2 gap-2.5 sm:gap-3">
            {/* Primary Log In Button */}
            <button
              type="submit"
              disabled={submittingAction !== null}
              className="flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs sm:text-sm shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.45)] transition-all duration-200 active:scale-[0.98] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed min-h-[44px]"
            >
              {submittingAction === 'login' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin text-slate-950" />
                  <span>Logging in...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span>Log In</span>
                </>
              )}
            </button>

            {/* Sign Up Button */}
            <button
              type="button"
              onClick={handleSignUp}
              disabled={submittingAction !== null}
              className="flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 hover:text-white font-semibold text-xs sm:text-sm border border-white/[0.1] transition-all duration-200 active:scale-[0.98] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed min-h-[44px]"
            >
              {submittingAction === 'signup' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin text-white" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span>Sign Up</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Sandbox Guest Mode Option */}
        <div className="pt-0.5">
          <button
            type="button"
            onClick={continueAsGuest}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] text-slate-400 hover:text-slate-200 text-xs font-medium border border-white/[0.05] transition-all duration-200 min-h-[40px]"
          >
            <span>Continue as Guest (Sandbox Mode)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Collapsible Diagnostics Section */}
        <div className="pt-2 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="w-full flex items-center justify-between p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Supabase Auth Diagnostics</span>
            </div>
            {showDiagnostics ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            )}
          </button>

          {showDiagnostics && (
            <div className="mt-2.5 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-black/75 border border-white/[0.08] space-y-2.5 text-xs font-mono max-h-[360px] overflow-y-auto overscroll-contain">
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
              <div className="flex items-center justify-between py-0.5">
                <span className="text-slate-400">Supabase URL:</span>
                {diagnostics?.supabaseUrlConfigured ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> configured
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-400 font-semibold text-[11px]">
                    <XCircle className="w-3.5 h-3.5" /> missing
                  </span>
                )}
              </div>

              {/* Status 2: Supabase Public Key */}
              <div className="flex items-center justify-between py-0.5">
                <span className="text-slate-400">Public key:</span>
                {diagnostics?.supabaseKeyConfigured ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> configured
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-400 font-semibold text-[11px]">
                    <XCircle className="w-3.5 h-3.5" /> missing
                  </span>
                )}
              </div>

              {/* Status 3: Supabase Client */}
              <div className="flex items-center justify-between py-0.5">
                <span className="text-slate-400">Client initialized:</span>
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
              <div className="flex items-center justify-between py-0.5">
                <span className="text-slate-400">Auth reachable:</span>
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

              {/* Config Source */}
              <div className="pt-2 border-t border-white/[0.04] text-[10px] space-y-1 text-slate-500">
                <div className="flex items-center justify-between">
                  <span>Source:</span>
                  <span className="text-slate-300 capitalize">
                    {diagnostics?.configSource === 'vite_env'
                      ? 'Vite Build Variables (VITE_*)'
                      : diagnostics?.configSource === 'backend_proxy'
                      ? 'Render Backend Proxy'
                      : diagnostics?.configSource === 'fallback'
                      ? 'Graceful Client Fallback'
                      : 'None'}
                  </span>
                </div>
              </div>

              {/* Build Version & Deployment Stamp */}
              <div className="pt-2 border-t border-white/[0.04] text-[10px] space-y-1.5 text-slate-500">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5">
                  <span>JEXA Build:</span>
                  <span className="text-emerald-400 font-mono font-semibold break-all text-[10px]">
                    {diagnostics?.buildId || 'local-build'}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5">
                  <span>Build Timestamp:</span>
                  <span className="text-slate-300 font-mono text-[9px] break-all sm:text-right">
                    {diagnostics?.buildTime || 'local'}
                  </span>
                </div>
              </div>

              {/* Force PWA Cache Purge button */}
              <div className="pt-2 border-t border-white/[0.04]">
                <button
                  type="button"
                  onClick={forcePurgeCache}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors text-[10px] min-h-[36px]"
                >
                  <RotateCcw className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Clear PWA Cache & Force Reload</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Security & Isolation Callout */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/80 shrink-0" />
            <span>Isolated User Memory (RLS)</span>
          </div>
          <span className="font-mono text-[10px]">Supabase Auth</span>
        </div>
      </div>
    </div>
  );
};
