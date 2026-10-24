/// <reference lib="webworker" />
/*
  ctcWorker.ts — hosts the FastConformer-Quran CTC model (onnxruntime-web, WASM) and runs the whole
  "was each word said?" check off the main thread:  audio → log-mel → model → forced alignment → scores.
  Messages in : {type:"load", vocabUrl, modelUrl, ortBase}
                {type:"check", id, audio, words, basmalah}
                {type:"selftest", id, testsUrl}
                {type:"live_start", words} · {type:"live_audio", samples} · {type:"live_stop"}   (live reveal while reciting)
  Messages out: {type:"progress"|"ready"|"load_error"|"result"|"selftest_result"|"live_progress"}
*/
import {
  alignWords, alignWordsPartial, chunkAtQuiet, greedySpan, greedyText, quietCutPoint, logMel, modelForm, scorePrefix, SpEncoder, SR, stripMarks,
  type CtcWordScore, type SpVocab,
} from "./ctcAlign";

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let ort: any = null;
let session: any = null;
let vocab: SpVocab | null = null;
let enc: SpEncoder | null = null;
let inNames: string[] = [];
let runLock: Promise<unknown> = Promise.resolve();
const exclusive = <T,>(fn: () => Promise<T>): Promise<T> => { const p = runLock.then(fn, fn); runLock = p.catch(() => {}); return p; };

const BASMALAH = ["بِسْمِ", "ٱللَّهِ", "ٱلرَّحْمَٰنِ", "ٱلرَّحِيمِ"];

async function fetchModel(url: string): Promise<Uint8Array> {
  const cacheName = "ctc-model-v1";
  // Ask the browser not to evict the saved model when the phone runs low on space (Chrome decides; harmless if refused).
  try { void (ctx.navigator as any).storage?.persist?.(); } catch { /* noop */ }
  let cache: Cache | null = null;
  try {
    cache = await caches.open(cacheName);
    const hit = await cache.match(url);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  } catch { /* no Cache API — just download */ }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`model download failed (${res.status})`);
  const total = Number(res.headers.get("content-length") || 0);
  // Save to the cache straight from the network stream (no extra 126 MB copy in JS memory — phones ran out of memory
  // before the old version finished saving, so the model was downloaded again every visit).
  let saved: Promise<unknown> = Promise.resolve();
  let body = res.body;
  if (cache) {
    const [toCache, toUs] = res.body.tee();
    body = toUs;
    saved = cache.put(url, new Response(toCache, { headers: { "content-type": "application/octet-stream", ...(total ? { "content-length": String(total) } : {}) } })).catch(() => { /* quota — fine */ });
  }
  const reader = body.getReader();
  let all = total ? new Uint8Array(total) : new Uint8Array(140 * 1024 * 1024);
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (loaded + value.length > all.length) { const g = new Uint8Array(Math.max(all.length * 2, loaded + value.length)); g.set(all.subarray(0, loaded)); all = g; }
    all.set(value, loaded); loaded += value.length;
    ctx.postMessage({ type: "progress", loaded, total: total || loaded });
  }
  await saved;
  return loaded === all.length ? all : all.subarray(0, loaded);
}

async function load(m: { vocabUrl: string; modelUrl: string; ortBase: string }) {
  const vr = await fetch(m.vocabUrl);
  if (!vr.ok) throw new Error("vocab_missing: run scripts/export_ctc_vocab.py and commit public/ctc/vocab.json");
  vocab = (await vr.json()) as SpVocab;
  enc = new SpEncoder(vocab);
  let lastErr: unknown = null;
  for (const file of ["ort.wasm.min.mjs", "ort.min.mjs"]) {
    try { ort = await import(/* @vite-ignore */ `${m.ortBase}/${file}`); break; } catch (e) { lastErr = e; }
  }
  if (!ort) throw new Error("onnxruntime-web failed to load: " + String((lastErr as any)?.message ?? lastErr));
  ort.env.wasm.wasmPaths = m.ortBase + "/";
  ort.env.wasm.numThreads = ctx.crossOriginIsolated ? Math.min(4, ctx.navigator.hardwareConcurrency || 2) : 1;
  const bytes = await fetchModel(m.modelUrl);
  session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] });
  inNames = session.inputNames;
  ctx.postMessage({ type: "ready" });
}

