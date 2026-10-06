import { PersonalVoiceReferenceMetadata } from '../../shared/types';
import { safeStorage } from './storage';

const DB_NAME = 'jexa_voice_db';
const DB_VERSION = 1;
const STORE_NAME = 'voice_samples';
const SAMPLE_KEY = 'personal_voice_reference';

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => resolve(null);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    } catch {
      resolve(null);
    }
  });
}

export interface StoredVoiceSample {
  blob: Blob;
  metadata: PersonalVoiceReferenceMetadata;
  audioUrl: string;
}

let memorySampleCache: { blob: Blob; metadata: PersonalVoiceReferenceMetadata } | null = null;

export const VoiceSampleStorage = {
  async saveSample(blob: Blob, metadata: PersonalVoiceReferenceMetadata): Promise<void> {
    memorySampleCache = { blob, metadata };

    // Also cache metadata in safeStorage for synchronous lookup
    safeStorage.setItem('jexa_personal_voice_meta', JSON.stringify(metadata));

    const db = await openDatabase();
    if (!db) return;

    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ blob, metadata, timestamp: Date.now() }, SAMPLE_KEY);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('[VoiceSampleStorage] IndexedDB write failed:', e);
    }
  },

  async getSample(): Promise<StoredVoiceSample | null> {
    if (memorySampleCache) {
      const url = URL.createObjectURL(memorySampleCache.blob);
      return {
        blob: memorySampleCache.blob,
        metadata: memorySampleCache.metadata,
        audioUrl: url,
      };
    }

    const db = await openDatabase();
    if (!db) {
      const savedMetaStr = safeStorage.getItem('jexa_personal_voice_meta');
      if (savedMetaStr) {
        try {
          const meta = JSON.parse(savedMetaStr);
          return {
            blob: new Blob([], { type: meta.format || 'audio/webm' }),
            metadata: meta,
            audioUrl: '',
          };
        } catch {}
      }
      return null;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(SAMPLE_KEY);

        req.onsuccess = () => {
          if (req.result && req.result.blob) {
            const blob = req.result.blob as Blob;
            const metadata = req.result.metadata as PersonalVoiceReferenceMetadata;
            memorySampleCache = { blob, metadata };
            const audioUrl = URL.createObjectURL(blob);
            resolve({ blob, metadata, audioUrl });
          } else {
            resolve(null);
          }
        };

        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  },

  async deleteSample(): Promise<void> {
    memorySampleCache = null;
    safeStorage.removeItem('jexa_personal_voice_meta');

    const db = await openDatabase();
    if (!db) return;

    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(SAMPLE_KEY);
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (e) {
      console.warn('[VoiceSampleStorage] IndexedDB delete failed:', e);
    }
  },
};
