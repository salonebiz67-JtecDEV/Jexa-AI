import { useState, useEffect, useCallback } from 'react';
import { ApiClient } from '../services/api.client';
import {
  ChatMessage,
  ClientHistoryMessage,
  Conversation,
  AIActivityStatus,
  WebSearchResultItem,
} from '../../shared/types';
import {
  getAboutMe,
  getBehaviorInstructions,
  safeStorage,
} from '../services/storage';
import { deriveConversationTitle, localChatDb } from '../services/localChatDb';
import { AudioPlayer } from '../services/audioPlayer';
import { showToast } from '../services/toast';
import { notifyReplyReceived } from '../services/notifications';

const ACTIVE_CONV_STORAGE_KEY = 'jexa_active_conv_id';

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);
  const [activityStatus, setActivityStatus] = useState<AIActivityStatus | null>(null);
  const [activityDetails, setActivityDetails] = useState<{
    query?: string;
    sourcesCount?: number;
    error?: string;
    sources?: WebSearchResultItem[];
    searchStatus?: any;
    searchTrigger?: any;
    provider?: string;
    model?: string;
    fallbackUsed?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load conversations from local IndexedDB on mount
  const refreshConversations = useCallback(async (preferredId?: string) => {
    try {
      const list = await localChatDb.listConversations();
      setConversations(list);
      const targetId = preferredId || safeStorage.getItem(ACTIVE_CONV_STORAGE_KEY);
      if (targetId && list.some((c) => c.id === targetId)) {
        setCurrentConversationId(targetId);
      } else if (list.length > 0) {
        setCurrentConversationId(list[0].id);
        safeStorage.setItem(ACTIVE_CONV_STORAGE_KEY, list[0].id);
      } else {
        setCurrentConversationId(null);
        setMessages([]);
      }
    } catch (err: any) {
      console.error('[useChat] Failed to load conversations from IndexedDB:', err);
      const msg = 'Unable to load local chats from device storage.';
      setError(msg);
      showToast(msg, 'error');
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  // Load messages from local IndexedDB whenever currentConversationId changes
  useEffect(() => {
    if (!currentConversationId) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    localChatDb
      .getMessages(currentConversationId)
      .then((msgs) => {
        if (isMounted) {
          setMessages(msgs);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('[useChat] Error loading local messages:', err);
          setIsLoading(false);
          showToast('Unable to load messages for this chat.', 'error');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentConversationId]);

  const refreshMessages = useCallback(async () => {
    if (!currentConversationId) return;
    try {
      const msgs = await localChatDb.getMessages(currentConversationId);
      setMessages(msgs);
    } catch (err) {
      console.error('[useChat] Error refreshing messages:', err);
    }
  }, [currentConversationId]);

  const selectConversation = useCallback((id: string) => {
    if (typeof id === 'string') {
      AudioPlayer.stop();
      setCurrentConversationId(id);
      safeStorage.setItem(ACTIVE_CONV_STORAGE_KEY, id);
    }
  }, []);

  const startNewChat = useCallback(async (personaId?: string) => {
    try {
      AudioPlayer.stop();
      const cleanPersona = typeof personaId === 'string' ? personaId : undefined;
      const newConv = await localChatDb.createConversation('New Conversation', cleanPersona);
      setConversations((prev) => [newConv, ...prev]);
      setCurrentConversationId(newConv.id);
      safeStorage.setItem(ACTIVE_CONV_STORAGE_KEY, newConv.id);
      setMessages([]);
      return newConv.id;
    } catch (err: any) {
      console.error('[useChat] Failed to create new conversation:', err);
      const msg = "Couldn't create chat. Please try again.";
      setError(msg);
      showToast(msg, 'error');
      return null;
    }
  }, []);

  const togglePinConversation = useCallback(async (id: string, pinned: boolean) => {
    if (typeof id !== 'string') return;
    try {
      const updated = await localChatDb.togglePinConversation(id, pinned);
      if (!updated) return;
      const list = await localChatDb.listConversations();
      setConversations(list);
    } catch (err: any) {
      console.error('[useChat] Failed to toggle pin:', err);
      const msg = "Couldn't save pin state. Please try again.";
      setError(msg);
      showToast(msg, 'error');
    }
  }, []);

  const renameConversation = useCallback(async (id: string, newTitle: string) => {
    if (typeof id !== 'string' || !newTitle.trim()) return;
    try {
      const updated = await localChatDb.renameConversation(id, newTitle.trim(), true);
      if (!updated) return;
      const list = await localChatDb.listConversations();
      setConversations(list);
    } catch (err: any) {
      console.error('[useChat] Failed to rename conversation:', err);
      const msg = "Couldn't rename chat. Please try again.";
      setError(msg);
      showToast(msg, 'error');
    }
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      if (typeof id !== 'string') return;
      try {
        if (currentConversationId === id) {
          AudioPlayer.stop();
        }
        await localChatDb.deleteConversation(id);
        const remaining = await localChatDb.listConversations();
        setConversations(remaining);
        if (currentConversationId === id) {
          if (remaining.length > 0) {
            setCurrentConversationId(remaining[0].id);
            safeStorage.setItem(ACTIVE_CONV_STORAGE_KEY, remaining[0].id);
          } else {
            setCurrentConversationId(null);
            safeStorage.removeItem(ACTIVE_CONV_STORAGE_KEY);
            setMessages([]);
          }
        }
      } catch (err: any) {
        console.error('[useChat] Failed to delete conversation:', err);
        const msg = "Couldn't delete chat. Please try again.";
        setError(msg);
        showToast(msg, 'error');
      }
    },
    [currentConversationId]
  );

  const clearAllConversations = useCallback(async () => {
    try {
      AudioPlayer.stop();
      await localChatDb.clearAllConversations();
      setConversations([]);
      setCurrentConversationId(null);
      setMessages([]);
      safeStorage.removeItem(ACTIVE_CONV_STORAGE_KEY);
    } catch (err: any) {
      console.error('[useChat] Failed to clear conversations:', err);
      const msg = "Couldn't clear local chat history.";
      setError(msg);
      showToast(msg, 'error');
    }
  }, []);

  const executeSend = useCallback(
    async (
      finalMessage: string,
      options?: {
        personaId?: string;
        skipUserSave?: boolean;
        baseMessages?: ChatMessage[];
        regenerateTargetId?: string;
      }
    ) => {
      if (!finalMessage || isSending) return;

      const cleanPersona = typeof options?.personaId === 'string' ? options.personaId : undefined;
      const sourceMessages = options?.baseMessages ?? messages;

      // Capture last 8 valid messages BEFORE sending the current turn
      const historyPayload: ClientHistoryMessage[] = sourceMessages
        .filter((m) => m.status !== 'error' && (m.role === 'user' || m.role === 'assistant') && m.content.trim())
        .slice(-8)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      const isFirstExchange = !options?.skipUserSave && historyPayload.length === 0;

      // Ensure a local IndexedDB conversation exists before streaming
      let activeConvId = currentConversationId;
      if (!activeConvId) {
        const created = await localChatDb.createConversation(
          deriveConversationTitle(finalMessage),
          cleanPersona
        );
        activeConvId = created.id;
        setCurrentConversationId(activeConvId);
        safeStorage.setItem(ACTIVE_CONV_STORAGE_KEY, activeConvId);
      }

      if (!options?.skipUserSave) {
        const savedUserMsg = await localChatDb.addMessage(activeConvId, {
          role: 'user',
          content: finalMessage,
          status: 'complete',
        });

        setMessages((prev) => [...prev.filter((m) => m.id !== savedUserMsg.id), savedUserMsg]);
        const updatedConvsAfterSend = await localChatDb.listConversations();
        setConversations(updatedConvsAfterSend);
      }

      setIsSending(true);
      if (options?.regenerateTargetId) {
        setRegeneratingMessageId(options.regenerateTargetId);
      }
      setActivityStatus('Thinking...');
      setActivityDetails(null);
      setError(null);

      let silenceTimeout: any = null;
      let hasTimedOut = false;

      const resetSilenceTimer = () => {
        if (silenceTimeout) clearTimeout(silenceTimeout);
        silenceTimeout = setTimeout(() => {
          hasTimedOut = true;
          setIsSending(false);
          setRegeneratingMessageId(null);
          setActivityStatus('This is taking too long');
          showToast('Response is taking too long. Tap Retry to try again.', 'error');
        }, 40000);
      };

      resetSilenceTimer();

      try {
        const savedTextModel = safeStorage.getItem('jexa_text_model') || undefined;
        const savedBackupModel = safeStorage.getItem('jexa_backup_model') || undefined;

        let accumulatedStreamContent = '';
        const streamingAssistantId = `streaming-assistant-${Date.now()}`;
        let activeSources: any[] | undefined;
        let activeSearchQuery: string | undefined;
        let activeSearchStatus: any = undefined;
        let activeSearchTrigger: any = undefined;

        const response = await ApiClient.sendMessageStream(
          {
            conversationId: activeConvId,
            message: finalMessage,
            history: historyPayload,
            aboutMe: getAboutMe(),
            behaviorInstructions: getBehaviorInstructions(),
            personaId: cleanPersona,
            textProvider: 'gemini',
            textModel: savedTextModel,
            backupModel: savedBackupModel,
          },
          {
            onStatusUpdate(status, details) {
              if (hasTimedOut) return;
              resetSilenceTimer();
              setActivityStatus(status);
              if (details) {
                setActivityDetails(details);
                if (details.sources && details.sources.length > 0) {
                  activeSources = details.sources;
                }
                if (details.query) {
                  activeSearchQuery = details.query;
                }
                if (details.searchStatus) {
                  activeSearchStatus = details.searchStatus;
                }
                if (details.searchTrigger) {
                  activeSearchTrigger = details.searchTrigger;
                }

                if (activeSources || activeSearchQuery) {
                  setMessages((prev) => {
                    const streamIdx = prev.findIndex((m) => m.id === streamingAssistantId);
                    if (streamIdx !== -1) {
                      const updated = [...prev];
                      updated[streamIdx] = {
                        ...updated[streamIdx],
                        metadata: {
                          ...updated[streamIdx].metadata,
                          sources: activeSources,
                          searchQuery: activeSearchQuery,
                          searchStatus: activeSearchStatus,
                          searchTrigger: activeSearchTrigger,
                          searchPerformed: true,
                        },
                      };
                      return updated;
                    }
                    return prev;
                  });
                }
              }
            },
            onChunk(chunk) {
              if (hasTimedOut) return;
              resetSilenceTimer();
              accumulatedStreamContent += chunk;
              setMessages((prev) => {
                const streamIdx = prev.findIndex((m) => m.id === streamingAssistantId);
                const streamingMsg: ChatMessage = {
                  id: streamingAssistantId,
                  conversationId: activeConvId!,
                  role: 'assistant',
                  content: accumulatedStreamContent,
                  createdAt: new Date().toISOString(),
                  status: 'streaming',
                  metadata: {
                    sources: activeSources,
                    searchQuery: activeSearchQuery,
                    searchStatus: activeSearchStatus,
                    searchTrigger: activeSearchTrigger,
                    searchPerformed: Boolean(activeSearchQuery || (activeSources && activeSources.length > 0)),
                  },
                };
                if (streamIdx !== -1) {
                  const updated = [...prev];
                  updated[streamIdx] = streamingMsg;
                  return updated;
                }
                return [...prev, streamingMsg];
              });
            },
          }
        );

        if (silenceTimeout) clearTimeout(silenceTimeout);
        if (hasTimedOut) {
          setIsSending(false);
          setRegeneratingMessageId(null);
          setActivityStatus('This is taking too long');
          return;
        }

        // Save assistant message locally in IndexedDB
        const savedAssistantMsg = await localChatDb.addMessage(activeConvId, {
          id: response.message.id,
          role: 'assistant',
          content: response.message.content,
          createdAt: response.message.createdAt,
          status: 'complete',
          metadata: response.message.metadata,
        });

        setMessages((prev) => {
          const withoutStream = prev.filter(
            (m) => m.id !== streamingAssistantId && m.id !== savedAssistantMsg.id
          );
          return [...withoutStream, savedAssistantMsg];
        });

        const latestConvs = await localChatDb.listConversations();
        setConversations(latestConvs);

        // Non-blocking background AI chat title after first reply (never delays chat)
        if (isFirstExchange) {
          const targetConvId = activeConvId;
          void ApiClient.generateConversationTitle(finalMessage, savedAssistantMsg.content)
            .then(async (generatedTitle) => {
              if (!generatedTitle) return;
              const currentConv = await localChatDb.getConversation(targetConvId);
              if (!currentConv || currentConv.metadata?.customTitle) return;
              await localChatDb.renameConversation(targetConvId, generatedTitle, false);
              const refreshed = await localChatDb.listConversations();
              setConversations(refreshed);
            })
            .catch(() => {
              // Silent fallback to the 40-char title already saved in IndexedDB
            });
        }

        void notifyReplyReceived({
          conversationId: activeConvId,
          content: savedAssistantMsg.content,
        });

        setActivityStatus('Answer complete');
        setTimeout(() => {
          setIsSending(false);
          setRegeneratingMessageId(null);
          setActivityStatus(null);
          setActivityDetails(null);
        }, 500);
      } catch (err: any) {
        if (silenceTimeout) clearTimeout(silenceTimeout);
        if (hasTimedOut) {
          setIsSending(false);
          setRegeneratingMessageId(null);
          setActivityStatus('This is taking too long');
          return;
        }
        console.error('[useChat] Send message failed:', err);
        setError("Couldn't complete response. Please try again.");
        setActivityStatus('Search failed — retry available');
        setActivityDetails({
          error: err.message,
          provider: 'gemini',
          model: err.model,
          fallbackUsed: err.fallbackUsed,
        });

        let userHelpMessage = err.message || 'Gemini failed to respond. Please try again.';
        if (err.code === 'NETWORK_FAILURE') {
          userHelpMessage = 'Cannot reach server. Please check your internet connection and tap Retry.';
        } else if (err.code === 'REQUEST_TIMEOUT') {
          userHelpMessage = 'Cannot reach server (request timed out). Tap Retry to try again.';
        } else if (err.code === 'MODEL_NOT_FOUND') {
          userHelpMessage = `The selected Gemini model${err.model ? ` (${err.model})` : ''} was not found (${err.message}). Choose another Gemini model in Settings or try again.`;
        } else if (err.code === 'AUTHENTICATION_ERROR') {
          userHelpMessage = 'Gemini authentication failed. Please verify your GEMINI_API_KEY configuration.';
        } else if (err.code === 'MISSING_CREDENTIALS') {
          userHelpMessage = 'Gemini API key (GEMINI_API_KEY) is not configured on the server.';
        }

        showToast(userHelpMessage, 'error');

        setMessages((prev) => [
          ...prev.filter((m) => !m.id.startsWith('streaming-assistant-')),
          {
            id: `err-${Date.now()}`,
            conversationId: activeConvId || '',
            role: 'assistant',
            content: userHelpMessage,
            createdAt: new Date().toISOString(),
            status: 'error',
            metadata: {
              provider: 'gemini',
              model: err.model,
              fallbackUsed: err.fallbackUsed,
            },
          },
        ]);
        setIsSending(false);
        setRegeneratingMessageId(null);
      }
    },
    [currentConversationId, isSending, messages]
  );

  const sendMessage = useCallback(
    async (
      text: string,
      personaId?: string,
      attachments?: { id: string; name: string; type: 'image' | 'file'; size?: string; url?: string }[]
    ) => {
      let finalMessage = (typeof text === 'string' ? text : '').trim();
      if (attachments && attachments.length > 0) {
        const attachList = attachments
          .map((a) => `📎 ${a.type === 'image' ? 'Image' : 'File'}: ${a.name}${a.size ? ` (${a.size})` : ''}`)
          .join('\n');
        finalMessage = finalMessage
          ? `${finalMessage}\n\n${attachList}`
          : `[Attached ${attachments.length > 1 ? 'Files' : 'File'}]\n${attachList}`;
      }

      if (!finalMessage || isSending) return;
      await executeSend(finalMessage, { personaId });
    },
    [executeSend, isSending]
  );

  const regenerateMessage = useCallback(
    async (targetAssistantId?: string) => {
      if (isSending) return;

      let targetIdx = -1;
      if (targetAssistantId) {
        targetIdx = messages.findIndex((m) => m.id === targetAssistantId);
      } else {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant') {
            targetIdx = i;
            break;
          }
        }
      }

      const precedingUserMsg =
        targetIdx >= 0
          ? [...messages.slice(0, targetIdx)].reverse().find((m) => m.role === 'user')
          : [...messages].reverse().find((m) => m.role === 'user');

      if (!precedingUserMsg) {
        showToast('Nothing to regenerate yet.', 'info');
        return;
      }

      const targetMsg = targetIdx >= 0 ? messages[targetIdx] : null;
      const isLastAssistantMsg = targetMsg && targetIdx === messages.length - 1;

      if (targetMsg && isLastAssistantMsg) {
        if (AudioPlayer.getSnapshot().activeMessageId === targetMsg.id) {
          AudioPlayer.stop();
        }
        if (targetMsg.status !== 'error') {
          await localChatDb.deleteMessage(targetMsg.id, currentConversationId || undefined);
        } else {
          await localChatDb.deleteAudioForMessage(targetMsg.id);
        }
        const trimmed = messages.slice(0, targetIdx);
        const historyBeforeUser = trimmed.slice(0, trimmed.lastIndexOf(precedingUserMsg));
        setMessages(trimmed);
        await executeSend(precedingUserMsg.content, {
          skipUserSave: true,
          baseMessages: historyBeforeUser,
          regenerateTargetId: targetMsg.id,
        });
      } else {
        await executeSend(precedingUserMsg.content, {
          regenerateTargetId: targetAssistantId,
        });
      }
    },
    [currentConversationId, executeSend, isSending, messages]
  );

  const retrySearch = useCallback(() => {
    void regenerateMessage();
  }, [regenerateMessage]);

  return {
    conversations,
    currentConversationId,
    messages,
    isLoading,
    isSending,
    regeneratingMessageId,
    activityStatus,
    activityDetails,
    retrySearch,
    regenerateMessage,
    error,
    selectConversation,
    startNewChat,
    deleteConversation,
    togglePinConversation,
    renameConversation,
    clearAllConversations,
    sendMessage,
    refreshConversations,
    refreshMessages,
  };
}
