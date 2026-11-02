/*
  tarteelScore.ts — Tarteel as a SCORER instead of a transcriber (pure logic, no audio / model APIs).

  Whisper is slow because it writes the text one token at a time. Here we already know the text, so we hand the
  model the audio AND the expected words and read, in ONE forward pass, how likely each expected token was
  (teacher forcing). And we only do it for the words CTC did not mark green, using CTC's word timings to cut out
  just the stretch of audio around them. A recitation CTC fully accepts costs Tarteel nothing at all.
*/
import type { Grade, WordResult } from "./recitationCompare";

export interface ScoreWindow {
  /** first / last page-word index in the window (inclusive); the model is shown all of them as context */
  a: number; b: number;
  /** audio span in seconds */
  t0: number; t1: number;
  /** page-word indices inside the window that CTC did not accept (the only ones whose score is used) */
  targets: number[];
}

export interface WordScore { mean: number; min: number; top1: number; n: number }

export const CONTEXT_WORDS = 2;      // words on each side of a target that give the model its prefix / anchor the audio
export const MAX_WINDOW_SECS = 22;   // Whisper sees 30 s; keep headroom for the padding
export const AUDIO_PAD_SECS = 0.4;
export const MIN_WINDOW_SECS = 0.6;

/** Fill missing CTC times from the neighbours so every word has a span (unrecited words often have none). */
export function fillTimes(starts: (number | null | undefined)[], ends: (number | null | undefined)[], totalSecs: number): { s: number[]; e: number[] } {
  const n = starts.length;
  const s: number[] = new Array(n), e: number[] = new Array(n);
  let prevEnd = 0;
  for (let i = 0; i < n; i++) {
    const hs = starts[i] != null, he = ends[i] != null;
    s[i] = hs ? (starts[i] as number) : prevEnd;
    e[i] = he ? (ends[i] as number) : s[i];
    prevEnd = Math.max(prevEnd, e[i]);
  }
  let nextStart = totalSecs;
  for (let i = n - 1; i >= 0; i--) {
    if (starts[i] == null && ends[i] == null) { e[i] = Math.max(e[i], Math.min(nextStart, totalSecs)); s[i] = Math.min(s[i], e[i]); }
    else nextStart = s[i];
  }
  return { s, e };
}

/** Which stretches of audio need a Tarteel look? Empty when CTC already accepted every word. */
export function planWindows(
  graded: Pick<WordResult, "grade">[],
  starts: (number | null | undefined)[],
  ends: (number | null | undefined)[],
  totalSecs: number,
): ScoreWindow[] {
  const n = graded.length;
  const targets: number[] = [];
  for (let i = 0; i < n; i++) if (graded[i].grade !== "ok") targets.push(i);
  if (!targets.length || !(totalSecs > 0)) return [];
  const { s, e } = fillTimes(starts, ends, totalSecs);
  const span = (a: number, b: number) => Math.max(0, Math.min(totalSecs, e[b] + AUDIO_PAD_SECS) - Math.max(0, s[a] - AUDIO_PAD_SECS));

  const out: ScoreWindow[] = [];
  let cur: ScoreWindow | null = null;
  for (const t of targets) {
    const a = Math.max(0, t - CONTEXT_WORDS), b = Math.min(n - 1, t + CONTEXT_WORDS);
    if (cur && a <= cur.b + 1 && span(cur.a, b) <= MAX_WINDOW_SECS) { cur.b = Math.max(cur.b, b); cur.targets.push(t); continue; }
    cur = { a, b, t0: 0, t1: 0, targets: [t] };
    out.push(cur);
  }
  const res: ScoreWindow[] = [];
  for (const w of out) {
    w.t0 = Math.max(0, s[w.a] - AUDIO_PAD_SECS);
    w.t1 = Math.min(totalSecs, e[w.b] + AUDIO_PAD_SECS);
    if (w.t1 - w.t0 > MAX_WINDOW_SECS) w.t1 = w.t0 + MAX_WINDOW_SECS;   // never beyond what the model can see
    if (w.t1 - w.t0 >= MIN_WINDOW_SECS) res.push(w);                    // no usable audio span → leave CTC's verdict alone
  }
  return res;
}

/* Thresholds on the model's log-probability for the expected tokens. UNCALIBRATED first guesses — the page logs every
   word's numbers under "[Tarteel-score]" so they can be tuned on real recitations. */
export const OK_MEAN = -0.8;
export const OK_MIN = -3;
export const CLOSE_MEAN = -2;

export function gradeFromScore(sc: WordScore | null | undefined): Grade {
  if (!sc || !sc.n) return "missed";
  if ((sc.mean >= OK_MEAN && sc.min >= OK_MIN) || sc.top1 >= 1) return "ok";
  if (sc.mean >= CLOSE_MEAN) return "close";
  return "wrong";
}

/**
 * One WordResult per page word, in order, in the shape mergeCtcTarteel() already expects. Words that were not scored
 * are "missed", which the merge treats as "Tarteel did not back this up" (CTC's verdict stays).
 */
export function buildTarteelWords(refWords: string[], scores: Map<number, WordScore>): WordResult[] {
  return refWords.map((word, i) => {
    const grade = gradeFromScore(scores.get(i));
    return { word, grade, status: grade === "ok" ? "correct" as const : "missing" as const, credit: grade === "ok" ? 1 : grade === "close" ? 0.5 : 0 };
  });
}
