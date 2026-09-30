import { useState, useEffect, useCallback, useRef } from 'react';
import { ApiClient } from '../services/api.client';
import { ChatMessage, Conversation } from '../../shared/types';

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load conversations on mount
  const refreshConversations = useCallback(async () => {
    try {
      const list = await ApiClient.getConversations();
      setConversations(list);
      if (list.length > 0 && !currentConversationId) {
        setCurrentConversationId(list[0].id);
      }
    } catch (err: any) {
      console.error('[useChat] Failed to load conversations:', err);
      setError(err.message);
    }
  }, [currentConversationId]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  // Load messages whenever currentConversationId changes
  useEffect(() => {
    if (!currentConversationId) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    ApiClient.getMessages(currentConversationId)
      .then((msgs) => {
        if (isMounted) {
          setMessages(msgs);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('[useChat] Error fetching messages:', err);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentConversationId]);

  const refreshMessages = useCallback(async () => {
    if (!currentConversationId) return;
    try {
      const msgs = await ApiClient.getMessages(currentConversationId);
      setMessages(msgs);
    } catch (err) {
      console.error('[useChat] Error refreshing messages:', err);
    }
  }, [currentConversationId]);

  const selectConversation = useCallback((id: string) => {
    if (typeof id === 'string') {
      setCurrentConversationId(id);
    }
  }, []);

  const startNewChat = useCallback(async (personaId?: string) => {
    try {
      const cleanPersona = typeof personaId === 'string' ? personaId : undefined;
      const newConv = await ApiClient.createConversation('New Conversation', cleanPersona);
      setConversations((prev) => [newConv, ...prev]);
      setCurrentConversationId(newConv.id);
      setMessages([]);
      return newConv.id;
    } catch (err: any) {
      console.error('[useChat] Failed to create new conversation:', err);
      return null;
    }
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      if (typeof id !== 'string') return;
      try {
        await ApiClient.deleteConversation(id);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (currentConversationId === id) {
          const remaining = conversations.filter((c) => c.id !== id);
          if (remaining.length > 0) {
            setCurrentConversationId(remaining[0].id);
          } else {
            setCurrentConversationId(null);
            setMessages([]);
          }
        }
      } catch (err: any) {
        console.error('[useChat] Failed to delete conversation:', err);
      }
    },
    [conversations, currentConversationId]
  );

  const sendMessage = useCallback(
    async (text: string, personaId?: string) => {
      if (typeof text !== 'string' || !text.trim() || isSending) return;

      const trimmed = text.trim();
      const cleanPersona = typeof personaId === 'string' ? personaId : undefined;
      const tempId = `temp-${Date.now()}`;

      // Optimistic user message
      const optimisticUserMsg: ChatMessage = {
        id: tempId,
        conversationId: currentConversationId || 'pending',
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
        status: 'complete',
      };

      setMessages((prev) => [...prev, optimisticUserMsg]);
      setIsSending(true);
      setError(null);

      try {
        const response = await ApiClient.sendMessage({
          conversationId: currentConversationId || undefined,
          message: trimmed,
          personaId: cleanPersona,
        });

        // Set conversation ID if new conversation was formed
        if (response.isNewConversation) {
          setCurrentConversationId(response.conversationId);
          await refreshConversations();
        }

        // Add received assistant message
        setMessages((prev) => [...prev, response.message]);
      } catch (err: any) {
        console.error('[useChat] Send message failed:', err);
        setError(err.message || 'Failed to send message.');
        // Append error assistant message
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            conversationId: currentConversationId || '',
            role: 'assistant',
            content: `I encountered an issue connecting to the provider: ${err.message}. Please check your connection and configuration.`,
            createdAt: new Date().toISOString(),
            status: 'error',
          },
        ]);
      } finally {
        setIsSending(false);
      }
    },
    [currentConversationId, isSending, refreshConversations]
  );

  return {
    conversations,
    currentConversationId,
    messages,
    isLoading,
    isSending,
    error,
    selectConversation,
    startNewChat,
    deleteConversation,
    sendMessage,
    refreshConversations,
    refreshMessages,
  };
}
