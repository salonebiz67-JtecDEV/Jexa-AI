import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  X,
  Check,
  Bell,
  BellOff,
  Download,
  Smartphone,
  Cpu,
  Volume2,
  Sparkles,
  Terminal,
  AlertCircle,
  Play,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  User,
  Lock,
  LogOut,
  ShieldCheck,
  KeyRound,
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useBrainSettings } from '../../hooks/useBrainSettings';
import { useAuth } from '../../context/AuthContext';
import {
  FREE_GEMINI_CHAT_MODELS,
  FREE_GEMINI_VOICE_MODELS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_BACKUP_MODEL,
  DEFAULT_VOICE_MODEL,
  isTtsModel,
  ProviderHealthStatus,
} from '../../../shared/types';
import {
  safeStorage,
  MAX_INSTRUCTION_CHARS,
  getAboutMe,
  setAboutMe,
  getBehaviorInstructions,
  setBehaviorInstructions,
} from '../../services/storage';
import { ApiClient, ProviderTestResult } from '../../services/api.client';
import { AudioPlayer } from '../../services/audioPlayer';
import { LiveVoiceDebugStats } from '../../hooks/useLiveVoice';
import {
  getNotificationPermissionState,
  NotificationPermissionState,
  requestNotificationPermission,
} from '../../services/notifications';
import { isNative } from '../../utils/platform';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onClearHistory: () => void;
  liveDebugStats?: LiveVoiceDebugStats;
}

const isPresetChatModel = (id: string) =>
  FREE_GEMINI_CHAT_MODELS.some((m) => m.id === id);

