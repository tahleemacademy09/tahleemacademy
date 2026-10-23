// src/lib/qcfFontLoader.ts
// Loads Quran Foundation's QCF V2 page-glyph fonts on demand (one font file
// per Mushaf page, 1-604) plus the single UthmanicHafs Unicode font used as
// (a) a fallback while a page's glyph font is still loading, and (b) the
// font for verse-end markers — Quran Foundation's own guidance is to always
// render those with the Unicode font rather than the QCF glyph, since the
// ayah-number glyphs render better that way.
//
// These font files are public and CORS-open — they never need the app's
// OAuth credentials. Only the *text* (code_v2 glyph codes) comes from the
// authenticated quran-page Edge Function; the fonts that make those codes
// mean something come straight from Quran Foundation's CDN.

const CDN_BASE = "https://verses.quran.foundation";
export const UTHMANIC_HAFS_FONT_FAMILY = "UthmanicHafsQF";

const loadedPageFonts = new Set<number>();
const pageFontPromises = new Map<number, Promise<void>>();
let uthmanicHafsPromise: Promise<void> | null = null;

export function qcfPageFontFamily(pageNumber: number): string {
  return `qcf-v2-p${pageNumber}`;
}

// Loads (once) and registers the QCF V2 glyph font for a specific Mushaf
// page. Safe to call repeatedly — a page already loaded, or currently
// loading, just shares/resolves the same promise.
export function loadQcfPageFont(pageNumber: number): Promise<void> {
  if (loadedPageFonts.has(pageNumber)) return Promise.resolve();
  const existing = pageFontPromises.get(pageNumber);
  if (existing) return existing;

  const fontFamily = qcfPageFontFamily(pageNumber);
  const url = `${CDN_BASE}/fonts/quran/hafs/v2/woff2/p${pageNumber}.woff2`;
  const promise = (async () => {
    try {
      const fontFace = new FontFace(fontFamily, `url('${url}')`);
      (fontFace as any).display = "block"; // hold the fallback text a beat rather than flash tofu boxes
      await fontFace.load();
      (document.fonts as unknown as { add: (f: FontFace) => void }).add(fontFace);
      loadedPageFonts.add(pageNumber);
    } catch (err) {
      console.warn(`[quran] failed to load QCF V2 font for page ${pageNumber}:`, err);
      // Not marked loaded — a later retry (e.g. re-visiting this page)
      // will attempt the fetch again instead of assuming it's unusable forever.
      pageFontPromises.delete(pageNumber);
      throw err;
    }
  })();
  pageFontPromises.set(pageNumber, promise);
  return promise;
}

export function isQcfPageFontLoaded(pageNumber: number): boolean {
  return loadedPageFonts.has(pageNumber);
}

// The single Unicode fallback/verse-end-marker font — loaded once, reused
// across every page.
export function ensureUthmanicHafsFontLoaded(): Promise<void> {
  if (uthmanicHafsPromise) return uthmanicHafsPromise;
  const url = `${CDN_BASE}/fonts/quran/hafs/uthmanic_hafs/UthmanicHafs1Ver18.woff2`;
  uthmanicHafsPromise = (async () => {
    try {
      const fontFace = new FontFace(UTHMANIC_HAFS_FONT_FAMILY, `url('${url}')`);
      (fontFace as any).display = "swap";
      await fontFace.load();
      (document.fonts as unknown as { add: (f: FontFace) => void }).add(fontFace);
    } catch (err) {
      console.warn("[quran] failed to load UthmanicHafs fallback font:", err);
      uthmanicHafsPromise = null;
      throw err;
    }
  })();
  return uthmanicHafsPromise;
}
