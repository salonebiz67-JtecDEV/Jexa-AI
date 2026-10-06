import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  Square,
  Upload,
  Play,
  Pause,
  Trash2,
  RotateCcw,
  Check,
  Shield,
  AlertCircle,
  X,
  Volume2,
  FileAudio,
  Cpu,
  Info,
  ArrowRight,
} from 'lucide-react';
import { ApiClient } from '../../services/api.client';
import { VoiceSampleStorage, StoredVoiceSample } from '../../services/voice-sample.storage';
import { PersonalVoiceReferenceMetadata, PersonalVoiceStatusResponse } from '../../../shared/types';

interface PersonalVoiceSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSampleSaved?: (metadata: PersonalVoiceReferenceMetadata) => void;
  onSampleDeleted?: () => void;
  initialTab?: SetupTab;
  initialMode?: 'record' | 'upload';
}

type SetupTab = 'sample' | 'engine';

export const PersonalVoiceSetupModal: React.FC<PersonalVoiceSetupModalProps> = ({
  isOpen,
  onClose,
  onSampleSaved,
  onSampleDeleted,
  initialTab = 'sample',
  initialMode = 'record',
}) => {
  const [activeTab, setActiveTab] = useState<SetupTab>(initialTab);
  const [inputMode, setInputMode] = useState<'record' | 'upload'>(initialMode);

  // Existing sample state
  const [existingSample, setExistingSample] = useState<StoredVoiceSample | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);

  // Engine status from backend
  const [engineStatus, setEngineStatus] = useState<PersonalVoiceStatusResponse | null>(null);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [audioVolumeLevel, setAudioVolumeLevel] = useState<number>(0);

  // Upload State
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Operation statuses
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Refs for audio handling
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const previewAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Suggested calibration prompt
  const sampleScript =
    'Hello, this is my personal voice recording for JEXA. I am training my personal voice model with clean, natural speech so that my companion sounds uniquely like me.';

  // Load existing sample and backend status
  const loadStatus = useCallback(async () => {
    setLoadingExisting(true);
    try {
      const [localSample, backendStatus] = await Promise.all([
        VoiceSampleStorage.getSample(),
        ApiClient.getPersonalVoiceStatus().catch(() => null),
      ]);
      setExistingSample(localSample);
      if (backendStatus) {
        setEngineStatus(backendStatus);
      }
    } catch (e) {
      console.warn('[PersonalVoiceSetup] Error loading initial status:', e);
    } finally {
      setLoadingExisting(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (initialTab) setActiveTab(initialTab);
      if (initialMode) setInputMode(initialMode);
      loadStatus();
      setStatusMessage(null);
    } else {
      cleanupRecording();
      stopPreviewPlayback();
    }
  }, [isOpen, loadStatus, initialTab, initialMode]);

  const cleanupRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsRecording(false);
    setAudioVolumeLevel(0);
  };

  const stopPreviewPlayback = () => {
    if (previewAudioElementRef.current) {
      previewAudioElementRef.current.pause();
      previewAudioElementRef.current.currentTime = 0;
      setIsPlayingPreview(false);
    }
  };

  // Start microphone recording with explicit user permission
  const startRecording = async () => {
    cleanupRecording();
    stopPreviewPlayback();
    setMicPermissionDenied(false);
    setStatusMessage(null);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Audio volume visualizer
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyserRef.current = analyser;

        const pcmData = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(pcmData);
          let sum = 0;
          for (let i = 0; i < pcmData.length; i++) {
            sum += pcmData[i];
          }
          const avg = sum / pcmData.length;
          setAudioVolumeLevel(Math.min(1, avg / 128));
          animFrameRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      } catch {}

      // Pick supported mimeType
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewAudioUrl(url);
        setIsRecording(false);
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('[PersonalVoiceSetup] Microphone permission error:', err);
      setMicPermissionDenied(true);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setAudioVolumeLevel(0);
  };

  const handleTogglePreviewPlay = (audioSrc: string) => {
    if (isPlayingPreview) {
      stopPreviewPlayback();
    } else {
      const audio = new Audio(audioSrc);
      previewAudioElementRef.current = audio;
      audio.onplay = () => setIsPlayingPreview(true);
      audio.onended = () => setIsPlayingPreview(false);
      audio.onerror = () => setIsPlayingPreview(false);
      audio.play().catch(() => setIsPlayingPreview(false));
    }
  };

  const handleDeleteDraft = () => {
    stopPreviewPlayback();
    if (previewAudioUrl && previewAudioUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(previewAudioUrl);
      } catch {}
    }
    setRecordedBlob(null);
    setPreviewAudioUrl(null);
    setUploadedFile(null);
    setRecordingSeconds(0);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    handleDeleteDraft();
    setUploadedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewAudioUrl(url);
  };

  // Convert Blob or File to Base64 data string
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Save voice sample to local storage and sync reference metadata to backend
  const handleSaveVoiceSample = async () => {
    const targetBlob = recordedBlob || uploadedFile;
    if (!targetBlob) return;

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const name = uploadedFile?.name || `My Voice Sample (${new Date().toLocaleDateString()})`;
      const format = targetBlob.type || 'audio/webm';
      const duration = recordingSeconds > 0 ? recordingSeconds : 10;

      // 1. Convert to base64 for backend reference metadata sync
      const base64Data = await blobToBase64(targetBlob);

      // 2. Call backend POST /api/voice/personal/reference
      const syncRes = await ApiClient.savePersonalVoiceReference({
        name,
        format,
        durationSeconds: duration,
        audioData: base64Data,
      });

      const metadata: PersonalVoiceReferenceMetadata = syncRes.data || {
        id: `ref-${Date.now()}`,
        name,
        format,
        durationSeconds: duration,
        recordedAt: new Date().toISOString(),
        sizeBytes: targetBlob.size,
      };

      // 3. Save locally in IndexedDB / safeStorage
      await VoiceSampleStorage.saveSample(targetBlob, metadata);

      // 4. Update state
      const url = URL.createObjectURL(targetBlob);
      setExistingSample({
        blob: targetBlob,
        metadata,
        audioUrl: url,
      });

      handleDeleteDraft();
      setStatusMessage({
        text: 'Voice sample saved successfully as your personal voice reference.',
        type: 'success',
      });

      if (onSampleSaved) {
        onSampleSaved(metadata);
      }

      await loadStatus();
    } catch (err: any) {
      console.error('[PersonalVoiceSetup] Save sample failed:', err);
      setStatusMessage({
        text: err.message || 'Failed to save voice reference sample.',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete existing reference sample
  const handleDeleteExistingSample = async () => {
    stopPreviewPlayback();
    setIsSaving(true);
    try {
      await VoiceSampleStorage.deleteSample();
      await ApiClient.deletePersonalVoiceReference().catch(() => {});
      setExistingSample(null);
      setStatusMessage({
        text: 'Personal voice reference sample deleted.',
        type: 'info',
      });
      if (onSampleDeleted) {
        onSampleDeleted();
      }
      await loadStatus();
    } catch (e: any) {
      console.warn('[PersonalVoiceSetup] Delete failed:', e);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md pt-safe pb-safe animate-fadeIn">
      <div className="relative w-full max-w-xl bg-[#0d121f] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.06] bg-[#090d16]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-sm text-white flex items-center gap-2">
                <span>JEXA Personal Voice</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.05] text-slate-400 border border-white/[0.06]">
                  Foundation
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Record your own voice to use as the AI speech reference
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-white/[0.06] bg-[#070a12] px-4 pt-2 gap-2">
          <button
            onClick={() => setActiveTab('sample')}
            className={`pb-2 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'sample'
                ? 'border-teal-400 text-teal-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Voice Sample</span>
          </button>
          <button
            onClick={() => setActiveTab('engine')}
            className={`pb-2 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'engine'
                ? 'border-teal-400 text-teal-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Engine Architecture</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-slate-300">
          {/* Status Message Banner */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 animate-fadeIn ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                  : statusMessage.type === 'error'
                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                  : 'bg-teal-500/10 text-teal-300 border-teal-500/20'
              }`}
            >
              <span>{statusMessage.text}</span>
              <button
                onClick={() => setStatusMessage(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {activeTab === 'sample' ? (
            <>
              {/* Security & Ownership Guarantee */}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-2.5">
                <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <span className="font-semibold text-white block mb-0.5">
                    Your Voice Reference Only
                  </span>
                  This recording is strictly your personal voice reference. JEXA will never clone or process voices without explicit permission. No audio is sent to third-party services.
                </div>
              </div>

              {/* Explanatory Prompt */}
              <p className="text-xs text-slate-300 leading-normal">
                Record or upload a clean sample of your own voice. This recording will be used as the reference for your personal AI voice.
              </p>

              {/* Existing Reference Card if already configured */}
              {existingSample && !previewAudioUrl && !isRecording && (
                <div className="p-3.5 rounded-xl bg-teal-950/20 border border-teal-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileAudio className="w-4 h-4 text-teal-400" />
                      <span className="text-xs font-semibold text-white">
                        {existingSample.metadata.name}
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/30 font-medium">
                      Active Reference
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-400 flex items-center gap-3">
                    <span>
                      Duration: {existingSample.metadata.durationSeconds ? `${existingSample.metadata.durationSeconds}s` : 'Reference clip'}
                    </span>
                    <span>•</span>
                    <span>
                      Recorded: {new Date(existingSample.metadata.recordedAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="pt-2 flex items-center gap-2 border-t border-white/[0.06]">
                    <button
                      onClick={() => handleTogglePreviewPlay(existingSample.audioUrl)}
                      className="px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 border border-teal-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {isPlayingPreview ? (
                        <>
                          <Pause className="w-3.5 h-3.5" />
                          <span>Pause</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          <span>Listen to Reference</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleDeleteExistingSample}
                      disabled={isSaving}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Mode Toggle (Record vs Upload) */}
              <div className="flex rounded-xl bg-white/[0.03] p-1 border border-white/[0.06]">
                <button
                  onClick={() => {
                    handleDeleteDraft();
                    setInputMode('record');
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    inputMode === 'record'
                      ? 'bg-white/[0.08] text-white shadow-sm font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Mic className="w-3.5 h-3.5 text-teal-400" />
                  <span>Record Voice</span>
                </button>
                <button
                  onClick={() => {
                    handleDeleteDraft();
                    setInputMode('upload');
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    inputMode === 'upload'
                      ? 'bg-white/[0.08] text-white shadow-sm font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Upload Voice Sample</span>
                </button>
              </div>

              {/* Permission Warning */}
              {micPermissionDenied && inputMode === 'record' && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    Microphone access was denied. Please allow microphone permissions in your browser address bar to record directly.
                  </div>
                </div>
              )}

              {/* RECORDING INTERFACE */}
              {inputMode === 'record' && (
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                  {/* Script Guide */}
                  <div className="bg-black/30 p-3 rounded-lg border border-white/[0.04]">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block mb-1">
                      Suggested Reading Script
                    </span>
                    <p className="text-xs text-slate-200 italic font-serif leading-relaxed">
                      "{sampleScript}"
                    </p>
                  </div>

                  {/* Recording Status & Waveform */}
                  {isRecording ? (
                    <div className="py-4 flex flex-col items-center justify-center space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                        <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
                          Recording... ({recordingSeconds}s)
                        </span>
                      </div>

                      {/* Visual Audio Level Bar */}
                      <div className="w-full max-w-xs h-3 bg-white/[0.05] rounded-full overflow-hidden p-0.5 border border-white/[0.08]">
                        <div
                          className="h-full bg-gradient-to-r from-teal-500 to-rose-500 rounded-full transition-all duration-75"
                          style={{ width: `${Math.max(8, audioVolumeLevel * 100)}%` }}
                        />
                      </div>

                      <button
                        onClick={stopRecording}
                        className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-rose-500/20 transition-all cursor-pointer"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>Stop Recording</span>
                      </button>
                    </div>
                  ) : !previewAudioUrl ? (
                    <div className="py-3 flex flex-col items-center justify-center space-y-2">
                      <button
                        onClick={startRecording}
                        className="px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-lg shadow-teal-500/20 transition-all cursor-pointer"
                      >
                        <Mic className="w-4 h-4" />
                        <span>Start Recording</span>
                      </button>
                      <span className="text-[10px] text-slate-500">
                        Browser microphone permission requested upon click
                      </span>
                    </div>
                  ) : null}

                  {/* Preview / Edit / Save Actions */}
                  {previewAudioUrl && !isRecording && (
                    <div className="pt-2 border-t border-white/[0.06] space-y-3 animate-fadeIn">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-teal-300">
                          Recorded Sample ({recordingSeconds}s)
                        </span>
                        <span className="text-[10px] text-slate-400">Ready to save</span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => handleTogglePreviewPlay(previewAudioUrl)}
                          className="px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 border border-teal-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          {isPlayingPreview ? (
                            <>
                              <Pause className="w-3.5 h-3.5" />
                              <span>Pause</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5" />
                              <span>Preview</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={startRecording}
                          className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 border border-white/[0.08] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Record Again</span>
                        </button>

                        <button
                          onClick={handleDeleteDraft}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>

                        <button
                          onClick={handleSaveVoiceSample}
                          disabled={isSaving}
                          className="ml-auto px-4 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isSaving ? 'Saving...' : 'Save Voice Sample'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* UPLOAD INTERFACE */}
              {inputMode === 'upload' && (
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/wav,audio/mp3,audio/mpeg,audio/m4a,audio/webm,audio/ogg"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  {!uploadedFile ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-white/[0.12] hover:border-teal-500/40 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-black/20"
                    >
                      <Upload className="w-6 h-6 text-indigo-400 mb-2" />
                      <span className="text-xs font-semibold text-white">
                        Click to select audio file
                      </span>
                      <span className="text-[10px] text-slate-500 mt-1">
                        Supported: WAV, MP3, M4A, WEBM (Clean spoken voice, 10–60s)
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                        <div className="flex items-center gap-2 truncate">
                          <FileAudio className="w-4 h-4 text-indigo-400 shrink-0" />
                          <span className="truncate text-white font-medium">
                            {uploadedFile.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {Math.round(uploadedFile.size / 1024)} KB
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {previewAudioUrl && (
                          <button
                            onClick={() => handleTogglePreviewPlay(previewAudioUrl)}
                            className="px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 border border-teal-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            {isPlayingPreview ? (
                              <>
                                <Pause className="w-3.5 h-3.5" />
                                <span>Pause</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5" />
                                <span>Preview</span>
                              </>
                            )}
                          </button>
                        )}

                        <button
                          onClick={handleDeleteDraft}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Discard</span>
                        </button>

                        <button
                          onClick={handleSaveVoiceSample}
                          disabled={isSaving}
                          className="ml-auto px-4 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isSaving ? 'Saving...' : 'Save Voice Sample'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* TAB 2: ENGINE ARCHITECTURE & CONFIGURATION GUIDE */
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-500/20 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <span className="font-semibold text-white block mb-0.5">
                    Configurable Engine Adapter
                  </span>
                  JEXA does not hardcode a single speech synthesis model. You can configure any underlying engine (XTTS v2, Piper, or Custom REST microservice) via server-side environment variables.
                </div>
              </div>

              {/* Current Status Overview */}
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">
                  Current Backend Architecture
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-black/20 p-2 rounded-lg border border-white/[0.04]">
                    <span className="text-[10px] text-slate-500 block">PERSONAL_VOICE_ENGINE</span>
                    <span className="font-mono font-semibold text-slate-300">
                      {engineStatus?.engine || 'none'}
                    </span>
                  </div>
                  <div className="bg-black/20 p-2 rounded-lg border border-white/[0.04]">
                    <span className="text-[10px] text-slate-500 block">PERSONAL_VOICE_MODEL</span>
                    <span className="font-mono font-semibold text-slate-300 truncate">
                      {engineStatus?.model || 'not set'}
                    </span>
                  </div>
                  <div className="bg-black/20 p-2 rounded-lg border border-white/[0.04]">
                    <span className="text-[10px] text-slate-500 block">Reference Audio Status</span>
                    <span className="font-semibold text-teal-300">
                      {existingSample || engineStatus?.referenceVoice ? 'Sample Recorded' : 'Not Uploaded'}
                    </span>
                  </div>
                  <div className="bg-black/20 p-2 rounded-lg border border-white/[0.04]">
                    <span className="text-[10px] text-slate-500 block">Engine State</span>
                    <span className="font-semibold text-slate-400">
                      {engineStatus?.configured ? 'Configured' : 'Not Configured'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Server Setup Instructions */}
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">
                  How to Connect an Engine
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  When you deploy a local or cloud voice engine (e.g. Coqui XTTS v2 or Piper), add these server-side variables to your Render dashboard or `.env`:
                </p>
                <div className="bg-black/40 p-2.5 rounded-lg border border-white/[0.06] font-mono text-[11px] text-slate-300 space-y-1">
                  <div>PERSONAL_VOICE_ENGINE=xtts</div>
                  <div>PERSONAL_VOICE_MODEL=tts_models/multilingual/multi-dataset/xtts_v2</div>
                  <div>PERSONAL_VOICE_API_URL=https://your-voice-engine.internal</div>
                  <div>PERSONAL_VOICE_API_KEY=your_optional_secret</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/[0.06] bg-[#090d16] flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            {existingSample ? '1 reference sample stored' : 'No reference sample stored yet'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
