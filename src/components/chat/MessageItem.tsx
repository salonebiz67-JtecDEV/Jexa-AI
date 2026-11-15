import React, { useState, useRef, useEffect } from 'react';
import {
  Copy,
  Check,
  Share2,
  RefreshCw,
  Volume2,
  Pause,
  Play,
  Loader2,
  MoreHorizontal,
  ExternalLink,
  AlertCircle,
  Globe,
  ThumbsUp,
  ThumbsDown,
  BookmarkPlus,
  X,
} from 'lucide-react';
import { ChatMessage, Project } from '../../../shared/types';
import { cleanAndNormalizeResponseContent, repairUnclosedMarkdown } from '../../../ai/brain/response-cleaner';
import { appendToAboutMe } from '../../services/storage';
import { showToast } from '../../services/toast';
import { AudioPlaybackStatus } from '../../services/audioPlayer';
import { MessageSources } from './MessageSources';

interface MessageItemProps {
  message: ChatMessage;
  projects?: Project[];
  isSending?: boolean;
  isRegenerating?: boolean;
  audioStatus?: AudioPlaybackStatus;
  voiceError?: string | null;
  onRegenerate?: (messageId?: string) => void;
  onSpeak?: (message: ChatMessage) => void;
  onShare?: (text: string, message?: ChatMessage) => void;
  onPinMessage?: (id: string) => void;
  onAddToProject?: (text: string, projectId: string) => void;
  onOpenArtifact?: (artifact: {
    id: string;
    title: string;
    type: 'html' | 'react' | 'svg' | 'markdown' | 'text';
    code: string;
  }) => void;
}