/** One audio chunk → log-probs [T,V] */
async function runChunk(audio: Float32Array): Promise<{ lp: Float32Array; T: number; V: number }> {
  const { data, frames } = logMel(audio);
  const feeds: Record<string, any> = {
    [inNames[0]]: new ort.Tensor("float32", data, [1, 80, frames]),
    [inNames[1]]: new ort.Tensor("int64", BigInt64Array.from([BigInt(frames)]), [1]),
  };
  const outs = await exclusive(() => session.run(feeds));
  let t: any = null;
  for (const k of Object.keys(outs)) {
    const o = outs[k];
    if (o.dims.length === 3 && o.dims[2] > 100 && o.dims[1] !== 512) { t = o; break; }
  }
  if (!t) throw new Error("log-prob output not found: " + Object.keys(outs).map((k) => outs[k].dims.join("x")).join(","));
  const T = t.dims[1], V = t.dims[2];
  let lp = new Float32Array(t.data as ArrayLike<number>);
  // make sure these are log-probs (a row sums to ~1 in probability space)
  let s = 0;
  for (let v = 0; v < V; v++) s += Math.exp(lp[v]);
  if (Math.abs(s - 1) > 0.05) {
    for (let r = 0; r < T; r++) {
      let mx = -Infinity;
      for (let v = 0; v < V; v++) mx = Math.max(mx, lp[r * V + v]);
      let z = 0;
      for (let v = 0; v < V; v++) z += Math.exp(lp[r * V + v] - mx);
      const lz = Math.log(z) + mx;
      for (let v = 0; v < V; v++) lp[r * V + v] -= lz;
    }
  }
  return { lp, T, V };
}

async function check(m: { id: number; audio: Float32Array; words: string[]; basmalah: boolean | "auto"; useLive?: boolean }) {
  if (!session || !vocab || !enc) throw new Error("not_loaded");
  const t0 = Date.now();
  const parts: { lp: Float32Array; T: number; V: number }[] = [];
  let V = 0, T = 0;
  let secs = m.audio.length / SR;
  // The recording was already run through the model WHILE the student recited (see "background inference" below):
  // only the last few seconds are left to process. Used only if it covers the whole recording; otherwise the
  // normal path below processes the finished recording as before.
  const P = pipeDone; pipeDone = null;
  if (P && m.useLive) {
    try { await P.run; } catch { /* handled by P.failed */ }
    if (!P.failed && P.parts.length && Math.abs(P.total / SR - secs) <= 2.5) {
      for (const p of P.parts) parts.push(p);
      for (const c of chunkAtQuiet(P.pend.subarray(0, P.len))) {
        if (c.length < SR * 0.3) continue;
        parts.push(await runChunk(c));
      }
      secs = P.total / SR;
    }
  }
  if (!parts.length) {
    for (const c of chunkAtQuiet(m.audio)) {
      if (c.length < SR * 0.3) continue;
      parts.push(await runChunk(c));
    }
  }
  if (!parts.length) throw new Error("audio_too_short");
  for (const r of parts) { V = r.V; T += r.T; }
  if (V !== vocab.pieces.length + 1) throw new Error(`vocab mismatch: model ${V} vs vocab ${vocab.pieces.length + 1}`);
  const lp = new Float32Array(T * V);
  let o = 0;
  for (const p of parts) { lp.set(p.lp, o); o += p.lp.length; }
  const frameDur = secs / T;
  const greedy = greedyText(lp, T, V, vocab);
  // "auto": the student recited the Basmalah first but the page text does not start with it → align it too, then drop it.
  let useBasmalah = m.basmalah === true;
  if (m.basmalah === "auto") {
    const heard = stripMarks(greedy).replace(/\s+/g, "");
    useBasmalah = stripMarks(m.words[0] || "") !== "بسم" && heard.startsWith("بسماللهالرحمنالرحيم");
  }
  const refWords = useBasmalah ? [...BASMALAH, ...m.words] : m.words;
  let scored = alignWords(lp, T, V, refWords, enc, vocab, frameDur);
  // The audio is too short to hold the WHOLE text (student recited only the first part of the assignment):
  // grade what was recited; every word after it is reported as "not heard" instead of failing the whole check.
  let partial = false, covered = refWords.length;
  if (!scored) {
    const p = alignWordsPartial(lp, T, V, refWords, enc, vocab, frameDur);
    if (!p) throw new Error("audio_too_short_for_text");
    scored = p.scores; partial = true; covered = Math.max(0, p.covered - (useBasmalah ? BASMALAH.length : 0));
  }
  // What the model heard for each page word: the greedy text inside that word's own aligned time span.
  const heardAll = scored.map((w) => (w.start == null || w.end == null ? "" : greedySpan(lp, T, V, vocab!, Math.round(w.start / frameDur), Math.round(w.end / frameDur))));
  const words: CtcWordScore[] = useBasmalah ? scored.slice(BASMALAH.length) : scored;
  const heard = useBasmalah ? heardAll.slice(BASMALAH.length) : heardAll;
  ctx.postMessage({ type: "result", id: m.id, words, heard, greedy, secs, frames: T, ms: Date.now() - t0, basmalah: useBasmalah, partial, covered });
}

