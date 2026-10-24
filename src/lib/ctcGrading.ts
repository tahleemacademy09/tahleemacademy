/*
  ctcGrading.ts — CTC-ONLY test mode. With Tarteel removed there is no transcript to align, so the CTC verdicts
  ARE the grading. This turns them into the same WordResult / AyahScoring objects the page, the word grid and the
  staff screens already use, and lets alignAyahs() hand them out instead of aligning a transcript.

  A fake "transcript" (the CTC greedy text + an invisible marker) is the key that ties a recording to its grading,
  so every existing place that passes `transcript` around keeps working unchanged.
*/
import { refTokens, scoreOf, encodeGrades, decodeGrades, type WordResult, type AyahScoring } from "./recitationCompare";
import { ctcStatus, dropMaddBeforeWasl, modelForm, stripMarks, uthmaniToModelSpelling, waslFollows, type CtcWordScore } from "./ctcAlign";

const LS_KEY = "ctc_grading_last";
let cur: { tx: string; words: WordResult[] } | null = null;
let counter = 0;

/** letters only: no marks, alef/yaa variants folded, no spaces */
const skeleton = (x: string) => stripMarks(x).replace(/\u0649/g, "\u064A").replace(/\s+/g, "");

/** Is what the model wrote for this word the same letters as the page word (under any spelling the model may use)? */
function heardMatches(word: string, heard: string | undefined, nextWord?: string): boolean {
  if (!heard || !heard.trim()) return false;
  const h = skeleton(heard);
  if (!h) return false;
  const voc = /^\u064A\u064E\u0640?\u0670\u0653?/.exec(word);
  const variants = [
    modelForm(word), modelForm(word, false),
    modelForm(uthmaniToModelSpelling(word)), modelForm(uthmaniToModelSpelling(word), false),
    // final ي / ا / و / ى is not pronounced before a hamzat al-wasl (بَعْدِى ٱسْمُهُ → بعدِ, عَلَى ٱلْ → عَلَ)
    ...(waslFollows(nextWord) ? [modelForm(dropMaddBeforeWasl(modelForm(uthmaniToModelSpelling(word))))] : []),
    ...(voc ? [modelForm("يَا") + modelForm(uthmaniToModelSpelling(word.slice(voc[0].length)))] : []),
  ];
  return variants.some((v) => skeleton(v) === h);
}

/**
 * heard (≥ -1.0) green · unsure (-3 … -1) yellow, half credit · not heard (< -3) red "missed".
 * An "unsure" or "not heard" word whose written letters are exactly what the model wrote in its time span is green:
 * a low confidence number alone (fast or soft recitation, a different spelling) is not a mistake.
 * Yellow stays for words where the model wrote something different.
 */
export function gradeFromCtc(refWords: string[], scores: CtcWordScore[], heard?: string[]): WordResult[] {
  return refWords.map((word, i) => {
    const st = ctcStatus(scores[i]?.mean ?? null);
    // the model wrote exactly this word's letters in this word's time span → it was said, whatever the confidence number says
    const said = (st === "unsure" || st === "bad") && heardMatches(word, heard?.[i], refWords[i + 1]);
    if (!said && st === "unsure") return { word, status: "missing" as const, grade: "close" as const, credit: 0.5 };
    if (!said && st === "bad") return { word, status: "missing" as const, grade: "missed" as const, credit: 0 };
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
