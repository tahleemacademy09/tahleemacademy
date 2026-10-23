/*
  ctcGrading.ts — CTC-ONLY test mode. With Tarteel removed there is no transcript to align, so the CTC verdicts
  ARE the grading. This turns them into the same WordResult / AyahScoring objects the page, the word grid and the
  staff screens already use, and lets alignAyahs() hand them out instead of aligning a transcript.

  A fake "transcript" (the CTC greedy text + an invisible marker) is the key that ties a recording to its grading,
  so every existing place that passes `transcript` around keeps working unchanged.
*/
import { refTokens, scoreOf, encodeGrades, decodeGrades, type WordResult, type AyahScoring } from "./recitationCompare";
import { ctcStatus, type CtcWordScore } from "./ctcAlign";

const LS_KEY = "ctc_grading_last";
let cur: { tx: string; words: WordResult[] } | null = null;
let counter = 0;

/** heard (≥ -1.0) green · unsure (-3 … -1) yellow, half credit · not heard (< -3) red "missed" */
export function gradeFromCtc(refWords: string[], scores: CtcWordScore[]): WordResult[] {
  return refWords.map((word, i) => {
    const st = ctcStatus(scores[i]?.mean ?? null);
    if (st === "unsure") return { word, status: "missing" as const, grade: "close" as const, credit: 0.5 };
    if (st === "bad") return { word, status: "missing" as const, grade: "missed" as const, credit: 0 };
    return { word, status: "correct" as const, grade: "ok" as const, credit: 1 };   // heard (or nothing to judge)
  });
}

/** Remember a grading and return the key-"transcript" for it. */
export function registerCtcGrading(greedy: string, words: WordResult[]): string {
  counter++;
  const marker = "\u200B" + counter.toString(2).replace(/0/g, "\u200C").replace(/1/g, "\u200D");
  const tx = (greedy || "").trim() + marker;
  cur = { tx, words };
  try { localStorage.setItem(LS_KEY, JSON.stringify({ tx, grades: encodeGrades(words) })); } catch { /* noop */ }
  return tx;
}

function lookup(tx: string, refWords: string[]): WordResult[] | null {
  if (!tx || !tx.includes("\u200B")) return null;
  if (cur && cur.tx === tx) return cur.words.length === refWords.length ? cur.words : null;
  try {   // page was reloaded: rebuild from the saved grades
    const s = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (s && s.tx === tx) {
      const w = decodeGrades(refWords, s.grades);
      if (w) { cur = { tx, words: w }; return w; }
    }
  } catch { /* noop */ }
  return null;
}

export function ctcScoringFor(tx: string, ayahTexts: string[]): AyahScoring | null {
  const counts = ayahTexts.map((t) => refTokens(t).length);
  const refWords = refTokens(ayahTexts.join(" "));
  const words = lookup(tx, refWords);
  if (!words) return null;
  const perAyah: AyahScoring["perAyah"] = [];
  let at = 0;
  for (const n of counts) {
    const slice = words.slice(at, at + n);
    at += n;
    perAyah.push({ words: slice, total: slice.length, correct: slice.filter((w) => w.status === "correct").length });
  }
  return { words, extras: [], perAyah, score: scoreOf(words) };
}

export function ctcAnalysisFor(tx: string, refText: string): { words: WordResult[]; extras: string[] } | null {
  const words = lookup(tx, refTokens(refText));
  return words ? { words, extras: [] } : null;
}
