import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowUp,
  Mic,
  MicOff,
  Plus,
  Radio,
  Globe,
  Sparkles,
  X,
  FileText,
  Image as ImageIcon,
  Check,
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
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [webSearchActive, setWebSearchActive] = useState(false);
  const [deepThinkActive, setDeepThinkActive] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);

  // Web Speech API Voice-to-text hook (distinct from LIVE voice)
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

  // Click outside to close plus menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setShowPlusMenu(false);
      }
    };
    if (showPlusMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPlusMenu]);

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, forceType?: 'image' | 'file') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const isImg = forceType === 'image' || file.type.startsWith('image/');
      const newAtt: Attachment = {
        id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: file.name,
        type: isImg ? 'image' : 'file',
        size: `${Math.round(file.size / 1024)} KB`,
        url: isImg ? URL.createObjectURL(file) : undefined,
      };
      setAttachments((prev) => [...prev, newAtt]);
    });

    if (e.target) {
      e.target.value = '';
    }
    setShowPlusMenu(false);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Has typed text or attached files
  const hasContent = inputText.trim().length > 0 || attachments.length > 0;
  const canSend = hasContent && !disabled;

  return (
    <div className="p-2.5 sm:p-4 max-w-3xl lg:max-w-4xl mx-auto w-full pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {/* Hidden File Inputs for functional Plus button */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFileUpload(e, 'file')}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFileUpload(e, 'image')}
      />

      {/* Modern ChatGPT-style rounded capsule composer */}
      <div className="relative rounded-[24px] sm:rounded-[28px] bg-[#0c101d] border border-white/[0.09] shadow-[0_8px_30px_rgb(0,0,0,0.5)] focus-within:border-cyan-500/40 focus-within:shadow-[0_0_24px_rgba(6,182,212,0.15)] transition-all duration-200">
        {/* Active attachment & tool chips */}
        {(attachments.length > 0 || webSearchActive || deepThinkActive) && (
          <div className="flex flex-wrap items-center gap-1.5 px-3.5 pt-3 pb-1 border-b border-white/[0.04]">
            {/* Attachments */}
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.08] text-xs text-slate-200 animate-fadeIn"
              >
                {att.type === 'image' ? (
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                )}
                <span className="truncate max-w-[120px] sm:max-w-[180px] font-medium">{att.name}</span>
                {att.size && <span className="text-[10px] text-slate-400 font-mono">({att.size})</span>}
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="p-0.5 text-slate-400 hover:text-white transition-colors cursor-pointer ml-0.5"
                  aria-label="Remove attachment"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            {/* Active Web Search Badge */}
            {webSearchActive && (
              <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-[11px] font-medium text-cyan-300">
                <Globe className="w-3 h-3 text-cyan-400" />
                <span>Web Search Active</span>
                <button
                  type="button"
                  onClick={() => setWebSearchActive(false)}
                  className="p-0.5 text-cyan-400 hover:text-white transition-colors cursor-pointer"
                  title="Disable Web Search"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Active Deep Think Badge */}
            {deepThinkActive && (
              <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-medium text-emerald-300">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                <span>Deep Think Active</span>
                <button
                  type="button"
                  onClick={() => setDeepThinkActive(false)}
                  className="p-0.5 text-emerald-400 hover:text-white transition-colors cursor-pointer"
                  title="Disable Deep Think"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Main Input Row: [Plus] [Textarea] [Dynamic Action Buttons] */}
        <div className="flex items-end gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2">
          {/* Functional Plus (+) Button on the Left */}
          <div className="relative shrink-0 mb-0.5" ref={plusMenuRef}>
            <button
              type="button"
              onClick={() => setShowPlusMenu(!showPlusMenu)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${
                showPlusMenu
                  ? 'bg-white/[0.15] text-white rotate-45'
                  : 'bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white'
              }`}
              title="Add attachments or tools"
              aria-label="Add attachments or tools"
              aria-expanded={showPlusMenu}
            >
              <Plus className="w-5 h-5 transition-transform duration-200" />
            </button>

            {/* Plus Action Sheet / Menu */}
            {showPlusMenu && (
              <div className="absolute left-0 bottom-full mb-2.5 w-56 rounded-2xl bg-[#0f1424] border border-white/[0.1] shadow-2xl py-1.5 z-50 text-xs text-slate-200 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider text-slate-500 font-mono">
                  Attachments & Tools
                </div>

                <button
                  type="button"
                  onClick={() => {
                    imageInputRef.current?.click();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.06] text-left transition-colors cursor-pointer text-slate-200 hover:text-white"
                >
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-medium">Photos & Images</div>
                    <div className="text-[10px] text-slate-400">JPG, PNG, WebP</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.06] text-left transition-colors cursor-pointer text-slate-200 hover:text-white"
                >
                  <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-medium">Files & Documents</div>
                    <div className="text-[10px] text-slate-400">PDF, TXT, Code files</div>
                  </div>
                </button>

                <div className="my-1 border-t border-white/[0.06]" />

                <button
                  type="button"
                  onClick={() => {
                    setWebSearchActive(!webSearchActive);
                    setShowPlusMenu(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.06] text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-200">Search Web</div>
                      <div className="text-[10px] text-slate-400">Live internet facts</div>
                    </div>
                  </div>
                  {webSearchActive ? (
                    <div className="w-4 h-4 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-mono">Off</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDeepThinkActive(!deepThinkActive);
                    setShowPlusMenu(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.06] text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-200">Deep Think</div>
                      <div className="text-[10px] text-slate-400">Reasoning step-by-step</div>
                    </div>
                  </div>
                  {deepThinkActive ? (
                    <div className="w-4 h-4 rounded-full bg-purple-500 text-slate-950 flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-mono">Off</span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Text Input in Center */}
          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message JEXA..."
              className="w-full bg-transparent px-2 py-2 text-[15px] sm:text-base text-slate-100 placeholder-slate-500 focus:outline-none resize-none leading-relaxed min-h-[40px] max-h-[140px] block"
            />
          </div>

          {/* Dynamic Right Actions: Switch between [Mic + LIVE] and [Send] */}
          <div className="flex items-center gap-1.5 shrink-0 mb-0.5">
            {hasContent ? (
              /* As soon as text is typed: Show Circular Send Button */
              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={!canSend}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer ${
                  canSend
                    ? 'bg-white text-slate-950 hover:bg-slate-200 active:scale-95 shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                    : 'bg-white/[0.08] text-slate-500 cursor-not-allowed'
                }`}
                title="Send message"
                aria-label="Send message"
              >
                <ArrowUp className="w-5 h-5 stroke-[2.5]" />
              </button>
            ) : (
              /* When input is empty: Show Microphone AND prominent LIVE voice button */
              <div className="flex items-center gap-1 sm:gap-1.5">
                {/* Voice Dictation (Speech-to-text recording) */}
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  disabled={!isSupported && !isListening}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer ${
                    isListening
                      ? 'bg-rose-500/25 text-rose-400 border border-rose-500/40 animate-pulse'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.08]'
                  }`}
                  title={isListening ? 'Stop recording' : 'Voice dictation (speech-to-text)'}
                  aria-label="Voice dictation"
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                {/* Prominent LIVE Voice Conversation Button (Gemini Live API) */}
                <button
                  type="button"
                  onClick={onOpenLive}
                  title="Start LIVE Voice conversation with JEXA"
                  aria-label="Start LIVE Voice conversation with JEXA"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all duration-200 cursor-pointer active:scale-95 ${
                    liveStatus === 'connecting'
                      ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                      : liveStatus === 'speaking' || liveStatus === 'listening' || liveStatus === 'processing'
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                      : liveStatus === 'error'
                      ? 'bg-rose-500/20 border-rose-400/50 text-rose-200'
                      : 'bg-gradient-to-r from-cyan-500/10 via-emerald-500/10 to-cyan-500/10 hover:from-cyan-500/20 hover:to-emerald-500/20 border-cyan-500/30 hover:border-cyan-400/60 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                  }`}
                >
                  {/* Glowing pulsation indicator */}
                  <span className="relative flex h-2 w-2">
                    <span
                      className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        liveStatus === 'connecting'
                          ? 'bg-cyan-400'
                          : liveStatus === 'speaking' || liveStatus === 'listening' || liveStatus === 'processing'
                          ? 'bg-emerald-400'
                          : liveStatus === 'error'
                          ? 'bg-rose-400'
                          : 'bg-cyan-400'
                      }`}
                    />
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${
                        liveStatus === 'connecting'
                          ? 'bg-cyan-400'
                          : liveStatus === 'speaking' || liveStatus === 'listening' || liveStatus === 'processing'
                          ? 'bg-emerald-400'
                          : liveStatus === 'error'
                          ? 'bg-rose-400'
                          : 'bg-cyan-400'
                      }`}
                    />
                  </span>

                  <Radio className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="text-xs font-semibold tracking-wider font-['Syne',sans-serif]">
                    {liveStatus === 'connecting'
                      ? 'CONNECTING'
                      : liveStatus === 'speaking' || liveStatus === 'listening' || liveStatus === 'processing'
                      ? 'LIVE ACTIVE'
                      : 'LIVE'}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
