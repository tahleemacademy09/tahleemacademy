/*
  ctcNative.ts — the Quran CTC model on the phone's own CPU (Android app), plus the live word-by-word checker.

  The WASM engine (ctcWorker.ts) runs at ~0.3x real time on a phone, so it can never keep up with someone who is
  still reciting. This file does the same job through the native "CtcInference" plugin (ONNX Runtime Mobile,
  CtcInferencePlugin.kt). Only the model call moves; log-mel, tokenising, alignment and grading are the SAME
  functions from ctcAlign.ts, so verdicts match the WASM engine.

  Contents
    nativeCtcAvailable / loadNativeCtc / nativeRunLogProbs   plugin bridge
    nativeCheck                                              whole-recording grading (same output as the worker's check)
    NativeLiveChecker                                        streams mic audio, reveals words, reports MISTAKES while reciting
    buzz                                                     vibrate on a mistake (never throws)
*/
import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  SR, SpEncoder, alignWords, alignWordsPartial, chunkAtQuiet, greedySpan, greedyText, logMel, modelForm, scorePrefix, stripMarks,
  type CtcWordScore, type SpVocab,
} from "./ctcAlign";
import { LiveMistakeTracker, type MistakeTrackerOptions } from "./liveMistake";
import type { CtcCheckResult } from "./ctcEngine";

/* ───────────────────────── plugin bridge ───────────────────────── */

interface CtcInferencePlugin {
  load(o: { path: string; threads?: number }): Promise<{ threads: number; inputs: string[] }>;
  run(o: { mel: string; frames: number }): Promise<{ lp: string; T: number; V: number; ms: number }>;
  unload(): Promise<void>;
  vibrate(o: { pattern: number[] }): Promise<void>;
}
const Plugin = registerPlugin<CtcInferencePlugin>("CtcInference");

export function nativeCtcAvailable(): boolean {
  try { return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("CtcInference"); } catch { return false; }
}

let nativeThreads = 0;
export const nativeCtcThreads = () => nativeThreads;

export async function loadNativeCtc(path: string): Promise<void> {
  const r = await Plugin.load({ path });
  nativeThreads = r.threads;
}

function f32ToB64(a: Float32Array): string {
  const u8 = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
}
function b64ToF32(b: string): Float32Array {
  const s = atob(b);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return new Float32Array(u8.buffer, 0, Math.floor(u8.length / 4));
}

/** audio (16 kHz mono) → CTC log-probs [T, V] through the native model */
export async function nativeRunLogProbs(audio: Float32Array): Promise<{ lp: Float32Array; T: number; V: number; ms: number }> {
  const { data, frames } = logMel(audio);
  const r = await Plugin.run({ mel: f32ToB64(data), frames });
  const lp = b64ToF32(r.lp);
  const { T, V } = r;
  if (lp.length !== T * V) throw new Error(`native output size mismatch: ${lp.length} vs ${T}x${V}`);
  // make sure these are log-probs (a row sums to ~1 in probability space) — same safeguard as the worker
  let s = 0;
  for (let v = 0; v < V; v++) s += Math.exp(lp[v]);
  if (Math.abs(s - 1) > 0.05) {
    for (let row = 0; row < T; row++) {
      let mx = -Infinity;
      for (let v = 0; v < V; v++) mx = Math.max(mx, lp[row * V + v]);
      let z = 0;
      for (let v = 0; v < V; v++) z += Math.exp(lp[row * V + v] - mx);
      const lz = Math.log(z) + mx;
      for (let v = 0; v < V; v++) lp[row * V + v] -= lz;
    }
  }
  return { lp, T, V, ms: r.ms };
}

/* ───────────────────────── vocabulary (main thread copy) ───────────────────────── */

