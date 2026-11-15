import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { ArrowDown } from 'lucide-react';
import { MessageItem } from './MessageItem';
import { TypingIndicator } from './TypingIndicator';
import { ConversationStarters } from './ConversationStarters';
import { ChatMessage, Project, AIActivityStatus } from '../../../shared/types';
import { ArtifactData } from '../panels/ArtifactWorkspace';
import { AudioPlayerSnapshot } from '../../services/audioPlayer';

interface MessageListProps {
  conversationId?: string | null;
  composerHeight?: number;
  messages: ChatMessage[];
  isSending: boolean;
  regeneratingMessageId?: string | null;
  audioState: AudioPlayerSnapshot;
  activityStatus?: AIActivityStatus | null;
  activityDetails?: {
    query?: string;
    sourcesCount?: number;
    error?: string;
  } | null;
  projects?: Project[];
  onSelectPrompt: (prompt: string) => void;
  onSpeak: (message: ChatMessage) => void;
  onRegenerate: (messageId?: string) => void;
  onShare: (text: string, message?: ChatMessage) => void;
  onPinMessage: (id: string) => void;
  onAddToProject: (text: string, projectId: string) => void;
  onOpenArtifact?: (artifact: ArtifactData) => void;
  onRetrySearch?: () => void;
}

const BOTTOM_SNAP_THRESHOLD_PX = 72;

export const MessageList: React.FC<MessageListProps> = ({
  conversationId,
  composerHeight = 68,
  messages,
  isSending,
  regeneratingMessageId,
  audioState,
  activityStatus,
  activityDetails,
  projects = [],
  onSelectPrompt,
  onSpeak,
  onRegenerate,
  onShare,
  onPinMessage,
  onAddToProject,
  onOpenArtifact,
  onRetrySearch,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const prevConversationIdRef = useRef<string | null | undefined>(conversationId);
  const prevLastMessageIdRef = useRef<string | undefined>(messages[messages.length - 1]?.id);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = containerRef.current;
    if (!el) return;
    if (behavior === 'smooth') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom <= BOTTOM_SNAP_THRESHOLD_PX;
    isAtBottomRef.current = atBottom;
    setShowJumpToLatest(!atBottom);
  }, []);

  // Reset to bottom when switching conversations
  useLayoutEffect(() => {
    if (prevConversationIdRef.current !== conversationId) {
      prevConversationIdRef.current = conversationId;
      prevLastMessageIdRef.current = messages[messages.length - 1]?.id;
      isAtBottomRef.current = true;
      setShowJumpToLatest(false);
      scrollToBottom('auto');
    }
  }, [conversationId, messages, scrollToBottom]);

  // Auto-scroll when pinned to bottom OR when user sends a new message; preserve scroll place if scrolled up
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    const lastMsgId = lastMsg?.id;
    const isNewUserMessage =
      Boolean(lastMsgId) &&
      lastMsgId !== prevLastMessageIdRef.current &&
      lastMsg?.role === 'user';

    prevLastMessageIdRef.current = lastMsgId;

    if (isNewUserMessage) {
      isAtBottomRef.current = true;
      setShowJumpToLatest(false);
      scrollToBottom('smooth');
      return;
    }

    if (isAtBottomRef.current) {
      scrollToBottom('auto');
    }
  }, [messages, isSending, activityStatus, composerHeight, scrollToBottom]);

  const effectiveBottomPadding = Math.max(composerHeight, 64) + 12;

  if (messages.length === 0) {
    return (
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-none flex items-center justify-center p-4 pl-safe pr-safe"
        style={{ paddingBottom: `${effectiveBottomPadding}px` }}
      >
        <ConversationStarters onSelectPrompt={onSelectPrompt} />
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Only this feed scrolls; overscroll-contain prevents pulling the app shell */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-none pt-3 px-1.5 sm:px-3 pl-safe pr-safe space-y-1.5 max-w-3xl lg:max-w-4xl w-full mx-auto"
        style={{ paddingBottom: `${effectiveBottomPadding}px` }}
      >
        {messages.map((message) => {
          const isThisAudioActive = audioState.activeMessageId === message.id;
          const messageAudioStatus = isThisAudioActive ? audioState.status : 'idle';
          const messageVoiceError =
            audioState.errorMessageId === message.id ? audioState.error : null;

          return (
            <MessageItem
              key={message.id}
              message={message}
              projects={projects}
              isSending={isSending}
              isRegenerating={isSending && regeneratingMessageId === message.id}
              audioStatus={messageAudioStatus}
              voiceError={messageVoiceError}
              onSpeak={onSpeak}
              onRegenerate={onRegenerate}
              onShare={onShare}
              onPinMessage={onPinMessage}
              onAddToProject={onAddToProject}
              onOpenArtifact={onOpenArtifact}
            />
          );
        })}

        {(isSending || activityStatus === 'This is taking too long') && (
          <TypingIndicator
            status={activityStatus}
            details={activityDetails}
            onRetry={onRetrySearch}
          />
        )}
      </div>

      {/* Compact "Jump to latest" button when user scrolls up */}
      {showJumpToLatest && (
        <div
          className="pointer-events-none absolute inset-x-0 flex justify-center z-20 px-4"
          style={{ bottom: `${Math.max(composerHeight, 64) + 10}px` }}
        >
          <button
            type="button"
            onClick={() => {
              isAtBottomRef.current = true;
              setShowJumpToLatest(false);
              scrollToBottom('smooth');
            }}
            className="pointer-events-auto min-h-[40px] px-3.5 py-2 rounded-full bg-[#111726]/95 hover:bg-[#192136] border border-white/[0.14] text-xs font-medium text-slate-100 shadow-xl backdrop-blur-md flex items-center gap-1.5 transition-all duration-150 active:scale-95 cursor-pointer whitespace-nowrap"
            aria-label="Jump to latest"
          >
            <ArrowDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Jump to latest</span>
          </button>
        </div>
      )}
    </div>
  );
};
