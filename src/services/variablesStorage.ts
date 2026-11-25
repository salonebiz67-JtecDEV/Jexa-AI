import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { LocalConfigManager } from '../../shared/config/local-config';
import { isNative } from '../utils/platform';

const KEY_PREFIX = 'jexa_env_var_';

export type VariablesStorageMode = 'android_keystore' | 'web_local_storage' | 'memory_fallback';

export interface StoredVariable {
  name: string;
  value: string;
}

const variablesMap = new Map<string, string>();
const listeners = new Set<() => void>();

let initialized = false;
let initPromise: Promise<void> | null = null;
let storageMode: VariablesStorageMode = isNative() ? 'android_keystore' : 'web_local_storage';
let sourceRegistered = false;

function notifyListeners(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // Ignore subscriber UI errors
    }
  });
}

function ensureConfigSourceRegistered(): void {
  if (sourceRegistered) return;
  sourceRegistered = true;
  LocalConfigManager.registerSource({
    name: 'device-secure-storage',
    get(key: string): string | undefined {
      return variablesMap.get(key);
    },
    async getAsync(key: string): Promise<string | undefined> {
      await initVariablesStorage();
      return variablesMap.get(key);
    },
    listKeys(): string[] {
      return Array.from(variablesMap.keys()).sort((a, b) => a.localeCompare(b));
    },
  });
}

ensureConfigSourceRegistered();

export function normalizeVariableName(rawName: string): string {
  return (rawName || '').trim();
}

export function validateVariableName(rawName: string): { valid: boolean; name: string; error?: string } {
  const name = normalizeVariableName(rawName);
  if (!name) {
    return { valid: false, name: '', error: 'Variable name is required.' };
  }
  if (/\s/.test(name)) {
    return { valid: false, name, error: 'Variable name cannot contain spaces or whitespace.' };
  }
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name)) {
    return {
      valid: false,
      name,
      error: 'Use letters, numbers, underscores (_), dots (.), or hyphens (-), starting with a letter or _.',
    };
  }
  return { valid: true, name };
}

export function getVariablesStorageMode(): VariablesStorageMode {
  return storageMode;
}

export async function initVariablesStorage(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    ensureConfigSourceRegistered();
    try {
      await SecureStorage.setKeyPrefix(KEY_PREFIX);
      const keys = await SecureStorage.keys();
      for (const key of keys) {
        const cleanKey = normalizeVariableName(key);
        if (!cleanKey) continue;
        const val = await SecureStorage.getItem(cleanKey);
        if (typeof val === 'string') {
          variablesMap.set(cleanKey, val);
        }
      }
      storageMode = isNative() ? 'android_keystore' : 'web_local_storage';
    } catch {
      // Fallback to in-memory map if browser restricts storage (never log values)
      storageMode = 'memory_fallback';
    } finally {
      initialized = true;
      notifyListeners();
    }
  })();

  return initPromise;
}

export function listVariables(): StoredVariable[] {
  return Array.from(variablesMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ({ name, value }));
}

export function listVariableNames(): string[] {
  return Array.from(variablesMap.keys()).sort((a, b) => a.localeCompare(b));
}

export function getVariable(name: string): string | undefined {
  const cleanName = normalizeVariableName(name);
  if (!cleanName) return undefined;
  return variablesMap.get(cleanName);
}

export function hasVariable(name: string): boolean {
  const cleanName = normalizeVariableName(name);
  if (!cleanName) return false;
  return variablesMap.has(cleanName);
}

export async function setVariable(name: string, value: string): Promise<void> {
  await initVariablesStorage();
  const validation = validateVariableName(name);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid variable name.');
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Variable value cannot be empty.');
  }

  const cleanName = validation.name;
  variablesMap.set(cleanName, value);

  try {
    await SecureStorage.setKeyPrefix(KEY_PREFIX);
    await SecureStorage.setItem(cleanName, value);
  } catch {
    storageMode = 'memory_fallback';
  }

  notifyListeners();
}

export async function replaceVariable(
  previousName: string | null,
  newName: string,
  newValue: string
): Promise<void> {
  await initVariablesStorage();
  const validation = validateVariableName(newName);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid variable name.');
  }
  if (typeof newValue !== 'string' || newValue.length === 0) {
    throw new Error('Variable value cannot be empty.');
  }

  const cleanPrev = previousName ? normalizeVariableName(previousName) : '';
  const cleanNew = validation.name;

  if (cleanPrev && cleanPrev !== cleanNew) {
    variablesMap.delete(cleanPrev);
    try {
      await SecureStorage.setKeyPrefix(KEY_PREFIX);
      await SecureStorage.removeItem(cleanPrev);
    } catch {
      // Ignore missing key on rename
    }
  }

  variablesMap.set(cleanNew, newValue);
  try {
    await SecureStorage.setKeyPrefix(KEY_PREFIX);
    await SecureStorage.setItem(cleanNew, newValue);
  } catch {
    storageMode = 'memory_fallback';
  }

  notifyListeners();
}

export async function deleteVariable(name: string): Promise<void> {
  await initVariablesStorage();
  const cleanName = normalizeVariableName(name);
  if (!cleanName) return;

  variablesMap.delete(cleanName);
  try {
    await SecureStorage.setKeyPrefix(KEY_PREFIX);
    await SecureStorage.removeItem(cleanName);
  } catch {
    // Ignore storage removal errors
  }

  notifyListeners();
}

export function subscribeVariables(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
