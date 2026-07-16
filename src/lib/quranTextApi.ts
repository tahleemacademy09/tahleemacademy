// src/lib/quranTextApi.ts
// Fetches Arabic (Uthmani script) verse text + English translation for the
// Al-Qur'an reader from the public alquran.cloud API, with localStorage
// caching so repeat visits (and low-bandwidth connections) don't re-fetch.
import { SURAHS } from "@/components/hifdh/surahData";

export interface QuranVerse {
  surah: number;
  ayah: number;        // number within surah (1-indexed)
  text: string;        // Arabic Uthmani script
  translation?: string;
}

const CACHE_PREFIX = "quran_text_v1_";
const FULL_CACHE_KEY = "quran_text_full_v1";
const PAGE_CACHE_PREFIX = "quran_page_v1_";

interface RawAyah { number: number; text: string; numberInSurah: number; }
interface RawSurahResponse { data: { ayahs: RawAyah[] } }

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Quran API request failed (${res.status}): ${url}`);
  return res.json();
}

// ── Global ayah number (1-6236) → {surah, ayah-in-surah} ────────────────────
// Built once from SURAHS' verse counts. Used for page-endpoint responses,
// which return ayahs in global-number order rather than nested by surah —
// this avoids depending on the exact shape of any per-ayah "surah" object the
// API response may or may not include.
const GLOBAL_START_FOR_SURAH: Record<number, number> = (() => {
  const map: Record<number, number> = {};
  let running = 1;
  for (const s of [...SURAHS].sort((a, b) => a.num - b.num)) {
    map[s.num] = running;
    running += s.verses;
  }
  return map;
})();

function surahAyahForGlobal(globalNumber: number): { surah: number; ayah: number } {
  for (let num = 114; num >= 1; num--) {
    const start = GLOBAL_START_FOR_SURAH[num];
    if (start !== undefined && globalNumber >= start) {
      return { surah: num, ayah: globalNumber - start + 1 };
    }
  }
  return { surah: 1, ayah: 1 };
}

// ── Per-surah fetch (Arabic + optional translation), cached in localStorage ──
export async function getSurahText(surahNumber: number, includeTranslation = true): Promise<QuranVerse[]> {
  const cacheKey = `${CACHE_PREFIX}${surahNumber}_${includeTranslation ? "tr" : "noTr"}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore corrupt cache */ }

  const arabicUrl = `https://api.alquran.cloud/v1/surah/${surahNumber}/quran-uthmani`;
  const [arabicRes, translationRes] = await Promise.all([
    fetchJson<RawSurahResponse>(arabicUrl),
    includeTranslation
      ? fetchJson<RawSurahResponse>(`https://api.alquran.cloud/v1/surah/${surahNumber}/en.sahih`)
      : Promise.resolve(null as RawSurahResponse | null),
  ]);

  const verses: QuranVerse[] = arabicRes.data.ayahs.map((a, i) => ({
    surah: surahNumber,
    ayah: a.numberInSurah,
    text: a.text,
    translation: translationRes ? translationRes.data.ayahs[i]?.text : undefined,
  }));

  try { localStorage.setItem(cacheKey, JSON.stringify(verses)); } catch { /* storage full — ignore */ }
  return verses;
}

// ── Per-page fetch (Mushaf page, 1-604) — Arabic + optional translation ────
// A page can span the tail of one surah and the start of the next; each
// verse in the returned array carries its own {surah, ayah}.
export async function getPageText(pageNumber: number, includeTranslation = true): Promise<QuranVerse[]> {
  const cacheKey = `${PAGE_CACHE_PREFIX}${pageNumber}_${includeTranslation ? "tr" : "noTr"}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore corrupt cache */ }

  const arabicUrl = `https://api.alquran.cloud/v1/page/${pageNumber}/quran-uthmani`;
  const [arabicRes, translationRes] = await Promise.all([
    fetchJson<RawSurahResponse>(arabicUrl),
    includeTranslation
      ? fetchJson<RawSurahResponse>(`https://api.alquran.cloud/v1/page/${pageNumber}/en.sahih`)
      : Promise.resolve(null as RawSurahResponse | null),
  ]);

  const verses: QuranVerse[] = arabicRes.data.ayahs.map((a, i) => {
    const { surah, ayah } = surahAyahForGlobal(a.number);
    return { surah, ayah, text: a.text, translation: translationRes ? translationRes.data.ayahs[i]?.text : undefined };
  });

  try { localStorage.setItem(cacheKey, JSON.stringify(verses)); } catch { /* storage full — ignore */ }
  return verses;
}

// Silently warms the cache for a page so the next/previous swipe feels
// instant. Failures are ignored — this is best-effort prefetching only.
export function prefetchPage(pageNumber: number, includeTranslation = true) {
  if (pageNumber < 1 || pageNumber > 604) return;
  getPageText(pageNumber, includeTranslation).catch(() => {});
}

