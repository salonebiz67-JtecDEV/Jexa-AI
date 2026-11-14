import { ChatMessage, Conversation } from '../../shared/types/chat';

const DB_NAME = 'jexa_local_db';
const DB_VERSION = 1;
const CONVERSATIONS_STORE = 'conversations';
const MESSAGES_STORE = 'messages';

// In-memory fallback for environments where IndexedDB is unavailable (e.g. restricted iframes or SSR)
const fallbackConversations = new Map<string, Conversation>();
const fallbackMessages = new Map<string, ChatMessage[]>();

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Names a conversation from the first 40 characters of its first message.
 */
export function deriveConversationTitle(firstMessage: string): string {
  const cleaned = (firstMessage || '')
    .replace(/^\[web search requested\]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'New Conversation';
  const sliced = cleaned.slice(0, 40).trim();
  return sliced || 'New Conversation';
}

function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => {
    if (Boolean(b.pinned) !== Boolean(a.pinned)) {
      return b.pinned ? 1 : -1;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window) || !window.indexedDB) {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
          const convStore = db.createObjectStore(CONVERSATIONS_STORE, { keyPath: 'id' });
          convStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          const msgStore = db.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
          msgStore.createIndex('conversationId', 'conversationId', { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.warn('[localChatDb] IndexedDB blocked or failed, using memory fallback:', request.error);
        resolve(null);
      };
    } catch (err) {
      console.warn('[localChatDb] IndexedDB initialization failed, using memory fallback:', err);
      resolve(null);
    }
  });

  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

