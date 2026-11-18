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
});
