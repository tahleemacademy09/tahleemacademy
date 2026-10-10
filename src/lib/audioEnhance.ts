/*
  audioEnhance.ts
  ────────────────────────────────────────────────────────────────────────
  Light-weight clean-up applied to recitation audio.

  • enhanceForAsr()  – before the audio reaches the Tarteel model:
        remove DC offset + low rumble (high-pass ≈ 70 Hz), then bring the SPEECH
        (not the background noise) to a steady level and soft-limit the peaks.
        Quiet phones / far-away mics are the usual reason words get dropped.
  • speechRms() / playbackGainFor() – used by the "Your Recitation" player to
        play a quiet recording at a comfortable volume.
*/

const FRAME = 320; // 20 ms @ 16 kHz

/** RMS of the speech-active part of the signal (frames well above the noise floor). */
export function speechRms(x: Float32Array, frame = FRAME): number {
  const n = Math.floor(x.length / frame);
  if (n < 2) return 0;
  const rms = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    for (let i = f * frame, e = i + frame; i < e; i++) s += x[i] * x[i];
    rms[f] = Math.sqrt(s / frame);
  }
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const floor = sorted[Math.floor(n * 0.2)];
  const thr = Math.max(floor * 3, 0.0015);
  let sum = 0, cnt = 0;
  for (let f = 0; f < n; f++) if (rms[f] > thr) { sum += rms[f] * rms[f]; cnt++; }
  return cnt ? Math.sqrt(sum / cnt) : 0;
}

function highPass(x: Float32Array, sr: number, fc = 70): Float32Array {
  const rc = 1 / (2 * Math.PI * fc), dt = 1 / sr, a = rc / (rc + dt);
  const y = new Float32Array(x.length);
  let py = 0, px = x.length ? x[0] : 0;
  for (let i = 0; i < x.length; i++) {
    py = a * (py + x[i] - px);
    px = x[i];
    y[i] = py;
  }
  return y;
}

function softLimit(v: number): number {
  const t = 0.9, a = Math.abs(v);
  if (a <= t) return v;
  const o = t + (1 - t) * Math.tanh((a - t) / (1 - t));
  return v < 0 ? -o : o;
}

/** Returns a cleaned, level-normalised copy of mono audio (never modifies the input). */
export function enhanceForAsr(input: Float32Array, sr = 16000, targetRms = 0.1, maxGain = 10): Float32Array {
  if (input.length < sr * 0.3) return input;
  const y = highPass(input, sr);
  const r = speechRms(y);
  if (r <= 0) return y;
  const gain = Math.min(maxGain, Math.max(0.5, targetRms / r));
  if (Math.abs(gain - 1) < 0.05) return y;
  for (let i = 0; i < y.length; i++) y[i] = softLimit(y[i] * gain);
  return y;
}

/**
 * Voice booster for PLAYBACK only (a plain gain — no compressor). Quiet speech is lifted to a comfortable
 * level; the gain is capped so the loudest peak lands at 0.98 of full scale, i.e. it can never clip, and
 * a recording that is already loud gets 1 (untouched).
 */
export function playbackGainFor(buf: AudioBuffer): number {
  try {
    const ch = buf.getChannelData(0);
    const frame = Math.max(1, Math.round(buf.sampleRate * 0.02));
    let peak = 0;
    for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > peak) peak = a; }
    if (peak <= 0) return 1;
    const r = speechRms(ch, frame);
    // aim for a comfortable speech level; if the level can't be measured, fall back to peak-normalising
    let g = r > 0 ? 0.15 / r : 0.9 / peak;
    g = Math.min(g, 0.98 / peak);         // no compressor downstream — never push a peak past full scale
    return Math.min(12, Math.max(1, g));
  } catch { return 1; }
}

