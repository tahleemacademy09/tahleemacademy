/*
  tarteelOnDevice.ts
  ────────────────────────────────────────────────────────────────────────
  On-device Quran speech recognition (Tarteel Whisper-base, ONNX) with a
  LIVE word-reveal matcher. Nothing is uploaded: the model runs inside the
  student's browser, in a Web Worker so the page never freezes.

  Pieces
  ------
  1. TarteelEngine      – loads the model once (cached by the browser after the
                          first ~100 MB download) and transcribes audio windows.
  2. LiveRecitationSession – taps the microphone stream, keeps the last few
                          seconds of 16 kHz audio, re-transcribes that window
                          every ~1.5 s and tells the page which reference words
                          have now been recited (the "reveal").
  3. Matching helpers   – Arabic normalisation + a forward-only aligner that
                          maps each window's words onto the reference page.

  The library is loaded from the jsDelivr CDN inside the worker (the exact same
  version already proven in public/tarteel_browser_test.html), so no new npm
  dependency is needed.
*/

export const TARTEEL_MODEL = "iqbalaesthetic/Basira"; // ONNX export of tarteel-ai/whisper-base-ar-quran
const TRANSFORMERS_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.0";

/* ───────────────────────── Arabic matching helpers ───────────────────────── */

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ࣓-ࣿ]/g;

export function tarteelNormalize(text: string): string {
  return text
    .replace(MARKS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, " ")
    .replace(/[^؀-ۿ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Comparison key: normalised, alefs/hamzas dropped, doubled letters collapsed. */
export function tarteelWordKey(w: string): string {
  return tarteelNormalize(w).replace(/[اءأإآ]/g, "").replace(/(.)\1+/g, "$1");
}

export function tarteelWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => tarteelWordKey(w));
}

function lev1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function keysMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length >= 4 && b.length >= 4 && lev1(a, b);
}

/**
 * Forward-only aligner. `ref` are the reference word keys, `frontier` is how many
 * reference words are already revealed, `heard` are the keys the model produced
 * for the CURRENT audio window (which overlaps audio we already matched).
 *
 * We try a few possible start positions (a little behind the frontier up to a
 * little ahead of it) and keep whichever start explains the most heard words in
 * order. That lets the window repeat words we've already revealed without
 * double-counting them, and lets the student skip a word or two.
 */
export function advanceReveal(
  ref: string[],
  frontier: number,
  heard: string[],
  opts: { lookback?: number; lookahead?: number; skip?: number } = {},
): { frontier: number; matched: number[] } {
  const lookback = opts.lookback ?? 14;
  const lookahead = opts.lookahead ?? 6;
  const skip = opts.skip ?? 3; // how many reference words may be skipped between two heard words
  if (!heard.length || frontier >= ref.length) return { frontier, matched: [] };

  let best: { score: number; idxs: number[] } = { score: 0, idxs: [] };
  const from = Math.max(0, frontier - lookback);
  const to = Math.min(ref.length - 1, frontier + lookahead);
  for (let start = from; start <= to; start++) {
    const idxs: number[] = [];
    let r = start;
    for (const h of heard) {
      let hit = -1;
      const end = Math.min(ref.length, r + skip + 1);
      for (let k = r; k < end; k++) {
        if (keysMatch(ref[k], h)) { hit = k; break; }
      }
      if (hit >= 0) { idxs.push(hit); r = hit + 1; }
    }
    // Prefer more matches; on a tie prefer the start closest to the frontier.
    const better =
      idxs.length > best.score ||
      (idxs.length === best.score && idxs.length > 0 &&
        Math.abs(start - frontier) < Math.abs((best.idxs[0] ?? start) - frontier));
    if (better) best = { score: idxs.length, idxs };
  }
  // A single stray hit is too weak to move the frontier (noise, a common word).
  if (best.score < 2 && !(best.score === 1 && heard.length === 1)) return { frontier, matched: [] };
  const newMatches = best.idxs.filter((i) => i >= frontier);
  if (!newMatches.length) return { frontier, matched: [] };
  const last = newMatches[newMatches.length - 1];
  return { frontier: Math.max(frontier, last + 1), matched: newMatches };
}

/* ───────────────────────── Worker (model host) ───────────────────────── */

