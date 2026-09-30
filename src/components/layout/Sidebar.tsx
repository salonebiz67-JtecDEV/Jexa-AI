import React from 'react';
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
  pinnedIds: string[];
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onTogglePin: (id: string) => void;
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
  pinnedIds,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onTogglePin,
  onOpenSearch,
  onOpenSettings,
}) => {
  const pinnedConversations = conversations.filter((c) => pinnedIds.includes(c.id));
  const recentConversations = conversations.filter((c) => !pinnedIds.includes(c.id));

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
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-[#090d16] border-r border-white/[0.06] flex flex-col transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
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
                    onClick={() => {
                      onSelectConversation(c.id);
                      onSelectTab('chat');
                      onClose();
                    }}
                    className={`group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-white/[0.08] text-white font-medium'
                        : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                    }`}
                  >
                    <span className="truncate pr-2">{c.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePin(c.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-slate-300 transition-opacity"
                      title="Unpin"
                      aria-label="Unpin conversation"
                    >
                      <PinOff className="w-3 h-3" />
                    </button>
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
                    onClick={() => {
                      onSelectConversation(conv.id);
                      onSelectTab('chat');
                      onClose();
                    }}
                    className={`group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-white/[0.08] text-white font-medium'
                        : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                    }`}
                  >
                    <span className="truncate pr-2">{conv.title}</span>

                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePin(conv.id);
                        }}
                        className="p-0.5 text-slate-500 hover:text-slate-300"
                        title="Pin conversation"
                        aria-label="Pin conversation"
                      >
                        <Pin className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteConversation(conv.id);
                        }}
                        className="p-0.5 text-slate-500 hover:text-rose-400"
                        title="Delete conversation"
                        aria-label="Delete conversation"
                      >
                        <Trash2 className="w-3 h-3" />
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
    </>
  );
};
