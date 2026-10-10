/*
  recitationCompare.ts
  ────────────────────────────────────────────────────────────────────────
  Word-by-word comparison of a recitation against the reference text.
  (Moved out of HifdhDailyRevisionPage.tsx so it can be unit-tested and reused.)

  WHY THE ALIGNER CHANGED
  -----------------------
  The old compareWords() used a plain LCS and backtracked from the END of the
  reference. When several alignments have the same number of matches, that
  backtrack always picks the LATEST one. Words like الذين / كفروا / بعذاب / أليم
  occur again and again over a 15-page range, so a fully-transcribed phrase such
  as "وبشر الذين كفروا بعذاب أليم" could be bound to occurrences pages further
  down — leaving the place where the student actually recited it red ("missed")
  even though the model heard it perfectly.

  alignSequences() keeps the same primary goal (maximum number of matched words,
  so the score is unchanged for clean recitations) but breaks every tie in favour
  of the alignment that is CONTIGUOUS: consecutive heard words landing on
  consecutive reference words. That is the alignment a human would draw.
*/

/* ── Arabic normalisation ─────────────────────────────────────────────────── */

const WAQF_REGEX = /[ۖ-ۜ۟-۪ۤۧۨ-ۭ۝۞ؕ]/g;

/** Strip Quranic stop/pause signs. */
export function stripWaqf(text: string): string {
  return text.replace(WAQF_REGEX, "").replace(/\s+/g, " ").trim();
}

/**
 * normalizeArabic — strips tashkeel and unifies character variants so that the
 * Uthmani reference text and the model's transcript can be compared reliably.
 */
