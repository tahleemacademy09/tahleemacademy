// src/components/quran/mushafGlyphs.ts
// True Madinah-Mushaf (QCF / King Fahd Complex) page rendering data.
//
// A printed mushaf page can only be reproduced *exactly* with the official
// per-page QCF fonts: page N ships its own font whose glyphs are the actual
// printed shapes of that page's words, pre-shaped and pre-kerned so 15 lines
// of them fill the page identically to the print. Unicode text in a general
// Arabic font (Amiri/Uthmanic Hafs) can never match it — that is why the old
// renderer never looked like the reference mushaf.
//
// Sources (both CORS-open, no auth):
//   glyph codes + line numbers → api.quran.com/api/v4 (code_v1, line_number)
//   per-page fonts             → static.qurancdn.com/fonts/quran/hafs/v1
export interface GlyphWord {
  surah: number;
  ayah: number;
  code: string;          // QCF glyph codepoint(s) for this word
  isAyahEnd: boolean;    // ornate verse-number glyph
}
export type GlyphLineType = "text" | "surah-header" | "basmalah";
export interface GlyphLine {
  lineNumber: number;
  type: GlyphLineType;
  surah?: number;        // for surah-header / basmalah lines
  words: GlyphWord[];    // text lines only
  endsSurah: boolean;    // last printed line of a surah → centred, not justified
}

const CACHE_PREFIX = "quran_glyph_page_v1_";
const API = "https://api.quran.com/api/v4/verses/by_page";
const FONT_BASE = "https://static.qurancdn.com/fonts/quran/hafs/v1/woff2";

export const glyphFontFamily = (page: number) => `QCF_P${String(page).padStart(3, "0")}`;

const loadedFonts = new Set<number>();

/** Loads (once) the official QCF font for a mushaf page. */
export async function loadGlyphFont(page: number): Promise<void> {
  if (page < 1 || page > 604 || loadedFonts.has(page)) return;
  if (typeof FontFace === "undefined" || !document.fonts) return;
  const family = glyphFontFamily(page);
  const face = new FontFace(family, `url(${FONT_BASE}/p${page}.woff2) format("woff2")`, {
    display: "block",
  } as FontFaceDescriptors);
  await face.load();
  document.fonts.add(face);
  loadedFonts.add(page);
}

function buildLines(verses: any[]): GlyphLine[] {
  const byLine = new Map<number, GlyphWord[]>();
  for (const v of verses) {
    const [s, a] = String(v.verse_key).split(":").map(Number);
    for (const w of v.words ?? []) {
      const code = w.code_v1 ?? w.code_v2;
      const ln = Number(w.line_number);
      if (!code || !ln) continue;
      if (!byLine.has(ln)) byLine.set(ln, []);
      byLine.get(ln)!.push({ surah: s, ayah: a, code, isAyahEnd: w.char_type_name === "end" });
    }
  }
  const textLines = [...byLine.keys()].sort((x, y) => x - y);
  if (!textLines.length) return [];

  const lines: GlyphLine[] = [];
  const lastLine = textLines[textLines.length - 1];
  for (let ln = 1; ln <= lastLine; ln++) {
    const words = byLine.get(ln);
    if (words?.length) {
      const surah = words[0].surah;
      const nextWords = byLine.get(ln + 1);
      const endsSurah = !nextWords || nextWords[0].surah !== surah;
      lines.push({ lineNumber: ln, type: "text", words, endsSurah, surah });
      continue;
    }
    // Empty printed slot: it belongs to the surah opening that follows —
    // an ornate name band, and (except for Al-Fātiḥah and At-Tawbah) the
    // Basmalah line beneath it.
    const nextTextLine = textLines.find(n => n > ln);
    if (nextTextLine == null) continue;
    const nextFirst = byLine.get(nextTextLine)![0];
    if (nextFirst.ayah !== 1) continue;
    const gap = nextTextLine - ln;
    const isBasmalahSlot = gap === 1 && nextFirst.surah !== 1 && nextFirst.surah !== 9;
    lines.push({
      lineNumber: ln,
      type: isBasmalahSlot ? "basmalah" : "surah-header",
      surah: nextFirst.surah,
      words: [],
      endsSurah: false,
    });
  }
  return lines;
}

export async function getGlyphPage(page: number): Promise<GlyphLine[] | null> {
  if (page < 1 || page > 604) return null;
  const cacheKey = `${CACHE_PREFIX}${page}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* corrupt cache — ignore */ }

  try {
    const res = await fetch(`${API}/${page}?words=true&word_fields=code_v1,line_number,char_type_name`);
    if (!res.ok) return null;
    const json = await res.json();
    const lines = buildLines(json?.verses ?? []);
    if (!lines.length) return null;
    try { localStorage.setItem(cacheKey, JSON.stringify(lines)); } catch { /* full — ignore */ }
    return lines;
  } catch {
    return null;
  }
}

/** Warms glyph data + font for a neighbouring page so a turn is instant. */
export function prefetchGlyphPage(page: number) {
  if (page < 1 || page > 604) return;
  getGlyphPage(page).then(lines => { if (lines) loadGlyphFont(page).catch(() => {}); }).catch(() => {});
}
