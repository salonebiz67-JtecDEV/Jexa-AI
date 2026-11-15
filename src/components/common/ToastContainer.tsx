import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { dismissToast, subscribeToToasts, ToastItem } from '../../services/toast';

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeToToasts(setToasts);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-[max(4rem,calc(env(safe-area-inset-top)+3.75rem))] left-1/2 -translate-x-1/2 z-[70] w-full max-w-sm px-4 flex flex-col gap-2 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const isError = toast.type === 'error';
        const isSuccess = toast.type === 'success';
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl border shadow-2xl backdrop-blur-md text-xs font-medium transition-all duration-150 ${
              isError
                ? 'bg-[#1a0d14]/95 border-rose-500/40 text-rose-100'
                : isSuccess
                ? 'bg-[#0b1817]/95 border-emerald-500/40 text-emerald-100'
                : 'bg-[#0f1422]/95 border-white/[0.12] text-slate-100'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {isError ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : isSuccess ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-cyan-400 shrink-0" />
              )}
              <span className="break-words leading-snug">{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="min-h-[32px] min-w-[32px] -mr-1 flex items-center justify-center rounded-lg text-slate-400 hover:text-white active:scale-95 transition-all cursor-pointer shrink-0"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
