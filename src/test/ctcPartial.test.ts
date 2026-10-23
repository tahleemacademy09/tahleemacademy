import { describe, it, expect } from "vitest";
import { scoreWordsPartial } from "@/lib/ctcAlign";

const V = 12, blank = 11;
const words = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]];
const row = (tok: number | null, conf = 0.92) => { const p = new Array(V).fill((1 - conf) / (V - 1)); p[tok === null ? blank : tok] = conf; return p.map(Math.log); };
function build(said: number) {
  const rows: number[][] = [row(null), row(null)];
  words.slice(0, said).forEach((w) => { w.forEach((t) => rows.push(row(t), row(null))); rows.push(row(null)); });
  const lp = new Float32Array(rows.length * V); rows.forEach((r, i) => lp.set(r, i * V));
  return { lp, T: rows.length };
}

describe("partial recitation (audio shorter than the text)", () => {
  it("grades the recited words and marks the rest not heard", () => {
    const { lp, T } = build(2);                       // 2 of 5 words said, T < total tokens + repeats
    const r = scoreWordsPartial(lp, T, V, words, blank, 0.08)!;
    expect(r.scores).toHaveLength(5);
    expect(r.covered).toBe(2);
    expect(r.scores[0].mean!).toBeGreaterThan(-1);
    expect(r.scores[1].mean!).toBeGreaterThan(-1);
    for (const i of [2, 3, 4]) expect(r.scores[i].mean!).toBeLessThan(-3);
  });
  it("never needs more words than frames", () => {
    const { lp, T } = build(1);
    const r = scoreWordsPartial(lp, T, V, words, blank, 0.08)!;
    expect(r.scores).toHaveLength(5);
  });
});