let vocabP: Promise<{ vocab: SpVocab; enc: SpEncoder }> | null = null;
export function prepareVocab(): Promise<{ vocab: SpVocab; enc: SpEncoder }> {
  if (!vocabP) {
    vocabP = (async () => {
      const r = await fetch(new URL("/ctc/vocab.json", window.location.origin).href);
      if (!r.ok) throw new Error("vocab_missing");
      const vocab = (await r.json()) as SpVocab;
      return { vocab, enc: new SpEncoder(vocab) };
    })();
    vocabP.catch(() => { vocabP = null; });
  }
  return vocabP;
}

const BASMALAH = ["بِسْمِ", "ٱللَّهِ", "ٱلرَّحْمَٰنِ", "ٱلرَّحِيمِ"];
const BAS_HEARD = "بسماللهالرحمنالرحيم";

/* ───────────────────────── whole-recording check (same result as ctcWorker.check) ───────────────────────── */

export async function nativeCheck(
  audio: Float32Array, refWordsIn: string[], basmalah: boolean | "auto",
  onProgress?: (doneSecs: number, totalSecs: number) => void,
): Promise<CtcCheckResult> {
  const { vocab, enc } = await prepareVocab();
  const t0 = Date.now();
  const secs = audio.length / SR;
  const todo = chunkAtQuiet(audio).filter((c) => c.length >= SR * 0.3);
  const totalSecs = todo.reduce((a, c) => a + c.length, 0) / SR;
  onProgress?.(0, totalSecs);
  const ti = Date.now();
  const parts: { lp: Float32Array; T: number; V: number }[] = [];
  let doneSecs = 0;
  for (const c of todo) {
    parts.push(await nativeRunLogProbs(c));
    doneSecs += c.length / SR;
    onProgress?.(doneSecs, totalSecs);
  }
  const inferMs = Date.now() - ti;
  if (!parts.length) throw new Error("audio_too_short");
  let V = 0, T = 0;
  for (const r of parts) { V = r.V; T += r.T; }
  if (V !== vocab.pieces.length + 1) throw new Error(`vocab mismatch: model ${V} vs vocab ${vocab.pieces.length + 1}`);
  const lp = new Float32Array(T * V);
  let o = 0;
  for (const p of parts) { lp.set(p.lp, o); o += p.lp.length; }
  const frameDur = secs / T;
  const ta = Date.now();
  const greedy = greedyText(lp, T, V, vocab);
  let useBasmalah = basmalah === true;
  if (basmalah === "auto") {
    const heard = stripMarks(greedy).replace(/\s+/g, "");
    useBasmalah = stripMarks(refWordsIn[0] || "") !== "بسم" && heard.startsWith(BAS_HEARD);
  }
  const refWords = useBasmalah ? [...BASMALAH, ...refWordsIn] : refWordsIn;
  let scored = alignWords(lp, T, V, refWords, enc, vocab, frameDur);
  let partial = false, covered = refWords.length;
  if (!scored) {
    const p = alignWordsPartial(lp, T, V, refWords, enc, vocab, frameDur);
    if (!p) throw new Error("audio_too_short_for_text");
    scored = p.scores; partial = true; covered = Math.max(0, p.covered - (useBasmalah ? BASMALAH.length : 0));
  }
  const heardAll = scored.map((w) => (w.start == null || w.end == null ? "" : greedySpan(lp, T, V, vocab, Math.round(w.start / frameDur), Math.round(w.end / frameDur))));
  const words: CtcWordScore[] = useBasmalah ? scored.slice(BASMALAH.length) : scored;
  const heard = useBasmalah ? heardAll.slice(BASMALAH.length) : heardAll;
  const alignMs = Date.now() - ta;
  return {
    words, heard, greedy, secs, frames: T, ms: Date.now() - t0, basmalah: useBasmalah, partial, covered,
    timing: { usedLive: false, liveChunks: 0, liveWaitMs: 0, tailSecs: totalSecs, inferMs, alignMs, wasmThreads: nativeThreads, liveNote: "native engine" },
  };
}