const WORKER_SRC = `
import { pipeline } from "${TRANSFORMERS_CDN}";
let asr = null;
let device = "wasm";
const MODEL = ${JSON.stringify(TARTEEL_MODEL)};

async function webgpuF16() {
  try {
    if (!self.navigator || !self.navigator.gpu) return false;
    const a = await self.navigator.gpu.requestAdapter();
    return !!a && a.features.has("shader-f16");
  } catch (e) { return false; }
}

async function load(useGpu) {
  const files = {};
  const progress = (e) => {
    if (e.status === "progress" && e.total) {
      files[e.file] = { loaded: e.loaded, total: e.total };
      let l = 0, t = 0;
      for (const f of Object.values(files)) { l += f.loaded; t += f.total; }
      self.postMessage({ type: "progress", loaded: l, total: t });
    }
  };
  let opts = { device: "wasm", dtype: "q8" };
  if (useGpu && (await webgpuF16())) opts = { device: "webgpu", dtype: "fp16" };
  try {
    asr = await pipeline("automatic-speech-recognition", MODEL, { ...opts, progress_callback: progress });
  } catch (e) {
    if (opts.device === "webgpu") {
      opts = { device: "wasm", dtype: "q8" };
      asr = await pipeline("automatic-speech-recognition", MODEL, { ...opts, progress_callback: progress });
    } else { throw e; }
  }
  device = opts.device;
  // The exported generation config has no multilingual markers, so language/task are rejected.
  // Whisper-base multilingual token ids: Arabic 50272, transcribe 50359, translate 50358.
  const gc = asr.model && asr.model.generation_config;
  if (gc) {
    gc.is_multilingual = true;
    gc.lang_to_id = Object.assign({ "<|ar|>": 50272 }, gc.lang_to_id || {});
    gc.task_to_id = Object.assign({ transcribe: 50359, translate: 50358 }, gc.task_to_id || {});
    if (gc.decoder_start_token_id == null) gc.decoder_start_token_id = 50258;
    if (gc.no_timestamps_token_id == null) gc.no_timestamps_token_id = 50363;
  }
  self.postMessage({ type: "ready", device: opts.device, dtype: opts.dtype });
}

self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.type === "load") {
      await load(!!m.useGpu);
    } else if (m.type === "transcribe") {
      if (!asr) { self.postMessage({ type: "result", id: m.id, text: "", error: "not_loaded" }); return; }
      const t0 = Date.now();
      const out = await asr(m.audio, { language: "arabic", task: "transcribe" });
      self.postMessage({ type: "result", id: m.id, text: (out && out.text || "").trim(), ms: Date.now() - t0 });
    }
  } catch (e) {
    self.postMessage({ type: m.type === "load" ? "load_error" : "result", id: m.id, text: "", error: String((e && e.message) || e) });
  }
};
`;

export type TarteelStatus = "idle" | "loading" | "ready" | "error" | "unsupported";

export interface TarteelProgress {
  status: TarteelStatus;
  loadedMB?: number;
  totalMB?: number;
  device?: string;
  error?: string;
}

/** Singleton engine: the model is loaded once per page session and reused across recordings. */
class TarteelEngine {
  private worker: Worker | null = null;
  private loadPromise: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, (r: { text: string; error?: string; ms?: number }) => void>();
  private listeners = new Set<(p: TarteelProgress) => void>();
  state: TarteelProgress = { status: "idle" };

  static supported(): boolean {
    const hasAudio = typeof AudioContext !== "undefined" || typeof (globalThis as any).webkitAudioContext !== "undefined";
    return typeof Worker !== "undefined" && typeof WebAssembly !== "undefined" && hasAudio;
  }

  subscribe(fn: (p: TarteelProgress) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => { this.listeners.delete(fn); };
  }

  private emit(p: TarteelProgress) {
    this.state = p;
    this.listeners.forEach((l) => { try { l(p); } catch { /* noop */ } });
  }

  load(useGpu = false): Promise<void> {
    if (this.state.status === "ready") return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;
    if (!TarteelEngine.supported()) {
      this.emit({ status: "unsupported" });
      return Promise.reject(new Error("unsupported"));
    }
    this.emit({ status: "loading", loadedMB: 0, totalMB: 0 });
    this.loadPromise = new Promise<void>((resolve, reject) => {
      let url = "";
      try {
        url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
        this.worker = new Worker(url, { type: "module" });
      } catch (e: any) {
        this.emit({ status: "unsupported", error: String(e?.message ?? e) });
        this.loadPromise = null;
        reject(e);
        return;
      }
      this.worker.onmessage = (ev) => {
        const m = ev.data;
        if (m.type === "progress") {
          this.emit({ status: "loading", loadedMB: m.loaded / 1048576, totalMB: m.total / 1048576 });
        } else if (m.type === "ready") {
          this.emit({ status: "ready", device: m.device });
          resolve();
        } else if (m.type === "load_error") {
          this.emit({ status: "error", error: m.error });
          this.loadPromise = null;
          this.worker?.terminate(); this.worker = null;
          reject(new Error(m.error));
        } else if (m.type === "result") {
          const cb = this.pending.get(m.id);
          if (cb) { this.pending.delete(m.id); cb({ text: m.text, error: m.error, ms: m.ms }); }
        }
      };
      this.worker.onerror = (ev) => {
        const msg = (ev as ErrorEvent).message || "worker_error";
        if (this.state.status !== "ready") {
          this.emit({ status: "error", error: msg });
          this.loadPromise = null;
          this.worker = null;
          reject(new Error(msg));
        }
      };
      this.worker.postMessage({ type: "load", useGpu });
    });
    return this.loadPromise;
  }

