import React from 'react';
import { ArrowLeft, Smartphone, Laptop, Tablet, Radio } from 'lucide-react';
import { RemoteDevice } from '../../../shared/types';

interface RemotePanelProps {
  onBack: () => void;
  devices: RemoteDevice[];
}

export const RemotePanel: React.FC<RemotePanelProps> = ({ onBack, devices }) => {
  return (
    <div className="flex-1 flex flex-col h-full bg-[#07090e] overflow-hidden">
      {/* Top Header with Back Button */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-white/[0.06] bg-[#080b12] shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="Back to chat"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div className="h-4 w-px bg-white/[0.08]" />
          <h1 className="text-sm font-semibold text-white">Remote Sync</h1>
        </div>
      </div>

      {/* Device List */}
      <div className="flex-1 p-6 overflow-y-auto max-w-2xl space-y-4">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-1">
          ACTIVE SESSIONS
        </div>

        <div className="space-y-2.5">
          {devices.map((device) => {
            const Icon =
              device.type === 'mobile'
                ? Smartphone
                : device.type === 'tablet'
                ? Tablet
                : Laptop;
            const isOnline = device.status === 'active';

            return (
              <div
                key={device.id}
                className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-slate-300">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-xs text-white">{device.name}</h3>
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${
                          isOnline ? 'bg-emerald-400' : 'bg-slate-600'
                        }`}
                      />
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Last seen: {device.lastSeen}
                    </div>
                  </div>
                </div>

                <div className="text-xs">
                  <span className={isOnline ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                    {isOnline ? 'Active' : 'Standby'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