/* ───────────────────────── live checker ───────────────────────── */

export interface NativeLiveCallbacks {
  /** number of page words fully heard so far (grows as the student recites) */
  onProgress?: (shown: number, ms: number) => void;
  /** absolute page-word indices just confirmed as skipped / wrongly said. The student simply carries on; nothing is rewound or cut. */
  onMistake?: (wordIndexes: number[]) => void;
  /** the native model failed repeatedly; live checking has stopped (recording itself is unaffected) */
  onFatal?: (reason: string) => void;
}

/**
 * Streams 16 kHz mono mic samples in; about every 0.4 s runs the model on the audio since a few words ago and asks
 * "how many of the next page words have been said, and did any earlier word get skipped or said wrongly?"
 * The window start keeps moving forward, so the cost of a step does not grow while the student recites.
 * A mistake only reports (onMistake); the student keeps reciting from where they are and the recording is untouched.
 */
export class NativeLiveChecker {
  private words: string[];
  private cb: NativeLiveCallbacks;
  private tracker: LiveMistakeTracker;
  private tok: (number[] | undefined)[] = [];
  private pageHasBas: boolean;
  private buf = new Float32Array(SR * 60);
  private bufBase = 0; private len = 0; private total = 0; private lastRunEnd = 0;
  private winStart = 0; private commit = 0; private shown = 0;
  private busy = false; private stopped = false; private ready = false; private errors = 0;
  private queue: Float32Array[] = [];
  private vocab: SpVocab | null = null;
  private enc: SpEncoder | null = null;

  constructor(words: string[], cb: NativeLiveCallbacks = {}, tracker?: MistakeTrackerOptions) {
    this.words = words; this.cb = cb;
    this.tracker = new LiveMistakeTracker(tracker);
    this.pageHasBas = stripMarks(words[0] || "") === "بسم";
  }

  async start(): Promise<void> {
    const { vocab, enc } = await prepareVocab();
    if (this.stopped) return;
    this.vocab = vocab; this.enc = enc; this.ready = true;
    for (const q of this.queue) this.append(q);
    this.queue = [];
    void this.pump();
  }

  /** 16 kHz mono samples from the microphone. Safe to call before start() has finished. */
  feed(x: Float32Array) {
    if (this.stopped) return;
    if (!this.ready) { if (this.queue.length < 4000) this.queue.push(x); return; }
    this.append(x);
    void this.pump();
  }

  stop() { this.stopped = true; this.queue = []; }
  get flagged(): number[] { return this.tracker.flaggedWords; }

  private append(x: Float32Array) {
    if (this.len + x.length > this.buf.length) {
      const nb = new Float32Array(Math.max(this.buf.length * 2, this.len + x.length));
      nb.set(this.buf.subarray(0, this.len));
      this.buf = nb;
    }
    this.buf.set(x, this.len);
    this.len += x.length; this.total += x.length;
  }

  private wordTokens(i: number): number[] {
    let t = this.tok[i];
    if (!t) {
      const w = this.words[i] ?? "";
      t = this.enc!.encode(this.vocab!.hasDiacritics ? modelForm(w, true, this.vocab!.shaddaFirst) : stripMarks(w));
      this.tok[i] = t;
    }
    return t;
  }

  private async pump() {
    if (this.busy || this.stopped || !this.ready) return;
    this.busy = true;
    try {
      while (!this.stopped && this.total - this.lastRunEnd >= SR * 0.4) {
        await this.step();
        this.errors = 0;
      }
    } catch (e: any) {
      // a failed live step must never break recording — the final check on Stop is what counts
      console.warn("[ctc-live] step failed:", e?.message ?? e);
      if (++this.errors >= 5) { this.stopped = true; this.cb.onFatal?.(String(e?.message ?? e)); }
    } finally { this.busy = false; }
  }

