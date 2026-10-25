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
  timing?: { usedLive: boolean; liveChunks: number; liveWaitMs: number; tailSecs: number; inferMs: number; alignMs: number; wasmThreads: number; decodeMs?: number; liveNote?: string };
}
export interface CtcCheckProgress { stage: "decoding" | "finishing" | "listening" | "aligning"; done: number; total: number }
export type CtcStatusState = { status: "idle" | "loading" | "ready" | "error"; loadedMB?: number; totalMB?: number; error?: string };

export function ctcEnabled(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get("ctc");
    if (q === "1" || q === "0") localStorage.setItem("ctc_shadow", q);
    const v = localStorage.getItem("ctc_shadow");
    // The Capacitor app has no URL bar, so it can never pass ?ctc=1: on native it is ON unless explicitly set to "0".
    return v === "1" || (v !== "0" && isNative());
  } catch { return false; }
}

function isNative(): boolean {
  try { return !!(window as any).Capacitor?.isNativePlatform?.(); } catch { return false; }
}

/* ── Native app: keep the model in the app's own storage (Capacitor Filesystem) ──
   Plugins only exist on the main thread, so the download happens here; the worker then just fetches the saved file
   through the WebView's local file URL. Returns null on web (or on any failure) → the worker downloads as before. */
const NATIVE_MODEL_PATH = "ctc/model_with_encoder.q8.onnx";
const NATIVE_MODEL_MIN_BYTES = 100 * 1024 * 1024;   // anything smaller is a broken/partial file

