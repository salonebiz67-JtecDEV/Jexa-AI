import React, { useEffect, useRef } from 'react';
import { MessageItem } from './MessageItem';
import { TypingIndicator } from './TypingIndicator';
import { ConversationStarters } from './ConversationStarters';
import { ChatMessage, Project } from '../../../shared/types';
import { ArtifactData } from '../panels/ArtifactWorkspace';

interface MessageListProps {
  messages: ChatMessage[];
  isSending: boolean;
  projects?: Project[];
  onSelectPrompt: (prompt: string) => void;
  onSpeak: (text: string) => void;
  onRegenerate: () => void;
  onShare: (text: string) => void;
  onPinMessage: (id: string) => void;
  onAddToProject: (text: string, projectId: string) => void;
  onOpenArtifact?: (artifact: ArtifactData) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isSending,
  projects = [],
  onSelectPrompt,
  onSpeak,
  onRegenerate,
  onShare,
  onPinMessage,
  onAddToProject,
  onOpenArtifact,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto flex items-center justify-center p-4">
        <ConversationStarters onSelectPrompt={onSelectPrompt} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-4 pb-12 space-y-1 max-w-3xl w-full mx-auto">
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          projects={projects}
          onSpeak={onSpeak}
          onRegenerate={onRegenerate}
          onShare={onShare}
          onPinMessage={onPinMessage}
          onAddToProject={onAddToProject}
          onOpenArtifact={onOpenArtifact}
        />
      ))}

      {isSending && <TypingIndicator />}

      <div ref={bottomRef} className="h-4" />
    </div>
  );
};
