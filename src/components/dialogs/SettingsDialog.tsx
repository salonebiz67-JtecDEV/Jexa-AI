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
  Database,
  Copy,
  RefreshCw,
  FileCode,
  LogOut,
  Brain,
  Trash2,
  Edit2,
  ShieldAlert,
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useBrainSettings } from '../../hooks/useBrainSettings';
import { useAuth } from '../../hooks/useAuth';
import {
  FREE_GEMINI_CHAT_MODELS,
  FREE_GEMINI_VOICE_MODELS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_BACKUP_MODEL,
  DEFAULT_VOICE_MODEL,
  isTtsModel,
  ProviderHealthStatus,
  DatabaseHealthResponse,
  DatabaseDiagnosticsResult,
  TestStepStatus,
} from '../../../shared/types';
import { MemoryItem, getCategoryLabel } from '../../../shared/types/memory';
import { safeStorage } from '../../services/storage';
import { ApiClient, ProviderTestResult } from '../../services/api.client';
import { AudioPlayer } from '../../services/audioPlayer';
import { LiveVoiceDebugStats } from '../../hooks/useLiveVoice';

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
  const { user, signOut } = useAuth();

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

  // Database Health & Real Diagnostics State
  const [dbHealth, setDbHealth] = useState<DatabaseHealthResponse | null>(null);
  const [dbTestResult, setDbTestResult] = useState<DatabaseDiagnosticsResult | null>(null);
  const [isRunningDbTest, setIsRunningDbTest] = useState(false);
  const [dbTestError, setDbTestError] = useState<string | null>(null);
  const [showDbDiagnostics, setShowDbDiagnostics] = useState(false);
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [schemaSql, setSchemaSql] = useState<string>('');
  const [copiedSql, setCopiedSql] = useState(false);
  const [lastDbTestDate, setLastDbTestDate] = useState<string>(() => {
    return safeStorage.getItem('jexa_last_db_test_date') || 'Not tested yet';
  });
  const [saveError, setSaveError] = useState<string | null>(null);

  // Real Notification Support
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission>('default');
  const { isInstallable, isInstalled, install } = usePWAInstall();

  // Personal Memory Management
  const [memoriesList, setMemoriesList] = useState<MemoryItem[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [showMemoriesSection, setShowMemoriesSection] = useState(false);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingFact, setEditingFact] = useState<string>('');
  const [savingEditId, setSavingEditId] = useState<string | null>(null);

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

  const fetchMemories = async () => {
    setLoadingMemories(true);
    try {
      const items = await ApiClient.getMemories();
      setMemoriesList(items || []);
    } catch (e) {
      console.warn('[SettingsDialog] Could not fetch memories:', e);
    } finally {
      setLoadingMemories(false);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    setDeletingMemoryId(id);
    try {
      await ApiClient.deleteMemory(id);
      setMemoriesList((prev) => prev.filter((m) => m.id !== id));
      if (editingMemoryId === id) {
        setEditingMemoryId(null);
        setEditingFact('');
      }
    } catch (e) {
      console.warn('[SettingsDialog] Could not delete memory:', e);
    } finally {
      setDeletingMemoryId(null);
    }
  };

  const handleStartEdit = (mem: MemoryItem) => {
    setEditingMemoryId(mem.id);
    setEditingFact(mem.fact);
  };

  const handleCancelEdit = () => {
    setEditingMemoryId(null);
    setEditingFact('');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingFact.trim()) return;
    setSavingEditId(id);
    try {
      const updated = await ApiClient.updateMemory(id, { fact: editingFact.trim() });
      setMemoriesList((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, fact: updated.fact, lastReinforcedAt: updated.lastReinforcedAt }
            : m
        )
      );
      setEditingMemoryId(null);
      setEditingFact('');
    } catch (e) {
      console.warn('[SettingsDialog] Could not update memory:', e);
    } finally {
      setSavingEditId(null);
    }
  };

  // Sync state when dialog opens or profile loads
  useEffect(() => {
    if (isOpen) {
      fetchMemories();
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

  const loadDbHealth = async () => {
    try {
      const health = await ApiClient.getDatabaseHealth();
      setDbHealth(health);
    } catch (e: any) {
      console.warn('[SettingsDialog] Could not load database health:', e.message);
    }
  };

  const handleRunDatabaseTest = async () => {
    setIsRunningDbTest(true);
    setDbTestError(null);
    try {
      const result = await ApiClient.runDatabaseTest();
      setDbTestResult(result);
      const now = new Date();
      const formattedDate = now.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      setLastDbTestDate(formattedDate);
      safeStorage.setItem('jexa_last_db_test_date', formattedDate);
      setShowDbDiagnostics(true);
      await loadDbHealth();
    } catch (err: any) {
      console.error('[SettingsDialog] Database test failed:', err);
      setDbTestError(err.message || 'Database test failed.');
      setShowDbDiagnostics(true);
    } finally {
      setIsRunningDbTest(false);
    }
  };

  const handleFetchSchema = async () => {
    try {
      const res = await ApiClient.getDatabaseSchema();
      setSchemaSql(res.sql);
      setShowSchemaModal(true);
    } catch (err: any) {
      console.error('[SettingsDialog] Failed to fetch schema SQL:', err);
    }
  };

  const handleCopySchema = () => {
    if (!schemaSql) return;
    navigator.clipboard.writeText(schemaSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationStatus(Notification.permission);
    }
    if (isOpen) {
      loadDbHealth();
    }
  }, [isOpen]);

  const handleToggleNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const result = await Notification.requestPermission();
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
    if (hasValidationErrors) {
      setSaveError(chatModelValidationError || backupModelValidationError || voiceModelValidationError);
      return;
    }

    safeStorage.setItem('jexa_text_model', effectiveTextModel);
    safeStorage.setItem('jexa_backup_model', effectiveBackupModel);
    safeStorage.setItem('jexa_voice_model', effectiveVoiceModel);
    safeStorage.setItem('jexa_voice_name', voiceName);

    try {
      await ApiClient.selectProviders({
        textProvider: 'gemini',
        voiceProvider: 'gemini',
        textModel: effectiveTextModel,
        backupModel: effectiveBackupModel,
        voiceModel: effectiveVoiceModel,
        theme,
      });
      await updateSettings({
        selectedTextProvider: 'gemini',
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
      console.error('[SettingsDialog] Failed to persist settings:', err);
      setSaveError(err?.message || "Couldn't save. Please try again.");
    }
  };

  const geminiTextDetail = providerStatus?.availableTextProviders?.find((p) => p.type === 'gemini');
  const geminiVoiceDetail = providerStatus?.availableVoiceProviders?.find((p) => p.type === 'gemini');

  const isGeminiTextConfigured = geminiTextDetail?.isConfigured ?? providerStatus?.textProvider?.isConfigured ?? true;
  const isGeminiVoiceConfigured = geminiVoiceDetail?.isConfigured ?? providerStatus?.voiceProvider?.isConfigured ?? true;

  const geminiTextStatus: ProviderHealthStatus = geminiTextTestResult
    ? (geminiTextTestResult.status || (geminiTextTestResult.success ? 'CONNECTED' : (geminiTextTestResult.code as ProviderHealthStatus) || 'UNAVAILABLE'))
    : (geminiTextDetail?.status || (isGeminiTextConfigured ? 'CONNECTED' : 'NOT_CONFIGURED'));

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

  const renderTestStepBadge = (status?: TestStepStatus) => {
    switch (status) {
      case 'PASS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            PASS
          </span>
        );
      case 'FAIL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            FAIL
          </span>
        );
      case 'NOT_TESTED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-500/15 text-slate-400 border border-slate-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            NOT TESTED
          </span>
        );
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md pt-safe pb-safe">
        <div className="relative w-full max-w-lg bg-[#0f1422] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
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
            {/* User Account & Google Profile Header */}
            {user && (
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 pr-3">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.fullName || 'User'}
                      className="w-10 h-10 rounded-full object-cover border border-emerald-500/40 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center justify-center text-sm font-bold shrink-0">
                      {user.fullName ? user.fullName[0].toUpperCase() : 'U'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-white truncate">{user.fullName || 'JEXA User'}</p>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                        {user.isGuest ? 'Sandbox Guest' : 'Google Account'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">{user.email || 'Authenticated User'}</p>
                    <p className="text-[9px] text-slate-500 font-mono truncate">ID: {user.id}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    await signOut();
                    onClose();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 hover:text-rose-200 text-xs font-semibold transition-colors shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            )}

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

                {/* Test Chat Model Action */}
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
            {/* SECTION 4: DEVELOPER & DIAGNOSTICS (COLLAPSIBLE)               */}
            {/* ============================================================== */}
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
                        Text & Voice: <span className="text-emerald-400">GEMINI</span>
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
                      Database: {providerStatus?.database?.type === 'supabase' ? 'Supabase Connected' : 'In-Memory Fallback'}
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

            {/* ============================================================== */}
            {/* SECTION 4.5: PERSONAL MEMORY PERSISTENCE & CONTROL             */}
            {/* ============================================================== */}
            <div className="space-y-3 pt-3 border-t border-white/[0.06]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-400" />
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    PERSONAL MEMORY ({memoriesList.length})
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={fetchMemories}
                    disabled={loadingMemories}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-slate-300 transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingMemories ? 'animate-spin text-purple-400' : ''}`} />
                    <span>Refresh</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMemoriesSection(!showMemoriesSection)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-[10px] text-purple-300 transition-colors"
                  >
                    <span>{showMemoriesSection ? 'Hide' : 'Manage'}</span>
                    {showMemoriesSection ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-purple-950/20 border border-purple-500/20 flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <div className="text-xs font-semibold text-purple-200">
                    {memoriesList.length > 0 ? `${memoriesList.length} Durable Memories Preserved` : 'Zero Noise / Empty Memory Store'}
                  </div>
                  <div className="text-[10px] text-purple-300/70 truncate">
                    Isolated to authenticated user • Recalled automatically across all chats
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 shrink-0">
                  Supabase RLS
                </span>
              </div>

              {showMemoriesSection && (
                <div className="space-y-2 p-3 rounded-xl bg-[#080c14] border border-white/[0.08] max-h-60 overflow-y-auto">
                  {memoriesList.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400">
                      No memories saved yet. Share meaningful facts, preferences, or goals in chat.
                    </div>
                  ) : (
                    memoriesList.map((mem) => (
                      <div
                        key={mem.id}
                        className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                              {getCategoryLabel(mem.category)}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${mem.memoryType === 'insight' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                              {mem.memoryType === 'insight' ? 'AI Insight' : 'Confirmed Fact'}
                            </span>
                            {typeof mem.confidence === 'number' && (
                              <span className="text-[9px] text-slate-500 font-mono">
                                {Math.round(mem.confidence * 100)}% conf
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {editingMemoryId === mem.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(mem.id)}
                                  disabled={savingEditId === mem.id || !editingFact.trim()}
                                  className="px-2 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-[10px] font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
                                >
                                  {savingEditId === mem.id ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  )}
                                  <span>Save</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEdit}
                                  disabled={savingEditId === mem.id}
                                  className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 text-[10px] transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(mem)}
                                  className="p-1 rounded text-slate-500 hover:text-purple-300 hover:bg-purple-500/10 transition-colors"
                                  title="Edit this memory"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMemory(mem.id)}
                                  disabled={deletingMemoryId === mem.id}
                                  className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                  title="Delete this memory"
                                >
                                  {deletingMemoryId === mem.id ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-400" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {editingMemoryId === mem.id ? (
                          <div className="pt-1">
                            <input
                              type="text"
                              value={editingFact}
                              onChange={(e) => setEditingFact(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit(mem.id);
                                if (e.key === 'Escape') handleCancelEdit();
                              }}
                              className="w-full px-2 py-1 text-xs rounded bg-white/[0.05] border border-purple-500/30 text-white focus:outline-none focus:border-purple-400"
                              placeholder="Correct or update this memory fact..."
                              autoFocus
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-slate-200 break-words leading-relaxed">{mem.fact}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* ============================================================== */}
            {/* SECTION 5: DATABASE PERSISTENCE & REAL DIAGNOSTICS             */}
            {/* ============================================================== */}
            <div className="space-y-3 pt-3 border-t border-white/[0.06]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    DATABASE
                  </label>
                </div>
                <button
                  type="button"
                  onClick={handleFetchSchema}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-slate-300 transition-colors"
                >
                  <FileCode className="w-3 h-3 text-emerald-400" />
                  <span>Supabase Schema</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between">
                  <span className="text-[10px] text-slate-400">Supabase</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        dbHealth?.connected ? 'bg-emerald-400' : 'bg-rose-500'
                      }`}
                    />
                    <span className="text-xs font-semibold text-white">
                      {dbHealth?.connected ? 'Connected' : 'Not Connected'}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between">
                  <span className="text-[10px] text-slate-400">Persistence</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        dbHealth?.connected && (dbHealth?.write ?? true)
                          ? 'bg-emerald-400'
                          : 'bg-amber-400'
                      }`}
                    />
                    <span className="text-xs font-semibold text-white">
                      {dbHealth?.connected && (dbHealth?.write ?? true) ? 'Working' : 'In-Memory'}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between">
                  <span className="text-[10px] text-slate-400">Last test</span>
                  <span className="text-xs font-semibold text-slate-200 mt-1 truncate">
                    {lastDbTestDate || 'Not tested yet'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunDatabaseTest}
                  disabled={isRunningDbTest}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-semibold text-xs transition-colors disabled:opacity-50"
                >
                  {isRunningDbTest ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Executing Database Test Sequence...</span>
                    </>
                  ) : (
                    <>
                      <Database className="w-3.5 h-3.5" />
                      <span>RUN DATABASE TEST</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowDbDiagnostics(!showDbDiagnostics)}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 text-xs transition-colors"
                >
                  <span>Diagnostics</span>
                  {showDbDiagnostics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {showDbDiagnostics && (
                <div className="p-3 rounded-xl bg-[#080c14] border border-white/[0.08] space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 border-b border-white/[0.06] pb-1.5">
                    <span>Diagnostic Test Sequence</span>
                    {dbTestResult?.totalLatencyMs ? (
                      <span className="text-[10px] text-slate-500">Latency: {dbTestResult.totalLatencyMs}ms</span>
                    ) : null}
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-300">Database Connection</span>
                      {renderTestStepBadge(dbTestResult?.connection?.status || (dbHealth?.connected ? 'PASS' : 'FAIL'))}
                    </div>
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-300">CREATE</span>
                      {renderTestStepBadge(dbTestResult?.create?.status)}
                    </div>
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-300">READ</span>
                      {renderTestStepBadge(dbTestResult?.read?.status)}
                    </div>
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-300">UPDATE</span>
                      {renderTestStepBadge(dbTestResult?.update?.status)}
                    </div>
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-300">DELETE</span>
                      {renderTestStepBadge(dbTestResult?.delete?.status)}
                    </div>
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-300">Chat Persistence</span>
                      {renderTestStepBadge(dbTestResult?.chatPersistence?.status)}
                    </div>
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-300">Settings Persistence</span>
                      {renderTestStepBadge(dbTestResult?.settingsPersistence?.status)}
                    </div>
                  </div>

                  {(dbTestError || dbTestResult?.create?.error || dbTestResult?.read?.error || dbTestResult?.update?.error || dbTestResult?.delete?.error || dbHealth?.error) && (
                    <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] space-y-1">
                      <div className="font-semibold flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Developer Diagnostics:</span>
                      </div>
                      <p className="font-mono text-[10px] break-words">
                        {dbTestError ||
                          dbTestResult?.create?.error ||
                          dbTestResult?.read?.error ||
                          dbTestResult?.update?.error ||
                          dbTestResult?.delete?.error ||
                          dbHealth?.error}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

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

            {/* Progressive Web App (PWA) Section */}
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
                    <div className="text-xs font-medium text-white">Browser Notifications</div>
                    <div className="text-[10px] text-slate-400">
                      Status:{' '}
                      {notificationStatus === 'granted'
                        ? 'Allowed'
                        : notificationStatus === 'denied'
                        ? 'Blocked'
                        : 'Not Enabled'}
                    </div>
                  </div>
                </div>

                {notificationStatus === 'default' && (
                  <button
                    type="button"
                    onClick={handleToggleNotifications}
                    className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-slate-200 transition-colors"
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
              {saveError && (
                <span className="text-xs text-rose-400 font-medium truncate block">
                  {saveError}
                </span>
              )}
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

      {/* Supabase SQL Schema Modal */}
      {showSchemaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-2xl bg-[#0e1320] border border-white/[0.08] rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#090d16]">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-semibold text-white">Supabase SQL Schema Migration</span>
              </div>
              <button
                type="button"
                onClick={() => setShowSchemaModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto font-mono text-[11px] text-slate-300 bg-[#070a12]">
              <pre className="whitespace-pre-wrap">{schemaSql || 'Loading schema...'}</pre>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06] bg-[#090d16]">
              <span className="text-[11px] text-slate-400">Copy and run in Supabase SQL Editor</span>
              <button
                type="button"
                onClick={handleCopySchema}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors"
              >
                {copiedSql ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied SQL</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy SQL</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
