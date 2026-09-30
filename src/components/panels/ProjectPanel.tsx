import React, { useState } from 'react';
import { ArrowLeft, Plus, FolderKanban, MessageSquare, ArrowRight, Trash2, X } from 'lucide-react';
import { Project, Conversation } from '../../../shared/types';

interface ProjectPanelProps {
  onBack: () => void;
  projects: Project[];
  conversations: Conversation[];
  activeConversationId: string | null;
  onCreateProject: (name: string, description: string) => void;
  onDeleteProject: (id: string) => void;
  onSelectConversation: (id: string) => void;
  onAddConversationToProject: (projectId: string, conversationId: string) => void;
}

export const ProjectPanel: React.FC<ProjectPanelProps> = ({
  onBack,
  projects,
  conversations,
  activeConversationId,
  onCreateProject,
  onDeleteProject,
  onSelectConversation,
  onAddConversationToProject,
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projects[0]?.id || null);
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || projects[0] || null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onCreateProject(newTitle.trim(), newDesc.trim() || 'General project workspace');
    setNewTitle('');
    setNewDesc('');
    setIsCreating(false);
  };

  const projectConversations = selectedProject
    ? conversations.filter((c) => selectedProject.conversationIds.includes(c.id))
    : [];

  const handleHeaderBack = () => {
    if (mobileView === 'detail') {
      setMobileView('list');
    } else {
      onBack();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#07090e] overflow-hidden">
      {/* Top Header with Prominent Back Button */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-white/[0.06] bg-[#080b12] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={handleHeaderBack}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
            aria-label={mobileView === 'detail' ? 'Back to project list' : 'Back to chat'}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{mobileView === 'detail' ? 'Projects' : 'Back'}</span>
          </button>
          <div className="h-4 w-px bg-white/[0.08] shrink-0" />
          <h1 className="text-sm font-semibold text-white truncate">
            {mobileView === 'detail' && selectedProject ? selectedProject.name : 'Projects'}
          </h1>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Project</span>
        </button>
      </div>

      {/* Main Grid: Projects List + Project Detail */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Left: Project Cards (Hidden on mobile when viewing detail) */}
        <div className={`w-full md:w-80 border-r border-white/[0.06] p-4 overflow-y-auto space-y-2 shrink-0 ${mobileView === 'detail' ? 'hidden md:block' : 'block'}`}>
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2">
            ALL PROJECTS ({projects.length})
          </div>

          {projects.map((project) => {
            const isSelected = selectedProject?.id === project.id;
            return (
              <div
                key={project.id}
                onClick={() => {
                  setSelectedProjectId(project.id);
                  setMobileView('detail');
                }}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                  isSelected
                    ? 'border-emerald-500/40 bg-emerald-950/20 text-white'
                    : 'border-white/[0.06] bg-white/[0.02] text-slate-300 hover:border-white/[0.12] hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-xs text-white truncate pr-2">{project.name}</h3>
                  <span className="text-[10px] text-slate-500 shrink-0">
                    {project.conversationIds.length} chats
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-1 mb-2">{project.description}</p>
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteProject(project.id);
                    }}
                    className="p-1 hover:text-rose-400 transition-colors"
                    title="Delete project"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Selected Project Detail (Hidden on mobile when viewing list) */}
        <div className={`flex-1 p-4 sm:p-6 overflow-y-auto space-y-6 ${mobileView === 'list' ? 'hidden md:block' : 'block'}`}>
          {selectedProject ? (
            <>
              {/* Project Title Banner */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-white">{selectedProject.name}</h2>
                  {activeConversationId && !selectedProject.conversationIds.includes(activeConversationId) && (
                    <button
                      onClick={() => onAddConversationToProject(selectedProject.id, activeConversationId)}
                      className="px-2.5 py-1 rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/30 text-xs font-medium transition-colors"
                    >
                      + Add Active Chat
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-400">{selectedProject.description}</p>
              </div>

              {/* Linked Conversations Section */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Linked Conversations ({projectConversations.length})</span>
                </h3>

                {projectConversations.length === 0 ? (
                  <div className="p-6 text-center rounded-xl border border-dashed border-white/[0.08] text-xs text-slate-500">
                    No conversations linked yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {projectConversations.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => onSelectConversation(c.id)}
                        className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.04] cursor-pointer transition-all group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-semibold text-xs text-white truncate pr-2">{c.title}</h4>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-2">
                          {c.previewMessage || 'No recent messages'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              Select or create a project to view contents.
            </div>
          )}
        </div>
      </div>

      {/* Create Project Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-[#0f1422] border border-white/[0.08] rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-white">Create New Project</h3>
              <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Design System"
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="What is this project about?"
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-slate-500 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-xs hover:bg-emerald-400"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
