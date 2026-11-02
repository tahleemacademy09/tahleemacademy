/*
  ctcTarteelMerge.ts — let Tarteel (transcript-based) and CTC (per-word audio check) aid each other.
  The CTC result is shown instantly; Tarteel then re-checks the same recording in the background and this module
  UPGRADES words CTC marked yellow/red when Tarteel heard them. Greens are never downgraded and a word that neither
  engine accepts stays red, so an unrecited word cannot slip through.
*/
import { stripMarks } from "./ctcAlign";
import type { WordResult } from "./recitationCompare";

export interface MergeStats { rescued: number; softened: number; byShort: number; byEvidence: number }

const SHORT_LETTERS = 3;      // words this short are the ones Tarteel drops/garbles and CTC under-scores
const EVIDENCE_MEAN = -6;     // long word: CTC mean above this counts as "some evidence" it was said

const letters = (w: string) => stripMarks(w).replace(/\s+/g, "").length;

/**
 * @param ctc      CTC grading, one per page word
 * @param means    CTC mean log-prob per word (null = no evidence), same order
 * @param tarteel  Tarteel grading of the same page words, same order
 * @returns merged words (same length) + stats; if lengths differ the CTC result is returned untouched
 */
export function mergeCtcTarteel(
  ctc: WordResult[], means: (number | null | undefined)[], tarteel: WordResult[],
): { words: WordResult[]; stats: MergeStats; rescuedIdx: number[] } {
  const stats: MergeStats = { rescued: 0, softened: 0, byShort: 0, byEvidence: 0 };
  const rescuedIdx: number[] = [];
  if (ctc.length !== tarteel.length) return { words: ctc, stats, rescuedIdx };

  const words = ctc.map((c, i) => {
    if (c.grade === "ok") return c;                       // CTC accepts → stays green
    const t = tarteel[i];
    if (!t || t.grade === "wrong" || t.grade === "missed") return c;   // Tarteel did not hear it either → unchanged
    const short = letters(c.word) <= SHORT_LETTERS;
    const m = means[i];
    const evidence = m != null && m > EVIDENCE_MEAN;
    const tOk = t.grade === "ok";

    if (c.grade === "close") {                            // CTC unsure (yellow)
      if (tOk) { stats.rescued++; rescuedIdx.push(i); return { ...c, status: "correct" as const, grade: "ok" as const, credit: 1 }; }
      return c;
    }
    // CTC red
    if (tOk && (short || evidence)) {
      stats.rescued++; rescuedIdx.push(i); short ? stats.byShort++ : stats.byEvidence++;
      return { ...c, status: "correct" as const, grade: "ok" as const, credit: 1 };
    }
    if (tOk || (t.grade === "close" && short)) {         // only partial support → amber, never green
      stats.softened++;
      return { ...c, status: "missing" as const, grade: "close" as const, credit: 0.5 };
    }
    return c;
  });
  return { words, stats, rescuedIdx };
}
