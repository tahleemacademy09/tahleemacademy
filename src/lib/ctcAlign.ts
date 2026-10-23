/*
  ctcAlign.ts — pure functions (no DOM, no worker) for the CTC "was each word really said?" check.
  Port of ctc_align_test.py:
    reference words → model spelling → SentencePiece tokens
    audio → 80-bin log-mel (NeMo style)
    model log-probs + tokens → CTC Viterbi forced alignment → per-word score
  A word that was never said gets a LOW score even though forced alignment always produces a path.
*/

export const SR = 16000;
const NEG = -1e30;
const WORD_START = "\u2581"; // ▁

/* ───────────────────────── Arabic text ───────────────────────── */

const HARAKAT = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u08D3-\u08FF]/g;

export function stripMarks(s: string): string {
  return s.replace(HARAKAT, "").replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627").replace(/\s+/g, " ").trim();
}

/**
 * Put shadda and the vowel marks in ONE fixed order. Two texts that look identical can store
 * "shadda + fatha" or "fatha + shadda"; the tokenizer treats those as different spellings, so a word
 * with a shadda would score as "not said" for no real reason. shaddaFirst comes from vocab.json
 * (the order the model's own vocabulary uses).
 */
export function canonMarks(s: string, shaddaFirst = true): string {
  return s.replace(/[\u064B-\u0652]{2,}/g, (run) => {
    if (!run.includes("\u0651")) return run;
    const rest = run.replace(/\u0651/g, "");
    return shaddaFirst ? "\u0651" + rest : rest + "\u0651";
  });
}

/** Uthmani text → the spelling the model's vocabulary uses. */
export function modelForm(s: string, dagger = true, shaddaFirst = true): string {
  let t = s.replace(/\u0671/g, "\u0627").replace(/\u06E1/g, "\u0652").replace(/\u0670/g, dagger ? "\u0627" : "");
  t = t.replace(/[\u0653\u0640\u06D6-\u06ED]/g, "");
  return canonMarks(t, shaddaFirst).replace(/\s+/g, " ").trim();
}

/* ───────────────────────── SentencePiece (unigram) encoder ───────────────────────── */

export interface SpVocab {
  pieces: string[];
  scores: number[];
  types: number[]; // 1 normal, 2 unknown, 3 control, 5 unused, 6 byte
  unkId: number;
  blank: number;
  shaddaFirst: boolean;
  hasDiacritics: boolean;
}

export class SpEncoder {
  private map = new Map<string, number>();
  private maxLen = 1;
  private unkScore: number;
  constructor(private v: SpVocab) {
    let min = 0;
    v.pieces.forEach((p, i) => {
      if (v.scores[i] < min) min = v.scores[i];
      if (v.types[i] === 1 || v.types[i] === 4) {
        this.map.set(p, i);
        this.maxLen = Math.max(this.maxLen, Array.from(p).length);
      }
    });
    this.unkScore = min - 10;
  }
  /** One reference word (no spaces) → token ids, like sp.encode(word) in Python (adds the ▁ prefix). */
  encode(word: string): number[] {
    const chars = Array.from(WORD_START + word);
    const n = chars.length;
    const best = new Float64Array(n + 1).fill(-Infinity);
    const prevJ = new Int32Array(n + 1);
    const prevId = new Int32Array(n + 1);
    best[0] = 0;
    for (let i = 1; i <= n; i++) {
      for (let j = Math.max(0, i - this.maxLen); j < i; j++) {
        if (best[j] === -Infinity) continue;
        const id = this.map.get(chars.slice(j, i).join(""));
        if (id === undefined) continue;
        const c = best[j] + this.v.scores[id];
        if (c > best[i]) { best[i] = c; prevJ[i] = j; prevId[i] = id; }
      }
      if (best[i - 1] !== -Infinity) {
        const c = best[i - 1] + this.unkScore;
        if (c > best[i]) { best[i] = c; prevJ[i] = i - 1; prevId[i] = this.v.unkId; }
      }
    }
    const ids: number[] = [];
    for (let i = n; i > 0; i = prevJ[i]) {
      const id = prevId[i];
      if (id === this.v.unkId && ids[0] === this.v.unkId) continue; // merge runs of unknown chars
      ids.unshift(id);
    }
    return ids;
  }
  unkId() { return this.v.unkId; }
}