async function nativeModelUrl(onProgress: (loaded: number, total: number) => void): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { Capacitor } = await import("@capacitor/core");
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const where = { path: NATIVE_MODEL_PATH, directory: Directory.Data };
    let uri: string | null = null;
    try { const st = await Filesystem.stat(where); if (st.size >= NATIVE_MODEL_MIN_BYTES) uri = st.uri; } catch { /* not saved yet */ }
    if (!uri) {
      const part = { path: NATIVE_MODEL_PATH + ".part", directory: Directory.Data };
      try { await Filesystem.deleteFile(part); } catch { /* none */ }
      const sub = await Filesystem.addListener("progress", (p: any) => { if (p?.url === MODEL_URL) onProgress(p.bytes, p.contentLength); });
      try { await Filesystem.downloadFile({ url: MODEL_URL, ...part, recursive: true, progress: true }); }
      finally { try { await sub.remove(); } catch { /* noop */ } }
      // only a fully downloaded file gets the real name, so an interrupted download is never mistaken for the model
      await Filesystem.rename({ from: part.path, to: NATIVE_MODEL_PATH, directory: Directory.Data, toDirectory: Directory.Data });
      const st = await Filesystem.stat(where);
      if (st.size < NATIVE_MODEL_MIN_BYTES) { try { await Filesystem.deleteFile(where); } catch { /* noop */ } throw new Error("model file incomplete"); }
      uri = st.uri;
    }
    return Capacitor.convertFileSrc(uri);
  } catch (e) { console.warn("[ctc] native model storage unavailable, using normal download:", e); return null; }
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
  private pending = new Map<number, { ok: (r: any) => void; fail: (e: Error) => void }>();
  private activeCheckId = 0;
  private listeners = new Set<(s: CtcStatusState) => void>();
  state: CtcStatusState = { status: "idle" };
  progress: CtcCheckProgress | null = null;
  private setProgress(p: CtcCheckProgress | null) { this.progress = p; this.progListeners.forEach((l) => { try { l(p); } catch { /* noop */ } }); }
  private resetWorker(reason: string) {
    const waiting = [...this.pending.values()];
    this.pending.clear();
    try { this.worker?.terminate(); } catch { /* noop */ }
    this.worker = null; this.loadPromise = null; this.live = null;
    this.emit({ status: "idle" });
    waiting.forEach((w) => w.fail(new Error(reason)));
  }
  private lastSignal = 0;
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
      const startWorker = (modelUrl: string, noCache: boolean) => {
      try { this.worker = new Worker(new URL("./ctcWorker.ts", import.meta.url), { type: "module" }); }
      catch (e: any) { fail(String(e?.message ?? e)); return; }
      this.worker.onmessage = (ev) => {
        const m = ev.data;
        this.lastSignal = Date.now();
        if (m.type === "progress") this.emit({ status: "loading", loadedMB: m.loaded / 1048576, totalMB: m.total / 1048576 });
        else if (m.type === "ready") { this.emit({ status: "ready" }); resolve(); }
        else if (m.type === "load_error") fail(m.error);
        else if (m.type === "live_progress") { if (m.error) console.warn("[ctc] live step failed:", m.error); else this.live?.cb(m.shown, m.ms); }
        else if (m.type === "check_progress") { if (m.id === this.activeCheckId) this.setProgress({ stage: m.stage, done: m.done, total: m.total }); }
        else if (m.type === "result" || m.type === "selftest_result") { const w = this.pending.get(m.id); if (w) { this.pending.delete(m.id); w.ok(m); } }
      };
      this.worker.onerror = (ev) => {
        const msg = (ev as ErrorEvent).message || "worker_error";
        if (this.state.status !== "ready") fail(msg); else this.resetWorker("worker_crashed: " + msg);
      };
      this.worker.onmessageerror = () => { if (this.state.status === "ready") this.resetWorker("worker_messageerror"); };
      this.worker.postMessage({
        type: "load", ortBase: ORT_BASE, modelUrl, noCache,
        vocabUrl: new URL("/ctc/vocab.json", window.location.origin).href,
      });
      };
      void nativeModelUrl((l, t) => { this.lastSignal = Date.now(); this.emit({ status: "loading", loadedMB: l / 1048576, totalMB: t / 1048576 }); })
        .then((local) => startWorker(local ?? MODEL_URL, !!local));
    });
    return this.loadPromise;
  }

  private call<T>(msg: any, transfer: Transferable[] = [], id: number = this.nextId++): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.worker) { reject(new Error("worker_gone")); return; }
      this.pending.set(id, { ok: (m) => (m.error ? reject(new Error(m.error)) : resolve(m as T)), fail: reject });
      this.worker.postMessage({ ...msg, id }, transfer);
    });
  }

  /** call() + watchdog: nothing from the worker for STALL_MS → it is hung/dead → reset it and fail (never wait forever). */
  private callWatched<T>(msg: any, transfer: Transferable[], id: number): Promise<T> {
    const STALL_MS = 90_000;
    this.lastSignal = Date.now();
    const p = this.call<T>(msg, transfer, id);
    return new Promise<T>((resolve, reject) => {
      const t = setInterval(() => {
        if (Date.now() - this.lastSignal > STALL_MS) { clearInterval(t); this.resetWorker("worker_stalled"); }
      }, 3000);
      p.then((v) => { clearInterval(t); resolve(v); }, (e) => { clearInterval(t); reject(e); });
    });
  }

  /** load() with a watchdog: no sign of life (download progress / worker message) for 60 s → reset and fail, never wait forever. */
  private loadWatched(): Promise<void> {
    if (this.state.status === "ready") return Promise.resolve();
    this.lastSignal = Date.now();
    const p = this.load();
    return new Promise<void>((resolve, reject) => {
      const t = setInterval(() => {
        if (Date.now() - this.lastSignal > 60_000) { clearInterval(t); this.resetWorker("load_stalled"); reject(new Error("load_stalled")); }
      }, 3000);
      p.then(() => { clearInterval(t); resolve(); }, (e) => { clearInterval(t); reject(e); });
    });
  }

  /** Is each reference word really in the recording?  refWords must be the same words (same order) the grid uses.
   *  The recording is processed silently in the background WHILE the student recites (so only the last few seconds are left at Stop); if that background result is missing or stalls, one full pass on a fresh worker. Every step has a timeout and the whole
   *  thing is retried once on a fresh worker, so it can fail with a clear error but can never hang. */
  async check(blob: Blob, refWords: string[], opts: { basmalah?: boolean | "auto" } = {}): Promise<CtcCheckResult> {
    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string) =>
      new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(label + "_timeout")), ms);
        p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
      });
    const retryable = /(worker_(stalled|crashed|messageerror|gone)|load_stalled|decode_timeout)/;
    let lastErr: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const id = this.nextId++;
      this.activeCheckId = id;
      this.setProgress({ stage: "decoding", done: 0, total: 0 });
      try {
        await this.loadWatched();
        const td = Date.now();
        const audio = await withTimeout(decodeBlobTo16k(blob), 60_000, "decode");
        const decodeMs = Date.now() - td;
        this.setProgress({ stage: "finishing", done: 0, total: 0 });
        const res = await this.callWatched<CtcCheckResult>(
          { type: "check", audio, words: refWords, basmalah: opts.basmalah ?? "auto", useLive: attempt === 0 }, [audio.buffer], id);
        if (res.timing) res.timing.decodeMs = decodeMs;
        return res;
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message ?? e);
        if (attempt === 0 && retryable.test(msg)) {
          console.warn("[ctc] check stalled — retrying once on a fresh worker:", msg);
          if (!/load_stalled/.test(msg)) this.resetWorker("retry");
          continue;
        }
        throw e;
      } finally {
        this.activeCheckId = 0;
        this.setProgress(null);
      }
    }
    throw lastErr ?? new Error("check_failed");
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

// Android freezes the page while the app is in the background. When the student comes back, give any running
// check a fresh 90 s instead of treating the time spent away as a stall.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") (ctcEngine as any).lastSignal = Date.now();
  });
}
