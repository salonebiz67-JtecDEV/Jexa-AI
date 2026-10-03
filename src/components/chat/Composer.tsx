import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowUp,
  Mic,
  MicOff,
  Plus,
  Radio,
  Paperclip,
  Globe,
  Sparkles,
  X,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { LiveVoiceStatus } from '../../hooks/useLiveVoice';

interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'file';
  size?: string;
  url?: string;
}

interface ComposerProps {
  onSendMessage: (text: string, attachments?: Attachment[]) => void;
  onOpenLive: () => void;
  liveStatus?: LiveVoiceStatus;
  disabled?: boolean;
}

export const Composer: React.FC<ComposerProps> = ({
  onSendMessage,
  onOpenLive,
  liveStatus = 'idle',
  disabled = false,
}) => {
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [webSearchActive, setWebSearchActive] = useState(false);
  const [deepThinkActive, setDeepThinkActive] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  // Web Speech API Voice-to-text hook
  const {
    isListening,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition((recognizedText) => {
    setInputText((prev) => (prev.trim() ? `${prev.trim()} ${recognizedText}` : recognizedText));
  });

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [inputText]);

  // Click outside to close tools menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setShowToolsMenu(false);
      }
    };
    if (showToolsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showToolsMenu]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputText.trim() && attachments.length === 0) || disabled) return;

    if (isListening) {
      stopListening();
    }
    resetTranscript();

    let finalPrompt = inputText.trim();
    if (webSearchActive) {
      finalPrompt = `[Web Search Requested] ${finalPrompt}`;
    }
    if (deepThinkActive) {
      finalPrompt = `[Deep Think Reasoning] ${finalPrompt}`;
    }

    onSendMessage(finalPrompt, attachments.length > 0 ? attachments : undefined);
    setInputText('');
    setAttachments([]);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const isImg = file.type.startsWith('image/');
      const newAtt: Attachment = {
        id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: file.name,
        type: isImg ? 'image' : 'file',
        size: `${Math.round(file.size / 1024)} KB`,
        url: isImg ? URL.createObjectURL(file) : undefined,
      };
      setAttachments((prev) => [...prev, newAtt]);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const canSend = (inputText.trim().length > 0 || attachments.length > 0) && !disabled;

  return (
    <div className="p-2 sm:p-4 max-w-3xl lg:max-w-4xl mx-auto w-full pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Floating Composer Container */}
      <div className="relative rounded-2xl bg-[#0f1422] border border-white/[0.08] shadow-lg transition-all focus-within:border-white/[0.16] overflow-hidden">
        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 p-2.5 pb-0">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.06] text-xs text-slate-300"
              >
                {att.type === 'image' ? (
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-cyan-400" />
                )}
                <span className="truncate max-w-[120px]">{att.name}</span>
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="p-0.5 text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Text Area */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message JEXA..."
          className="w-full bg-transparent px-3.5 pt-3 pb-1 text-base sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none resize-none leading-relaxed min-h-[44px]"
        />

        {/* Bottom Action Row */}
        <div className="flex items-center justify-between px-2.5 pb-2 pt-1">
          {/* Left Actions: Attachments + Tools Menu */}
          <div className="flex items-center gap-1 relative" ref={toolsMenuRef}>
            {/* Attachment Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
              title="Add attachment"
              aria-label="Add attachment"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* Tools Menu Toggle */}
            <button
              type="button"
              onClick={() => setShowToolsMenu(!showToolsMenu)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                webSearchActive || deepThinkActive
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Tools</span>
            </button>

            {/* Tools Dropdown */}
            {showToolsMenu && (
              <div className="absolute left-0 bottom-full mb-2 w-48 rounded-xl bg-[#0b0f19] border border-white/[0.08] shadow-2xl py-1.5 z-40 text-xs">
                <button
                  type="button"
                  onClick={() => setWebSearchActive(!webSearchActive)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                    webSearchActive ? 'text-emerald-400 bg-white/[0.04]' : 'text-slate-300 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5" />
                    <span>Web Search</span>
                  </div>
                  {webSearchActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                </button>

                <button
                  type="button"
                  onClick={() => setDeepThinkActive(!deepThinkActive)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                    deepThinkActive ? 'text-emerald-400 bg-white/[0.04]' : 'text-slate-300 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Deep Think</span>
                  </div>
                  {deepThinkActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                </button>
              </div>
            )}
          </div>

          {/* Right Actions: LIVE + Voice Mic + Send */}
          <div className="flex items-center gap-1.5">
            {/* LIVE Voice Companion Pill */}
            <button
              type="button"
              onClick={onOpenLive}
              title="Toggle Live Voice session"
              aria-label="Toggle Live Voice session"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all ${
                liveStatus === 'connecting'
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                  : liveStatus === 'speaking' || liveStatus === 'listening' || liveStatus === 'processing'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : liveStatus === 'error'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.06] text-slate-400 hover:text-slate-200'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  liveStatus === 'connecting'
                    ? 'bg-cyan-400 animate-ping'
                    : liveStatus === 'speaking' || liveStatus === 'listening' || liveStatus === 'processing'
                    ? 'bg-emerald-400 animate-pulse'
                    : liveStatus === 'error'
                    ? 'bg-rose-400'
                    : 'bg-slate-500'
                }`}
              />
              <span>
                {liveStatus === 'connecting'
                  ? 'LIVE CONNECTING'
                  : liveStatus === 'speaking' || liveStatus === 'listening' || liveStatus === 'processing'
                  ? 'LIVE'
                  : liveStatus === 'error'
                  ? 'LIVE ERROR'
                  : 'LIVE OFF'}
              </span>
            </button>

            {/* Voice Dictation Button */}
            <button
              type="button"
              onClick={isListening ? stopListening : startListening}
              disabled={!isSupported && !isListening}
              className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg transition-colors ${
                isListening
                  ? 'bg-rose-500/20 text-rose-400 animate-pulse'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
              }`}
              title={isListening ? 'Stop recording' : 'Voice dictation'}
              aria-label="Voice input"
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            {/* Send Button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSend}
              className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl transition-all ${
                canSend
                  ? 'bg-white text-slate-950 hover:bg-slate-200 active:scale-95 shadow-sm'
                  : 'bg-white/[0.06] text-slate-500 cursor-not-allowed'
              }`}
              title="Send message"
              aria-label="Send message"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
