import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { WebSearchResultItem } from '../../../shared/types/chat';

interface MessageSourcesProps {
  sources?: WebSearchResultItem[];
  searchQuery?: string;
}

const DEFAULT_VISIBLE_COUNT = 4;

export const MessageSources: React.FC<MessageSourcesProps> = ({ sources, searchQuery }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Requirement 7: Never display empty section if no web search sources exist
  if (!sources || sources.length === 0) {
    return null;
  }

  const hasOverflow = sources.length > DEFAULT_VISIBLE_COUNT;
  const displayedSources = isExpanded ? sources : sources.slice(0, DEFAULT_VISIBLE_COUNT);

  return (
    <div className="mt-3 pt-2.5 border-t border-white/[0.08] space-y-2">
      {/* Header bar */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-1.5 font-medium text-slate-300">
          <div className="w-5 h-5 rounded-md bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.15)]">
            <Globe className="w-3 h-3" />
          </div>
          <span className="font-['Syne',sans-serif] tracking-wide text-white text-[12px]">Sources</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
            {sources.length} {sources.length === 1 ? 'source' : 'sources'}
          </span>
        </div>

        {searchQuery && (
          <span className="text-[11px] text-slate-500 hidden sm:inline truncate max-w-[200px]" title={searchQuery}>
            query: "{searchQuery}"
          </span>
        )}
      </div>

      {/* Sources Grid: mobile 1 col, tablet/desktop 2 cols */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
        <AnimatePresence initial={false}>
          {displayedSources.map((src, idx) => (
            <SourceCard key={`${src.url}-${idx}`} source={src} index={idx} />
          ))}
        </AnimatePresence>
      </div>

      {/* Expand / Collapse toggle if there are many sources */}
      {hasOverflow && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] hover:border-cyan-500/30 text-xs text-slate-300 hover:text-cyan-300 font-medium transition-all duration-150 cursor-pointer group"
          aria-expanded={isExpanded}
        >
          <span>
            {isExpanded ? 'Show fewer sources' : `View all ${sources.length} sources`}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-300 transition-colors" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-300 transition-colors" />
          )}
        </button>
      )}
    </div>
  );
};

interface SourceCardProps {
  source: WebSearchResultItem;
  index: number;
}

const SourceCard: React.FC<SourceCardProps> = ({ source, index }) => {
  // Extract or compute clean hostname
  const domain = React.useMemo(() => {
    if (source.domain) return source.domain;
    try {
      return new URL(source.url).hostname.replace(/^www\./, '');
    } catch {
      return 'web';
    }
  }, [source.domain, source.url]);

  // Compute public favicon URL if not provided by backend
  const faviconUrl = source.faviconUrl || (domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : undefined);

  return (
    <motion.a
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, delay: index * 0.03 }}
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group/card relative flex flex-col p-2.5 sm:p-3 rounded-xl bg-[#090d16]/90 hover:bg-[#0f172a] border border-white/[0.07] hover:border-cyan-500/35 hover:shadow-[0_0_16px_rgba(6,182,212,0.12)] transition-all duration-200 text-xs shadow-sm cursor-pointer select-none"
      title={source.title}
    >
      {/* Top row: Favicon + Domain pill + ExternalLink icon */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <FaviconIcon faviconUrl={faviconUrl} domain={domain} />
          <span className="text-[10px] font-mono font-medium text-cyan-300/90 bg-cyan-950/60 px-1.5 py-0.5 rounded-md border border-cyan-800/40 truncate max-w-[160px]">
            {domain}
          </span>
        </div>
        <ExternalLink className="w-3 h-3 text-slate-500 group-hover/card:text-cyan-400 group-hover/card:translate-x-0.5 transition-all shrink-0" />
      </div>

      {/* Page Title */}
      <span className="font-medium text-slate-200 group-hover/card:text-white line-clamp-1 leading-snug">
        {source.title}
      </span>

      {/* Relevant snippet */}
      {source.content && (
        <span className="text-[11px] text-slate-400/90 line-clamp-2 mt-1 leading-relaxed font-normal">
          {source.content}
        </span>
      )}
    </motion.a>
  );
};

interface FaviconIconProps {
  faviconUrl?: string;
  domain: string;
}

const FaviconIcon: React.FC<FaviconIconProps> = ({ faviconUrl, domain }) => {
  const [hasError, setHasError] = useState(false);

  // Requirement 10: Graceful fallback icon if favicon fails to load or is unavailable
  if (!faviconUrl || hasError) {
    return (
      <div
        className="w-4 h-4 rounded-sm bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0"
        title={domain}
      >
        <Globe className="w-2.5 h-2.5 text-cyan-400/75" />
      </div>
    );
  }

  return (
    <div className="w-4 h-4 rounded-sm bg-white/[0.04] flex items-center justify-center shrink-0 overflow-hidden">
      <img
        src={faviconUrl}
        alt={domain}
        loading="lazy"
        onError={() => setHasError(true)}
        className="w-3.5 h-3.5 object-contain"
      />
    </div>
  );
};
