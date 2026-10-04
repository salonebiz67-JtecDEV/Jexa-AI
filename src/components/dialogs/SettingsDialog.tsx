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
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useBrainSettings } from '../../hooks/useBrainSettings';
import { TextProviderType, VoiceProviderType } from '../../../shared/types/provider';
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
    if (saved === 'gemini' || saved === 'elevenlabs') return saved as VoiceProviderType;
    return 'gemini';
  });

  // Text testing state
  const [testingText, setTestingText] = useState(false);
  const [textTestResult, setTextTestResult] = useState<ProviderTestResult | null>(null);

  // Dedicated Voice Provider Testing
  const [testingGeminiVoice, setTestingGeminiVoice] = useState(false);
  const [geminiVoiceTestResult, setGeminiVoiceTestResult] = useState<ProviderTestResult | null>(null);

  const [testingElevenLabsVoice, setTestingElevenLabsVoice] = useState(false);
  const [elevenLabsVoiceTestResult, setElevenLabsVoiceTestResult] = useState<ProviderTestResult | null>(null);

  // Debug/Diagnostics panel toggle
  const [showDeveloperPanel, setShowDeveloperPanel] = useState(false);

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
  }, [profile, isOpen]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationStatus(Notification.permission);
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

  const handleTestText = async () => {
    setTestingText(true);
    setTextTestResult(null);
    try {
      const res = await ApiClient.testTextProvider(textProvider);
      setTextTestResult(res);
      await refresh();
    } catch (err: any) {
      setTextTestResult({
        success: false,
        provider: textProvider,
        error: err.message || 'Test request failed.',
      });
    } finally {
      setTestingText(false);
    }
  };

  const handleTestGeminiVoice = async () => {
    setTestingGeminiVoice(true);
    setGeminiVoiceTestResult(null);
    try {
      const res = await ApiClient.testVoiceProvider('gemini');
      setGeminiVoiceTestResult(res);
      if (res.success && res.audioUrl) {
        await AudioPlayer.playUrl(res.audioUrl);
      }
      await refresh();
    } catch (err: any) {
      setGeminiVoiceTestResult({
        success: false,
        provider: 'gemini',
        error: err.message || 'Gemini voice is temporarily unavailable. Try ElevenLabs.',
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
        await AudioPlayer.playUrl(res.audioUrl);
      }
      await refresh();
    } catch (err: any) {
      setElevenLabsVoiceTestResult({
        success: false,
        provider: 'elevenlabs',
        error: err.message || 'ElevenLabs authentication failed. Check ELEVENLABS_API_KEY.',
      });
    } finally {
      setTestingElevenLabsVoice(false);
    }
  };

  if (!isOpen) return null;

  const handleSave = async () => {
    safeStorage.setItem('jexa_text_provider', textProvider);
    safeStorage.setItem('jexa_voice_provider', voiceProvider);
    safeStorage.setItem('jexa_voice_name', voiceName);

    try {
      await updateSettings({
        selectedTextProvider: textProvider,
        selectedVoiceProvider: voiceProvider,
        voiceSettings: {
          voiceId: voiceName,
          speed: 1.0,
          pitch: 1.0,
          autoSpeak: false,
        },
      });
    } catch (err) {
      console.error('[SettingsDialog] Failed to persist profile settings:', err);
    }

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
  };

  // Helper statuses from backend registry
  const geminiTextDetail = providerStatus?.availableTextProviders?.find((p) => p.type === 'gemini');
  const groqTextDetail = providerStatus?.availableTextProviders?.find((p) => p.type === 'groq');

  const geminiVoiceDetail = providerStatus?.availableVoiceProviders?.find((p) => p.type === 'gemini');
  const elevenLabsDetail = providerStatus?.availableVoiceProviders?.find((p) => p.type === 'elevenlabs');

  const isGeminiTextConfigured = geminiTextDetail?.isConfigured ?? true;
  const isGroqConfigured = groqTextDetail?.isConfigured ?? false;

  const isGeminiVoiceConfigured = geminiVoiceDetail?.isConfigured ?? true;
  const isElevenLabsConfigured = elevenLabsDetail?.isConfigured ?? false;

  return (
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
            <div className="grid grid-cols-2 gap-3">
              {/* Google Gemini Card */}
              <button
                type="button"
                onClick={() => {
                  setTextProvider('gemini');
                  setTextTestResult(null);
                }}
                className={`p-3 rounded-xl border text-left transition-all relative ${
                  textProvider === 'gemini'
                    ? 'border-emerald-500 bg-emerald-950/25 ring-1 ring-emerald-500/30'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-white font-semibold text-xs">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Google Gemini</span>
                  </div>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isGeminiTextConfigured ? 'bg-emerald-400 ring-2 ring-emerald-400/20' : 'bg-amber-400'
                    }`}
                  />
                </div>
                <div className="text-[10px] font-mono text-emerald-400/80 mb-1">
                  {geminiTextDetail?.model || 'gemini-3.8-flash'}
                </div>
                <div className="text-[10px] text-slate-400 leading-tight">
                  Multimodal reasoning & large context
                </div>
                <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-[9px] text-slate-500">Status</span>
                  <span
                    className={`text-[9px] font-medium ${
                      isGeminiTextConfigured ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {isGeminiTextConfigured ? 'Connected' : 'Not configured'}
                  </span>
                </div>
              </button>

              {/* Groq Cloud Card */}
              <button
                type="button"
                onClick={() => {
                  setTextProvider('groq');
                  setTextTestResult(null);
                }}
                className={`p-3 rounded-xl border text-left transition-all relative ${
                  textProvider === 'groq'
                    ? 'border-emerald-500 bg-emerald-950/25 ring-1 ring-emerald-500/30'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-white font-semibold text-xs">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Groq Cloud</span>
                  </div>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isGroqConfigured ? 'bg-emerald-400 ring-2 ring-emerald-400/20' : 'bg-amber-400'
                    }`}
                  />
                </div>
                <div className="text-[10px] font-mono text-amber-400/80 mb-1">
                  {groqTextDetail?.model || 'llama-3.3-70b-versatile'}
                </div>
                <div className="text-[10px] text-slate-400 leading-tight">
                  Ultra-fast LPU inference (Llama 3)
                </div>
                <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-[9px] text-slate-500">Status</span>
                  <span
                    className={`text-[9px] font-medium ${
                      isGroqConfigured ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {isGroqConfigured ? 'Connected' : 'Not configured'}
                  </span>
                </div>
              </button>
            </div>

            {/* Test Text Provider Button & Result */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleTestText}
                disabled={testingText}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-xs font-medium text-slate-200 transition-all disabled:opacity-50"
              >
                <Play className="w-3 h-3 text-emerald-400" />
                <span>{testingText ? 'Testing Connection...' : `Test ${textProvider === 'groq' ? 'Groq' : 'Gemini'} Text`}</span>
              </button>

              {textTestResult && (
                <div
                  className={`text-[10px] font-medium flex items-center gap-1 ${
                    textTestResult.success ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {textTestResult.success ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{textTestResult.model} Connected ({textTestResult.latencyMs}ms)</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span className="truncate max-w-[200px]" title={textTestResult.error}>
                        {textTestResult.code || 'Unavailable'}: {textTestResult.error}
                      </span>
                    </>
                  )}
                </div>
              )}
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

            {/* Provider Selection Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Google Gemini Card */}
              <div
                className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  voiceProvider === 'gemini'
                    ? 'border-emerald-500 bg-emerald-950/25 ring-1 ring-emerald-500/30'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]'
                }`}
              >
                <div
                  className="cursor-pointer"
                  onClick={() => setVoiceProvider('gemini')}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 text-white font-semibold text-xs">
                      <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                      <span>Google Gemini</span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium ${
                        geminiVoiceTestResult && !geminiVoiceTestResult.success
                          ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                          : isGeminiVoiceConfigured
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          geminiVoiceTestResult && !geminiVoiceTestResult.success
                            ? 'bg-rose-400'
                            : isGeminiVoiceConfigured
                            ? 'bg-emerald-400'
                            : 'bg-amber-400'
                        }`}
                      />
                      {geminiVoiceTestResult && !geminiVoiceTestResult.success
                        ? 'Error'
                        : isGeminiVoiceConfigured
                        ? 'Connected'
                        : 'Not configured'}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-teal-400/80 mb-1">
                    {geminiVoiceDetail?.model || 'gemini-3.8-flash-lite-tts'}
                  </div>
                  <div className="text-[10px] text-slate-400 leading-tight mb-3">
                    Google GenAI native neural speech synthesis (Aura / Aoede)
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
                    <span>{testingGeminiVoice ? 'Testing...' : 'Test Gemini Voice'}</span>
                  </button>

                  {geminiVoiceTestResult && (
                    <div
                      className={`text-[10px] font-medium flex items-center gap-1 ${
                        geminiVoiceTestResult.success ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {geminiVoiceTestResult.success ? (
                        <>
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Voice generated successfully ({geminiVoiceTestResult.latencyMs}ms)</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate" title={geminiVoiceTestResult.error}>
                            Error: {geminiVoiceTestResult.error}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ElevenLabs Card */}
              <div
                className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  voiceProvider === 'elevenlabs'
                    ? 'border-emerald-500 bg-emerald-950/25 ring-1 ring-emerald-500/30'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]'
                }`}
              >
                <div
                  className="cursor-pointer"
                  onClick={() => setVoiceProvider('elevenlabs')}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 text-white font-semibold text-xs">
                      <Mic className="w-3.5 h-3.5 text-indigo-400" />
                      <span>ElevenLabs</span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium ${
                        elevenLabsVoiceTestResult && !elevenLabsVoiceTestResult.success
                          ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                          : isElevenLabsConfigured
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          elevenLabsVoiceTestResult && !elevenLabsVoiceTestResult.success
                            ? 'bg-rose-400'
                            : isElevenLabsConfigured
                            ? 'bg-emerald-400'
                            : 'bg-amber-400'
                        }`}
                      />
                      {elevenLabsVoiceTestResult && !elevenLabsVoiceTestResult.success
                        ? 'Error'
                        : isElevenLabsConfigured
                        ? 'Connected'
                        : 'Not configured'}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-indigo-400/80 mb-1">
                    {elevenLabsDetail?.model || 'eleven_multilingual_v2'}
                  </div>
                  <div className="text-[10px] text-slate-400 leading-tight mb-3">
                    Emotive human-grade speech synthesis (Rachel / Multilingual)
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
                    <span>{testingElevenLabsVoice ? 'Testing...' : 'Test ElevenLabs Voice'}</span>
                  </button>

                  {elevenLabsVoiceTestResult && (
                    <div
                      className={`text-[10px] font-medium flex items-center gap-1 ${
                        elevenLabsVoiceTestResult.success ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {elevenLabsVoiceTestResult.success ? (
                        <>
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Voice generated successfully ({elevenLabsVoiceTestResult.latencyMs}ms)</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate" title={elevenLabsVoiceTestResult.error}>
                            Error: {elevenLabsVoiceTestResult.error}
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
          {/* SECTION 3: VOICE PERSONA / PROFILE PRESET                      */}
          {/* ============================================================== */}
          <div className="space-y-2 pt-3 border-t border-white/[0.06]">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Voice Persona
              </label>
              <span className="text-[9px] text-slate-500 font-mono">
                Mapped to {voiceProvider === 'elevenlabs' ? 'ElevenLabs' : 'Gemini'}
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
                    <p className="text-slate-200 truncate" title={voiceProvider === 'elevenlabs' ? (elevenLabsDetail?.model || 'eleven_multilingual_v2') : (geminiVoiceDetail?.model || 'gemini-3.8-flash-lite-tts')}>
                      Voice: {voiceProvider === 'elevenlabs' ? (elevenLabsDetail?.model || 'eleven_multilingual_v2') : (geminiVoiceDetail?.model || 'gemini-3.8-flash-lite-tts')}
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
                        : textTestResult?.latencyMs
                        ? `${textTestResult.latencyMs} ms (test)`
                        : '< 50 ms'}
                    </p>
                  </div>

                  {/* 8. Last Provider Error */}
                  <div className="bg-white/[0.03] p-2 rounded-lg border border-white/[0.04]">
                    <span className="text-slate-500 block mb-0.5">Last Provider Error</span>
                    {(() => {
                      const activeVoiceTestError =
                        voiceProvider === 'gemini'
                          ? geminiVoiceTestResult?.error
                          : elevenLabsVoiceTestResult?.error;
                      const displayError =
                        liveDebugStats?.lastError ||
                        textTestResult?.error ||
                        activeVoiceTestError ||
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
          {/* SECTION 5: THEMES & SYSTEM NOTIFICATIONS                       */}
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
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/[0.06] bg-[#0b0f19]">
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
  );
};
