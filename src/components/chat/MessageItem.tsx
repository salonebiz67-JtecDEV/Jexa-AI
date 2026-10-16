import React, { useState } from 'react';
import {
  Copy,
  Check,
  Share2,
  Pin,
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
  onPinMessage,
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

  // Helper to parse markdown links [label](url), raw URLs, bold, inline code, and italics
  const renderInlineFormatting = (text: string) => {
    // Regex matching [label](url), `inline code`, **bold**, *italic*, and raw https URLs
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
            className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 inline-flex items-center gap-0.5 font-medium transition-colors"
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
            className="px-1.5 py-0.5 rounded-md bg-white/[0.08] text-cyan-200 font-mono text-xs border border-white/[0.06]"
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
            className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 inline-flex items-center gap-0.5 font-medium transition-colors"
          >
            <span className="truncate max-w-[220px]">{hostname || part}</span>
            <ExternalLink className="w-3 h-3 inline-block ml-0.5 shrink-0 opacity-75" />
          </a>
        );
      }

      return <span key={idx}>{part}</span>;
    });
  };

  // Helper to parse code blocks, headings, lists, blockquotes vs regular text
  const renderFormattedContent = (content: string) => {
    // Clean and repair unclosed code fences / escaped slashes for assistant responses
    const normalized = isUser ? content : repairUnclosedMarkdown(cleanAndNormalizeResponseContent(content));
    const parts = normalized.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const lines = part.slice(3, -3).trim().split('\n');
        const firstLine = lines[0].trim();
        const hasLang = /^[a-zA-Z0-9_-]+$/.test(firstLine);
        const language = hasLang ? firstLine : 'code';
        const codeContent = hasLang ? lines.slice(1).join('\n') : lines.join('\n');

        const canPreview = ['html', 'svg', 'react', 'tsx', 'jsx', 'markdown', 'md'].includes(language.toLowerCase());

        return (
          <div
            key={index}
            className="my-3 rounded-xl overflow-hidden border border-white/[0.08] bg-[#06080e] shadow-sm"
          >
            {/* Code Block Header */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#0b0f19] border-b border-white/[0.06] text-[11px] text-slate-400 font-mono">
              <span className="uppercase tracking-wider">{language}</span>
              <div className="flex items-center gap-2">
                {canPreview && onOpenArtifact && (
                  <button
                    onClick={() =>
                      onOpenArtifact({
                        id: `art-${Date.now()}`,
                        title: `${language.toUpperCase()} Artifact`,
                        type: language.toLowerCase() === 'html' ? 'html' : language.toLowerCase() === 'svg' ? 'svg' : 'markdown',
                        code: codeContent,
                      })
                    }
                    className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                    title="Open in contextual workspace"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Workspace</span>
                  </button>
                )}
                <button
                  onClick={() => handleCopyCode(codeContent, index)}
                  className="flex items-center gap-1 hover:text-slate-200 transition-colors cursor-pointer"
                  title="Copy code"
                >
                  {copiedCodeIndex === index ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
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

            {/* Code Body */}
            <pre className="p-3 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
              <code>{codeContent}</code>
            </pre>
          </div>
        );
      }

      // Regular text paragraphs with headings, bold, links, lists & quotes support
      return (
        <div key={index} className="space-y-2">
          {part.split('\n\n').map((paragraph, pIdx) => {
            const trimmedPara = paragraph.trim();
            if (!trimmedPara) return null;

            // Horizontal rule
            if (trimmedPara === '---' || trimmedPara === '***' || trimmedPara === '___') {
              return <hr key={pIdx} className="my-2.5 border-white/[0.08]" />;
            }

            // Headings
            if (trimmedPara.startsWith('#### ')) {
              return (
                <h5 key={pIdx} className="text-xs font-semibold uppercase tracking-wider text-slate-300 mt-2.5 mb-1">
                  {renderInlineFormatting(trimmedPara.replace(/^####\s+/, ''))}
                </h5>
              );
            }
            if (trimmedPara.startsWith('### ')) {
              return (
                <h4 key={pIdx} className="text-sm font-semibold text-cyan-200 mt-2.5 mb-1">
                  {renderInlineFormatting(trimmedPara.replace(/^###\s+/, ''))}
                </h4>
              );
            }
            if (trimmedPara.startsWith('## ')) {
              return (
                <h3 key={pIdx} className="text-base font-semibold text-white mt-3 mb-1">
                  {renderInlineFormatting(trimmedPara.replace(/^##\s+/, ''))}
                </h3>
              );
            }
            if (trimmedPara.startsWith('# ')) {
              return (
                <h2 key={pIdx} className="text-lg font-bold text-white mt-3.5 mb-1.5">
                  {renderInlineFormatting(trimmedPara.replace(/^#\s+/, ''))}
                </h2>
              );
            }

            // Blockquote
            if (trimmedPara.startsWith('>')) {
              return (
                <blockquote
                  key={pIdx}
                  className="pl-3 border-l-2 border-slate-600 text-slate-400 italic my-2"
                >
                  {renderInlineFormatting(trimmedPara.replace(/^>\s*/, ''))}
                </blockquote>
              );
            }

            // Bullet list
            if (trimmedPara.startsWith('•') || trimmedPara.startsWith('- ') || trimmedPara.startsWith('* ')) {
              const items = trimmedPara.split('\n');
              return (
                <ul key={pIdx} className="space-y-1 my-1.5 list-disc list-inside text-slate-300">
                  {items.map((it, iIdx) => (
                    <li key={iIdx}>
                      {renderInlineFormatting(it.replace(/^[\s•\-\*]+/, ''))}
                    </li>
                  ))}
                </ul>
              );
            }

            // Numbered list
            if (/^\d+\.\s/.test(trimmedPara)) {
              const items = trimmedPara.split('\n');
              return (
                <ol key={pIdx} className="space-y-1 my-1.5 list-decimal list-inside text-slate-300">
                  {items.map((it, iIdx) => (
                    <li key={iIdx}>
                      {renderInlineFormatting(it.replace(/^\d+\.\s*/, ''))}
                    </li>
                  ))}
                </ol>
              );
            }

            // Standard paragraph
            return (
              <p key={pIdx} className="leading-relaxed">
                {renderInlineFormatting(trimmedPara)}
              </p>
            );
          })}
        </div>
      );
    });
  };

  return (
    <div className={`py-2 px-3 sm:px-4 group ${isUser ? 'flex justify-end' : 'flex justify-start'}`}>
      <div className={`max-w-[90%] sm:max-w-[80%] space-y-1 ${isUser ? 'items-end' : 'items-start'}`}>
        {/* User Message Bubble */}
        {isUser ? (
          <div className="bg-[#1a2234] text-slate-100 px-3.5 py-2.5 rounded-2xl rounded-tr-sm border border-white/[0.08] shadow-sm text-sm">
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          </div>
        ) : message.status === 'error' ? (
          <div className="p-3.5 rounded-2xl bg-rose-950/25 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2.5 shadow-sm max-w-lg">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-rose-300">AI Provider Notice</div>
              <p className="leading-relaxed text-slate-300">{message.content}</p>
            </div>
          </div>
        ) : (
          /* AI Message Content */
          <div className="space-y-1.5 text-slate-200 text-sm">
            {/* Live Web Search Badge if search was performed */}
            {message.metadata?.searchQuery && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-[11px] font-medium text-cyan-300 mb-1">
                <Globe className="w-3 h-3 text-cyan-400 animate-spin-slow" />
                <span>Live Web Search:</span>
                <span className="text-white font-mono truncate max-w-[240px]">
                  "{message.metadata.searchQuery}"
                </span>
              </div>
            )}

            {renderFormattedContent(message.content)}

            {/* Message Actions Bar */}
            <div className="flex items-center gap-1 pt-1 opacity-70 group-hover:opacity-100 transition-opacity text-slate-400">
              {/* Copy */}
              <button
                onClick={handleCopyMessage}
                title="Copy response"
                className="p-1.5 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
                aria-label="Copy message"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              {/* Share */}
              {onShare && (
                <button
                  onClick={() => onShare(message.content)}
                  title="Share response"
                  className="p-1.5 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
                  aria-label="Share message"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Pin */}
              {onPinMessage && (
                <button
                  onClick={() => onPinMessage(message.id)}
                  title="Pin message"
                  className="p-1.5 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
                  aria-label="Pin message"
                >
                  <Pin className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Speak */}
              {onSpeak && (
                <button
                  onClick={() => onSpeak(message.content)}
                  title="Read aloud"
                  className="p-1.5 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
                  aria-label="Read message aloud"
                >
                  <Volume2 className="w-3.5 h-3.5" />
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

              {/* More / Add to Project */}
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

            {/* Sources section directly underneath assistant answer & action buttons */}
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
