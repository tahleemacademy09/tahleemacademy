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
    const r = scoreWordsPartial(lp, T, V, [words], blank, 0.08)!;
    expect(r.scores).toHaveLength(5);
    expect(r.covered).toBe(2);
    expect(r.scores[0].mean!).toBeGreaterThan(-1);
    expect(r.scores[1].mean!).toBeGreaterThan(-1);
    for (const i of [2, 3, 4]) expect(r.scores[i].mean!).toBeLessThan(-3);
  });
  it("never needs more words than frames", () => {
    const { lp, T } = build(1);
    const r = scoreWordsPartial(lp, T, V, [words], blank, 0.08)!;
    expect(r.scores).toHaveLength(5);
  });
});

import { greedySpan, quietCutPoint, SR } from "@/lib/ctcAlign";

describe("heard text per word + quiet chunk cut", () => {
  it("reads only the frames of one word", () => {
    const V2 = 5, vocab: any = { pieces: ["▁ab", "c", "▁de", "f"], blank: 4 };
    const seq = [4, 0, 0, 1, 4, 2, 3, 4];
    const lp = new Float32Array(seq.length * V2).fill(-9); seq.forEach((k, t) => { lp[t * V2 + k] = -0.01; });
    expect(greedySpan(lp, seq.length, V2, vocab, 0, 5)).toBe("abc");
    expect(greedySpan(lp, seq.length, V2, vocab, 5, 8)).toBe("def");
    expect(greedySpan(lp, seq.length, V2, vocab, 7, 8)).toBe("");
  });
  it("cuts a chunk at the pause", () => {
    const a = new Float32Array(SR * 30); for (let i = 0; i < a.length; i++) a[i] = Math.sin(i * 0.05) * 0.3;
    for (let i = Math.round(21.3 * SR); i < Math.round(21.6 * SR); i++) a[i] = 0;
    const cut = quietCutPoint(a, a.length, 20, 4) / SR;
    expect(cut).toBeGreaterThan(21.2); expect(cut).toBeLessThan(21.6);
  });
});