async function selftest(m: { id: number; testsUrl: string }) {
  if (!enc) throw new Error("not_loaded");
  const tests = (await (await fetch(m.testsUrl)).json()) as [string, number[]][];
  const bad: { word: string; want: number[]; got: number[] }[] = [];
  for (const [w, want] of tests) {
    const got = enc.encode(w);
    if (got.length !== want.length || got.some((x, i) => x !== want[i])) bad.push({ word: w, want, got });
  }
  ctx.postMessage({ type: "selftest_result", id: m.id, total: tests.length, bad: bad.slice(0, 20), badCount: bad.length });
}

/* ───────────────────────── background inference while recording ─────────────────────────
   The model is slow on a phone (~0.3x real time, one thread), so waiting for it after Stop takes minutes for a long
   recording. While the student recites, the audio that streams in for the live reveal is ALSO cut at quiet moments
   (every ~16-24 s) and run through the model in the gaps; the finished chunks' log-probs are kept. At Stop only
   the last few seconds are left. Same cutting rule as chunkAtQuiet, so grading is unchanged. */
interface Pipe {
  pend: Float32Array; len: number; total: number;
  parts: { lp: Float32Array; T: number; V: number }[];
  failed: boolean; open: boolean; run: Promise<void> | null;
}
let pipe: Pipe | null = null;        // being filled while the student recites
let pipeDone: Pipe | null = null;    // closed at Stop, waiting for the final check
const PIPE_TARGET = 20, PIPE_SEARCH = 4;

function pipeBegin() {
  pipe = { pend: new Float32Array(SR * 40), len: 0, total: 0, parts: [], failed: false, open: true, run: null };
  pipeDone = null;
}
function pipeAppend(samples: Float32Array) {
  const P = pipe;
  if (!P || P.failed) return;
  if (P.len + samples.length > P.pend.length) {
    const nb = new Float32Array(Math.max(P.pend.length * 2, P.len + samples.length));
    nb.set(P.pend.subarray(0, P.len));
    P.pend = nb;
  }
  P.pend.set(samples, P.len);
  P.len += samples.length; P.total += samples.length;
  if (!P.run && P.len >= (PIPE_TARGET + PIPE_SEARCH) * SR) P.run = pipeLoop(P).finally(() => { P.run = null; });
}
async function pipeLoop(P: Pipe) {
  try {
    while (P.open && !P.failed && P.len >= (PIPE_TARGET + PIPE_SEARCH) * SR) {
      const cut = quietCutPoint(P.pend, P.len, PIPE_TARGET, PIPE_SEARCH);
      const r = await runChunk(P.pend.slice(0, cut));
      P.parts.push(r);
      P.pend.copyWithin(0, cut, P.len); P.len -= cut;
    }
  } catch { P.failed = true; }
}

/* ───────────────────────── LIVE reveal ─────────────────────────
   While the student recites, the page streams mic audio (16 kHz mono) here. About every half second the worker takes
   the audio since a few words ago, runs the model, and asks "how many of the NEXT page words have been said so far?"
   (open-ended CTC alignment). Words are only reported once fully said, and the window start keeps moving forward so
   the cost of a step does not grow while the student recites. The real grading still happens once, on Stop. */
interface LiveState {
  words: string[];
  tok: (number[] | undefined)[];
  pageHasBas: boolean;
  buf: Float32Array; bufBase: number; len: number;   // audio kept: absolute samples [bufBase, bufBase+len)
  total: number; lastRunEnd: number;
  winStart: number;                                    // absolute sample the next window starts at
  commit: number;                                      // words before this index are settled (never re-scored)
  shown: number;                                       // words revealed so far
  busy: boolean;
}
let live: LiveState | null = null;
const BAS_HEARD = "بسماللهالرحمنالرحيم";

function wordTokens(L: LiveState, i: number): number[] {
  let t = L.tok[i];
  if (!t) {
    const w = L.words[i] ?? "";
    t = enc!.encode(vocab!.hasDiacritics ? modelForm(w, true, vocab!.shaddaFirst) : stripMarks(w));
    L.tok[i] = t;
  }
  return t;
}

function liveBegin(m: { words: string[] }) {
  if (!session || !vocab || !enc) return;
  pipeBegin();
  live = {
    words: m.words, tok: [], pageHasBas: stripMarks(m.words[0] || "") === "بسم",
    buf: new Float32Array(SR * 60), bufBase: 0, len: 0, total: 0, lastRunEnd: 0,
    winStart: 0, commit: 0, shown: 0, busy: false,
  };
}

