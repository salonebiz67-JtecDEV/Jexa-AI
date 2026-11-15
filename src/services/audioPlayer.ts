/**
 * Audio Player Service for JEXA AI Companion
 * Supports single-active message playback with idle, loading, playing, paused, and error states,
 * binary Blob & URL playback, real pause/resume, and safe Object URL lifecycle management.
 */

export type AudioPlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused';

export interface AudioPlayerSnapshot {
  status: AudioPlaybackStatus;
  activeMessageId: string | null;
  error: string | null;
  errorMessageId: string | null;
}

type AudioStateListener = (snapshot: AudioPlayerSnapshot) => void;

class AudioPlayerService {
  private currentAudio: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;
  private _status: AudioPlaybackStatus = 'idle';
  private _activeMessageId: string | null = null;
  private _error: string | null = null;
  private _errorMessageId: string | null = null;
  private listeners = new Set<AudioStateListener>();

  public get isPlaying(): boolean {
    return this._status === 'playing';
  }

  public getSnapshot(): AudioPlayerSnapshot {
    return {
      status: this._status,
      activeMessageId: this._activeMessageId,
      error: this._error,
      errorMessageId: this._errorMessageId,
    };
  }

  public subscribe(listener: AudioStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }

  private cleanupMediaElement(): void {
    if (this.currentAudio) {
      try {
        this.currentAudio.onended = null;
        this.currentAudio.onerror = null;
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.src = '';
      } catch {
        // ignore abort
      }
      this.currentAudio = null;
    }

    if (this.currentObjectUrl) {
      try {
        URL.revokeObjectURL(this.currentObjectUrl);
      } catch {
        // ignore
      }
      this.currentObjectUrl = null;
    }
  }

  /**
   * Marks a message as loading voice audio and stops any previously playing message.
   */
  public setLoading(messageId: string): void {
    this.cleanupMediaElement();
    this._status = 'loading';
    this._activeMessageId = messageId;
    this._error = null;
    this._errorMessageId = null;
    this.notify();
  }

  /**
   * Records a voice failure for a specific message without masking the real reason.
   */
  public setError(messageId: string, errorMessage: string): void {
    this.cleanupMediaElement();
    this._status = 'idle';
    this._activeMessageId = null;
    this._error = errorMessage || 'Voice synthesis failed.';
    this._errorMessageId = messageId;
    this.notify();
  }

  public clearError(messageId?: string): void {
    if (!messageId || this._errorMessageId === messageId) {
      this._error = null;
      this._errorMessageId = null;
      this.notify();
    }
  }

  /**
   * Immediately stops any active audio and resets playback state.
   */
  public stop(): void {
    this.cleanupMediaElement();
    this._status = 'idle';
    this._activeMessageId = null;
    this.notify();
  }

  /**
   * Pauses the currently playing message audio while retaining position and Object URL.
   */
  public pause(): void {
    if (this.currentAudio && this._status === 'playing') {
      try {
        this.currentAudio.pause();
        this._status = 'paused';
        this.notify();
      } catch {
        this.stop();
      }
    }
  }

  /**
   * Resumes paused audio for the active message without re-fetching.
   */
  public async resume(): Promise<void> {
    if (!this.currentAudio || this._status !== 'paused') return;
    try {
      this._status = 'playing';
      this.notify();
      await this.currentAudio.play();
    } catch (err: any) {
      const msg =
        err?.name === 'NotAllowedError'
          ? 'Audio playback requires user interaction.'
          : err?.message || 'Audio could not resume on this device.';
      const targetId = this._activeMessageId;
      if (targetId) {
        this.setError(targetId, msg);
      } else {
        this.stop();
      }
      throw new Error(msg);
    }
  }

  /**
   * Plays a binary audio Blob for an optional messageId. Only one message plays at a time.
   */
  public async playBlob(blob: Blob, messageId?: string): Promise<void> {
    this.cleanupMediaElement();

    if (!blob || blob.size === 0) {
      const err = new Error('No audio data received from voice provider.');
      if (messageId) this.setError(messageId, err.message);
      throw err;
    }

    const objectUrl = URL.createObjectURL(blob);
    this.currentObjectUrl = objectUrl;
    this._activeMessageId = messageId || null;
    this._error = null;
    this._errorMessageId = null;

    return this.playMediaUrl(objectUrl, messageId);
  }

  /**
   * Plays an audio URL (e.g. data:audio/... or object URL) for an optional messageId.
   */
  public async playUrl(url: string, messageId?: string): Promise<void> {
    this.cleanupMediaElement();

    if (!url || typeof url !== 'string') {
      const err = new Error('Invalid audio URL provided.');
      if (messageId) this.setError(messageId, err.message);
      throw err;
    }

    this._activeMessageId = messageId || null;
    this._error = null;
    this._errorMessageId = null;

    return this.playMediaUrl(url, messageId);
  }

  private playMediaUrl(url: string, messageId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      this.currentAudio = audio;
      this._status = 'playing';
      this.notify();

      audio.onended = () => {
        if (this.currentAudio === audio) {
          this.cleanupMediaElement();
          this._status = 'idle';
          this._activeMessageId = null;
          this.notify();
        }
        resolve();
      };

      audio.onerror = () => {
        const msg = 'Audio was generated, but the device could not play it.';
        if (this.currentAudio === audio) {
          this.cleanupMediaElement();
          this._status = 'idle';
          this._activeMessageId = null;
          if (messageId) {
            this._error = msg;
            this._errorMessageId = messageId;
          }
          this.notify();
        }
        reject(new Error(msg));
      };

      audio.src = url;
      audio.load();

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          const msg =
            err?.name === 'NotAllowedError'
              ? 'Audio playback requires user interaction.'
              : 'Audio was generated, but the device could not play it.';
          if (this.currentAudio === audio) {
            this.cleanupMediaElement();
            this._status = 'idle';
            this._activeMessageId = null;
            if (messageId) {
              this._error = msg;
              this._errorMessageId = messageId;
            }
            this.notify();
          }
          reject(new Error(msg));
        });
      }
    });
  }
}

export const AudioPlayer = new AudioPlayerService();
