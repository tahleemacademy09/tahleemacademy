import { describe, it, expect } from "vitest";
import { ayahDone, buildWords, feed, initialState, manualReveal, stripCumulative, summarize, tokenize } from "./revealEngine";

const AYAHS = [
  { n: 1, text: "قُلْ هُوَ ٱللَّهُ أَحَدٌ" },
  { n: 2, text: "ٱللَّهُ ٱلصَّمَدُ" },
  { n: 3, text: "لَمْ يَلِدْ وَلَمْ يُولَدْ" },
  { n: 4, text: "وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ" },
];
const W = buildWords(AYAHS);
const run = (text: string, final = true) => feed(W, initialState(W.length), tokenize(text), final);

describe("revealEngine", () => {
  it("reveals a full correct recitation (plain ASR spelling vs Uthmani)", () => {
    const s = run("قل هو الله احد الله الصمد لم يلد ولم يولد ولم يكن له كفوا احد");
    expect(summarize(s).ok).toBe(W.length);
    expect(summarize(s).done).toBe(true);
  });
  it("marks a skipped word and resyncs", () => {
    expect(run("قل هو احد الله الصمد").status.slice(0, 5)).toEqual(["ok", "ok", "missed", "ok", "ok"]);
  });
  it("noise never advances the cursor", () => {
    expect(run("قل بلا بلا هو").cursor).toBe(2);
  });
  it("ignores a repeated word", () => {
    expect(run("قل قل هو هو الله").cursor).toBe(3);
  });
  it("re-joins a split word", () => {
    expect(run("قل هو الله احد الله الصمد لم يلد و لم يولد").cursor).toBe(10);
  });
  it("interim tokens reveal but never flag", () => {
    const s = run("قل xyz abc", false);
    expect(s.cursor).toBe(1);
    expect(s.status).not.toContain("wrong");
  });
  it("ayah-by-ayah visibility", () => {
    expect(ayahDone(W, run("قل هو الله احد"), 1)).toBe(true);
    expect(ayahDone(W, run("قل هو"), 1)).toBe(false);
  });
  it("manual reveal by ayah", () => {
    expect(summarize(manualReveal(W, initialState(W.length), true)).ok).toBe(4);
  });
  it("strips cumulative results", () => {
    expect(stripCumulative(["قل", "هو"], ["قل", "هو", "الله"])).toEqual(["الله"]);
    expect(stripCumulative(["الله"], ["الله", "الصمد"])).toEqual(["الله", "الصمد"]);
  });

  describe("strict mode", () => {
    const strict = (text: string, final = true) => feed(W, initialState(W.length), tokenize(text), final, true);
    it("does not move past a skipped word", () => {
      const s = strict("قل هو احد");
      expect(s.cursor).toBe(2);
      expect(s.blocked).toBe(true);
      expect(s.errors).toBe(1);
    });
    it("does not move past a wrong word", () => {
      const s = strict("قل هو بلا");
      expect(s.cursor).toBe(2);
      expect(s.blocked).toBe(true);
    });
    it("counts one error per mistake and continues once corrected", () => {
      const s = strict("قل هو احد بلا الله احد الله");
      expect(s.errors).toBe(1);
      expect(s.status[2]).toBe("close");
      expect(s.fixed[2]).toBe(true);
      expect(s.cursor).toBe(5);
    });
    it("allows restarting the phrase after a mistake", () => {
      expect(strict("قل هو احد قل هو الله").cursor).toBe(3);
    });
    it("ignores the app's own spoken correction word", () => {
      expect(strict("قل خطأ هو").cursor).toBe(2);
    });
  });

  describe("optional opening (isti'adha / Bismillah)", () => {
    const AY = [{ n: 1, text: "يَـٰٓأَيُّهَا ٱلنَّاسُ ٱتَّقُوا۟ رَبَّكُمُ" }, { n: 2, text: "وَءَاتُوا۟ ٱلْيَتَـٰمَىٰٓ أَمْوَٰلَهُمْ" }];
    const WN = buildWords(AY);
    const go = (text: string, strict = false) => feed(WN, initialState(WN.length), tokenize(text), true, strict);
    it("starts straight at the verse", () => {
      const s = go("يا ايها الناس اتقوا ربكم", true);
      expect(s.cursor).toBe(4);
      expect(s.errors).toBe(0);
    });
    it("accepts the Bismillah first without any mistake", () => {
      const s = go("بسم الله الرحمن الرحيم يا ايها الناس اتقوا ربكم", true);
      expect(s.cursor).toBe(4);
      expect(s.errors).toBe(0);
      expect(s.status.slice(1, 4)).toEqual(["ok", "ok", "ok"]);
    });
    it("accepts the isti'adha + Bismillah first", () => {
      const s = go("اعوذ بالله من الشيطان الرجيم بسم الله الرحمن الرحيم يا ايها الناس", true);
      expect(s.cursor).toBe(2);
      expect(s.errors).toBe(0);
    });
    it("does not accept the Bismillah once the verse has started", () => {
      const s = go("يا ايها بسم الله", true);
      expect(s.cursor).toBe(1);
      expect(s.blocked).toBe(true);
    });
  });
});

describe("Bismillah between two surahs on one page", () => {
  const B = [{ n: 1, text: "قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ" }, { n: 2, text: "مَلِكِ ٱلنَّاسِ" }];
  const WS = [
    ...buildWords([{ n: 5, text: "مِنَ ٱلْجِنَّةِ وَٱلنَّاسِ" }]).map((w) => ({ ...w, surah: 114 - 1 })),
    ...buildWords(B).map((w) => ({ ...w, surah: 114 })),
  ];
  const strict = (text: string) => feed(WS, initialState(WS.length), tokenize(text), true, true);
  const upTo = 3;   // the 3 words of the previous surah
  it("reading the Bismillah before the new surah is not a mistake", () => {
    const s = strict("من الجنه والناس بسم الله الرحمن الرحيم قل اعوذ برب الناس");
    expect(s.errors).toBe(0);
    expect(s.blocked).toBe(false);
    expect(s.cursor).toBe(WS.length - 2);
  });
  it("going straight into the new surah is also fine", () => {
    const s = strict("من الجنه والناس قل اعوذ برب الناس ملك الناس");
    expect(s.errors).toBe(0);
    expect(summarize(s).done).toBe(true);
  });
  it("a glued Bismillah is accepted", () => {
    const s = strict("من الجنه والناس بسم الله الرحمن الرحيم قل");
    expect(s.cursor).toBe(upTo + 1);
    const g = strict("من الجنه والناس بسمالله الرحمنالرحيم قل");
    expect(g.errors).toBe(0);
    expect(g.cursor).toBe(upTo + 1);
  });
  it("a surah starting with a Bismillah word (الرحمن) does not swallow the Bismillah's word", () => {
    const R = [
      ...buildWords([{ n: 7, text: "وَٱلسَّمَآءَ رَفَعَهَا" }]).map((w) => ({ ...w, surah: 54 })),
      ...buildWords([{ n: 1, text: "ٱلرَّحْمَٰنُ" }, { n: 2, text: "عَلَّمَ ٱلْقُرْءَانَ" }]).map((w) => ({ ...w, surah: 55 })),
    ];
    const s = feed(R, initialState(R.length), tokenize("والسماء رفعها بسم الله الرحمن الرحيم الرحمن علم القران"), true, true);
    expect(s.errors).toBe(0);
    expect(summarize(s).done).toBe(true);
  });
  it("without a Bismillah being read, a wrong word is still caught at the boundary", () => {
    const s = strict("من الجنه والناس بلا");
    expect(s.blocked).toBe(true);
  });
});
