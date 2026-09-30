import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, X, AlertCircle, RefreshCw } from 'lucide-react';
import { LiveVoiceStatus } from '../../hooks/useLiveVoice';
import { VoiceOrbCanvas } from './VoiceOrbCanvas';

interface LiveVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: LiveVoiceStatus;
  volume: number;
  frequencyData: Uint8Array | null;
  aiSpeakingPower?: number;
  liveTranscript: string;
  lastAiResponse: string;
  errorMessage: string | null;
  isMuted: boolean;
  onToggleMute: () => void;
  onInterrupt?: () => void;
  onRetry?: () => void;
}

export const LiveVoiceModal: React.FC<LiveVoiceModalProps> = ({
  isOpen,
  onClose,
  status,
  volume,
  frequencyData,
  aiSpeakingPower = 0,
  liveTranscript,
  lastAiResponse,
  errorMessage,
  isMuted,
  onToggleMute,
  onInterrupt,
  onRetry,
}) => {
  if (!isOpen) return null;

  const getStatusText = () => {
    switch (status) {
      case 'connecting':
        return 'Connecting audio...';
      case 'processing':
        return 'Processing...';
      case 'speaking':
        return 'JEXA is speaking';
      case 'muted':
        return 'Microphone muted';
      case 'error':
        return errorMessage || 'Voice connection issue';
      case 'listening':
      default:
        return 'Listening...';
    }
  };

  const getStatusBadgeStyle = () => {
    switch (status) {
      case 'speaking':
        return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
      case 'processing':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
      case 'muted':
        return 'bg-slate-800 text-slate-400 border-slate-700';
      case 'error':
        return 'bg-rose-500/10 text-rose-300 border-rose-500/20';
      case 'connecting':
        return 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20';
      case 'listening':
      default:
        return 'bg-white/[0.04] text-slate-300 border-white/[0.08]';
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-0 z-50 flex flex-col bg-[#05070c] text-slate-100 select-none overflow-hidden touch-none"
      >
        {/* Subtle Ambient Background Gradient */}
        <div className="absolute inset-0 bg-radial from-emerald-950/15 via-transparent to-transparent pointer-events-none" />

        {/* Minimal Header */}
        <header className="relative z-10 flex items-center justify-between px-5 py-4 border-b border-white/[0.04] shrink-0">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full transition-colors ${
                status === 'error'
                  ? 'bg-rose-500'
                  : status === 'speaking'
                  ? 'bg-emerald-400 animate-pulse'
                  : status === 'processing'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-emerald-500'
              }`}
            />
            <span className="font-semibold text-xs tracking-wider text-slate-300 uppercase">
              JEXA LIVE
            </span>
          </div>

          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="Exit Live mode"
            title="Exit Live mode"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Central Voice Visualization Space */}
        <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-6 max-w-lg mx-auto w-full text-center">
          {/* Audio-Reactive Voice Orb */}
          <div className="my-auto flex flex-col items-center justify-center">
            <VoiceOrbCanvas
              status={status}
              volume={volume}
              frequencyData={frequencyData}
              aiSpeakingPower={aiSpeakingPower}
              size={280}
            />

            {/* Dynamic Status Indicator */}
            <div className="mt-6 flex flex-col items-center gap-2">
              <div
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-medium transition-all ${getStatusBadgeStyle()}`}
              >
                {status === 'error' ? (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                ) : status === 'processing' ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                ) : status === 'speaking' ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
                <span>{getStatusText()}</span>
              </div>

              {/* Interruption Hint if speaking */}
              {status === 'speaking' && (
                <button
                  onClick={onInterrupt}
                  className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors underline underline-offset-2 decoration-slate-600"
                >
                  Tap or speak to interrupt
                </button>
              )}

              {/* Error Retry Option */}
              {status === 'error' && onRetry && (
                <button
                  onClick={onRetry}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-xs text-white transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Try Again</span>
                </button>
              )}
            </div>

            {/* Real Transcribed Audio or AI Response (Only displayed when actual text exists) */}
            <div className="min-h-[52px] max-h-32 mt-5 overflow-y-auto px-4 text-center">
              {liveTranscript ? (
                <p className="text-xs text-slate-300 italic transition-opacity">
                  "{liveTranscript}"
                </p>
              ) : status === 'speaking' && lastAiResponse ? (
                <p className="text-xs sm:text-sm text-slate-200 line-clamp-3 leading-relaxed">
                  "{lastAiResponse}"
                </p>
              ) : null}
            </div>
          </div>
        </main>

        {/* Minimal Bottom Action Bar */}
        <footer className="relative z-10 border-t border-white/[0.06] bg-[#07090e]/95 backdrop-blur-md px-6 py-4 shrink-0">
          <div className="max-w-md mx-auto flex items-center justify-around gap-6">
            {/* Mute Button */}
            <button
              onClick={onToggleMute}
              className={`flex flex-col items-center gap-1.5 min-h-[48px] min-w-[56px] text-xs font-medium transition-colors ${
                isMuted
                  ? 'text-rose-400 hover:text-rose-300'
                  : 'text-slate-400 hover:text-white'
              }`}
              aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                  isMuted
                    ? 'bg-rose-500/15 border border-rose-500/30'
                    : 'bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08]'
                }`}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </div>
              <span className="text-[11px]">{isMuted ? 'Unmute' : 'Mute'}</span>
            </button>

            {/* End Live Button */}
            <button
              onClick={onClose}
              className="flex flex-col items-center gap-1.5 min-h-[48px] min-w-[56px] text-xs font-medium text-slate-400 hover:text-white transition-colors"
              aria-label="End Live session"
            >
              <div className="w-11 h-11 rounded-full bg-rose-600/90 hover:bg-rose-500 flex items-center justify-center text-white shadow-lg transition-transform active:scale-95">
                <X className="w-5 h-5" />
              </div>
              <span className="text-[11px]">End Live</span>
            </button>
          </div>
        </footer>
      </motion.div>
    </AnimatePresence>
  );
};