// ── Which Mushaf page is a given surah:ayah on? ─────────────────────────────
// Needed for search results / bookmarks, which can point mid-surah (unlike
// the surah picker, which can just use SURAHS[].page for ayah 1).
const AYAH_PAGE_CACHE_KEY = "quran_ayah_page_v1_";
export async function getAyahPage(surah: number, ayah: number): Promise<number> {
  const cacheKey = `${AYAH_PAGE_CACHE_KEY}${surah}_${ayah}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return Number(cached);
  } catch { /* ignore */ }

  const fallback = SURAHS.find(s => s.num === surah)?.page ?? 1;
  try {
    const res = await fetchJson<{ data: { page?: number } }>(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/quran-uthmani`);
    const page = res.data.page ?? fallback;
    try { localStorage.setItem(cacheKey, String(page)); } catch { /* ignore */ }
    return page;
  } catch {
    return fallback;
  }
}

// ── Full-Quran fetch, used only when the person opens search ────────────────
// Loaded once, cached indefinitely (the Uthmani text never changes).
export async function getFullQuranText(): Promise<QuranVerse[]> {
  try {
    const cached = localStorage.getItem(FULL_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore corrupt cache */ }

  const res = await fetchJson<{ data: { surahs: { number: number; ayahs: RawAyah[] }[] } }>(
    "https://api.alquran.cloud/v1/quran/quran-uthmani"
  );
  const verses: QuranVerse[] = [];
  for (const s of res.data.surahs) {
    for (const a of s.ayahs) {
      verses.push({ surah: s.number, ayah: a.numberInSurah, text: a.text });
    }
  }
  try { localStorage.setItem(FULL_CACHE_KEY, JSON.stringify(verses)); } catch { /* ignore */ }
  return verses;
}

// ── Mushaf line layout (word-for-word, line-for-line as printed) ───────────
// The alquran.cloud endpoints above return verses in reading order but flow
// them freely — there's no guarantee a given word sits on the same *line* it
// occupies in a physical Madani mushaf. quran.com's v4 API separately exposes
// each word's line_number for the standard 604-page mushaf layout, which is
// exactly the data needed to reproduce true page/line breaks. This is used
// only for the *visual* text layer; verses[] above still drives audio,
// translations, bookmarks, and search, since both sources describe the same
// canonical text and line up 1:1 by surah:ayah.
export interface QuranPageWord {
  surah: number;
  ayah: number;
  text: string;       // Uthmani script
  isAyahEnd: boolean;  // true on the last word of its ayah — render the ayah-end marker after it
}
export interface QuranPageLine {
  lineNumber: number;
  words: QuranPageWord[];
}

const PAGE_LINES_CACHE_PREFIX = "quran_page_lines_v1_";

export async function getPageLines(pageNumber: number): Promise<QuranPageLine[] | null> {
  const cacheKey = `${PAGE_LINES_CACHE_PREFIX}${pageNumber}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore corrupt cache */ }

  try {
    const url = `https://api.quran.com/api/v4/verses/by_page/${pageNumber}?words=true&word_fields=text_uthmani,line_number,position,char_type_name&fields=text_uthmani`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json: any = await res.json();
    const verses: any[] = json?.verses;
    if (!Array.isArray(verses) || verses.length === 0) return null;

    // Last real word position per ayah, so we know where to draw the ayah-end marker.
    const maxPosByVerse = new Map<string, number>();
    for (const v of verses) {
      for (const w of (v.words ?? [])) {
        if (w.char_type_name !== "word") continue;
        const key = v.verse_key as string;
        maxPosByVerse.set(key, Math.max(maxPosByVerse.get(key) ?? 0, w.position ?? 0));
      }
    }

    const lineMap = new Map<number, QuranPageWord[]>();
    for (const v of verses) {
      const key = v.verse_key as string;
      const [surahStr, ayahStr] = key.split(":");
      const surah = Number(surahStr), ayah = Number(ayahStr);
      for (const w of (v.words ?? [])) {
        if (w.char_type_name !== "word") continue;
        const line = w.line_number;
        const text = w.text_uthmani || w.text;
        if (typeof line !== "number" || !text) continue;
        if (!lineMap.has(line)) lineMap.set(line, []);
        lineMap.get(line)!.push({ surah, ayah, text, isAyahEnd: (w.position ?? 0) === maxPosByVerse.get(key) });
      }
    }

    const lines: QuranPageLine[] = Array.from(lineMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([lineNumber, words]) => ({ lineNumber, words }));
    if (!lines.length) return null;

    try { localStorage.setItem(cacheKey, JSON.stringify(lines)); } catch { /* storage full — ignore */ }
    return lines;
  } catch {
    return null; // caller falls back to the free-flowing verses[] layout
  }
}

export function searchQuranText(all: QuranVerse[], query: string): QuranVerse[] {
  const q = query.trim();
  if (!q) return [];
  // Normalize Arabic diacritics for a more forgiving search
  const strip = (s: string) => s.replace(/[\u064B-\u065F\u0670]/g, "");
  const nq = strip(q);
  return all.filter(v => strip(v.text).includes(nq)).slice(0, 200);
}
