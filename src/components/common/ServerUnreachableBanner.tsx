import React, { useState } from 'react';
import { ServerCrash, RefreshCw } from 'lucide-react';

interface ServerUnreachableBannerProps {
  visible: boolean;
  onRetry: () => Promise<boolean> | void;
}

export const ServerUnreachableBanner: React.FC<ServerUnreachableBannerProps> = ({
  visible,
  onRetry,
}) => {
  const [retrying, setRetrying] = useState(false);

  if (!visible) return null;

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl lg:max-w-4xl w-full px-3 sm:px-4 pt-2 pb-1 shrink-0 z-20 pl-safe pr-safe">
      <div
        role="alert"
        className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-rose-950/85 border border-rose-500/35 text-rose-100 text-xs shadow-lg backdrop-blur-md"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
            <ServerCrash className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-white truncate">Cannot reach server</div>
            <div className="text-[11px] text-rose-200/80 truncate">
              Check your connection or wait for the backend to wake up.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors active:scale-95 disabled:opacity-60 cursor-pointer shrink-0 whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
          <span>{retrying ? 'Retrying…' : 'Retry'}</span>
        </button>
      </div>
    </div>
  );
};
