import React, { useState } from 'react';
import { Download, X, Share, PlusSquare } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isIOS, install, dismiss } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  if (!isInstallable && !isIOS) return null;

  return (
    <>
      <div className="mx-auto max-w-3xl w-full px-4 pt-2 pb-1 shrink-0 z-20">
        <div className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-[#0f1422] border border-emerald-500/25 text-slate-200 text-xs shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Download className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <span className="font-semibold text-white">Install JEXA App</span>
              <span className="text-slate-400 hidden sm:inline"> — Standalone fullscreen experience</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isInstallable && (
              <button
                onClick={install}
                className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-[11px] transition-colors active:scale-95"
              >
                Install
              </button>
            )}

            {isIOS && (
              <button
                onClick={() => setShowIOSModal(true)}
                className="px-2.5 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white font-medium text-[11px] transition-colors"
              >
                How to Install
              </button>
            )}

            <button
              onClick={dismiss}
              aria-label="Dismiss install prompt"
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* iOS Safari Guided Install Sheet */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#0f1422] border border-white/[0.08] rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <h3 className="text-sm font-semibold text-white">Install JEXA on iPhone / iPad</h3>
            <div className="space-y-2.5 text-xs text-slate-300 text-left bg-black/30 p-3.5 rounded-xl border border-white/[0.04]">
              <div className="flex items-center gap-2">
                <Share className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>1. Tap the <strong>Share</strong> button in Safari toolbar</span>
              </div>
              <div className="flex items-center gap-2">
                <PlusSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>2. Scroll down and tap <strong>Add to Home Screen</strong></span>
              </div>
            </div>
            <button
              onClick={() => {
                setShowIOSModal(false);
                dismiss();
              }}
              className="w-full py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-xs font-semibold text-white transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