/* ───────────────────────── audio → log-mel ───────────────────────── */

function hzToMel(f: number): number {
  const fSp = 200 / 3, minLogHz = 1000, minLogMel = minLogHz / fSp, logstep = Math.log(6.4) / 27;
  return f >= minLogHz ? minLogMel + Math.log(Math.max(f, 1e-9) / minLogHz) / logstep : f / fSp;
}
function melToHz(m: number): number {
  const fSp = 200 / 3, minLogHz = 1000, minLogMel = minLogHz / fSp, logstep = Math.log(6.4) / 27;
  return m >= minLogMel ? minLogHz * Math.exp(logstep * (m - minLogMel)) : fSp * m;
}

const N_FFT = 512, WIN = 400, HOP = 160, N_MELS = 80, N_BINS = N_FFT / 2 + 1;
let FB: Float64Array | null = null; // [N_MELS * N_BINS]
let HANN: Float64Array | null = null;

function melFilterbank(): Float64Array {
  const fb = new Float64Array(N_MELS * N_BINS);
  const fmax = SR / 2;
  const fftF = Array.from({ length: N_BINS }, (_, k) => (k * fmax) / (N_BINS - 1));
  const melPts = Array.from({ length: N_MELS + 2 }, (_, i) => hzToMel(0) + ((hzToMel(fmax) - hzToMel(0)) * i) / (N_MELS + 1));
  const hz = melPts.map(melToHz);
  for (let i = 0; i < N_MELS; i++) {
    const lo = hz[i], mid = hz[i + 1], hi = hz[i + 2];
    for (let k = 0; k < N_BINS; k++) {
      const up = (fftF[k] - lo) / Math.max(mid - lo, 1e-9);
      const down = (hi - fftF[k]) / Math.max(hi - mid, 1e-9);
      fb[i * N_BINS + k] = Math.max(0, Math.min(up, down)) * (2 / (hi - lo));
    }
  }
  return fb;
}

const REV = (() => {
  const bits = Math.log2(N_FFT), r = new Uint32Array(N_FFT);
  for (let i = 0; i < N_FFT; i++) { let x = i, y = 0; for (let b = 0; b < bits; b++) { y = (y << 1) | (x & 1); x >>= 1; } r[i] = y; }
  return r;
})();
const COS = Float64Array.from({ length: N_FFT / 2 }, (_, k) => Math.cos((2 * Math.PI * k) / N_FFT));
const SIN = Float64Array.from({ length: N_FFT / 2 }, (_, k) => -Math.sin((2 * Math.PI * k) / N_FFT));

