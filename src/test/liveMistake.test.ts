import { describe, it, expect } from "vitest";
import { LiveMistakeTracker, buzzPattern } from "@/lib/liveMistake";
import { scorePrefix } from "@/lib/ctcAlign";

/* ── Tracker rules ─────────────────────────────────────────────────────────── */
describe("LiveMistakeTracker", () => {
  const ok = { mean: -0.2 }, bad = { mean: -6 };

  it("flags a bad word only after it is bad in 2 consecutive steps AND a later word was heard", () => {
    const t = new LiveMistakeTracker();
    expect(t.update(0, [ok, bad, ok], 2)).toEqual([]);      // first sighting
    expect(t.update(0, [ok, bad, ok], 2)).toEqual([1]);     // confirmed
    expect(t.update(0, [ok, bad, ok], 2)).toEqual([]);      // never flagged twice
    expect(t.flaggedWords).toEqual([1]);
  });

  it("does not flag a bad-looking word when nothing after it has been heard (it may just not be said yet)", () => {
    const t = new LiveMistakeTracker();
    for (let i = 0; i < 5; i++) expect(t.update(0, [ok, bad], 0)).toEqual([]);   // lastGood = 0 → word 1 is just "not yet"
  });

  it("a single noisy step does not buzz", () => {
    const t = new LiveMistakeTracker();
    expect(t.update(0, [ok, bad, ok], 2)).toEqual([]);
    expect(t.update(0, [ok, ok, ok], 2)).toEqual([]);      // recovered → streak reset
    expect(t.update(0, [ok, bad, ok], 2)).toEqual([]);     // starts again from 1
  });

  it("uses absolute word indexes when the window has moved on", () => {
    const t = new LiveMistakeTracker();
    t.update(40, [ok, bad, ok], 2);
    expect(t.update(40, [ok, bad, ok], 2)).toEqual([41]);
  });

  it("two skipped words in a row are both reported", () => {
    const t = new LiveMistakeTracker({ confirmSteps: 1 });
    expect(t.update(0, [ok, bad, bad, ok], 3)).toEqual([1, 2]);
  });

  it("buzz pattern: one pulse per word, at most three", () => {
    expect(buzzPattern(1)).toEqual([0, 110]);
    expect(buzzPattern(2)).toEqual([0, 110, 70, 110]);
    expect(buzzPattern(9)).toEqual([0, 110, 70, 110, 70, 110]);
  });
});

/* ── The assumption the detector rests on: a SKIPPED word scores bad, the words after it score fine ───────────── */
const V = 12, BLANK = 0;
/** one frame whose log-probs put almost all mass on `tok` */
function frame(tok: number): number[] {
  const hi = -0.05, lo = Math.log((1 - Math.exp(hi)) / (V - 1));
  return Array.from({ length: V }, (_, v) => (v === tok ? hi : lo));
}
/** an utterance: each entry is a token id said for 3 frames, then 2 blank frames between words */
function audioFor(spoken: number[][]): { lp: Float32Array; T: number } {
  const rows: number[][] = [frame(BLANK)];
  for (const w of spoken) {
    for (const tok of w) for (let k = 0; k < 3; k++) rows.push(frame(tok));
    rows.push(frame(BLANK), frame(BLANK));
  }
  const lp = new Float32Array(rows.length * V);
  rows.forEach((r, i) => lp.set(r, i * V));
  return { lp, T: rows.length };
}
const W = [[1, 2], [3, 4], [5, 6], [7, 8]];

describe("live prefix scoring → mistake detection", () => {
  it("all words said: every word scores well and nothing is flagged", () => {
    const { lp, T } = audioFor(W);
    const r = scorePrefix(lp, T, V, W, BLANK, 0.08)!;
    expect(r.lastGood).toBe(3);
    r.scores.forEach((s) => expect(s.mean!).toBeGreaterThan(-1));
    const t = new LiveMistakeTracker();
    expect(t.update(0, r.scores, r.lastGood)).toEqual([]);
    expect(t.update(0, r.scores, r.lastGood)).toEqual([]);
  });

  it("word 1 skipped: it scores bad, later words score well, and it is flagged on the 2nd step", () => {
    const { lp, T } = audioFor([W[0], W[2], W[3]]);
    const r = scorePrefix(lp, T, V, W, BLANK, 0.08)!;
    expect(r.lastGood).toBe(3);
    expect(r.scores[1].mean!).toBeLessThan(-3);
    expect(r.scores[0].mean!).toBeGreaterThan(-1);
    expect(r.scores[2].mean!).toBeGreaterThan(-1);
    const t = new LiveMistakeTracker();
    expect(t.update(0, r.scores, r.lastGood)).toEqual([]);
    expect(t.update(0, r.scores, r.lastGood)).toEqual([1]);
  });

  it("word 1 replaced by a different word: flagged too", () => {
    const { lp, T } = audioFor([W[0], [9, 10], W[2], W[3]]);
    const r = scorePrefix(lp, T, V, W, BLANK, 0.08)!;
    expect(r.scores[1].mean!).toBeLessThan(-3);
    const t = new LiveMistakeTracker({ confirmSteps: 1 });
    expect(t.update(0, r.scores, r.lastGood)).toEqual([1]);
  });

  it("student is still on word 1 (words 2-3 not said yet): nothing is flagged", () => {
    const { lp, T } = audioFor([W[0], W[1]]);
    const r = scorePrefix(lp, T, V, W, BLANK, 0.08)!;
    expect(r.lastGood).toBe(1);
    const t = new LiveMistakeTracker({ confirmSteps: 1 });
    expect(t.update(0, r.scores, r.lastGood)).toEqual([]);
  });
});
