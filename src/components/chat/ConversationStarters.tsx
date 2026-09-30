import React from 'react';
import { Sparkles, PenLine, Code2, LineChart, Lightbulb, Palette } from 'lucide-react';

interface ConversationStartersProps {
  onSelectPrompt: (prompt: string) => void;
}

const CHIPS = [
  { label: 'Brainstorm', icon: Lightbulb, prompt: 'Help me brainstorm fresh concepts for ' },
  { label: 'Write', icon: PenLine, prompt: 'Draft a clear, compelling message about ' },
  { label: 'Code', icon: Code2, prompt: 'Explain how to architect a solution for ' },
  { label: 'Analyze', icon: LineChart, prompt: 'Break down the key tradeoffs and metrics of ' },
  { label: 'Create', icon: Palette, prompt: 'Generate an imaginative creative concept for ' },
];

export const ConversationStarters: React.FC<ConversationStartersProps> = ({ onSelectPrompt }) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-lg mx-auto text-center select-none">
      {/* Brand Icon & Heading */}
      <div className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-emerald-400 mb-4 shadow-sm">
        <Sparkles className="w-5 h-5" />
      </div>

      <h1 className="text-xl sm:text-2xl font-semibold text-slate-100 mb-2 tracking-tight">
        What can I help you with?
      </h1>
      <p className="text-xs text-slate-400 mb-6 max-w-xs leading-relaxed">
        Ask questions, brainstorm ideas, write content, or review code.
      </p>

      {/* Minimal Suggestion Chips */}
      <div className="flex flex-wrap gap-2 justify-center max-w-md">
        {CHIPS.map((chip) => {
          const Icon = chip.icon;
          return (
            <button
              key={chip.label}
              onClick={() => onSelectPrompt(chip.prompt)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs text-slate-300 hover:text-white transition-all active:scale-95"
            >
              <Icon className="w-3.5 h-3.5 text-slate-400" />
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
