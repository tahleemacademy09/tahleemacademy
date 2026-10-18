/*
  recitationCompare.ts
  ────────────────────────────────────────────────────────────────────────
  Word-by-word comparison of a recitation against the reference (Uthmani) text.
  Every screen — student result, admin review, teacher review — grades words through this one file.
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
    .replace(/وٰ/g, "ا")                                          // bare و + dagger alef (الصلوٰة) = ā
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

/* ── Uthmani-aware comparison keys ────────────────────────────────────────── */

const MARKS_RE = /[ً-ٟؐ-ؚۖ-ۭ࣓-ࣿ]/g;   // tashkeel + Quranic annotation signs

/**
 * soundKey — "how a word SOUNDS", written in plain consonants.
 *
 * The Quran (Uthmani script) often writes a word differently from how a speech model spells what it hears,
 * even though the recitation is perfect:
 *   ذَٰلِكَ (dagger alef)  vs  ذلك          هَٰذَا  vs  هذا          لَّـٰكِن  vs  لكن
 *   ٱلصَّلَوٰةَ (waw + dagger alef)  vs  الصلاة / الصلوة         ٱلْحَيَوٰةَ  vs  الحياة
 *   إِبْرَٰهِـۧمَ (small yeh)  vs  ابراهيم       ٱلْعَـٰلَمِينَ  vs  العالمين       أُو۟لَٰٓئِكَ  vs  أولئك
 * so both sides are reduced to the same skeleton: marks removed, alef/hamza/ya/ta-marbuta variants unified,
 * long-vowel (medial) alefs dropped, the silent alef after waw al-jama'a dropped, doubled letters collapsed.
 * A final alef is KEPT (ما / عليهما must not equal م / عليهم), and an initial alef is kept.
 */
export function soundKey(w: string, isRef = false): string {
  let s = w
    .replace(/ـ/g, "")                          // tatweel
    .replace(/ۧ/g, "ي")                    // small high yeh written as a real letter (إبراهيم)
    // Uthmani text: a ى WITHOUT a dagger alef is a real ya (ٱلَّذِى, فِى, أَىِّ): only ى + dagger alef is long a.
    // Heard text is the other way round: a final ى is the usual spelling of long a (على, الهدى) and is dropped below.
    .replace(/ىٰ/g, "")                    // ى + dagger alef (الهدى / فتىٰه): long ā, no extra letter
    .replace(/وٰ/g, "ا")              // bare و + dagger alef (الصلوٰة / الربوٰا): the و stands for ā
    .replace(/ٰ/g, "ا")                    // any other dagger alef = long ā
    .replace(MARKS_RE, "")                           // tashkeel, waqf signs, small waw/ya (silent vowel lengthening)
    .replace(/[أإآٱ]/g, "ا")// أ إ آ ٱ → ا
    .replace(/ؤ/g, "و")                    // ؤ → و
    .replace(/ئ/g, "ي")                    // ئ → ي
    .replace(/ء/g, "")                          // standalone hamza
    .replace(isRef ? /(?!)/ : /ى$/, "")                          // final ى (alef maqsura) = ā
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")                    // ة → ه
    .replace(/ک/g, "ك").replace(/[یے]/g, "ي")
    .replace(/[^ء-ي]/g, "")                // digits, latin, punctuation, signs
    .replace(/و(?=ه$)/, "");               // الصلوة / الزكوة / الحيوة written with و before ة
  // long-vowel alefs: keep the first letter and a final alef, except the silent alef after waw al-jama'a (كفروا)
  const c = [...s];
  let out = "";
  for (let i = 0; i < c.length; i++) {
    if (c[i] === "ا" && i > 0) {
      if (i < c.length - 1) continue;
      if (c[i - 1] === "و") continue;
    }
    out += c[i];
  }
  return out.replace(/(.)\1+/g, "$1");               // shaddah / doubled letters
}

/** The word as it is WRITTEN (marks and letter variants unified, nothing dropped) — used to tell "same sound, different spelling". */
export function plainKey(w: string): string {
  return w
    .replace(MARKS_RE, "").replace(/[ٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ء/g, "")
    .replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/[^ء-ي]/g, "");
}

/** Single letter off (insert / delete / substitute) and long enough that one letter is not most of the word. */
export function isCloseKey(a: string, b: string): boolean {
  return a.length >= 4 && b.length >= 4 && Math.abs(a.length - b.length) <= 1 && levenshtein(a, b) <= 1;
}

/**
 * wordsMatch — "are these two words the same word?" (used by the quiz-answer checkers).
 * Same sound after Uthmani-aware reduction, or one letter off in a word of 4+ letters.
 * (The old 3-letter-prefix rule is gone: it made الحمد = الحياة and الرحيم = الرحمن.)
 */