export function normalizeArabic(t: string): string {
  return stripWaqf(t)
    .replace(/ٰ/g, "ا")                                                   // dagger alef → alef (before the bulk strip)
    .replace(/[ً-ٟؐ-ؚۖ-ۜ۟-۪ۤۧۨ-ۭ]/g, "") // tashkeel + annotation marks
    .replace(/[ٱآأإ]/g, "ا")                               // alef variants → ا
    .replace(/ؤ/g, "و")                                                   // ؤ → و
    .replace(/ئ/g, "ي")                                                   // ئ → ي
    .replace(/ء/g, "")                                                         // standalone hamza removed
    .replace(/ى/g, "ي")                                                   // ى → ي
    .replace(/ة/g, "ه")                                                   // ة → ه
    .replace(/ـ/g, "")                                                         // tatweel
    .replace(/ۥ/g, "و")                                                   // small waw
    .replace(/ۦ/g, "ي")                                                   // small ya
    .replace(/[۝۞]/g, "");                                                     // ayah / hizb markers
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * wordsMatch — single source of truth for "are these two normalised words the same?"
 *  1. exact match
 *  2. 3-char prefix overlap (long-vowel insertions: الرحمان / الرحمن)
 *  3. edit distance ≤ 1 for words ≥ 4 chars
 *  4. edit distance ≤ 2 for words ≥ 7 chars
 */
export function wordsMatch(rw: string, gw: string): boolean {
  if (rw === gw) return true;
  const minLen = Math.min(rw.length, gw.length);
  if (minLen >= 3 && (rw.startsWith(gw.slice(0, 3)) || gw.startsWith(rw.slice(0, 3)))) return true;
  if (minLen >= 4) {
    const d = levenshtein(rw, gw);
    if (d <= 1) return true;
    if (minLen >= 7 && d <= 2) return true;
  }
  return false;
}

/* ── Contiguity-aware alignment ───────────────────────────────────────────── */

const BASE = 100000;     // one matched word — dominates every bonus below, so the match COUNT is still maximal
const EXACT_BONUS = 10;  // an exact match beats a fuzzy one when everything else is equal
const NEG = -1;

/**
 * Align a reference sequence (length R) with a heard sequence (length G).
 * `eq(r, g)` says whether ref[r] and heard[g] are the same word.
 *
 * Returns, for every reference index, the heard index it was matched to (or -1).
 *
 * Primary objective : maximum number of matched words (an LCS).
 * Tie-breakers      : (1) prefer exact over fuzzy matches,
 *                     (2) prefer runs where consecutive heard words land on consecutive
 *                         reference words (small gaps get a smaller bonus).
 * Memory is O(R·G) bytes (3 per cell) and time is O(R·G).
 */
export function alignSequences(
  R: number,
  G: number,
  eq: (r: number, g: number) => 0 | 1 | 2,   // 0 = no match, 1 = fuzzy match, 2 = exact match
): Int32Array {
  const out = new Int32Array(R).fill(-1);
  if (!R || !G) return out;
  const W = G + 1;
  const dir = new Uint8Array((R + 1) * W);   // 0 = match ends here, 1 = skip a ref word, 2 = skip a heard word
  const pk = new Uint8Array((R + 1) * W);    // for match cells: 0 = chain starts here, else encoded (k, j) of the previous match

  // rolling rows
  let bestPrev = new Int32Array(W);
  let bestCur = new Int32Array(W);
  // mRows[0] = row r, mRows[1] = row r-1, mRows[2] = row r-2, mRows[3] = row r-3
  let mRows: Int32Array[] = [0, 1, 2, 3].map(() => new Int32Array(W).fill(NEG));

  for (let r = 1; r <= R; r++) {
    const mCur = mRows[3];            // recycle the oldest row
    mCur.fill(NEG);
    mRows = [mCur, mRows[0], mRows[1], mRows[2]];
    bestCur[0] = 0;
    for (let g = 1; g <= G; g++) {
      let mval = NEG;
      const kind = eq(r - 1, g - 1);
      if (kind) {
        let cand = bestPrev[g - 1];
        let code = 0;
        for (let k = 1; k <= 3; k++) {
          if (r - k < 1) break;
          const row = mRows[k];
          for (let j = 1; j <= 2; j++) {
            if (g - j < 1) break;
            const mm = row[g - j];
            if (mm === NEG) continue;
            const v = mm + (k === 1 && j === 1 ? 3 : 1);
            if (v > cand) { cand = v; code = (k - 1) * 2 + j; }
          }
        }
        mval = cand + BASE + (kind === 2 ? EXACT_BONUS : 0);
        pk[r * W + g] = code;
      }
      mCur[g] = mval;
      const up = bestPrev[g], left = bestCur[g - 1];
      let bv = up > left ? up : left;
      let d = up >= left ? 1 : 2;
      if (mval !== NEG && mval >= bv) { bv = mval; d = 0; }
      bestCur[g] = bv;
      dir[r * W + g] = d;
    }
    const t = bestPrev; bestPrev = bestCur; bestCur = t;
  }

  // backtrack
  let r = R, g = G;
  while (r > 0 && g > 0) {
    const d = dir[r * W + g];
    if (d === 1) { r--; continue; }
    if (d === 2) { g--; continue; }
    let cr = r, cg = g;
    for (;;) {
      out[cr - 1] = cg - 1;
      const code = pk[cr * W + cg];
      if (code === 0) { r = cr - 1; g = cg - 1; break; }
      const k = Math.floor((code - 1) / 2) + 1;
      const j = ((code - 1) % 2) + 1;
      cr -= k; cg -= j;
    }
  }
  return out;
}

/* ── compareWords ─────────────────────────────────────────────────────────── */

// Keeps the ORIGINAL diacritic form of each reference word so the result grid can display full tashkeel
// while the matching itself uses normalised text.
export interface WordResult { word: string; status: "correct" | "missing"; }

export function compareWords(refText: string, gotText: string): WordResult[] {
  // Waqf-only tokens (a lone "ۖ", "صلے" …) are pause marks, not words a reciter can "say".
  const origRef = refText.split(/\s+/).filter(Boolean).filter((w) => stripWaqf(w).length > 0);
  const normRef = origRef.map((w) => normalizeArabic(w));
  const normGot = normalizeArabic(gotText).split(/\s+/).filter(Boolean);

  if (!normGot.length) return origRef.map((w) => ({ word: w, status: "missing" as const }));

  // Intern the distinct words so each distinct (ref word, heard word) pair is compared only once.
  const refIds = new Map<string, number>();
  const gotIds = new Map<string, number>();
  const refArr = normRef.map((w) => { let id = refIds.get(w); if (id === undefined) { id = refIds.size; refIds.set(w, id); } return id; });
  const gotArr = normGot.map((w) => { let id = gotIds.get(w); if (id === undefined) { id = gotIds.size; gotIds.set(w, id); } return id; });
  const refWords = [...refIds.keys()], gotWords = [...gotIds.keys()];
  const cache = new Uint8Array(refWords.length * gotWords.length);   // 0 = unknown, 1 = no, 2 = fuzzy, 3 = exact

  const eq = (r: number, g: number): 0 | 1 | 2 => {
    const a = refArr[r], b = gotArr[g];
    const ci = a * gotWords.length + b;
    let c = cache[ci];
    if (!c) {
      c = refWords[a] === gotWords[b] ? 3 : wordsMatch(refWords[a], gotWords[b]) ? 2 : 1;
      cache[ci] = c;
    }
    return c === 3 ? 2 : c === 2 ? 1 : 0;
  };

  const map = alignSequences(normRef.length, normGot.length, eq);
  return origRef.map((word, i) => ({ word, status: map[i] >= 0 ? ("correct" as const) : ("missing" as const) }));
}
