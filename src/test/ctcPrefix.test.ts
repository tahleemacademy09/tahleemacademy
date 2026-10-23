import { describe, it, expect } from "vitest";
import { scorePrefix } from "@/lib/ctcAlign";
import { revealFor } from "@/lib/ctcLive";

const V = 12, blank = 11;
const words = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]];
const row = (tok: number | null, conf = 0.92) => { const p = new Array(V).fill((1 - conf) / (V - 1)); p[tok === null ? blank : tok] = conf; return p.map(Math.log); };
function build(said: number, tail = 4, partialLast = false, skip = -1) {
  const rows: number[][] = [row(null), row(null), row(null)];
  words.slice(0, said).forEach((w, wi) => {
    if (wi !== skip) w.forEach((t, ti) => { if (!(partialLast && wi === said - 1 && ti === w.length - 1)) rows.push(row(t), row(t), row(null)); });
    rows.push(row(null), row(null), row(null));
  });
  for (let k = 0; k < tail; k++) rows.push(row(null));
  const lp = new Float32Array(rows.length * V); rows.forEach((r, i) => lp.set(r, i * V));
  return { lp, T: rows.length };
}

describe("live prefix scoring", () => {
  it("reveals exactly the words said so far", () => {
    for (const n of [0, 1, 2, 3, 5]) { const { lp, T } = build(n); expect(scorePrefix(lp, T, V, words, blank, 0.08)!.lastGood).toBe(n - 1); }
  });
  it("does not reveal a word that is only half said", () => {
    const { lp, T } = build(3, 4, true); expect(scorePrefix(lp, T, V, words, blank, 0.08)!.lastGood).toBe(1);
  });
  it("keeps going past a skipped word", () => {
    const { lp, T } = build(3, 4, false, 1); expect(scorePrefix(lp, T, V, words, blank, 0.08)!.lastGood).toBe(2);
  });
  it("silence reveals nothing", () => {
    const { lp, T } = build(0, 40); expect(scorePrefix(lp, T, V, words, blank, 0.08)!.lastGood).toBe(-1);
  });
});

describe("revealFor", () => {
  const ay = [
    { text: "الْحَمْدُ لِلَّهِ رَبِّ", numberInSurah: 2, surah: { number: 1 } },
    { text: "الرَّحْمَٰنِ الرَّحِيمِ", numberInSurah: 3, surah: { number: 1 } },
  ];
  it("spreads shown words over ayahs in order", () => {
    const r = revealFor(ay, 4);
    expect(r["1:2"].m).toBe(3); expect(r["1:2"].n).toBe(3); expect(r["1:2"].f).toBeCloseTo(1);
    expect(r["1:3"].m).toBe(1); expect(r["1:3"].n).toBe(2);
    expect(Object.keys(revealFor(ay, 0))).toHaveLength(0);
  });
});
