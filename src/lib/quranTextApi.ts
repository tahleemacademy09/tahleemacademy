// src/lib/quranTextApi.ts
// Fetches Arabic (Uthmani script) verse text + English translation for the
// Al-Qur'an reader from the public alquran.cloud API, with localStorage
// caching so repeat visits (and low-bandwidth connections) don't re-fetch.
import { SURAHS } from "@/components/hifdh/surahData";
import { supabase } from "@/integrations/supabase/client";

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

// ── Mushaf line layout (word-for-word, line-for-line, pixel-exact) ─────────
// The alquran.cloud endpoints above return verses in reading order but flow
// them freely — no guarantee a given word sits on the same *line* it
// occupies in a physical Madani mushaf. Earlier approach: a community
// line-layout dataset plus hand-rolled flexbox justification and waqf-mark
// merging, reconstructed from plain Unicode text. It kept surfacing new
// edge cases (extra spacing around waqf marks, marks stranded on their own
// line) no matter how many were patched, because it was fighting the font
// instead of using it.
//
// This uses Quran Foundation's official Content API with QCF V2 glyph
// rendering instead: each word comes back as a `code_v2` glyph code plus
// the exact page/line it's printed on. Loading that page's font and
// printing the code renders the literal King Fahd Complex Mushaf
// letterforms — waqf marks, spacing, everything already composed
// correctly by the original typesetting. No layout math on this end at all.
//
// The Content API requires an OAuth2 client secret, which must never reach
// the browser — so this calls Tahleem's own `quran-page` Supabase Edge
// Function (holds QF_CLIENT_ID/QF_CLIENT_SECRET, handles the token
// exchange, proxies the request) instead of Quran Foundation's API
// directly. See supabase/functions/quran-page/index.ts.

export interface QcfWord {
  surah: number;
  ayah: number;
  verseKey: string;     // "2:6"
  codeV2: string;       // QCF V2 glyph code — render with innerHTML/dangerouslySetInnerHTML, NEVER textContent
  textQpcHafs: string;  // Unicode fallback, shown until this page's glyph font has loaded
  pageNumber: number;   // which page's font this glyph code belongs to
  lineNumber: number;
  charType: string;     // "word" | "end" (verse-end marker) | "pause" | "sajdah" | "rub-el-hizb"
}
export interface QcfLine {
  lineNumber: number;
  words: QcfWord[];
}

const QCF_LINES_CACHE_PREFIX = "quran_qcf_lines_v1_";

// Silently warms the cache for a page's line-layout so the next/previous
// page turn already has it ready instead of fetching (and briefly showing
// a loading state) after the turn.
export function prefetchPageGlyphLines(pageNumber: number) {
  if (pageNumber < 1 || pageNumber > 604) return;
  getPageGlyphLines(pageNumber).catch(() => null);
}

export async function getPageGlyphLines(pageNumber: number): Promise<QcfLine[] | null> {
  const cacheKey = `${QCF_LINES_CACHE_PREFIX}${pageNumber}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore corrupt cache */ }

  try {
    const { data, error } = await supabase.functions.invoke("quran-page", { body: { page: pageNumber } });
    if (error) {
      console.warn(`[quran] quran-page function error for page ${pageNumber}:`, error);
      return null;
    }
    const verses: any[] = data?.verses;
    if (!Array.isArray(verses) || verses.length === 0) {
      console.warn(`[quran] quran-page returned no verses for page ${pageNumber}`);
      return null;
    }

    // Group into lines. A line can span the tail of one verse and the head
    // of the next; the API already returns words in correct Mushaf order,
    // so grouping by line_number in the order received is all that's
    // needed — no sorting of words within a line.
    const lineMap = new Map<number, QcfWord[]>();
    for (const verse of verses) {
      const [surahStr, ayahStr] = String(verse.verse_key || "").split(":");
      const surah = Number(surahStr), ayah = Number(ayahStr);
      for (const w of verse.words ?? []) {
        if (!w.line_number) continue;
        const word: QcfWord = {
          surah, ayah, verseKey: verse.verse_key,
          codeV2: w.code_v2 ?? "", textQpcHafs: w.text_qpc_hafs ?? "",
          pageNumber: w.page_number ?? pageNumber, lineNumber: w.line_number,
          charType: w.char_type_name ?? "word",
        };
        if (!lineMap.has(word.lineNumber)) lineMap.set(word.lineNumber, []);
        lineMap.get(word.lineNumber)!.push(word);
      }
    }
    const lines: QcfLine[] = Array.from(lineMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([lineNumber, words]) => ({ lineNumber, words }));
    if (!lines.length) return null;

    try { localStorage.setItem(cacheKey, JSON.stringify(lines)); } catch { /* storage full — ignore */ }
    return lines;
  } catch (err) {
    console.warn(`[quran] quran-page fetch threw for page ${pageNumber}:`, err);
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
