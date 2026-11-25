import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { App as CapacitorApp } from '@capacitor/app';
import { Sidebar, ActiveNavTab } from '../components/layout/Sidebar';
import { ChatHeader } from '../components/layout/ChatHeader';
import { MessageList } from '../components/chat/MessageList';
import { Composer } from '../components/chat/Composer';
import { ProjectPanel } from '../components/panels/ProjectPanel';
import { ImageLibrary } from '../components/panels/ImageLibrary';
import { RemotePanel } from '../components/panels/RemotePanel';
import { SchedulePanel } from '../components/panels/SchedulePanel';
import { PluginPanel } from '../components/panels/PluginPanel';
import { VariablesPanel } from '../components/panels/VariablesPanel';
import { ToolsPanel } from '../components/panels/ToolsPanel';
import { ArtifactWorkspace, ArtifactData } from '../components/panels/ArtifactWorkspace';
import { LiveVoiceModal } from '../components/voice/LiveVoiceModal';
import { SearchDialog } from '../components/dialogs/SearchDialog';
import { ShareDialog } from '../components/dialogs/ShareDialog';
import { SettingsDialog } from '../components/dialogs/SettingsDialog';
import { PWAInstallBanner } from '../components/common/PWAInstallBanner';
import { ServerUnreachableBanner } from '../components/common/ServerUnreachableBanner';
import { OfflineIndicator } from '../components/common/OfflineIndicator';
import { ToastContainer } from '../components/common/ToastContainer';
import { useChat } from '../hooks/useChat';
import { useLiveVoice } from '../hooks/useLiveVoice';
import { AudioPlayer, AudioPlayerSnapshot } from '../services/audioPlayer';
import { safeStorage } from '../services/storage';
import { localChatDb } from '../services/localChatDb';
import { showToast } from '../services/toast';
import { ApiClient, subscribeServerReachability } from '../services/api.client';
import {
  registerNotificationTapListener,
  syncScheduleReminders,
} from '../services/notifications';
import { isNative } from '../utils/platform';
import {
  Project,
  ImageItem,
  ScheduleItem,
  PluginItem,
  RemoteDevice,
  ChatMessage,
  DEFAULT_VOICE_MODEL,
} from '../../shared/types';
import cyberLandscapeImg from '../assets/images/image_cyber_landscape_1790783143139.jpg';
import abstractNeuralImg from '../assets/images/image_abstract_neural_1790783155459.jpg';
import creativeWorkspaceImg from '../assets/images/image_creative_workspace_1790783168148.jpg';
import geometricSculptureImg from '../assets/images/image_geometric_sculpture_1790783179914.jpg';

const getInitialTab = (): ActiveNavTab => {
  if (typeof window === 'undefined') return 'chat';
  const path = window.location.pathname.toLowerCase();
  if (path.endsWith('/projects') || path.endsWith('/projects/')) return 'projects';
  if (path.endsWith('/images') || path.endsWith('/images/')) return 'images';
  if (path.endsWith('/remote') || path.endsWith('/remote/')) return 'remote';
  if (path.endsWith('/schedule') || path.endsWith('/schedule/')) return 'schedule';
  if (path.endsWith('/plugins') || path.endsWith('/plugins/')) return 'plugins';
  if (path.endsWith('/variables') || path.endsWith('/variables/')) return 'variables';
  if (path.endsWith('/tools') || path.endsWith('/tools/')) return 'tools';
  return 'chat';
};

