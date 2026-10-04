/**
 * Audio Player Service for JEXA AI Companion
 * Robust, production-grade audio playback handling binary Blobs, MIME detection,
 * Object URLs, and safe lifecycle revocation without memory leaks.
 */

class AudioPlayerService {
  private currentAudio: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;
  private _isPlaying: boolean = false;

  public get isPlaying(): boolean {
    return this._isPlaying;
  }

  /**
   * Immediately stops any active audio and releases previous Object URLs
   */
  public stop(): void {
    if (this.currentAudio) {
      try {
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

    this._isPlaying = false;
  }

  /**
   * Plays a binary audio Blob with automatic MIME detection and Object URL revocation
   */
  public async playBlob(blob: Blob): Promise<void> {
    this.stop();

    if (!blob || blob.size === 0) {
      throw new Error('No audio data received from voice provider.');
    }

    const objectUrl = URL.createObjectURL(blob);
    this.currentObjectUrl = objectUrl;

    return this.playMediaUrl(objectUrl);
  }

  /**
   * Plays an audio URL (e.g. data:audio/mpeg;base64,... or data:audio/wav;base64,... or object URL)
   */
  public async playUrl(url: string): Promise<void> {
    this.stop();

    if (!url || typeof url !== 'string') {
      throw new Error('Invalid audio URL provided.');
    }

    return this.playMediaUrl(url);
  }

  private playMediaUrl(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      this.currentAudio = audio;
      this._isPlaying = true;

      audio.onended = () => {
        this._isPlaying = false;
        if (this.currentObjectUrl) {
          URL.revokeObjectURL(this.currentObjectUrl);
          this.currentObjectUrl = null;
        }
        resolve();
      };

      audio.onerror = () => {
        this._isPlaying = false;
        if (this.currentObjectUrl) {
          URL.revokeObjectURL(this.currentObjectUrl);
          this.currentObjectUrl = null;
        }
        reject(new Error('Audio was generated, but the device could not play it.'));
      };

      audio.src = url;
      audio.load();

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          this._isPlaying = false;
          if (this.currentObjectUrl) {
            URL.revokeObjectURL(this.currentObjectUrl);
            this.currentObjectUrl = null;
          }
          if (err.name === 'NotAllowedError') {
            reject(new Error('Audio playback requires user interaction.'));
          } else {
            reject(new Error('Audio was generated, but the device could not play it.'));
          }
        });
      }
    });
  }
}

export const AudioPlayer = new AudioPlayerService();
