// src/lib/quranTextApi.ts
// Fetches Arabic (Uthmani script) verse text + English translation for the
// Al-Qur'an reader from the public alquran.cloud API, with localStorage
// caching so repeat visits (and low-bandwidth connections) don't re-fetch.

export interface QuranVerse {
  surah: number;
  ayah: number;        // number within surah (1-indexed)
  text: string;        // Arabic Uthmani script
  translation?: string;
}

const CACHE_PREFIX = "quran_text_v1_";
const FULL_CACHE_KEY = "quran_text_full_v1";

interface RawAyah { number: number; text: string; numberInSurah: number; }
interface RawSurahResponse { data: { ayahs: RawAyah[] } }

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Quran API request failed (${res.status}): ${url}`);
  return res.json();
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