function liveAppend(samples: Float32Array) {
  pipeAppend(samples);
  const L = live;
  if (!L) return;
  if (L.len + samples.length > L.buf.length) {
    const nb = new Float32Array(Math.max(L.buf.length * 2, L.len + samples.length));
    nb.set(L.buf.subarray(0, L.len));
    L.buf = nb;
  }
  L.buf.set(samples, L.len);
  L.len += samples.length; L.total += samples.length;
  void liveRun();
}

async function liveRun() {
  const L = live;
  if (!L || L.busy) return;
  L.busy = true;
  try {
    while (live === L && L.total - L.lastRunEnd >= SR * 0.4) await liveStep(L);
  } catch (e: any) {
    // a failed live step must never break recording — the final check on Stop is what counts
    ctx.postMessage({ type: "live_progress", shown: L.shown, error: String(e?.message ?? e) });
  } finally { L.busy = false; }
}

async function liveStep(L: LiveState) {
  const t0 = Date.now();
  const end = L.total;
  L.lastRunEnd = end;
  // stuck for a long time (silence, or reciting something unlike the page): jump forward instead of growing the window
  if (end - L.winStart > 20 * SR) { L.commit = Math.max(L.commit, L.shown); L.winStart = end - 6 * SR; }
  const w0 = Math.max(L.winStart, L.bufBase);
  const audio = L.buf.slice(w0 - L.bufBase, end - L.bufBase);
  if (audio.length < SR * 0.6) return;
  const { lp, T, V } = await runChunk(audio);
  if (live !== L) return;
  if (V !== vocab!.pieces.length + 1) throw new Error(`vocab mismatch: model ${V} vs vocab ${vocab!.pieces.length + 1}`);
  const secs = audio.length / SR, frameDur = secs / T;

  // the Basmalah recited before a page that does not start with it: align it too, then ignore it
  let bas = false;
  if (L.commit === 0 && !L.pageHasBas) {
    const heard = stripMarks(greedyText(lp, T, V, vocab!)).replace(/\s+/g, "");
    bas = heard.startsWith(BAS_HEARD);
  }
  const k = Math.max(8, Math.min(40, Math.ceil(secs * 3) + 6));
  const idx: number[] = [];
  if (bas) for (let i = 0; i < BASMALAH.length; i++) idx.push(1000 + i);   // 1000+ = basmalah slots (see wordTokens)
  for (let i = L.commit; i < Math.min(L.words.length, L.commit + k); i++) idx.push(i);
  if (!idx.length) return;
  const wt = idx.map((i) => (i >= 1000 ? enc!.encode(vocab!.hasDiacritics ? modelForm(BASMALAH[i - 1000], true, vocab!.shaddaFirst) : stripMarks(BASMALAH[i - 1000])) : wordTokens(L, i)));
  const r = scorePrefix(lp, T, V, wt, vocab!.blank, frameDur);
  if (!r) return;
  const skip = bas ? BASMALAH.length : 0;
  const rel = r.lastGood + 1 - skip;
  if (rel > 0 && L.commit + rel > L.shown) {
    L.shown = Math.min(L.words.length, L.commit + rel);
    ctx.postMessage({ type: "live_progress", shown: L.shown, ms: Date.now() - t0, secs });
  }
  // settle words that are 3+ behind the newest one, and move the window to where the first unsettled word starts
  const settled = L.shown - 3;
  if (L.shown > 0 && settled > L.commit) {
    const j = skip + (settled - L.commit);
    const st = r.scores[j]?.start;
    if (st !== null && st !== undefined) {
      L.winStart = w0 + Math.max(0, Math.floor((st - 0.5) * SR));
      L.commit = settled;
      const drop = L.winStart - L.bufBase - SR * 2;     // keep 2 s of slack, forget the rest
      if (drop > SR * 5) { L.buf.copyWithin(0, drop, L.len); L.len -= drop; L.bufBase += drop; }
    }
  }
}

let chain: Promise<void> = Promise.resolve();
ctx.onmessage = (ev: MessageEvent) => {
  const m = ev.data;
  // live messages bypass the queue: audio must be stored the moment it arrives, never wait behind a running step
  if (m.type === "live_audio") { liveAppend(m.samples); return; }
  if (m.type === "live_start") { liveBegin(m); return; }
  if (m.type === "live_stop") { live = null; if (pipe) { pipe.open = false; pipeDone = pipe; pipe = null; } return; }
  chain = chain.then(() => handle(m)).catch(() => {});
};
async function handle(m: any) {
  try {
    if (m.type === "load") await load(m);
    else if (m.type === "check") await check(m);
    else if (m.type === "selftest") await selftest(m);
  } catch (e: any) {
    ctx.postMessage({ type: m.type === "load" ? "load_error" : "result", id: m.id, error: String(e?.message ?? e) });
  }
}
