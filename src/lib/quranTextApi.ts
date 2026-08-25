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
  waqfMark?: string;   // trailing waqf/pause glyph(s) (ۖۗۘۙۚۛۜ) — kept separate
                        // from `text` so the renderer can lift it above the
                        // line itself instead of depending on the font's own
                        // (here, unsupported) mark-positioning to do it.
}
export interface QuranPageLine {
  lineNumber: number;
  words: QuranPageWord[];
}

// v5: fixed the real bug — a waqf mark that opens a NEW raw line (this
// dataset frequently files it there instead of at the end of the line it
// actually belongs to) now merges into the previous line's last word
// instead of stranding itself as a lone one-word line. Bumped so already-
// cached v2/v3/v4 layouts (all still carrying those stray lines) don't
// mask the fix.
const PAGE_LINES_CACHE_PREFIX = "quran_page_lines_v5_";
const MUSHAF_LAYOUT_BASE = "https://raw.githubusercontent.com/zonetecde/mushaf-layout/main/mushaf";

// The source dataset tokenizes on whitespace, and in the raw Uthmani text a
// waqf/pause sign (ۖ ۗ ۘ ۙ ۚ ۛ ۜ — U+06D6–U+06DC) sits as its own
// space-separated token between two words. Rendered as its own item in a
// `justify-content:space-between` line, that tiny glyph claims a full
// word's share of gap — flinging it away from the word it actually marks
// and leaving the stray-looking gaps around ج/ۖ/etc. seen on screen. In a
// printed Mushaf the mark isn't a word of its own at all: it's drawn
// immediately after (hovering just above/beside) the word it follows. So
// any standalone waqf-mark token gets folded into the previous word's text
// instead of becoming its own entry — same glyph, no independent flex slot.
const WAQF_MARK_REGEX = /^[\u06D6-\u06DC]+$/;

// The dataset embeds the ayah-end marker as a trailing Arabic-Indic numeral
// right inside the word string (e.g. "هُدًۭى ٢" = last word of ayah 2), and
// some sources additionally prefix that numeral with U+06DD (the Unicode
// "end of ayah" ornament, ۝) — most Quranic fonts, including the one used
// here, draw that codepoint as a plain filled circle since it has no ayah
// number baked into the glyph itself. Left in, it shows up as a stray black
// dot between verses, duplicating the reader's own decorative ﴿٢﴾ marker
// drawn from the `ayah` number it already has — so both the ۝ and the
// digit run after it are stripped for display, and either one's presence
// flags isAyahEnd.
function splitAyahEndMarker(raw: string): { text: string; isAyahEnd: boolean } {
  const trimmed = stripStructuralMarks((raw || "").trim());
  const marker = trimmed.match(/[\u06DD\u0660-\u0669]+$/);
  if (!marker) return { text: trimmed, isAyahEnd: false };
  return { text: trimmed.slice(0, trimmed.length - marker[0].length).trim(), isAyahEnd: true };
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
    // Tracks the most recently placed real word across the WHOLE page, not
    // just the current line — see the comment on WAQF_MARK_REGEX below for
    // why that matters.
    let lastWord: QuranPageWord | null = null;
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
        if (WAQF_MARK_REGEX.test(text)) {
          // Standalone waqf mark — never a printed "word" in its own right.
          // Usually it trails the word before it on the SAME line, but this
          // dataset commonly files it instead as the first token of the
          // NEXT line (the glyph sits in the gap between two printed lines,
          // so whoever extracted the coordinates attributed it to the row
          // below). Either way it belongs to whichever real word came
          // immediately before it on the page — this line's last word so
          // far, or the previous line's last word if this line hasn't
          // placed one yet — so it's merged there instead of ever being
          // allowed to become a lone one-item "line" stranded on its own
          // row (which is what was still showing up as detached ج/لا/ص
          // marks floating under lines).
          const target = words.length ? words[words.length - 1] : lastWord;
          if (target) {
            target.waqfMark = (target.waqfMark ?? "") + text;
            target.isAyahEnd = target.isAyahEnd || isAyahEnd;
          }
          // If there's truly no preceding word yet (only possible if the
          // very first token on the whole page were a stray mark), there's
          // nothing sensible to attach it to — drop it rather than let it
          // strand itself as its own line.
          continue;
        }
        const word: QuranPageWord = { surah, ayah, text, isAyahEnd };
        words.push(word);
        lastWord = word;
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
