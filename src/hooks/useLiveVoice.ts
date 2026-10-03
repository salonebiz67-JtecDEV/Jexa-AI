import { useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient } from '../services/api.client';

export type LiveVoiceStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'muted'
  | 'error'
  | 'ended';

interface UseLiveVoiceOptions {
  conversationId?: string | null;
  onVoiceReplyReceived?: (text: string) => void;
  onUserSpoke?: (text: string) => void;
}

export function useLiveVoice({
  conversationId,
  onVoiceReplyReceived,
  onUserSpoke,
}: UseLiveVoiceOptions = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<LiveVoiceStatus>('idle');
  const [volume, setVolume] = useState<number>(0);
  const [frequencyData, setFrequencyData] = useState<Uint8Array | null>(null);
  const [aiSpeakingPower, setAiSpeakingPower] = useState<number>(0);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [lastAiResponse, setLastAiResponse] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // Audio Context & Media Stream Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Speech Recognition & Silence Detection Refs
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speechAccumulatorRef = useRef<string>('');
  const consecutiveVoiceFramesRef = useRef<number>(0);

  // Active status ref for safe access in animation & event listeners
  const statusRef = useRef<LiveVoiceStatus>('idle');
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const isMutedRef = useRef(false);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Clean up all audio and speech resources
  const cleanupResources = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch (e) {
        // ignore abort errors
      }
      recognitionRef.current = null;
    }

    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setVolume(0);
    setFrequencyData(null);
    setAiSpeakingPower(0);
  }, []);

  // Interruption logic: Stop TTS and immediately return to listening
  const interruptAiSpeech = useCallback(() => {
    if (statusRef.current === 'speaking') {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0;
        audioElementRef.current = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setStatus('listening');
      setAiSpeakingPower(0);
    }
  }, []);

  // Dispatch turn to backend and handle honest response
  const processSpokenTurn = useCallback(
    async (spokenText: string) => {
      const cleanText = spokenText.trim();
      if (!cleanText || isMutedRef.current) return;

      setStatus('processing');
      setErrorMessage(null);

      if (onUserSpoke) {
        onUserSpoke(cleanText);
      }

      try {
        const savedTextProvider =
          typeof localStorage !== 'undefined'
            ? (localStorage.getItem('jexa_text_provider') as any)
            : undefined;

        const response = await ApiClient.sendMessage({
          conversationId: conversationId || undefined,
          message: cleanText,
          isVoiceMode: true,
          textProvider: savedTextProvider || undefined,
        });

        const replyContent = response.message.content;
        setLastAiResponse(replyContent);

        if (onVoiceReplyReceived) {
          onVoiceReplyReceived(replyContent);
        }

        // Voice playback
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();

          const cleanSpokenText = replyContent.replace(/[*#`_\[\]]/g, '');
          const utterance = new SpeechSynthesisUtterance(cleanSpokenText);
          utterance.rate = 1.05;
          utterance.pitch = 1.0;

          // Pick best available natural voice
          const voices = window.speechSynthesis.getVoices();
          const preferredVoice = voices.find(
            (v) =>
              (v.name.includes('Natural') ||
                v.name.includes('Neural') ||
                v.name.includes('Google US') ||
                v.name.includes('Samantha') ||
                v.name.includes('en-US')) &&
              v.lang.startsWith('en')
          );
          if (preferredVoice) {
            utterance.voice = preferredVoice;
          }

          utterance.onstart = () => {
            setStatus('speaking');
          };

          utterance.onend = () => {
            if (statusRef.current === 'speaking') {
              setStatus('listening');
              setAiSpeakingPower(0);
              setLiveTranscript('');
            }
          };

          utterance.onerror = (e) => {
            console.warn('[useLiveVoice] Speech synthesis error:', e);
            setStatus('listening');
            setAiSpeakingPower(0);
          };

          // Generate dynamic simulated phonetic cadence during speech
          let speechAnimId: number;
          let speechStep = 0;
          const animateSpeechCadence = () => {
            if (statusRef.current === 'speaking') {
              speechStep += 0.14;
              // Natural conversational cadence modulation
              const cadence =
                Math.sin(speechStep * 2.5) * 0.35 +
                Math.cos(speechStep * 4.2) * 0.25 +
                0.4;
              setAiSpeakingPower(Math.max(0.1, Math.min(1, cadence)));
              speechAnimId = requestAnimationFrame(animateSpeechCadence);
            }
          };
          speechAnimId = requestAnimationFrame(animateSpeechCadence);

          window.speechSynthesis.speak(utterance);
        } else {
          // Fallback if browser doesn't have speechSynthesis
          setStatus('listening');
        }
      } catch (err: any) {
        console.error('[useLiveVoice] Backend request failed:', err);
        setStatus('error');
        setErrorMessage(
          err.message && err.message.includes('fetch')
            ? 'JEXA is currently unavailable. Check server connection.'
            : err.message || "JEXA couldn't respond. Try again."
        );
      }
    },
    [conversationId, onUserSpoke, onVoiceReplyReceived]
  );

  // Initialize Web Audio & Microphone Streams
  const initializeAudio = useCallback(async () => {
    try {
      setStatus('connecting');
      setErrorMessage(null);

      // Check browser microphone support
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser.');
      }

      // 1. Request real microphone media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // 2. Setup Web Audio Context & Analyser
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      // Mobile touch unlock
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // 3. Audio frame monitoring loop (Real volume computation & barge-in interruption)
      const monitorAudio = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        setFrequencyData(dataArray);

        // Compute real RMS volume (0.0 to 1.0)
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalizedVolume = isMutedRef.current ? 0 : Math.min(1, avg / 128);
        setVolume(normalizedVolume);

        // REAL INTERRUPTIONS: If AI is speaking and user speaks (volume threshold exceeded)
        if (statusRef.current === 'speaking' && !isMutedRef.current) {
          if (normalizedVolume > 0.16) {
            consecutiveVoiceFramesRef.current += 1;
            if (consecutiveVoiceFramesRef.current >= 3) {
              interruptAiSpeech();
              consecutiveVoiceFramesRef.current = 0;
            }
          } else {
            consecutiveVoiceFramesRef.current = 0;
          }
        }

        animFrameRef.current = requestAnimationFrame(monitorAudio);
      };

      animFrameRef.current = requestAnimationFrame(monitorAudio);

      // 4. Initialize Speech Recognition
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          if (isMutedRef.current) return;

          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          const currentText = (finalTranscript || interimTranscript).trim();
          if (currentText) {
            // User started speaking while AI was speaking -> interrupt immediately!
            if (statusRef.current === 'speaking') {
              interruptAiSpeech();
            }

            setLiveTranscript(currentText);
            speechAccumulatorRef.current = currentText;

            // Reset silence timer on active speech
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
            }

            // Detect natural speech pause (1.2s of silence)
            silenceTimerRef.current = setTimeout(() => {
              if (
                speechAccumulatorRef.current.trim() &&
                statusRef.current === 'listening'
              ) {
                const turnText = speechAccumulatorRef.current.trim();
                speechAccumulatorRef.current = '';
                processSpokenTurn(turnText);
              }
            }, 1200);
          }
        };

        recognition.onerror = (event: any) => {
          // Ignore harmless 'no-speech' or 'aborted'
          if (event.error !== 'no-speech' && event.error !== 'aborted') {
            console.warn('[useLiveVoice] Speech recognition event:', event.error);
            if (event.error === 'not-allowed') {
              setStatus('error');
              setErrorMessage('Microphone permission was denied.');
            }
          }
        };

        recognition.onend = () => {
          // Auto-restart recognition if LIVE is still active
          if (statusRef.current !== 'idle' && statusRef.current !== 'ended') {
            try {
              recognition.start();
            } catch (e) {
              // already active
            }
          }
        };

        try {
          recognition.start();
        } catch (e) {
          console.warn('[useLiveVoice] Failed to start recognition:', e);
        }

        recognitionRef.current = recognition;
      }

      setStatus('listening');
    } catch (err: any) {
      console.error('[useLiveVoice] Initialization error:', err);
      cleanupResources();
      setStatus('error');

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Microphone permission is required for LIVE.');
      } else {
        setErrorMessage(err.message || 'Unable to connect to audio input.');
      }
    }
  }, [cleanupResources, interruptAiSpeech, processSpokenTurn]);

  // Open LIVE Mode
  const openLiveMode = useCallback(() => {
    setIsOpen(true);
    setLiveTranscript('');
    setLastAiResponse('');
    setErrorMessage(null);
    setIsMuted(false);
    initializeAudio();
  }, [initializeAudio]);

  // Exit LIVE Mode
  const closeLiveMode = useCallback(() => {
    cleanupResources();
    setStatus('ended');
    setIsOpen(false);
    setLiveTranscript('');
    setLastAiResponse('');
    setErrorMessage(null);
  }, [cleanupResources]);

  // Toggle Mute
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) {
        setStatus('muted');
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      } else {
        setStatus('listening');
      }
      return next;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, [cleanupResources]);

  return {
    isOpen,
    status,
    volume,
    frequencyData,
    aiSpeakingPower,
    liveTranscript,
    lastAiResponse,
    errorMessage,
    isMuted,
    openLiveMode,
    closeLiveMode,
    toggleMute,
    interruptAiSpeech,
    submitManualQuery: processSpokenTurn,
    retryConnection: initializeAudio,
  };
}
