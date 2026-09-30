import React from 'react';
import { ArrowLeft, Globe, Code, Image as ImageIcon, LineChart, Mic, Puzzle } from 'lucide-react';
import { PluginItem } from '../../../shared/types';

interface PluginPanelProps {
  onBack: () => void;
  plugins: PluginItem[];
  onTogglePlugin: (id: string) => void;
}

export const PluginPanel: React.FC<PluginPanelProps> = ({ onBack, plugins, onTogglePlugin }) => {
  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'globe':
        return Globe;
      case 'code':
        return Code;
      case 'image':
        return ImageIcon;
      case 'chart':
        return LineChart;
      case 'mic':
        return Mic;
      default:
        return Puzzle;
    }
  };

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
          <h1 className="text-sm font-semibold text-white">Plugins & Tools</h1>
        </div>
      </div>

      {/* Plugins List */}
      <div className="flex-1 p-6 overflow-y-auto max-w-2xl space-y-3">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-1">
          AVAILABLE ASSISTANT TOOLS
        </div>

        {plugins.map((plugin) => {
          const Icon = getIcon(plugin.icon);
          return (
            <div
              key={plugin.id}
              className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-slate-300">
                  <Icon className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-xs text-white">{plugin.name}</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5 max-w-md">
                    {plugin.description}
                  </p>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                onClick={() => onTogglePlugin(plugin.id)}
                className={`w-10 h-6 rounded-full transition-colors relative p-0.5 shrink-0 ml-3 ${
                  plugin.enabled ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
                aria-label={`Toggle ${plugin.name}`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    plugin.enabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
