import React, { useState } from 'react';
import { ArrowLeft, Download, Share2, Trash2, FolderPlus, X, ZoomIn, Check } from 'lucide-react';
import { ImageItem, Project } from '../../../shared/types';

interface ImageLibraryProps {
  onBack: () => void;
  images: ImageItem[];
  projects: Project[];
  onDeleteImage: (id: string) => void;
  onAddImageToProject: (imageId: string, projectId: string) => void;
}

export const ImageLibrary: React.FC<ImageLibraryProps> = ({
  onBack,
  images,
  projects,
  onDeleteImage,
  onAddImageToProject,
}) => {
  const [activeImage, setActiveImage] = useState<ImageItem | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [addedSuccess, setAddedSuccess] = useState(false);

  const handleShare = (img: ImageItem) => {
    navigator.clipboard.writeText(img.url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleDownload = (img: ImageItem) => {
    const a = document.createElement('a');
    a.href = img.url;
    a.download = `jexa-image-${img.id}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleAddToProject = () => {
    if (!activeImage || !selectedProjectId) return;
    onAddImageToProject(activeImage.id, selectedProjectId);
    setAddedSuccess(true);
    setTimeout(() => setAddedSuccess(false), 2000);
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
          <h1 className="text-sm font-semibold text-white">Image Library</h1>
        </div>

        <div className="text-xs text-slate-500">
          <span>{images.length} Visuals</span>
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {images.map((img) => (
            <div
              key={img.id}
              onClick={() => setActiveImage(img)}
              className="group relative rounded-xl overflow-hidden border border-white/[0.06] bg-[#0f1422] cursor-pointer shadow-sm hover:border-white/[0.16] transition-all"
            >
              <div className="aspect-square w-full overflow-hidden bg-black/40">
                <img
                  src={img.url}
                  alt={img.prompt}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2.5 flex flex-col justify-between">
                <div className="flex justify-end">
                  <div className="p-1 rounded-md bg-black/60 text-white backdrop-blur-sm">
                    <ZoomIn className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-white font-medium line-clamp-2 drop-shadow">
                    {img.prompt}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Lightbox Modal */}
      {activeImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-2xl bg-[#0f1422] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Lightbox Header with Back button */}
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/[0.06] bg-[#0b0f19]">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <button
                  onClick={() => setActiveImage(null)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
                  aria-label="Back"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <div className="h-4 w-px bg-white/[0.08] shrink-0" />
                <span className="text-xs font-semibold text-slate-300 truncate">
                  {activeImage.prompt}
                </span>
              </div>
              <button
                onClick={() => setActiveImage(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Image Preview */}
            <div className="flex-1 bg-black flex items-center justify-center p-2 overflow-hidden min-h-[260px]">
              <img
                src={activeImage.url}
                alt={activeImage.prompt}
                className="max-h-[55vh] max-w-full object-contain rounded-lg"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Lightbox Controls */}
            <div className="p-3 bg-[#080b12] border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(activeImage)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>

                <button
                  onClick={() => handleShare(activeImage)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 transition-colors"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Copied' : 'Share'}</span>
                </button>

                {projects.length > 0 && (
                  <div className="flex items-center gap-1.5 pl-2 border-l border-white/[0.08]">
                    <select
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      className="bg-slate-900 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddToProject}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-200"
                    >
                      {addedSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <FolderPlus className="w-3.5 h-3.5" />}
                      <span>{addedSuccess ? 'Added' : 'Project'}</span>
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  onDeleteImage(activeImage.id);
                  setActiveImage(null);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
