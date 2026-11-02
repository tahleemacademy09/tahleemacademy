import { describe, it, expect } from "vitest";
import { mergeCtcTarteel } from "./ctcTarteelMerge";
import type { WordResult } from "./recitationCompare";

const W = (word: string, grade: WordResult["grade"]): WordResult => ({
  word, grade, status: grade === "ok" ? "correct" : "missing", credit: grade === "ok" ? 1 : grade === "close" ? 0.5 : 0,
});

describe("mergeCtcTarteel", () => {
  it("keeps CTC greens even if Tarteel missed them", () => {
    const r = mergeCtcTarteel([W("قَالَ", "ok")], [-0.1], [W("قَالَ", "missed")]);
    expect(r.words[0].grade).toBe("ok");
  });
  it("rescues a short red word Tarteel heard", () => {
    const r = mergeCtcTarteel([W("مِن", "missed")], [-9], [W("مِن", "ok")]);
    expect(r.words[0].grade).toBe("ok");
    expect(r.stats.byShort).toBe(1);
  });
  it("long red word: green only with CTC evidence, else amber", () => {
    const a = mergeCtcTarteel([W("لِنُرْسِلَ", "missed")], [-4], [W("لِنُرْسِلَ", "ok")]);
    expect(a.words[0].grade).toBe("ok");
    const b = mergeCtcTarteel([W("لِنُرْسِلَ", "missed")], [-12], [W("لِنُرْسِلَ", "ok")]);
    expect(b.words[0].grade).toBe("close");
  });
  it("neither accepts → stays red; yellow + Tarteel ok → green", () => {
    expect(mergeCtcTarteel([W("مِن", "missed")], [-9], [W("مِن", "missed")]).words[0].grade).toBe("missed");
    expect(mergeCtcTarteel([W("لِنُرْسِلَ", "close")], [-2], [W("لِنُرْسِلَ", "ok")]).words[0].grade).toBe("ok");
  });
  it("length mismatch returns CTC untouched", () => {
    const c = [W("مِن", "missed")];
    expect(mergeCtcTarteel(c, [-9], []).words).toBe(c);
  });
});
