import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, X, Sparkles, Volume2, Radio } from 'lucide-react';
import { LiveVoiceStatus } from '../../hooks/useLiveVoice';

interface LiveVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: LiveVoiceStatus;
  frequencies: number[];
  aiSpokenText: string;
  liveTranscript: string;
  isMuted: boolean;
  onToggleMute: () => void;
  onSubmitSpokenQuery: (query: string) => void;
}

const SAMPLE_VOICE_TOPICS = [
  "Give me a quick 30-second focus reset.",
  "Help me structure a product roadmap for next month.",
  "Tell me an intriguing first-principles scientific insight.",
  "Draft a creative analogy for quantum computing.",
];

export const LiveVoiceModal: React.FC<LiveVoiceModalProps> = ({
  isOpen,
  onClose,
  status,
  frequencies,
  aiSpokenText,
  liveTranscript,
  isMuted,
  onToggleMute,
  onSubmitSpokenQuery,
}) => {
  if (!isOpen) return null;

  const getStatusColor = () => {
    switch (status) {
      case 'speaking':
        return 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40';
      case 'thinking':
        return 'text-amber-400 border-amber-500/40 bg-amber-950/40';
      case 'muted':
        return 'text-rose-400 border-rose-500/40 bg-rose-950/40';
      case 'listening':
      default:
        return 'text-cyan-400 border-cyan-500/40 bg-cyan-950/40';
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'speaking':
        return 'JEXA is Speaking';
      case 'thinking':
        return 'Synthesizing Response...';
      case 'muted':
        return 'Microphone Muted';
      case 'listening':
      default:
        return 'Listening to you...';
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex flex-col bg-[#05070c]/98 backdrop-blur-xl text-slate-100 select-none overflow-hidden"
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-display font-bold text-base tracking-wider text-white">
              JEXA LIVE VOICE
            </span>
            <span className="text-xs text-slate-500">· Powered by JOHNEY TEC</span>
          </div>

          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Exit Live Mode"
            aria-label="Exit Live Voice Mode"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Center AI Visualization Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-xl mx-auto w-full text-center space-y-8">
          {/* Status Indicator */}
          <div
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold tracking-wide transition-all ${getStatusColor()}`}
          >
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>{getStatusLabel()}</span>
          </div>

          {/* Central Waveform Sphere & Dynamic Frequency Bars */}
          <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
            {/* Ambient Background Glow Rings */}
            <motion.div
              animate={{
                scale: status === 'speaking' ? [1, 1.15, 1] : status === 'listening' ? [1, 1.05, 1] : 1,
                opacity: status === 'speaking' ? 0.35 : 0.18,
              }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              className="absolute inset-0 rounded-full bg-emerald-500/20 blur-2xl pointer-events-none"
            />

            {/* Core Neural Concentric Rings */}
            <div className="absolute inset-4 rounded-full border border-slate-800/80 flex items-center justify-center">
              <div className="w-36 h-36 rounded-full border border-emerald-500/20 flex items-center justify-center bg-slate-950/70">
                <Sparkles className="w-8 h-8 text-emerald-400" />
              </div>
            </div>

            {/* Dynamic Symmetrical Frequency Waveform Spectrum */}
            <div className="relative z-10 flex items-center justify-center gap-1.5 h-28">
              {frequencies.map((height, i) => (
                <div
                  key={i}
                  className="w-1.5 rounded-full bg-gradient-to-t from-emerald-500 to-cyan-300 transition-all duration-75"
                  style={{
                    height: `${Math.max(8, height)}%`,
                    opacity: isMuted ? 0.2 : 0.85,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Spoken Dialogue Text Area */}
          <div className="min-h-[72px] flex flex-col items-center justify-center space-y-2">
            <p className="text-base sm:text-lg text-slate-200 font-medium leading-relaxed max-w-md">
              "{aiSpokenText}"
            </p>
            {liveTranscript && (
              <p className="text-xs text-slate-400">
                You: <span className="text-slate-300 italic">"{liveTranscript}"</span>
              </p>
            )}
          </div>

          {/* Sample Voice Prompts (Quick Spoken Triggers) */}
          <div className="w-full space-y-2 pt-2">
            <div className="text-[11px] font-medium text-slate-500 tracking-wider">
              SUGGESTED SPOKEN TOPICS
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {SAMPLE_VOICE_TOPICS.map((topic, idx) => (
                <button
                  key={idx}
                  onClick={() => onSubmitSpokenQuery(topic)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-300 hover:text-white hover:border-slate-700 hover:bg-slate-850 transition-all text-left truncate max-w-xs"
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Interactive Voice Controls */}
        <div className="p-6 border-t border-slate-800/80 bg-[#070a12] shrink-0 flex items-center justify-center gap-6">
          {/* Mute / Unmute Control */}
          <button
            onClick={onToggleMute}
            className={`min-h-[56px] min-w-[56px] flex items-center justify-center rounded-2xl border transition-all ${
              isMuted
                ? 'bg-rose-950/80 border-rose-500/60 text-rose-300'
                : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
            }`}
            title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            aria-label={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>

          {/* End Session Button */}
          <button
            onClick={onClose}
            className="h-14 px-6 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-semibold flex items-center gap-2 transition-all active:scale-95"
          >
            <X className="w-4 h-4" />
            <span>End Voice Mode</span>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