  private async step() {
    const vocab = this.vocab!, enc = this.enc!;
    const t0 = Date.now();
    const end = this.total;
    this.lastRunEnd = end;
    // stuck for a long time (silence, or reciting something unlike the page): jump forward instead of growing the window
    if (end - this.winStart > 20 * SR) { this.commit = Math.max(this.commit, this.shown); this.winStart = end - 6 * SR; }
    const w0 = Math.max(this.winStart, this.bufBase);
    const audio = this.buf.slice(w0 - this.bufBase, end - this.bufBase);
    if (audio.length < SR * 0.6) return;
    const { lp, T, V } = await nativeRunLogProbs(audio);
    if (this.stopped) return;
    if (V !== vocab.pieces.length + 1) throw new Error(`vocab mismatch: model ${V} vs vocab ${vocab.pieces.length + 1}`);
    const secs = audio.length / SR, frameDur = secs / T;

    // the Basmalah recited before a page that does not start with it: align it too, then ignore it
    let bas = false;
    if (this.commit === 0 && !this.pageHasBas) {
      bas = stripMarks(greedyText(lp, T, V, vocab)).replace(/\s+/g, "").startsWith(BAS_HEARD);
    }
    const k = Math.max(8, Math.min(40, Math.ceil(secs * 3) + 6));
    const wt: number[][] = [];
    if (bas) for (const b of BASMALAH) wt.push(enc.encode(vocab.hasDiacritics ? modelForm(b, true, vocab.shaddaFirst) : stripMarks(b)));
    const first = this.commit, last = Math.min(this.words.length, this.commit + k);
    for (let i = first; i < last; i++) wt.push(this.wordTokens(i));
    if (last <= first) return;
    const r = scorePrefix(lp, T, V, wt, vocab.blank, frameDur);
    if (!r) return;
    const skip = bas ? BASMALAH.length : 0;

    // words heard so far
    const rel = r.lastGood + 1 - skip;
    if (rel > 0 && this.commit + rel > this.shown) {
      this.shown = Math.min(this.words.length, this.commit + rel);
      this.cb.onProgress?.(this.shown, Date.now() - t0);
    }
    // skipped / wrongly said words: bad score, followed by a word that WAS heard
    const flagged = this.tracker.update(this.commit, r.scores.slice(skip), r.lastGood - skip);
    if (flagged.length) this.cb.onMistake?.(flagged);

    // settle words that are 3+ behind the newest one, and move the window to where the first unsettled word starts
    const settled = this.shown - 3;
    if (this.shown > 0 && settled > this.commit) {
      const j = skip + (settled - this.commit);
      const st = r.scores[j]?.start;
      if (st !== null && st !== undefined) {
        this.winStart = w0 + Math.max(0, Math.floor((st - 0.5) * SR));
        this.commit = settled;
        const drop = this.winStart - this.bufBase - SR * 2;   // keep 2 s of slack, forget the rest
        if (drop > SR * 5) { this.buf.copyWithin(0, drop, this.len); this.len -= drop; this.bufBase += drop; }
      }
    }
  }
}

/* ───────────────────────── mistake buzz ───────────────────────── */

/**
 * Buzz the phone. pattern = [off, on, off, on …] in ms. Tries, in order: the native plugin (ALARM usage — not muted
 * while the mic is recording), Capacitor Haptics, then navigator.vibrate. Never throws.
 */
export async function buzz(pattern: number[]): Promise<void> {
  try { if (nativeCtcAvailable()) { await Plugin.vibrate({ pattern }); return; } } catch { /* try the next one */ }
  try {
    const { Haptics } = await import("@capacitor/haptics");
    await Haptics.vibrate({ duration: pattern.find((x, i) => i % 2 === 1) ?? 120 });
    return;
  } catch { /* try the next one */ }
  try { navigator.vibrate?.(pattern.slice(pattern[0] === 0 ? 1 : 0)); } catch { /* noop */ }
}
