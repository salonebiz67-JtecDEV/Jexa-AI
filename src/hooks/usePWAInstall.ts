import { useState, useEffect, useCallback } from 'react';
import { isNative } from '../utils/platform';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISSED_KEY = 'jexa_pwa_install_dismissed';

export function usePWAInstall() {
  const native = isNative();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(native);
  const [isDismissed, setIsDismissed] = useState(() => {
    if (native) return true;
    try {
      return localStorage.getItem(DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (native) {
      setIsInstalled(true);
      setIsIOS(false);
      return;
    }

    // Check if running in standalone PWA mode
    const isStandalone =
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://'));

    setIsInstalled(isStandalone);

    // Detect iOS Safari
    if (typeof window !== 'undefined') {
      const ua = window.navigator.userAgent.toLowerCase();
      const isIOSDevice = /iphone|ipad|ipod/.test(ua) && !isStandalone;
      setIsIOS(isIOSDevice);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [native]);

  const install = useCallback(async () => {
    if (native || !deferredPrompt) return false;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        return true;
      }
    } catch (err) {
      console.warn('[usePWAInstall] Install prompt error:', err);
    }
    return false;
  }, [deferredPrompt, native]);

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // ignore storage errors
    }
  }, []);

  return {
    isInstallable: !native && !!deferredPrompt && !isInstalled && !isDismissed,
    canPrompt: !native && !!deferredPrompt,
    isInstalled,
    isIOS: !native && isIOS && !isInstalled && !isDismissed,
    install,
    dismiss,
  };
}
