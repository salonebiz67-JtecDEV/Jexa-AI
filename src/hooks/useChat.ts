import { useState, useEffect, useCallback, useRef } from 'react';
import { ApiClient } from '../services/api.client';
import { ChatMessage, Conversation } from '../../shared/types';
import { safeStorage } from '../services/storage';

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

  const togglePinConversation = useCallback(
    async (id: string, pinned: boolean) => {
      if (typeof id !== 'string') return;
      try {
        const updated = await ApiClient.togglePinConversation(id, pinned);
        setConversations((prev) => {
          const next = prev.map((c) => (c.id === id ? { ...c, pinned: updated.pinned } : c));
          return next.sort((a, b) => {
            if (Boolean(b.pinned) !== Boolean(a.pinned)) {
              return b.pinned ? 1 : -1;
            }
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          });
        });
      } catch (err: any) {
        console.error('[useChat] Failed to toggle pin:', err);
      }
    },
    []
  );

  const renameConversation = useCallback(
    async (id: string, newTitle: string) => {
      if (typeof id !== 'string' || !newTitle.trim()) return;
      try {
        const updated = await ApiClient.renameConversation(id, newTitle.trim());
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c))
        );
      } catch (err: any) {
        console.error('[useChat] Failed to rename conversation:', err);
      }
    },
    []
  );

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
        const savedTextProvider = safeStorage.getItem('jexa_text_provider') as any;

        const response = await ApiClient.sendMessage({
          conversationId: currentConversationId || undefined,
          message: trimmed,
          personaId: cleanPersona,
          textProvider: savedTextProvider || undefined,
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

        let userHelpMessage = `I encountered an issue connecting to the AI provider: ${err.message}.`;
        if (err.code === 'MODEL_NOT_FOUND') {
          userHelpMessage = `The configured model was not found (${err.message}). You can switch to Google Gemini in Settings or configure a supported model in GROQ_TEXT_MODEL on Render.`;
        } else if (err.code === 'AUTHENTICATION_ERROR') {
          userHelpMessage = `Authentication failed for the selected provider. Please verify your API key in Render environment settings or switch to an active provider in Settings.`;
        } else if (err.code === 'MISSING_CREDENTIALS') {
          userHelpMessage = `The selected provider is missing its API key. Please configure the required API key in your Render environment variables or switch to an active provider in Settings.`;
        }

        // Append non-crashing friendly error message in the chat
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            conversationId: currentConversationId || '',
            role: 'assistant',
            content: userHelpMessage,
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
    togglePinConversation,
    renameConversation,
    sendMessage,
    refreshConversations,
    refreshMessages,
  };
}
