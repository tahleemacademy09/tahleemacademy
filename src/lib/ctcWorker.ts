/// <reference lib="webworker" />
/*
  ctcWorker.ts — hosts the FastConformer-Quran CTC model (onnxruntime-web, WASM) and runs the whole
  "was each word said?" check off the main thread:  audio → log-mel → model → forced alignment → scores.
  Messages in : {type:"load", vocabUrl, modelUrl, ortBase}
                {type:"check", id, audio, words, basmalah}
                {type:"selftest", id, testsUrl}
  Messages out: {type:"progress"|"ready"|"load_error"|"result"|"selftest_result"}
*/
import {
  alignWords, chunkAtQuiet, greedyText, logMel, SpEncoder, SR, stripMarks,
  type CtcWordScore, type SpVocab,
} from "./ctcAlign";

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let ort: any = null;
let session: any = null;
let vocab: SpVocab | null = null;
let enc: SpEncoder | null = null;
let inNames: string[] = [];

const BASMALAH = ["بِسْمِ", "ٱللَّهِ", "ٱلرَّحْمَٰنِ", "ٱلرَّحِيمِ"];

async function fetchModel(url: string): Promise<Uint8Array> {
  const cacheName = "ctc-model-v1";
  try {
    const c = await caches.open(cacheName);
    const hit = await c.match(url);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  } catch { /* no Cache API — just download */ }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`model download failed (${res.status})`);
  const total = Number(res.headers.get("content-length") || 0);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); loaded += value.length;
    ctx.postMessage({ type: "progress", loaded, total: total || loaded });
  }
  const all = new Uint8Array(loaded);
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  try { const c = await caches.open(cacheName); await c.put(url, new Response(all.slice(0))); } catch { /* quota — fine */ }
  return all;
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
  const outs = await session.run(feeds);
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

async function check(m: { id: number; audio: Float32Array; words: string[]; basmalah: boolean | "auto" }) {
  if (!session || !vocab || !enc) throw new Error("not_loaded");
  const t0 = Date.now();
  const chunks = chunkAtQuiet(m.audio);
  const parts: { lp: Float32Array; T: number }[] = [];
  let V = 0, T = 0;
  for (const c of chunks) {
    if (c.length < SR * 0.3) continue;
    const r = await runChunk(c);
    V = r.V; T += r.T; parts.push(r);
  }
  if (!parts.length) throw new Error("audio_too_short");
  if (V !== vocab.pieces.length + 1) throw new Error(`vocab mismatch: model ${V} vs vocab ${vocab.pieces.length + 1}`);
  const lp = new Float32Array(T * V);
  let o = 0;
  for (const p of parts) { lp.set(p.lp, o); o += p.lp.length; }
  const secs = m.audio.length / SR;
  const frameDur = secs / T;
  const greedy = greedyText(lp, T, V, vocab);
  // "auto": the student recited the Basmalah first but the page text does not start with it → align it too, then drop it.
  let useBasmalah = m.basmalah === true;
  if (m.basmalah === "auto") {
    const heard = stripMarks(greedy).replace(/\s+/g, "");
    useBasmalah = stripMarks(m.words[0] || "") !== "بسم" && heard.startsWith("بسماللهالرحمنالرحيم");
  }
  const refWords = useBasmalah ? [...BASMALAH, ...m.words] : m.words;
  const scored = alignWords(lp, T, V, refWords, enc, vocab, frameDur);
  if (!scored) throw new Error("audio_too_short_for_text");
  const words: CtcWordScore[] = useBasmalah ? scored.slice(BASMALAH.length) : scored;
  ctx.postMessage({ type: "result", id: m.id, words, greedy, secs, frames: T, ms: Date.now() - t0, basmalah: useBasmalah });
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

let chain: Promise<void> = Promise.resolve();
ctx.onmessage = (ev: MessageEvent) => { chain = chain.then(() => handle(ev.data)).catch(() => {}); };
async function handle(m: any) {
  try {
    if (m.type === "load") await load(m);
    else if (m.type === "check") await check(m);
    else if (m.type === "selftest") await selftest(m);
  } catch (e: any) {
    ctx.postMessage({ type: m.type === "load" ? "load_error" : "result", id: m.id, error: String(e?.message ?? e) });
  }
}
