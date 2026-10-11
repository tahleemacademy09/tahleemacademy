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

import { prepareForAsr } from "@/lib/audioEnhance";

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
  const lookahead = opts.lookahead ?? 8;
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
  // A single stray hit is too weak to move the frontier (noise, a common word) — unless it is the very word
  // we were waiting for (right at the frontier), which is how the first word of a recitation gets revealed.
  if (best.score < 2) {
    const only = best.idxs[0];
    const nearFrontier = best.score === 1 && only !== undefined && only >= frontier && only <= frontier + 1 && ref[only].length >= 3;
    if (!nearFrontier) return { frontier, matched: [] };
  }
  const newMatches = best.idxs.filter((i) => i >= frontier);
  if (!newMatches.length) return { frontier, matched: [] };
  // A big jump forward on only two hits is usually a coincidence (common words like الله / من repeat a lot):
  // require stronger evidence before moving the frontier more than a few words.
  if (newMatches[0] - frontier > 3 && newMatches.length < 3) return { frontier, matched: [] };
  const last = newMatches[newMatches.length - 1];
  return { frontier: Math.max(frontier, last + 1), matched: newMatches };
}

/* ───────────────────────── Worker (model host) ───────────────────────── */

const WORKER_SRC = `
import { pipeline, env } from "${TRANSFORMERS_CDN}";
try { if (self.crossOriginIsolated) env.backends.onnx.wasm.numThreads = Math.min(4, self.navigator.hardwareConcurrency || 2); } catch (e) {}
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

let chain = Promise.resolve();
// One job at a time: two overlapping runs on the same model session can corrupt each other's output.
self.onmessage = (ev) => { chain = chain.then(() => handle(ev)).catch(() => {}); };
async function handle(ev) {
  const m = ev.data;
  try {
    if (m.type === "load") {
      await load(!!m.useGpu);
    } else if (m.type === "transcribe") {
      if (!asr) { self.postMessage({ type: "result", id: m.id, text: "", error: "not_loaded" }); return; }
      const t0 = Date.now();
      const opts = { language: "arabic", task: "transcribe" };
      // Whole recordings: Whisper sees 30 s at a time with a 5 s stride so no word is lost at a cut.
      if (m.full) { opts.chunk_length_s = 30; opts.stride_length_s = 5; }
      // Cap the output length to what real recitation needs (~14 tokens per second at the very most).
      // A model that starts looping ("إلى الذي إلى الذي …") would otherwise run to the 448-token limit — slow.
      opts.max_new_tokens = Math.min(440, Math.ceil(Math.min(30, m.audio.length / 16000) * 14) + 24);
      const out = await asr(m.audio, opts);
      self.postMessage({ type: "result", id: m.id, text: (out && out.text || "").trim(), ms: Date.now() - t0 });
    }
  } catch (e) {
    self.postMessage({ type: m.type === "load" ? "load_error" : "result", id: m.id, text: "", error: String((e && e.message) || e) });
  }}

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
    // Ask the browser to keep the downloaded model (~100 MB) instead of evicting it when storage is tight.
    try { void navigator.storage?.persist?.(); } catch { /* noop */ }
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
  transcribe(audio: Float32Array, full = false): Promise<{ text: string; error?: string; ms?: number }> {
    if (!this.worker || this.state.status !== "ready") return Promise.resolve({ text: "", error: "not_ready" });
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker!.postMessage({ type: "transcribe", id, audio, full }, [audio.buffer]);
    });
  }

  /**
   * Transcribe a finished recording (any format the browser can decode). Waits for the model to
   * finish loading first, so it is safe to call straight after the student taps Stop.
   * Runs in 30 s windows with a 5 s stride, exactly like public/tarteel_browser_test.html.
   */
  async transcribeBlob(blob: Blob): Promise<{ text: string; error?: string; ms?: number; audioSecs?: number }> {
    try {
      await this.load(true);
    } catch (e: any) {
      return { text: "", error: String(e?.message ?? e ?? "load_failed") };
    }
    let audio: Float32Array;
    try {
      audio = await decodeBlobTo16k(blob);
    } catch (e: any) {
      return { text: "", error: "decode_failed: " + String(e?.message ?? e) };
    }
    const audioSecs = audio.length / TARGET_SR;
    if (audio.length < TARGET_SR * 0.4) return { text: "", ms: 0, audioSecs };
    // Only real speech reaches the model — silence / room noise / long pauses make it invent words.
    let gated: Float32Array | null = null;
    try { gated = prepareForAsr(audio, TARGET_SR); } catch { gated = audio; }
    if (!gated) return { text: "", ms: 0, audioSecs };
    const res = await this.transcribe(gated, true);
    return { ...res, text: collapseLoops(res.text || ""), audioSecs };
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
/** Decode a recorded blob (webm/opus, mp4, ogg…) to mono 16 kHz Float32 samples. */
export async function decodeBlobTo16k(blob: Blob): Promise<Float32Array> {
  const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const data = await blob.arrayBuffer();
  let ctx: AudioContext;
  try { ctx = new AC({ sampleRate: TARGET_SR }); } catch { ctx = new AC(); }
  try {
    const buf = await new Promise<AudioBuffer>((resolve, reject) => {
      // The callback form is the only one older Safari/WebViews support.
      const p = ctx.decodeAudioData(data, resolve, reject);
      if (p && typeof (p as any).catch === "function") (p as Promise<AudioBuffer>).catch(reject);
    });
    const mono = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let k = 0; k < ch.length; k++) mono[k] += ch[k] / buf.numberOfChannels;
    }
    return buf.sampleRate === TARGET_SR ? mono : resampleTo16k(mono, buf.sampleRate);
  } finally {
    try { void ctx.close(); } catch { /* noop */ }
  }
}

/**
 * Sequential audio segmenter. Every sample the microphone produces is handed to the model exactly once
 * (plus a short overlap so a word cut at a boundary is heard whole). Because Whisper always processes a
 * fixed 30 s block, a longer segment costs almost the same as a short one — so when the phone is slow the
 * segment simply grows (up to maxSec) and the reveal catches up instead of silently skipping speech.
 */
export class SegmentBuffer {
  private chunks: { start: number; data: Float32Array }[] = [];
  private total = 0;     // absolute samples received
  private procEnd = 0;   // absolute sample up to which audio has been handed out
  constructor(
    private rate: number,
    private overlapSec = 1.5,
    private maxSec = 20,
    private minNewSec = 2,
  ) {}

  push(data: Float32Array) {
    this.chunks.push({ start: this.total, data });
    this.total += data.length;
  }

  /** Seconds of audio received but not yet handed to the model. */
  pendingSec(): number { return (this.total - this.procEnd) / this.rate; }

  private slice(from: number, to: number): Float32Array {
    const out = new Float32Array(Math.max(0, to - from));
    for (const c of this.chunks) {
      const cs = c.start, ce = c.start + c.data.length;
      if (ce <= from || cs >= to) continue;
      const a = Math.max(from, cs), b = Math.min(to, ce);
      out.set(c.data.subarray(a - cs, b - cs), a - from);
    }
    return out;
  }

  private commit(to: number) {
    const overlap = Math.floor(this.overlapSec * this.rate);
    this.procEnd = to;
    const keepFrom = to - overlap;
    while (this.chunks.length && this.chunks[0].start + this.chunks[0].data.length <= keepFrom) this.chunks.shift();
  }

  /** The next segment (overlap + new audio), or null if there is not enough new audio yet. */
  next(final = false): Float32Array | null {
    const newSamples = this.total - this.procEnd;
    if (newSamples < this.rate * (final ? 0.4 : this.minNewSec)) return null;
    const overlap = Math.floor(this.overlapSec * this.rate);
    const from = Math.max(0, this.procEnd - overlap);
    const to = Math.min(this.total, from + Math.floor(this.maxSec * this.rate));
    const out = this.slice(from, to);
    this.commit(to);
    return out;
  }

  /**
   * Like next(), but waits until `targetSec` of new audio has built up and then cuts at the QUIETEST
   * moment (a breath / pause between words) so no word is split across two segments. When the model is
   * behind, the segment grows up to maxSec. `final` flushes whatever is left.
   */
  nextAtPause(targetSec: number, final = false): Float32Array | null {
    if (final) return this.next(true);
    const newSamples = this.total - this.procEnd;
    if (newSamples < this.rate * targetSec) return null;
    const overlap = Math.floor(this.overlapSec * this.rate);
    const from = Math.max(0, this.procEnd - overlap);
    const hardTo = Math.min(this.total, from + Math.floor(this.maxSec * this.rate));
    const winStart = Math.max(this.procEnd + Math.floor(Math.max(1, targetSec - 4) * this.rate), hardTo - Math.floor(5 * this.rate));
    let to = hardTo;
    if (winStart < hardTo - this.rate * 0.5) {
      const win = this.slice(winStart, hardTo);
      const fr = Math.floor(0.12 * this.rate), hop = Math.floor(0.04 * this.rate);
      let bestE = Infinity, bestAt = win.length;
      for (let i = 0; i + fr <= win.length; i += hop) {
        let e = 0;
        for (let k = i; k < i + fr; k += 4) e += win[k] * win[k];
        if (e < bestE) { bestE = e; bestAt = i + (fr >> 1); }
      }
      to = winStart + bestAt;
    }
    const out = this.slice(from, to);
    this.commit(to);
    return out;
  }

  clear() { this.chunks = []; this.total = 0; this.procEnd = 0; }
}

export interface LiveStatus {
  /** segments the model has finished transcribing */
  windows: number;
  /** segments skipped because the mic was near-silent */
  silent: number;
  /** how long the last segment took to transcribe (ms) */
  lastMs: number | null;
  /** latest raw text the model produced for the newest segment */
  heard: string;
  /** reference words matched so far */
  matchedWords: number;
  /** loudness of the newest audio segment (0 = silence) */
  level: number;
  /** seconds of recited audio the model has not looked at yet (0 = fully caught up) */
  lagSec: number;
  /** "webgpu" or "wasm" once the model is loaded */
  device?: string;
  error?: string;
}

export interface LiveSessionOptions {
  /** Diagnostics for an on-screen status line (what the model hears, speed, mic level). */
  onStatus?: (s: LiveStatus) => void;
  /** Reference words of the page(s) being recited, in reading order (original, with diacritics). */
  referenceWords: string[];
  /** Called whenever the reveal moves. `revealed` is a per-word boolean array of words actually heard. */
  onReveal: (state: { frontier: number; revealed: boolean[]; heardText: string }) => void;
  /** Longest segment sent to the model in one go (seconds). */
  maxSegmentSec?: number;
  /** Polling interval; the real cadence is limited by model inference time. */
  tickMs?: number;
}

export class LiveRecitationSession {
  private ctx: AudioContext | null = null;
  private proc: ScriptProcessorNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private sink: GainNode | null = null;
  private seg: SegmentBuffer | null = null;
  private srcRate = 48000;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private stopped = false;
  private ref: string[];
  private refKeys: string[];
  private revealed: boolean[];
  private frontier = 0;
  private lastHeard = "";
  private opts: { maxSegmentSec: number; tickMs: number } & Pick<LiveSessionOptions, "referenceWords" | "onReveal" | "onStatus">;
  private windows = 0;
  private silent = 0;
  private lastMs: number | null = null;
  private lastLevel = 0;
  private lastError: string | undefined;
  private emitStatus() {
    this.opts.onStatus?.({
      windows: this.windows, silent: this.silent, lastMs: this.lastMs, heard: this.lastHeard,
      matchedWords: this.revealed.filter(Boolean).length, level: this.lastLevel,
      lagSec: this.seg ? Math.round(this.seg.pendingSec() * 10) / 10 : 0,
      device: tarteelEngine.state.device, error: this.lastError,
    });
  }
  /** Every segment's text, kept as a rough live transcript (used only as a fallback score source). */
  private windowTexts: string[] = [];

  constructor(private stream: MediaStream, opts: LiveSessionOptions) {
    this.ref = opts.referenceWords;
    this.refKeys = opts.referenceWords.map(tarteelWordKey);
    this.revealed = opts.referenceWords.map(() => false);
    this.opts = { maxSegmentSec: 20, tickMs: 700, ...opts };
  }

  start() {
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    this.srcRate = this.ctx.sampleRate;
    this.seg = new SegmentBuffer(this.srcRate, 1.5, this.opts.maxSegmentSec, 2);
    this.src = this.ctx.createMediaStreamSource(this.stream);
    // ScriptProcessor is deprecated but still the one tap that works on every mobile browser.
    this.proc = this.ctx.createScriptProcessor(4096, 1, 1);
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0; // keep the graph alive without playing the mic back
    this.proc.onaudioprocess = (e) => {
      if (this.stopped || !this.seg) return;
      this.seg.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    this.src.connect(this.proc);
    this.proc.connect(this.sink);
    this.sink.connect(this.ctx.destination);
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    this.timer = setInterval(() => { void this.tick(false); }, this.opts.tickMs);
  }

  private takeSegment(final: boolean): Float32Array | null {
    const out = this.seg?.next(final) ?? null;
    if (!out) return null;
    // Skip near-silent segments: nothing to transcribe and Whisper would hallucinate on them.
    let sum = 0;
    const step = 16;
    for (let i = 0; i < out.length; i += step) sum += out[i] * out[i];
    const rms = Math.sqrt(sum / Math.max(1, out.length / step));
    this.lastLevel = rms;
    if (rms < 0.004) { this.silent++; this.emitStatus(); return null; }
    return resampleTo16k(out, this.srcRate);
  }

  private async tick(final: boolean) {
    if (this.busy || (this.stopped && !final)) return;
    if (!tarteelEngine.isReady()) return;
    const audio = this.takeSegment(final);
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
      if (!text || (this.stopped && !final)) return;
      this.windowTexts.push(text);
      let heard = tarteelWords(text).map(tarteelWordKey);
      // The newest word of a segment is often half-heard; only trust it once the recording is over.
      if (!final && heard.length > 3) heard = heard.slice(0, -1);
      const { frontier, matched } = advanceReveal(this.refKeys, this.frontier, heard);
      if (matched.length) {
        // Only words actually heard are revealed; words jumped over stay hidden (missed).
        matched.forEach((i) => { this.revealed[i] = true; });
        this.frontier = frontier;
        this.opts.onReveal({ frontier: this.frontier, revealed: [...this.revealed], heardText: this.lastHeard });
      }
      this.emitStatus();
    } finally {
      this.busy = false;
      // Backlog (slow phone): keep going straight away instead of waiting for the next timer tick.
      if (!this.stopped && this.seg && this.seg.pendingSec() >= 2) setTimeout(() => { void this.tick(false); }, 0);
    }
  }

  /** Last segment text, for debugging / the on-screen "heard" line. */
  getLastHeard() { return this.lastHeard; }
  getFrontier() { return this.frontier; }
  getRevealed() { return [...this.revealed]; }
  /** Reference words the model heard, in order — a rough on-device transcript used only if the server transcription fails. */
  getRevealedText(): string {
    return this.ref.filter((_, i) => this.revealed[i]).join(" ");
  }

  /** Drain whatever audio the model has not seen yet (bounded), then release the audio graph. */
  async finish(): Promise<void> {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    for (let i = 0; i < 40 && this.busy; i++) await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 6 && this.seg && this.seg.pendingSec() > 0.4; i++) {
      await this.tick(true);
    }
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
    this.seg?.clear();
  }
}


/* ───────────────── Background transcription while the student recites ───────────────── */

/**
 * Merge two consecutive chunk transcripts that share a few seconds of overlapping audio.
 * The words right at a cut are unreliable (a word sliced in half is heard as another word, or the
 * next chunk starts with a stray word), so we allow up to 2 trailing words of `prev` and 2 leading
 * words of `next` to be discarded as boundary noise, and look for the longest run of (fuzzy-equal)
 * words that the two transcripts share. Everything before the run comes from `prev`, everything after
 * it from `next`. If no shared run of 2+ words is found (e.g. the overlap was silence) the texts are
 * simply joined and nothing is thrown away.
 */
export function mergeHeard(prev: string, next: string): string {
  const a = prev.trim().split(/\s+/).filter(Boolean);
  const b = next.trim().split(/\s+/).filter(Boolean);
  if (!a.length) return b.join(" ");
  if (!b.length) return a.join(" ");
  const ak = a.map(tarteelWordKey), bk = b.map(tarteelWordKey);
  let best: { k: number; drops: number; dt: number; sh: number } | null = null;
  for (let dt = 0; dt <= 2; dt++) {
    for (let sh = 0; sh <= 2; sh++) {
      const aEnd = a.length - dt;
      const maxK = Math.min(10, aEnd, b.length - sh);
      for (let k = maxK; k >= 2; k--) {
        let ok = true;
        for (let i = 0; i < k && ok; i++) ok = keysMatch(ak[aEnd - k + i], bk[sh + i]);
        if (ok) {
          const drops = dt + sh;
          if (!best || k > best.k || (k === best.k && drops < best.drops)) best = { k, drops, dt, sh };
          break;
        }
      }
    }
  }
  if (best) return [...a.slice(0, a.length - best.dt), ...b.slice(best.sh + best.k)].join(" ");
  // single exact shared word at the very seam
  if (ak[ak.length - 1].length >= 3 && ak[ak.length - 1] === bk[0]) return [...a, ...b.slice(1)].join(" ");
  return [...a, ...b].join(" ");
}

/** A model that loops repeats the same 1–6 word phrase over and over — keep it once. */
export function collapseLoops(text: string): string {
  const w = text.trim().split(/\s+/).filter(Boolean);
  if (w.length < 6) return w.join(" ");
  const k = w.map(tarteelWordKey);
  const out: string[] = [];
  let i = 0;
  while (i < w.length) {
    let done = false;
    for (let n = 1; n <= 6 && !done; n++) {
      if (i + n * 3 > w.length) break;
      let reps = 1;
      while (i + (reps + 1) * n <= w.length) {
        let same = true;
        for (let j = 0; j < n && same; j++) same = k[i + j] === k[i + reps * n + j];
        if (!same) break;
        reps++;
      }
      if (reps >= 3) { for (let j = 0; j < n; j++) out.push(w[i + j]); i += reps * n; done = true; }
    }
    if (!done) { out.push(w[i]); i++; }
  }
  return out.join(" ");
}

export interface BackgroundResult {
  text: string;
  /** false if any chunk failed — the caller should then transcribe the whole recording instead */
  ok: boolean;
}

/**
 * Transcribes the recording WHILE the student is still reciting, using exactly the same proven path as
 * a whole-recording transcription (a real recorded file → the browser's own decoder/resampler → model).
 *
 * Two MediaRecorders take turns on the same microphone stream: a new short chunk starts every
 * `intervalMs`, and each chunk keeps recording `overlapMs` longer so every word is heard whole in at
 * least one chunk. Each finished chunk is transcribed immediately, so at Stop only the last few seconds
 * are left. If the phone cannot keep up (chunks queue), the chunk length grows by itself. Recording
 * length is unlimited: only ~10 s of audio is ever held for the model at a time.
 * Nothing is shown live — the caller awaits finish() and then shows the full result.
 *
 * `persistKey`: every chunk's text is also saved in localStorage so a long recording's transcript
 * survives a refresh (see ChunkTranscriber.saved()).
 */
export class ChunkTranscriber {
  private active: { mr: MediaRecorder; startedAt: number }[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private failed = false;
  private seq = 0;
  private inflight = 0;
  private results = new Map<number, string>();
  private waiter: (() => void) | null = null;
  private nextInterval: number;

  constructor(
    private stream: MediaStream,
    private mime: string,
    private intervalMs = 8000,
    private overlapMs = 2500,
    private persistKey: string | null = null,
  ) { this.nextInterval = intervalMs; }

  /** Transcript saved by a previous page load (complete = the recording had been fully processed). */
  static saved(key: string): { text: string; complete: boolean } | null {
    try {
      const d = JSON.parse(localStorage.getItem(key) || "null");
      if (!d || !d.r) return null;
      let text = "";
      Object.keys(d.r).map(Number).sort((a, b) => a - b).forEach((k) => { text = mergeHeard(text, d.r[k]); });
      return { text, complete: !!d.complete };
    } catch { return null; }
  }
  static clearSaved(key: string) { try { localStorage.removeItem(key); } catch { /* noop */ } }

  private save(complete = false) {
    if (!this.persistKey) return;
    try {
      const r: Record<number, string> = {};
      this.results.forEach((v, k) => { r[k] = v; });
      localStorage.setItem(this.persistKey, JSON.stringify({ r, complete }));
    } catch { /* storage full — non-critical */ }
  }

  /** resume = continue a recording that was interrupted by a refresh (keeps the text already heard). */
  start(resume = false) {
    if (this.persistKey) {
      if (resume) {
        try {
          const d = JSON.parse(localStorage.getItem(this.persistKey) || "null");
          if (d?.r) {
            Object.keys(d.r).map(Number).forEach((k) => { this.results.set(k, d.r[k]); this.seq = Math.max(this.seq, k + 1); });
          }
        } catch { /* noop */ }
      } else ChunkTranscriber.clearSaved(this.persistKey);
    }
    tarteelEngine.load(true).catch(() => { this.failed = true; });
    this.spawn();
    this.schedule();
  }

  private schedule() {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      // Falling behind (two or more chunks waiting)? make the next chunk longer so the queue drains.
      this.nextInterval = this.inflight >= 2 ? Math.min(20000, this.nextInterval + 4000) : Math.max(this.intervalMs, this.nextInterval - 2000);
      this.spawn();
      this.schedule();
    }, this.nextInterval);
  }

  private spawn() {
    if (this.stopped) return;
    let mr: MediaRecorder;
    try {
      mr = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime, audioBitsPerSecond: 96000 } : { audioBitsPerSecond: 96000 });
    } catch { this.failed = true; return; }
    const chunks: Blob[] = [];
    const mySeq = this.seq++;
    const entry = { mr, startedAt: Date.now() };
    mr.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };
    mr.onstop = () => {
      this.active = this.active.filter((a) => a.mr !== mr);
      const blob = new Blob(chunks, { type: this.mime || "audio/webm" });
      chunks.length = 0;
      if (blob.size < 3000) { this.check(); return; }          // empty / near-silent
      this.inflight++;
      tarteelEngine.transcribeBlob(blob)
        .then((r) => { if (r.error) this.failed = true; else if (r.text) { this.results.set(mySeq, r.text); this.save(); } })
        .catch(() => { this.failed = true; })
        .finally(() => { this.inflight--; this.check(); });
    };
    try { mr.start(1000); } catch { this.failed = true; return; }
    this.active.push(entry);
    // keeps recording for this chunk's length + overlap; the next chunk starts when the interval ends
    setTimeout(() => { if (mr.state !== "inactive") { try { mr.stop(); } catch { /* noop */ } } }, this.nextInterval + this.overlapMs);
  }

  private check() {
    if (this.waiter && this.active.length === 0 && this.inflight === 0) { const w = this.waiter; this.waiter = null; w(); }
  }

  /** Stop recording, wait for the chunk(s) still being transcribed, and return the merged transcript. */
  finish(): Promise<BackgroundResult> {
    this.stopped = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    return new Promise((resolve) => {
      const done = () => {
        let text = "";
        [...this.results.keys()].sort((a, b) => a - b).forEach((k) => { text = mergeHeard(text, this.results.get(k)!); });
        this.save(!this.failed);
        resolve({ text, ok: !this.failed });
      };
      if (this.active.length === 0 && this.inflight === 0) { done(); return; }
      this.waiter = done;
      // If an older chunk is still running (inside its overlap), the newest chunk is only a few seconds
      // old and is entirely contained in it → skip it, so only ONE short job is left to run.
      const list = [...this.active].sort((a, b) => a.startedAt - b.startedAt);
      if (list.length >= 2) {
        const newest = list[list.length - 1];
        newest.mr.onstop = () => { this.active = this.active.filter((a) => a !== newest); this.check(); };
      }
      list.forEach((a) => { if (a.mr.state !== "inactive") { try { a.mr.stop(); } catch { /* noop */ } } });
    });
  }

  cancel() {
    this.stopped = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    [...this.active].forEach((a) => { a.mr.onstop = null as any; if (a.mr.state !== "inactive") { try { a.mr.stop(); } catch { /* noop */ } } });
    this.active = [];
  }
}
