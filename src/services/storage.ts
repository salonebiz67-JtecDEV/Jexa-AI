/**
 * Safe local storage utility with memory fallback
 * Prevents synchronous SecurityError exceptions in private browsing or iframe environments
 */
const memoryStorage = new Map<string, string>();

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // Storage restricted, use memory fallback
    }
    return memoryStorage.get(key) ?? null;
  },

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // Storage restricted, use memory fallback
    }
    memoryStorage.set(key, value);
  },

  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
    } catch {
      // Storage restricted, use memory fallback
    }
    memoryStorage.delete(key);
  },
};

export const MAX_INSTRUCTION_CHARS = 1500;
const ABOUT_ME_STORAGE_KEY = 'jexa_about_me';
const BEHAVIOR_STORAGE_KEY = 'jexa_behavior_instructions';

function notifyPreferencesUpdated(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('jexa:preferences-updated'));
  }
}

export function getAboutMe(): string {
  return (safeStorage.getItem(ABOUT_ME_STORAGE_KEY) || '').slice(0, MAX_INSTRUCTION_CHARS);
}

export function setAboutMe(value: string): string {
  const clamped = (value || '').slice(0, MAX_INSTRUCTION_CHARS);
  safeStorage.setItem(ABOUT_ME_STORAGE_KEY, clamped);
  notifyPreferencesUpdated();
  return clamped;
}

export function appendToAboutMe(snippet: string): {
  updated: string;
  truncated: boolean;
  alreadyFull: boolean;
  duplicate: boolean;
} {
  const cleanSnippet = (snippet || '').replace(/\s+/g, ' ').trim();
  const current = getAboutMe();
  if (!cleanSnippet) {
    return { updated: current, truncated: false, alreadyFull: false, duplicate: false };
  }
  if (current.toLowerCase().includes(cleanSnippet.toLowerCase())) {
    return { updated: current, truncated: false, alreadyFull: false, duplicate: true };
  }
  if (current.length >= MAX_INSTRUCTION_CHARS) {
    return { updated: current, truncated: true, alreadyFull: true, duplicate: false };
  }

  const combined = current ? `${current}\n${cleanSnippet}` : cleanSnippet;
  const truncated = combined.length > MAX_INSTRUCTION_CHARS;
  const updated = setAboutMe(combined);
  return { updated, truncated, alreadyFull: false, duplicate: false };
}

export function getBehaviorInstructions(): string {
  return (safeStorage.getItem(BEHAVIOR_STORAGE_KEY) || '').slice(0, MAX_INSTRUCTION_CHARS);
}

export function setBehaviorInstructions(value: string): string {
  const clamped = (value || '').slice(0, MAX_INSTRUCTION_CHARS);
  safeStorage.setItem(BEHAVIOR_STORAGE_KEY, clamped);
  notifyPreferencesUpdated();
  return clamped;
}