export const ChatPage: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveNavTab>(getInitialTab);
  const [currentArtifact, setCurrentArtifact] = useState<ArtifactData | null>(null);
  const [composerHeight, setComposerHeight] = useState<number>(68);
  const composerFooterRef = useRef<HTMLElement>(null);

  // Dialogs
  const [searchOpen, setSearchOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(() => {
    return typeof window !== 'undefined' && window.location.pathname.toLowerCase().endsWith('/settings');
  });
  const [serverUnreachable, setServerUnreachable] = useState(false);

  // Voice engine error & fallback notification banner
  const [voiceNotification, setVoiceNotification] = useState<{
    message: string;
    type: 'error' | 'warning' | 'info';
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);

  // Per-message audio playback state
  const [audioState, setAudioState] = useState<AudioPlayerSnapshot>(() => AudioPlayer.getSnapshot());

  useEffect(() => {
    return AudioPlayer.subscribe(setAudioState);
  }, []);

  // Measure live composer height so MessageList always pads bottom by exact composer height
  useEffect(() => {
    if (activeTab !== 'chat' || currentArtifact) return;
    const el = composerFooterRef.current;
    if (!el) return;

    const updateHeight = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) setComposerHeight(h);
    };
    updateHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateHeight);
      observer.observe(el);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [activeTab, currentArtifact, voiceNotification]);

  // Chat State
  const {
    conversations,
    currentConversationId,
    messages,
    isSending,
    regeneratingMessageId,
    activityStatus,
    activityDetails,
    retrySearch,
    regenerateMessage,
    selectConversation,
    startNewChat,
    deleteConversation,
    togglePinConversation,
    renameConversation,
    clearAllConversations,
    sendMessage,
    refreshMessages,
  } = useChat();

  const activeConversation =
    conversations.find((c) => c.id === currentConversationId) || null;

  // Browser Popstate Navigation support
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.tab) {
        setActiveTab(e.state.tab);
        setCurrentArtifact(null);
      } else {
        const path = window.location.pathname.toLowerCase();
        if (path.endsWith('/projects')) setActiveTab('projects');
        else if (path.endsWith('/images')) setActiveTab('images');
        else if (path.endsWith('/remote')) setActiveTab('remote');
        else if (path.endsWith('/schedule')) setActiveTab('schedule');
        else if (path.endsWith('/plugins')) setActiveTab('plugins');
        else if (path.endsWith('/variables')) setActiveTab('variables');
        else if (path.endsWith('/tools')) setActiveTab('tools');
        else setActiveTab('chat');
        setCurrentArtifact(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToTab = useCallback((tab: ActiveNavTab) => {
    if (tab !== activeTab) {
      if (!isNative()) {
        const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
        const targetPath = tab === 'chat' ? (base || '/') : `${base}/${tab}`;
        window.history.pushState({ tab }, '', targetPath);
      }
      setActiveTab(tab);
      setCurrentArtifact(null);
    }
  }, [activeTab]);

  const handleBackToChat = useCallback(() => {
    if (currentArtifact) {
      setCurrentArtifact(null);
      return;
    }
    if (activeTab !== 'chat') {
      if (!isNative() && window.history.state?.tab) {
        window.history.back();
      } else {
        if (!isNative()) {
          const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
          window.history.pushState({ tab: 'chat' }, '', base || '/');
        }
        setActiveTab('chat');
      }
    }
  }, [activeTab, currentArtifact]);

  // Subscribe to reachability status only when a backend request actually fails (no automatic health/wake-up pings)
  useEffect(() => {
    const unsub = subscribeServerReachability(setServerUnreachable);
    return () => {
      unsub();
    };
  }, []);

  const handleRetryServer = useCallback(async () => {
    const ok = await ApiClient.checkServerReachability();
    if (ok) {
      showToast('Connected to server', 'success');
    } else {
      showToast('Cannot reach server', 'error');
    }
    return ok;
  }, []);

  // Open the target conversation when user taps a background reply notification
  useEffect(() => {
    return registerNotificationTapListener((conversationId) => {
      selectConversation(conversationId);
      setActiveTab('chat');
      setCurrentArtifact(null);
      setSidebarOpen(false);
      setSearchOpen(false);
      setShareOpen(false);
      setSettingsOpen(false);
    });
  }, [selectConversation]);

  // Projects State
  const [projects, setProjects] = useState<Project[]>([
    {
      id: 'proj-1',
      name: 'Mobile App Architecture',
      description: 'System design, UI blueprints, and API integration contracts.',
      conversationIds: ['conv-welcome'],
      fileCount: 4,
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: 'proj-2',
      name: 'Creative Content Strategy',
      description: 'Brand launch campaigns, editorial guides, and copy directions.',
      conversationIds: [],
      fileCount: 2,
      updatedAt: new Date(Date.now() - 172800000).toISOString(),
    },
  ]);

  // Image Library State
  const [images, setImages] = useState<ImageItem[]>([
    {
      id: 'img-1',
      url: cyberLandscapeImg,
      prompt: 'Minimalist architectural pavilion under twilight sky',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      aspectRatio: '16:9',
    },
    {
      id: 'img-2',
      url: abstractNeuralImg,
      prompt: 'Minimalist luminous glass sphere with emerald refraction',
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      aspectRatio: '1:1',
    },
    {
      id: 'img-3',
      url: creativeWorkspaceImg,
      prompt: 'Designer desk workspace with notebook and morning illumination',
      createdAt: new Date(Date.now() - 14400000).toISOString(),
      aspectRatio: '4:3',
    },
    {
      id: 'img-4',
      url: geometricSculptureImg,
      prompt: 'Modern matte black geometric monolithic sculpture on raw dark stone',
      createdAt: new Date(Date.now() - 28800000).toISOString(),
      aspectRatio: '3:4',
    },
  ]);

  // Remote Devices State
  const [devices] = useState<RemoteDevice[]>([
    {
      id: 'dev-1',
      name: 'Pixel 9 Pro (Active)',
      type: 'mobile',
      status: 'active',
      lastSeen: 'Just now',
      location: 'Local WiFi',
    },
    {
      id: 'dev-2',
      name: 'MacBook Pro Studio',
      type: 'desktop',
      status: 'synced',
      lastSeen: '2 min ago',
      location: 'Primary Workspace',
    },
    {
      id: 'dev-3',
      name: 'iPad Pro Canvas',
      type: 'tablet',
      status: 'standby',
      lastSeen: '1 hour ago',
    },
  ]);

  // Schedule State (persisted locally + synced with native/web reminders)
  const [schedules, setSchedules] = useState<ScheduleItem[]>(() => {
    const defaultSchedules: ScheduleItem[] = [
      {
        id: 'sch-1',
        title: 'Morning Intelligence Brief',
        frequency: 'Daily',
        time: '08:00 AM',
        active: true,
        nextRun: 'Tomorrow at 8:00 AM',
      },
      {
        id: 'sch-2',
        title: 'Weekly Sprint & Project Recap',
        frequency: 'Weekly (Monday)',
        time: '09:00 AM',
        active: true,
        nextRun: 'Monday at 9:00 AM',
      },
    ];
    try {
      const saved = safeStorage.getItem('jexa_schedules_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore parse errors
    }
    return defaultSchedules;
  });

  useEffect(() => {
    try {
      safeStorage.setItem('jexa_schedules_v1', JSON.stringify(schedules));
    } catch {
      // ignore storage errors
    }
    void syncScheduleReminders(schedules);
  }, [schedules]);

  // Plugins State
  const [plugins, setPlugins] = useState<PluginItem[]>([
    {
      id: 'plg-web',
      name: 'Real-time Web Search',
      description: 'Browses current web information, articles, and documentation.',
      category: 'search',
      icon: 'globe',
      enabled: true,
    },
    {
      id: 'plg-code',
      name: 'Code Interpreter & Execution',
      description: 'Analyzes technical logic, formats clean code, and solves algorithmic tasks.',
      category: 'coding',
      icon: 'code',
      enabled: true,
    },
    {
      id: 'plg-img',
      name: 'Visual Asset Generator',
      description: 'Generates high-definition imagery and concept art directly in chat.',
      category: 'generation',
      icon: 'image',
      enabled: true,
    },
    {
      id: 'plg-data',
      name: 'Data & Document Synthesis',
      description: 'Parses spreadsheets, PDF notes, and structured metrics.',
      category: 'productivity',
      icon: 'chart',
      enabled: true,
    },
    {
      id: 'plg-audio',
      name: 'Spoken Audio Engine',
      description: 'Natural text-to-speech audio synthesis and live listening.',
      category: 'audio',
      icon: 'mic',
      enabled: true,
    },
  ]);

  // Live Voice Mode hook with real-time audio, speech recognition, and conversation sync
  const liveVoice = useLiveVoice({
    conversationId: currentConversationId,
    onVoiceReplyReceived: () => {
      refreshMessages();
    },
    onUserSpoke: () => {
      refreshMessages();
    },
  });

  // Android Hardware Back Button:
  // 1) Close any open modal, sheet, dialog, or sidebar drawer
  // 2) Return from Settings, Tools, or other sub-screens to main chat
  // 3) Minimize the app on the main chat screen
  const backStateRef = useRef({
    liveVoiceOpen: false,
    closeLiveMode: liveVoice.closeLiveMode,
    settingsOpen: false,
    searchOpen: false,
    shareOpen: false,
    sidebarOpen: false,
    hasArtifact: false,
    activeTab: 'chat' as ActiveNavTab,
  });

  backStateRef.current = {
    liveVoiceOpen: liveVoice.isOpen,
    closeLiveMode: liveVoice.closeLiveMode,
    settingsOpen,
    searchOpen,
    shareOpen,
    sidebarOpen,
    hasArtifact: Boolean(currentArtifact),
    activeTab,
  };

  useEffect(() => {
    if (!isNative()) return;

    let disposed = false;
    let listenerHandle: { remove: () => Promise<void> } | null = null;

    void CapacitorApp.addListener('backButton', () => {
      const hardwareBackEvent = new CustomEvent('jexa:hardware-back', { cancelable: true });
      window.dispatchEvent(hardwareBackEvent);
      if (hardwareBackEvent.defaultPrevented) {
        return;
      }

      const st = backStateRef.current;
      if (st.liveVoiceOpen) {
        st.closeLiveMode();
        return;
      }
      if (st.settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      if (st.searchOpen) {
        setSearchOpen(false);
        return;
      }
      if (st.shareOpen) {
        setShareOpen(false);
        return;
      }
      if (st.sidebarOpen) {
        setSidebarOpen(false);
        return;
      }
      if (st.hasArtifact) {
        setCurrentArtifact(null);
        return;
      }
      if (st.activeTab !== 'chat') {
        setActiveTab('chat');
        return;
      }

      void CapacitorApp.minimizeApp();
    })
      .then((handle) => {
        if (disposed) {
          void handle.remove();
        } else {
          listenerHandle = handle;
        }
      })
      .catch(() => {
        // Ignore if plugin unavailable
      });

    return () => {
      disposed = true;
      if (listenerHandle) {
        void listenerHandle.remove();
      }
    };
  }, []);


  // Add Conversation to Project
  const handleAddConversationToProject = (projectId: string, conversationId: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id === projectId && !p.conversationIds.includes(conversationId)) {
          return {
            ...p,
            conversationIds: [...p.conversationIds, conversationId],
            updatedAt: new Date().toISOString(),
          };
        }
        return p;
      })
    );
  };

  // Project management
  const handleCreateProject = (name: string, description: string) => {
    const newProj: Project = {
      id: `proj-${Date.now()}`,
      name,
      description,
      conversationIds: currentConversationId ? [currentConversationId] : [],
      fileCount: 0,
      updatedAt: new Date().toISOString(),
    };
    setProjects((prev) => [newProj, ...prev]);
  };

  const handleDeleteProject = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  // Image management
  const handleDeleteImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleAddImageToProject = (imageId: string, projectId: string) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, fileCount: p.fileCount + 1 } : p))
    );
  };

  // Schedule management
  const handleToggleSchedule = (id: string) => {
    setSchedules((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s))
    );
  };

  const handleAddSchedule = (title: string, frequency: string, time: string) => {
    const newSch: ScheduleItem = {
      id: `sch-${Date.now()}`,
      title,
      frequency,
      time,
      active: true,
      nextRun: `${frequency} at ${time}`,
    };
    setSchedules((prev) => [newSch, ...prev]);
  };

  const handleDeleteSchedule = (id: string) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  };

  // Plugin toggles
  const handleTogglePlugin = (id: string) => {
    setPlugins((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    );
  };

  // Real AI Voice synthesis using Gemini Neural TTS + IndexedDB audio cache
  const handleSpeak = useCallback(
    async (message: ChatMessage) => {
      const currentSnap = AudioPlayer.getSnapshot();
      if (currentSnap.activeMessageId === message.id) {
        if (currentSnap.status === 'playing') {
          AudioPlayer.pause();
          return;
        }
        if (currentSnap.status === 'paused') {
          try {
            await AudioPlayer.resume();
          } catch (err: any) {
            showToast(err?.message || 'Could not resume audio.', 'error');
          }
          return;
        }
        if (currentSnap.status === 'loading') {
          return;
        }
      }

      const activeVoiceModel = safeStorage.getItem('jexa_voice_model') || DEFAULT_VOICE_MODEL;
      const activeVoiceName = safeStorage.getItem('jexa_voice_name') || 'aura';

      const cleanText = (message.content || '')
        .replace(/[*#`_\[\]()]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .trim();

      if (!cleanText) {
        showToast('No readable text in this message.', 'info');
        return;
      }

      AudioPlayer.clearError(message.id);
      setVoiceNotification(null);

      try {
        // 1. Check IndexedDB audio cache keyed by messageId, voice, model, and text
        const cached = await localChatDb.getCachedAudio(
          message.id,
          activeVoiceName,
          activeVoiceModel,
          cleanText
        );

        if (cached?.blob && cached.blob.size > 0) {
          await AudioPlayer.playBlob(cached.blob, message.id);
          return;
        }

        // 2. Fetch fresh audio from Gemini TTS and save in IndexedDB
        AudioPlayer.setLoading(message.id);

        const synth = await ApiClient.synthesizeVoiceBlob({
          text: cleanText,
          voiceId: activeVoiceName,
          provider: 'gemini',
          model: activeVoiceModel,
        });

        await localChatDb.saveCachedAudio({
          messageId: message.id,
          conversationId: message.conversationId || currentConversationId || '',
          voiceId: activeVoiceName,
          model: synth.model || activeVoiceModel,
          text: cleanText,
          blob: synth.blob,
          mimeType: synth.mimeType,
        });

        // Only start playing if user hasn't cancelled or switched to another message while loading
        const latestSnap = AudioPlayer.getSnapshot();
        if (latestSnap.activeMessageId !== message.id || latestSnap.status !== 'loading') {
          return;
        }

        await AudioPlayer.playBlob(synth.blob, message.id);
      } catch (err: any) {
        console.warn('[ChatPage] Gemini voice playback error:', err?.message || err);
        const errMsg = err?.message || '';
        const is429 =
          err?.status === 429 ||
          err?.statusCode === 429 ||
          err?.code === 'QUOTA_EXHAUSTED' ||
          errMsg.includes('429') ||
          errMsg.includes('quota') ||
          errMsg.includes('RESOURCE_EXHAUSTED');

        const cleanMessage = is429
          ? 'Gemini Voice quota reached. Try switching the voice model in Settings or try again shortly.'
          : err?.status === 401 || err?.status === 403
          ? 'Gemini authentication failed. Check GEMINI_API_KEY.'
          : err?.status === 404
          ? 'The selected Gemini voice model was not found.'
          : err?.status === 503
          ? 'Gemini Voice is temporarily unavailable.'
          : errMsg || 'Voice synthesis failed.';

        AudioPlayer.setError(message.id, cleanMessage);
        showToast(cleanMessage, 'error');
      }
    },
    [currentConversationId]
  );

  const handleRegenerate = useCallback(
    (messageId?: string) => {
      void regenerateMessage(messageId);
    },
    [regenerateMessage]
  );

  const handleShareMessage = useCallback(
    async (text: string) => {
      const shareUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/chat/${currentConversationId || 'share'}`
          : 'https://jexa.ai';

      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: activeConversation?.title || 'JEXA Response',
            text: text.slice(0, 600),
            url: shareUrl,
          });
          return;
        } catch (err: any) {
          if (err?.name === 'AbortError') return;
        }
      }

      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link copied', 'success');
      } catch {
        setShareOpen(true);
        showToast('Could not copy link automatically.', 'error');
      }
    },
    [activeConversation?.title, currentConversationId]
  );

  const handleClearHistory = async () => {
    await clearAllConversations();
    setSettingsOpen(false);
    showToast('Chat history cleared', 'info');
  };

  const handleTogglePin = useCallback(
    (id?: string) => {
      const targetId = id || currentConversationId;
      if (!targetId) return;
      const conv = conversations.find((c) => c.id === targetId);
      const isPinned = Boolean(conv?.pinned);
      togglePinConversation(targetId, !isPinned);
    },
    [currentConversationId, conversations, togglePinConversation]
  );

  const handleRenameConversation = useCallback(
    (newTitle: string, id?: string) => {
      const targetId = id || currentConversationId;
      if (!targetId || !newTitle.trim()) return;
      renameConversation(targetId, newTitle.trim());
    },
    [currentConversationId, renameConversation]
  );

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden overscroll-none bg-[#07090e] text-slate-100 font-sans antialiased">
      {/* ONE Clean Navigation Sidebar (Collapsible on Desktop, Slide Drawer on Mobile) */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeTab={activeTab}
        onSelectTab={navigateToTab}
        conversations={conversations}
        activeConversationId={currentConversationId}
        pinnedIds={conversations.filter((c) => c.pinned).map((c) => c.id)}
        onSelectConversation={(id) => {
          selectConversation(id);
          setActiveTab('chat');
          setCurrentArtifact(null);
        }}
        onNewChat={() => {
          startNewChat();
          setActiveTab('chat');
          setCurrentArtifact(null);
        }}
        onDeleteConversation={deleteConversation}
        onTogglePin={(id) => handleTogglePin(id)}
        onRenameConversation={(id, newTitle) => handleRenameConversation(newTitle, id)}
        onShareConversation={() => setShareOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Main Viewport Container */}
      <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 relative overflow-hidden">
        {/* Contextual Artifact Workspace (Only active when viewing an artifact) */}
        {currentArtifact ? (
          <ArtifactWorkspace
            artifact={currentArtifact}
            onBack={handleBackToChat}
            onShare={() => setShareOpen(true)}
          />
        ) : activeTab === 'chat' ? (
          /* PRIMARY CHAT EXPERIENCE */
          <>
            {/* Minimal Header: [☰]  JEXA  [⋮] */}
            <ChatHeader
              onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
              onOpenShare={() => setShareOpen(true)}
              onNewChat={() => startNewChat()}
              activeConversation={activeConversation}
              isPinned={Boolean(activeConversation?.pinned)}
              onTogglePin={() => handleTogglePin()}
              onRenameConversation={(newTitle) => handleRenameConversation(newTitle)}
              onDeleteConversation={() => {
                if (currentConversationId) {
                  deleteConversation(currentConversationId);
                }
              }}
            />

            {/* Subtle PWA In-App Install Banner (Dismissible, automatically hidden in native mode) */}
            <PWAInstallBanner />

            {/* Clear unreachable server banner with Retry button */}
            <ServerUnreachableBanner
              visible={serverUnreachable}
              onRetry={handleRetryServer}
            />

            {/* Main Conversation Feed (only this area scrolls; bottom padding tracks composer height) */}
            <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
              <MessageList
                conversationId={currentConversationId}
                composerHeight={composerHeight}
                messages={messages}
                isSending={isSending}
                regeneratingMessageId={regeneratingMessageId}
                audioState={audioState}
                activityStatus={activityStatus}
                activityDetails={activityDetails}
                projects={projects}
                onSelectPrompt={(prompt) => sendMessage(prompt)}
                onSpeak={handleSpeak}
                onRegenerate={handleRegenerate}
                onShare={handleShareMessage}
                onPinMessage={() => {}}
                onAddToProject={() => {}}
                onOpenArtifact={(art) => setCurrentArtifact(art)}
                onRetrySearch={retrySearch}
              />
            </main>

            {/* Fixed Bottom Composer Dock (grows upward cleanly without scrolling the page) */}
            <footer
              ref={composerFooterRef}
              className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none"
            >
              <div className="pointer-events-auto">
                {/* Voice Engine Fallback & Notification Banner */}
                {voiceNotification && (
                  <div className="max-w-3xl mx-auto px-4 sm:px-6 mb-2">
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between gap-3 text-xs sm:text-sm text-amber-200 backdrop-blur-md shadow-lg animate-fadeIn">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="truncate">{voiceNotification.message}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {voiceNotification.actionLabel && voiceNotification.onAction && (
                          <button
                            onClick={voiceNotification.onAction}
                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            {voiceNotification.actionLabel}
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={() => setVoiceNotification(null)}
                          className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                          title="Dismiss"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <Composer
                  onSendMessage={(text, attachments) => sendMessage(text, undefined, attachments)}
                  onOpenLive={liveVoice.startLiveMode}
                  liveStatus={liveVoice.isOpen ? liveVoice.status : 'idle'}
                  disabled={isSending}
                />
              </div>
            </footer>
          </>
        ) : activeTab === 'projects' ? (
          /* Projects Screen with Clear Back Button */
          <ProjectPanel
            onBack={handleBackToChat}
            projects={projects}
            conversations={conversations}
            activeConversationId={currentConversationId}
            onCreateProject={handleCreateProject}
            onDeleteProject={handleDeleteProject}
            onSelectConversation={(id) => {
              selectConversation(id);
              setActiveTab('chat');
            }}
            onAddConversationToProject={handleAddConversationToProject}
          />
        ) : activeTab === 'images' ? (
          /* Image Library Screen with Clear Back Button */
          <ImageLibrary
            onBack={handleBackToChat}
            images={images}
            projects={projects}
            onDeleteImage={handleDeleteImage}
            onAddImageToProject={handleAddImageToProject}
          />
        ) : activeTab === 'remote' ? (
          /* Remote Sync Screen with Clear Back Button */
          <RemotePanel onBack={handleBackToChat} devices={devices} />
        ) : activeTab === 'schedule' ? (
          /* Schedule Screen with Clear Back Button */
          <SchedulePanel
            onBack={handleBackToChat}
            schedules={schedules}
            onToggleSchedule={handleToggleSchedule}
            onAddSchedule={handleAddSchedule}
            onDeleteSchedule={handleDeleteSchedule}
          />
        ) : activeTab === 'plugins' ? (
          /* Plugins Screen with Clear Back Button */
          <PluginPanel
            onBack={handleBackToChat}
            plugins={plugins}
            onTogglePlugin={handleTogglePlugin}
          />
        ) : activeTab === 'variables' ? (
          /* Local Device Variables Dashboard */
          <VariablesPanel onBack={handleBackToChat} />
        ) : activeTab === 'tools' ? (
          /* Tools & AI Token Tracker Screen with Clear Back Button */
          <ToolsPanel onBack={handleBackToChat} />
        ) : null}
      </div>

      {/* Universal Search Dialog (Cmd+K) */}
      <SearchDialog
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        conversations={conversations}
        projects={projects}
        images={images}
        onSelectConversation={(id) => {
          selectConversation(id);
          setActiveTab('chat');
        }}
        onSelectProject={() => {
          setActiveTab('projects');
        }}
      />

      {/* Share Conversation Dialog */}
      <ShareDialog
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        conversation={activeConversation}
        messages={messages}
      />

      {/* Clean Consumer Settings Dialog with Back Button */}
      <SettingsDialog
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onClearHistory={handleClearHistory}
        liveDebugStats={liveVoice.debugStats}
        onOpenTools={() => {
          setSettingsOpen(false);
          setActiveTab('tools');
        }}
        onOpenVariables={() => {
          setSettingsOpen(false);
          setActiveTab('variables');
        }}
      />

      {/* Live Voice Experience */}
      <LiveVoiceModal
        isOpen={liveVoice.isOpen}
        onClose={liveVoice.closeLiveMode}
        status={liveVoice.status}
        volume={liveVoice.volume}
        frequencyData={liveVoice.frequencyData}
        aiSpeakingPower={liveVoice.aiSpeakingPower}
        liveTranscript={liveVoice.liveTranscript}
        lastAiResponse={liveVoice.lastAiResponse}
        errorMessage={liveVoice.errorMessage}
        isMuted={liveVoice.isMuted}
        onToggleMute={liveVoice.toggleMute}
        onInterrupt={liveVoice.interruptAiSpeech}
        onRetry={liveVoice.retryConnection}
        debugStats={liveVoice.debugStats}
      />

      {/* Global Toast Notifications */}
      <ToastContainer />

      {/* Real-time Network Connectivity Indicator */}
      <OfflineIndicator />
    </div>
  );
};