export const localChatDb = {
  async listConversations(): Promise<Conversation[]> {
    const db = await openDatabase();
    if (!db) {
      return sortConversations(Array.from(fallbackConversations.values()));
    }
    const tx = db.transaction(CONVERSATIONS_STORE, 'readonly');
    const store = tx.objectStore(CONVERSATIONS_STORE);
    const items = await reqToPromise<Conversation[]>(store.getAll());
    await txDone(tx);
    return sortConversations(items || []);
  },

  async getConversation(id: string): Promise<Conversation | null> {
    if (!id) return null;
    const db = await openDatabase();
    if (!db) {
      return fallbackConversations.get(id) || null;
    }
    const tx = db.transaction(CONVERSATIONS_STORE, 'readonly');
    const store = tx.objectStore(CONVERSATIONS_STORE);
    const item = await reqToPromise<Conversation | undefined>(store.get(id));
    await txDone(tx);
    return item || null;
  },

  async createConversation(title?: string, personaId?: string, explicitId?: string): Promise<Conversation> {
    const now = new Date().toISOString();
    const conv: Conversation = {
      id: explicitId || generateUuid(),
      title: (title || '').trim().slice(0, 40) || 'New Conversation',
      personaId: personaId || 'empathetic_companion',
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      pinned: false,
      previewMessage: '',
    };

    const db = await openDatabase();
    if (!db) {
      fallbackConversations.set(conv.id, conv);
      fallbackMessages.set(conv.id, []);
      return conv;
    }

    const tx = db.transaction(CONVERSATIONS_STORE, 'readwrite');
    tx.objectStore(CONVERSATIONS_STORE).put(conv);
    await txDone(tx);
    return conv;
  },

  async renameConversation(id: string, title: string): Promise<Conversation | null> {
    const cleanTitle = title.trim();
    if (!id || !cleanTitle) return null;

    const existing = await this.getConversation(id);
    if (!existing) return null;

    const updated: Conversation = {
      ...existing,
      title: cleanTitle,
      updatedAt: new Date().toISOString(),
    };

    const db = await openDatabase();
    if (!db) {
      fallbackConversations.set(id, updated);
      return updated;
    }

    const tx = db.transaction(CONVERSATIONS_STORE, 'readwrite');
    tx.objectStore(CONVERSATIONS_STORE).put(updated);
    await txDone(tx);
    return updated;
  },

  async togglePinConversation(id: string, pinned: boolean): Promise<Conversation | null> {
    const existing = await this.getConversation(id);
    if (!existing) return null;

    const updated: Conversation = {
      ...existing,
      pinned: Boolean(pinned),
    };

    const db = await openDatabase();
    if (!db) {
      fallbackConversations.set(id, updated);
      return updated;
    }

    const tx = db.transaction(CONVERSATIONS_STORE, 'readwrite');
    tx.objectStore(CONVERSATIONS_STORE).put(updated);
    await txDone(tx);
    return updated;
  },

  async deleteConversation(id: string): Promise<boolean> {
    if (!id) return false;
    const db = await openDatabase();
    if (!db) {
      const existed = fallbackConversations.delete(id);
      fallbackMessages.delete(id);
      return existed;
    }

    const tx = db.transaction([CONVERSATIONS_STORE, MESSAGES_STORE], 'readwrite');
    tx.objectStore(CONVERSATIONS_STORE).delete(id);
    const msgStore = tx.objectStore(MESSAGES_STORE);
    const index = msgStore.index('conversationId');
    const keys = await reqToPromise<IDBValidKey[]>(index.getAllKeys(id));
    for (const key of keys || []) {
      msgStore.delete(key);
    }
    await txDone(tx);
    return true;
  },

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    if (!conversationId) return [];
    const db = await openDatabase();
    if (!db) {
      const list = fallbackMessages.get(conversationId) || [];
      return [...list].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    }

    const tx = db.transaction(MESSAGES_STORE, 'readonly');
    const index = tx.objectStore(MESSAGES_STORE).index('conversationId');
    const items = await reqToPromise<ChatMessage[]>(index.getAll(conversationId));
    await txDone(tx);

    const seen = new Set<string>();
    const deduped: ChatMessage[] = [];
    for (const m of items || []) {
      if (m.id && !seen.has(m.id)) {
        seen.add(m.id);
        deduped.push(m);
      }
    }
    return deduped.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  },

  async addMessage(
    conversationId: string,
    message: Omit<ChatMessage, 'id' | 'conversationId' | 'createdAt'> & {
      id?: string;
      createdAt?: string;
    }
  ): Promise<ChatMessage> {
    const now = message.createdAt || new Date().toISOString();
    const savedMsg: ChatMessage = {
      id: message.id || generateUuid(),
      conversationId,
      role: message.role,
      content: message.content,
      createdAt: now,
      status: message.status || 'complete',
      metadata: message.metadata,
    };

    let conv = await this.getConversation(conversationId);
    if (!conv) {
      const title =
        savedMsg.role === 'user'
          ? deriveConversationTitle(savedMsg.content)
          : 'New Conversation';
      conv = await this.createConversation(title, undefined, conversationId);
    }

    const shouldRenameFromFirst =
      savedMsg.role === 'user' &&
      (conv.messageCount || 0) === 0 &&
      (conv.title === 'New Conversation' || !conv.title.trim());

    const updatedConv: Conversation = {
      ...conv,
      title: shouldRenameFromFirst ? deriveConversationTitle(savedMsg.content) : conv.title,
      updatedAt: now,
      messageCount: (conv.messageCount || 0) + 1,
      previewMessage: savedMsg.content.slice(0, 120),
    };

    const db = await openDatabase();
    if (!db) {
      const existingMsgs = fallbackMessages.get(conversationId) || [];
      fallbackMessages.set(conversationId, [...existingMsgs, savedMsg]);
      fallbackConversations.set(conversationId, updatedConv);
      return savedMsg;
    }

    const tx = db.transaction([CONVERSATIONS_STORE, MESSAGES_STORE], 'readwrite');
    tx.objectStore(MESSAGES_STORE).put(savedMsg);
    tx.objectStore(CONVERSATIONS_STORE).put(updatedConv);
    await txDone(tx);
    return savedMsg;
  },

  async searchConversations(
    query: string
  ): Promise<Array<{ conversation: Conversation; matchedSnippet?: string }>> {
    const clean = (query || '').trim().toLowerCase();
    const allConvs = await this.listConversations();
    if (!clean) {
      return allConvs.map((c) => ({ conversation: c }));
    }

    const db = await openDatabase();
    const allMessages: ChatMessage[] = [];
    if (!db) {
      for (const msgs of fallbackMessages.values()) {
        allMessages.push(...msgs);
      }
    } else {
      const tx = db.transaction(MESSAGES_STORE, 'readonly');
      const items = await reqToPromise<ChatMessage[]>(tx.objectStore(MESSAGES_STORE).getAll());
      await txDone(tx);
      if (items) allMessages.push(...items);
    }

    const msgMatchByConv = new Map<string, string>();
    for (const m of allMessages) {
      if (m.content && m.content.toLowerCase().includes(clean) && !msgMatchByConv.has(m.conversationId)) {
        msgMatchByConv.set(m.conversationId, m.content.slice(0, 140));
      }
    }

    const results: Array<{ conversation: Conversation; matchedSnippet?: string }> = [];
    for (const conv of allConvs) {
      const titleMatch = conv.title.toLowerCase().includes(clean);
      const previewMatch = Boolean(conv.previewMessage?.toLowerCase().includes(clean));
      const msgSnippet = msgMatchByConv.get(conv.id);

      if (titleMatch || previewMatch || msgSnippet) {
        results.push({
          conversation: conv,
          matchedSnippet: msgSnippet || conv.previewMessage,
        });
      }
    }
    return results;
  },

  async clearAllConversations(): Promise<void> {
    const db = await openDatabase();
    if (!db) {
      fallbackConversations.clear();
      fallbackMessages.clear();
      return;
    }

    const tx = db.transaction([CONVERSATIONS_STORE, MESSAGES_STORE], 'readwrite');
    tx.objectStore(CONVERSATIONS_STORE).clear();
    tx.objectStore(MESSAGES_STORE).clear();
    await txDone(tx);
  },
};
