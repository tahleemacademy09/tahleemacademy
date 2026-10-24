/*
  ctcEngine.ts — main-thread handle for the CTC "skipped word" check (CTC-ONLY TEST MODE).
  With ?ctc=1 this REPLACES Tarteel on the daily revision page: nothing from Tarteel is loaded or run there.
  Opt-in per device:  open the page with ?ctc=1  (back to Tarteel with ?ctc=0).  First use downloads ~132 MB (then cached).
*/
import { ctcStatus, type CtcWordScore } from "@/lib/ctcAlign";

export { ctcStatus };
export type { CtcWordScore };

const ORT_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist";
const MODEL_BASE = (import.meta.env.VITE_CTC_MODEL_BASE as string | undefined)
  || "https://huggingface.co/Tidzo/darten-fastconformer-quran/resolve/main/";
const MODEL_URL = MODEL_BASE.replace(/\/?$/, "/") + "model_with_encoder.q8.onnx";

export interface CtcCheckResult {
  words: CtcWordScore[];
  /** what the model heard for each page word (same order as `words`; "" = nothing heard there) */
  heard?: string[];
  greedy: string;
  secs: number;
  frames: number;
  ms: number;
  basmalah: boolean;
  /** audio was shorter than the text: only the first `covered` words were graded, the rest count as not recited */
  partial?: boolean;
  covered?: number;
  /** where the time went (ms): decode on the main thread, waiting for the background run, model, alignment */
  timing?: { usedLive: boolean; liveChunks: number; liveWaitMs: number; tailSecs: number; inferMs: number; alignMs: number; wasmThreads: number; decodeMs?: number };
}
export interface CtcCheckProgress { stage: "finishing" | "listening" | "aligning"; done: number; total: number }
export type CtcStatusState = { status: "idle" | "loading" | "ready" | "error"; loadedMB?: number; totalMB?: number; error?: string };

export function ctcEnabled(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get("ctc");
    if (q === "1") localStorage.setItem("ctc_shadow", "1");
    if (q === "0") localStorage.removeItem("ctc_shadow");
    return localStorage.getItem("ctc_shadow") === "1";
  } catch { return false; }
}

/** Decode a recorded blob (webm/opus, mp4, ogg…) to mono 16 kHz Float32 samples. */
async function decodeBlobTo16k(blob: Blob): Promise<Float32Array> {
  const SRATE = 16000;
  const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const data = await blob.arrayBuffer();
  let ctx: AudioContext;
  try { ctx = new AC({ sampleRate: SRATE }); } catch { ctx = new AC(); }
  try {
    const buf = await new Promise<AudioBuffer>((resolve, reject) => {
      const p = ctx.decodeAudioData(data, resolve, reject);   // callback form: older Safari / WebViews
      if (p && typeof (p as any).catch === "function") (p as Promise<AudioBuffer>).catch(reject);
    });
    const mono = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let k = 0; k < ch.length; k++) mono[k] += ch[k] / buf.numberOfChannels;
    }
    if (buf.sampleRate === SRATE) return mono;
    const ratio = buf.sampleRate / SRATE, outLen = Math.floor(mono.length / ratio), out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio, i0 = Math.floor(pos), i1 = Math.min(i0 + 1, mono.length - 1), f = pos - i0;
      out[i] = mono[i0] * (1 - f) + mono[i1] * f;
    }
    return out;
  } finally { try { void ctx.close(); } catch { /* noop */ } }
}

class CtcEngine {
  private worker: Worker | null = null;
  private loadPromise: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, (r: any) => void>();
  private listeners = new Set<(s: CtcStatusState) => void>();
  state: CtcStatusState = { status: "idle" };
  progress: CtcCheckProgress | null = null;
  private progListeners = new Set<(p: CtcCheckProgress | null) => void>();
  subscribeProgress(fn: (p: CtcCheckProgress | null) => void) { this.progListeners.add(fn); fn(this.progress); return () => { this.progListeners.delete(fn); }; }

  subscribe(fn: (s: CtcStatusState) => void) { this.listeners.add(fn); fn(this.state); return () => { this.listeners.delete(fn); }; }
  private emit(s: CtcStatusState) { this.state = s; this.listeners.forEach((l) => { try { l(s); } catch { /* noop */ } }); }

