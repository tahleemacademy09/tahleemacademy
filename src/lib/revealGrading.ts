// src/lib/revealGrading.ts
// Pure helper: turns the Read & Reveal engine's per-word states into the page's own word grades
// (one WordResult per word of refTokens(ayah text), in order) — what the Daily Hifdh Revision saves and shows.
import { refTokens, type WordResult } from "./recitationCompare";
import type { RevealState, RevealStatus, RevealWord } from "./revealEngine";

export interface RevealAyah { text: string; numberInSurah: number; surah: { number: number } }

/** Map the engine's per-word states onto the page's word list (refTokens of the assigned ayahs). */
export function gradeAgainstAyahs(ayahs: RevealAyah[], words: RevealWord[], s: RevealState): { words: WordResult[]; heard: string[] } {
  const byAyah = new Map<string, number[]>();
  words.forEach((w, i) => {
    const k = `${w.surah ?? ayahs[0]?.surah.number ?? 0}:${w.ayah}`;
    const a = byAyah.get(k); if (a) a.push(i); else byAyah.set(k, [i]);
  });
  const out: WordResult[] = []; const heard: string[] = [];
  for (const ay of ayahs) {
    const ref = refTokens(ay.text);
    const eng = byAyah.get(`${ay.surah.number}:${ay.numberInSurah}`) ?? [];
    const R = ref.length, E = eng.length;
    ref.forEach((word, i) => {
      let ei: number | null;
      if (!E) ei = null;
      else if (R > E) ei = i < R - E ? null : eng[i - (R - E)];      // an opening (Bismillah) the engine does not grade
      else ei = eng[R === E ? i : Math.min(E - 1, Math.floor((i * E) / R))];
      const st: RevealStatus = ei === null ? "ok" : s.status[ei];
      const grade = st === "ok" ? "ok" : st === "close" ? "close" : st === "wrong" ? "wrong" : "missed";
      const h = ei === null ? null : s.heard[ei];
      out.push({
        word, grade, status: grade === "ok" ? "correct" : "missing", credit: grade === "ok" ? 1 : grade === "close" ? 0.5 : 0,
        ...(h && grade !== "ok" ? { heard: h } : {}),
        ...(h && grade === "ok" ? { heardAs: h } : {}),
      });
      heard.push(h ?? "");
    });
  }
  return { words: out, heard };
}

