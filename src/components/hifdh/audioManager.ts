/*  src/components/hifdh/audioManager.ts  */
class AudioManager {
  private audio: HTMLAudioElement | null = null;
  private stopCb: (() => void) | null = null;

  init() {
    if (typeof window !== "undefined" && !this.audio) this.audio = new Audio();
  }

  play(src: string, onEnd?: () => void, onStop?: () => void) {
    this.init();
    if (!this.audio || !src) return;
    this.stop();
    this.audio.src = src;
    this.stopCb = onStop ?? null;
    this.audio.play().catch(() => {});
    this.audio.onended = () => { this.stopCb = null; onEnd?.(); };
  }

  stop() {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.src = "";
    this.audio.onended = null;
    this.stopCb?.();
    this.stopCb = null;
  }

  get isPlaying() { return !!(this.audio && !this.audio.paused && this.audio.src); }
  get currentTime() { return this.audio?.currentTime ?? 0; }
  get duration() { return this.audio?.duration ?? 0; }
  setTimeUpdate(fn: (() => void) | null) { if (this.audio) this.audio.ontimeupdate = fn; }
}

export const audioManager = new AudioManager();
