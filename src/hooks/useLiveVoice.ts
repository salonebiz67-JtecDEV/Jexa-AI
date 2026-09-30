import { useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient } from '../services/api.client';

export type LiveVoiceStatus = 'listening' | 'thinking' | 'speaking' | 'muted';

export function useLiveVoice(onVoiceReplyReceived?: (text: string) => void) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<LiveVoiceStatus>('listening');
  const [frequencies, setFrequencies] = useState<number[]>(() => new Array(24).fill(15));
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [aiSpokenText, setAiSpokenText] = useState<string>('Listening to you...');
  const [isMuted, setIsMuted] = useState(false);
  const animationFrameRef = useRef<number | null>(null);

  // Audio waveform animation simulation loop
  useEffect(() => {
    if (!isOpen) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      return;
    }

    let t = 0;
    const updateWaveform = () => {
      t += 0.05;
      if (isMuted) {
        setFrequencies(new Array(24).fill(6));
      } else if (status === 'speaking') {
        setFrequencies(
          Array.from({ length: 24 }, (_, i) => {
            const wave = Math.sin(t * 3 + i * 0.4) * 0.5 + 0.5;
            return Math.floor(wave * 70 + 20);
          })
        );
      } else if (status === 'listening') {
        setFrequencies(
          Array.from({ length: 24 }, (_, i) => {
            const wave = Math.sin(t * 2 + i * 0.3) * 0.5 + 0.5;
            return Math.floor(wave * 45 + 10);
          })
        );
      } else if (status === 'thinking') {
        setFrequencies(
          Array.from({ length: 24 }, (_, i) => {
            const wave = Math.sin(t * 5 + i * 0.8) * 0.5 + 0.5;
            return Math.floor(wave * 30 + 10);
          })
        );
      }

      animationFrameRef.current = requestAnimationFrame(updateWaveform);
    };

    animationFrameRef.current = requestAnimationFrame(updateWaveform);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isOpen, status, isMuted]);

  const openLiveMode = useCallback(() => {
    setIsOpen(true);
    setStatus('listening');
    setAiSpokenText("Hello! I'm in Live Mode. Say something, or tap a sample topic below.");
  }, []);

  const closeLiveMode = useCallback(() => {
    setIsOpen(false);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      setStatus(next ? 'muted' : 'listening');
      return next;
    });
  }, []);

  // Speak text using browser speech synthesis
  const speakText = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const cleanText = text.replace(/[*#`_\[\]]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    // Pick nice voice if available
    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(
      (v) => (v.name.includes('Natural') || v.name.includes('Neural') || v.name.includes('Samantha') || v.name.includes('Google US')) && v.lang.startsWith('en')
    );
    if (naturalVoice) {
      utterance.voice = naturalVoice;
    }

    utterance.onstart = () => {
      setStatus('speaking');
    };

    utterance.onend = () => {
      setStatus('listening');
    };

    utterance.onerror = () => {
      setStatus('listening');
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  // Process a spoken turn
  const submitSpokenQuery = useCallback(
    async (queryText: string, personaId?: string) => {
      if (!queryText.trim() || isMuted) return;

      setLiveTranscript(queryText);
      setStatus('thinking');
      setAiSpokenText('Processing your thoughts...');

      try {
        const response = await ApiClient.sendMessage({
          message: queryText,
          personaId,
        });

        const reply = response.message.content;
        setAiSpokenText(reply);

        if (onVoiceReplyReceived) {
          onVoiceReplyReceived(reply);
        }

        // Call backend voice synthesis endpoint for provider abstraction check
        ApiClient.requestVoiceSynthesis({ text: reply }).catch(() => {});

        // Speak aloud
        speakText(reply);
      } catch (err: any) {
        console.error('[useLiveVoice] Query error:', err);
        setAiSpokenText(`I had difficulty processing that: ${err.message}`);
        setStatus('listening');
      }
    },
    [isMuted, onVoiceReplyReceived, speakText]
  );

  return {
    isOpen,
    status,
    frequencies,
    liveTranscript,
    aiSpokenText,
    isMuted,
    openLiveMode,
    closeLiveMode,
    toggleMute,
    submitSpokenQuery,
    setLiveTranscript,
  };
}
