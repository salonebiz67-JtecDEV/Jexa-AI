import React, { useState } from 'react';
import { ArrowLeft, Plus, CalendarClock, Trash2, X } from 'lucide-react';
import { ScheduleItem } from '../../../shared/types';

interface SchedulePanelProps {
  onBack: () => void;
  schedules: ScheduleItem[];
  onToggleSchedule: (id: string) => void;
  onAddSchedule: (title: string, frequency: string, time: string) => void;
  onDeleteSchedule: (id: string) => void;
}

export const SchedulePanel: React.FC<SchedulePanelProps> = ({
  onBack,
  schedules,
  onToggleSchedule,
  onAddSchedule,
  onDeleteSchedule,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newFrequency, setNewFrequency] = useState('Daily');
  const [newTime, setNewTime] = useState('08:00 AM');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAddSchedule(newTitle.trim(), newFrequency, newTime);
    setNewTitle('');
    setIsAdding(false);
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
          <h1 className="text-sm font-semibold text-white">Scheduled Tasks</h1>
        </div>

        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Task</span>
        </button>
      </div>

      {/* Schedule Items List */}
      <div className="flex-1 p-6 overflow-y-auto max-w-2xl space-y-3">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-1">
          AUTOMATED ROUTINES
        </div>

        {schedules.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-slate-300">
                <CalendarClock className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="font-semibold text-xs text-white">{item.title}</h3>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {item.frequency} · {item.time}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Toggle Switch */}
              <button
                onClick={() => onToggleSchedule(item.id)}
                className={`w-10 h-6 rounded-full transition-colors relative p-0.5 ${
                  item.active ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
                aria-label={`Toggle ${item.title}`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    item.active ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>

              <button
                onClick={() => onDeleteSchedule(item.id)}
                className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                title="Delete task"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Task Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-[#0f1422] border border-white/[0.08] rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-white">Create Scheduled Task</h3>
              <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Daily Morning Brief"
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Frequency</label>
                  <select
                    value={newFrequency}
                    onChange={(e) => setNewFrequency(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none"
                  >
                    <option value="Daily" className="bg-slate-900">Daily</option>
                    <option value="Weekly (Monday)" className="bg-slate-900">Weekly (Monday)</option>
                    <option value="Weekdays" className="bg-slate-900">Weekdays</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Time</label>
                  <input
                    type="text"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    placeholder="08:00 AM"
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-xs hover:bg-emerald-400"
                >
                  Save Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