const isPresetVoiceModel = (id: string) =>
  FREE_GEMINI_VOICE_MODELS.some((m) => m.id === id);

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  isOpen,
  onClose,
  onClearHistory,
  liveDebugStats,
}) => {
  const { profile, providerStatus, updateSettings, refresh } = useBrainSettings();
  const {
    authenticated,
    isOwner,
    user: authUser,
    expiresAtMs,
    setup: authSetup,
    isSubmitting: authSubmitting,
    authError,
    login,
    logout,
    clearAuthError,
  } = useAuth();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginFeedback, setLoginFeedback] = useState<string | null>(null);

  const [theme, setTheme] = useState<'dark' | 'midnight' | 'obsidian'>('dark');
  const [voiceName, setVoiceName] = useState('aura');
  const [streamText, setStreamText] = useState(true);
  const [soundEffects, setSoundEffects] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Gemini Chat Model, Backup Model & Voice Model selections
  const [textModel, setTextModel] = useState<string>(() => {
    const saved = safeStorage.getItem('jexa_text_model');
    return saved && !isTtsModel(saved) ? saved : DEFAULT_CHAT_MODEL;
  });
  const [customTextModel, setCustomTextModel] = useState<string>(() => {
    const saved = safeStorage.getItem('jexa_text_model') || '';
    return saved && !isPresetChatModel(saved) ? saved : '';
  });

  const [backupModel, setBackupModel] = useState<string>(() => {
    const saved = safeStorage.getItem('jexa_backup_model');
    return saved && !isTtsModel(saved) ? saved : DEFAULT_BACKUP_MODEL;
  });
  const [customBackupModel, setCustomBackupModel] = useState<string>(() => {
    const saved = safeStorage.getItem('jexa_backup_model') || '';
    return saved && !isPresetChatModel(saved) ? saved : '';
  });

  const [voiceModel, setVoiceModel] = useState<string>(() => {
    const saved = safeStorage.getItem('jexa_voice_model');
    return saved && isTtsModel(saved) ? saved : DEFAULT_VOICE_MODEL;
  });
  const [customVoiceModel, setCustomVoiceModel] = useState<string>(() => {
    const saved = safeStorage.getItem('jexa_voice_model') || '';
    return saved && !isPresetVoiceModel(saved) ? saved : '';
  });

  // Model testing states
  const [testingGeminiText, setTestingGeminiText] = useState(false);
  const [geminiTextTestResult, setGeminiTextTestResult] = useState<ProviderTestResult | null>(null);

  const [testingGeminiVoice, setTestingGeminiVoice] = useState(false);
  const [geminiVoiceTestResult, setGeminiVoiceTestResult] = useState<ProviderTestResult | null>(null);

  // Debug/Diagnostics panel toggle
  const [showDeveloperPanel, setShowDeveloperPanel] = useState(false);

  // Device-local personalization fields
  const [aboutMe, setAboutMeState] = useState<string>(() => getAboutMe());
  const [behaviorInstructions, setBehaviorInstructionsState] = useState<string>(() =>
    getBehaviorInstructions()
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Real Notification Support (Native LocalNotifications + Web Notification API)
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermissionState>('default');
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const nativeMode = isNative();

  // Effective resolved models (custom input takes precedence when non-empty)
  const effectiveTextModel = customTextModel.trim() || textModel;
  const effectiveBackupModel = customBackupModel.trim() || backupModel;
  const effectiveVoiceModel = customVoiceModel.trim() || voiceModel;

  // Strict Model-Type Separation Validation
  const chatModelValidationError =
    effectiveTextModel && isTtsModel(effectiveTextModel)
      ? `"${effectiveTextModel}" is a voice/TTS model and cannot be used for chat.`
      : null;

  const backupModelValidationError =
    effectiveBackupModel && isTtsModel(effectiveBackupModel)
      ? `"${effectiveBackupModel}" is a voice/TTS model and cannot be used as a backup chat model.`
      : null;

  const voiceModelValidationError =
    effectiveVoiceModel && !isTtsModel(effectiveVoiceModel)
      ? `"${effectiveVoiceModel}" is a chat model. Voice model ID must be a TTS model (containing "-tts").`
      : null;

  const hasValidationErrors = Boolean(
    chatModelValidationError || backupModelValidationError || voiceModelValidationError
  );

  // Sync state when dialog opens or profile loads
  useEffect(() => {
    if (isOpen) {
      setAboutMeState(getAboutMe());
      setBehaviorInstructionsState(getBehaviorInstructions());
    }
    if (profile?.selectedTextModel && !isTtsModel(profile.selectedTextModel)) {
      const m = profile.selectedTextModel;
      if (isPresetChatModel(m)) {
        setTextModel(m);
        if (!safeStorage.getItem('jexa_text_model') || isPresetChatModel(safeStorage.getItem('jexa_text_model') || '')) {
          setCustomTextModel('');
        }
      } else {
        setCustomTextModel(m);
      }
    }
    if (profile?.selectedBackupModel && !isTtsModel(profile.selectedBackupModel)) {
      const b = profile.selectedBackupModel;
      if (isPresetChatModel(b)) {
        setBackupModel(b);
        if (!safeStorage.getItem('jexa_backup_model') || isPresetChatModel(safeStorage.getItem('jexa_backup_model') || '')) {
          setCustomBackupModel('');
        }
      } else {
        setCustomBackupModel(b);
      }
    }
    if (profile?.selectedVoiceModel && isTtsModel(profile.selectedVoiceModel)) {
      const vm = profile.selectedVoiceModel;
      if (isPresetVoiceModel(vm)) {
        setVoiceModel(vm);
        if (!safeStorage.getItem('jexa_voice_model') || isPresetVoiceModel(safeStorage.getItem('jexa_voice_model') || '')) {
          setCustomVoiceModel('');
        }
      } else {
        setCustomVoiceModel(vm);
      }
    }
    if (profile?.voiceSettings?.voiceId) {
      setVoiceName(profile.voiceSettings.voiceId);
    }
    if (profile?.theme) {
      setTheme(profile.theme as any);
    }
  }, [profile, isOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let active = true;
    void getNotificationPermissionState().then((state) => {
      if (active) setNotificationStatus(state);
    });
    const handlePrefsUpdated = () => {
      setAboutMeState(getAboutMe());
      setBehaviorInstructionsState(getBehaviorInstructions());
    };
    window.addEventListener('jexa:preferences-updated', handlePrefsUpdated);
    return () => {
      active = false;
      window.removeEventListener('jexa:preferences-updated', handlePrefsUpdated);
    };
  }, [isOpen]);

  const handleToggleNotifications = async () => {
    try {
      const result = await requestNotificationPermission();
      setNotificationStatus(result);
    } catch (e) {
      console.warn('[Settings] Notification permission request error:', e);
    }
  };

  const handleTestGeminiText = async () => {
    if (chatModelValidationError) {
      setGeminiTextTestResult({
        success: false,
        provider: 'gemini',
        model: effectiveTextModel,
        code: 'INVALID_MODEL_TYPE',
        status: 'ERROR',
        error: chatModelValidationError,
      });
      return;
    }

    setTestingGeminiText(true);
    setGeminiTextTestResult(null);
    try {
      const res = await ApiClient.testTextProvider('gemini', effectiveTextModel);
      setGeminiTextTestResult(res);
      await refresh();
    } catch (err: any) {
      setGeminiTextTestResult({
        success: false,
        provider: 'gemini',
        model: effectiveTextModel,
        code: err.code || 'UNAVAILABLE',
        status: err.code || 'UNAVAILABLE',
        error: err.message || 'Gemini chat connection failed.',
      });
    } finally {
      setTestingGeminiText(false);
    }
  };

  const handleTestGeminiVoice = async () => {
    if (voiceModelValidationError) {
      setGeminiVoiceTestResult({
        success: false,
        provider: 'gemini',
        model: effectiveVoiceModel,
        code: 'INVALID_MODEL_TYPE',
        status: 'ERROR',
        error: voiceModelValidationError,
      });
      return;
    }

    setTestingGeminiVoice(true);
    setGeminiVoiceTestResult(null);
    try {
      const res = await ApiClient.testVoiceProvider('gemini', undefined, effectiveVoiceModel);
      setGeminiVoiceTestResult(res);
      if (res.success && res.audioUrl) {
        try {
          await AudioPlayer.playUrl(res.audioUrl);
        } catch (audioErr) {
          console.warn('[SettingsDialog] Test audio playback error:', audioErr);
        }
      }
      await refresh();
    } catch (err: any) {
      const isQuota = err.status === 429 || err.code === 'QUOTA_EXHAUSTED' || err.message?.includes('quota');
      setGeminiVoiceTestResult({
        success: false,
        provider: 'gemini',
        model: effectiveVoiceModel,
        code: isQuota ? 'QUOTA_EXHAUSTED' : err.code || 'UNAVAILABLE',
        status: isQuota ? 'QUOTA_EXHAUSTED' : err.code || 'UNAVAILABLE',
        error: isQuota
          ? 'Gemini Voice quota exhausted. Try again later or choose the other TTS model.'
          : err.message || 'Gemini Voice test failed.',
      });
    } finally {
      setTestingGeminiVoice(false);
    }
  };

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaveError(null);
    setSaveNotice(null);
    if (hasValidationErrors) {
      setSaveError(chatModelValidationError || backupModelValidationError || voiceModelValidationError);
      return;
    }

    safeStorage.setItem('jexa_text_model', effectiveTextModel);
    safeStorage.setItem('jexa_backup_model', effectiveBackupModel);
    safeStorage.setItem('jexa_voice_model', effectiveVoiceModel);
    safeStorage.setItem('jexa_voice_name', voiceName);
    setAboutMe(aboutMe);
    setBehaviorInstructions(behaviorInstructions);

    if (!isOwner) {
      setSavedSuccess(true);
      setSaveNotice('Saved on this device.');
      setTimeout(() => {
        setSavedSuccess(false);
        setSaveNotice(null);
        onClose();
      }, 700);
      return;
    }

    const activeServerProvider =
      providerStatus?.textProvider?.type === 'litellm' ? 'litellm' : 'gemini';

    try {
      await ApiClient.selectProviders({
        textProvider: activeServerProvider,
        voiceProvider: 'gemini',
        textModel: effectiveTextModel,
        backupModel: effectiveBackupModel,
        voiceModel: effectiveVoiceModel,
        theme,
      });
      await updateSettings({
        selectedTextProvider: activeServerProvider,
        selectedVoiceProvider: 'gemini',
        selectedTextModel: effectiveTextModel,
        selectedBackupModel: effectiveBackupModel,
        selectedVoiceModel: effectiveVoiceModel,
        theme,
        voiceSettings: {
          voiceId: voiceName,
          speed: profile?.voiceSettings?.speed ?? 1.0,
          pitch: profile?.voiceSettings?.pitch ?? 1.0,
          autoSpeak: profile?.voiceSettings?.autoSpeak ?? false,
        },
      });
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 700);
    } catch (err: any) {
      const status = err?.status;
      if (status === 401 || status === 403) {
        setSavedSuccess(true);
        setSaveNotice('Saved on this device. Server-wide defaults require owner authentication.');
        setTimeout(() => {
          setSavedSuccess(false);
          setSaveNotice(null);
          onClose();
        }, 1200);
        return;
      }
      console.error('[SettingsDialog] Failed to persist settings:', err);
      setSaveError(err?.message || "Couldn't save. Please try again.");
    }
  };

  const activeTextDetail =
    providerStatus?.availableTextProviders?.find((p) => p.type === 'litellm') ||
    providerStatus?.availableTextProviders?.find((p) => p.type === 'gemini');
  const geminiVoiceDetail = providerStatus?.availableVoiceProviders?.find((p) => p.type === 'gemini');

  const isGeminiTextConfigured = activeTextDetail?.isConfigured ?? providerStatus?.textProvider?.isConfigured ?? true;
  const isGeminiVoiceConfigured = geminiVoiceDetail?.isConfigured ?? providerStatus?.voiceProvider?.isConfigured ?? true;

  const geminiTextStatus: ProviderHealthStatus = geminiTextTestResult
    ? (geminiTextTestResult.status || (geminiTextTestResult.success ? 'CONNECTED' : (geminiTextTestResult.code as ProviderHealthStatus) || 'UNAVAILABLE'))
    : (activeTextDetail?.status || (isGeminiTextConfigured ? 'CONNECTED' : 'NOT_CONFIGURED'));

  const geminiVoiceStatus: ProviderHealthStatus = geminiVoiceTestResult
    ? (geminiVoiceTestResult.status || (geminiVoiceTestResult.success ? 'CONNECTED' : (geminiVoiceTestResult.code as ProviderHealthStatus) || 'UNAVAILABLE'))
    : (geminiVoiceDetail?.status || (isGeminiVoiceConfigured ? 'READY' : 'NOT_CONFIGURED'));

  const renderStatusBadge = (status: ProviderHealthStatus) => {
    switch (status) {
      case 'CONNECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            CONNECTED
          </span>
        );
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
            READY
          </span>
        );
      case 'QUOTA_EXHAUSTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            QUOTA EXHAUSTED
          </span>
        );
      case 'AUTHENTICATION_ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            AUTH ERROR
          </span>
        );
      case 'MODEL_NOT_FOUND':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            MODEL NOT FOUND
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            ERROR
          </span>
        );
      case 'NOT_CONFIGURED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-500/15 text-slate-400 border border-white/10">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            NOT CONFIGURED
          </span>
        );
      case 'TEMPORARILY_UNAVAILABLE':
      case 'UNAVAILABLE':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            UNAVAILABLE
          </span>
        );
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md pt-safe pb-safe pl-safe pr-safe">
        <div className="relative w-full max-w-lg bg-[#0f1422] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-full sm:max-h-[90vh]">
          {/* Header with Back button */}
          <div className="flex items-center justify-between px-3.5 py-3 border-b border-white/[0.06] bg-[#0b0f19]">
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors"
                aria-label="Back to chat"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <div className="h-4 w-px bg-white/[0.08]" />
              <h2 className="font-semibold text-sm text-white">Settings</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
              aria-label="Close settings"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Settings Body */}
          <div className="p-4 sm:p-5 overflow-y-auto space-y-6 flex-1">
            {/* ============================================================== */}
            {/* SECTION 0: OWNER & ACCOUNT ACCESS                              */}
            {/* ============================================================== */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Owner &amp; Account Access</span>
                </label>
                {isOwner ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    <ShieldCheck className="w-3 h-3" />
                    OWNER VERIFIED
                  </span>
                ) : authenticated ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    USER SESSION
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-500/15 text-slate-400 border border-white/10">
                    SIGNED OUT
                  </span>
                )}
              </div>

              <div className="p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-3">
                {authenticated && authUser ? (
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-medium text-white truncate">
                          {authUser.email || 'Authenticated Account'}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 truncate">
                          Role: {isOwner ? 'OWNER (Admin)' : 'USER (Standard)'}
                          {expiresAtMs
                            ? ` · Expires ${new Date(expiresAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : ''}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 truncate" title={authUser.id}>
                          User ID: {authUser.id}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          setLoginFeedback(null);
                          await logout();
                        }}
                        disabled={authSubmitting}
                        className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-rose-500/15 border border-white/[0.1] hover:border-rose-500/30 text-xs font-medium text-slate-200 hover:text-rose-300 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>

                    {!isOwner && (
                      <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-200/90 leading-snug">
                        Signed in as a standard user. Administrative controls, gateway config, and usage telemetry are restricted to the verified owner account.
                      </div>
                    )}
                  </div>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setLoginFeedback(null);
                      clearAuthError();
                      if (!loginEmail.trim() || !loginPassword) {
                        setLoginFeedback('Enter both email and password.');
                        return;
                      }
                      const res = await login(loginEmail.trim(), loginPassword);
                      if (res.ok) {
                        setLoginPassword('');
                        setLoginFeedback(
                          res.isOwner
                            ? 'Signed in with verified owner privileges.'
                            : 'Signed in as standard user.'
                        );
                        await refresh();
                      }
                    }}
                    className="space-y-2.5"
                  >
                    {!authSetup.authConfigured && (
                      <div className="p-2 rounded-lg bg-slate-800/60 border border-white/[0.07] text-[11px] text-slate-300 leading-snug">
                        Server authentication is not configured yet. Configure <span className="font-mono text-emerald-300">SUPABASE_URL</span>, <span className="font-mono text-emerald-300">SUPABASE_ANON_KEY</span>, and <span className="font-mono text-emerald-300">OWNER_USER_ID</span> on the backend.
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="email"
                        autoComplete="username"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="Owner email"
                        className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/[0.1] text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                      />
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Password"
                        className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/[0.1] text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                      />
                    </div>

                    {(authError || loginFeedback) && (
                      <div
                        className={`p-2 rounded-lg text-[11px] flex items-center gap-1.5 ${
                          authError
                            ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                            : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                        }`}
                      >
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{authError || loginFeedback}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-500">
                        Sessions stay in memory only (never stored in localStorage).
                      </span>
                      <button
                        type="submit"
                        disabled={authSubmitting || !authSetup.authConfigured}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>{authSubmitting ? 'Signing In…' : 'Sign In'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* ============================================================== */}
            {/* PERSONALIZATION: ABOUT ME & HOW JEXA SHOULD BEHAVE             */}
            {/* ============================================================== */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Personalization</span>
                </label>
                <span className="text-[10px] text-slate-500">Saved on this device</span>
              </div>

              <div className="p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-3.5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="jexa-about-me" className="text-xs font-medium text-white">
                      About me
                    </label>
                    <span className="text-[10px] font-mono text-slate-500">
                      {aboutMe.length} / {MAX_INSTRUCTION_CHARS.toLocaleString()}
                    </span>
                  </div>
                  <textarea
                    id="jexa-about-me"
                    value={aboutMe}
                    onChange={(e) => setAboutMeState(e.target.value.slice(0, MAX_INSTRUCTION_CHARS))}
                    maxLength={MAX_INSTRUCTION_CHARS}
                    rows={3}
                    placeholder="Share your name, background, projects, or context you want Jexa to know..."
                    className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/[0.1] text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500/60 resize-y"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="jexa-behavior-instructions" className="text-xs font-medium text-white">
                      How Jexa should behave
                    </label>
                    <span className="text-[10px] font-mono text-slate-500">
                      {behaviorInstructions.length} / {MAX_INSTRUCTION_CHARS.toLocaleString()}
                    </span>
                  </div>
                  <textarea
                    id="jexa-behavior-instructions"
                    value={behaviorInstructions}
                    onChange={(e) =>
                      setBehaviorInstructionsState(e.target.value.slice(0, MAX_INSTRUCTION_CHARS))
                    }
                    maxLength={MAX_INSTRUCTION_CHARS}
                    rows={3}
                    placeholder="Describe preferred tone, formatting, or response style..."
                    className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/[0.1] text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500/60 resize-y"
                  />
                </div>
              </div>
            </div>

            {/* ============================================================== */}
            {/* SECTION 1: GEMINI CHAT & BACKUP MODELS                         */}
            {/* ============================================================== */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Gemini Chat Model</span>
                </label>
                {renderStatusBadge(geminiTextStatus)}
              </div>

              <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/15 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-white font-semibold text-xs">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Primary Chat Model</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 truncate">
                    {effectiveTextModel}
                  </span>
                </div>

                {/* Preset Chat Models Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {FREE_GEMINI_CHAT_MODELS.map((m) => {
                    const isSelected = !customTextModel.trim() && textModel === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setTextModel(m.id);
                          setCustomTextModel('');
                        }}
                        className={`px-2.5 py-2 rounded-lg border text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-500/15 text-white'
                            : 'border-white/[0.06] bg-white/[0.02] text-slate-300 hover:border-white/[0.14]'
                        }`}
                      >
                        <span className="text-[11px] font-mono truncate">{m.id}</span>
                        {m.badge && (
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                              m.badge === 'new, fast coding'
                                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {m.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Chat Model ID */}
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-slate-400 block">
                    Custom model ID (overrides preset above)
                  </label>
                  <input
                    type="text"
                    value={customTextModel}
                    onChange={(e) => setCustomTextModel(e.target.value)}
                    placeholder="e.g. gemini-3.9-flash"
                    className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/[0.1] text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500/60"
                  />
                </div>

                {chatModelValidationError && (
                  <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-[10px] text-rose-300 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>{chatModelValidationError}</span>
                  </div>
                )}

                {/* Backup Chat Model Picker */}
                <div className="pt-2 border-t border-white/[0.06] space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-slate-300">
                      Backup model (auto-failover)
                    </label>
                    <span className="text-[10px] font-mono text-amber-300 truncate">
                      {effectiveBackupModel}
                    </span>
                  </div>
                  <select
                    value={customBackupModel.trim() ? '__custom__' : backupModel}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val !== '__custom__') {
                        setBackupModel(val);
                        setCustomBackupModel('');
                      }
                    }}
                    className="w-full px-3 py-1.5 rounded-lg bg-black/50 border border-white/[0.1] text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500/60"
                  >
                    {FREE_GEMINI_CHAT_MODELS.map((m) => (
                      <option key={m.id} value={m.id} className="bg-[#0f1422]">
                        {m.id}
                        {m.id === DEFAULT_BACKUP_MODEL ? ' (default)' : m.badge ? ` (${m.badge})` : ''}
                      </option>
                    ))}
                    {customBackupModel.trim() && (
                      <option value="__custom__" className="bg-[#0f1422]">
                        Custom: {customBackupModel.trim()}
                      </option>
                    )}
                  </select>
                  <input
                    type="text"
                    value={customBackupModel}
                    onChange={(e) => setCustomBackupModel(e.target.value)}
                    placeholder="Optional custom backup model ID..."
                    className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] text-[11px] font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
                  />
                  {backupModelValidationError && (
                    <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-[10px] text-rose-300 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      <span>{backupModelValidationError}</span>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400">
                    Used automatically if the primary chat model hits rate limits or errors.
                  </p>
                </div>

                {/* Test Chat Model Action (Owner Only) */}
                {isOwner && (
                <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                  <button
                    type="button"
                    onClick={handleTestGeminiText}
                    disabled={testingGeminiText || Boolean(chatModelValidationError)}
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] font-medium text-slate-200 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Play className="w-3 h-3 text-emerald-400" />
                    <span>{testingGeminiText ? 'Testing Connection...' : `Test Chat Model (${effectiveTextModel})`}</span>
                  </button>

                  {geminiTextTestResult && (
                    <div
                      className={`text-[10px] font-medium flex items-center gap-1 ${
                        geminiTextTestResult.success ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {geminiTextTestResult.success ? (
                        <>
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            {geminiTextTestResult.model} Connected ({geminiTextTestResult.latencyMs}ms)
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate" title={geminiTextTestResult.error}>
                            {geminiTextTestResult.error}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                )}
              </div>
            </div>

            {/* ============================================================== */}
            {/* SECTION 2: GEMINI VOICE MODEL                                  */}
            {/* ============================================================== */}
            <div className="space-y-3 pt-3 border-t border-white/[0.06]">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-teal-400" />
                  <span>Gemini Voice Model (TTS)</span>
                </label>
                {renderStatusBadge(geminiVoiceStatus)}
              </div>

              <div className="p-3.5 rounded-xl border border-teal-500/25 bg-teal-950/10 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {FREE_GEMINI_VOICE_MODELS.map((m) => {
                    const isSelected = !customVoiceModel.trim() && voiceModel === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setVoiceModel(m.id);
                          setCustomVoiceModel('');
                        }}
                        className={`px-3 py-2 rounded-lg border text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
                          isSelected
                            ? 'border-teal-500 bg-teal-500/15 text-white'
                            : 'border-white/[0.06] bg-white/[0.02] text-slate-300 hover:border-white/[0.14]'
                        }`}
                      >
                        <span className="text-[11px] font-mono truncate">{m.id}</span>
                        {m.badge && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 border border-teal-500/30 font-medium shrink-0">
                            {m.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Voice Model ID */}
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-slate-400 block">
                    Custom voice model ID (must be a Gemini TTS model)
                  </label>
                  <input
                    type="text"
                    value={customVoiceModel}
                    onChange={(e) => setCustomVoiceModel(e.target.value)}
                    placeholder="e.g. gemini-3.9-flash-tts"
                    className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/[0.1] text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-teal-500/60"
                  />
                </div>

                {voiceModelValidationError && (
                  <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-[10px] text-rose-300 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>{voiceModelValidationError}</span>
                  </div>
                )}

                {isOwner && (
                <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                  <button
                    type="button"
                    onClick={handleTestGeminiVoice}
                    disabled={testingGeminiVoice || Boolean(voiceModelValidationError)}
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] font-medium text-slate-200 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Play className="w-3 h-3 text-teal-400" />
                    <span>{testingGeminiVoice ? 'Testing Voice...' : `Test Voice Model (${effectiveVoiceModel})`}</span>
                  </button>

                  {geminiVoiceTestResult && (
                    <div
                      className={`text-[10px] p-2 rounded-lg font-medium border flex items-start gap-1.5 ${
                        geminiVoiceTestResult.success
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          : geminiVoiceTestResult.code === 'QUOTA_EXHAUSTED'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                          : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                      }`}
                    >
                      {geminiVoiceTestResult.success ? (
                        <>
                          <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>Voice generated successfully ({geminiVoiceTestResult.latencyMs}ms)</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span className="leading-snug">{geminiVoiceTestResult.error}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                )}
              </div>
            </div>

            {/* ============================================================== */}
            {/* SECTION 3: VOICE PERSONA (EXISTING VOICE NAMES)                */}
            {/* ============================================================== */}
            <div className="space-y-2 pt-3 border-t border-white/[0.06]">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Voice Persona
                </label>
                <span className="text-[9px] text-slate-500 font-mono">Gemini Neural Voices</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'aura', name: 'Aura', desc: 'Aoede • Serene' },
                  { id: 'atlas', name: 'Atlas', desc: 'Fenrir • Direct' },
                  { id: 'lyra', name: 'Lyra', desc: 'Kore • Bright' },
                ].map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVoiceName(v.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      voiceName === v.id
                        ? 'border-emerald-500 bg-emerald-950/25 text-white ring-1 ring-emerald-500/20'
                        : 'border-white/[0.06] text-slate-400 hover:text-slate-200 bg-white/[0.02]'
                    }`}
                  >
                    <div className="font-semibold text-xs text-white mb-0.5">{v.name}</div>
                    <div className="text-[10px] text-slate-400 leading-tight">{v.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* ============================================================== */}
            {/* SECTION 4: DEVELOPER & DIAGNOSTICS (OWNER ONLY)                */}
            {/* ============================================================== */}
            {isOwner && (
            <div className="pt-3 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setShowDeveloperPanel(!showDeveloperPanel)}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] text-xs font-medium text-slate-300 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Developer & Diagnostic Stats</span>
                </div>
                {showDeveloperPanel ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {showDeveloperPanel && (
                <div className="mt-2.5 p-3.5 rounded-xl bg-black/60 border border-white/[0.08] space-y-3 text-[11px] font-mono text-slate-300">
                  <div className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider flex items-center justify-between pb-1 border-b border-white/[0.06]">
                    <span>Internal Usage & Telemetry Panel</span>
                    <span className="text-slate-500 font-normal">Real-Time Diagnostics</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="bg-white/[0.03] p-2 rounded-lg border border-white/[0.04]">
                      <span className="text-slate-500 block mb-0.5">Active Provider</span>
                      <p className="text-white font-semibold">
                        Text: <span className="text-emerald-400">{providerStatus?.textProvider?.type === 'litellm' ? 'LITELLM GATEWAY' : 'GEMINI'}</span> · Voice: <span className="text-emerald-400">GEMINI</span>
                      </p>
                      <p className="text-slate-400 truncate">Backup: {effectiveBackupModel}</p>
                    </div>

                    <div className="bg-white/[0.03] p-2 rounded-lg border border-white/[0.04]">
                      <span className="text-slate-500 block mb-0.5">Configured Models</span>
                      <p className="text-slate-200 truncate" title={effectiveTextModel}>
                        Chat: {effectiveTextModel}
                      </p>
                      <p className="text-slate-200 truncate" title={effectiveVoiceModel}>
                        Voice: {effectiveVoiceModel}
                      </p>
                    </div>

                    <div className="bg-white/[0.03] p-2 rounded-lg border border-white/[0.04]">
                      <span className="text-slate-500 block mb-0.5">Session Status</span>
                      <p className="text-emerald-400 font-semibold capitalize">
                        {liveDebugStats?.sessionStatus || 'Idle'}
                      </p>
                    </div>

                    <div className="bg-white/[0.03] p-2 rounded-lg border border-white/[0.04]">
                      <span className="text-slate-500 block mb-0.5">Connection Latency</span>
                      <p className="text-slate-200 font-semibold">
                        {liveDebugStats?.connectionLatencyMs
                          ? `${liveDebugStats.connectionLatencyMs} ms`
                          : geminiTextTestResult?.latencyMs
                          ? `${geminiTextTestResult.latencyMs} ms (test)`
                          : '< 50 ms'}
                      </p>
                    </div>

                    <div className="bg-white/[0.03] p-2 rounded-lg border border-white/[0.04] col-span-2">
                      <span className="text-slate-500 block mb-0.5">Last Provider Error</span>
                      {(() => {
                        const displayError =
                          liveDebugStats?.lastError ||
                          geminiTextTestResult?.error ||
                          geminiVoiceTestResult?.error ||
                          'None';
                        const hasError = displayError !== 'None';
                        return (
                          <p
                            className={`truncate font-semibold ${
                              hasError ? 'text-rose-400' : 'text-slate-400'
                            }`}
                            title={displayError}
                          >
                            {displayError}
                          </p>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">
                      Storage: On-Device IndexedDB
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        safeStorage.removeItem('jexa_text_model');
                        safeStorage.removeItem('jexa_backup_model');
                        safeStorage.removeItem('jexa_voice_model');
                        safeStorage.removeItem('jexa_voice_name');
                        setTextModel(DEFAULT_CHAT_MODEL);
                        setCustomTextModel('');
                        setBackupModel(DEFAULT_BACKUP_MODEL);
                        setCustomBackupModel('');
                        setVoiceModel(DEFAULT_VOICE_MODEL);
                        setCustomVoiceModel('');
                        setVoiceName('aura');
                        refresh();
                      }}
                      className="flex items-center gap-1 text-[10px] text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset Local Overrides</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            )}


            {/* ============================================================== */}
            {/* SECTION 6: THEMES & SYSTEM NOTIFICATIONS                       */}
            {/* ============================================================== */}
            <div className="space-y-2 pt-3 border-t border-white/[0.06]">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Interface Theme
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'dark', label: 'Dark Slate', bg: 'bg-[#07090e]' },
                  { id: 'midnight', label: 'Midnight', bg: 'bg-[#090d16]' },
                  { id: 'obsidian', label: 'Obsidian', bg: 'bg-[#04060a]' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTheme(item.id as any)}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      theme === item.id
                        ? 'border-emerald-500 bg-emerald-950/20 text-white'
                        : 'border-white/[0.06] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className={`w-full h-5 rounded-md mb-1.5 border border-white/[0.08] ${item.bg}`} />
                    <span className="text-[11px] font-medium">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Progressive Web App (PWA) Section (hidden in native Capacitor app) */}
            {!nativeMode && (
              <div className="space-y-2 pt-3 border-t border-white/[0.06]">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  Application & Installation
                </label>
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-medium text-white truncate">PWA Standalone Mode</div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {isInstalled ? 'Installed as native application' : 'Install JEXA on home screen'}
                      </div>
                    </div>
                  </div>

                  {isInstalled ? (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-medium shrink-0">
                      Installed
                    </span>
                  ) : isInstallable ? (
                    <button
                      type="button"
                      onClick={install}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Install</span>
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-500 shrink-0">Browser mode</span>
                  )}
                </div>
              </div>
            )}

            {/* System Notifications */}
            <div className="space-y-2 pt-3 border-t border-white/[0.06]">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                System Notifications
              </label>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="flex items-center gap-2">
                  {notificationStatus === 'granted' ? (
                    <Bell className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <BellOff className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                  <div>
                    <div className="text-xs font-medium text-white">
                      {nativeMode ? 'App Notifications' : 'Browser Notifications'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Status:{' '}
                      {notificationStatus === 'granted'
                        ? 'Allowed'
                        : notificationStatus === 'denied'
                        ? 'Blocked'
                        : notificationStatus === 'unsupported'
                        ? 'Unavailable'
                        : 'Not Enabled'}
                    </div>
                  </div>
                </div>

                {notificationStatus === 'default' && (
                  <button
                    type="button"
                    onClick={handleToggleNotifications}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-semibold text-emerald-300 transition-colors cursor-pointer"
                  >
                    Enable
                  </button>
                )}
                {notificationStatus === 'granted' && (
                  <span className="text-emerald-400 text-xs font-medium">Active</span>
                )}
              </div>
            </div>

            {/* Preferences */}
            <div className="space-y-2 pt-3 border-t border-white/[0.06]">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Preferences
              </label>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <div>
                    <div className="text-xs font-medium text-white">Stream Responses</div>
                    <div className="text-[10px] text-slate-400">Stream reply text in real-time</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={streamText}
                    onChange={(e) => setStreamText(e.target.checked)}
                    className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <div>
                    <div className="text-xs font-medium text-white">Audio Feedback</div>
                    <div className="text-[10px] text-slate-400">Audio cues for actions</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={soundEffects}
                    onChange={(e) => setSoundEffects(e.target.checked)}
                    className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Clear History */}
            <div className="space-y-2 pt-3 border-t border-white/[0.06]">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-white">Clear History</div>
                  <div className="text-[10px] text-slate-400">Delete all active conversations</div>
                </div>
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="px-2.5 py-1 rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 text-xs font-medium transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Footer Credit */}
            <div className="pt-2 text-center text-[11px] text-slate-500">
              JEXA Assistant · Powered by JOHNEY TEC
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-white/[0.06] bg-[#0b0f19]">
            <div className="min-w-0">
              {saveError ? (
                <span className="text-xs text-rose-400 font-medium truncate block">
                  {saveError}
                </span>
              ) : saveNotice ? (
                <span className="text-xs text-amber-300 font-medium truncate block">
                  {saveNotice}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={hasValidationErrors}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Saved</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
