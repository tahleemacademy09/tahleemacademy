/*
  whisperLive.ts — cloud Whisper WHILE the student recites.
  The page already taps the microphone as 16 kHz mono chunks (LiveMic, for the live CTC check). This class collects the
  same audio and, at every natural pause (or after ~26 s at most), sends the finished piece to Whisper in the background.
  At Stop only the last piece is left, so Whisper's text is ready within a second or two instead of after the whole
  recording has been uploaded. finish() returns ok = false if anything went wrong (a piece failed, or the recording was
  continued from an earlier session) so the caller can fall back to the whole recording.
*/
import { whisperTranscribePcm } from "./whisperCloud";

const SR = 16000;
const MIN_SEG = 12 * SR;          // do not cut before 12 s of audio…
const MAX_SEG = 26 * SR;          // …and always cut by ~26 s
const QUIET_RMS = 0.012;          // below this the mic is "quiet"
const QUIET_NEED = Math.round(0.35 * SR);   // a pause this long is a good place to cut
const SILENT_SEGMENT_RMS = 0.004;           // a whole piece this quiet is not sent (Whisper invents words from silence)

export class LiveWhisper {
  /** set true when the audio fed here is not the whole recording (continued session) */
  incomplete = false;
  private parts: Float32Array[] = [];
  private n = 0;
  private quiet = 0;
  private sumSq = 0;
  private jobs: Promise<{ text: string; err?: string }>[] = [];
  private cancelled = false;

  feed(x: Float32Array) {
    if (this.cancelled || !x.length) return;
    this.parts.push(x); this.n += x.length;
    let e = 0;
    for (let i = 0; i < x.length; i++) e += x[i] * x[i];
    this.sumSq += e;
    this.quiet = Math.sqrt(e / x.length) < QUIET_RMS ? this.quiet + x.length : 0;
    if ((this.n >= MIN_SEG && this.quiet >= QUIET_NEED) || this.n >= MAX_SEG) this.flush();
  }

  private flush() {
    if (!this.n) return;
    const pcm = new Float32Array(this.n); let o = 0;
    for (const p of this.parts) { pcm.set(p, o); o += p.length; }
    const silent = Math.sqrt(this.sumSq / this.n) < SILENT_SEGMENT_RMS;
    this.parts = []; this.n = 0; this.quiet = 0; this.sumSq = 0;
    if (silent) return;
    this.jobs.push(
      whisperTranscribePcm(pcm).then((r) => ({ text: r.text, err: r.error })).catch((e) => ({ text: "", err: String(e?.message ?? e) })),
    );
  }

  async finish(): Promise<{ text: string; ok: boolean }> {
    if (!this.cancelled) this.flush();
    const rs = await Promise.all(this.jobs);
    return { text: rs.map((r) => r.text).filter(Boolean).join(" ").trim(), ok: !this.incomplete && !this.cancelled && rs.every((r) => !r.err) };
  }

  cancel() { this.cancelled = true; this.parts = []; this.n = 0; this.jobs = []; }
}
