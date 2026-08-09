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

// The standard Uthmani text embeds two *structural navigation* marks inline
// with the words, alongside the actual recitation text:
//   ۞ (U+06DE, Rub' el-Hizb) — marks a quarter-Hizb boundary in the margin.
//   ۩ (U+06E9, Place-of-Sajdah) — flags a verse of prostration.
// A printed Mushaf renders these as small ornamental (usually gold) marks
// off to the side of the text, styled distinctly from the ink of the words
// themselves. Rendered plainly in the reader's normal ink color they just
// look like a stray blob sitting in the middle of a line, easy to mistake
// for a misplaced ayah-end marker. Since the reader doesn't yet give them
// their own decorative treatment, strip them out of the word text so only
// genuine recitation text (and real waqf/pause signs, which *do* belong
// inline and are left untouched) reaches the screen.
const STRUCTURAL_MARKS_REGEX = /[\u06DE\u06E9]/g;
function stripStructuralMarks(text: string): string {
  return text.replace(STRUCTURAL_MARKS_REGEX, "").replace(/\s+/g, " ").trim();
}

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
    text: stripStructuralMarks(a.text),
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
    return { surah, ayah, text: stripStructuralMarks(a.text), translation: translationRes ? translationRes.data.ayahs[i]?.text : undefined };
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
      verses.push({ surah: s.number, ayah: a.numberInSurah, text: stripStructuralMarks(a.text) });
    }
  }
  try { localStorage.setItem(FULL_CACHE_KEY, JSON.stringify(verses)); } catch { /* ignore */ }
  return verses;
}

// ── Mushaf line layout (word-for-word, line-for-line as printed) ───────────
// The alquran.cloud endpoints above return verses in reading order but flow
// them freely — there's no guarantee a given word sits on the same *line* it
// occupies in a physical Madani mushaf.
//
// FIX (was silently broken): this used to call api.quran.com/api/v4, the
// free/unauthenticated Quran.com API. Quran Foundation has migrated that
// service behind an OAuth2 login (apis.quran.foundation, requiring a
// registered client id/secret) — the old endpoint no longer reliably
// returns data for a browser-only app with no server-side token exchange.
// That silent failure was exactly why the reader almost never showed the
// true mushaf line layout: every page fell back to the free-flowing
// paragraph rendering after the 650ms grace period in QuranPage.tsx,
// which looks nothing like a real Mushaf.
//
// Replaced with a static, pre-computed 604-page Madani mushaf dataset
// (github.com/zonetecde/mushaf-layout) served from raw.githubusercontent.com,
// which sends permissive CORS headers and needs no auth/token at all — a
// browser can fetch it directly, and each page is cached in localStorage
// after the first load so repeat visits don't refetch it either.
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

const PAGE_LINES_CACHE_PREFIX = "quran_page_lines_v2_";
const MUSHAF_LAYOUT_BASE = "https://raw.githubusercontent.com/zonetecde/mushaf-layout/main/mushaf";

// The dataset embeds the ayah-end marker as a trailing Arabic-Indic numeral
// right inside the word string (e.g. "هُدًۭى ٢" = last word of ayah 2). Strip
// it off for display — the reader draws its own decorative ﴿٢﴾ marker from
// the `ayah` number it already has — and use its presence to flag isAyahEnd.
function splitAyahEndMarker(raw: string): { text: string; isAyahEnd: boolean } {
  const trimmed = stripStructuralMarks((raw || "").trim());
  const digits = trimmed.match(/[\u0660-\u0669]+$/);
  if (!digits) return { text: trimmed, isAyahEnd: false };
  return { text: trimmed.slice(0, trimmed.length - digits[0].length).trim(), isAyahEnd: true };
}

// Silently warms the cache for a page's line-layout so the next/previous
// page turn already has its true mushaf lines ready instead of needing to
// fetch them (and briefly showing the free-flowing fallback) after the turn.
export function prefetchPageLines(pageNumber: number) {
  if (pageNumber < 1 || pageNumber > 604) return;
  getPageLines(pageNumber).catch(() => null);
}

export async function getPageLines(pageNumber: number): Promise<QuranPageLine[] | null> {
  const cacheKey = `${PAGE_LINES_CACHE_PREFIX}${pageNumber}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore corrupt cache */ }

  try {
    const padded = String(pageNumber).padStart(3, "0");
    const url = `${MUSHAF_LAYOUT_BASE}/page-${padded}.json`;
    const res = await fetch(url);
    if (!res.ok) {
      // Surfaced so a failed line-layout fetch is visible in the console
      // instead of silently degrading to the free-flowing fallback layout
      // (which can't reproduce real Mushaf line breaks / full justification).
      console.warn(`[quran] page-lines fetch failed for page ${pageNumber}: HTTP ${res.status} ${res.statusText} — ${url}`);
      return null;
    }
    const json: any = await res.json();
    const rawLines: any[] = json?.lines;
    if (!Array.isArray(rawLines) || rawLines.length === 0) {
      console.warn(`[quran] page-lines empty/malformed for page ${pageNumber} — ${url}`);
      return null;
    }

    const lines: QuranPageLine[] = [];
    for (const line of rawLines) {
      // Only "text" lines carry ayah words. "surah-header" and "basmala"
      // lines are intentionally skipped here — QuranPage.tsx already draws
      // its own decorative surah banner + Bismillah whenever a line's first
      // word is ayah 1 of a surah it hasn't shown yet, so re-drawing this
      // dataset's plain-text versions would just duplicate them.
      if (line?.type !== "text" || !Array.isArray(line.words)) continue;
      const words: QuranPageWord[] = [];
      for (const w of line.words) {
        const [surahStr, ayahStr] = String(w?.location || "").split(":");
        const surah = Number(surahStr), ayah = Number(ayahStr);
        if (!surah || !ayah || !w?.word) continue;
        const { text, isAyahEnd } = splitAyahEndMarker(w.word);
        if (!text) continue;
        words.push({ surah, ayah, text, isAyahEnd });
      }
      if (words.length) lines.push({ lineNumber: line.line, words });
    }
    if (!lines.length) return null;

    try { localStorage.setItem(cacheKey, JSON.stringify(lines)); } catch { /* storage full — ignore */ }
    return lines;
  } catch (err) {
    // Network error, CORS block, or JSON parse failure — logged so it's
    // diagnosable instead of just silently falling back to the
    // free-flowing verses[] layout with browser-determined line breaks.
    console.warn(`[quran] page-lines fetch threw for page ${pageNumber}:`, err);
    return null;
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
