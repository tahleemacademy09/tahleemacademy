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

export function searchQuranText(all: QuranVerse[], query: string): QuranVerse[] {
  const q = query.trim();
  if (!q) return [];
  // Normalize Arabic diacritics for a more forgiving search
  const strip = (s: string) => s.replace(/[\u064B-\u065F\u0670]/g, "");
  const nq = strip(q);
  return all.filter(v => strip(v.text).includes(nq)).slice(0, 200);
}
