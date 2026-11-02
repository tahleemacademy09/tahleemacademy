/*
  liveMistake.ts — decides WHEN to buzz while the student is still reciting.

  The live matcher (ctcNative.ts → scorePrefix) aligns the page words to the audio heard so far and gives every word
  a score. A word that was skipped or said wrongly is squeezed over a few frames the model hears as something else, so
  it scores "bad" (< -3) while the words AFTER it (said correctly) score fine. That is the signature of a mistake:

        word j scored bad   AND   a later word (j+1 …) was heard well.

  Two guards keep false alarms down:
    • goodAfter    the word must be followed by a word that WAS heard (otherwise "bad" may just mean "not said yet")
    • confirmSteps the word must be bad in this many consecutive live steps (a single noisy step never buzzes)
  Each word is flagged at most once.
*/

export interface LiveWordScore { mean: number | null }

export interface MistakeTrackerOptions {
  /** mean log-prob below this = word not heard (same cut-off the final grading uses for red). Default -3 */
  bad?: number;
  /** must be bad in this many consecutive live steps before it is flagged. Default 2 */
  confirmSteps?: number;
  /** this many words after it must have been heard (lastGood - j >= goodAfter). Default 1 */
  goodAfter?: number;
}

export class LiveMistakeTracker {
  private bad: number;
  private confirm: number;
  private goodAfter: number;
  private streak = new Map<number, number>();
  private flagged = new Set<number>();

  constructor(o: MistakeTrackerOptions = {}) {
    this.bad = o.bad ?? -3;
    this.confirm = Math.max(1, o.confirmSteps ?? 2);
    this.goodAfter = Math.max(1, o.goodAfter ?? 1);
  }

  /**
   * One live step.
   * @param base      absolute page-word index of scores[0]
   * @param scores    per-word scores from the step (scores[0] is page word `base`)
   * @param lastGood  index INTO `scores` of the last word fully said and heard well (-1 if none)
   * @returns absolute indices of words newly confirmed as mistakes (usually empty)
   */
  update(base: number, scores: LiveWordScore[], lastGood: number): number[] {
    for (const k of this.streak.keys()) if (k < base) this.streak.delete(k);   // settled words are never re-scored
    const out: number[] = [];
    const limit = lastGood - this.goodAfter;
    for (let j = 0; j <= limit; j++) {
      const abs = base + j;
      if (this.flagged.has(abs)) continue;
      const m = scores[j]?.mean;
      if (m !== null && m !== undefined && m < this.bad) {
        const n = (this.streak.get(abs) ?? 0) + 1;
        if (n >= this.confirm) { this.flagged.add(abs); this.streak.delete(abs); out.push(abs); }
        else this.streak.set(abs, n);
      } else this.streak.delete(abs);
    }
    return out;
  }

  isFlagged(abs: number): boolean { return this.flagged.has(abs); }
  get flaggedWords(): number[] { return [...this.flagged].sort((a, b) => a - b); }
  reset() { this.streak.clear(); this.flagged.clear(); }
}

/** Buzz pattern (waveform timings ms: off, on, off, on …): one short pulse per mistake word, at most three. */
export function buzzPattern(count: number): number[] {
  const n = Math.max(1, Math.min(3, count));
  const p: number[] = [];
  for (let i = 0; i < n; i++) { if (i > 0) p.push(70); else p.push(0); p.push(110); }
  return p;
}
