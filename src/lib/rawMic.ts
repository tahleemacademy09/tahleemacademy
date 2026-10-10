/**
 * Raw microphone for recitation.
 *
 * Why this exists: on Android Chrome, `echoCancellation: true` switches the phone to its "voice call"
 * audio path, and that path applies the phone's OWN noise suppression + gain — even when
 * `noiseSuppression: false` is requested. So the recording came out quieter and thinner than the
 * phone's normal voice recorder. Here every processing option is turned OFF (echo cancel, noise
 * suppression, auto gain, voice isolation), the result is verified, and then a *gentle* level lift is
 * applied in WebAudio so the loudness matches a normal recorder clip (target ≈ -15 dB RMS).
 *
 * The lift is slow and clamped (never more than +18 dB, never touches silence), followed by a soft
 * limiter so loud moments cannot clip. It does not remove or fade anything — it only raises level.
 */

export interface RawMic {
  /** Processed stream (record / transcribe from THIS one). */
  stream: MediaStream;
  /** What the phone's mic actually returned, for diagnostics. */
  settings: MediaTrackSettings;
  /** Stop everything: raw mic tracks, audio graph. Safe to call twice. */
  close: () => void;
}

const TARGET_RMS_DB = -15;     // loudness of the reference clip
const MAX_GAIN_DB = 18;        // never lift more than this
const MIN_GAIN_DB = 0;         // never make it quieter
const GATE_DB = -52;           // below this it is silence / room noise: don't chase it upward
const TICK_MS = 100;

const dbToLin = (db: number) => Math.pow(10, db / 20);

function rawConstraints(): MediaTrackConstraints {
  return {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
    // Chrome/Android only; harmless elsewhere (ignored if unknown).
    ...({ voiceIsolation: false, googEchoCancellation: false, googNoiseSuppression: false,
          googAutoGainControl: false, googHighpassFilter: false, googTypingNoiseDetection: false } as any),
  };
}

export async function openRawMic(opts: { boost?: boolean } = {}): Promise<RawMic> {
  const boost = opts.boost !== false;
  const raw = await navigator.mediaDevices.getUserMedia({ audio: rawConstraints() });
  const track = raw.getAudioTracks()[0];

  // Some browsers keep a processing flag on even when asked for off — re-apply, then re-read.
  try {
    const s0: any = track.getSettings();
    if (s0.echoCancellation || s0.noiseSuppression || s0.autoGainControl) {
      await track.applyConstraints({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
    }
  } catch { /* keep going with what we have */ }
  const settings = track.getSettings();

  let closed = false;
  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let out: MediaStream = raw;

  if (boost) {
    try {
      const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      ctx = new AC();
      if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* noop */ } }

      const src = ctx.createMediaStreamSource(raw);
      const gain = ctx.createGain();
      gain.gain.value = 1;

      // Level meter (read-only branch, before the gain, so we measure the mic itself).
      const meter = ctx.createAnalyser();
      meter.fftSize = 2048;
      const buf = new Float32Array(meter.fftSize);

      // Soft limiter after the gain: catches peaks so a lift can never clip.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;

      const dest = ctx.createMediaStreamDestination();
      src.connect(meter);
      src.connect(gain);
      gain.connect(limiter);
      limiter.connect(dest);
      out = dest.stream;

      // Slow level follower: smoothed RMS of the last ~2 s of *voiced* audio → gain target.
      let smoothDb = -60;
      let voiced = false;
      timer = setInterval(() => {
        if (closed || !ctx) return;
        meter.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const db = 10 * Math.log10(sum / buf.length + 1e-12);
        if (db > GATE_DB) {
          voiced = true;
          // fast-ish up, slow down — follows the reciter's level without pumping on each word
          smoothDb += (db - smoothDb) * (db > smoothDb ? 0.15 : 0.04);
        } else {
          voiced = false;
        }
        if (voiced) {
          const wantDb = Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, TARGET_RMS_DB - smoothDb));
          gain.gain.setTargetAtTime(dbToLin(wantDb), ctx.currentTime, 0.4);
        }
        // in silence the gain simply holds, so room noise is not swelled up between verses
      }, TICK_MS);
    } catch (e) {
      console.warn("[rawMic] gain stage unavailable, using the raw mic:", e);
      out = raw;
      try { ctx?.close(); } catch { /* noop */ }
      ctx = null;
    }
  }

  const close = () => {
    if (closed) return;
    closed = true;
    if (timer) { clearInterval(timer); timer = null; }
    try { raw.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    try { out.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    try { ctx?.close(); } catch { /* noop */ }
  };

  return { stream: out, settings, close };
}
