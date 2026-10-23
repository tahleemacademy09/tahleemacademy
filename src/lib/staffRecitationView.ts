/*
  staffRecitationView.ts
  ────────────────────────────────────────────────────────────────────────
  Admin / teacher side of the daily review. Builds, for every page of a saved daily log, the SAME graded word
  list the student saw (green / yellow / red), using the same functions (recitationCompare.ts):

    1. the grade snapshot saved with the log (`grades`) when it lines up with the page's words, otherwise
    2. a fresh run of scoreAgainstAyahs() on the saved ayahs + transcript (older logs, "analysing" saves).

  A grouped recording (one recording for several pages) is graded ONCE across all its pages and then sliced per
  page, exactly like the student screen.
*/
import { decodeGrades, refTokens, scoreAgainstAyahs, type WordResult } from "@/lib/recitationCompare";

export interface StaffAyah { text: string; numberInSurah: number; surahName?: string }
export interface StaffPage {
  pageNum: number;
  ayahs?: StaffAyah[];
  transcript?: string;
  grades?: string;
  extras?: string[];
  grouped_recording?: boolean;
}

export interface PageGrid {
  words: WordResult[];
  extras: string[];
  /** the whole transcript of the recording this page belongs to */
  transcript: string;
  /** a mark after the last word of each ayah: { index: word index, label: ayah number } */
  ayahEnds: { index: number; label: number }[];
  /** false when there is nothing to grade against (no transcript saved) */
  graded: boolean;
}

const cache = new WeakMap<object, PageGrid[]>();

const countWords = (a: StaffAyah[]) => a.reduce((n, x) => n + refTokens(x.text).length, 0);

function ayahEndsOf(ayahs: StaffAyah[]) {
  const ends: PageGrid["ayahEnds"] = [];
  let at = 0;
  for (const a of ayahs) { at += refTokens(a.text).length; ends.push({ index: at - 1, label: a.numberInSurah }); }
  return ends;
}

export function buildPageGrids(pages: StaffPage[]): PageGrid[] {
  if (!pages || !pages.length) return [];
  const hit = cache.get(pages);
  if (hit) return hit;

  const firstTx = pages.map((p) => p.transcript || "").find((t) => t.trim()) || "";
  // older logs lost the grouped flag: one transcript on the first page and none on the rest = one recording
  const grouped = pages.length > 1 && (pages.some((p) => p.grouped_recording) || (!!(pages[0].transcript || "").trim() && pages.slice(1).every((p) => !(p.transcript || "").trim())));

  // grouped recording: grade all pages' ayahs together against the one transcript, then slice per page
  let groupedWords: WordResult[][] | null = null;
  let groupedExtras: string[] = [];
  if (grouped && firstTx.trim()) {
    const all = pages.flatMap((p) => p.ayahs || []);
    const res = scoreAgainstAyahs(all.map((a) => a.text), firstTx);
    groupedExtras = res.extras;
    groupedWords = [];
    let at = 0;
    for (const p of pages) {
      const n = countWords(p.ayahs || []);
      groupedWords.push(res.words.slice(at, at + n));
      at += n;
    }
  }

  const grids = pages.map((p, i): PageGrid => {
    const ayahs = p.ayahs || [];
    const refWords = ayahs.flatMap((a) => refTokens(a.text));
    const tx = grouped ? firstTx : p.transcript || "";
    const ayahEnds = ayahEndsOf(ayahs);

    const saved = decodeGrades(refWords, p.grades);
    if (saved) return { words: saved, extras: p.extras || (grouped && i === 0 ? groupedExtras : []), transcript: tx, ayahEnds, graded: true };

    if (groupedWords) {
      return { words: groupedWords[i], extras: i === 0 ? groupedExtras : [], transcript: tx, ayahEnds, graded: true };
    }
    if (!tx.trim() || !ayahs.length) return { words: [], extras: [], transcript: tx, ayahEnds, graded: false };
    const res = scoreAgainstAyahs(ayahs.map((a) => a.text), tx);
    return { words: res.words, extras: res.extras, transcript: tx, ayahEnds, graded: true };
  });
  cache.set(pages, grids);
  return grids;
}
