import React, { useState } from 'react';
import { ArrowLeft, Eye, Code2, Share2, Download, Copy, Check } from 'lucide-react';

export interface ArtifactData {
  id: string;
  title: string;
  type: 'html' | 'react' | 'svg' | 'markdown' | 'text';
  code: string;
  previewUrl?: string;
}

interface ArtifactWorkspaceProps {
  artifact: ArtifactData;
  onBack: () => void;
  onShare?: () => void;
}

export const ArtifactWorkspace: React.FC<ArtifactWorkspaceProps> = ({
  artifact,
  onBack,
  onShare,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(artifact.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([artifact.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title.toLowerCase().replace(/\s+/g, '-')}.${artifact.type === 'react' ? 'tsx' : artifact.type}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#07090e] overflow-hidden">
      {/* Top Header with Back button and Artifact Contextual Controls */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-white/[0.06] bg-[#080b12] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
            aria-label="Back to chat"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div className="h-4 w-px bg-white/[0.08] shrink-0" />
          <h1 className="text-sm font-semibold text-white truncate max-w-xs sm:max-w-md">
            {artifact.title}
          </h1>
        </div>

        {/* Tab Controls + Actions */}
        <div className="flex items-center gap-2">
          {/* Preview / Code Tab Pill */}
          <div className="flex rounded-lg bg-white/[0.04] p-0.5 border border-white/[0.06] text-xs">
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors ${
                activeTab === 'preview'
                  ? 'bg-white/[0.1] text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
            <button
              onClick={() => setActiveTab('code')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors ${
                activeTab === 'code'
                  ? 'bg-white/[0.1] text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Code</span>
            </button>
          </div>

          {/* Copy Action */}
          <button
            onClick={handleCopy}
            title="Copy code"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>

          {/* Download Action */}
          <button
            onClick={handleDownload}
            title="Download artifact"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Share Action */}
          {onShare && (
            <button
              onClick={onShare}
              title="Share artifact"
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Workspace Body */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {activeTab === 'preview' ? (
          <div className="w-full h-full bg-[#0a0e17] flex items-center justify-center p-4">
            {artifact.type === 'svg' || artifact.type === 'html' ? (
              <iframe
                title={artifact.title}
                srcDoc={artifact.code}
                className="w-full h-full max-w-4xl bg-white rounded-xl shadow-lg border border-slate-300"
                sandbox="allow-scripts"
              />
            ) : (
              <div className="w-full h-full max-w-3xl rounded-xl bg-white/[0.02] border border-white/[0.06] p-6 overflow-y-auto font-sans leading-relaxed text-slate-200">
                <div className="prose prose-invert max-w-none text-sm whitespace-pre-wrap">
                  {artifact.code}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full overflow-auto bg-[#07090e] p-4 font-mono text-xs text-slate-200 leading-relaxed">
            <pre className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] min-w-full">
              <code>{artifact.code}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
