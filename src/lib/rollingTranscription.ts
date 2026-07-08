/*
  rollingTranscription.ts
  ────────────────────────────────────────────────────────────────────────
  Shared rolling/overlapping-chunk transcription engine, used by both the
  Al-Hifdh Quran Revision page recorder (HifdhRevision.tsx) and the Daily
  Hifdh recorder (HifdhDailyRevisionPage.tsx).

  WHY THIS EXISTS — two different bugs, two different root causes
  ------------------------------------------------------------------
  1) Quran Hifdh page revision: "6-10 minutes after Stop, and the middle
     gets dropped."
     The old code did two things, both wrong:
       a) On every 500ms MediaRecorder tick it re-uploaded the ENTIRE
          growing recording so far to Groq (for live word-highlighting).
          Over a 2-3 minute page that's dozens of overlapping HTTP uploads,
          each bigger than the last, competing for the same mobile uplink —
          this alone can starve/queue the real request behind it.
       b) The actual score always came from a SEPARATE final call: the
          whole page, as one audio file, sent to Whisper once, only after
          Stop. A single multi-minute file forces Whisper to run its own
          internal ~30s windowing with no exposed silence/VAD tuning.
          Whenever it misjudges a span as silence it drops that whole span
          from the returned text — usually the middle, where a natural
          mid-recitation breath/pause is most likely. Once one whole file
          has been sent there is no way to recover a dropped span.

  2) Daily Hifdh: "skips a lot of words, worse than Quran Hifdh."
     Daily already had the right instinct — background-transcribe in
     ~12s chunks so only the tail needs transcribing after "Finished" —
     but cut those chunks with a hard NON-overlapping boundary: recorder A
     stops, recorder B starts, back to back, no overlap. Every such cut
     reliably clips or drops whatever word straddles it, because Whisper
     needs a little acoustic context on both sides of a word. A cut every
     12 seconds through a multi-minute recitation is a lot of cuts —
     hence "a lot" of missing words, worse than Quran Hifdh's single cut.

  THE FIX
  -------
  - Chunk audio into OVERLAPPING windows: two MediaRecorders run
    concurrently on the same MediaStream for a short overlap window, so
    every word is captured whole in at least one chunk.
  - Merge consecutive chunk transcripts by finding the longest matching
    run of Arabic words between the tail of transcript N and the head of
    transcript N+1, so the overlap isn't duplicated in the merged text.
  - Each chunk is short (well under Whisper's internal 30s window), so
    there's no long-form windowing/silence-drop risk per chunk.
  - Chunks transcribe continuously WHILE the student is still reciting —
    by the time they press Stop/Finished, only the last ~15-20s (one
    chunk) is left, so total wait drops to a few seconds either way.
*/

export interface RollingTranscriberOptions {
  /** How often a new overlapping chunk starts. Default 18s — long enough
   *  that each chunk is a natural multi-word span (good context for
   *  Whisper), short enough that the "tail wait" after Stop stays under a
   *  few seconds. */
  intervalMs?: number;
  /** How long two recorders run concurrently at each boundary, so no word
   *  is ever split across chunks with zero shared context. Default 3s. */
  overlapMs?: number;
  /** Called once per chunk to build the vocabulary-hint prompt (style/
   *  script hint only — never the actual verse, or Whisper will "helpfully"
   *  echo the reference text back regardless of what was said). */
  buildPrompt: () => string;
  /** Sends one chunk's Blob to the transcription backend and resolves with
   *  the recognized text (may be ""). Callers own the network call so this
   *  module has no direct dependency on Supabase/Groq specifics. */
  transcribeChunk: (blob: Blob, prompt: string) => Promise<string>;
}

type SegmentEntry = { mr: MediaRecorder; chunks: Blob[] };

export class RollingTranscriber {
  private stream: MediaStream;
  private mime: string;
  private opts: Required<RollingTranscriberOptions>;
  private active: SegmentEntry[] = [];
  private restartTimer: ReturnType<typeof setInterval> | null = null;
  private transcript = "";
  private pendingFinal: (() => void) | null = null;
  private stopped = false;

  constructor(stream: MediaStream, mime: string, opts: RollingTranscriberOptions) {
    this.stream = stream;
    this.mime = mime;
    this.opts = {
      intervalMs: 18000,
      overlapMs: 3000,
      ...opts,
    } as Required<RollingTranscriberOptions>;
  }

