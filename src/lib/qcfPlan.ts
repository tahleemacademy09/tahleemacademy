// src/lib/qcfPlan.ts
// Pure helper: turns printed-Mushaf page data (QCF glyph lines, from components/quran/mushafGlyphs.ts) into
//   • the ordered list of words the recitation engine grades (taken from the SAME data the page is drawn with,
//     so "word N on the page" and "word N heard" can never drift apart), and
//   • a lookup from every printed word to its engine index, so the page can reveal it exactly in place.
import { normalizeWord, soundKey } from "./quranCheck";
import type { GlyphLine } from "@/components/quran/mushafGlyphs";
import type { RevealWord } from "./revealEngine";

export interface QcfPlan {
  /** words to grade, in reading order (selected verses only) */
  words: RevealWord[];
  /** "pageIdx:lineIdx:wordIdx" → engine word index (graded words only) */
  idx: Map<string, number>;
  /** "pageIdx:lineIdx:wordIdx" of a verse-end sign → engine index of the last word of that verse (sign appears with it) */
  endAfter: Map<string, number>;
  /** printed items that are inside the selected range but are not graded (stand-alone signs, unreadable words) */
  ungraded: Set<string>;
  /** false until the first verse's first word and the last verse's end sign are both present (a neighbouring page is missing) */
  needPrev: boolean;
  needNext: boolean;
  /** pages (indices) that contain at least one selected word */
  usedPages: Set<number>;
}

export function buildQcfPlan(pages: GlyphLine[][], surah: number, from: number, to: number): QcfPlan {
  const words: RevealWord[] = [];
  const idx = new Map<string, number>();
  const endAfter = new Map<string, number>();
  const ungraded = new Set<string>();
  const usedPages = new Set<number>();
  const countInAyah = new Map<number, number>();
  let firstWordSeen = false, lastEndSeen = false, anySelected = false;

  pages.forEach((lines, pi) => {
    lines.forEach((line, li) => {
      if (line.type !== "text") return;
      line.words.forEach((w, wi) => {
        if (w.surah !== surah || w.ayah < from || w.ayah > to) return;
        const key = `${pi}:${li}:${wi}`;
        anySelected = true; usedPages.add(pi);
        if (w.kind === "word") {
          if (w.ayah === from && w.pos === 1) firstWordSeen = true;
          if (!w.text || !normalizeWord(w.text)) { ungraded.add(key); return; }
          const n = countInAyah.get(w.ayah) ?? 0;
          countInAyah.set(w.ayah, n + 1);
          idx.set(key, words.length);
          words.push({ text: w.text, key: soundKey(w.text), ayah: w.ayah, idxInAyah: n });
        } else if (w.kind === "end") {
          if (w.ayah === to) lastEndSeen = true;
          endAfter.set(key, words.length - 1);
        } else {
          ungraded.add(key);
        }
      });
    });
  });

  return { words, idx, endAfter, ungraded, usedPages, needPrev: !anySelected || !firstWordSeen, needNext: !anySelected || !lastEndSeen };
}