/* ───────────────────────── Speech gate for the Tarteel model ─────────────────────────
  Whisper-style models INVENT text (often a famous opening such as "براءة من الله ورسوله…") when
  they are fed silence, breath, room noise or a long pause. prepareForAsr() makes sure the model only
  ever sees the parts where the student is actually speaking:
    • finds speech frames (adaptive to the recording's own noise floor, with a generous hang-over so
      the soft tail of a madd / ghunnah is kept),
    • drops leading / trailing silence and shortens long pauses,
    • returns null when there is no speech at all (→ nothing is sent to the model),
    • brings a quiet recording up to a normal level with ONE plain gain (no filtering, no limiter, so
      the sound itself is untouched).
*/
export function prepareForAsr(x: Float32Array, sr = 16000): Float32Array | null {
  const frame = Math.round(sr * 0.02);
  const n = Math.floor(x.length / frame);
  if (n < 10) return null;
  const rms = new Float32Array(n);
  let peak = 0;
  for (let f = 0; f < n; f++) {
    let s = 0;
    for (let i = f * frame, e = i + frame; i < e; i++) { const v = x[i]; s += v * v; const a = v < 0 ? -v : v; if (a > peak) peak = a; }
    rms[f] = Math.sqrt(s / frame);
  }
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const floor = sorted[Math.floor(n * 0.1)];
  const thr = Math.max(floor * 3, 0.0025);
  const act = new Uint8Array(n);
  let nAct = 0;
  for (let f = 0; f < n; f++) if (rms[f] > thr) { act[f] = 1; nAct++; }
  if (nAct * frame / sr < 0.5) return null;                       // under half a second of sound
  // hang-over: keep 0.4 s after each active frame and 0.15 s before it
  const keep = new Uint8Array(n);
  const HANG = 20, LEAD = 8;
  for (let f = 0; f < n; f++) if (act[f]) {
    for (let k = Math.max(0, f - LEAD); k <= Math.min(n - 1, f + HANG); k++) keep[k] = 1;
  }
  // collect kept runs; a pause longer than 1.2 s is shortened to 0.5 s
  const out: number[] = [];
  const parts: Float32Array[] = [];
  let f = 0, total = 0, gap = 0;
  const MAXGAP = 60, SHORT = 25;
  while (f < n) {
    if (!keep[f]) { gap++; f++; continue; }
    if (parts.length && gap > 0) {
      const g = gap > MAXGAP ? SHORT : gap;
      const z = new Float32Array(g * frame);
      parts.push(z); total += z.length;
    }
    gap = 0;
    const s = f;
    while (f < n && keep[f]) f++;
    const seg = x.subarray(s * frame, f * frame);
    parts.push(seg); total += seg.length;
  }
  void out;
  if (total < sr * 0.5) return null;
  const y = new Float32Array(total);
  let o = 0;
  for (const p of parts) { y.set(p, o); o += p.length; }
  // plain gain toward a normal speech level (never lowers the level, never clips)
  const r = speechRms(y);
  if (r > 0) {
    let g = Math.min(12, 0.08 / r);
    if (peak > 0) g = Math.min(g, 0.98 / peak);
    if (g > 1.1) for (let i = 0; i < y.length; i++) y[i] *= g;
  }
  return y;
}

/* ───────────────────────── Loudspeaker playback ─────────────────────────
  After the microphone has been used, Android (and iOS) can leave the phone in "call" mode, where sound
  comes out of the tiny earpiece — or nothing audible at all. Three things keep recordings on the speaker:
   1. decode with an OfflineAudioContext, so no real audio output is opened while the mic is still releasing;
   2. create a FRESH AudioContext at the moment the student taps play (a context opened earlier can stay
      bound to the call route);
   3. tell the browser this is media playback (navigator.audioSession, where supported). */

/** Mark the page's audio as media playback so the system uses the loudspeaker. */
export function preferSpeaker(): void {
  try {
    const s = (navigator as any).audioSession;
    if (s && s.type !== "playback") s.type = "playback";
  } catch { /* not supported */ }
}

/** Decode recorded audio WITHOUT opening a real output device. */
export function decodeForPlayback(data: ArrayBuffer): Promise<AudioBuffer> {
  const OAC: typeof OfflineAudioContext = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const ctx = new OAC(1, 1, 48000);
  return new Promise<AudioBuffer>((resolve, reject) => {
    // callback form: the only one older Safari / WebViews support
    const p: any = ctx.decodeAudioData(data, resolve, reject);
    if (p && typeof p.catch === "function") p.catch(reject);
  });
}

/** Close the old playback context (if any) and open a new one on the loudspeaker route. Call inside the tap. */
export async function freshPlaybackContext(old: AudioContext | null): Promise<AudioContext> {
  preferSpeaker();
  try { await old?.close(); } catch { /* already closed */ }
  const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  let ctx: AudioContext;
  try { ctx = new AC({ latencyHint: "playback" }); } catch { ctx = new AC(); }
  if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* resumed on next gesture */ } }
  return ctx;
}