  isReady() { return this.state.status === "ready"; }

  /** audio: mono Float32 at 16 kHz. Ownership of the buffer is transferred to the worker. */
  transcribe(audio: Float32Array): Promise<{ text: string; error?: string; ms?: number }> {
    if (!this.worker || this.state.status !== "ready") return Promise.resolve({ text: "", error: "not_ready" });
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker!.postMessage({ type: "transcribe", id, audio }, [audio.buffer]);
    });
  }
}

export const tarteelEngine = new TarteelEngine();

/* ───────────────────────── Live recitation session ───────────────────────── */

const TARGET_SR = 16000;

function resampleTo16k(input: Float32Array, srcRate: number): Float32Array {
  if (srcRate === TARGET_SR) return input.slice();
  const ratio = srcRate / TARGET_SR;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const f = pos - i0;
    out[i] = input[i0] * (1 - f) + input[i1] * f;
  }
  return out;
}

export interface LiveStatus {
  /** windows the model has finished transcribing */
  windows: number;
  /** windows skipped because the mic was near-silent */
  silent: number;
  /** how long the last window took to transcribe (ms) */
  lastMs: number | null;
  /** latest raw text the model produced for the newest window */
  heard: string;
  /** reference words matched so far */
  matchedWords: number;
  /** loudness of the newest audio window (0 = silence) */
  level: number;
  error?: string;
}

export interface LiveSessionOptions {
  /** Diagnostics for an on-screen status line (what the model hears, speed, mic level). */
  onStatus?: (s: LiveStatus) => void;
  /** Reference words of the page(s) being recited, in reading order (original, with diacritics). */
  referenceWords: string[];
  /** Called whenever the reveal moves: `frontier` words are revealed, `revealed` is a per-word boolean array. */
  onReveal: (state: { frontier: number; revealed: boolean[]; heardText: string }) => void;
  /** Window of audio re-transcribed each tick. Default 8 s. */
  windowSec?: number;
  /** Minimum gap between ticks (a tick also waits for the previous one to finish). Default 1.2 s. */
  tickMs?: number;
}

export class LiveRecitationSession {
  private ctx: AudioContext | null = null;
  private proc: ScriptProcessorNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private sink: GainNode | null = null;
  private buf: Float32Array[] = [];
  private bufSamples = 0;
  private srcRate = 48000;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private stopped = false;
  private ref: string[];
  private refKeys: string[];
  private revealed: boolean[];
  private frontier = 0;
  private lastHeard = "";
  private opts: Required<Omit<LiveSessionOptions, "referenceWords" | "onReveal" | "onStatus">> & Pick<LiveSessionOptions, "referenceWords" | "onReveal" | "onStatus">;
  private windows = 0;
  private silent = 0;
  private lastMs: number | null = null;
  private lastLevel = 0;
  private lastError: string | undefined;
  private emitStatus() {
    this.opts.onStatus?.({
      windows: this.windows, silent: this.silent, lastMs: this.lastMs, heard: this.lastHeard,
      matchedWords: this.revealed.filter(Boolean).length, level: this.lastLevel, error: this.lastError,
    });
  }
  /** Every window's text, kept as a rough live transcript (used only as a fallback score source). */
  private windowTexts: string[] = [];

  constructor(private stream: MediaStream, opts: LiveSessionOptions) {
    this.ref = opts.referenceWords;
    this.refKeys = opts.referenceWords.map(tarteelWordKey);
    this.revealed = opts.referenceWords.map(() => false);
    this.opts = { windowSec: 8, tickMs: 1200, ...opts };
  }

