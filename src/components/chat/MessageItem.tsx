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
} from 'lucide-react';
import { ChatMessage, Project } from '../../../shared/types';

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

  const isUser = message.role === 'user';

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

  // Helper to parse markdown links [label](url), raw URLs, and bold text into clickable interactive elements
  const renderInlineFormatting = (text: string) => {
    const tokenRegex = /(\[[^\]]+\]\(https?:\/\/[^\s\)]+\)|\*\*[^*]+\*\*|https?:\/\/[^\s<>"]+)/g;
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

      // Bold: **text**
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        const boldText = part.slice(2, -2);
        return (
          <strong key={idx} className="font-semibold text-white">
            {boldText}
          </strong>
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

  // Helper to parse code blocks vs regular text
  const renderFormattedContent = (content: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);

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

      // Regular text paragraphs with bold, links, lists & quotes support
      return (
        <div key={index} className="space-y-2">
          {part.split('\n\n').map((paragraph, pIdx) => {
            if (!paragraph.trim()) return null;

            // Blockquote
            if (paragraph.startsWith('>')) {
              return (
                <blockquote
                  key={pIdx}
                  className="pl-3 border-l-2 border-slate-600 text-slate-400 italic my-2"
                >
                  {renderInlineFormatting(paragraph.replace(/^>\s*/, ''))}
                </blockquote>
              );
            }

            // Bullet list
            if (paragraph.startsWith('•') || paragraph.startsWith('- ') || paragraph.startsWith('* ')) {
              const items = paragraph.split('\n');
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
            if (/^\d+\.\s/.test(paragraph)) {
              const items = paragraph.split('\n');
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
                {renderInlineFormatting(paragraph)}
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

            {/* Dedicated Sources & Citations Section */}
            {message.metadata?.sources && message.metadata.sources.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/[0.08] space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-1.5 font-medium text-slate-300">
                    <Globe className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Sources & Citations</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                      {message.metadata.sources.length}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {message.metadata.sources.map((src, idx) => {
                    let hostname = '';
                    try {
                      hostname = new URL(src.url).hostname.replace(/^www\./, '');
                    } catch {
                      hostname = 'source';
                    }
                    return (
                      <a
                        key={idx}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col p-2.5 rounded-xl bg-[#090d16] hover:bg-[#0f172a] border border-white/[0.06] hover:border-cyan-500/30 transition-all text-xs group/card shadow-sm cursor-pointer"
                        title={src.title}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[10px] font-mono text-cyan-400/90 bg-cyan-950/50 px-1.5 py-0.5 rounded border border-cyan-800/30 truncate max-w-[150px]">
                            {hostname}
                          </span>
                          <ExternalLink className="w-3 h-3 text-slate-500 group-hover/card:text-cyan-400 transition-colors shrink-0" />
                        </div>
                        <span className="font-medium text-slate-200 group-hover/card:text-white line-clamp-1">
                          {src.title}
                        </span>
                        {src.content && (
                          <span className="text-[11px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                            {src.content}
                          </span>
                        )}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

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
          </div>
        )}
      </div>
    </div>
  );
};
