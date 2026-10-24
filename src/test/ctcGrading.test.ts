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
  it("an unsure word is green when the model wrote the same letters, yellow when it wrote something else", () => {
    const w = gradeFromCtc(["إِلَيْكُمْ", "بَعْدِى"], [sc(-2), sc(-2)], ["إِلَيْكُم", "بَعْد"]);
    expect(w.map((x) => x.grade)).toEqual(["ok", "close"]);
  });
  it("final yaa dropped before hamzat al-wasl is accepted (بَعْدِى ٱسْمُهُ)", () => {
    const w = gradeFromCtc(["بَعْدِى", "ٱسْمُهُۥٓ"], [sc(-2), sc(0)], ["بَعْدِ", "اسمه"]);
    expect(w[0].grade).toBe("ok");
    expect(gradeFromCtc(["بَعْدِى", "أَحْمَدُ"], [sc(-2), sc(0)], ["بَعْد", "احمد"])[0].grade).toBe("close");
  });
  it("final ا / و / ى before ٱ or ال is accepted as dropped (إِذَا ٱلسَّمَآءُ, ذُو ٱلْ, عَلَى ٱلْ, أَيُّهَا ٱلنَّاسُ)", () => {
    const g = (a: string, b: string, h: string) => gradeFromCtc([a, b], [sc(-2), sc(0)], [h, "x"])[0].grade;
    expect(g("إِذَا", "ٱلسَّمَآءُ", "إِذَ")).toBe("ok");
    expect(g("ذُو", "ٱلْعَرْشِ", "ذُ")).toBe("ok");
    expect(g("عَلَىٰ", "ٱلْأَرْضِ", "عَلَ")).toBe("ok");
    expect(g("أَيُّهَا", "ٱلنَّاسُ", "أَيُّهَ")).toBe("ok");
    expect(g("إِذَا", "جَآءَ", "إِذَ")).toBe("close");          // no wasl after it → the alef must be heard
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
