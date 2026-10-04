import { useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient } from '../services/api.client';
import { safeStorage } from '../services/storage';
import { TextProviderType, VoiceProviderType } from '../../shared/types/provider';

export type LiveVoiceStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'muted'
  | 'error'
  | 'ended';

export interface LiveVoiceDebugStats {
  textProvider: string;
  voiceProvider: string;
  sessionStatus: LiveVoiceStatus;
  inputAudioStatus: 'active' | 'silent' | 'muted' | 'disconnected';
  outputAudioStatus: 'idle' | 'playing' | 'interrupted';
  approximateTokens: number;
  connectionLatencyMs: number;
  lastError: string | null;
}

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

  // Live debug/diagnostics stats
  const [debugStats, setDebugStats] = useState<LiveVoiceDebugStats>({
    textProvider: 'gemini',
    voiceProvider: 'gemini',
    sessionStatus: 'idle',
    inputAudioStatus: 'disconnected',
    outputAudioStatus: 'idle',
    approximateTokens: 0,
    connectionLatencyMs: 0,
    lastError: null,
  });

  // Audio Context & Media Stream Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);

  // Guard against starting multiple microphones concurrently
  const isStartingRef = useRef(false);

  // Speech Recognition & Silence Detection Refs
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const idleSessionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speechAccumulatorRef = useRef<string>('');
  const consecutiveVoiceFramesRef = useRef<number>(0);

  // Active status ref for safe access in animation & event listeners
  const statusRef = useRef<LiveVoiceStatus>('idle');
  useEffect(() => {
    statusRef.current = status;
    setDebugStats((prev) => ({
      ...prev,
      sessionStatus: status,
      outputAudioStatus: status === 'speaking' ? 'playing' : 'idle',
    }));
  }, [status]);

  const isMutedRef = useRef(false);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Reset idle timer to avoid runaway sessions and conserve tokens
  const resetIdleTimer = useCallback(() => {
    if (idleSessionTimerRef.current) {
      clearTimeout(idleSessionTimerRef.current);
    }
    // Auto-close session after 90 seconds of total inactivity
    idleSessionTimerRef.current = setTimeout(() => {
      if (statusRef.current === 'listening' || statusRef.current === 'idle') {
        console.log('[useLiveVoice] Idle timeout reached. Closing session to preserve tokens.');
        cleanupResources();
        setStatus('ended');
        setIsOpen(false);
      }
    }, 90000);
  }, []);

  // Clean up all audio, timer, and speech resources
  const cleanupResources = useCallback(() => {
    isStartingRef.current = false;

    if (idleSessionTimerRef.current) {
      clearTimeout(idleSessionTimerRef.current);
      idleSessionTimerRef.current = null;
    }

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
      } catch {
        // ignore abort errors
      }
      recognitionRef.current = null;
    }

    if (audioElementRef.current) {
      try {
        audioElementRef.current.pause();
        audioElementRef.current.src = '';
      } catch {
        // ignore
      }
      audioElementRef.current = null;
    }

    if (currentAudioUrlRef.current && currentAudioUrlRef.current.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(currentAudioUrlRef.current);
      } catch {
        // ignore
      }
      currentAudioUrlRef.current = null;
    }

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
        processorRef.current.onaudioprocess = null;
      } catch {
        // ignore
      }
      processorRef.current = null;
    }

    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch {
        // ignore
      }
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close().catch(() => {});
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setVolume(0);
    setFrequencyData(null);
    setAiSpeakingPower(0);
    setDebugStats((prev) => ({
      ...prev,
      inputAudioStatus: 'disconnected',
      outputAudioStatus: 'idle',
    }));
  }, []);

  // Interruption logic: Stop playback immediately when user speaks during assistant reply
  const interruptAiSpeech = useCallback(() => {
    if (statusRef.current === 'speaking') {
      if (audioElementRef.current) {
        try {
          audioElementRef.current.pause();
          audioElementRef.current.currentTime = 0;
          audioElementRef.current = null;
        } catch {
          // ignore
        }
      }
      if (currentAudioUrlRef.current && currentAudioUrlRef.current.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(currentAudioUrlRef.current);
        } catch {
          // ignore
        }
        currentAudioUrlRef.current = null;
      }
      setStatus('listening');
      setAiSpeakingPower(0);
      setDebugStats((prev) => ({
        ...prev,
        outputAudioStatus: 'interrupted',
      }));
    }
  }, []);

  // Dispatch turn to backend and handle honest response
  const processSpokenTurn = useCallback(
    async (spokenText: string) => {
      const cleanText = spokenText.trim();
      if (!cleanText || isMutedRef.current) return;

      setStatus('processing');
      setErrorMessage(null);
      resetIdleTimer();

      if (onUserSpoke) {
        onUserSpoke(cleanText);
      }

      const activeTextProvider: TextProviderType =
        (safeStorage.getItem('jexa_text_provider') as TextProviderType) || 'gemini';
      const activeVoiceProvider: VoiceProviderType =
        (safeStorage.getItem('jexa_voice_provider') as VoiceProviderType) || 'gemini';
      const activeVoiceName = safeStorage.getItem('jexa_voice_name') || 'aura';

      const startTime = Date.now();

      try {
        const response = await ApiClient.sendMessage({
          conversationId: conversationId || undefined,
          message: cleanText,
          isVoiceMode: true,
          textProvider: activeTextProvider,
        });

        const latency = Date.now() - startTime;
        const replyContent = response.message.content;
        setLastAiResponse(replyContent);

        // Approximate token tracking
        const promptTokens = Math.ceil(cleanText.length / 4);
        const replyTokens = Math.ceil(replyContent.length / 4);
        setDebugStats((prev) => ({
          ...prev,
          textProvider: activeTextProvider,
          voiceProvider: activeVoiceProvider,
          connectionLatencyMs: latency,
          approximateTokens: prev.approximateTokens + promptTokens + replyTokens,
          lastError: null,
        }));

        if (onVoiceReplyReceived) {
          onVoiceReplyReceived(replyContent);
        }

        // Clean text for speech synthesis
        const cleanSpokenText = replyContent
          .replace(/[*#`_\[\]()]/g, '')
          .replace(/https?:\/\/\S+/g, '')
          .trim();

        if (!cleanSpokenText) {
          setStatus('listening');
          return;
        }

        // Play Speech Synthesis using selected AI voice provider (Gemini or ElevenLabs)
        try {
          const voiceRes = await ApiClient.requestVoiceSynthesis({
            text: cleanSpokenText,
            voiceId: activeVoiceName,
            provider: activeVoiceProvider,
          });

          if (voiceRes?.audioUrl) {
            currentAudioUrlRef.current = voiceRes.audioUrl;
            const audio = new Audio(voiceRes.audioUrl);
            audioElementRef.current = audio;

            audio.onplay = () => {
              setStatus('speaking');
              setAiSpeakingPower(0.65);
            };

            audio.onended = () => {
              if (currentAudioUrlRef.current && currentAudioUrlRef.current.startsWith('blob:')) {
                try {
                  URL.revokeObjectURL(currentAudioUrlRef.current);
                } catch {
                  // ignore
                }
                currentAudioUrlRef.current = null;
              }
              if (statusRef.current === 'speaking') {
                setStatus('listening');
                setAiSpeakingPower(0);
                setLiveTranscript('');
                resetIdleTimer();
              }
            };

            audio.onerror = () => {
              console.warn('[useLiveVoice] Audio playback failed on device.');
              if (currentAudioUrlRef.current && currentAudioUrlRef.current.startsWith('blob:')) {
                try {
                  URL.revokeObjectURL(currentAudioUrlRef.current);
                } catch {
                  // ignore
                }
                currentAudioUrlRef.current = null;
              }
              audioElementRef.current = null;
              setStatus('error');
              setErrorMessage('Audio was generated, but the device could not play it.');
            };

            await audio.play();
          } else {
            setStatus('listening');
          }
        } catch (voiceErr: any) {
          console.warn('[useLiveVoice] Backend voice synthesis failed:', voiceErr.message);
          const rawErr = voiceErr.message || '';
          let friendlyError = rawErr;

          if (
            voiceErr.status === 429 ||
            voiceErr.code === 'QUOTA_EXHAUSTED' ||
            rawErr.includes('429') ||
            rawErr.includes('quota') ||
            rawErr.includes('RESOURCE_EXHAUSTED')
          ) {
            friendlyError = 'Gemini Voice quota exhausted. Try again later or switch to ElevenLabs.';
          } else if (
            voiceErr.status === 402 ||
            voiceErr.code === 'PAYMENT_REQUIRED' ||
            rawErr.includes('402') ||
            rawErr.includes('paid plan')
          ) {
            friendlyError = 'This ElevenLabs voice requires a paid plan.';
          } else if (voiceErr.status === 401 || voiceErr.status === 403 || rawErr.includes('401')) {
            friendlyError = 'Provider authentication or permission failed.';
          } else if (voiceErr.status === 404 || rawErr.includes('404')) {
            friendlyError = 'The selected model or voice was not found.';
          } else if (voiceErr.status === 503) {
            friendlyError = 'The provider is temporarily unavailable.';
          } else if (!friendlyError) {
            friendlyError = activeVoiceProvider === 'gemini'
              ? 'Gemini Voice is temporarily unavailable.'
              : 'ElevenLabs voice synthesis failed.';
          }

          setStatus('error');
          setErrorMessage(friendlyError);
          setDebugStats((prev) => ({
            ...prev,
            lastError: friendlyError,
          }));
        }
      } catch (err: any) {
        console.error('[useLiveVoice] Voice turn error:', err);
        setErrorMessage(err.message || 'Error processing spoken message.');
        setStatus('error');
        setDebugStats((prev) => ({
          ...prev,
          lastError: err.message,
        }));
      }
    },
    [conversationId, onVoiceReplyReceived, onUserSpoke, resetIdleTimer]
  );

  // Start Live Voice Mode safely
  const startLiveMode = useCallback(async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    // Clean any residual sessions first to guarantee single microphone
    cleanupResources();

    setIsOpen(true);
    setStatus('connecting');
    setErrorMessage(null);
    setLiveTranscript('');

    try {
      // 1. Request microphone access with echo cancellation & noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // 2. Setup Web Audio Context with 16 kHz speech resampling
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      let audioCtx: AudioContext;
      try {
        audioCtx = new AudioCtx({ sampleRate: 16000 });
      } catch {
        audioCtx = new AudioCtx();
      }
      audioContextRef.current = audioCtx;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      // 512-sample audio chunk processor (~32ms chunks at 16kHz) with VAD silence filtering
      try {
        const processor = audioCtx.createScriptProcessor(512, 1, 1);
        processor.onaudioprocess = (e) => {
          if (isMutedRef.current) return;
          const inputBuffer = e.inputBuffer.getChannelData(0);
          let sumSquares = 0;
          for (let i = 0; i < inputBuffer.length; i++) {
            sumSquares += inputBuffer[i] * inputBuffer[i];
          }
          const rms = Math.sqrt(sumSquares / inputBuffer.length);
          // Drop silent chunks (< 0.025 RMS) to optimize tokens and eliminate audio clutter
          if (rms < 0.025) {
            return;
          }
        };
        source.connect(processor);
        processor.connect(audioCtx.destination);
        processorRef.current = processor;
      } catch (procErr) {
        console.warn('[useLiveVoice] Audio chunk processor notice:', procErr);
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // 3. Audio Monitoring & Real-time VAD Loop
      const monitorAudio = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        setFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalizedVolume = isMutedRef.current ? 0 : Math.min(1, avg / 128);
        setVolume(normalizedVolume);

        // VAD status update
        const isUserAudible = normalizedVolume > 0.05;
        setDebugStats((prev) => ({
          ...prev,
          inputAudioStatus: isMutedRef.current ? 'muted' : isUserAudible ? 'active' : 'silent',
        }));

        // Bargin / Real Interruption: If assistant is speaking and user speaks
        if (statusRef.current === 'speaking' && !isMutedRef.current) {
          if (normalizedVolume > 0.15) {
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
            // User spoke -> immediately interrupt assistant
            if (statusRef.current === 'speaking') {
              interruptAiSpeech();
            }

            setLiveTranscript(currentText);
            speechAccumulatorRef.current = currentText;

            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
            }

            // Natural pause detection (1.1s silence triggers turn completion)
            silenceTimerRef.current = setTimeout(() => {
              if (
                speechAccumulatorRef.current.trim() &&
                statusRef.current === 'listening'
              ) {
                const turnText = speechAccumulatorRef.current.trim();
                speechAccumulatorRef.current = '';
                processSpokenTurn(turnText);
              }
            }, 1100);
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error !== 'no-speech' && event.error !== 'aborted') {
            console.warn('[useLiveVoice] Speech recognition error:', event.error);
            if (event.error === 'not-allowed') {
              setStatus('error');
              setErrorMessage('Microphone access was denied. Please allow microphone permission.');
            }
          }
        };

        recognition.onend = () => {
          if (statusRef.current !== 'idle' && statusRef.current !== 'ended') {
            try {
              recognition.start();
            } catch {
              // ignore restart conflicts
            }
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      }

      setStatus('listening');
      resetIdleTimer();
      isStartingRef.current = false;
    } catch (err: any) {
      console.error('[useLiveVoice] Failed to start Live Voice:', err);
      setStatus('error');
      setErrorMessage(
        err.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Please allow audio access in browser settings.'
          : err.message || 'Failed to start Live Voice session.'
      );
      isStartingRef.current = false;
    }
  }, [cleanupResources, interruptAiSpeech, processSpokenTurn, resetIdleTimer]);

  // Close Live Mode safely and release all hardware resources
  const closeLiveMode = useCallback(() => {
    cleanupResources();
    setStatus('ended');
    setIsOpen(false);
  }, [cleanupResources]);

  // Toggle Mute
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next && statusRef.current === 'speaking') {
        interruptAiSpeech();
      }
      return next;
    });
  }, [interruptAiSpeech]);

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
    debugStats,
    startLiveMode,
    closeLiveMode,
    toggleMute,
    interruptAiSpeech,
    retry: startLiveMode,
    retryConnection: startLiveMode,
  };
}
