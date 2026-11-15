import React, { useState } from 'react';
import { X, Copy, Check, FileText, Globe, ArrowLeft } from 'lucide-react';
import { Conversation, ChatMessage } from '../../../shared/types';
import { showToast } from '../../services/toast';

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: Conversation | null;
  messages: ChatMessage[];
}

export const ShareDialog: React.FC<ShareDialogProps> = ({
  isOpen,
  onClose,
  conversation,
  messages,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);

  if (!isOpen) return null;

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/chat/${conversation?.id || 'share'}`
      : `https://jexa.ai/chat/${conversation?.id || 'share'}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      showToast('Link copied', 'success');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      showToast('Failed to copy link to clipboard.', 'error');
    }
  };

  const handleCopyMarkdown = async () => {
    const md = messages
      .map((m) => {
        let text = `### ${m.role === 'user' ? 'User' : 'JEXA'}\n\n${m.content}\n`;
        if (m.metadata?.sources && m.metadata.sources.length > 0) {
          text +=
            `\n**Sources:**\n` +
            m.metadata.sources
              .map((s) => `- [${s.title}](${s.url}) (${s.domain || 'source'})`)
              .join('\n') +
            `\n`;
        }
        return text;
      })
      .join('\n---\n\n');

    try {
      await navigator.clipboard.writeText(md);
      setCopiedMarkdown(true);
      showToast('Copied', 'success');
      setTimeout(() => setCopiedMarkdown(false), 2000);
    } catch {
      showToast('Failed to copy markdown to clipboard.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-safe pb-safe pl-safe pr-safe bg-black/70 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-[#0e121d] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-full">
        {/* Header with Back button */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="min-h-[44px] flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <div className="h-4 w-px bg-white/[0.08]" />
            <h2 className="text-sm font-semibold text-white">Share Conversation</h2>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-white rounded-lg active:scale-95 transition-all cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 text-xs text-slate-300">
          <div className="space-y-1">
            <h3 className="font-semibold text-sm text-white truncate">
              {conversation?.title || 'Active Conversation'}
            </h3>
            <p className="text-slate-400 text-xs">
              Anyone with this link can view this conversation snapshot.
            </p>
          </div>

          {/* Share Link Field */}
          <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800 min-w-0">
            <Globe className="w-4 h-4 text-slate-400 ml-1 shrink-0" />
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 min-w-0 bg-transparent text-slate-200 text-xs focus:outline-none truncate"
            />
            <button
              onClick={handleCopyLink}
              className="min-h-[44px] px-3.5 rounded-lg bg-emerald-500 text-slate-950 font-medium text-xs hover:bg-emerald-400 active:scale-95 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          {/* Export Options */}
          <div className="space-y-2 pt-2 border-t border-slate-800/60">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Export Options
            </div>
            <button
              onClick={handleCopyMarkdown}
              className="w-full min-h-[44px] flex items-center justify-between p-3 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/50 hover:bg-slate-800/40 active:scale-[0.99] text-left transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-slate-400" />
                <div>
                  <div className="font-medium text-slate-200">Copy as Markdown</div>
                  <div className="text-[11px] text-slate-500">
                    Formatted text suitable for notes or docs
                  </div>
                </div>
              </div>
              {copiedMarkdown ? (
                <span className="text-emerald-400 font-medium text-xs flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Done
                </span>
              ) : (
                <Copy className="w-4 h-4 text-slate-400" />
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-800 bg-[#0a0e17]">
          <button
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white active:scale-95 transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
