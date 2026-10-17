import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, ExternalLink, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { WebSearchResultItem } from '../../../shared/types/chat';

interface MessageSourcesProps {
  sources?: WebSearchResultItem[];
  searchQuery?: string;
}

export const MessageSources: React.FC<MessageSourcesProps> = ({ sources, searchQuery }) => {
  // Collapsed by default on mobile for clean ChatGPT feel, expandable on tap
  const [isOpen, setIsOpen] = useState(false);

  // Requirement: Never display empty section if no web search sources exist
  if (!sources || sources.length === 0) {
    return null;
  }

  // Deduplicate sources by URL and domain
  const deduplicatedSources = React.useMemo(() => {
    const seen = new Set<string>();
    const list: WebSearchResultItem[] = [];
    for (const s of sources) {
      if (!s.url) continue;
      const key = s.url.toLowerCase().replace(/\/+$/, '');
      if (!seen.has(key)) {
        seen.add(key);
        list.push(s);
      }
    }
    return list;
  }, [sources]);

  // Distinct domains for compact preview bar
  const previewDomains = React.useMemo(() => {
    const domains: string[] = [];
    for (const s of deduplicatedSources) {
      let d = s.domain;
      if (!d) {
        try {
          d = new URL(s.url).hostname.replace(/^www\./, '');
        } catch {
          d = '';
        }
      }
      if (d && !domains.includes(d)) {
        domains.push(d);
      }
    }
    return domains.slice(0, 3);
  }, [deduplicatedSources]);

  return (
    <div className="mt-3 pt-2.5 border-t border-white/[0.08] select-none">
      {/* Clickable Collapsible Bar Header (ChatGPT style) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-cyan-500/25 transition-all duration-150 cursor-pointer text-left group"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-md bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400 shrink-0 shadow-[0_0_8px_rgba(6,182,212,0.15)]">
            <Globe className="w-3 h-3" />
          </div>

          <div className="flex items-center gap-1.5 truncate">
            <span className="font-['Syne',sans-serif] font-bold text-white text-xs tracking-wide">
              Sources
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shrink-0">
              {deduplicatedSources.length} {deduplicatedSources.length === 1 ? 'source' : 'sources'}
            </span>

            {/* Quick domain preview when collapsed */}
            {!isOpen && previewDomains.length > 0 && (
              <span className="text-[11px] text-slate-400 hidden sm:inline truncate ml-1 font-mono">
                • {previewDomains.join(', ')}
                {deduplicatedSources.length > previewDomains.length && ` +${deduplicatedSources.length - previewDomains.length} more`}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-400 group-hover:text-cyan-300 shrink-0 ml-2">
          <span className="text-[11px] hidden xs:inline">
            {isOpen ? 'Collapse' : 'View sources'}
          </span>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-cyan-400 transition-transform" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 transition-transform" />
          )}
        </div>
      </button>

      {/* Expanded Sources Grid */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-2 space-y-2">
              {searchQuery && (
                <div className="text-[10px] text-slate-500 font-mono px-1">
                  Verified query: "{searchQuery}"
                </div>
              )}

              {/* Grid: 1 col on mobile, 2 cols on tablet/desktop */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {deduplicatedSources.map((src, idx) => (
                  <SourceCard key={`${src.url}-${idx}`} source={src} index={idx} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: index * 0.02 }}
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group/card relative flex flex-col p-2.5 sm:p-3 rounded-xl bg-[#090d16]/95 hover:bg-[#0f172a] border border-white/[0.07] hover:border-cyan-500/40 hover:shadow-[0_0_16px_rgba(6,182,212,0.14)] transition-all duration-150 text-xs shadow-sm cursor-pointer select-none"
      title={source.title}
    >
      {/* Top row: Favicon + Domain pill + Date (if verified) + ExternalLink */}
      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <FaviconIcon faviconUrl={faviconUrl} domain={domain} />
          <span className="text-[10px] font-mono font-medium text-cyan-300 bg-cyan-950/70 px-1.5 py-0.5 rounded-md border border-cyan-800/40 truncate max-w-[130px]">
            {domain}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {source.publishedDate && (
            <span className="text-[10px] text-slate-400 font-mono hidden xs:inline-flex items-center gap-1">
              <Calendar className="w-2.5 h-2.5 text-slate-500" />
              <span>{source.publishedDate}</span>
            </span>
          )}
          <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover/card:text-cyan-400 transition-colors" />
        </div>
      </div>

      {/* Article / Page Title */}
      <span className="font-semibold text-slate-100 group-hover/card:text-white line-clamp-2 leading-snug">
        {source.title}
      </span>

      {/* Snippet without boilerplate */}
      {source.content && (
        <span className="text-[11px] text-slate-400/90 line-clamp-2 mt-1.5 leading-relaxed font-normal">
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

  // Graceful fallback icon if favicon fails to load or is unavailable
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