export function wordsMatch(rw: string, gw: string): boolean {
  const a = soundKey(rw, true), b = soundKey(gw);
  if (!a || !b) return false;
  return a === b || isCloseKey(a, b);
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

/**
 * grade  ok     – heard (same sound; `tag: "uthmani"` when it is written differently in the Uthmani text)   → GREEN
 *        close  – the right word, one letter off                                                         → YELLOW
 *        wrong  – something else was heard in its place                                                   → RED
 *        missed – not heard at all                                                                        → RED (struck through)
 * status is kept for older callers: "correct" only for grade ok.
 * credit is what the word is worth in the score: ok 1, close 0.5, otherwise 0.
 */
export type Grade = "ok" | "close" | "wrong" | "missed";
export interface WordResult {
  word: string;                       // original Uthmani word, full tashkeel
  status: "correct" | "missing";
  grade: Grade;
  credit: number;
  tag?: "uthmani";                    // pronounced correctly, written differently in the Uthmani mushaf
  heard?: string;                     // for grade "wrong": what was heard instead
}

export interface RecitationAnalysis { words: WordResult[]; extras: string[]; }

interface Tok { text: string; key: string; virtual?: boolean; }

const medialAlefs = (k: string) => [...k].filter((c, i) => c === "\u0627" && i > 0 && i < k.length - 1).length;

export function refTokens(refText: string): string[] {
  // Waqf-only tokens (a lone "ۖ", "صلے" …) are pause marks, not words a reciter can "say".
  return refText.split(/\s+/).filter(Boolean).filter((w) => stripWaqf(w).length > 0);
}

export function analyzeRecitation(refText: string, gotText: string): RecitationAnalysis {
  const origRef = refTokens(refText);
  const refKeys = origRef.map((w) => soundKey(w, true));
  const mk = (word: string, grade: Grade, extra: Partial<WordResult> = {}): WordResult => ({
    word, grade, status: grade === "ok" ? "correct" : "missing",
    credit: grade === "ok" ? 1 : grade === "close" ? 0.5 : 0, ...extra,
  });

  let heard: Tok[] = gotText.split(/\s+/).filter(Boolean).map((t) => ({ text: t, key: soundKey(t) })).filter((t) => t.key);
  if (!heard.length) return { words: origRef.map((w) => mk(w, "missed")), extras: [] };

  // Joined / split words: the model writes "يا أيها" where the mushaf has يَـٰٓأَيُّهَا (or the other way round).
  // Only touched when the heard token matches nothing on its own.
  const refSet = new Set(refKeys);
  const pairs = new Map<string, [string, string]>();
  for (let i = 0; i + 1 < origRef.length; i++) {
    if (refKeys[i] && refKeys[i + 1]) pairs.set(soundKey(origRef[i] + origRef[i + 1], true), [refKeys[i], refKeys[i + 1]]);
  }
  const split: Tok[] = [];
  for (const t of heard) {
    const p = !refSet.has(t.key) ? pairs.get(t.key) : undefined;
    if (p) { split.push({ text: t.text, key: p[0], virtual: true }, { text: "", key: p[1], virtual: true }); } else split.push(t);
  }
  const joined: Tok[] = [];
  for (let i = 0; i < split.length; i++) {
    const a = split[i], b = split[i + 1];
    if (b && !refSet.has(a.key) && !refSet.has(b.key)) {
      const k = soundKey(a.text + b.text);
      if (a.text && b.text && refSet.has(k)) { joined.push({ text: `${a.text} ${b.text}`, key: k }); i++; continue; }
    }
    joined.push(a);
  }
  heard = joined;

  // Intern the distinct keys so each distinct (ref word, heard word) pair is compared only once.
  const refIds = new Map<string, number>(), gotIds = new Map<string, number>();
  const refArr = refKeys.map((w) => { let id = refIds.get(w); if (id === undefined) { id = refIds.size; refIds.set(w, id); } return id; });
  const gotArr = heard.map((t) => { let id = gotIds.get(t.key); if (id === undefined) { id = gotIds.size; gotIds.set(t.key, id); } return id; });
  const refWords = [...refIds.keys()], gotWords = [...gotIds.keys()];
  const cache = new Uint8Array(refWords.length * gotWords.length);   // 0 unknown, 1 no, 2 close, 3 exact
  const eq = (r: number, g: number): 0 | 1 | 2 => {
    const a = refArr[r], b = gotArr[g];
    const ci = a * gotWords.length + b;
    let c = cache[ci];
    if (!c) {
      const x = refWords[a], y = gotWords[b];
      c = x === y ? 3 : isCloseKey(x, y) ? 2 : 1;
      cache[ci] = c;
    }
    return c === 3 ? 2 : c === 2 ? 1 : 0;
  };

  const map = alignSequences(origRef.length, heard.length, eq);

  // Gaps between matched anchors: what was heard in a gap takes the place of the reference words there
  // (→ "wrong"), reference words with nothing heard are "missed", leftover heard words are "extras".
  const words: WordResult[] = new Array(origRef.length);
  const extras: string[] = [];
  let r = 0, g = 0;
  const flushGap = (rEnd: number, gEnd: number) => {
    const nr = rEnd - r, ng = gEnd - g;
    for (let i = 0; i < nr; i++) {
      if (i < ng) words[r + i] = mk(origRef[r + i], "wrong", { heard: heard[g + i].text || heard[g + i].key });
      else words[r + i] = mk(origRef[r + i], "missed");
    }
    for (let i = nr; i < ng; i++) if (heard[g + i].text) extras.push(heard[g + i].text);
  };
  for (let ri = 0; ri < origRef.length; ri++) {
    const gi = map[ri];
    if (gi < 0) continue;
    flushGap(ri, gi);
    // Same sound. Where the mushaf writes a REAL alef (قَالَ, كَانَ, ٱلنَّاسِ — not a dagger alef), a heard word that
    // lacks it is a different word (قل ≠ قال, الكتب ≠ الكتاب): one letter off → yellow, not green.
    const exact = refKeys[ri] === heard[gi].key
      && (heard[gi].virtual || origRef[ri].includes("\u0670") || medialAlefs(plainKey(origRef[ri])) === medialAlefs(plainKey(heard[gi].text.replace(/\s+/g, ""))));
    if (exact) {
      const tag = heard[gi].virtual || plainKey(origRef[ri]) !== plainKey(heard[gi].text.replace(/\s+/g, "")) ? { tag: "uthmani" as const } : {};
      words[ri] = mk(origRef[ri], "ok", tag);
    } else words[ri] = mk(origRef[ri], "close", { heard: heard[gi].text });
    r = ri + 1; g = gi + 1;
  }
  flushGap(origRef.length, heard.length);
  // A Bismillah recited before the surah is not part of the page text — it is not an "extra word" error.
  const BISM = ["بسم", "الله", "الرحمن", "الرحيم"].map((w) => soundKey(w));
  if (refKeys[0] !== BISM[0] && BISM.every((k, i) => extras[i] !== undefined && soundKey(extras[i]) === k)) extras.splice(0, 4);
  return { words, extras };
}

export function compareWords(refText: string, gotText: string): WordResult[] {
  return analyzeRecitation(refText, gotText).words;
}

/** % of the reference worth of words heard (ok = 1, close = ½) — 0-100. */
export function scoreOf(words: WordResult[]): number {
  if (!words.length) return 0;
  return Math.round((words.reduce((a, w) => a + w.credit, 0) / words.length) * 100);
}

/* ── One alignment for everything ─────────────────────────────────────────── */

export interface AyahScoring {
  /** every reference word with its grade (the word grid) */
  words: WordResult[];
  /** words the model heard that are not in the text */
  extras: string[];
  /** per ayah: its words (same objects as in `words`), how many there are and how many were heard exactly */
  perAyah: { words: WordResult[]; total: number; correct: number }[];
  /** % of reference words heard (0-100); close words count half */
  score: number;
}

/**
 * Aligns the transcript against ALL the ayahs once (analyzeRecitation) and then slices that single result per
 * ayah. The page score, the word grid, the red words and the green/red ayahs are all derived from this one
 * alignment, so they can never contradict each other — and the admin / teacher screens call this same function.
 */
export function scoreAgainstAyahs(ayahTexts: string[], gotText: string): AyahScoring {
  const counts = ayahTexts.map((t) => refTokens(t).length);
  const { words, extras } = analyzeRecitation(ayahTexts.join(" "), gotText);
  const perAyah: AyahScoring["perAyah"] = [];
  let at = 0;
  for (const n of counts) {
    const slice = words.slice(at, at + n);
    at += n;
    perAyah.push({ words: slice, total: slice.length, correct: slice.filter((w) => w.status === "correct").length });
  }
  return { words, extras, perAyah, score: scoreOf(words) };
}

/* ── Compact snapshot of the grades (saved with the day's log; the staff screens read it back) ─────────────── */

/** o = ok · u = ok but spelled differently in the Uthmani text · c = close (yellow) · w = wrong · m = missed */
export function encodeGrades(words: WordResult[]): string {
  return words.map((w) => (w.grade === "ok" ? (w.tag ? "u" : "o") : w.grade === "close" ? "c" : w.grade === "wrong" ? "w" : "m")).join("");
}

/** Rebuild graded words from the reference words + a snapshot made by encodeGrades (null if they don't line up). */
export function decodeGrades(refWords: string[], grades: string | undefined | null): WordResult[] | null {
  if (!grades || grades.length !== refWords.length) return null;
  const out: WordResult[] = [];
  for (let i = 0; i < refWords.length; i++) {
    const c = grades[i];
    const grade: Grade | null = c === "o" || c === "u" ? "ok" : c === "c" ? "close" : c === "w" ? "wrong" : c === "m" ? "missed" : null;
    if (!grade) return null;
    out.push({
      word: refWords[i], grade, status: grade === "ok" ? "correct" : "missing",
      credit: grade === "ok" ? 1 : grade === "close" ? 0.5 : 0, ...(c === "u" ? { tag: "uthmani" as const } : {}),
    });
  }
  return out;
}