/** In-place radix-2 FFT of size 512. */
export function fft512(re: Float64Array, im: Float64Array): void {
  for (let i = 0; i < N_FFT; i++) {
    const j = REV[i];
    if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let size = 2; size <= N_FFT; size <<= 1) {
    const half = size >> 1, step = N_FFT / size;
    for (let start = 0; start < N_FFT; start += size) {
      for (let k = 0, t = 0; k < half; k++, t += step) {
        const a = start + k, b = a + half;
        const tr = re[b] * COS[t] - im[b] * SIN[t];
        const ti = re[b] * SIN[t] + im[b] * COS[t];
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
}

/** NeMo AudioToMelSpectrogramPreprocessor defaults. Returns row-major [80, T] and T. */
export function logMel(x: Float32Array): { data: Float32Array; frames: number } {
  if (!FB) FB = melFilterbank();
  if (!HANN) {
    HANN = new Float64Array(N_FFT);
    const off = (N_FFT - WIN) / 2;
    for (let n = 0; n < WIN; n++) HANN[off + n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / WIN);
  }
  const len = x.length;
  const pre = new Float64Array(len);
  pre[0] = x[0];
  for (let i = 1; i < len; i++) pre[i] = x[i] - 0.97 * x[i - 1];
  const padLen = len + N_FFT;
  const frames = 1 + Math.floor((padLen - N_FFT) / HOP);
  const mel = new Float64Array(N_MELS * frames);
  const re = new Float64Array(N_FFT), im = new Float64Array(N_FFT), pw = new Float64Array(N_BINS);
  const eps = Math.pow(2, -24);
  for (let t = 0; t < frames; t++) {
    const base = t * HOP - N_FFT / 2; // zero padded by N_FFT/2 each side
    for (let i = 0; i < N_FFT; i++) {
      const idx = base + i;
      re[i] = idx >= 0 && idx < len ? pre[idx] * HANN[i] : 0;
      im[i] = 0;
    }
    fft512(re, im);
    for (let k = 0; k < N_BINS; k++) pw[k] = re[k] * re[k] + im[k] * im[k];
    for (let m = 0; m < N_MELS; m++) {
      let s = 0;
      const o = m * N_BINS;
      for (let k = 0; k < N_BINS; k++) s += pw[k] * FB[o + k];
      mel[m * frames + t] = Math.log(s + eps);
    }
  }
  const out = new Float32Array(N_MELS * frames);
  for (let m = 0; m < N_MELS; m++) {
    let mean = 0;
    for (let t = 0; t < frames; t++) mean += mel[m * frames + t];
    mean /= frames;
    let v = 0;
    for (let t = 0; t < frames; t++) { const d = mel[m * frames + t] - mean; v += d * d; }
    const sd = Math.sqrt(v / frames);
    for (let t = 0; t < frames; t++) out[m * frames + t] = (mel[m * frames + t] - mean) / (sd + 1e-5);
  }
  return { data: out, frames };
}

/** Cut long audio at the quietest moment near every `target` seconds (never mid-word if the reciter breathes). */
export function chunkAtQuiet(audio: Float32Array, target = 30, search = 6): Float32Array[] {
  const secs = audio.length / SR;
  if (secs <= target + search) return [audio];
  const fr = Math.round(SR * 0.05);
  const rms = (a: number) => { let s = 0; const e = Math.min(audio.length, a + fr); for (let i = a; i < e; i++) s += audio[i] * audio[i]; return s / Math.max(1, e - a); };
  const out: Float32Array[] = [];
  let start = 0;
  while (audio.length - start > (target + search) * SR) {
    const lo = start + Math.round((target - search) * SR), hi = start + Math.round((target + search) * SR);
    let bestAt = lo, bestV = Infinity;
    for (let a = lo; a < hi; a += fr) { const v = rms(a); if (v < bestV) { bestV = v; bestAt = a; } }
    out.push(audio.subarray(start, bestAt));
    start = bestAt;
  }
  out.push(audio.subarray(start));
  return out;
}

/* ───────────────────────── CTC forced alignment ───────────────────────── */

/**
 * Viterbi over the standard CTC lattice. logp is row-major [T, V].
 * Returns the lattice state per frame (odd state 2i+1 = token i, even = blank) or null if audio is too short.
 */
export function ctcForcedAlign(logp: Float32Array, T: number, V: number, tokens: number[], blank: number): Int32Array | null {
  const L = tokens.length;
  if (L === 0) return null;
  const S = 2 * L + 1;
  const ext = new Int32Array(S).fill(blank);
  for (let i = 0; i < L; i++) ext[2 * i + 1] = tokens[i];
  let repeats = 0;
  for (let i = 1; i < L; i++) if (tokens[i] === tokens[i - 1]) repeats++;
  if (T < L + repeats) return null;
  const allow2 = new Uint8Array(S);
  for (let s = 2; s < S; s++) allow2[s] = ext[s] !== blank && ext[s] !== ext[s - 2] ? 1 : 0;

  let prev = new Float64Array(S).fill(NEG);
  let cur = new Float64Array(S).fill(NEG);
  const bp = new Uint8Array(T * S);
  prev[0] = logp[blank];
  if (S > 1) prev[1] = logp[ext[1]];
  for (let t = 1; t < T; t++) {
    const row = t * V;
    for (let s = 0; s < S; s++) {
      let best = prev[s], arg = 0;
      if (s >= 1 && prev[s - 1] > best) { best = prev[s - 1]; arg = 1; }
      if (s >= 2 && allow2[s] && prev[s - 2] > best) { best = prev[s - 2]; arg = 2; }
      cur[s] = best + logp[row + ext[s]];
      bp[t * S + s] = arg;
    }
    const tmp = prev; prev = cur; cur = tmp;
  }
  let s = S === 1 || prev[S - 1] >= prev[S - 2] ? S - 1 : S - 2;
  const path = new Int32Array(T);
  for (let t = T - 1; t >= 0; t--) { path[t] = s; s -= bp[t * S + s]; }
  return path;
}

export interface CtcWordScore {
  /** mean over the word's tokens of the best log-prob the model gave that token (0 = certain, very negative = not heard) */
  mean: number | null;
  /** the worst token of the word */
  min: number | null;
  start: number | null;
  end: number | null;
  /** matched better when spelled without the dagger alef */
  alt?: boolean;
}

export function scoreWords(logp: Float32Array, V: number, path: Int32Array, wordTokens: number[][], frameDur: number): CtcWordScore[] {
  const nTok = wordTokens.reduce((a, w) => a + w.length, 0);
  const best = new Float64Array(nTok).fill(-Infinity);
  const first = new Int32Array(nTok).fill(-1), last = new Int32Array(nTok).fill(-1);
  const flat = wordTokens.flat();
  for (let t = 0; t < path.length; t++) {
    const s = path[t];
    if (s % 2 === 1) {
      const i = (s - 1) / 2;
      const lp = logp[t * V + flat[i]];
      if (lp > best[i]) best[i] = lp;
      if (first[i] < 0) first[i] = t;
      last[i] = t;
    }
  }
  const out: CtcWordScore[] = [];
  let k = 0;
  for (const toks of wordTokens) {
    if (!toks.length) { out.push({ mean: null, min: null, start: null, end: null }); continue; }
    let sum = 0, mn = Infinity, f = Infinity, l = -1;
    for (let j = 0; j < toks.length; j++, k++) {
      const sc = best[k] === -Infinity ? -20 : best[k];
      sum += sc; mn = Math.min(mn, sc);
      if (first[k] >= 0) { f = Math.min(f, first[k]); l = Math.max(l, last[k]); }
    }
    out.push({ mean: sum / toks.length, min: mn, start: l >= 0 ? f * frameDur : null, end: l >= 0 ? (l + 1) * frameDur : null });
  }
  return out;
}

export type CtcStatus = "ok" | "unsure" | "bad" | "na";
export function ctcStatus(mean: number | null, ok = -1, bad = -3): CtcStatus {
  if (mean === null || Number.isNaN(mean)) return "na";
  return mean >= ok ? "ok" : mean >= bad ? "unsure" : "bad";
}

/**
 * Score every reference word. Words with a dagger alef (الرحمن …) are also tried without the alef
 * (one extra pass with all of them dropped) and the better spelling is kept per word.
 */
export function alignWords(
  logp: Float32Array, T: number, V: number, words: string[], enc: SpEncoder, vocab: SpVocab, frameDur: number,
): CtcWordScore[] | null {
  const keep = vocab.hasDiacritics;
  const tokenise = (dropDagger: boolean) => words.map((w) =>
    enc.encode(keep ? modelForm(w, !(dropDagger && w.includes("\u0670")), vocab.shaddaFirst) : stripMarks(w)));
  const run = (wt: number[][]) => {
    const flat = wt.flat();
    const path = ctcForcedAlign(logp, T, V, flat, vocab.blank);
    return path ? scoreWords(logp, V, path, wt, frameDur) : null;
  };
  const base = run(tokenise(false));
  if (!base) return null;
  if (keep && words.some((w) => w.includes("\u0670"))) {
    const alt = run(tokenise(true));
    if (alt) words.forEach((w, i) => {
      if (w.includes("\u0670") && alt[i].mean !== null && base[i].mean !== null && alt[i].mean! > base[i].mean!) base[i] = { ...alt[i], alt: true };
    });
  }
  return base;
}

/** What the model hears with NO reference (greedy CTC). */
export function greedyText(logp: Float32Array, T: number, V: number, vocab: SpVocab): string {
  let prev = -1, out = "";
  for (let t = 0; t < T; t++) {
    let bi = 0, bv = -Infinity;
    for (let v = 0; v < V; v++) { const x = logp[t * V + v]; if (x > bv) { bv = x; bi = v; } }
    if (bi !== prev && bi !== vocab.blank) out += vocab.pieces[bi] ?? "";
    prev = bi;
  }
  return out.split(WORD_START).join(" ").replace(/\s+/g, " ").trim();
}