  start() {
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    this.srcRate = this.ctx.sampleRate;
    this.src = this.ctx.createMediaStreamSource(this.stream);
    // ScriptProcessor is deprecated but still the one tap that works on every mobile browser.
    this.proc = this.ctx.createScriptProcessor(4096, 1, 1);
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0; // keep the graph alive without playing the mic back
    this.proc.onaudioprocess = (e) => {
      if (this.stopped) return;
      const ch = e.inputBuffer.getChannelData(0);
      this.buf.push(new Float32Array(ch));
      this.bufSamples += ch.length;
      const keep = this.srcRate * (this.opts.windowSec + 2);
      while (this.bufSamples - this.buf[0].length > keep && this.buf.length > 1) {
        this.bufSamples -= this.buf[0].length;
        this.buf.shift();
      }
    };
    this.src.connect(this.proc);
    this.proc.connect(this.sink);
    this.sink.connect(this.ctx.destination);
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    this.timer = setInterval(() => { void this.tick(false); }, this.opts.tickMs);
  }

  private takeWindow(): Float32Array | null {
    const want = Math.floor(this.srcRate * this.opts.windowSec);
    const have = this.bufSamples;
    if (have < this.srcRate * 1.5) return null; // not enough speech yet
    const take = Math.min(want, have);
    const out = new Float32Array(take);
    let off = take;
    for (let i = this.buf.length - 1; i >= 0 && off > 0; i--) {
      const c = this.buf[i];
      const n = Math.min(c.length, off);
      out.set(c.subarray(c.length - n), off - n);
      off -= n;
    }
    // Skip near-silent windows: nothing to transcribe and Whisper would hallucinate on them.
    let sum = 0;
    const step = 16;
    for (let i = 0; i < out.length; i += step) sum += out[i] * out[i];
    const rms = Math.sqrt(sum / (out.length / step));
    this.lastLevel = rms;
    if (rms < 0.004) { this.silent++; this.emitStatus(); return null; }
    return resampleTo16k(out, this.srcRate);
  }

  private async tick(final: boolean) {
    if (this.busy || (this.stopped && !final)) return;
    if (!tarteelEngine.isReady()) return;
    const audio = this.takeWindow();
    if (!audio) return;
    this.busy = true;
    try {
      const res = await tarteelEngine.transcribe(audio);
      const text = res.text;
      this.windows++;
      this.lastMs = res.ms ?? null;
      this.lastError = res.error;
      if (text) this.lastHeard = text;
      this.emitStatus();
      if (!text || this.stopped && !final) return;
      this.windowTexts.push(text);
      let heard = tarteelWords(text).map(tarteelWordKey);
      // The newest word of a window is often half-heard; only trust it once the window is final.
      if (!final && heard.length > 3) heard = heard.slice(0, -1);
      const { frontier, matched } = advanceReveal(this.refKeys, this.frontier, heard);
      if (matched.length) {
        // Words jumped over between the old and new frontier count as not-yet-revealed (missed).
        matched.forEach((i) => { this.revealed[i] = true; });
        this.frontier = frontier;
        this.opts.onReveal({ frontier: this.frontier, revealed: [...this.revealed], heardText: this.lastHeard });
        this.emitStatus();
      }
    } finally {
      this.busy = false;
    }
  }

  /** Last window text, for debugging / the on-screen "heard" line. */
  getLastHeard() { return this.lastHeard; }
  getFrontier() { return this.frontier; }
  getRevealed() { return [...this.revealed]; }
  /** Reference words the model heard, in order — a rough on-device transcript used only if the server transcription fails. */
  getRevealedText(): string {
    return this.ref.filter((_, i) => this.revealed[i]).join(" ");
  }

  /** One last pass over the tail audio, then release the audio graph. */
  async finish(): Promise<void> {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    // Wait for any in-flight tick, then do a final (trusting) pass on the tail.
    for (let i = 0; i < 40 && this.busy; i++) await new Promise((r) => setTimeout(r, 100));
    await this.tick(true);
    this.stopped = true;
    this.teardown();
  }

  cancel() {
    this.stopped = true;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.teardown();
  }

  private teardown() {
    try { this.proc && (this.proc.onaudioprocess = null); } catch { /* noop */ }
    try { this.src?.disconnect(); } catch { /* noop */ }
    try { this.proc?.disconnect(); } catch { /* noop */ }
    try { this.sink?.disconnect(); } catch { /* noop */ }
    try { void this.ctx?.close(); } catch { /* noop */ }
    this.ctx = null; this.proc = null; this.src = null; this.sink = null;
    this.buf = []; this.bufSamples = 0;
  }
}
