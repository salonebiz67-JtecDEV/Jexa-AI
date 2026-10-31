import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Globe,
  BookOpen,
  Cpu,
  Layers,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Compass,
  Brain,
  BookmarkCheck,
  Server,
  Database,
  ClipboardList,
  FileCode,
  Search,
} from 'lucide-react';
import { AIActivityStatus } from '../../../shared/types';

export interface TypingIndicatorProps {
  status?: AIActivityStatus | null;
  details?: {
    query?: string;
    sourcesCount?: number;
    error?: string;
    memoryFact?: string;
    memoryAction?: string;
    provider?: string;
    model?: string;
    fallbackUsed?: boolean;
  } | null;
  onRetry?: () => void;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  status = 'Thinking...',
  details,
  onRetry,
}) => {
  const currentStatus = status || 'Thinking...';

  // Determine icon, accent color, and animations based on actual operation
  const getStatusConfig = () => {
    if (currentStatus.startsWith('Memory saved')) {
      return {
        icon: CheckCircle2,
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/20',
        border: 'border-emerald-500/40',
        dotColor: 'bg-emerald-400',
        glow: 'shadow-[0_0_14px_rgba(16,185,129,0.35)]',
      };
    }

    if (currentStatus.startsWith('Memory updated')) {
      return {
        icon: CheckCircle2,
        color: 'text-teal-400',
        bg: 'bg-teal-500/20',
        border: 'border-teal-500/40',
        dotColor: 'bg-teal-400',
        glow: 'shadow-[0_0_14px_rgba(20,184,166,0.35)]',
      };
    }

    if (currentStatus === 'This is taking too long') {
      return {
        icon: AlertTriangle,
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        dotColor: 'bg-amber-400',
        glow: 'shadow-[0_0_12px_rgba(245,158,11,0.25)]',
        spinIcon: false,
        pulseIcon: false,
      };
    }

    if (
      currentStatus === 'Tool failed' ||
      currentStatus === 'Memory unavailable' ||
      currentStatus === 'Memory storage unavailable' ||
      currentStatus === 'Memory retrieval failed' ||
      currentStatus.startsWith('Memory save failed')
    ) {
      return {
        icon: AlertTriangle,
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        dotColor: 'bg-amber-400',
        glow: 'shadow-[0_0_12px_rgba(245,158,11,0.25)]',
      };
    }

    switch (currentStatus) {
      case 'Checking servers…':
      case 'Checking servers...':
        return {
          icon: Server,
          color: 'text-cyan-400',
          bg: 'bg-cyan-500/10',
          border: 'border-cyan-500/30',
          dotColor: 'bg-cyan-400',
          glow: 'shadow-[0_0_12px_rgba(6,182,212,0.25)]',
          pulseIcon: true,
        };
      case 'Checking Supabase…':
      case 'Checking Supabase...':
        return {
          icon: Database,
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          dotColor: 'bg-emerald-400',
          glow: 'shadow-[0_0_12px_rgba(16,185,129,0.25)]',
          pulseIcon: true,
        };
      case 'Reading error logs…':
      case 'Reading error logs...':
        return {
          icon: ClipboardList,
          color: 'text-amber-400',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          dotColor: 'bg-amber-400',
          glow: 'shadow-[0_0_12px_rgba(245,158,11,0.25)]',
          pulseIcon: true,
        };
      case 'Reading source code…':
      case 'Reading source code...':
        return {
          icon: FileCode,
          color: 'text-violet-400',
          bg: 'bg-violet-500/10',
          border: 'border-violet-500/30',
          dotColor: 'bg-violet-400',
          glow: 'shadow-[0_0_12px_rgba(139,92,246,0.25)]',
          pulseIcon: true,
        };
      case 'Searching code…':
      case 'Searching code...':
        return {
          icon: Search,
          color: 'text-sky-400',
          bg: 'bg-sky-500/10',
          border: 'border-sky-500/30',
          dotColor: 'bg-sky-400',
          glow: 'shadow-[0_0_12px_rgba(14,165,233,0.25)]',
          spinIcon: true,
        };
      case 'Writing the answer…':
      case 'Writing the answer...':
        return {
          icon: Zap,
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          dotColor: 'bg-emerald-400',
          glow: 'shadow-[0_0_14px_rgba(16,185,129,0.3)]',
          pulseIcon: true,
        };
      case 'Retrying…':
      case 'Retrying...':
        return {
          icon: RotateCcw,
          color: 'text-amber-400',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          dotColor: 'bg-amber-400',
          glow: 'shadow-[0_0_12px_rgba(245,158,11,0.25)]',
          spinIcon: true,
        };
      case 'Selecting tool...':
        return {
          icon: Compass,
          color: 'text-indigo-400',
          bg: 'bg-indigo-500/10',
          border: 'border-indigo-500/30',
          dotColor: 'bg-indigo-400',
          glow: 'shadow-[0_0_12px_rgba(99,102,241,0.25)]',
          pulseIcon: true,
        };
      case 'Using web research...':
        return {
          icon: Globe,
          color: 'text-cyan-400',
          bg: 'bg-cyan-500/10',
          border: 'border-cyan-500/30',
          dotColor: 'bg-cyan-400',
          glow: 'shadow-[0_0_12px_rgba(6,182,212,0.25)]',
          spinIcon: true,
        };
      case 'Verifying results...':
        return {
          icon: Layers,
          color: 'text-teal-400',
          bg: 'bg-teal-500/10',
          border: 'border-teal-500/30',
          dotColor: 'bg-teal-400',
          glow: 'shadow-[0_0_12px_rgba(45,212,191,0.25)]',
          pulseIcon: true,
        };
      case 'Searching the web...':
        return {
          icon: Globe,
          color: 'text-cyan-400',
          bg: 'bg-cyan-500/10',
          border: 'border-cyan-500/30',
          dotColor: 'bg-cyan-400',
          glow: 'shadow-[0_0_12px_rgba(6,182,212,0.25)]',
          spinIcon: true,
        };
      case 'Reading sources...':
      case 'Reading web pages...':
        return {
          icon: BookOpen,
          color: 'text-sky-400',
          bg: 'bg-sky-500/10',
          border: 'border-sky-500/30',
          dotColor: 'bg-sky-400',
          glow: 'shadow-[0_0_12px_rgba(56,189,248,0.25)]',
          pulseIcon: true,
        };
      case 'Analyzing sources...':
        return {
          icon: Cpu,
          color: 'text-teal-400',
          bg: 'bg-teal-500/10',
          border: 'border-teal-500/30',
          dotColor: 'bg-teal-400',
          glow: 'shadow-[0_0_12px_rgba(45,212,191,0.25)]',
          pulseIcon: true,
        };
      case 'Checking relevant memories...':
      case 'Checking memories...':
      case 'Identifying useful memory…':
      case 'Identifying useful memory...':
        return {
          icon: Brain,
          color: 'text-purple-400',
          bg: 'bg-purple-500/10',
          border: 'border-purple-500/30',
          dotColor: 'bg-purple-400',
          glow: 'shadow-[0_0_12px_rgba(168,85,247,0.25)]',
          pulseIcon: true,
        };
      case 'Saving memory...':
      case 'Saving memory…':
        return {
          icon: Sparkles,
          color: 'text-cyan-400',
          bg: 'bg-cyan-500/10',
          border: 'border-cyan-500/30',
          dotColor: 'bg-cyan-400',
          glow: 'shadow-[0_0_12px_rgba(6,182,212,0.25)]',
          spinIcon: true,
        };
      case 'Planning...':
        return {
          icon: Compass,
          color: 'text-indigo-400',
          bg: 'bg-indigo-500/10',
          border: 'border-indigo-500/30',
          dotColor: 'bg-indigo-400',
          glow: 'shadow-[0_0_12px_rgba(99,102,241,0.25)]',
        };
      case 'Processing information...':
        return {
          icon: Layers,
          color: 'text-blue-400',
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/30',
          dotColor: 'bg-blue-400',
          glow: 'shadow-[0_0_12px_rgba(59,130,246,0.25)]',
        };
      case 'Preparing answer...':
        return {
          icon: Zap,
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          dotColor: 'bg-emerald-400',
          glow: 'shadow-[0_0_15px_rgba(16,185,129,0.3)]',
          pulseIcon: true,
        };
      case 'Answer complete':
        return {
          icon: CheckCircle2,
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/20',
          border: 'border-emerald-500/40',
          dotColor: 'bg-emerald-400',
          glow: 'shadow-[0_0_15px_rgba(16,185,129,0.35)]',
        };
      case 'Search failed — retry available':
        return {
          icon: AlertTriangle,
          color: 'text-amber-400',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          dotColor: 'bg-amber-400',
          glow: 'shadow-[0_0_12px_rgba(245,158,11,0.25)]',
        };
      case 'Thinking...':
      default:
        return {
          icon: Sparkles,
          color: 'text-emerald-400',
          bg: 'bg-slate-900',
          border: 'border-emerald-500/30',
          dotColor: 'bg-emerald-400',
          glow: 'shadow-sm',
          spinIcon: true,
        };
    }
  };

  const config = getStatusConfig();
  const IconComponent = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.2 }}
      className="flex gap-3 px-4 py-2 select-none"
    >
      {/* Futuristic Avatar Beacon with Radial Pulse */}
      <div className="relative shrink-0">
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          className={`w-8 h-8 rounded-full ${config.bg} border ${config.border} flex items-center justify-center ${config.color} ${config.glow}`}
        >
          <IconComponent
            className={`w-4 h-4 ${
              config.spinIcon ? 'animate-spin-slow' : config.pulseIcon ? 'animate-pulse' : ''
            }`}
          />
        </motion.div>

        {/* Ambient Ring Wave */}
        <span
          className={`absolute -inset-0.5 rounded-full ${config.dotColor} opacity-20 blur-[2px] animate-ping`}
          style={{ animationDuration: '3s' }}
        />
      </div>

      {/* Main Dynamic Status Card */}
      <div className="bg-[#0b0f19]/95 backdrop-blur-md border border-white/[0.08] px-4 py-2.5 rounded-2xl rounded-tl-sm shadow-xl flex flex-col justify-center min-w-[200px] max-w-sm sm:max-w-md relative overflow-hidden group">
        {/* Subtle Cyber Scanner Line */}
        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent animate-shimmer" />

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Animated Micro Dots */}
            {currentStatus !== 'Answer complete' && currentStatus !== 'This is taking too long' && (
              <div className="flex items-center gap-1">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${config.dotColor} animate-bounce`}
                  style={{ animationDelay: '0ms' }}
                />
                <div
                  className={`w-1.5 h-1.5 rounded-full ${config.dotColor} animate-bounce`}
                  style={{ animationDelay: '150ms' }}
                />
                <div
                  className={`w-1.5 h-1.5 rounded-full ${config.dotColor} animate-bounce`}
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            )}

            {/* Live Status Label */}
            <AnimatePresence mode="wait">
              <motion.span
                key={currentStatus}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 4 }}
                transition={{ duration: 0.18 }}
                className="text-xs font-medium text-slate-200 tracking-wide flex items-center gap-1.5"
              >
                <span>{currentStatus}</span>
                {details?.sourcesCount && details.sourcesCount > 0 ? (
                  <span className="text-[10px] text-cyan-400/90 font-mono px-1.5 py-0.2 rounded bg-cyan-500/10 border border-cyan-500/20">
                    {details.sourcesCount} sources
                  </span>
                ) : null}
              </motion.span>
            </AnimatePresence>

            {/* Active Provider & Model Pill */}
            {details?.provider && (
              <span className="text-[10px] text-cyan-300 font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 flex items-center gap-1">
                <span className="capitalize">{details.provider}</span>
                {details.model && <span className="text-slate-400">({details.model})</span>}
                {details.fallbackUsed && (
                  <span className="text-amber-400 font-sans text-[9px] font-semibold bg-amber-500/20 px-1 rounded border border-amber-500/30">
                    Fallback
                  </span>
                )}
              </span>
            )}
          </div>

          {/* Retry Action if Search Failed or Request Stalled */}
          {(currentStatus === 'Search failed — retry available' || currentStatus === 'This is taking too long') && onRetry && (
            <button
              onClick={onRetry}
              className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 flex items-center gap-1 cursor-pointer transition-colors shrink-0"
              title="Retry"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          )}
        </div>

        {/* Detailed Search Query Chip if searching */}
        {details?.query && (currentStatus === 'Searching the web...' || currentStatus === 'Reading web pages...' || currentStatus === 'Analyzing sources...') && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-1.5 pt-1.5 border-t border-white/[0.05] flex items-center gap-1.5 text-[11px] font-mono text-cyan-300/80 truncate"
          >
            <span className="text-slate-500 uppercase text-[9px] tracking-wider shrink-0 font-sans">Query:</span>
            <span className="truncate max-w-[260px] sm:max-w-xs text-cyan-300">"{details.query}"</span>
          </motion.div>
        )}

        {/* Detailed Memory Fact Chip */}
        {details?.memoryFact && (currentStatus === 'Saving memory...' || currentStatus === 'Memory saved' || currentStatus === 'Memory updated') && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-1.5 pt-1.5 border-t border-white/[0.05] flex items-center gap-1.5 text-[11px] font-mono text-emerald-300/90 truncate"
          >
            <span className="text-slate-500 uppercase text-[9px] tracking-wider shrink-0 font-sans">Memory:</span>
            <span className="truncate max-w-[260px] sm:max-w-xs text-emerald-300">"{details.memoryFact}"</span>
          </motion.div>
        )}

        {/* Error Notice Chip showing error details, provider, and model */}
        {details?.error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-1.5 pt-1.5 border-t border-white/[0.05] flex flex-col gap-1 text-[11px] font-mono text-amber-300/90"
          >
            <div className="flex items-start gap-1.5">
              <span className="text-amber-500 uppercase text-[9px] tracking-wider shrink-0 font-sans mt-0.5">Notice:</span>
              <span className="text-amber-200 break-words">{details.error}</span>
            </div>
            {details.provider && (
              <div className="text-[10px] text-slate-400 font-sans flex items-center gap-2">
                <span>Provider: <strong className="text-slate-200 capitalize">{details.provider}</strong></span>
                {details.model && <span>• Model: <strong className="text-slate-200">{details.model}</strong></span>}
                {details.fallbackUsed && <span className="text-amber-400 font-semibold">• Fallback used</span>}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};
