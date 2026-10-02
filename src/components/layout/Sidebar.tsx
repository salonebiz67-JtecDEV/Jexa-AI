import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  FolderKanban,
  Image as ImageIcon,
  Radio,
  CalendarClock,
  Puzzle,
  Pin,
  PinOff,
  Trash2,
  X,
  Settings,
  Sparkles,
  MoreVertical,
  Edit2,
  Share2,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { Conversation } from '../../../shared/types';

export type ActiveNavTab = 'chat' | 'projects' | 'images' | 'remote' | 'schedule' | 'plugins';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: ActiveNavTab;
  onSelectTab: (tab: ActiveNavTab) => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  pinnedIds?: string[];
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onTogglePin: (id: string) => void;
  onRenameConversation?: (id: string, newTitle: string) => void;
  onShareConversation?: (conversation: Conversation) => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  activeTab,
  onSelectTab,
  conversations,
  activeConversationId,
  pinnedIds = [],
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onTogglePin,
  onRenameConversation,
  onShareConversation,
  onOpenSearch,
  onOpenSettings,
}) => {
  // Context Menu State (Long-press on mobile or 3-dots on desktop)
  const [menuConversation, setMenuConversation] = useState<Conversation | null>(null);

  // Rename Dialog State
  const [renameConversationTarget, setRenameConversationTarget] = useState<Conversation | null>(null);
  const [renameTitleInput, setRenameTitleInput] = useState('');

  // Delete Confirmation State
  const [deleteConfirmationTarget, setDeleteConfirmationTarget] = useState<Conversation | null>(null);

  // Toast Feedback State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Long-press detection timer ref
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressTriggeredRef = useRef(false);

  // Helper to test if a conversation is pinned
  const isConvPinned = useCallback(
    (conv: Conversation) => Boolean(conv.pinned || pinnedIds.includes(conv.id)),
    [pinnedIds]
  );

  const pinnedConversations = conversations.filter(isConvPinned);
  const recentConversations = conversations.filter((c) => !isConvPinned(c));

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2200);
  };

  // Touch Long-Press handlers
  const handleTouchStart = (conv: Conversation) => {
    isLongPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(20);
        } catch {}
      }
      setMenuConversation(conv);
    }, 450);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchMove = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Conversation click wrapper (suppresses click if long-press just fired)
  const handleConversationClick = (id: string) => {
    if (isLongPressTriggeredRef.current) {
      isLongPressTriggeredRef.current = false;
      return;
    }
    onSelectConversation(id);
    onSelectTab('chat');
    onClose();
  };

  // Action: Share
  const handleShare = async (conv: Conversation) => {
    setMenuConversation(null);
    if (onShareConversation) {
      onShareConversation(conv);
      return;
    }

    const shareUrl = typeof window !== 'undefined'
      ? `${window.location.origin}${(import.meta.env.BASE_URL || '/').replace(/\/+$/, '')}/chat/${conv.id}`
      : '';

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: conv.title,
          text: `Conversation with JEXA: "${conv.title}"`,
          url: shareUrl,
        });
        showToast('Shared successfully');
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          navigator.clipboard.writeText(shareUrl);
          showToast('Link copied to clipboard');
        }
      }
    } else {
      navigator.clipboard.writeText(shareUrl);
      showToast('Link copied to clipboard');
    }
  };

  // Action: Open Rename
  const handleOpenRename = (conv: Conversation) => {
    setMenuConversation(null);
    setRenameConversationTarget(conv);
    setRenameTitleInput(conv.title);
  };

  // Action: Submit Rename
  const handleConfirmRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (renameConversationTarget && renameTitleInput.trim()) {
      if (onRenameConversation) {
        onRenameConversation(renameConversationTarget.id, renameTitleInput.trim());
      }
      showToast('Conversation renamed');
    }
    setRenameConversationTarget(null);
  };

  // Action: Open Delete Confirmation
  const handleOpenDeleteConfirm = (conv: Conversation) => {
    setMenuConversation(null);
    setDeleteConfirmationTarget(conv);
  };

  // Action: Submit Delete
  const handleConfirmDelete = () => {
    if (deleteConfirmationTarget) {
      onDeleteConversation(deleteConfirmationTarget.id);
      showToast('Conversation deleted');
    }
    setDeleteConfirmationTarget(null);
  };

  const secondaryNavItems = [
    { id: 'projects', label: 'Projects', icon: FolderKanban },
    { id: 'images', label: 'Image Library', icon: ImageIcon },
    { id: 'remote', label: 'Remote', icon: Radio },
    { id: 'schedule', label: 'Schedule', icon: CalendarClock },
    { id: 'plugins', label: 'Plugins', icon: Puzzle },
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Drawer */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 sm:w-80 lg:w-72 xl:w-80 bg-[#090d16] border-r border-white/[0.06] flex flex-col transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 pt-safe pb-safe pl-safe ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top: Brand Header & New Chat */}
        <div className="p-3.5 space-y-2 border-b border-white/[0.06]">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <span className="font-display font-bold text-sm tracking-tight text-white select-none">
                JEXA
              </span>
            </div>

            <button
              onClick={onClose}
              className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white"
              aria-label="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* + New Chat Action */}
          <button
            onClick={() => {
              onNewChat();
              onSelectTab('chat');
              onClose();
            }}
            className="w-full flex items-center justify-between py-2 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-100 font-medium text-xs transition-all border border-white/[0.06] active:scale-[0.98]"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>New chat</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">⌘N</span>
          </button>

          {/* Search Trigger */}
          <button
            onClick={() => {
              onOpenSearch();
              onClose();
            }}
            className="w-full flex items-center justify-between py-1.5 px-3 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors text-xs"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-slate-500" />
              <span>Search</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">⌘K</span>
          </button>
        </div>

        {/* Middle Scrollable Section: Conversations */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {/* Pinned Section */}
          {pinnedConversations.length > 0 && (
            <div className="space-y-0.5">
              <div className="px-2.5 pb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Pin className="w-3 h-3 text-emerald-400" />
                <span>Pinned</span>
              </div>
              {pinnedConversations.map((c) => {
                const isActive = activeTab === 'chat' && activeConversationId === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => handleConversationClick(c.id)}
                    onTouchStart={() => handleTouchStart(c)}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchMove}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenuConversation(c);
                    }}
                    className={`group relative flex items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors cursor-pointer select-none ${
                      isActive
                        ? 'bg-white/[0.08] text-white font-medium'
                        : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate pr-2">
                      <Pin className="w-3 h-3 text-emerald-400/80 shrink-0" />
                      <span className="truncate">{c.title}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Desktop action menu trigger */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuConversation(c);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-white transition-opacity rounded"
                        title="Conversation options"
                        aria-label="Conversation options"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent Conversations */}
          <div className="space-y-0.5">
            <div className="px-2.5 pb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Recent
            </div>

            {recentConversations.length === 0 ? (
              <div className="px-2.5 py-3 text-center text-xs text-slate-500">
                No recent conversations
              </div>
            ) : (
              recentConversations.map((conv) => {
                const isActive = activeTab === 'chat' && activeConversationId === conv.id;
                return (
                  <div
                    key={conv.id}
                    onClick={() => handleConversationClick(conv.id)}
                    onTouchStart={() => handleTouchStart(conv)}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchMove}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenuConversation(conv);
                    }}
                    className={`group relative flex items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors cursor-pointer select-none ${
                      isActive
                        ? 'bg-white/[0.08] text-white font-medium'
                        : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                    }`}
                  >
                    <span className="truncate pr-2">{conv.title}</span>

                    <div className="flex items-center gap-1">
                      {/* Context Menu Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuConversation(conv);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-white transition-opacity rounded"
                        title="Conversation options"
                        aria-label="Conversation options"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Secondary Navigation Section (Projects, Images, Remote, Schedule, Plugins) */}
        <div className="px-2 py-2 border-t border-white/[0.06] space-y-0.5">
          {secondaryNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id as ActiveNavTab);
                  onClose();
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-white/[0.08] text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Bottom Settings Trigger */}
        <div className="p-3 border-t border-white/[0.06] bg-[#07090e]">
          <button
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors text-xs font-medium"
          >
            <Settings className="w-4 h-4 text-slate-500" />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* Mobile Long-Press / Context Action Menu Sheet                             */}
      {/* ========================================================================= */}
      {menuConversation && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
          onClick={() => setMenuConversation(null)}
        >
          <div
            className="w-full sm:max-w-sm bg-[#0d121f] border border-white/[0.08] rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 space-y-2 pb-safe animate-in fade-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: Conversation Title */}
            <div className="flex items-center justify-between px-2 pb-2 border-b border-white/[0.06]">
              <div className="font-semibold text-xs text-white truncate max-w-[240px]">
                {menuConversation.title}
              </div>
              <button
                onClick={() => setMenuConversation(null)}
                className="p-1 text-slate-400 hover:text-white"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Menu Actions: Pin, Rename, Share, Delete */}
            <div className="space-y-1 pt-1">
              {/* 1. Pin / Unpin */}
              <button
                onClick={() => {
                  onTogglePin(menuConversation.id);
                  setMenuConversation(null);
                  showToast(isConvPinned(menuConversation) ? 'Unpinned' : 'Pinned');
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-200 hover:bg-white/[0.06] hover:text-white transition-colors"
              >
                {isConvPinned(menuConversation) ? (
                  <>
                    <PinOff className="w-4 h-4 text-slate-400" />
                    <span>Unpin conversation</span>
                  </>
                ) : (
                  <>
                    <Pin className="w-4 h-4 text-emerald-400" />
                    <span>Pin conversation</span>
                  </>
                )}
              </button>

              {/* 2. Rename */}
              <button
                onClick={() => handleOpenRename(menuConversation)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-200 hover:bg-white/[0.06] hover:text-white transition-colors"
              >
                <Edit2 className="w-4 h-4 text-cyan-400" />
                <span>Rename</span>
              </button>

              {/* 3. Share */}
              <button
                onClick={() => handleShare(menuConversation)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-200 hover:bg-white/[0.06] hover:text-white transition-colors"
              >
                <Share2 className="w-4 h-4 text-blue-400" />
                <span>Share conversation</span>
              </button>

              {/* 4. Delete */}
              <button
                onClick={() => handleOpenDeleteConfirm(menuConversation)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>Delete conversation</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Rename Dialog                                                             */}
      {/* ========================================================================= */}
      {renameConversationTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={() => setRenameConversationTarget(null)}
        >
          <div
            className="w-full max-w-sm bg-[#0d121f] border border-white/[0.08] rounded-2xl shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Rename conversation</h3>
              <button
                onClick={() => setRenameConversationTarget(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmRename} className="space-y-3">
              <input
                type="text"
                value={renameTitleInput}
                onChange={(e) => setRenameTitleInput(e.target.value)}
                autoFocus
                placeholder="Conversation name"
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-xs text-white focus:outline-none focus:border-emerald-500"
              />

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setRenameConversationTarget(null)}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!renameTitleInput.trim()}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Delete Confirmation Modal                                                 */}
      {/* ========================================================================= */}
      {deleteConfirmationTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={() => setDeleteConfirmationTarget(null)}
        >
          <div
            className="w-full max-w-sm bg-[#0d121f] border border-white/[0.08] rounded-2xl shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Delete conversation?</h3>
                <p className="text-[11px] text-slate-400">
                  This will permanently remove this conversation and its messages.
                </p>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-black/30 border border-white/[0.04] text-xs text-slate-300 truncate">
              "{deleteConfirmationTarget.title}"
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteConfirmationTarget(null)}
                className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0f1422] border border-emerald-500/40 text-emerald-300 text-xs shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          <Check className="w-3.5 h-3.5" />
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );
};
