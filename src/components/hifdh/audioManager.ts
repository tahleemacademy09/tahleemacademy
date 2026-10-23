/*  src/components/hifdh/audioManager.ts
    Reciter-aware Audio Manager — loop, speed, preload queue.
    Speeds now include 1.25× and 1.5× as requested.
*/
import { audioUrl, DEFAULT_RECITER } from "./surahData";

export type PlaybackSpeed = 0.5 | 0.75 | 1 | 1.25 | 1.5;
const SPEEDS: PlaybackSpeed[] = [0.5, 0.75, 1, 1.25, 1.5];

class AudioManager {
  private audio: HTMLAudioElement | null = null;
  private preloadCache = new Map<string, HTMLAudioElement>();
  private stopCb: (() => void) | null = null;

  currentReciter   = DEFAULT_RECITER;
  currentSurah     = 1;
  currentAyah      = 0;
  isLooping        = false;
  loopCount        = 0;
  private loopsDone = 0;
  playbackSpeed: PlaybackSpeed = 1;
  private _isPlaying  = false;
  private _buffering  = false;

  private onAyahChange?: (ayah: number) => void;
  private onLoopTick?: (done: number, total: number) => void;
  private onBuffering?: (buffering: boolean) => void;

  init() {
    if (typeof window !== "undefined" && !this.audio) {
      this.audio = new Audio();
      this.audio.preload = "auto";
    }
  }

  setReciter(id: string) {
    if (id === this.currentReciter) return;
    this.currentReciter = id;
    this.preloadCache.clear();
    if (this._isPlaying) this.playAyah(this.currentSurah, this.currentAyah);
  }

  setSpeed(s: PlaybackSpeed) {
    this.playbackSpeed = s;
    if (this.audio) this.audio.playbackRate = s;
  }

  cycleSpeed(): PlaybackSpeed {
    const idx  = SPEEDS.indexOf(this.playbackSpeed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    this.setSpeed(next);
    return next;
  }

  setLoop(enabled: boolean, count = 0) {
    this.isLooping = enabled;
    this.loopCount = count;
    this.loopsDone = 0;
  }

  onAyahChanged(fn: (ayah: number) => void)               { this.onAyahChange = fn; }
  onLoopProgress(fn: (done: number, total: number) => void) { this.onLoopTick  = fn; }
  onBufferingChange(fn: (b: boolean) => void)              { this.onBuffering  = fn; }

  private getUrl(surah: number, ayah: number) {
    return audioUrl(surah, ayah, this.currentReciter);
  }

  preload(surah: number, ayah: number) {
    const url = this.getUrl(surah, ayah);
    if (this.preloadCache.has(url)) return;
    const a = new Audio(); a.preload = "auto"; a.src = url;
    this.preloadCache.set(url, a);
    if (this.preloadCache.size > 10) {
      const first = this.preloadCache.keys().next().value;
      if (first) this.preloadCache.delete(first);
    }
  }

  private preloadAdjacent(surah: number, ayah: number) {
    this.preload(surah, ayah);
    this.preload(surah, ayah + 1);
  }

  playAyah(surah: number, ayah: number, onEnd?: () => void, onStop?: () => void) {
    this.init();
    if (!this.audio) return;
    this.stop();
    this.currentSurah  = surah;
    this.currentAyah   = ayah;
    this.loopsDone     = 0;
    this.stopCb        = onStop ?? null;
    this._isPlaying    = true;

    const url = this.getUrl(surah, ayah);
    this.audio.src = url;
    this.audio.playbackRate = this.playbackSpeed;
    this.setBuffering(true);
    this.audio.oncanplay = () => this.setBuffering(false);
    this.audio.play().catch(() => { this._isPlaying = false; this.setBuffering(false); });
    this.preloadAdjacent(surah, ayah);
    this.onAyahChange?.(ayah);

    this.audio.onended = () => {
      if (this.isLooping) {
        this.loopsDone++;
        this.onLoopTick?.(this.loopsDone, this.loopCount);
        if (this.loopCount === 0 || this.loopsDone < this.loopCount) {
          if (this.audio) { this.audio.currentTime = 0; this.audio.play().catch(() => {}); }
          return;
        }
      }
      this._isPlaying = false;
      this.stopCb = null;
      onEnd?.();
    };
  }

  playRange(surah: number, from: number, to: number, onEnd?: () => void) {
    let current = from;
    const playNext = () => {
      if (current > to) { this._isPlaying = false; onEnd?.(); return; }
      this.playAyah(surah, current, () => { current++; playNext(); });
    };
    playNext();
  }

  stop() {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.onended  = null;
    this.audio.oncanplay = null;
    this.audio.src      = "";
    this._isPlaying     = false;
    this.setBuffering(false);
    this.stopCb?.();
    this.stopCb = null;
  }

  pause()  { if (!this.audio) return; this.audio.pause(); this._isPlaying = false; }
  resume() { if (!this.audio) return; this.audio.play().catch(() => {}); this._isPlaying = true; }

  // Legacy
  play(src: string, onEnd?: () => void, onStop?: () => void) {
    this.init();
    if (!this.audio || !src) return;
    this.stop();
    this.audio.src = src;
    this.stopCb = onStop ?? null;
    this._isPlaying = true;
    this.audio.playbackRate = this.playbackSpeed;
    this.audio.play().catch(() => { this._isPlaying = false; });
    this.audio.onended = () => { this._isPlaying = false; this.stopCb = null; onEnd?.(); };
  }

  get isPlaying() { return this._isPlaying; }
  get buffering()  { return this._buffering; }
  get currentTime() { return this.audio?.currentTime ?? 0; }
  get duration()    { return this.audio?.duration ?? 0; }

  setTimeUpdate(fn: (() => void) | null) { if (this.audio) this.audio.ontimeupdate = fn; }

  private setBuffering(b: boolean) { this._buffering = b; this.onBuffering?.(b); }
}

export const audioManager = new AudioManager();
