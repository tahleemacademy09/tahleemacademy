import { describe, it, expect } from "vitest";
import { buildQcfPlan } from "./qcfPlan";
import type { GlyphLine, GlyphWord } from "@/components/quran/mushafGlyphs";

const w = (ayah: number, pos: number, text: string, kind: GlyphWord["kind"] = "word"): GlyphWord =>
  ({ surah: 4, ayah, code: "x", isAyahEnd: kind === "end", kind, pos, text });
const line = (n: number, words: GlyphWord[]): GlyphLine => ({ lineNumber: n, type: "text", words, endsSurah: false, surah: 4 });

describe("buildQcfPlan", () => {
  const page: GlyphLine[] = [
    { lineNumber: 1, type: "surah-header", words: [], endsSurah: false, surah: 4 },
    { lineNumber: 2, type: "basmalah", words: [], endsSurah: false, surah: 4 },
    line(3, [w(1, 1, "يَـٰٓأَيُّهَا"), w(1, 2, "ٱلنَّاسُ"), w(1, 3, "ٱتَّقُوا۟")]),
    line(4, [w(1, 4, "رَبَّكُمُ"), w(1, 0, "١", "end"), w(2, 1, "وَءَاتُوا۟"), w(2, 2, "ٱلْيَتَـٰمَىٰٓ"), w(2, 0, "٢", "end"), w(3, 1, "وَإِنْ")]),
  ];
  it("grades only the selected verses, in reading order, and places the end signs", () => {
    const p = buildQcfPlan([page], 4, 1, 2);
    expect(p.words.map((x) => x.ayah)).toEqual([1, 1, 1, 1, 2, 2]);
    expect(p.idx.get("0:2:0")).toBe(0);
    expect(p.idx.get("0:3:2")).toBe(4);              // وَءَاتُوا۟ is the 5th graded word (index 4)
    expect(p.endAfter.get("0:3:1")).toBe(3);         // sign of ayah 1 appears with its last word (رَبَّكُمُ)
    expect(p.endAfter.get("0:3:4")).toBe(5);
    expect(p.idx.has("0:3:5")).toBe(false);          // ayah 3 is outside the range
    expect(p.needPrev).toBe(false);
    expect(p.needNext).toBe(false);
  });
  it("asks for a neighbouring page when the range runs past the loaded pages", () => {
    const p = buildQcfPlan([page], 4, 1, 3);
    expect(p.needNext).toBe(true);                   // ayah 3's end sign is not on this page
    const cont: GlyphLine[] = [line(3, [w(2, 5, "أَمْوَٰلَهُمْ"), w(2, 0, "٢", "end")])];   // a page that only holds the tail of ayah 2
    expect(buildQcfPlan([cont], 4, 2, 2).needPrev).toBe(true);
  });
});
