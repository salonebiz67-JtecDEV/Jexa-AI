import { useState, useEffect, useRef, useCallback } from 'react';
import { showToast } from '../services/toast';

export type MicDictationStatus = 'idle' | 'listening' | 'processing';

interface SpeechRecognitionHook {
  status: MicDictationStatus;
  isListening: boolean;
  isProcessing: boolean;
  interimTranscript: string;
  transcript: string;
  isSupported: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

type SpeechRecognitionType = any;

function mapSpeechError(code?: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission denied. Please allow microphone access in your browser settings.';
    case 'audio-capture':
      return 'No microphone detected. Please connect or enable a microphone.';
    case 'network':
      return 'Voice dictation needs an active internet connection.';
    case 'no-speech':
      return 'No speech was detected. Tap the mic and try speaking again.';
    case 'aborted':
      return '';
    default:
      return code ? `Microphone error: ${code}` : 'Microphone dictation failed.';
  }
}

export function useSpeechRecognition(onResult?: (text: string) => void): SpeechRecognitionHook {
  const [status, setStatus] = useState<MicDictationStatus>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionType | null>(null);
  const onResultRef = useRef(onResult);
  const finalBufferRef = useRef('');
  const interimBufferRef = useRef('');
  const hasCommittedRef = useRef(false);
  const hadFatalErrorRef = useRef(false);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const isSupported =
    typeof window !== 'undefined' &&
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const commitIfAny = useCallback(() => {
    if (hasCommittedRef.current || hadFatalErrorRef.current) return;
    const text = (finalBufferRef.current || interimBufferRef.current).replace(/\s+/g, ' ').trim();
    if (text) {
      hasCommittedRef.current = true;
      setTranscript(text);
      onResultRef.current?.(text);
    }
  }, []);

  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      finalBufferRef.current = '';
      interimBufferRef.current = '';
      hasCommittedRef.current = false;
      hadFatalErrorRef.current = false;
      setError(null);
      setInterimTranscript('');
      setStatus('listening');
    };

    recognition.onresult = (event: any) => {
      let finals = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const piece = result?.[0]?.transcript || '';
        if (result.isFinal) {
          finals += (finals ? ' ' : '') + piece.trim();
        } else {
          interim += (interim ? ' ' : '') + piece.trim();
        }
      }

      if (finals) {
        finalBufferRef.current = finals;
      }
      interimBufferRef.current = interim;

      const combinedPreview = [finalBufferRef.current, interim].filter(Boolean).join(' ').trim();
      setInterimTranscript(combinedPreview);
    };

    recognition.onerror = (event: any) => {
      const code = event?.error;
      const friendly = mapSpeechError(code);
      if (code !== 'no-speech' && code !== 'aborted') {
        hadFatalErrorRef.current = true;
      }
      if (friendly) {
        setError(friendly);
        showToast(friendly, code === 'no-speech' ? 'info' : 'error');
      }
      setInterimTranscript('');
      setStatus('idle');
    };

    recognition.onend = () => {
      const hasPendingText = Boolean((finalBufferRef.current || interimBufferRef.current).trim());
      if (hasPendingText && !hadFatalErrorRef.current) {
        setStatus('processing');
        commitIfAny();
        window.setTimeout(() => {
          setInterimTranscript('');
          setStatus('idle');
        }, 180);
      } else {
        setInterimTranscript('');
        setStatus('idle');
      }
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.abort();
      } catch {
        // cleanup ignore
      }
    };
  }, [isSupported, commitIfAny]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      const msg = 'Speech recognition is not supported in this browser.';
      setError(msg);
      showToast(msg, 'error');
      return;
    }

    setError(null);
    setTranscript('');
    setInterimTranscript('');
    finalBufferRef.current = '';
    interimBufferRef.current = '';
    hasCommittedRef.current = false;
    hadFatalErrorRef.current = false;

    try {
      recognitionRef.current?.start();
    } catch (err: any) {
      const msg = err?.message || 'Unable to start microphone dictation.';
      console.warn('[SpeechRecognition] Start error:', msg);
      if (!String(msg).toLowerCase().includes('already started')) {
        setError(msg);
        showToast(msg, 'error');
        setStatus('idle');
      }
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    setStatus((prev) => (prev === 'listening' ? 'processing' : prev));
    try {
      recognitionRef.current?.stop();
    } catch {
      commitIfAny();
      setInterimTranscript('');
      setStatus('idle');
    }
  }, [commitIfAny]);

  const resetTranscript = useCallback(() => {
    finalBufferRef.current = '';
    interimBufferRef.current = '';
    setTranscript('');
    setInterimTranscript('');
  }, []);

  return {
    status,
    isListening: status === 'listening',
    isProcessing: status === 'processing',
    interimTranscript,
    transcript,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