function formatShortModelName(model?: string): string {
  const raw = (model || '').trim();
  if (!raw) return 'gemini';
  const cleaned = raw.replace(/^models\//i, '').trim();
  if (/hydrogen/i.test(cleaned)) return 'hydrogen';
  return cleaned.replace(/^gemini-/i, '') || cleaned;
}

function formatLatency(ms?: number): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  projects = [],
  isSending = false,
  isRegenerating = false,
  audioStatus = 'idle',
  voiceError = null,
  onRegenerate,
  onSpeak,
  onShare,
  onAddToProject,
  onOpenArtifact,
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showTelemetryPopup, setShowTelemetryPopup] = useState(false);
  const [feedback, setFeedback] = useState<'liked' | 'disliked' | null>(null);
  const [savedInfoState, setSavedInfoState] = useState<'idle' | 'saved' | 'duplicate' | 'full'>('idle');
  const telemetryRef = useRef<HTMLDivElement>(null);

  const isUser = message.role === 'user';

  useEffect(() => {
    if (!showTelemetryPopup) return;
    const handleOutside = (e: MouseEvent) => {
      if (telemetryRef.current && !telemetryRef.current.contains(e.target as Node)) {
        setShowTelemetryPopup(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowTelemetryPopup(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [showTelemetryPopup]);

  const handleSaveToMyInfo = () => {
    const cleanText = message.content
      .replace(/\[web\s+search\s+requested\]\s*/gi, '')
      .trim();
    const res = appendToAboutMe(cleanText);
    if (res.alreadyFull) {
      setSavedInfoState('full');
      showToast('About me is full (1,500 chars)', 'info');
    } else if (res.duplicate) {
      setSavedInfoState('duplicate');
      showToast('Already saved in About me', 'info');
    } else {
      setSavedInfoState('saved');
      showToast('Saved to About me', 'success');
    }
    setTimeout(() => setSavedInfoState('idle'), 2500);
  };

  const handleLike = () => {
    setFeedback((prev) => (prev === 'liked' ? null : 'liked'));
  };

  const handleDislike = () => {
    setFeedback((prev) => (prev === 'disliked' ? null : 'disliked'));
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      showToast('Copied', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Failed to copy response.', 'error');
    }
  };

  const handleCopyCode = async (code: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeIndex(idx);
      showToast('Copied', 'success');
      setTimeout(() => setCopiedCodeIndex(null), 2000);
    } catch {
      showToast('Failed to copy code.', 'error');
    }
  };

  // Helper to parse inline markdown: [label](url), citations [1], raw URLs, bold, inline code, strikethrough, and italics
  const renderInlineFormatting = (text: string) => {
    // Non-capturing groups (?:...) inside ensure split only returns full tokens, preventing duplicated formatting
    const tokenRegex = /(\[[^\]]+\]\((?:https?:\/\/[^\s\)]+|[^\s\)]+)\)|\[\^?\d+(?:,\s*\^?\d+)*\]|<br\s*\/?>|`[^`\n]+`|\*\*(?:[^*]|\*(?!\*))+\*\*|__(?:[^_]|_(?!_))+__|~~(?:[^~]|~(?!~))+~~|\*(?:[^*\s]|[^*\s].*?[^*\s])\*|\b_(?:[^_\s]|[^_\s].*?[^_\s])_\b|https?:\/\/[^\s<>"]+)/gi;
    const parts = text.split(tokenRegex);

    return parts.map((part, idx) => {
      if (!part) return null;

      // Literal HTML line break tag
      if (/<br\s*\/?>/i.test(part)) {
        return <br key={idx} />;
      }

      // Citation badge: [1], [2], [1, 2], [^1]
      const citMatch = part.match(/^\[\^?(\d+(?:,\s*\^?\d+)*)\]$/);
      if (citMatch) {
        return (
          <span
            key={idx}
            className="inline-flex items-center justify-center px-1.5 py-0.2 mx-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 align-super select-none shadow-[0_0_6px_rgba(6,182,212,0.2)]"
            title={`Source reference ${citMatch[1]}`}
          >
            {citMatch[1].replace(/\^/g, '')}
          </span>
        );
      }

      // Markdown link: [Title](url)
      const linkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)$/);
      if (linkMatch) {
        const [, label, url] = linkMatch;
        return (
          <a
            key={idx}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 inline-flex items-center gap-0.5 font-medium transition-colors break-all"
          >
            <span>{label}</span>
            <ExternalLink className="w-3 h-3 inline-block ml-0.5 shrink-0 opacity-75" />
          </a>
        );
      }

      // Inline code: `code`
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        const code = part.slice(1, -1);
        return (
          <code
            key={idx}
            className="px-1.5 py-0.5 rounded-md bg-white/[0.08] text-cyan-200 font-mono text-[12px] border border-white/[0.06] break-all"
          >
            {code}
          </code>
        );
      }

      // Bold: **text** or __text__
      if (
        (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
        (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
      ) {
        const boldText = part.slice(2, -2);
        return (
          <strong key={idx} className="font-semibold text-white">
            {boldText}
          </strong>
        );
      }

      // Strikethrough: ~~text~~
      if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
        const strikeText = part.slice(2, -2);
        return (
          <del key={idx} className="line-through text-slate-400">
            {strikeText}
          </del>
        );
      }

      // Italic: *text* or _text_
      if (
        (part.startsWith('*') && part.endsWith('*') && part.length >= 2 && !part.startsWith('**')) ||
        (part.startsWith('_') && part.endsWith('_') && part.length >= 2 && !part.startsWith('__'))
      ) {
        const italicText = part.slice(1, -1);
        return (
          <em key={idx} className="italic text-slate-200">
            {italicText}
          </em>
        );
      }

      // Raw URL: https://...
      if (/^https?:\/\/[^\s]+$/.test(part)) {
        let hostname = '';
        try {
          hostname = new URL(part).hostname.replace(/^www\./, '');
        } catch {
          hostname = part;
        }
        return (
          <a
            key={idx}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 inline-flex items-center gap-0.5 font-medium transition-colors break-all"
          >
            <span className="truncate max-w-[200px]">{hostname || part}</span>
            <ExternalLink className="w-3 h-3 inline-block ml-0.5 shrink-0 opacity-75" />
          </a>
        );
      }

      return <span key={idx}>{part}</span>;
    });
  };

  // Robust line-by-line block markdown parser that prevents headings from running into paragraphs
  const renderFormattedContent = (content: string) => {
    const isStreaming = message.status === 'streaming';
    const normalized = isUser
      ? content
      : repairUnclosedMarkdown(cleanAndNormalizeResponseContent(content, { isStreaming }));

    // Split out code blocks first
    const codeBlockTokens = normalized.split(/(```[\s\S]*?```)/g);

    return codeBlockTokens.map((segment, segIdx) => {
      // Code block
      if (segment.startsWith('```') && segment.endsWith('```')) {
        const lines = segment.slice(3, -3).trim().split('\n');
        const firstLine = lines[0].trim();
        const hasLang = /^[a-zA-Z0-9_-]+$/.test(firstLine);
        const language = hasLang ? firstLine : 'code';
        const codeContent = hasLang ? lines.slice(1).join('\n') : lines.join('\n');

        const canPreview = ['html', 'svg', 'react', 'tsx', 'jsx', 'markdown', 'md'].includes(
          language.toLowerCase()
        );

        return (
          <div
            key={segIdx}
            className="my-3 w-full max-w-full min-w-0 rounded-2xl overflow-hidden border border-white/[0.08] bg-[#06080e] shadow-md"
          >
            <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#0b0f1a] border-b border-white/[0.06] text-[11px] text-slate-400 font-mono">
              <span className="uppercase tracking-wider font-semibold text-slate-300 truncate">
                {language}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {canPreview && onOpenArtifact && (
                  <button
                    onClick={() =>
                      onOpenArtifact({
                        id: `art-${Date.now()}`,
                        title: `${language.toUpperCase()} Artifact`,
                        type:
                          language.toLowerCase() === 'html'
                            ? 'html'
                            : language.toLowerCase() === 'svg'
                            ? 'svg'
                            : 'markdown',
                        code: codeContent,
                      })
                    }
                    className="min-h-[44px] px-2 flex items-center gap-1 text-emerald-400 hover:text-emerald-300 active:scale-95 transition-all cursor-pointer text-xs"
                    title="Open in contextual workspace"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Workspace</span>
                  </button>
                )}
                <button
                  onClick={() => handleCopyCode(codeContent, segIdx)}
                  className="min-h-[44px] px-2 flex items-center gap-1 hover:text-slate-200 active:scale-95 transition-all cursor-pointer text-xs"
                  title="Copy code"
                >
                  {copiedCodeIndex === segIdx ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-medium">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <pre className="p-3.5 text-xs font-mono text-slate-200 overflow-x-auto max-w-full leading-relaxed select-text scrollbar-none">
              <code>{codeContent}</code>
            </pre>
          </div>
        );
      }

      // Non-code text segment: parse into discrete block types
      const lines = segment.split('\n');
      const blocks: React.ReactNode[] = [];
      let currentParagraph: string[] = [];
      let currentList: { type: 'ul' | 'ol'; items: Array<{ text: string; isNested: boolean }> } | null = null;
      let currentTable: string[] = [];
      let currentBlockquote: string[] = [];
      let blockCounter = 0;

      const flushParagraph = () => {
        if (currentParagraph.length > 0) {
          const text = currentParagraph.join(' ').trim();
          if (text) {
            blocks.push(
              <p
                key={`p-${segIdx}-${blockCounter++}`}
                className="leading-relaxed text-slate-100 text-[14.5px] sm:text-[15px] break-words my-2"
              >
                {renderInlineFormatting(text)}
              </p>
            );
          }
          currentParagraph = [];
        }
      };

      const flushBlockquote = () => {
        if (currentBlockquote.length > 0) {
          const text = currentBlockquote.join('\n');
          currentBlockquote = [];
          blocks.push(
            <blockquote
              key={`bq-${segIdx}-${blockCounter++}`}
              className="pl-3.5 py-1.5 border-l-2 border-cyan-500/60 bg-white/[0.02] rounded-r-lg text-slate-300 italic my-2.5 text-[14px] leading-relaxed"
            >
              {renderInlineFormatting(text)}
            </blockquote>
          );
        }
      };

      const flushList = () => {
        if (currentList && currentList.items.length > 0) {
          if (currentList.type === 'ul') {
            blocks.push(
              <ul
                key={`ul-${segIdx}-${blockCounter++}`}
                className="space-y-2 my-2.5 pl-0.5 text-slate-200 text-[14.5px] sm:text-[15px]"
              >
                {currentList.items.map((it, idx) => (
                  <li
                    key={idx}
                    className={`flex items-start gap-2.5 leading-relaxed ${it.isNested ? 'ml-4 sm:ml-5' : ''}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${
                        it.isNested
                          ? 'border border-cyan-400 bg-transparent'
                          : 'bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.4)]'
                      }`}
                    />
                    <span className="flex-1 min-w-0 break-words">{renderInlineFormatting(it.text)}</span>
                  </li>
                ))}
              </ul>
            );
          } else {
            blocks.push(
              <ol
                key={`ol-${segIdx}-${blockCounter++}`}
                className="space-y-2 my-2.5 pl-0.5 text-slate-200 text-[14.5px] sm:text-[15px]"
              >
                {currentList.items.map((it, idx) => (
                  <li
                    key={idx}
                    className={`flex items-start gap-2.5 leading-relaxed ${it.isNested ? 'ml-4 sm:ml-5' : ''}`}
                  >
                    <span className="w-5 h-5 rounded-md bg-white/[0.07] border border-white/[0.08] text-cyan-300 font-mono text-[11px] font-medium flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="flex-1 min-w-0 break-words">{renderInlineFormatting(it.text)}</span>
                  </li>
                ))}
              </ol>
            );
          }
          currentList = null;
        }
      };

      const flushTable = () => {
        if (currentTable.length > 0) {
          const tableLines = currentTable;
          currentTable = [];

          // Find delimiter row (e.g. |---|---| or |:---|:---:|---:| or | - | - |)
          const delimiterIdx = tableLines.findIndex((l) =>
            /^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?$/.test(l.trim())
          );

          // Table is valid ONLY if there is a header before delimiter AND delimiter is at least index 1
          if (delimiterIdx > 0 && tableLines[delimiterIdx - 1]) {
            const rawHeader = tableLines[delimiterIdx - 1];
            const headerCells = rawHeader
              .split('|')
              .map((c) => c.trim())
              .filter((c, i, arr) => {
                if (i === 0 && rawHeader.trim().startsWith('|')) return false;
                if (i === arr.length - 1 && rawHeader.trim().endsWith('|')) return false;
                return true;
              });

            if (headerCells.length > 0) {
              const bodyRows = tableLines.slice(delimiterIdx + 1).map((rowLine) => {
                const cells = rowLine.split('|').map((c) => c.trim());
                if (cells[0] === '' && rowLine.trim().startsWith('|')) cells.shift();
                if (cells[cells.length - 1] === '' && rowLine.trim().endsWith('|')) cells.pop();
                return cells;
              });

              blocks.push(
                <div
                  key={`tbl-${segIdx}-${blockCounter++}`}
                  className="my-3 w-full max-w-full min-w-0 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#070b14]/90 shadow-sm scrollbar-none"
                >
                  <table className="w-full min-w-full border-collapse divide-y divide-white/[0.08] text-xs sm:text-[13.5px]">
                    <thead className="bg-white/[0.04]">
                      <tr>
                        {headerCells.map((h, i) => (
                          <th
                            key={i}
                            className="px-3.5 py-2.5 text-left font-semibold text-cyan-200 uppercase tracking-wider font-mono text-[11px] sm:text-xs whitespace-nowrap"
                          >
                            {renderInlineFormatting(h)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {bodyRows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-white/[0.02] transition-colors">
                          {headerCells.map((_, cIdx) => (
                            <td key={cIdx} className="px-3.5 py-2 text-slate-200 align-top break-words">
                              {renderInlineFormatting(row[cIdx] || '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
              return;
            }
          }

          // If NOT a valid table (e.g. casual pipe usage, or streaming single line):
          // Render as standard paragraph text, NEVER forced monospaced or broken boxes
          for (const l of tableLines) {
            blocks.push(
              <p
                key={`tbl-fallback-${segIdx}-${blockCounter++}`}
                className="leading-relaxed text-slate-100 text-[14.5px] sm:text-[15px] break-words my-2"
              >
                {renderInlineFormatting(l)}
              </p>
            );
          }
        }
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Empty line flushes all current block accumulators
        if (!trimmed) {
          flushParagraph();
          flushList();
          flushTable();
          flushBlockquote();
          continue;
        }

        // Horizontal Rule
        if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
          flushParagraph();
          flushList();
          flushTable();
          flushBlockquote();
          blocks.push(<hr key={`hr-${segIdx}-${blockCounter++}`} className="my-3 border-white/[0.08]" />);
          continue;
        }

        // Markdown Table Row
        if (trimmed.startsWith('|') && (trimmed.endsWith('|') || trimmed.includes('|', 1))) {
          flushParagraph();
          flushList();
          flushBlockquote();
          currentTable.push(trimmed);
          continue;
        } else if (currentTable.length > 0) {
          flushTable();
        }

        // Headings: ALWAYS flushed as separate blocks
        if (trimmed.startsWith('# ') || trimmed.startsWith('## ') || trimmed.startsWith('### ') || trimmed.startsWith('#### ') || trimmed.startsWith('##### ') || trimmed.startsWith('###### ')) {
          flushParagraph();
          flushList();
          flushTable();
          flushBlockquote();

          if (trimmed.startsWith('# ')) {
            blocks.push(
              <h2
                key={`h1-${segIdx}-${blockCounter++}`}
                className="text-lg sm:text-xl font-bold font-['Syne',sans-serif] text-white mt-4 mb-2 tracking-tight"
              >
                {renderInlineFormatting(trimmed.replace(/^#\s+/, ''))}
              </h2>
            );
          } else if (trimmed.startsWith('## ')) {
            blocks.push(
              <h3
                key={`h2-${segIdx}-${blockCounter++}`}
                className="text-base sm:text-lg font-bold font-['Syne',sans-serif] text-cyan-200 mt-4 mb-1.5 tracking-tight"
              >
                {renderInlineFormatting(trimmed.replace(/^##\s+/, ''))}
              </h3>
            );
          } else if (trimmed.startsWith('### ')) {
            blocks.push(
              <h4
                key={`h3-${segIdx}-${blockCounter++}`}
                className="text-[15px] sm:text-base font-bold font-['Syne',sans-serif] text-white mt-3.5 mb-1.5 flex items-center gap-1.5 tracking-tight"
              >
                {renderInlineFormatting(trimmed.replace(/^###\s+/, ''))}
              </h4>
            );
          } else {
            blocks.push(
              <h5
                key={`h4-${segIdx}-${blockCounter++}`}
                className="text-xs font-semibold uppercase tracking-wider text-slate-300 mt-3 mb-1"
              >
                {renderInlineFormatting(trimmed.replace(/^#{4,6}\s+/, ''))}
              </h5>
            );
          }
          continue;
        }

        // Blockquotes
        if (trimmed.startsWith('>')) {
          flushParagraph();
          flushList();
          flushTable();
          currentBlockquote.push(trimmed.replace(/^>\s*/, ''));
          continue;
        } else if (currentBlockquote.length > 0) {
          flushBlockquote();
        }

        const isBulletItem = /^[\*\-•\+]\s+/.test(trimmed);
        const isOrderedItem = /^\d+[\.\)]\s+/.test(trimmed);

        // List item continuation: Indented line that does NOT start with a bullet or number marker
        if (currentList && (line.startsWith('  ') || line.startsWith('\t')) && !isBulletItem && !isOrderedItem) {
          const lastIndex = currentList.items.length - 1;
          if (lastIndex >= 0) {
            currentList.items[lastIndex].text += ' ' + trimmed;
            continue;
          }
        }

        // Unordered list item
        if (isBulletItem) {
          flushParagraph();
          flushTable();
          flushBlockquote();
          const cleanItem = trimmed.replace(/^[\*\-•\+]\s+/, '');
          const isNested = line.startsWith('  ') || line.startsWith('\t');
          if (currentList && currentList.type === 'ul') {
            currentList.items.push({ text: cleanItem, isNested });
          } else {
            flushList();
            currentList = { type: 'ul', items: [{ text: cleanItem, isNested }] };
          }
          continue;
        }

        // Ordered list item
        if (isOrderedItem) {
          flushParagraph();
          flushTable();
          flushBlockquote();
          const cleanItem = trimmed.replace(/^\d+[\.\)]\s+/, '');
          const isNested = line.startsWith('  ') || line.startsWith('\t');
          if (currentList && currentList.type === 'ol') {
            currentList.items.push({ text: cleanItem, isNested });
          } else {
            flushList();
            currentList = { type: 'ol', items: [{ text: cleanItem, isNested }] };
          }
          continue;
        }

        // Regular line part of paragraph
        if (currentList) {
          flushList();
        }
        flushTable();
        flushBlockquote();
        currentParagraph.push(trimmed);
      }

      flushParagraph();
      flushList();
      flushTable();
      flushBlockquote();

      return (
        <div key={segIdx} className="space-y-1">
          {blocks}
          {isStreaming && segIdx === codeBlockTokens.length - 1 && (
            <span className="inline-block w-1.5 h-4 ml-1 bg-cyan-400 animate-pulse align-middle rounded-sm" />
          )}
        </div>
      );
    });
  };

  const shortModel = formatShortModelName(message.metadata?.model);
  const totalTokens =
    typeof message.metadata?.tokens === 'number' && message.metadata.tokens > 0
      ? message.metadata.tokens
      : typeof message.metadata?.inputTokens === 'number' || typeof message.metadata?.outputTokens === 'number'
      ? (message.metadata.inputTokens || 0) + (message.metadata.outputTokens || 0)
      : message.content
      ? Math.ceil(message.content.length / 4)
      : 0;
  const isEstimatedTokens = !(typeof message.metadata?.tokens === 'number' && message.metadata.tokens > 0);
  const fullModelName = message.metadata?.model || message.metadata?.provider || 'Gemini';

  return (
    <div
      className={`py-2 px-2 sm:px-4 w-full max-w-full min-w-0 overflow-x-hidden group ${
        isUser ? 'flex justify-end' : 'flex justify-start'
      }`}
    >
      <div
        className={`min-w-0 max-w-[94%] sm:max-w-[85%] space-y-1 ${
          isUser ? 'items-end' : 'w-full sm:w-auto items-start'
        }`}
      >
        {/* User Message Bubble */}
        {isUser ? (
          <div className="flex flex-col items-end gap-1 min-w-0 max-w-full">
            <div className="bg-[#172133] text-slate-100 px-4 py-2.5 rounded-2xl rounded-tr-md border border-white/[0.09] shadow-sm text-[14.5px] sm:text-[15px] max-w-full min-w-0">
              {/\[web\s+search\s+requested\]/i.test(message.content) && (
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-[11px] font-medium text-cyan-300 mb-1.5">
                  <Globe className="w-3 h-3 text-cyan-400" />
                  <span>Search Web</span>
                </div>
              )}
              <p className="whitespace-pre-wrap leading-relaxed break-words">
                {message.content.replace(/\[web\s+search\s+requested\]\s*/gi, '').trim()}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveToMyInfo}
              title="Append this message to About me in Settings"
              className={`min-h-[44px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] active:scale-95 transition-all cursor-pointer ${
                savedInfoState === 'saved'
                  ? 'text-emerald-300 bg-emerald-500/15 opacity-100'
                  : savedInfoState === 'full'
                  ? 'text-amber-300 bg-amber-500/15 opacity-100'
                  : savedInfoState === 'duplicate'
                  ? 'text-cyan-300 bg-cyan-500/15 opacity-100'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] opacity-0 group-hover:opacity-100 focus:opacity-100'
              }`}
            >
              {savedInfoState === 'saved' ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>Saved to my info</span>
                </>
              ) : savedInfoState === 'full' ? (
                <span>About me limit reached (1,500 chars)</span>
              ) : savedInfoState === 'duplicate' ? (
                <span>Already in About me</span>
              ) : (
                <>
                  <BookmarkPlus className="w-3 h-3" />
                  <span>Save to my info</span>
                </>
              )}
            </button>
          </div>
        ) : message.status === 'error' ? (
          <div className="p-3.5 rounded-2xl bg-rose-950/30 border border-rose-500/30 text-rose-200 text-xs flex items-start justify-between gap-3 shadow-sm max-w-lg min-w-0">
            <div className="flex items-start gap-2.5 min-w-0">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <div className="font-semibold text-rose-300">Gemini Error</div>
                <p className="leading-relaxed text-slate-300 break-words">{message.content}</p>
              </div>
            </div>
            {onRegenerate && (
              <button
                type="button"
                disabled={isSending}
                onClick={() => onRegenerate(message.id)}
                className="min-h-[44px] flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-rose-100 text-xs font-semibold active:scale-95 transition-all cursor-pointer shrink-0 border border-rose-500/30"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                <span>{isRegenerating ? 'Retrying…' : 'Retry'}</span>
              </button>
            )}
          </div>
        ) : (
          /* Assistant Message Content */
          <div className="space-y-1 text-slate-200 text-[14.5px] sm:text-[15px] min-w-0 max-w-full">
            {/* Live Web Search indicator chip */}
            {message.metadata?.searchQuery && (
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium mb-1.5 max-w-full ${
                  message.metadata.searchStatus === 'failed'
                    ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                    : message.metadata.searchStatus === 'missing_key'
                    ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
                    : message.metadata.searchStatus === 'no_results'
                    ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
                    : 'bg-cyan-500/10 border border-cyan-500/25 text-cyan-300'
                }`}
              >
                <Globe
                  className={`w-3 h-3 shrink-0 ${
                    message.metadata.searchStatus === 'failed'
                      ? 'text-rose-400'
                      : message.metadata.searchStatus === 'missing_key' || message.metadata.searchStatus === 'no_results'
                      ? 'text-amber-400'
                      : 'text-cyan-400'
                  }`}
                />
                <span className="shrink-0">
                  {message.metadata.searchStatus === 'failed'
                    ? 'Search Failed:'
                    : message.metadata.searchStatus === 'missing_key'
                    ? 'Search Unavailable:'
                    : message.metadata.searchStatus === 'no_results'
                    ? 'Search (No Results Found):'
                    : message.metadata.searchTrigger === 'manual'
                    ? 'Manual Search:'
                    : 'Live Research:'}
                </span>
                <span className="text-white font-mono truncate max-w-[180px] sm:max-w-[220px]">
                  "{message.metadata.searchQuery}"
                </span>
              </div>
            )}

            {/* Clear empty response notice with Retry button */}
            {!isUser &&
              (message.content?.includes("I couldn't generate a complete response") ||
                message.content?.includes("I completed gathering the necessary information")) && (
                <div className="my-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 max-w-full">
                  <div className="flex items-center gap-2 text-xs text-amber-300 min-w-0">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span className="break-words">I couldn't generate a complete response. Please try again.</span>
                  </div>
                  {onRegenerate && (
                    <button
                      type="button"
                      disabled={isSending}
                      onClick={() => onRegenerate(message.id)}
                      className="min-h-[44px] flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-amber-200 text-xs font-medium active:scale-95 transition-all cursor-pointer shrink-0 border border-amber-500/30"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                      <span>{isRegenerating ? 'Regenerating…' : 'Retry'}</span>
                    </button>
                  )}
                </div>
              )}

            {/* Rendered Markdown Body */}
            <div className="min-w-0 max-w-full">
              {renderFormattedContent(
                message.content?.replace(
                  'I completed gathering the necessary information for your request. Please try asking again.',
                  "I couldn't generate a complete response. Please try again."
                )
              )}
            </div>

            {/* Voice Failure Inline Notice with Retry */}
            {voiceError && onSpeak && (
              <div className="mt-2 p-2.5 rounded-xl bg-rose-950/30 border border-rose-500/30 flex items-center justify-between gap-2 text-xs text-rose-200 max-w-full">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="break-words leading-snug">{voiceError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onSpeak(message)}
                  className="min-h-[44px] px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 font-semibold text-xs flex items-center gap-1.5 shrink-0 border border-rose-500/30 active:scale-95 transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Retry</span>
                </button>
              </div>
            )}

            {/* Action Buttons Bar + Compact Model & Token Readout */}
            {message.status !== 'streaming' && (
              <div className="relative flex flex-wrap items-center justify-between gap-1 pt-1 text-slate-400 text-xs min-w-0 max-w-full">
                <div className="flex flex-wrap items-center gap-0.5 min-w-0">
                  {/* Copy */}
                  <button
                    type="button"
                    onClick={handleCopyMessage}
                    title={copied ? 'Copied' : 'Copy response'}
                    className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl active:scale-95 transition-all cursor-pointer ${
                      copied
                        ? 'text-emerald-400 bg-emerald-500/15'
                        : 'hover:text-white hover:bg-white/[0.06]'
                    }`}
                    aria-label="Copy response"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>

                  {/* Text-to-Speech Speaker (idle / loading / playing / paused) */}
                  {onSpeak && (
                    <button
                      type="button"
                      onClick={() => onSpeak(message)}
                      title={
                        audioStatus === 'loading'
                          ? 'Preparing voice…'
                          : audioStatus === 'playing'
                          ? 'Pause voice'
                          : audioStatus === 'paused'
                          ? 'Resume voice'
                          : 'Read aloud'
                      }
                      className={`min-h-[44px] ${
                        audioStatus === 'playing' ? 'min-w-[52px] px-2.5 gap-1.5' : 'min-w-[44px]'
                      } flex items-center justify-center rounded-xl active:scale-95 transition-all cursor-pointer ${
                        audioStatus === 'playing'
                          ? 'text-cyan-300 bg-cyan-500/15 border border-cyan-500/30'
                          : audioStatus === 'paused'
                          ? 'text-emerald-300 bg-emerald-500/15 border border-emerald-500/30'
                          : audioStatus === 'loading'
                          ? 'text-cyan-300 bg-white/[0.06]'
                          : 'hover:text-white hover:bg-white/[0.06]'
                      }`}
                      aria-label={
                        audioStatus === 'loading'
                          ? 'Preparing voice'
                          : audioStatus === 'playing'
                          ? 'Pause voice'
                          : audioStatus === 'paused'
                          ? 'Resume voice'
                          : 'Read response aloud'
                      }
                    >
                      {audioStatus === 'loading' ? (
                        <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                      ) : audioStatus === 'playing' ? (
                        <>
                          <Pause className="w-3.5 h-3.5 fill-current" />
                          <span className="flex items-end gap-[2px] h-3" aria-hidden="true">
                            <span className="w-[2px] h-3 bg-cyan-400 rounded-full animate-wave-bar [animation-delay:0ms] origin-bottom" />
                            <span className="w-[2px] h-3 bg-cyan-400 rounded-full animate-wave-bar [animation-delay:220ms] origin-bottom" />
                            <span className="w-[2px] h-3 bg-cyan-400 rounded-full animate-wave-bar [animation-delay:420ms] origin-bottom" />
                          </span>
                        </>
                      ) : audioStatus === 'paused' ? (
                        <Play className="w-4 h-4 fill-current" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                  )}

                  {/* Share */}
                  {onShare && (
                    <button
                      type="button"
                      onClick={() => onShare(message.content, message)}
                      title="Share response"
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-white rounded-xl hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
                      aria-label="Share response"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                  )}

                  {/* Like */}
                  <button
                    type="button"
                    onClick={handleLike}
                    title={feedback === 'liked' ? 'Liked' : 'Good response'}
                    aria-pressed={feedback === 'liked'}
                    className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl active:scale-95 transition-all cursor-pointer ${
                      feedback === 'liked'
                        ? 'text-emerald-400 bg-emerald-500/15'
                        : 'hover:text-white hover:bg-white/[0.06]'
                    }`}
                    aria-label="Like response"
                  >
                    <ThumbsUp className={`w-4 h-4 ${feedback === 'liked' ? 'fill-current' : ''}`} />
                  </button>

                  {/* Dislike */}
                  <button
                    type="button"
                    onClick={handleDislike}
                    title={feedback === 'disliked' ? 'Disliked' : 'Poor response'}
                    aria-pressed={feedback === 'disliked'}
                    className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl active:scale-95 transition-all cursor-pointer ${
                      feedback === 'disliked'
                        ? 'text-rose-400 bg-rose-500/15'
                        : 'hover:text-white hover:bg-white/[0.06]'
                    }`}
                    aria-label="Dislike response"
                  >
                    <ThumbsDown className={`w-4 h-4 ${feedback === 'disliked' ? 'fill-current' : ''}`} />
                  </button>

                  {/* Regenerate */}
                  {onRegenerate && (
                    <button
                      type="button"
                      disabled={isSending}
                      onClick={() => onRegenerate(message.id)}
                      title={isRegenerating ? 'Regenerating…' : 'Regenerate response'}
                      className={`min-h-[44px] ${
                        isRegenerating ? 'px-2.5 gap-1.5' : 'min-w-[44px]'
                      } flex items-center justify-center rounded-xl transition-all ${
                        isSending
                          ? 'opacity-60 cursor-not-allowed text-slate-300 bg-white/[0.04]'
                          : 'hover:text-white hover:bg-white/[0.06] active:scale-95 cursor-pointer'
                      }`}
                      aria-label={isRegenerating ? 'Regenerating response' : 'Regenerate response'}
                    >
                      <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin text-cyan-400' : ''}`} />
                      {isRegenerating && (
                        <span className="text-[11px] font-medium text-cyan-300 whitespace-nowrap">
                          Regenerating…
                        </span>
                      )}
                    </button>
                  )}

                  {/* Save to my info */}
                  <button
                    type="button"
                    onClick={handleSaveToMyInfo}
                    title="Save this text to About me"
                    className={`min-h-[44px] inline-flex items-center gap-1 px-2.5 rounded-xl active:scale-95 transition-all cursor-pointer ${
                      savedInfoState === 'saved'
                        ? 'text-emerald-300 bg-emerald-500/15'
                        : savedInfoState === 'full'
                        ? 'text-amber-300 bg-amber-500/15'
                        : savedInfoState === 'duplicate'
                        ? 'text-cyan-300 bg-cyan-500/15'
                        : 'hover:text-white hover:bg-white/[0.06]'
                    }`}
                    aria-label="Save to my info"
                  >
                    {savedInfoState === 'saved' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[11px] font-medium whitespace-nowrap">Saved</span>
                      </>
                    ) : savedInfoState === 'full' ? (
                      <span className="text-[11px] font-medium whitespace-nowrap">Full</span>
                    ) : savedInfoState === 'duplicate' ? (
                      <span className="text-[11px] font-medium whitespace-nowrap">Saved</span>
                    ) : (
                      <BookmarkPlus className="w-4 h-4" />
                    )}
                  </button>

                  {/* Add to Project */}
                  {projects.length > 0 && onAddToProject && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowMoreMenu(!showMoreMenu)}
                        title="More actions"
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-white rounded-xl hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
                        aria-label="More actions"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>

                      {showMoreMenu && (
                        <div className="absolute left-0 bottom-full mb-1 w-44 rounded-xl bg-[#0f1422] border border-white/[0.08] shadow-xl py-1 z-20 text-xs">
                          <div className="px-3 py-1 text-[10px] text-slate-500 font-semibold uppercase">
                            Add to Project
                          </div>
                          {projects.map((proj) => (
                            <button
                              key={proj.id}
                              type="button"
                              onClick={() => {
                                onAddToProject(message.content, proj.id);
                                setShowMoreMenu(false);
                              }}
                              className="w-full min-h-[40px] text-left px-3 py-1.5 hover:bg-white/[0.06] text-slate-300 hover:text-white truncate cursor-pointer"
                            >
                              {proj.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Compact single-line model & token readout + Popup */}
                {(message.metadata?.provider || message.metadata?.model || totalTokens > 0) && (
                  <div className="relative ml-auto shrink-0" ref={telemetryRef}>
                    <button
                      type="button"
                      onClick={() => setShowTelemetryPopup((prev) => !prev)}
                      className="min-h-[44px] px-2 inline-flex items-center text-[11px] font-mono text-slate-500 hover:text-slate-300 rounded-lg hover:bg-white/[0.04] active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0 max-w-[175px]"
                      title="View model and token details"
                      aria-expanded={showTelemetryPopup}
                    >
                      <span className="truncate">
                        {shortModel}
                        {totalTokens > 0 ? ` · ${isEstimatedTokens ? '~' : ''}${totalTokens.toLocaleString()} tok` : ''}
                      </span>
                    </button>

                    {showTelemetryPopup && (
                      <div
                        role="dialog"
                        aria-label="Reply details"
                        className="absolute right-0 bottom-full mb-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-2xl bg-[#0f1422] border border-white/[0.1] shadow-2xl p-3.5 z-30 text-xs space-y-2 backdrop-blur-xl"
                      >
                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/[0.06]">
                          <span className="font-semibold text-white text-[11px] uppercase tracking-wider">
                            Reply Details
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowTelemetryPopup(false)}
                            className="p-1 rounded-md text-slate-400 hover:text-white active:scale-95 transition-all cursor-pointer"
                            aria-label="Close details"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="space-y-1.5 text-[11px]">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-slate-400 shrink-0">Model</span>
                            <span className="text-slate-100 font-mono text-right break-all">
                              {fullModelName}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-400">Input tokens</span>
                            <span className="text-slate-200 font-mono">
                              {typeof message.metadata?.inputTokens === 'number'
                                ? message.metadata.inputTokens.toLocaleString()
                                : '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-400">Output tokens</span>
                            <span className="text-slate-200 font-mono">
                              {typeof message.metadata?.outputTokens === 'number'
                                ? message.metadata.outputTokens.toLocaleString()
                                : totalTokens > 0
                                ? `~${totalTokens.toLocaleString()}`
                                : '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-400">Response time</span>
                            <span className="text-slate-200 font-mono">
                              {formatLatency(message.metadata?.latencyMs)}
                            </span>
                          </div>
                          {message.metadata?.fallbackUsed && (
                            <div className="pt-1 text-[10px] text-amber-300">
                              Answered via backup model
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Collapsible ChatGPT-style Sources section directly underneath answer and action buttons */}
            <MessageSources
              sources={message.metadata?.sources}
              searchQuery={message.metadata?.searchQuery}
            />
          </div>
        )}
      </div>
    </div>
  );
};
