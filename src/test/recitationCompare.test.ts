import { describe, it, expect } from "vitest";
import { analyzeRecitation, finalYaKind, soundKey } from "@/lib/recitationCompare";

const grades = (ref: string, got: string) => analyzeRecitation(ref, got).words.map((w) => w.grade);

describe("final ى — ya vs alef maqsura", () => {
  it("reads the vowel", () => {
    for (const w of ["فِى", "تَجْرِى", "يَهْدِى", "ٱلَّذِى", "إِنِّىٓ", "بَنِىٓ", "يَدَىَّ"]) expect(finalYaKind(w)).toBe("ya");
    for (const w of ["عَلَىٰ", "عَلَى", "هُدًى", "ٱفْتَرَىٰ", "يُدْعَىٰٓ"]) expect(finalYaKind(w)).toBe("alef");
  });
  it("Uthmani ى on both sides is green (Tarteel output)", () => {
    const ref = "وَٱللَّهُ لَا يَهْدِى ٱلْقَوْمَ ٱلَّذِى تَجْرِى مِن تَحْتِهَا فِى جَنَّٰتٍ";
    expect(grades(ref, ref).every((g) => g === "ok")).toBe(true);
  });
  it("plain ي from Whisper is green too", () => {
    const ref = "وَٱللَّهُ لَا يَهْدِى ٱلْقَوْمَ ٱلَّذِى تَجْرِى مِن تَحْتِهَا فِى جَنَّٰتٍ";
    expect(grades(ref, "والله لا يهدي القوم الذي تجري من تحتها في جنات").every((g) => g === "ok")).toBe(true);
  });
  it("على written علي still matches", () => {
    expect(grades("عَلَىٰ ٱللَّهِ", "علي الله")).toEqual(["ok", "ok"]);
  });
});

describe("joined / near words", () => {
  it("يا بني = يَـٰبَنِىٓ even when بني also occurs on its own", () => {
    const ref = "يَـٰبَنِىٓ إِسْرَٰٓءِيلَ مِنۢ بَنِىٓ إِسْرَٰٓءِيلَ";
    expect(grades(ref, "يا بني إسرائيل من بني إسرائيل").every((g) => g === "ok")).toBe(true);
  });
  it("a dropped و or tanween alef is yellow, not red", () => {
    expect(grades("وَبَشِّرِ ٱلْمُؤْمِنِينَ", "بشر المؤمنين")).toEqual(["close", "ok"]);
    expect(grades("ٱلْكَذِبَ", "كذبا")).toEqual(["close"]);
  });
  it("different words stay wrong", () => {
    expect(grades("ٱلْحَمْدُ", "الحياة")).toEqual(["wrong"]);
    expect(soundKey("ٱلرَّحْمَٰنِ", true)).not.toBe(soundKey("ٱلرَّحِيمِ", true));
  });
});
