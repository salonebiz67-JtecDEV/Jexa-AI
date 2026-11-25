import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Plus,
  Search,
  KeyRound,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  X,
  ShieldCheck,
  AlertTriangle,
  Check,
  Lock,
} from 'lucide-react';
import {
  StoredVariable,
  deleteVariable,
  getVariablesStorageMode,
  initVariablesStorage,
  listVariables,
  replaceVariable,
  subscribeVariables,
  validateVariableName,
} from '../../services/variablesStorage';
import { showToast } from '../../services/toast';

interface VariablesPanelProps {
  onBack: () => void;
}

const SUGGESTED_VARIABLE_NAMES = [
  'GEMINI_API_KEY',
  'TEXT_AI_MODEL',
  'VOICE_AI_MODEL',
  'BACKEND_URL',
];

export const VariablesPanel: React.FC<VariablesPanelProps> = ({ onBack }) => {
  const [variables, setVariables] = useState<StoredVariable[]>(() => listVariables());
  const [storageMode, setStorageMode] = useState(() => getVariablesStorageMode());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(() => new Set());

  // Add / Edit Modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingOriginalName, setEditingOriginalName] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [showDraftValue, setShowDraftValue] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete Confirmation Modal state
  const [deleteTargetName, setDeleteTargetName] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    void initVariablesStorage().then(() => {
      if (!active) return;
      setVariables(listVariables());
      setStorageMode(getVariablesStorageMode());
      setLoading(false);
    });

    const unsubscribe = subscribeVariables(() => {
      setVariables(listVariables());
      setStorageMode(getVariablesStorageMode());
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Android Hardware Back closes open modals cleanly before navigating away
  useEffect(() => {
    const handleHardwareBack = (e: Event) => {
      if (deleteTargetName) {
        e.preventDefault();
        setDeleteTargetName(null);
        return;
      }
      if (editorOpen) {
        e.preventDefault();
        setEditorOpen(false);
      }
    };
    window.addEventListener('jexa:hardware-back', handleHardwareBack);
    return () => window.removeEventListener('jexa:hardware-back', handleHardwareBack);
  }, [deleteTargetName, editorOpen]);

  const filteredVariables = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return variables;
    return variables.filter((v) => v.name.toLowerCase().includes(q));
  }, [variables, searchQuery]);

  const hasGeminiKey = useMemo(
    () => variables.some((v) => v.name === 'GEMINI_API_KEY' && v.value.trim().length > 0),
    [variables]
  );

  const toggleRevealKey = (name: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const openAddModal = (prefillName = '') => {
    setEditingOriginalName(null);
    setDraftName(prefillName);
    setDraftValue('');
    setShowDraftValue(false);
    setFormError(null);
    setEditorOpen(true);
  };

  const openEditModal = (item: StoredVariable) => {
    setEditingOriginalName(item.name);
    setDraftName(item.name);
    setDraftValue(item.value);
    setShowDraftValue(false);
    setFormError(null);
    setEditorOpen(true);
  };

  const handleSaveVariable = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const validation = validateVariableName(draftName);
    if (!validation.valid) {
      setFormError(validation.error || 'Invalid variable name.');
      return;
    }

    if (!draftValue || draftValue.trim().length === 0) {
      setFormError('Enter a value for this variable.');
      return;
    }

    setSaving(true);
    try {
      await replaceVariable(editingOriginalName, validation.name, draftValue);
      setEditorOpen(false);
      setDraftValue('');
      setShowDraftValue(false);
      showToast(editingOriginalName ? 'Variable updated' : 'Variable saved locally', 'success');
    } catch (err: any) {
      setFormError(err?.message || 'Unable to save variable.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetName) return;
    setDeleting(true);
    try {
      await deleteVariable(deleteTargetName);
      setRevealedKeys((prev) => {
        const next = new Set(prev);
        next.delete(deleteTargetName);
        return next;
      });
      setDeleteTargetName(null);
      showToast('Variable deleted', 'info');
    } catch {
      showToast('Could not delete variable.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const storageLabel =
    storageMode === 'android_keystore'
      ? 'Android Keystore (Device Encrypted)'
      : storageMode === 'web_local_storage'
      ? 'Local Browser Storage'
      : 'Session Memory Fallback';

  const normalizedDraftName = draftName.trim();
  const willReplaceExisting =
    Boolean(normalizedDraftName) &&
    variables.some((v) => v.name === normalizedDraftName) &&
    normalizedDraftName !== editingOriginalName;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#07090e] overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-white/[0.07] bg-[#090d16] pt-safe pl-safe pr-safe">
        <div className="flex items-center justify-between h-14 px-3 sm:px-5 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="min-h-[44px] px-2.5 flex items-center gap-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              aria-label="Back to chat"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <div className="h-4 w-px bg-white/[0.08] shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-white truncate">Variables</h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => openAddModal()}
            className="min-h-[44px] px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Variable</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto scrollbar-none p-3 sm:p-5 pb-safe pl-safe pr-safe">
        <div className="max-w-3xl mx-auto space-y-4 pb-10">
          {/* Local Security & Gemini Status Summary */}
          <div className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08] space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">{storageLabel}</div>
                  <div className="text-[11px] text-slate-400">
                    Saved locally on this device only — never synced to GitHub, Render, or cloud databases.
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-400 font-mono">GEMINI_API_KEY</span>
              <span
                className={`inline-flex items-center gap-1.5 font-medium ${
                  hasGeminiKey ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    hasGeminiKey ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                {hasGeminiKey ? 'Configured on device' : 'Not set'}
              </span>
            </div>
          </div>

          {/* Search Input & Counter */}
          <div className="flex items-center gap-2.5">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search saved variable names..."
                aria-label="Search saved variables"
                className="w-full min-h-[44px] pl-10 pr-10 py-2 rounded-xl bg-[#0b101b] border border-white/[0.09] text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[38px] min-h-[38px] flex items-center justify-center text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="px-3 py-2.5 rounded-xl bg-[#0b101b] border border-white/[0.08] text-[11px] font-mono tabular-nums text-slate-400 shrink-0 whitespace-nowrap">
              {filteredVariables.length}
              {searchQuery ? ` / ${variables.length}` : ''} {variables.length === 1 ? 'var' : 'vars'}
            </div>
          </div>

          {/* Variable List */}
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Loading device variables…
            </div>
          ) : variables.length === 0 ? (
            <div className="p-6 rounded-2xl bg-[#0b101b] border border-white/[0.08] text-center space-y-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <KeyRound className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-white">No variables saved yet</h2>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  Add your <span className="font-mono text-slate-200">GEMINI_API_KEY</span> or other environment variables here to power JEXA directly from your device.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => openAddModal('GEMINI_API_KEY')}
                  className="min-h-[44px] px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add GEMINI_API_KEY</span>
                </button>
              </div>
            </div>
          ) : filteredVariables.length === 0 ? (
            <div className="p-6 rounded-2xl bg-[#0b101b] border border-white/[0.08] text-center space-y-2">
              <p className="text-xs text-slate-400">
                No variables match "<span className="font-mono text-slate-200">{searchQuery}</span>".
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="min-h-[44px] px-3 text-xs font-medium text-emerald-400 hover:text-emerald-300 cursor-pointer"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredVariables.map((item) => {
                const isRevealed = revealedKeys.has(item.name);
                return (
                  <div
                    key={item.name}
                    className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08] hover:border-white/[0.14] transition-colors space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <KeyRound className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="font-mono text-xs sm:text-sm font-semibold text-white truncate">
                            {item.name}
                          </span>
                          {item.name === 'GEMINI_API_KEY' && (
                            <span className="text-[10px] font-medium text-emerald-400 shrink-0">
                              · Active AI Key
                            </span>
                          )}
                        </div>

                        <div className="pl-5.5">
                          {isRevealed ? (
                            <div className="font-mono text-xs text-emerald-300 break-all bg-black/40 border border-white/[0.07] rounded-lg px-2.5 py-2 select-all">
                              {item.value}
                            </div>
                          ) : (
                            <div className="font-mono text-xs text-slate-400 flex items-center gap-2">
                              <span tracking-widest="true">••••••••••••</span>
                              <span className="text-[10px] text-slate-500 tabular-nums">
                                · {item.value.length} chars
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleRevealKey(item.name)}
                          aria-label={isRevealed ? `Hide value for ${item.name}` : `Reveal value for ${item.name}`}
                          title={isRevealed ? 'Hide value' : 'Reveal value'}
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors active:scale-95 cursor-pointer"
                        >
                          {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          aria-label={`Edit ${item.name}`}
                          title="Edit / Replace"
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-white/[0.06] transition-colors active:scale-95 cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeleteTargetName(item.name)}
                          aria-label={`Delete ${item.name}`}
                          title="Delete"
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors active:scale-95 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Variable Modal */}
      {editorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm pt-safe pb-safe pl-safe pr-safe"
          onClick={() => {
            setEditorOpen(false);
            setDraftValue('');
          }}
        >
          <div
            className="w-full max-w-md bg-[#0d121f] border border-white/[0.1] rounded-2xl shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-white">
                  {editingOriginalName ? 'Edit Variable' : 'Add Variable'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditorOpen(false);
                  setDraftValue('');
                }}
                aria-label="Close modal"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveVariable} className="space-y-3.5">
              {/* Quick Name Suggestions when adding */}
              {!editingOriginalName && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-slate-400">Common names</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {SUGGESTED_VARIABLE_NAMES.map((suggested) => (
                      <button
                        key={suggested}
                        type="button"
                        onClick={() => setDraftName(suggested)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono transition-colors cursor-pointer ${
                          draftName.trim() === suggested
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                            : 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:bg-white/[0.07]'
                        }`}
                      >
                        {suggested}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="jexa-var-name" className="block text-[11px] font-medium text-slate-300">
                  Variable Name
                </label>
                <input
                  id="jexa-var-name"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  autoFocus={!editingOriginalName}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="GEMINI_API_KEY"
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-black/50 border border-white/[0.1] text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="jexa-var-value" className="block text-[11px] font-medium text-slate-300">
                    Value
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowDraftValue((v) => !v)}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer py-1 px-1.5"
                  >
                    {showDraftValue ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showDraftValue ? 'Hide' : 'Reveal'}</span>
                  </button>
                </div>
                {showDraftValue ? (
                  <textarea
                    id="jexa-var-value"
                    rows={3}
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus={Boolean(editingOriginalName)}
                    value={draftValue}
                    onChange={(e) => setDraftValue(e.target.value)}
                    placeholder="Paste value here..."
                    className="w-full px-3 py-2.5 rounded-xl bg-black/50 border border-white/[0.1] text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 resize-y"
                  />
                ) : (
                  <input
                    id="jexa-var-value"
                    type="password"
                    autoComplete="new-password"
                    autoFocus={Boolean(editingOriginalName)}
                    value={draftValue}
                    onChange={(e) => setDraftValue(e.target.value)}
                    placeholder="Enter secret or configuration value..."
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-black/50 border border-white/[0.1] text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                )}
              </div>

              {willReplaceExisting && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-200 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>A variable with this name already exists. Saving will replace its value.</span>
                </div>
              )}

              {formError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300">
                  {formError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditorOpen(false);
                    setDraftValue('');
                  }}
                  className="min-h-[44px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-slate-300 cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  <Check className="w-4 h-4" />
                  <span>{saving ? 'Saving…' : 'Save Variable'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTargetName && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm pt-safe pb-safe pl-safe pr-safe"
          onClick={() => setDeleteTargetName(null)}
        >
          <div
            className="w-full max-w-sm bg-[#0d121f] border border-white/[0.1] rounded-2xl shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Delete variable?</h3>
                <p className="text-[11px] text-slate-400">
                  This removes the variable from local device storage.
                </p>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.06] text-xs font-mono text-slate-200 truncate">
              {deleteTargetName}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteTargetName(null)}
                className="min-h-[44px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
