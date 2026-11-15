export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  createdAt: number;
}

type ToastListener = (toasts: ToastItem[]) => void;

const listeners = new Set<ToastListener>();
let activeToasts: ToastItem[] = [];

function notify() {
  const snapshot = [...activeToasts];
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function dismissToast(id: string): void {
  const next = activeToasts.filter((t) => t.id !== id);
  if (next.length !== activeToasts.length) {
    activeToasts = next;
    notify();
  }
}

export function showToast(
  message: string,
  type: ToastType = 'info',
  durationMs?: number
): string {
  const clean = (message || '').trim();
  if (!clean) return '';

  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const item: ToastItem = {
    id,
    message: clean,
    type,
    createdAt: Date.now(),
  };

  // Deduplicate rapid identical toast messages
  activeToasts = [...activeToasts.filter((t) => t.message !== clean).slice(-3), item];
  notify();

  const ttl = durationMs ?? (type === 'error' ? 4500 : 2600);
  if (ttl > 0 && typeof window !== 'undefined') {
    window.setTimeout(() => {
      dismissToast(id);
    }, ttl);
  }

  return id;
}

export function subscribeToToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  listener([...activeToasts]);
  return () => {
    listeners.delete(listener);
  };
}