  start() {
    this.stopped = false;
    this.spawnSegment();
    this.restartTimer = setInterval(() => this.spawnSegment(), this.opts.intervalMs);
  }

  /** Transcript accumulated so far — safe to read at any time for
   *  interim/live display (e.g. word-highlighting) without any extra
   *  network calls of its own. */
  getTranscriptSoFar(): string {
    return this.transcript;
  }

  private spawnSegment() {
    if (this.stopped) return;
    const mr = new MediaRecorder(
      this.stream,
      this.mime ? { mimeType: this.mime, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 }
    );
    const chunks: Blob[] = [];
    const entry: SegmentEntry = { mr, chunks };
    mr.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };

    const prompt = this.opts.buildPrompt();
    mr.onstop = () => {
      this.active = this.active.filter((e) => e !== entry);
      const blob = new Blob(chunks, { type: this.mime || "audio/webm" });
      if (blob.size < 3000) { this.resolvePendingIfDone(); return; } // near-silent/empty
      this.opts.transcribeChunk(blob, prompt)
        .then((txt) => { if (txt) this.transcript = mergeTranscripts(this.transcript, txt); })
        .finally(() => this.resolvePendingIfDone());
    };

    this.active.push(entry);
    try { mr.start(); } catch { this.active = this.active.filter((e) => e !== entry); return; }

    // This segment keeps recording for intervalMs + overlapMs. The NEXT
    // segment starts intervalMs from now — so the two overlap for
    // overlapMs, giving every boundary word full context in one chunk.
    setTimeout(() => {
      if (mr.state !== "inactive") { try { mr.stop(); } catch { /* noop */ } }
    }, this.opts.intervalMs + this.opts.overlapMs);
  }

  private resolvePendingIfDone() {
    if (this.active.length === 0 && this.pendingFinal) {
      const f = this.pendingFinal;
      this.pendingFinal = null;
      f();
    }
  }

  /** Stops all in-flight recorders and resolves once every chunk still in
   *  flight has finished transcribing and merging. Callers therefore only
   *  wait on whatever chunk(s) hadn't completed yet — normally just the
   *  last one, so this resolves in a few seconds, not minutes. */
  finalize(): Promise<string> {
    this.stopped = true;
    if (this.restartTimer) clearInterval(this.restartTimer);
    return new Promise((resolve) => {
      if (this.active.length === 0) { resolve(this.transcript); return; }
      this.pendingFinal = () => resolve(this.transcript);
      // Snapshot before iterating — stopping a recorder synchronously
      // triggers onstop, which mutates this.active.
      [...this.active].forEach(({ mr }) => {
        if (mr.state !== "inactive") { try { mr.stop(); } catch { /* noop */ } }
      });
    });
  }

  /** Abort without waiting for in-flight chunks (e.g. user navigated away). */
  cancel() {
    this.stopped = true;
    if (this.restartTimer) clearInterval(this.restartTimer);
    [...this.active].forEach(({ mr }) => {
      mr.onstop = null as any; // don't fire a transcription for a discarded segment
      if (mr.state !== "inactive") { try { mr.stop(); } catch { /* noop */ } }
    });
    this.active = [];
  }
}

/**
 * Merge two consecutive chunk transcripts that share an overlapping span of
 * audio. Finds the longest run where the END of `prev`'s words matches the
 * START of `next`'s words, and splices them together without duplicating
 * that shared run. Falls back to plain concatenation if no overlap is
 * detected (e.g. the overlap window was pure silence on one side).
 */
export function mergeTranscripts(prev: string, next: string): string {
  const prevTrim = prev.trim();
  const nextTrim = next.trim();
  if (!prevTrim) return nextTrim;
  if (!nextTrim) return prevTrim;

  const a = prevTrim.split(/\s+/);
  const b = nextTrim.split(/\s+/);
  const maxOverlap = Math.min(a.length, b.length, 12); // overlap window is only ~3s of speech

  for (let len = maxOverlap; len > 0; len--) {
    const aTail = a.slice(a.length - len).join(" ");
    const bHead = b.slice(0, len).join(" ");
    if (aTail === bHead) {
      return [...a, ...b.slice(len)].join(" ");
    }
  }
  return [...a, ...b].join(" ");
}
