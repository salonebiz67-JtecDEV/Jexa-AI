import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowDown } from 'lucide-react';
import { MessageItem } from './MessageItem';
import { TypingIndicator } from './TypingIndicator';
import { ConversationStarters } from './ConversationStarters';
import { ChatMessage, Project, AIActivityStatus } from '../../../shared/types';
import { ArtifactData } from '../panels/ArtifactWorkspace';
import { AudioPlayerSnapshot } from '../../services/audioPlayer';

interface MessageListProps {
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

export const MessageList: React.FC<MessageListProps> = ({
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Smoothly scroll to the bottom when messages or activity status changes
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages, isSending, activityStatus, scrollToBottom]);

  // Monitor scroll position to show/hide "Scroll to bottom" floating button
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isUp = scrollHeight - scrollTop - clientHeight > 180;
    setShowScrollBottom(isUp);
  };

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none flex items-center justify-center p-4">
        <ConversationStarters onSelectPrompt={onSelectPrompt} />
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col overflow-x-hidden">
      {/* Scrollable Message Feed with hidden scrollbars and zero horizontal overflow */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none py-4 px-1.5 sm:px-3 pb-36 sm:pb-40 space-y-1.5 max-w-3xl lg:max-w-4xl w-full mx-auto scroll-smooth"
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

        <div ref={bottomRef} className="h-4" />
      </div>

      {/* Floating Scroll-to-Bottom Button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className="absolute right-4 sm:right-8 bottom-4 z-20 min-h-[44px] min-w-[44px] rounded-full bg-[#111726]/90 border border-white/[0.12] text-slate-300 hover:text-white shadow-xl backdrop-blur-md flex items-center justify-center transition-all duration-150 hover:scale-105 active:scale-95 cursor-pointer"
          title="Scroll to bottom"
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
