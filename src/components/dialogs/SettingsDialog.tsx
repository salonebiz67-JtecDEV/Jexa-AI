import React, { useState, useEffect } from 'react';
import { ArrowLeft, X, Check, Bell, BellOff, Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onClearHistory: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  isOpen,
  onClose,
  onClearHistory,
}) => {
  const [theme, setTheme] = useState<'dark' | 'midnight' | 'obsidian'>('dark');
  const [voiceName, setVoiceName] = useState('aura');
  const [streamText, setStreamText] = useState(true);
  const [soundEffects, setSoundEffects] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Real Notification Support
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission>('default');

  const { isInstallable, isInstalled, install } = usePWAInstall();

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationStatus(Notification.permission);
    }
  }, [isOpen]);

  const handleToggleNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const result = await Notification.requestPermission();
      setNotificationStatus(result);
    } catch (e) {
      console.warn('[Settings] Notification permission request error:', e);
    }
  };

  if (!isOpen) return null;

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md pt-safe pb-safe">
      <div className="relative w-full max-w-md bg-[#0f1422] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header with Back button */}
        <div className="flex items-center justify-between px-3.5 py-3 border-b border-white/[0.06] bg-[#0b0f19]">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors"
              aria-label="Back to chat"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <div className="h-4 w-px bg-white/[0.08]" />
            <h2 className="font-semibold text-sm text-white">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Settings Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1">
          {/* Theme Palette */}
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Interface Theme
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'dark', label: 'Dark Slate', bg: 'bg-[#07090e]' },
                { id: 'midnight', label: 'Midnight', bg: 'bg-[#090d16]' },
                { id: 'obsidian', label: 'Obsidian', bg: 'bg-[#04060a]' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTheme(item.id as any)}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    theme === item.id
                      ? 'border-emerald-500 bg-emerald-950/20 text-white'
                      : 'border-white/[0.06] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className={`w-full h-5 rounded-md mb-1.5 border border-white/[0.08] ${item.bg}`} />
                  <span className="text-[11px] font-medium">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Voice Model Preference */}
          <div className="space-y-2 pt-3 border-t border-white/[0.06]">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Voice Model
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'aura', name: 'Aura', desc: 'Serene' },
                { id: 'atlas', name: 'Atlas', desc: 'Direct' },
                { id: 'lyra', name: 'Lyra', desc: 'Bright' },
              ].map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVoiceName(v.id)}
                  className={`p-2 rounded-xl border text-left transition-all ${
                    voiceName === v.id
                      ? 'border-emerald-500 bg-emerald-950/20 text-white'
                      : 'border-white/[0.06] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-semibold text-xs text-white">{v.name}</div>
                  <div className="text-[10px] text-slate-400">{v.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Progressive Web App (PWA) Section */}
          <div className="space-y-2 pt-3 border-t border-white/[0.06]">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Application & Installation
            </label>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <div className="text-xs font-medium text-white truncate">PWA Standalone Mode</div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {isInstalled ? 'Installed as native application' : 'Install JEXA on home screen'}
                  </div>
                </div>
              </div>

              {isInstalled ? (
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-medium shrink-0">
                  Installed
                </span>
              ) : isInstallable ? (
                <button
                  onClick={install}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Install</span>
                </button>
              ) : (
                <span className="text-[10px] text-slate-500 shrink-0">Browser mode</span>
              )}
            </div>
          </div>

          {/* Notifications Permission */}
          <div className="space-y-2 pt-3 border-t border-white/[0.06]">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              System Notifications
            </label>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center gap-2">
                {notificationStatus === 'granted' ? (
                  <Bell className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <BellOff className="w-4 h-4 text-slate-500 shrink-0" />
                )}
                <div>
                  <div className="text-xs font-medium text-white">Browser Notifications</div>
                  <div className="text-[10px] text-slate-400">
                    Status: {notificationStatus === 'granted' ? 'Allowed' : notificationStatus === 'denied' ? 'Blocked' : 'Not Enabled'}
                  </div>
                </div>
              </div>

              {notificationStatus === 'default' && (
                <button
                  onClick={handleToggleNotifications}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-slate-200 transition-colors"
                >
                  Enable
                </button>
              )}
              {notificationStatus === 'granted' && (
                <span className="text-emerald-400 text-xs font-medium">Active</span>
              )}
            </div>
          </div>

          {/* Chat Experience Toggles */}
          <div className="space-y-2 pt-3 border-t border-white/[0.06]">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Preferences
            </label>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div>
                  <div className="text-xs font-medium text-white">Stream Responses</div>
                  <div className="text-[10px] text-slate-400">Stream reply text in real-time</div>
                </div>
                <input
                  type="checkbox"
                  checked={streamText}
                  onChange={(e) => setStreamText(e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div>
                  <div className="text-xs font-medium text-white">Audio Feedback</div>
                  <div className="text-[10px] text-slate-400">Audio cues for actions</div>
                </div>
                <input
                  type="checkbox"
                  checked={soundEffects}
                  onChange={(e) => setSoundEffects(e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Privacy & History */}
          <div className="space-y-2 pt-3 border-t border-white/[0.06]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-white">Clear History</div>
                <div className="text-[10px] text-slate-400">Delete all active conversations</div>
              </div>
              <button
                onClick={onClearHistory}
                className="px-2.5 py-1 rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 text-xs font-medium transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Footer Credit */}
          <div className="pt-2 text-center text-[11px] text-slate-500">
            JEXA Assistant · Powered by JOHNEY TEC
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/[0.06] bg-[#0b0f19]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors"
          >
            {savedSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Saved</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
