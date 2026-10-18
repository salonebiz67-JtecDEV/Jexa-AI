import React, { useState } from 'react';
import {
  Copy,
  Check,
  Share2,
  RefreshCw,
  Volume2,
  MoreHorizontal,
  ExternalLink,
  AlertCircle,
  Globe,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { ChatMessage, Project } from '../../../shared/types';
import { cleanAndNormalizeResponseContent, repairUnclosedMarkdown } from '../../../ai/brain/response-cleaner';
import { MessageSources } from './MessageSources';

interface MessageItemProps {
  message: ChatMessage;
  projects?: Project[];
  onRegenerate?: () => void;
  onSpeak?: (text: string) => void;
  onShare?: (text: string) => void;
  onPinMessage?: (id: string) => void;
  onAddToProject?: (text: string, projectId: string) => void;
  onOpenArtifact?: (artifact: {
    id: string;
    title: string;
    type: 'html' | 'react' | 'svg' | 'markdown' | 'text';
    code: string;
  }) => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  projects = [],
  onRegenerate,
  onSpeak,
  onShare,
  onAddToProject,
  onOpenArtifact,
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [feedback, setFeedback] = useState<'liked' | 'disliked' | null>(null);

  const isUser = message.role === 'user';

  const handleLike = () => {
    setFeedback((prev) => (prev === 'liked' ? null : 'liked'));
  };

  const handleDislike = () => {
    setFeedback((prev) => (prev === 'disliked' ? null : 'disliked'));
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCode = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeIndex(idx);
    setTimeout(() => setCopiedCodeIndex(null), 2000);
  };

  // Helper to parse inline markdown: [label](url), raw URLs, bold, inline code, and italics
  const renderInlineFormatting = (text: string) => {
    const tokenRegex = /(\[[^\]]+\]\(https?:\/\/[^\s\)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|https?:\/\/[^\s<>"]+)/g;
    const parts = text.split(tokenRegex);

    return parts.map((part, idx) => {
      if (!part) return null;

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

      // Bold: **text**
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        const boldText = part.slice(2, -2);
        return (
          <strong key={idx} className="font-semibold text-white">
            {boldText}
          </strong>
        );
      }

      // Italic: *text*
      if (part.startsWith('*') && part.endsWith('*') && part.length >= 2 && !part.startsWith('**')) {
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
    const normalized = isUser
      ? content
      : repairUnclosedMarkdown(cleanAndNormalizeResponseContent(content));

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
            className="my-3 rounded-2xl overflow-hidden border border-white/[0.08] bg-[#06080e] shadow-md"
          >
            <div className="flex items-center justify-between px-3.5 py-2 bg-[#0b0f1a] border-b border-white/[0.06] text-[11px] text-slate-400 font-mono">
              <span className="uppercase tracking-wider font-semibold text-slate-300">
                {language}
              </span>
              <div className="flex items-center gap-2">
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
                    className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer text-xs"
                    title="Open in contextual workspace"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Workspace</span>
                  </button>
                )}
                <button
                  onClick={() => handleCopyCode(codeContent, segIdx)}
                  className="flex items-center gap-1 hover:text-slate-200 transition-colors cursor-pointer text-xs"
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

            <pre className="p-3.5 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed select-text">
              <code>{codeContent}</code>
            </pre>
          </div>
        );
      }

      // Non-code text segment: parse into discrete block types
      const lines = segment.split('\n');
      const blocks: React.ReactNode[] = [];
      let currentParagraph: string[] = [];
      let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
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

      const flushList = () => {
        if (currentList && currentList.items.length > 0) {
          if (currentList.type === 'ul') {
            blocks.push(
              <ul
                key={`ul-${segIdx}-${blockCounter++}`}
                className="space-y-2 my-2.5 pl-0.5 text-slate-200 text-[14.5px] sm:text-[15px]"
              >
                {currentList.items.map((it, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 shrink-0 shadow-[0_0_6px_rgba(6,182,212,0.4)]" />
                    <span className="flex-1 min-w-0 break-words">{renderInlineFormatting(it)}</span>
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
                  <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                    <span className="w-5 h-5 rounded-md bg-white/[0.07] border border-white/[0.08] text-cyan-300 font-mono text-[11px] font-medium flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="flex-1 min-w-0 break-words">{renderInlineFormatting(it)}</span>
                  </li>
                ))}
              </ol>
            );
          }
          currentList = null;
        }
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Empty line flushes current blocks
        if (!trimmed) {
          flushParagraph();
          flushList();
          continue;
        }

        // Horizontal Rule
        if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
          flushParagraph();
          flushList();
          blocks.push(<hr key={`hr-${segIdx}-${blockCounter++}`} className="my-3 border-white/[0.08]" />);
          continue;
        }

        // Headings: ALWAYS flushed as separate blocks
        if (trimmed.startsWith('# ') || trimmed.startsWith('## ') || trimmed.startsWith('### ') || trimmed.startsWith('#### ')) {
          flushParagraph();
          flushList();

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
                {renderInlineFormatting(trimmed.replace(/^####\s+/, ''))}
              </h5>
            );
          }
          continue;
        }

        // Blockquotes
        if (trimmed.startsWith('>')) {
          flushParagraph();
          flushList();
          blocks.push(
            <blockquote
              key={`bq-${segIdx}-${blockCounter++}`}
              className="pl-3.5 py-1 border-l-2 border-cyan-500/50 bg-white/[0.02] rounded-r-lg text-slate-300 italic my-2 text-[14px]"
            >
              {renderInlineFormatting(trimmed.replace(/^>\s*/, ''))}
            </blockquote>
          );
          continue;
        }

        // Unordered list item
        if (/^[\*\-•]\s+/.test(trimmed)) {
          flushParagraph();
          const cleanItem = trimmed.replace(/^[\*\-•]\s+/, '');
          if (currentList && currentList.type === 'ul') {
            currentList.items.push(cleanItem);
          } else {
            flushList();
            currentList = { type: 'ul', items: [cleanItem] };
          }
          continue;
        }

        // Ordered list item
        if (/^\d+[\.\)]\s+/.test(trimmed)) {
          flushParagraph();
          const cleanItem = trimmed.replace(/^\d+[\.\)]\s+/, '');
          if (currentList && currentList.type === 'ol') {
            currentList.items.push(cleanItem);
          } else {
            flushList();
            currentList = { type: 'ol', items: [cleanItem] };
          }
          continue;
        }

        // Regular line part of paragraph
        if (currentList) {
          flushList();
        }
        currentParagraph.push(trimmed);
      }

      flushParagraph();
      flushList();

      return (
        <div key={segIdx} className="space-y-1">
          {blocks}
        </div>
      );
    });
  };

  return (
    <div className={`py-2 px-2.5 sm:px-4 group ${isUser ? 'flex justify-end' : 'flex justify-start'}`}>
      <div className={`max-w-[94%] sm:max-w-[85%] space-y-1 ${isUser ? 'items-end' : 'items-start'}`}>
        {/* User Message Bubble */}
        {isUser ? (
          <div className="bg-[#172133] text-slate-100 px-4 py-2.5 rounded-2xl rounded-tr-md border border-white/[0.09] shadow-sm text-[14.5px] sm:text-[15px]">
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
        ) : message.status === 'error' ? (
          <div className="p-3.5 rounded-2xl bg-rose-950/30 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2.5 shadow-sm max-w-lg">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-rose-300">AI Provider Notice</div>
              <p className="leading-relaxed text-slate-300">{message.content}</p>
            </div>
          </div>
        ) : (
          /* Assistant Message Content */
          <div className="space-y-1 text-slate-200 text-[14.5px] sm:text-[15px]">
            {/* Live Web Search indicator chip */}
            {message.metadata?.searchQuery && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-[11px] font-medium text-cyan-300 mb-1.5">
                <Globe className="w-3 h-3 text-cyan-400" />
                <span>
                  {message.metadata.searchTrigger === 'manual'
                    ? 'Manual Search:'
                    : 'Live Research:'}
                </span>
                <span className="text-white font-mono truncate max-w-[220px]">
                  "{message.metadata.searchQuery}"
                </span>
              </div>
            )}

            {/* Rendered Markdown Body */}
            {renderFormattedContent(message.content)}

            {/* Action Buttons Bar */}
            <div className="flex items-center gap-1 pt-1.5 opacity-80 group-hover:opacity-100 transition-opacity text-slate-400 text-xs">
              {/* Copy */}
              <button
                onClick={handleCopyMessage}
                title="Copy response"
                className="p-1.5 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
                aria-label="Copy response"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              {/* Text-to-Speech */}
              {onSpeak && (
                <button
                  onClick={() => onSpeak(message.content)}
                  title="Read aloud"
                  className="p-1.5 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
                  aria-label="Read response aloud"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Share */}
              {onShare && (
                <button
                  onClick={() => onShare(message.content)}
                  title="Share response"
                  className="p-1.5 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
                  aria-label="Share response"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Like */}
              <button
                onClick={handleLike}
                title={feedback === 'liked' ? 'Liked' : 'Good response'}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  feedback === 'liked'
                    ? 'text-emerald-400 bg-emerald-500/15'
                    : 'hover:text-white hover:bg-white/[0.06]'
                }`}
                aria-label="Like response"
              >
                <ThumbsUp className="w-3.5 h-3.5" />
              </button>

              {/* Dislike */}
              <button
                onClick={handleDislike}
                title={feedback === 'disliked' ? 'Disliked' : 'Poor response'}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  feedback === 'disliked'
                    ? 'text-rose-400 bg-rose-500/15'
                    : 'hover:text-white hover:bg-white/[0.06]'
                }`}
                aria-label="Dislike response"
              >
                <ThumbsDown className="w-3.5 h-3.5" />
              </button>

              {/* Regenerate */}
              {onRegenerate && (
                <button
                  onClick={() => onRegenerate()}
                  title="Regenerate response"
                  className="p-1.5 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
                  aria-label="Regenerate response"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Add to Project */}
              {projects.length > 0 && onAddToProject && (
                <div className="relative">
                  <button
                    onClick={() => setShowMoreMenu(!showMoreMenu)}
                    title="More actions"
                    className="p-1.5 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
                    aria-label="More actions"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>

                  {showMoreMenu && (
                    <div className="absolute left-0 bottom-full mb-1 w-44 rounded-xl bg-[#0f1422] border border-white/[0.08] shadow-xl py-1 z-20 text-xs">
                      <div className="px-3 py-1 text-[10px] text-slate-500 font-semibold uppercase">
                        Add to Project
                      </div>
                      {projects.map((proj) => (
                        <button
                          key={proj.id}
                          onClick={() => {
                            onAddToProject(message.content, proj.id);
                            setShowMoreMenu(false);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-white/[0.06] text-slate-300 hover:text-white truncate cursor-pointer"
                        >
                          {proj.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

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
