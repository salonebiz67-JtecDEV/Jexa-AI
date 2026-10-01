import React, { useState, useRef, useEffect } from 'react';
import { Menu, MoreVertical, Plus, Edit2, Pin, PinOff, Share2, Trash2, Check } from 'lucide-react';
import { Conversation } from '../../../shared/types';

interface ChatHeaderProps {
  onToggleSidebar: () => void;
  onOpenShare: () => void;
  onNewChat: () => void;
  activeConversation: Conversation | null;
  isPinned: boolean;
  onTogglePin: () => void;
  onRenameConversation: (title: string) => void;
  onDeleteConversation: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  onToggleSidebar,
  onOpenShare,
  onNewChat,
  activeConversation,
  isPinned,
  onTogglePin,
  onRenameConversation,
  onDeleteConversation,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(activeConversation?.title || 'JEXA');
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  const handleTitleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (titleValue.trim()) {
      onRenameConversation(titleValue.trim());
    }
    setIsEditingTitle(false);
  };

  const displayTitle = activeConversation?.title || 'JEXA';

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between min-h-[56px] px-3 sm:px-4 bg-[#080b12]/95 backdrop-blur-md border-b border-white/[0.06] shrink-0 pt-safe">
      {/* Left: Hamburger Menu Button */}
      <button
        onClick={onToggleSidebar}
        aria-label="Open sidebar"
        className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-white rounded-lg active:bg-white/[0.04] transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Center: Clean App / Conversation Title */}
      <div className="flex-1 text-center min-w-0 px-2">
        {isEditingTitle ? (
          <form onSubmit={handleTitleSubmit} className="inline-flex items-center gap-1.5 max-w-xs">
            <input
              type="text"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={() => setIsEditingTitle(false)}
              autoFocus
              className="bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-lg text-xs text-white focus:outline-none w-full text-center"
            />
            <button type="submit" className="p-1 text-emerald-400">
              <Check className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          <button
            onClick={() => {
              setTitleValue(displayTitle);
              setIsEditingTitle(true);
            }}
            className="text-sm font-semibold text-slate-200 hover:text-white truncate max-w-[200px] sm:max-w-md inline-block transition-colors"
            title="Click to rename"
          >
            {displayTitle}
          </button>
        )}
      </div>

      {/* Right: Single More Button [⋮] */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Conversation options"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-white rounded-lg active:bg-white/[0.04] transition-colors"
        >
          <MoreVertical className="w-5 h-5" />
        </button>

        {/* Dropdown Menu */}
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-[#0f1422] border border-white/[0.08] shadow-2xl py-1.5 z-50 text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-100">
            <button
              onClick={() => {
                setMenuOpen(false);
                onNewChat();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.06] text-left transition-colors"
            >
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>New chat</span>
            </button>

            <button
              onClick={() => {
                setMenuOpen(false);
                setTitleValue(displayTitle);
                setIsEditingTitle(true);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.06] text-left transition-colors"
            >
              <Edit2 className="w-4 h-4 text-slate-400" />
              <span>Rename</span>
            </button>

            <button
              onClick={() => {
                setMenuOpen(false);
                onTogglePin();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.06] text-left transition-colors"
            >
              {isPinned ? (
                <>
                  <PinOff className="w-4 h-4 text-slate-400" />
                  <span>Unpin chat</span>
                </>
              ) : (
                <>
                  <Pin className="w-4 h-4 text-slate-400" />
                  <span>Pin chat</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                setMenuOpen(false);
                onOpenShare();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.06] text-left transition-colors"
            >
              <Share2 className="w-4 h-4 text-slate-400" />
              <span>Share chat</span>
            </button>

            <div className="my-1 border-t border-white/[0.06]" />

            <button
              onClick={() => {
                setMenuOpen(false);
                onDeleteConversation();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-rose-500/10 text-rose-400 text-left transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete chat</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
