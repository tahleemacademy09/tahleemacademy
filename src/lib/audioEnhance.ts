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

/** Gain to apply when PLAYING a recording so quiet speech is comfortably audible (1 = leave as is). */
export function playbackGainFor(buf: AudioBuffer): number {
  try {
    const ch = buf.getChannelData(0);
    const frame = Math.max(1, Math.round(buf.sampleRate * 0.02));
    let peak = 0;
    for (let i = 0; i < ch.length; i += 7) { const a = Math.abs(ch[i]); if (a > peak) peak = a; }
    if (peak <= 0) return 1;
    const r = speechRms(ch, frame);
    // aim for a comfortable speech level; if the level can't be measured, fall back to peak-normalising
    let g = r > 0 ? 0.15 / r : 0.9 / peak;
    g = Math.min(g, 2.5 / peak);          // the compressor in the player tames peaks above full scale
    return Math.min(12, Math.max(1, g));
  } catch { return 1; }
}
