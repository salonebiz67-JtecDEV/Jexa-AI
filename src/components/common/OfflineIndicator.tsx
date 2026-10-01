import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <aside
      aria-label="Offline status"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/90 text-slate-950 font-medium text-xs shadow-xl backdrop-blur-md transition-all animate-bounce"
    >
      <WifiOff className="w-3.5 h-3.5" />
      <span>Offline — AI responses require network</span>
    </aside>
  );
};
