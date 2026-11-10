import { describe, it, expect } from "vitest";
import { buildExpected, checkRecitation, normalizeWord, wordsFromText } from "./quranCheck";

const EXP = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";
const H = (...ws: string[]) => ws.map((word, i) => ({ word, start: i * 0.5, end: i * 0.5 + 0.4 }));
const st = (r: ReturnType<typeof checkRecitation>) => r.words.map((w) => w.status);

describe("checkRecitation", () => {
  it("accepts a correct recitation (Uthmani expected vs plain ASR spelling)", () => {
    const r = checkRecitation(EXP, H("بسم", "الله", "الرحمن", "الرحيم"));
    expect(st(r)).toEqual(["ok", "ok", "ok", "ok"]);
    expect(r.score).toBe(1);
  });
  it("flags a skipped word", () => {
    expect(st(checkRecitation(EXP, H("بسم", "الله", "الرحيم")))).toEqual(["ok", "ok", "missed", "ok"]);
  });
  it("flags a wrong word", () => {
    const s = st(checkRecitation(EXP, H("بسم", "الله", "العليم", "الرحيم")));
    expect(s[2]).toBe("wrong");
    expect(s[3]).toBe("ok");
  });
  it("flags an extra word", () => {
    const s = st(checkRecitation(EXP, H("بسم", "الله", "الله", "الرحمن", "الرحيم")));
    expect(s.filter((x) => x === "extra").length).toBe(1);
    expect(s.filter((x) => x === "ok").length).toBe(4);
  });
  it("tolerates Uthmani vs standard spelling (الصلوة / الصلاة)", () => {
    expect(st(checkRecitation("ٱلصَّلَوٰةَ", H("الصلاة")))[0]).toBe("ok");
  });
  it("handles silence", () => {
    const r = checkRecitation(EXP, []);
    expect(st(r)).toEqual(["missed", "missed", "missed", "missed"]);
    expect(r.score).toBe(0);
  });
  it("works from plain text without timestamps", () => {
    expect(checkRecitation(EXP, wordsFromText("بسم الله الرحمن الرحيم")).score).toBe(1);
  });
});

describe("helpers", () => {
  it("normalises marks and letter variants", () => {
    expect(normalizeWord("ٱلرَّحْمَٰنِ")).toBe("الرحمن");
  });
  it("builds expected text with optional bismillah", () => {
    const ayahs = [{ n: 1, text: "الم" }, { n: 2, text: "ذلك الكتاب" }];
    expect(buildExpected(ayahs, 1, 2)).toBe("الم ذلك الكتاب");
    expect(buildExpected(ayahs, 2, 2, true).endsWith("ذلك الكتاب")).toBe(true);
  });
});

describe("weak audio / elongation / huruf muqatta'at", () => {
  it("ءَايَـٰتٌ = آيات (hamza + long alef written differently)", () => {
    expect(st(checkRecitation("ءَايَـٰتٌ", H("آيات")))).toEqual(["ok"]);
  });
  it("a missing or extra medial alef is the same word", () => {
    expect(st(checkRecitation("ٱلْكِتَـٰبَ مُحْكَمَـٰتٌ", H("الكتب", "محكمات")))).toEqual(["ok", "ok"]);
    expect(st(checkRecitation("قَالَ", H("قل")))).toEqual(["ok"]);
  });
  it("final ى: هُدًى = هدى / هدا / هدي", () => {
    for (const h of ["هدى", "هدا", "هدي"]) expect(st(checkRecitation("هُدًى", H(h)))).toEqual(["ok"]);
  });
  it("a mis-heard word between two correct words is yellow, a different word stays red", () => {
    const ref = "مِن قَبْلُ هُدًى لِّلنَّاسِ";
    expect(st(checkRecitation(ref, H("من", "قبل", "هلا", "للناس")))).toEqual(["ok", "ok", "check", "ok"]);
    expect(st(checkRecitation("بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ", H("بسم", "الله", "العليم", "الرحيم")))[2]).toBe("wrong");
  });
  it("opening letters, any spelling", () => {
    const ref = "الٓمٓ ٱللَّهُ لَآ إِلَٰهَ";
    for (const h of ["الم الله لا إله", "ألم الله لا إله", "ا ل م الله لا إله", "الف لام ميم الله لا إله", "الفلاميم الله لا إله"]) {
      const r = checkRecitation(ref, wordsFromText(h));
      expect(st(r)).toEqual(["ok", "ok", "ok", "ok"]);
    }
  });
  it("opening letters not written at all → yellow (listen again), never a hard miss", () => {
    const r = checkRecitation("الٓمٓ ٱللَّهُ لَآ إِلَٰهَ", wordsFromText("الله لا إله"));
    expect(st(r)).toEqual(["check", "ok", "ok", "ok"]);
    expect(r.words[0].note).toBe("muqattaat");
  });
  it("أَلَمْ (did you not) is NOT treated as opening letters", () => {
    expect(st(checkRecitation("أَلَمْ تَرَ", wordsFromText("تر")))[0]).toBe("missed");
  });
});
