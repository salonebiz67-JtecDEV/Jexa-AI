import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar, ActiveNavTab } from '../components/layout/Sidebar';
import { ChatHeader } from '../components/layout/ChatHeader';
import { MessageList } from '../components/chat/MessageList';
import { Composer } from '../components/chat/Composer';
import { ProjectPanel } from '../components/panels/ProjectPanel';
import { ImageLibrary } from '../components/panels/ImageLibrary';
import { RemotePanel } from '../components/panels/RemotePanel';
import { SchedulePanel } from '../components/panels/SchedulePanel';
import { PluginPanel } from '../components/panels/PluginPanel';
import { ArtifactWorkspace, ArtifactData } from '../components/panels/ArtifactWorkspace';
import { LiveVoiceModal } from '../components/voice/LiveVoiceModal';
import { SearchDialog } from '../components/dialogs/SearchDialog';
import { ShareDialog } from '../components/dialogs/ShareDialog';
import { SettingsDialog } from '../components/dialogs/SettingsDialog';
import { PWAInstallBanner } from '../components/common/PWAInstallBanner';
import { OfflineIndicator } from '../components/common/OfflineIndicator';
import { useChat } from '../hooks/useChat';
import { useLiveVoice } from '../hooks/useLiveVoice';
import { AudioPlayer } from '../services/audioPlayer';
import { safeStorage } from '../services/storage';
import { ApiClient } from '../services/api.client';
import { Project, ImageItem, ScheduleItem, PluginItem, RemoteDevice } from '../../shared/types';
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
  return 'chat';
};

export const ChatPage: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveNavTab>(getInitialTab);
  const [currentArtifact, setCurrentArtifact] = useState<ArtifactData | null>(null);

  // Dialogs
  const [searchOpen, setSearchOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(() => {
    return typeof window !== 'undefined' && window.location.pathname.toLowerCase().endsWith('/settings');
  });

  // Chat State
  const {
    conversations,
    currentConversationId,
    messages,
    isLoading,
    isSending,
    selectConversation,
    startNewChat,
    deleteConversation,
    togglePinConversation,
    renameConversation,
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
        else setActiveTab('chat');
        setCurrentArtifact(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToTab = useCallback((tab: ActiveNavTab) => {
    if (tab !== activeTab) {
      const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
      const targetPath = tab === 'chat' ? (base || '/') : `${base}/${tab}`;
      window.history.pushState({ tab }, '', targetPath);
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
      if (window.history.state?.tab) {
        window.history.back();
      } else {
        const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
        window.history.pushState({ tab: 'chat' }, '', base || '/');
        setActiveTab('chat');
      }
    }
  }, [activeTab, currentArtifact]);

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

  // Schedule State
  const [schedules, setSchedules] = useState<ScheduleItem[]>([
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
  ]);

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

  // Real AI Voice synthesis using selected Voice Provider (Gemini Neural TTS or ElevenLabs)
  const handleSpeak = async (text: string) => {
    if (AudioPlayer.isPlaying) {
      AudioPlayer.stop();
      return;
    }

    const activeVoiceProvider =
      (safeStorage.getItem('jexa_voice_provider') as any) || 'gemini';
    const activeVoiceName =
      safeStorage.getItem('jexa_voice_name') || 'aura';

    const cleanText = text
      .replace(/[*#`_\[\]()]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .trim();

    if (!cleanText) return;

    try {
      const voiceRes = await ApiClient.requestVoiceSynthesis({
        text: cleanText,
        voiceId: activeVoiceName,
        provider: activeVoiceProvider,
      });

      if (voiceRes?.audioUrl) {
        await AudioPlayer.playUrl(voiceRes.audioUrl);
      }
    } catch (err: any) {
      console.warn('[ChatPage] Real AI voice playback error:', err.message);
    }
  };

  const handleRegenerate = () => {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMessage) {
      sendMessage(lastUserMessage.content);
    }
  };

  const handleShareMessage = () => {
    setShareOpen(true);
  };

  const handleClearHistory = () => {
    conversations.forEach((c) => deleteConversation(c.id));
    setSettingsOpen(false);
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
    <div className="flex h-screen h-[100dvh] w-screen overflow-hidden bg-[#07090e] text-slate-100 font-sans antialiased">
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
      <div className="flex-1 flex flex-col h-full min-w-0 relative overflow-hidden">
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

            {/* Subtle PWA In-App Install Banner (Dismissible, only active if installable) */}
            <PWAInstallBanner />

            {/* Main Conversation Feed */}
            <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
              <MessageList
                messages={messages}
                isSending={isSending}
                projects={projects}
                onSelectPrompt={(prompt) => sendMessage(prompt)}
                onSpeak={handleSpeak}
                onRegenerate={handleRegenerate}
                onShare={handleShareMessage}
                onPinMessage={() => {}}
                onAddToProject={() => {}}
                onOpenArtifact={(art) => setCurrentArtifact(art)}
              />
            </main>

            {/* ONE Primary Compact Floating Composer */}
            <footer className="shrink-0 bg-gradient-to-t from-[#07090e] via-[#07090e]/80 to-transparent">
              <Composer
                onSendMessage={(text) => sendMessage(text)}
                onOpenLive={liveVoice.startLiveMode}
                liveStatus={liveVoice.isOpen ? liveVoice.status : 'idle'}
                disabled={isSending}
              />
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

      {/* Real-time Network Connectivity Indicator */}
      <OfflineIndicator />
    </div>
  );
};
