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
  Zap,
  Volume2,
  Mic,
  Sparkles,
  Terminal,
  Activity,
  AlertCircle,
  Play,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  UserCheck,
  Sliders,
  Upload,
  Database,
  Copy,
  CheckCircle2,
  XCircle,
  RefreshCw,
  FileCode,
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useBrainSettings } from '../../hooks/useBrainSettings';
import {
  TextProviderType,
  VoiceProviderType,
  ProviderHealthStatus,
  PersonalVoiceStatusResponse,
  DatabaseHealthResponse,
  DatabaseDiagnosticsResult,
  TestStepStatus,
} from '../../../shared/types';
import { safeStorage } from '../../services/storage';
import { ApiClient, ProviderTestResult } from '../../services/api.client';
import { AudioPlayer } from '../../services/audioPlayer';
import { PersonalVoiceSetupModal } from '../voice/PersonalVoiceSetupModal';

import { LiveVoiceDebugStats } from '../../hooks/useLiveVoice';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onClearHistory: () => void;
  liveDebugStats?: LiveVoiceDebugStats;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  isOpen,
  onClose,
  onClearHistory,
  liveDebugStats,
}) => {
  const { profile, providerStatus, updateSettings, refresh } = useBrainSettings();

  const [theme, setTheme] = useState<'dark' | 'midnight' | 'obsidian'>('dark');
  const [voiceName, setVoiceName] = useState('aura');
  const [streamText, setStreamText] = useState(true);
  const [soundEffects, setSoundEffects] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Independent AI Provider Selections
  const [textProvider, setTextProvider] = useState<TextProviderType>(() => {
    const saved = safeStorage.getItem('jexa_text_provider');
    if (saved === 'gemini' || saved === 'groq') return saved as TextProviderType;
    return 'gemini';
  });

  const [voiceProvider, setVoiceProvider] = useState<VoiceProviderType>(() => {
    const saved = safeStorage.getItem('jexa_voice_provider');
    if (saved === 'gemini' || saved === 'elevenlabs' || saved === 'personal') return saved as VoiceProviderType;
    return 'gemini';
  });

  // Text testing state
  const [testingGeminiText, setTestingGeminiText] = useState(false);
  const [geminiTextTestResult, setGeminiTextTestResult] = useState<ProviderTestResult | null>(null);

  const [testingGroqText, setTestingGroqText] = useState(false);
  const [groqTextTestResult, setGroqTextTestResult] = useState<ProviderTestResult | null>(null);

  // Dedicated Voice Provider Testing
  const [testingGeminiVoice, setTestingGeminiVoice] = useState(false);
  const [geminiVoiceTestResult, setGeminiVoiceTestResult] = useState<ProviderTestResult | null>(null);

  const [testingElevenLabsVoice, setTestingElevenLabsVoice] = useState(false);
  const [elevenLabsVoiceTestResult, setElevenLabsVoiceTestResult] = useState<ProviderTestResult | null>(null);

  // JEXA Personal Voice state & modal controls
  const [testingPersonalVoice, setTestingPersonalVoice] = useState(false);
  const [personalVoiceTestResult, setPersonalVoiceTestResult] = useState<ProviderTestResult | null>(null);
  const [personalVoiceStatusData, setPersonalVoiceStatusData] = useState<PersonalVoiceStatusResponse | null>(null);
  const [personalVoiceModalOpen, setPersonalVoiceModalOpen] = useState(false);
  const [personalModalInitialTab, setPersonalModalInitialTab] = useState<'sample' | 'engine'>('sample');
  const [personalModalInitialMode, setPersonalModalInitialMode] = useState<'record' | 'upload'>('record');

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
    return safeStorage.getItem('jexa_last_db_test_date') || 'October 6, 2026';
  });
  const [saveError, setSaveError] = useState<string | null>(null);

  // Real Notification Support
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission>('default');
  const { isInstallable, isInstalled, install } = usePWAInstall();

  // Sync state when dialog opens or profile loads
  useEffect(() => {
    if (profile?.selectedTextProvider) {
      setTextProvider(profile.selectedTextProvider);
    }
    if (profile?.selectedVoiceProvider) {
      setVoiceProvider(profile.selectedVoiceProvider);
    }
    if (profile?.voiceSettings?.voiceId) {
      setVoiceName(profile.voiceSettings.voiceId);
    }
    if (profile?.theme) {
      setTheme(profile.theme as any);
    }
  }, [profile, isOpen]);

  const loadPersonalVoiceStatus = async () => {
    try {
      const res = await ApiClient.getPersonalVoiceStatus();
      setPersonalVoiceStatusData(res);
    } catch (e) {
      console.warn('[SettingsDialog] Could not load personal voice status:', e);
    }
  };

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
      loadPersonalVoiceStatus();
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

  const handleSelectTextProvider = async (provider: TextProviderType) => {
    setTextProvider(provider);
    safeStorage.setItem('jexa_text_provider', provider);
    try {
      await ApiClient.selectProviders({ textProvider: provider });
    } catch (err: any) {
      console.warn('[SettingsDialog] Failed to persist text provider selection:', err.message);
    }
  };

  const handleSelectVoiceProvider = async (provider: VoiceProviderType) => {
    setVoiceProvider(provider);
    safeStorage.setItem('jexa_voice_provider', provider);
    try {
      await ApiClient.selectProviders({ voiceProvider: provider });
    } catch (err: any) {
      console.warn('[SettingsDialog] Failed to persist voice provider selection:', err.message);
    }
  };

  const handleTestGeminiText = async () => {
    setTestingGeminiText(true);
    setGeminiTextTestResult(null);
    try {
      const res = await ApiClient.testTextProvider('gemini');
      setGeminiTextTestResult(res);
      await refresh();
    } catch (err: any) {
      setGeminiTextTestResult({
        success: false,
        provider: 'gemini',
        code: err.code || 'UNAVAILABLE',
        status: err.code || 'UNAVAILABLE',
        error: err.message || 'Gemini text connection failed.',
      });
    } finally {
      setTestingGeminiText(false);
    }
  };

  const handleTestGroqText = async () => {
    setTestingGroqText(true);
    setGroqTextTestResult(null);
    try {
      const res = await ApiClient.testTextProvider('groq');
      setGroqTextTestResult(res);
      await refresh();
    } catch (err: any) {
      setGroqTextTestResult({
        success: false,
        provider: 'groq',
        code: err.code || 'UNAVAILABLE',
        status: err.code || 'UNAVAILABLE',
        error: err.message || 'Groq text connection failed.',
      });
    } finally {
      setTestingGroqText(false);
    }
  };

  const handleTestGeminiVoice = async () => {
    setTestingGeminiVoice(true);
    setGeminiVoiceTestResult(null);
    try {
      const res = await ApiClient.testVoiceProvider('gemini');
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
        code: isQuota ? 'QUOTA_EXHAUSTED' : err.code || 'UNAVAILABLE',
        status: isQuota ? 'QUOTA_EXHAUSTED' : err.code || 'UNAVAILABLE',
        error: isQuota
          ? 'Gemini Voice quota exhausted. Try again later or switch to ElevenLabs.'
          : err.message || 'Gemini Voice is temporarily unavailable. Try ElevenLabs.',
      });
    } finally {
      setTestingGeminiVoice(false);
    }
  };

  const handleTestElevenLabsVoice = async () => {
    setTestingElevenLabsVoice(true);
    setElevenLabsVoiceTestResult(null);
    try {
      const res = await ApiClient.testVoiceProvider('elevenlabs');
      setElevenLabsVoiceTestResult(res);
      if (res.success && res.audioUrl) {
        try {
          await AudioPlayer.playUrl(res.audioUrl);
        } catch (audioErr) {
          console.warn('[SettingsDialog] Test audio playback error:', audioErr);
        }
      }
      await refresh();
    } catch (err: any) {
      const is402 = err.status === 402 || err.code === 'PAYMENT_REQUIRED';
      setElevenLabsVoiceTestResult({
        success: false,
        provider: 'elevenlabs',
        code: is402 ? 'PAYMENT_REQUIRED' : err.code || 'UNAVAILABLE',
        status: is402 ? 'PAYMENT_REQUIRED' : err.code || 'UNAVAILABLE',
        error: is402
          ? 'This ElevenLabs voice requires a paid plan.'
          : err.message || 'ElevenLabs authentication failed. Check ELEVENLABS_API_KEY in Render environment.',
      });
    } finally {
      setTestingElevenLabsVoice(false);
    }
  };

  const handleTestPersonalVoice = async () => {
    setTestingPersonalVoice(true);
    setPersonalVoiceTestResult(null);
    try {
      const res = await ApiClient.testPersonalVoice();
      setPersonalVoiceTestResult(res);
      if (res.success && (res as any).audioUrl) {
        try {
          await AudioPlayer.playUrl((res as any).audioUrl);
        } catch (audioErr) {
          console.warn('[SettingsDialog] Test audio playback error:', audioErr);
        }
      }
      await refresh();
      await loadPersonalVoiceStatus();
    } catch (err: any) {
      setPersonalVoiceTestResult({
        success: false,
        provider: 'personal',
        code: err.code || 'NOT_CONFIGURED',
        status: (err.code as ProviderHealthStatus) || 'NOT_CONFIGURED',
        error: err.message || 'Personal voice engine not configured.',
      });
    } finally {
      setTestingPersonalVoice(false);
    }
  };

  const handleOpenPersonalVoiceModal = (tab: 'sample' | 'engine' = 'sample', mode: 'record' | 'upload' = 'record') => {
    setPersonalModalInitialTab(tab);
    setPersonalModalInitialMode(mode);
    setPersonalVoiceModalOpen(true);
  };

  if (!isOpen) return null;

  const handleSave = async () => {
    safeStorage.setItem('jexa_text_provider', textProvider);
    safeStorage.setItem('jexa_voice_provider', voiceProvider);
    safeStorage.setItem('jexa_voice_name', voiceName);
    setSaveError(null);

    try {
      await ApiClient.selectProviders({
        textProvider,
        voiceProvider,
        theme,
      });
      await updateSettings({
        selectedTextProvider: textProvider,
        selectedVoiceProvider: voiceProvider,
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
      console.error('[SettingsDialog] Failed to persist profile settings to database:', err);
      setSaveError("Couldn't save. Please try again.");
    }
  };

  // Helper statuses from backend registry
  const geminiTextDetail = providerStatus?.availableTextProviders?.find((p) => p.type === 'gemini');
  const groqTextDetail = providerStatus?.availableTextProviders?.find((p) => p.type === 'groq');

  const geminiVoiceDetail = providerStatus?.availableVoiceProviders?.find((p) => p.type === 'gemini');
  const elevenLabsDetail = providerStatus?.availableVoiceProviders?.find((p) => p.type === 'elevenlabs');
  const personalVoiceDetail = providerStatus?.availableVoiceProviders?.find((p) => p.type === 'personal');

  const isGeminiTextConfigured = geminiTextDetail?.isConfigured ?? true;
  const isGroqConfigured = groqTextDetail?.isConfigured ?? false;

  const isGeminiVoiceConfigured = geminiVoiceDetail?.isConfigured ?? true;
  const isElevenLabsConfigured = elevenLabsDetail?.isConfigured ?? false;

  const isPersonalConfigured = Boolean(personalVoiceStatusData?.configured || personalVoiceDetail?.isConfigured);
  const hasReferenceVoice = Boolean(personalVoiceStatusData?.referenceVoice || personalVoiceDetail?.voiceId?.includes('Sample'));
  const personalEngine = personalVoiceStatusData?.engine || (personalVoiceDetail as any)?.engine || 'none';
  const personalModel = personalVoiceStatusData?.model || personalVoiceDetail?.model || 'none';

  // Resolved statuses matching exact user requirements:
  // CONNECTED | READY | UNAVAILABLE | TEMPORARILY_UNAVAILABLE | QUOTA_EXHAUSTED | AUTHENTICATION_ERROR | PAYMENT_REQUIRED | MODEL_NOT_FOUND | NOT_CONFIGURED | ERROR
  const geminiTextStatus: ProviderHealthStatus = geminiTextTestResult
    ? (geminiTextTestResult.status || (geminiTextTestResult.success ? 'CONNECTED' : (geminiTextTestResult.code as ProviderHealthStatus) || 'UNAVAILABLE'))
    : (geminiTextDetail?.status || (isGeminiTextConfigured ? 'CONNECTED' : 'NOT_CONFIGURED'));

  const groqTextStatus: ProviderHealthStatus = groqTextTestResult
    ? (groqTextTestResult.status || (groqTextTestResult.success ? 'CONNECTED' : (groqTextTestResult.code as ProviderHealthStatus) || 'UNAVAILABLE'))
    : (groqTextDetail?.status || (isGroqConfigured ? 'CONNECTED' : 'NOT_CONFIGURED'));

  // Voice providers: do NOT show "CONNECTED" merely because API key exists! Only after real successful test
  const geminiVoiceStatus: ProviderHealthStatus = geminiVoiceTestResult
    ? (geminiVoiceTestResult.status || (geminiVoiceTestResult.success ? 'CONNECTED' : (geminiVoiceTestResult.code as ProviderHealthStatus) || 'UNAVAILABLE'))
    : (geminiVoiceDetail?.status || (isGeminiVoiceConfigured ? 'UNAVAILABLE' : 'NOT_CONFIGURED'));

  const elevenLabsVoiceStatus: ProviderHealthStatus = elevenLabsVoiceTestResult
    ? (elevenLabsVoiceTestResult.status || (elevenLabsVoiceTestResult.success ? 'CONNECTED' : (elevenLabsVoiceTestResult.code as ProviderHealthStatus) || 'UNAVAILABLE'))
    : (elevenLabsDetail?.status || (isElevenLabsConfigured ? 'UNAVAILABLE' : 'NOT_CONFIGURED'));

  const personalVoiceStatus: ProviderHealthStatus = personalVoiceTestResult
    ? (personalVoiceTestResult.status || (personalVoiceTestResult.success ? 'CONNECTED' : (personalVoiceTestResult.code as ProviderHealthStatus) || 'NOT_CONFIGURED'))
    : (personalVoiceStatusData?.status || personalVoiceDetail?.status || (isPersonalConfigured ? 'CONNECTED' : (hasReferenceVoice ? 'READY' : 'NOT_CONFIGURED')));

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
      case 'PAYMENT_REQUIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            PAYMENT REQUIRED
          </span>
        );
      case 'AUTHENTICATION_ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            AUTHENTICATION ERROR
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
            TEMPORARILY UNAVAILABLE
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
            <h2 className="font-semibold text-sm text-white">AI Provider Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Settings Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-6 flex-1">
          {/* ============================================================== */}
          {/* SECTION 1: TEXT AI PROVIDER SELECTION                          */}
          {/* ============================================================== */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                <span>Text AI Engine</span>
              </label>
              <span className="text-[10px] text-slate-500 font-mono">Independent Selection</span>
            </div>

            {/* Provider Selection Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Google Gemini Text Card */}
              <div
                className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  textProvider === 'gemini'
                    ? 'border-emerald-500 bg-emerald-950/25 ring-1 ring-emerald-500/30'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]'
                }`}
              >
                <div
                  className="cursor-pointer"
                  onClick={() => handleSelectTextProvider('gemini')}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-white font-semibold text-xs">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Google Gemini</span>
                    </div>
                    {renderStatusBadge(geminiTextStatus)}
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-medium border ${
                        isGeminiTextConfigured
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                      }`}
                    >
                      {isGeminiTextConfigured ? 'API Configured' : 'Not Configured'}
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400/90 truncate">
                      {geminiTextDetail?.model || 'gemini-3.8-flash'}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-400 leading-tight mb-2">
                    Deep multimodal reasoning, large context window & fast latency.
                  </p>

                  <div className="text-[9px] text-slate-500 mb-3 flex items-center justify-between">
                    <span>Last Test:</span>
                    <span className="text-slate-300 font-mono">
                      {geminiTextTestResult?.success
                        ? `${geminiTextTestResult.latencyMs}ms (Verified)`
                        : isGeminiTextConfigured
                        ? 'Ready to test'
                        : 'No test yet'}
                    </span>
                  </div>
                </div>

                {/* Gemini Text Test Button & Status */}
                <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                  <button
                    type="button"
                    onClick={handleTestGeminiText}
                    disabled={testingGeminiText}
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] font-medium text-slate-200 transition-all disabled:opacity-50"
                  >
                    <Play className="w-3 h-3 text-emerald-400" />
                    <span>{testingGeminiText ? 'Testing Connection...' : 'Test Gemini Text'}</span>
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
                          <span className="truncate">{geminiTextTestResult.model} Connected ({geminiTextTestResult.latencyMs}ms)</span>
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

              {/* Groq Cloud Text Card */}
              <div
                className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  textProvider === 'groq'
                    ? 'border-emerald-500 bg-emerald-950/25 ring-1 ring-emerald-500/30'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]'
                }`}
              >
                <div
                  className="cursor-pointer"
                  onClick={() => handleSelectTextProvider('groq')}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-white font-semibold text-xs">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>Groq Cloud</span>
                    </div>
                    {renderStatusBadge(groqTextStatus)}
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-medium border ${
                        isGroqConfigured
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                      }`}
                    >
                      {isGroqConfigured ? 'API Configured' : 'Not Configured'}
                    </span>
                    <span className="text-[10px] font-mono text-amber-400/90 truncate">
                      {groqTextDetail?.model || 'llama-3.3-70b-versatile'}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-400 leading-tight mb-2">
                    Ultra-fast LPU inference powered by Meta Llama 3 models.
                  </p>

                  <div className="text-[9px] text-slate-500 mb-3 flex items-center justify-between">
                    <span>Last Test:</span>
                    <span className="text-slate-300 font-mono">
                      {groqTextTestResult?.success
                        ? `${groqTextTestResult.latencyMs}ms (Verified)`
                        : isGroqConfigured
                        ? 'Ready to test'
                        : 'No test yet'}
                    </span>
                  </div>
                </div>

                {/* Groq Text Test Button & Status */}
                <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                  <button
                    type="button"
                    onClick={handleTestGroqText}
                    disabled={testingGroqText}
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] font-medium text-slate-200 transition-all disabled:opacity-50"
                  >
                    <Play className="w-3 h-3 text-amber-400" />
                    <span>{testingGroqText ? 'Testing Connection...' : 'Test Groq Text'}</span>
                  </button>

                  {groqTextTestResult && (
                    <div
                      className={`text-[10px] font-medium flex items-center gap-1 ${
                        groqTextTestResult.success ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {groqTextTestResult.success ? (
                        <>
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{groqTextTestResult.model} Connected ({groqTextTestResult.latencyMs}ms)</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate" title={groqTextTestResult.error}>
                            {groqTextTestResult.error}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ============================================================== */}
          {/* SECTION 2: VOICE AI PROVIDER SELECTION                         */}
          {/* ============================================================== */}
          <div className="space-y-3 pt-3 border-t border-white/[0.06]">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-teal-400" />
                <span>Voice AI Engine</span>
              </label>
              <span className="text-[10px] text-slate-500 font-mono">Independent Selection</span>
            </div>

            {/* Provider Selection Cards: 3 Providers */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Google Gemini Voice Card */}
              <div
                className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  voiceProvider === 'gemini'
                    ? 'border-emerald-500 bg-emerald-950/25 ring-1 ring-emerald-500/30'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]'
                }`}
              >
                <div
                  className="cursor-pointer"
                  onClick={() => handleSelectVoiceProvider('gemini')}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-white font-semibold text-xs">
                      <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                      <span>Gemini Voice</span>
                    </div>
                    {renderStatusBadge(geminiVoiceStatus)}
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-medium border ${
                        isGeminiVoiceConfigured
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                      }`}
                    >
                      {isGeminiVoiceConfigured ? 'API Configured' : 'Not Configured'}
                    </span>
                    <span className="text-[10px] font-mono text-teal-400/90 truncate">
                      {geminiVoiceDetail?.model || 'gemini-3.8-flash-lite-tts'}
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-400 leading-tight mb-2">
                    Voice IDs: <span className="text-slate-300 font-mono">Aoede / Fenrir / Kore</span>
                  </div>

                  <div className="text-[9px] text-slate-500 mb-3 flex items-center justify-between">
                    <span>Last Successful Test:</span>
                    <span className="text-slate-300 font-mono">
                      {geminiVoiceTestResult?.success
                        ? `${geminiVoiceTestResult.latencyMs}ms (Just tested)`
                        : geminiVoiceDetail?.lastSuccessfulTest
                        ? `${geminiVoiceDetail.lastSuccessfulTest.latencyMs}ms`
                        : 'No test yet'}
                    </span>
                  </div>
                </div>

                {/* Test Gemini Voice Action */}
                <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                  <button
                    type="button"
                    onClick={handleTestGeminiVoice}
                    disabled={testingGeminiVoice}
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] font-medium text-slate-200 transition-all disabled:opacity-50"
                  >
                    <Play className="w-3 h-3 text-teal-400" />
                    <span>{testingGeminiVoice ? 'Testing Voice...' : 'Test Gemini Voice'}</span>
                  </button>

                  {/* Actual error or status banner */}
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
                          <span className="leading-snug">
                            {geminiVoiceTestResult.error}
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  {!geminiVoiceTestResult && geminiVoiceDetail?.error && (
                    <div className="text-[10px] p-2 rounded-lg font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span className="leading-snug">{geminiVoiceDetail.error}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ElevenLabs Voice Card */}
              <div
                className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  voiceProvider === 'elevenlabs'
                    ? 'border-emerald-500 bg-emerald-950/25 ring-1 ring-emerald-500/30'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]'
                }`}
              >
                <div
                  className="cursor-pointer"
                  onClick={() => handleSelectVoiceProvider('elevenlabs')}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-white font-semibold text-xs">
                      <Mic className="w-3.5 h-3.5 text-indigo-400" />
                      <span>ElevenLabs</span>
                    </div>
                    {renderStatusBadge(elevenLabsVoiceStatus)}
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-medium border ${
                        isElevenLabsConfigured
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                      }`}
                    >
                      {isElevenLabsConfigured ? 'API Configured' : 'Not Configured'}
                    </span>
                    <span className="text-[10px] font-mono text-indigo-400/90 truncate">
                      {elevenLabsDetail?.model || 'eleven_multilingual_v2'}
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-400 leading-tight mb-2 truncate" title={elevenLabsDetail?.voiceId || '21m00Tcm4TlvDq8ikWAM (Rachel)'}>
                    Voice ID: <span className="text-slate-300 font-mono">{elevenLabsDetail?.voiceId || '21m00Tcm4TlvDq8ikWAM (Rachel)'}</span>
                  </div>

                  <div className="text-[9px] text-slate-500 mb-3 flex items-center justify-between">
                    <span>Last Successful Test:</span>
                    <span className="text-slate-300 font-mono">
                      {elevenLabsVoiceTestResult?.success
                        ? `${elevenLabsVoiceTestResult.latencyMs}ms (Just tested)`
                        : elevenLabsDetail?.lastSuccessfulTest
                        ? `${elevenLabsDetail.lastSuccessfulTest.latencyMs}ms`
                        : 'No test yet'}
                    </span>
                  </div>
                </div>

                {/* Test ElevenLabs Voice Action */}
                <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                  <button
                    type="button"
                    onClick={handleTestElevenLabsVoice}
                    disabled={testingElevenLabsVoice}
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] font-medium text-slate-200 transition-all disabled:opacity-50"
                  >
                    <Play className="w-3 h-3 text-indigo-400" />
                    <span>{testingElevenLabsVoice ? 'Testing Voice...' : 'Test ElevenLabs Voice'}</span>
                  </button>

                  {/* Actual error or status banner */}
                  {elevenLabsVoiceTestResult && (
                    <div
                      className={`text-[10px] p-2 rounded-lg font-medium border flex items-start gap-1.5 ${
                        elevenLabsVoiceTestResult.success
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          : elevenLabsVoiceTestResult.code === 'PAYMENT_REQUIRED'
                          ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                          : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                      }`}
                    >
                      {elevenLabsVoiceTestResult.success ? (
                        <>
                          <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>Voice generated successfully ({elevenLabsVoiceTestResult.latencyMs}ms)</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span className="leading-snug">
                            {elevenLabsVoiceTestResult.error}
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  {!elevenLabsVoiceTestResult && elevenLabsDetail?.error && (
                    <div className="text-[10px] p-2 rounded-lg font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span className="leading-snug">{elevenLabsDetail.error}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. JEXA Personal Voice Card */}
              <div
                className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  voiceProvider === 'personal'
                    ? 'border-emerald-500 bg-emerald-950/25 ring-1 ring-emerald-500/30'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]'
                }`}
              >
                <div
                  className="cursor-pointer"
                  onClick={() => handleSelectVoiceProvider('personal')}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-white font-semibold text-xs truncate">
                      <UserCheck className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      <span className="truncate">Personal Voice</span>
                    </div>
                    {renderStatusBadge(personalVoiceStatus)}
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-medium border ${
                        isPersonalConfigured
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                      }`}
                    >
                      {isPersonalConfigured ? 'Engine Configured' : 'Not Configured'}
                    </span>
                    <span className="text-[10px] font-mono text-teal-400/90 truncate">
                      {personalEngine && personalEngine !== 'none' ? personalEngine : 'none'}
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-400 leading-tight mb-2 truncate">
                    Ref: <span className="text-slate-300 font-mono">{hasReferenceVoice ? 'Sample recorded' : 'No sample'}</span>
                  </div>

                  <div className="text-[9px] text-slate-500 mb-3 flex items-center justify-between">
                    <span>Engine:</span>
                    <span className="text-slate-300 font-mono truncate">
                      {personalEngine && personalEngine !== 'none' ? personalEngine : 'Not configured'}
                    </span>
                  </div>
                </div>

                {/* Quick actions for Personal Voice Card */}
                <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenPersonalVoiceModal('sample')}
                      className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-[10px] font-semibold text-teal-200 transition-colors cursor-pointer"
                    >
                      <Sliders className="w-3 h-3 text-teal-400" />
                      <span>Set Up</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleTestPersonalVoice}
                      disabled={!isPersonalConfigured || !hasReferenceVoice || testingPersonalVoice}
                      title={
                        !isPersonalConfigured || !hasReferenceVoice
                          ? 'Test Voice is disabled until a real voice engine and reference voice are configured.'
                          : 'Test personal voice generation'
                      }
                      className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-[10px] font-medium text-slate-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Play className="w-3 h-3 text-teal-400" />
                      <span>{testingPersonalVoice ? 'Testing...' : 'Test Voice'}</span>
                    </button>
                  </div>

                  {personalVoiceTestResult && (
                    <div
                      className={`text-[9px] p-1.5 rounded-lg font-medium border flex items-start gap-1 ${
                        personalVoiceTestResult.success
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                      }`}
                    >
                      {personalVoiceTestResult.success ? (
                        <>
                          <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span className="truncate">Verified ({personalVoiceTestResult.latencyMs}ms)</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span className="leading-snug truncate" title={personalVoiceTestResult.error}>
                            {personalVoiceTestResult.error}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* DEDICATED JEXA PERSONAL VOICE SETTINGS SECTION */}
            <div className="p-3.5 rounded-xl border border-teal-500/25 bg-gradient-to-br from-teal-950/20 via-black/40 to-black/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center">
                    <UserCheck className="w-4 h-4 text-teal-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white tracking-wide flex items-center gap-1.5">
                      <span>JEXA PERSONAL VOICE</span>
                    </h4>
                    <p className="text-[10px] text-slate-400">
                      Use your own recorded voice for AI-generated speech
                    </p>
                  </div>
                </div>
                {renderStatusBadge(personalVoiceStatus)}
              </div>

              {/* Status and Parameters Required by Specification */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs bg-black/40 p-2.5 rounded-lg border border-white/[0.04]">
                <div>
                  <span className="text-[10px] text-slate-500 block mb-0.5">Voice model:</span>
                  <span className="font-mono text-slate-200 font-medium">
                    {personalModel && personalModel !== 'none' ? personalModel : 'Not configured'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block mb-0.5">Reference voice:</span>
                  <span className="text-slate-200 font-medium truncate block">
                    {hasReferenceVoice
                      ? personalVoiceStatusData?.referenceMetadata?.name
                        ? `${personalVoiceStatusData.referenceMetadata.name} (${personalVoiceStatusData.referenceMetadata.durationSeconds || 'sample'}s)`
                        : 'Sample recorded'
                      : 'Not uploaded'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block mb-0.5">Engine:</span>
                  <span className="font-mono text-slate-200 font-medium">
                    {personalEngine && personalEngine !== 'none' ? personalEngine : 'Not configured'}
                  </span>
                </div>
              </div>

              {/* Action Buttons: [ Set Up Personal Voice ] [ Record Voice ] [ Upload Voice Sample ] [ Set Up Engine ] [ Test Voice ] */}
              <div className="flex items-center gap-2 flex-wrap pt-0.5">
                <button
                  type="button"
                  onClick={() => handleOpenPersonalVoiceModal('sample')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Set Up Personal Voice</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenPersonalVoiceModal('sample', 'record')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-slate-200 transition-colors cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5 text-teal-400" />
                  <span>Record Voice</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenPersonalVoiceModal('sample', 'upload')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-slate-200 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Upload Voice Sample</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenPersonalVoiceModal('engine')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-slate-200 transition-colors cursor-pointer"
                >
                  <Cpu className="w-3.5 h-3.5 text-purple-400" />
                  <span>Set Up Engine</span>
                </button>

                <button
                  type="button"
                  onClick={handleTestPersonalVoice}
                  disabled={!isPersonalConfigured || !hasReferenceVoice || testingPersonalVoice}
                  title={
                    !isPersonalConfigured || !hasReferenceVoice
                      ? 'The Test Voice button must remain disabled until a real voice engine and reference voice are configured.'
                      : 'Test personal voice synthesis'
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-slate-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed ml-auto cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-teal-400" />
                  <span>{testingPersonalVoice ? 'Testing Voice...' : 'Test Voice'}</span>
                </button>
              </div>

              {/* Helper notice when disabled */}
              {(!isPersonalConfigured || !hasReferenceVoice) && (
                <div className="text-[11px] text-slate-400 bg-black/30 border border-white/[0.04] p-2.5 rounded-lg flex items-center justify-between gap-2">
                  <span>
                    {!hasReferenceVoice
                      ? 'No voice sample uploaded or recorded yet. Use [Record Voice] or [Upload Voice Sample] to add your reference.'
                      : 'Personal voice engine not configured. Backend engine is currently set to PERSONAL_VOICE_ENGINE=none.'}
                  </span>
                  <span className="text-[10px] text-amber-400 font-mono shrink-0">Test Voice Disabled</span>
                </div>
              )}
            </div>
          </div>

          {/* ============================================================== */}
          {/* SECTION 3: VOICE PERSONA / PROFILE PRESET                      */}
          {/* ============================================================== */}
          <div className="space-y-2 pt-3 border-t border-white/[0.06]">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Voice Persona
              </label>
              <span className="text-[9px] text-slate-500 font-mono">
                Mapped to {voiceProvider === 'elevenlabs' ? 'ElevenLabs' : voiceProvider === 'personal' ? 'Personal Voice Sample' : 'Gemini'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  id: 'aura',
                  name: 'Aura',
                  desc: voiceProvider === 'elevenlabs' ? 'Rachel • Warm' : 'Aoede • Serene',
                },
                {
                  id: 'atlas',
                  name: 'Atlas',
                  desc: voiceProvider === 'elevenlabs' ? 'Adam • Crisp' : 'Fenrir • Direct',
                },
                {
                  id: 'lyra',
                  name: 'Lyra',
                  desc: voiceProvider === 'elevenlabs' ? 'Bella • Expressive' : 'Kore • Bright',
                },
              ].map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVoiceName(v.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
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
                  {/* 1. Provider */}
                  <div className="bg-white/[0.03] p-2 rounded-lg border border-white/[0.04]">
                    <span className="text-slate-500 block mb-0.5">Active Providers</span>
                    <p className="text-white font-semibold">
                      Text: <span className="text-emerald-400">{textProvider.toUpperCase()}</span>
                    </p>
                    <p className="text-white font-semibold">
                      Voice: <span className="text-teal-400">{voiceProvider.toUpperCase()}</span>
                    </p>
                  </div>

                  {/* 2. Model */}
                  <div className="bg-white/[0.03] p-2 rounded-lg border border-white/[0.04]">
                    <span className="text-slate-500 block mb-0.5">Configured Models</span>
                    <p className="text-slate-200 truncate" title={textProvider === 'groq' ? (groqTextDetail?.model || 'llama-3.3-70b-versatile') : (geminiTextDetail?.model || 'gemini-3.8-flash')}>
                      Text: {textProvider === 'groq' ? (groqTextDetail?.model || 'llama-3.3-70b-versatile') : (geminiTextDetail?.model || 'gemini-3.8-flash')}
                    </p>
                    <p className="text-slate-200 truncate" title={voiceProvider === 'elevenlabs' ? (elevenLabsDetail?.model || 'eleven_multilingual_v2') : voiceProvider === 'personal' ? (personalModel || 'Not configured') : (geminiVoiceDetail?.model || 'gemini-3.8-flash-lite-tts')}>
                      Voice: {voiceProvider === 'elevenlabs' ? (elevenLabsDetail?.model || 'eleven_multilingual_v2') : voiceProvider === 'personal' ? (personalModel || 'Not configured') : (geminiVoiceDetail?.model || 'gemini-3.8-flash-lite-tts')}
                    </p>
                  </div>

                  {/* 3. Session Status */}
                  <div className="bg-white/[0.03] p-2 rounded-lg border border-white/[0.04]">
                    <span className="text-slate-500 block mb-0.5">Session Status</span>
                    <p className="text-emerald-400 font-semibold capitalize">
                      {liveDebugStats?.sessionStatus || 'Idle'}
                    </p>
                  </div>

                  {/* 4. Input Audio Status */}
                  <div className="bg-white/[0.03] p-2 rounded-lg border border-white/[0.04]">
                    <span className="text-slate-500 block mb-0.5">Input Audio Status</span>
                    <p className="text-cyan-400 font-semibold capitalize">
                      {liveDebugStats?.inputAudioStatus || 'Disconnected'}
                    </p>
                  </div>

                  {/* 5. Output Audio Status */}
                  <div className="bg-white/[0.03] p-2 rounded-lg border border-white/[0.04]">
                    <span className="text-slate-500 block mb-0.5">Output Audio Status</span>
                    <p className="text-indigo-400 font-semibold capitalize">
                      {liveDebugStats?.outputAudioStatus || 'Idle'}
                    </p>
                  </div>

                  {/* 6. Approximate Token Usage */}
                  <div className="bg-white/[0.03] p-2 rounded-lg border border-white/[0.04]">
                    <span className="text-slate-500 block mb-0.5">Approx. Token Usage</span>
                    <p className="text-amber-400 font-semibold">
                      {liveDebugStats?.approximateTokens ? `${liveDebugStats.approximateTokens.toLocaleString()} tokens` : '0 tokens'}
                    </p>
                  </div>

                  {/* 7. Connection Latency */}
                  <div className="bg-white/[0.03] p-2 rounded-lg border border-white/[0.04]">
                    <span className="text-slate-500 block mb-0.5">Connection Latency</span>
                    <p className="text-slate-200 font-semibold">
                      {liveDebugStats?.connectionLatencyMs
                        ? `${liveDebugStats.connectionLatencyMs} ms`
                        : (textProvider === 'groq' ? groqTextTestResult : geminiTextTestResult)?.latencyMs
                        ? `${(textProvider === 'groq' ? groqTextTestResult : geminiTextTestResult)?.latencyMs} ms (test)`
                        : '< 50 ms'}
                    </p>
                  </div>

                  {/* 8. Last Provider Error */}
                  <div className="bg-white/[0.03] p-2 rounded-lg border border-white/[0.04]">
                    <span className="text-slate-500 block mb-0.5">Last Provider Error</span>
                    {(() => {
                      const activeTextTestResult =
                        textProvider === 'groq'
                          ? groqTextTestResult
                          : geminiTextTestResult;
                      const activeVoiceTestError =
                        voiceProvider === 'gemini'
                          ? geminiVoiceTestResult?.error
                          : voiceProvider === 'personal'
                          ? personalVoiceTestResult?.error
                          : elevenLabsVoiceTestResult?.error;
                      const displayError =
                        liveDebugStats?.lastError ||
                        activeTextTestResult?.error ||
                        activeVoiceTestError ||
                        personalVoiceTestResult?.error ||
                        geminiVoiceTestResult?.error ||
                        elevenLabsVoiceTestResult?.error ||
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
                    Database: {providerStatus?.database?.type === 'supabase' ? 'Supabase Connected' : 'In-Memory Safe Fallback'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      safeStorage.removeItem('jexa_text_provider');
                      safeStorage.removeItem('jexa_voice_provider');
                      safeStorage.removeItem('jexa_voice_name');
                      refresh();
                    }}
                    className="flex items-center gap-1 text-[10px] text-rose-400 hover:text-rose-300 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Local Overrides</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ============================================================== */}
          {/* SECTION 5: DATABASE PERSISTENCE & REAL DIAGNOSTICS            */}
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
                title="View and copy Supabase SQL migration script"
              >
                <FileCode className="w-3 h-3 text-emerald-400" />
                <span>Supabase Schema</span>
              </button>
            </div>

            {/* Status Overview Cards: Supabase Connection, Persistence, Last Test */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Card 1: Supabase Connection */}
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

              {/* Card 2: Persistence */}
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
                    {dbHealth?.connected && (dbHealth?.write ?? true)
                      ? 'Working'
                      : 'In-Memory'}
                  </span>
                </div>
              </div>

              {/* Card 3: Last Test */}
              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between">
                <span className="text-[10px] text-slate-400">Last test</span>
                <span className="text-xs font-semibold text-slate-200 mt-1 truncate">
                  {lastDbTestDate || 'Not tested yet'}
                </span>
              </div>
            </div>

            {/* Test Database Button & Trigger */}
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
                title="Toggle expandable diagnostics"
              >
                <span>Diagnostics</span>
                {showDbDiagnostics ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Expandable Developer Diagnostics Section */}
            {showDbDiagnostics && (
              <div className="p-3 rounded-xl bg-[#080c14] border border-white/[0.08] space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 border-b border-white/[0.06] pb-1.5">
                  <span>Diagnostic Test Sequence</span>
                  {dbTestResult?.totalLatencyMs ? (
                    <span className="text-[10px] text-slate-500">
                      Latency: {dbTestResult.totalLatencyMs}ms
                    </span>
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

                {/* Actual error / diagnostics details without exposing secrets */}
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

                {/* Diagnostic notes */}
                {dbTestResult?.notes && dbTestResult.notes.length > 0 && (
                  <div className="text-[10px] text-slate-400 space-y-0.5 pt-1 border-t border-white/[0.04]">
                    {dbTestResult.notes.map((note, idx) => (
                      <p key={idx}>ℹ {note}</p>
                    ))}
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
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors"
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

      {/* Personal Voice Setup & Calibration Modal */}
      <PersonalVoiceSetupModal
        isOpen={personalVoiceModalOpen}
        onClose={() => {
          setPersonalVoiceModalOpen(false);
          loadPersonalVoiceStatus();
          refresh();
        }}
        onSampleSaved={async () => {
          await loadPersonalVoiceStatus();
          await refresh();
        }}
        onSampleDeleted={async () => {
          await loadPersonalVoiceStatus();
          await refresh();
        }}
        initialTab={personalModalInitialTab}
        initialMode={personalModalInitialMode}
      />

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
