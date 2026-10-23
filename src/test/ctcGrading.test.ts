import { describe, it, expect } from "vitest";
import { gradeFromCtc, registerCtcGrading, ctcScoringFor, ctcAnalysisFor } from "@/lib/ctcGrading";

const ayahs = ["قُلْ هُوَ ٱللَّهُ أَحَدٌ", "ٱللَّهُ ٱلصَّمَدُ"];
const refWords = ayahs.join(" ").split(" ");
const sc = (m: number | null) => ({ mean: m, min: m, start: 0, end: 1 });

describe("CTC-only grading", () => {
  it("maps heard / unsure / not heard to green / yellow / red", () => {
    const w = gradeFromCtc(["a", "b", "c", "d"], [sc(0), sc(-2), sc(-6), sc(null)]);
    expect(w.map((x) => x.grade)).toEqual(["ok", "close", "missed", "ok"]);
  });
  it("hands the verdicts out by key, sliced per ayah, with the right score", () => {
    const words = gradeFromCtc(refWords, [sc(0), sc(0), sc(-8), sc(0), sc(0), sc(0)]);   // word 3 skipped
    const tx = registerCtcGrading("قل هو احد", words);
    const r = ctcScoringFor(tx, ayahs)!;
    expect(r.words.length).toBe(6);
    expect(r.perAyah.map((a) => a.total)).toEqual([4, 2]);
    expect(r.perAyah[0].correct).toBe(3);
    expect(r.score).toBe(83);
    expect(ctcAnalysisFor(tx, ayahs.join(" "))!.words[2].grade).toBe("missed");
  });
  it("does not answer for an unknown transcript or a different text", () => {
    const tx = registerCtcGrading("x", gradeFromCtc(refWords, refWords.map(() => sc(0))));
    expect(ctcScoringFor("other text", ayahs)).toBeNull();
    expect(ctcScoringFor(tx, ["كلمة واحدة"])).toBeNull();
  });
});
