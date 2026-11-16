/*
  whisperLive.ts — cloud Whisper WHILE the student recites.
  The page already taps the microphone as 16 kHz mono chunks (LiveMic, for the live CTC check). This class collects the
  same audio and, at every natural pause (or after ~26 s at most), sends the finished piece to Whisper in the background.
  At Stop only the last piece is left, so Whisper's text is ready within a second or two instead of after the whole
  recording has been uploaded. finish() returns ok = false if anything went wrong (a piece failed, or the recording was
  continued from an earlier session) so the caller can fall back to the whole recording.
*/
import { whisperTranscribePcm } from "./whisperCloud";
import { mergeHeard } from "./transcriptMerge";

const SR = 16000;
// Cut points are deliberately DIFFERENT from Tarteel's (8 s chunks, 2.5 s overlap) and from CTC's continuous stream, and every
// piece repeats the last OVERLAP_S seconds of the previous one — so a word that falls on a Whisper cut is heard whole by
// the other models, and again by Whisper itself in the next piece.
const MIN_SEG = 14 * SR;          // do not cut before 14 s of NEW audio…
const FIRST_MIN_SEG = 19 * SR;    // …the first piece is longer, so Whisper's cuts never line up with Tarteel's 8 s rhythm
const MAX_SEG = 26 * SR;          // …and always cut by ~26 s of new audio (+ overlap stays under Whisper's 30 s window)
const OVERLAP = Math.round(3 * SR);
const QUIET_RMS = 0.012;          // below this the mic is "quiet"
const QUIET_NEED = Math.round(0.35 * SR);   // a pause this long is a good place to cut
const SILENT_SEGMENT_RMS = 0.004;           // a whole piece this quiet is not sent (Whisper invents words from silence)

export class LiveWhisper {
  /** set true when the audio fed here is not the whole recording (continued session) */
  incomplete = false;
  private parts: Float32Array[] = [];
  private n = 0;            // samples in the current piece (overlap + new)
  private fresh = 0;        // NEW samples in the current piece (without the repeated overlap)
  private sent = 0;         // pieces already sent
  private quiet = 0;
  private sumSq = 0;
  private jobs: Promise<{ text: string; err?: string }>[] = [];
  private cancelled = false;

  feed(x: Float32Array) {
    if (this.cancelled || !x.length) return;
    this.parts.push(x); this.n += x.length; this.fresh += x.length;
    let e = 0;
    for (let i = 0; i < x.length; i++) e += x[i] * x[i];
    this.sumSq += e;
    this.quiet = Math.sqrt(e / x.length) < QUIET_RMS ? this.quiet + x.length : 0;
    const minSeg = this.sent === 0 ? FIRST_MIN_SEG : MIN_SEG;
    if ((this.fresh >= minSeg && this.quiet >= QUIET_NEED) || this.fresh >= MAX_SEG) this.flush();
  }

  private flush() {
    if (!this.fresh) return;
    const pcm = new Float32Array(this.n); let o = 0;
    for (const p of this.parts) { pcm.set(p, o); o += p.length; }
    const silent = Math.sqrt(this.sumSq / this.fresh) < SILENT_SEGMENT_RMS;
    // the next piece starts with the last OVERLAP seconds of this one
    const tail = pcm.slice(Math.max(0, pcm.length - OVERLAP));
    this.parts = [tail]; this.n = tail.length; this.fresh = 0; this.quiet = 0; this.sumSq = 0;
    this.sent++;
    if (silent) return;
    this.jobs.push(
      whisperTranscribePcm(pcm).then((r) => ({ text: r.text, err: r.error })).catch((e) => ({ text: "", err: String(e?.message ?? e) })),
    );
  }

  async finish(): Promise<{ text: string; ok: boolean }> {
    if (!this.cancelled) this.flush();
    const rs = await Promise.all(this.jobs);
    let text = "";
    for (const r of rs) if (r.text) text = text ? mergeHeard(text, r.text) : r.text;   // pieces overlap → merge, don't just join
    return { text: text.trim(), ok: !this.incomplete && !this.cancelled && rs.every((r) => !r.err) };
  }

  cancel() { this.cancelled = true; this.parts = []; this.n = 0; this.fresh = 0; this.jobs = []; }
}
