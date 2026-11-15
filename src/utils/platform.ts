import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

let nativeAppActive = true;
let appStateInitialized = false;

/**
 * Returns true when running inside a native Capacitor shell (Android / iOS).
 */
export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Tracks native app foreground/background state so notifications know accurately
 * whether JEXA is backgrounded when a reply finishes.
 */
export function initNativeAppStateTracking(): void {
  if (!isNative() || appStateInitialized) return;
  appStateInitialized = true;

  void CapacitorApp.getState()
    .then((state) => {
      nativeAppActive = state.isActive;
    })
    .catch(() => {
      nativeAppActive = true;
    });

  void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    nativeAppActive = isActive;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jexa:app-state-change', { detail: { isActive } }));
    }
  }).catch(() => {
    // Ignore listener setup errors on unsupported environments
  });
}

/**
 * Returns true when the app is currently in the background or not visible.
 */
export function isAppInBackground(): boolean {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return true;
  }
  if (isNative()) {
    return !nativeAppActive;
  }
  return false;
}

/**
 * Configures the Android/iOS native status bar to match JEXA's dark theme
 * with light foreground icons. Safe on Android 15+ edge-to-edge as well.
 */
export async function configureNativeStatusBar(): Promise<void> {
  if (!isNative()) return;

  try {
    // Style.Dark renders light icons/text for dark backgrounds
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    // Ignore on platforms where status bar styling is unavailable
  }

  try {
    // Sets dark status bar color on Android < 15; harmless no-op or caught on Android 15+
    await StatusBar.setBackgroundColor({ color: '#080b12' });
  } catch {
    // Ignore on Android 15+ edge-to-edge or iOS
  }
}

/**
 * In native builds, unregisters any previously registered Service Workers and
 * deletes all Cache Storage entries so app updates never serve stale files.
 */
export async function unregisterServiceWorkersAndClearCaches(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map((registration) => registration.unregister().catch(() => false))
      );
    }
  } catch (err) {
    console.warn('[Platform] Failed to unregister service workers:', err);
  }

  try {
    if ('caches' in window) {
      const cacheKeys = await window.caches.keys();
      await Promise.all(
        cacheKeys.map((key) => window.caches.delete(key).catch(() => false))
      );
    }
  } catch (err) {
    console.warn('[Platform] Failed to clear cache storage:', err);
  }
}
