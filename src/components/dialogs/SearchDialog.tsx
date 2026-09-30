import React, { useState, useEffect, useRef } from 'react';
import { Search, X, MessageSquare, FolderKanban, Image as ImageIcon, ArrowRight, ArrowLeft } from 'lucide-react';
import { Conversation, Project, ImageItem } from '../../../shared/types';

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  projects: Project[];
  images: ImageItem[];
  onSelectConversation: (id: string) => void;
  onSelectProject: (id: string) => void;
}

export const SearchDialog: React.FC<SearchDialogProps> = ({
  isOpen,
  onClose,
  conversations,
  projects,
  images,
  onSelectConversation,
  onSelectProject,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const q = query.toLowerCase().trim();

  const matchingConversations = q
    ? conversations.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.previewMessage && c.previewMessage.toLowerCase().includes(q))
      )
    : conversations.slice(0, 5);

  const matchingProjects = q
    ? projects.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    : projects.slice(0, 3);

  const matchingImages = q
    ? images.filter((img) => img.prompt.toLowerCase().includes(q))
    : images.slice(0, 4);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:pt-24 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-xl bg-[#0e121d] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Search Input Bar with Back Button */}
        <div className="flex items-center px-3.5 py-3 border-b border-slate-800/80 gap-2.5">
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden xs:inline">Back</span>
          </button>
          <div className="h-4 w-px bg-white/[0.08] shrink-0" />
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations, projects, files..."
            className="flex-1 bg-transparent text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none min-w-0"
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-1 text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-[11px] px-2 py-1 rounded bg-slate-800/80 text-slate-400 hover:text-white transition-colors shrink-0"
          >
            ESC
          </button>
        </div>

        {/* Results Body */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto text-xs">
          {/* Conversations Section */}
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-1.5 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
              <span>Conversations</span>
            </div>
            {matchingConversations.length === 0 ? (
              <div className="px-2 py-2 text-slate-500">No matching conversations found.</div>
            ) : (
              <div className="space-y-1">
                {matchingConversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      onSelectConversation(c.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-slate-800/60 text-slate-200 transition-colors group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-medium text-xs text-white truncate">{c.title}</div>
                      {c.previewMessage && (
                        <div className="text-[11px] text-slate-400 truncate">{c.previewMessage}</div>
                      )}
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Projects Section */}
          {matchingProjects.length > 0 && (
            <div className="pt-2 border-t border-slate-800/60">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-1.5 flex items-center gap-1.5">
                <FolderKanban className="w-3.5 h-3.5 text-cyan-400" />
                <span>Projects</span>
              </div>
              <div className="space-y-1">
                {matchingProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectProject(p.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-slate-800/60 text-slate-200 transition-colors group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-medium text-xs text-white truncate">{p.name}</div>
                      <div className="text-[11px] text-slate-400 truncate">{p.description}</div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Images Section */}
          {matchingImages.length > 0 && (
            <div className="pt-2 border-t border-slate-800/60">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                <span>Images</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {matchingImages.map((img) => (
                  <div
                    key={img.id}
                    className="relative aspect-square rounded-lg overflow-hidden border border-slate-800 bg-slate-900 group"
                  >
                    <img
                      src={img.url}
                      alt={img.prompt}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity p-1 flex items-end">
                      <p className="text-[9px] text-white line-clamp-1">{img.prompt}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
