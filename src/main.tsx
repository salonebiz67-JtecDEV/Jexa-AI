import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// PWA Safe Auto-Update Strategy: ensures mobile & desktop clients do not get stuck on old caches
if (typeof window !== 'undefined') {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      console.log('[PWA] New version deployed. Updating service worker and activating fresh assets...');
      updateSW(true);
    },
    onOfflineReady() {
      console.log('[PWA] JEXA is ready for offline use.');
    },
    onRegistered(registration) {
      if (registration) {
        // Check for newly deployed assets on window focus and every 10 minutes
        setInterval(() => registration.update(), 10 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update();
          }
        });
      }
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
