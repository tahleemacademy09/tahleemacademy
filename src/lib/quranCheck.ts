// src/lib/quranCheck.ts
// Word-level Quran recitation checking: normalise Arabic, align expected vs heard words, classify each word.
// Also loads Uthmani text from alquran.cloud (same edition the app already uses elsewhere).

export type WordStatus = "ok" | "check" | "wrong" | "missed" | "extra";
export interface HeardWord { word: string; start?: number | null; end?: number | null }
export interface WordResult {
  index: number;
  expected: string | null;
  heard: string | null;
  status: WordStatus;
  similarity: number;
  start: number | null;
  end: number | null;
}
export interface CheckResult {
  score: number; // 0..1 — ok words + half credit for "check" words, over expected words
  expectedWords: number;
  counts: Record<WordStatus, number>;
  words: WordResult[];
}

/** similarity >= OK_T accepted; between CHECK_T and OK_T = possible pronunciation/spelling difference. */
export const OK_T = 0.8;
export const CHECK_T = 0.6;

const MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640\u200B-\u200F\u202A-\u202E\uFEFF]/g;
const LETTER_MAP: Record<string, string> = {
  "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي",
};

export const normalizeWord = (w: string): string =>
  w.replace(MARKS, "").replace(/[أإآٱىةؤئ]/g, (c) => LETTER_MAP[c]).trim();

const tokens = (text: string): string[] => text.split(/\s+/).filter(Boolean);

export const similarity = (a: string, b: string): number => {
  if (a === b) return 1;
  const n = a.length, m = b.length;
  if (!n || !m) return 0;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    for (let j = 1; j <= m; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[m] / Math.max(n, m);
};

/** Needleman–Wunsch over words. Returns [expectedIdx|null, heardIdx|null] pairs in order. */
function align(exp: string[], got: string[]): Array<[number | null, number | null]> {
  const n = exp.length, m = got.length, GAP = 1;
  const D: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const P: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0)); // 0 diag, 1 up(missed), 2 left(extra)
  for (let i = 1; i <= n; i++) { D[i][0] = i * GAP; P[i][0] = 1; }
  for (let j = 1; j <= m; j++) { D[0][j] = j * GAP; P[0][j] = 2; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = D[i - 1][j - 1] + 1 - similarity(exp[i - 1], got[j - 1]);
      const up = D[i - 1][j] + GAP;
      const left = D[i][j - 1] + GAP;
      if (diag <= up && diag <= left) { D[i][j] = diag; P[i][j] = 0; }
      else if (up <= left) { D[i][j] = up; P[i][j] = 1; }
      else { D[i][j] = left; P[i][j] = 2; }
    }
  }
  const out: Array<[number | null, number | null]> = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const p = P[i][j];
    if (i > 0 && j > 0 && p === 0) { out.push([i - 1, j - 1]); i--; j--; }
    else if (i > 0 && (p === 1 || j === 0)) { out.push([i - 1, null]); i--; }
    else { out.push([null, j - 1]); j--; }
  }
  return out.reverse();
}

export function checkRecitation(expectedText: string, heardWords: HeardWord[]): CheckResult {
  const expRaw = tokens(expectedText).filter((w) => normalizeWord(w));
  const expNorm = expRaw.map(normalizeWord);
  const got = heardWords.filter((h) => normalizeWord(h.word));
  const gotNorm = got.map((h) => normalizeWord(h.word));

  const words: WordResult[] = align(expNorm, gotNorm).map(([ei, gi], index) => {
    if (ei !== null && gi === null) {
      return { index, expected: expRaw[ei], heard: null, status: "missed", similarity: 0, start: null, end: null };
    }
    if (ei === null && gi !== null) {
      const g = got[gi!];
      return { index, expected: null, heard: g.word.trim(), status: "extra", similarity: 0, start: g.start ?? null, end: g.end ?? null };
    }
    const g = got[gi!];
    const s = similarity(expNorm[ei!], gotNorm[gi!]);
    const status: WordStatus = s >= OK_T ? "ok" : s >= CHECK_T ? "check" : "wrong";
    return {
      index, expected: expRaw[ei!], heard: g.word.trim(), status,
      similarity: Math.round(s * 1000) / 1000, start: g.start ?? null, end: g.end ?? null,
    };
  });

  const counts: Record<WordStatus, number> = { ok: 0, check: 0, wrong: 0, missed: 0, extra: 0 };
  words.forEach((w) => counts[w.status]++);
  const total = expRaw.length;
  const score = total ? Math.round(((counts.ok + counts.check * 0.5) / total) * 1000) / 1000 : 0;
  return { score, expectedWords: total, counts, words };
}

/* ───────────────────────── Quran text (alquran.cloud) ───────────────────────── */

export interface SurahInfo { number: number; name: string; englishName: string; numberOfAyahs: number }
export interface Ayah { n: number; text: string }

const BISMILLAH = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";
const BISM_NORM = tokens(BISMILLAH).map(normalizeWord);
const cache = new Map<string, unknown>();

async function getJson<T>(url: string): Promise<T> {
  if (cache.has(url)) return cache.get(url) as T;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  cache.set(url, j);
  return j as T;
}

export async function fetchSurahs(): Promise<SurahInfo[]> {
  const j = await getJson<{ data: SurahInfo[] }>("https://api.alquran.cloud/v1/surah");
  return j.data;
}

/** Ayahs of a surah. alquran.cloud prepends the bismillah to ayah 1 (except surahs 1 and 9) — stripped here. */
export async function fetchAyahs(surah: number): Promise<Ayah[]> {
  const j = await getJson<{ data: { ayahs: Array<{ numberInSurah: number; text: string }> } }>(
    `https://api.alquran.cloud/v1/surah/${surah}/quran-uthmani`,
  );
  return j.data.ayahs.map((a) => {
    let text = a.text;
    if (surah !== 1 && a.numberInSurah === 1) {
      const t = tokens(text);
      if (t.length > 4 && BISM_NORM.every((w, i) => normalizeWord(t[i]) === w)) text = t.slice(4).join(" ");
    }
    return { n: a.numberInSurah, text };
  });
}

/** Expected text for an ayah range; optionally prefixed with the bismillah (when the reciter opens a surah). */
export function buildExpected(ayahs: Ayah[], from: number, to: number, withBismillah = false): string {
  const body = ayahs.filter((a) => a.n >= from && a.n <= to).map((a) => a.text).join(" ");
  return withBismillah ? `${BISMILLAH} ${body}` : body;
}

/** When the ASR gives text but no word list. */
export const wordsFromText = (text: string): HeardWord[] => tokens(text).map((word) => ({ word }));