  load(): Promise<void> {
    if (this.state.status === "ready") return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;
    this.emit({ status: "loading", loadedMB: 0, totalMB: 0 });
    this.loadPromise = new Promise<void>((resolve, reject) => {
      const fail = (msg: string) => {
        this.emit({ status: "error", error: msg });
        this.loadPromise = null;
        this.worker?.terminate(); this.worker = null;
        reject(new Error(msg));
      };
      try { this.worker = new Worker(new URL("./ctcWorker.ts", import.meta.url), { type: "module" }); }
      catch (e: any) { fail(String(e?.message ?? e)); return; }
      this.worker.onmessage = (ev) => {
        const m = ev.data;
        if (m.type === "progress") this.emit({ status: "loading", loadedMB: m.loaded / 1048576, totalMB: m.total / 1048576 });
        else if (m.type === "ready") { this.emit({ status: "ready" }); resolve(); }
        else if (m.type === "load_error") fail(m.error);
        else if (m.type === "live_progress") { if (m.error) console.warn("[ctc] live step failed:", m.error); else this.live?.cb(m.shown, m.ms); }
        else if (m.type === "check_progress") { this.progress = { stage: m.stage, done: m.done, total: m.total }; this.progListeners.forEach((l) => { try { l(this.progress); } catch { /* noop */ } }); }
        else if (m.type === "result" || m.type === "selftest_result") { const cb = this.pending.get(m.id); if (cb) { this.pending.delete(m.id); cb(m); } }
      };
      this.worker.onerror = (ev) => { if (this.state.status !== "ready") fail((ev as ErrorEvent).message || "worker_error"); };
      this.worker.postMessage({
        type: "load", ortBase: ORT_BASE, modelUrl: MODEL_URL,
        vocabUrl: new URL("/ctc/vocab.json", window.location.origin).href,
      });
    });
    return this.loadPromise;
  }

  private call<T>(msg: any, transfer: Transferable[] = []): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, (m) => (m.error ? reject(new Error(m.error)) : resolve(m as T)));
      this.worker!.postMessage({ ...msg, id }, transfer);
    });
  }

  /** Is each reference word really in the recording?  refWords must be the same words (same order) the grid uses. */
  async check(blob: Blob, refWords: string[], opts: { basmalah?: boolean | "auto" } = {}): Promise<CtcCheckResult> {
    await this.load();
    const td = Date.now();
    const audio = await decodeBlobTo16k(blob);
    const decodeMs = Date.now() - td;
    this.progress = null;
    const res = await this.call<CtcCheckResult>({ type: "check", audio, words: refWords, basmalah: opts.basmalah ?? "auto", useLive: true }, [audio.buffer]);
    if (res.timing) res.timing.decodeMs = decodeMs;
    this.progress = null; this.progListeners.forEach((l) => { try { l(null); } catch { /* noop */ } });
    return res;
  }

  /* ── LIVE reveal: stream mic audio in while the student recites; cb(shownWords) fires as words are heard ── */
  private live: { words: string[]; cb: (shown: number, ms?: number) => void; ready: boolean; queue: Float32Array[] } | null = null;

  /** Start a live session. Safe to call before the model has finished loading: audio is queued and replayed. */
  liveBegin(words: string[], cb: (shown: number, ms?: number) => void) {
    const L = { words, cb, ready: false, queue: [] as Float32Array[] };
    this.live = L;
    this.load().then(() => {
      if (this.live !== L || !this.worker) return;
      this.worker.postMessage({ type: "live_start", words });
      for (const q of L.queue) this.worker.postMessage({ type: "live_audio", samples: q }, [q.buffer]);
      L.queue = []; L.ready = true;
    }).catch(() => { /* status shows the load error; recording itself is unaffected */ });
  }
  /** 16 kHz mono samples from the microphone. */
  liveFeed(samples: Float32Array) {
    const L = this.live;
    if (!L) return;
    if (!L.ready || !this.worker) { if (L.queue.length < 4000) L.queue.push(samples); return; }
    this.worker.postMessage({ type: "live_audio", samples }, [samples.buffer]);
  }
  liveEnd() {
    this.live = null;
    try { this.worker?.postMessage({ type: "live_stop" }); } catch { /* noop */ }
  }

  /** Tokenizer self-test against public/ctc/sp_tests.json (made by the real sentencepiece). Run from the console: __ctcSelfTest() */
  async selfTest() {
    await this.load();
    return this.call<{ total: number; badCount: number; bad: any[] }>({ type: "selftest", testsUrl: new URL("/ctc/sp_tests.json", window.location.origin).href });
  }
}

export const ctcEngine = new CtcEngine();
if (typeof window !== "undefined") (window as any).__ctcSelfTest = () => ctcEngine.selfTest().then((r) => { console.log("[ctc] tokenizer self-test", r); return r; });
