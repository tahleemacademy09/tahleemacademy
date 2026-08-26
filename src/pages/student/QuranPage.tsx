// src/pages/student/QuranPage.tsx
// Al-Qur'an — true Mushaf-style reader for students: one physical, fixed-size
// page at a time (scaled to fit the screen, never scrolled), turned by swipe
// like a real Mushaf. Swipe right = next page (forward, Al-Fātiḥah → An-Nās,
// ascending page numbers); swipe left = previous page. This is the reverse
// of an English/LTR book's swipe-left-for-next.
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen, Search, X, Play, Pause, Repeat, Repeat1, Star, ChevronDown,
  SkipForward, Gauge, Languages, ListMusic, Bookmark, ArrowLeft, PlusCircle,
  ChevronUp,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { SURAHS, RECITERS, DEFAULT_RECITER } from "@/components/hifdh/surahData";
import { getPageText, getAyahPage, getFullQuranText, searchQuranText, QuranVerse, prefetchPage, getPageGlyphLines, prefetchPageGlyphLines, QcfLine } from "@/lib/quranTextApi";
import { loadQcfPageFont, qcfPageFontFamily, isQcfPageFontLoaded, ensureUthmanicHafsFontLoaded } from "@/lib/qcfFontLoader";
import { listRecitationsForSurah, CustomRecitation } from "@/lib/quranRecitations";
import { buildAyahSegments, CUSTOM_RECITER_PREFIX } from "@/lib/quranPlaybackSource";
import { useQuranAudioEngine, AyahSegment } from "@/hooks/useQuranAudioEngine";
import {
  Q_GREEN, Q_GREEN_MID, Q_GOLD, Q_GOLD_DARK, Q_PARCHMENT, Q_PARCH_ALT,
  Q_INK, Q_BORDER, Q_MUTED, Q_ARABIC_FONT,
} from "@/components/quran/quranReaderTokens";

const db: any = supabase;
const BISMILLAH = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";
const AR_NUMERALS = ["٠","١","٢","٣","٤","٥","٦","٧","٨","٩"];
const toArabicNum = (n: number) => String(n).split("").map(d => AR_NUMERALS[Number(d)] ?? d).join("");
const TOTAL_PAGES = 604;

// ── Mushaf line auto-fit ─────────────────────────────────────────────────
// A physical mushaf page justifies every printed line to the exact same
// width — some lines are naturally short (end of a surah, wide letters),
// others long, so the print never wraps a line onto a second visual row.
// At a single fixed font-size, the browser can't reproduce that: any line
// whose words are wider than the column at that size just wraps, which is
// the "scattered" look. To match print, each line gets its own font-size,
// measured against the actual column width and shrunk only as much as it
// needs to fit on one row — most lines stay at BASE_LINE_FONT_SIZE.
const BASE_LINE_FONT_SIZE = 27;
// Lowered from 22 so unusually dense pages (a full 15-line page with no
// short/half-empty lines to give the eye a break) can still shrink enough
// to fit on one screen without needing a scroll. Below ~16px the glyphs
// themselves start getting hard to make out, so that's the floor.
const MIN_LINE_FONT_SIZE = 16;

const LAST_PAGE_KEY = "quran_last_page";
const RECITER_KEY = "quran_reciter";
const TRANSLATION_KEY = "quran_show_translation";
const SWIPE_THRESHOLD = 60;
// FIX (desktop wasted most of the screen): the page was hard-capped at
// 800px wide regardless of viewport, so on a laptop/desktop the mushaf sat
// in a narrow column with empty space on both sides. This lets it grow to
// fill a normal desktop window; the "fit to screen" scale effect below still
// keeps every page's *height* on one screen either way.
const PAGE_MAX_WIDTH = 1180;

// FIX ("I want it to look like a real printed mushaf" — the reference
// image): swapped the reader's script from "Amiri Quran" to "Uthmanic Hafs",
// the actual King Fahd Complex (Madinah) mushaf typeface — the exact script
// in the reference photo, and what quran.com and most mushaf apps use for
// standard (non-pixel-perfect-glyph) rendering. It's distributed for free,
// unauthenticated, CORS-open use as a single Unicode font file (no OAuth,
// no per-page font loading — @font-face below is the only thing needed),
// so the existing per-word rendering/line-fitting logic didn't need to
// change at all, just the font it draws with.
const Q_MUSHAF_FONT = "'UthmanicHafs', 'Amiri Quran', 'Amiri', 'Scheherazade New', serif";

// Divine-name / divine-reference highlighting: matches the word's
// *skeleton* (diacritics and pause marks stripped, alef variants folded to
// one form) against the small, closed set of ways "الله" actually appears
// in the Qur'an — bare, with a one-letter prefix (بالله/تالله/والله/فالله),
// or in its assimilated no-alif form (لله/ولله/فلله). Comparing the whole
// skeleton, not just searching for the "لله" substring anywhere in a word,
// matters: plenty of unrelated words (e.g. "كُلُّهُ", "all of it") contain
// that same letter sequence internally, and a plain substring search would
// wrongly light them up.
const AR_ALEF_VARIANTS = /[أإآٱ]/g;
// Robust against any stray/invisible mark Quran Foundation's per-word data
// might include (diacritics, tatweel, joiners, annotation glyphs) by doing
// the opposite of a blocklist: keep ONLY the core Arabic letters, discard
// everything else. The previous version enumerated diacritic code-point
// ranges to strip — reliable for the alquran.cloud verse text, but any
// leftover character it didn't know about (e.g. from the QCF word API)
// silently broke the skeleton match, which is why "بِرَبِّهِمْ" wasn't
// matching the Rabb pattern below.
const arabicSkeleton = (raw: string) => {
  const lettersOnly = (raw.match(/[\u0621-\u063A\u0641-\u064A]/g) || []).join("");
  return lettersOnly.replace(AR_ALEF_VARIANTS, "ا");
};
const ALLAH_SKELETONS = new Set(["الله", "اللهم"]);
const ALLAH_PREFIXED_FULL = /^[بتوفك]الله(م)?$/;  // بالله / تالله / والله / فالله / كالله (+ اللهم)
const ALLAH_ASSIMILATED = /^[وف]?لله$/;            // لله / ولله / فلله
const isAllahWord = (text: string) => {
  const skeleton = arabicSkeleton(text);
  return ALLAH_SKELETONS.has(skeleton) || ALLAH_PREFIXED_FULL.test(skeleton) || ALLAH_ASSIMILATED.test(skeleton);
};

// "Rabb" ("Lord") + a possessive pronoun suffix — ربّهم، ربّك، ربّنا، ربّي،
// bare ربّ (which carries an implicit "my" in e.g. رَبِّ ٱغْفِرْ لِى) — with
// the same optional one-letter prefix (بربهم/فربك/ونحوه) as the Allah
// pattern above. Overwhelmingly this refers to Allah in the Qur'an, so it's
// included in the same highlight as the name "Allah" itself, matching how
// this reference Mushaf edition colors it. A handful of verses in Surah
// Yusuf use "Rabb" for a human master instead (the Aziz, then the king) —
// those specific ayahs are excluded below rather than highlighted wrongly.
const RABB_SKELETON = /^[بوفك]?رب(كما|كن|كم|هما|هن|هم|ها|نا|ي|ك)?$/;
const RABB_HUMAN_MASTER_EXCEPTIONS = new Set(["12:23", "12:42", "12:50"]);
const isDivineReferenceWord = (text: string, surah: number, ayah: number) => {
  if (isAllahWord(text)) return true;
  if (!RABB_SKELETON.test(arabicSkeleton(text))) return false;
  return !RABB_HUMAN_MASTER_EXCEPTIONS.has(`${surah}:${ayah}`);
};
const Q_ALLAH_RED = "#B3261E";

// ── Ayah-end ornament — a small gold flower/rosette medallion with the
// verse number centered inside, the way a printed Mushaf marks the end of
// each ayah, rather than a plain bracketed number. Built from a tiny inline
// SVG (8 petals rotated around a center disc) instead of relying on a
// font's own end-of-ayah glyph, so it renders identically regardless of
// which font/fallback path drew the word before it.
function AyahMedallion({ ayah }: { ayah: number }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      // FIX (medallion rendered far bigger than the surrounding text): a
      // QCF Mushaf glyph's *visible* ink at a given font-size is much
      // smaller than that font-size number implies — the font reserves a
      // lot of headroom in its own em-square for stacked diacritics and
      // waqf marks. This SVG has no such reserved space; it fills its box
      // edge-to-edge. Sized at the same 1.7em as before, it dwarfed the
      // actual word glyphs next to it. Shrunk to bring its visible size in
      // line with a normal word instead of a nominal font-size match.
      position: "relative", width: "1.05em", height: "1.05em", margin: "0 1px",
      verticalAlign: "middle", flexShrink: 0,
    }}>
      <svg viewBox="0 0 100 100" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <ellipse key={i} cx="50" cy="20" rx="13" ry="21" fill={Q_GOLD} stroke={Q_GOLD_DARK} strokeWidth="1.5"
            opacity={0.92} transform={`rotate(${i * 45} 50 50)`} />
        ))}
        <circle cx="50" cy="50" r="20" fill={Q_PARCH_ALT} stroke={Q_GOLD_DARK} strokeWidth="2" />
      </svg>
      <span style={{ position: "relative", fontSize: "0.42em", fontWeight: 700, color: Q_GOLD_DARK, lineHeight: 1 }}>
        {toArabicNum(ayah)}
      </span>
    </span>
  );
}

// Small woven/braided end-piece for the surah banner — a diagonal lattice
// standing in for the arabesque strapwork at either end of a printed
// Mushaf's surah header, without needing an external image asset.
const arabesqueBlockStyle: CSSProperties = {
  width: 30, alignSelf: "stretch", borderRadius: 5,
  backgroundColor: Q_GOLD_DARK,
  backgroundImage: `repeating-linear-gradient(45deg, transparent 0 4px, rgba(15,45,31,0.55) 4px 8px), repeating-linear-gradient(-45deg, transparent 0 4px, rgba(15,45,31,0.55) 4px 8px)`,
  border: `1px solid ${Q_GOLD}`,
  flexShrink: 0,
};

type SidebarTab = "surah" | "juz" | "bookmarks";

export default function QuranPage() {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const userId = user?.id ?? null;
  const isStaff = hasRole("admin") || hasRole("teacher");

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [verses, setVerses] = useState<QuranVerse[]>([]);
  const [qcfLines, setQcfLines] = useState<QcfLine[] | null>(null);
  // One font-size for the whole page rather than per-line: QCF glyph fonts
  // are typeset so every full printed line fills the same column width at
  // a given size — the font itself does the justification, so there's no
  // per-line variance left to compensate for the way there was with plain
  // Unicode text and hand-rolled flex justification.
  const [pageFontSize, setPageFontSize] = useState(BASE_LINE_FONT_SIZE);
  // Bumped once the current page's glyph font finishes downloading, purely
  // to trigger a re-render — isQcfPageFontLoaded() itself lives outside
  // React state (a module-level Set in qcfFontLoader.ts), so without this
  // the component would have no reason to re-check it and words would stay
  // stuck showing the plain-Unicode fallback text even after the real
  // glyph font is ready and sitting in memory.
  const [fontVersion, setFontVersion] = useState(0);
  const linesContainerRef = useRef<HTMLDivElement | null>(null);
  const measureProbeRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [recitationsBySurah, setRecitationsBySurah] = useState<Record<number, CustomRecitation[]>>({});
  const [headerCollapsed, setHeaderCollapsed] = useState(false);

  const [reciterId, setReciterId] = useState<string>(() => localStorage.getItem(RECITER_KEY) || DEFAULT_RECITER);
  const [showTranslation, setShowTranslation] = useState(() => localStorage.getItem(TRANSLATION_KEY) === "1");
  const [selected, setSelected] = useState<{ surah: number; ayah: number } | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("surah");
  const [surahQuery, setSurahQuery] = useState("");

  const [reciterMenuAnchor, setReciterMenuAnchor] = useState<{ left: number; top: number } | null>(null);
  const [speedMenuAnchor, setSpeedMenuAnchor] = useState<{ left: number; top: number } | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [fullQuran, setFullQuran] = useState<QuranVerse[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [bookmarks, setBookmarks] = useState<{ surah_number: number; ayah_number: number }[]>([]);

  const verseRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const pageBoxRef = useRef<HTMLDivElement | null>(null);
  const scaleWrapperRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchDeltaX = useRef(0);
  // Once a touch begins, we wait for a few pixels of movement before
  // deciding whether the person is turning the page (horizontal) or
  // scrolling within a tall page (vertical) — decided once per gesture so a
  // finger that drifts diagonally doesn't flip back and forth between the two.
  const swipeAxisRef = useRef<"horizontal" | "vertical" | null>(null);
  const [dragX, setDragX] = useState(0);
  const loadTokenRef = useRef(0);
  // Whole-page "fit to screen" scale — a real Mushaf page is a fixed size
  // and never scrolls; everything on it (font, spacing, the surah banner)
  // shrinks together to stay on one physical page. We measure the page's
  // natural height and scale the entire page uniformly to fit the visible
  // area, instead of scrolling or shrinking only some lines.
  const [linesReady, setLinesReady] = useState(false);
  const [pageReady, setPageReady] = useState(false); // true once the page is measured + correctly scaled — gates visibility so nothing ever visibly resizes
  // Guards the swipe flash: while a page is turning, `qcfLines` is briefly
  // null (not yet fetched). Left unguarded, that null was read as "confirmed
  // no line data" and the page popped in immediately at the *previous*
  // page's fit-to-screen scale, then jumped again once the real lines and
  // correct scale arrived a moment later — the "small, then normal" flicker.
  // This timer only lets the free-flowing fallback render after a short
  // grace period with no data, so a normal (fast) page turn always waits
  // for the real mushaf lines and never shows the wrong-scaled fallback.
  const pageLinesFallbackTimerRef = useRef<number | null>(null);

  const engine = useQuranAudioEngine();

  // Verse-end markers (charType "end") always render with this single
  // Unicode font rather than a page's QCF glyph font — load it once, up
  // front, regardless of which page is open.
  useEffect(() => { ensureUthmanicHafsFontLoaded().catch(() => {}); }, []);

  const distinctSurahsOnPage = useMemo(
    () => Array.from(new Set(verses.map(v => v.surah))).sort((a, b) => a - b),
    [verses]
  );
  const primarySurahNumber = distinctSurahsOnPage[0] ?? 1;
  const primarySurah = SURAHS.find(s => s.num === primarySurahNumber) ?? SURAHS[0];

  // ── Load a page's verses + any custom recitations for surahs on it ──────
  const goToPage = useCallback((target: number) => {
    const clamped = Math.min(Math.max(target, 1), TOTAL_PAGES);
    const token = ++loadTokenRef.current;
    setLoading(true);
    setSelected(null);
    engine.stop();
    if (pageLinesFallbackTimerRef.current != null) { clearTimeout(pageLinesFallbackTimerRef.current); pageLinesFallbackTimerRef.current = null; }
    setQcfLines(null);
    setLinesReady(false);
    setPageReady(false);
    getPageText(clamped, true).then(async (v) => {
      if (loadTokenRef.current !== token) return;
      setVerses(v);
      setCurrentPage(clamped);
      localStorage.setItem(LAST_PAGE_KEY, String(clamped));
      setLoading(false);
      // Best-effort: true mushaf line layout for this page. If it fails
      // (offline, etc.) we fall back to the free-flowing layout built from
      // `verses` above — but only after a short grace period with no data,
      // so a normal page turn always waits for the real lines and never
      // flashes the free-flowing layout at the wrong "fit to screen" scale
      // first (that mismatch — old scale applied to new, differently-shaped
      // content — was the "shrinks then snaps to normal size" jump).
      pageLinesFallbackTimerRef.current = window.setTimeout(() => {
        if (loadTokenRef.current === token) setQcfLines(prev => prev ?? []);
      }, 650);
      // The page's actual glyph font is fetched alongside its word data —
      // both need to be ready before the real Mushaf text can render, so
      // this doesn't gate setQcfLines separately; the render below just
      // shows the Unicode fallback text (text_qpc_hafs) for any word whose
      // page font hasn't finished loading yet, then re-renders once it has.
      loadQcfPageFont(clamped).then(() => {
        if (loadTokenRef.current === token) setFontVersion(v => v + 1);
      }).catch(() => {}); // best-effort — Unicode fallback (text_qpc_hafs) covers a failed/slow font load
      getPageGlyphLines(clamped).then(lines => {
        if (loadTokenRef.current !== token) return;
        if (pageLinesFallbackTimerRef.current != null) { clearTimeout(pageLinesFallbackTimerRef.current); pageLinesFallbackTimerRef.current = null; }
        setQcfLines(lines);
      }).catch(() => {
        if (loadTokenRef.current !== token) return;
        if (pageLinesFallbackTimerRef.current != null) { clearTimeout(pageLinesFallbackTimerRef.current); pageLinesFallbackTimerRef.current = null; }
        setQcfLines([]);
      });
      // fetch custom recitations for any surah on this page we haven't seen yet
      const distinct = Array.from(new Set(v.map(vv => vv.surah)));
      const missing = distinct.filter(s => !(s in recitationsBySurah));
      if (missing.length) {
        const results = await Promise.all(missing.map(s => listRecitationsForSurah(s).then(list => list.filter(r => r.is_published)).catch(() => [])));
        if (loadTokenRef.current !== token) return;
        setRecitationsBySurah(prev => {
          const next = { ...prev };
          missing.forEach((s, i) => { next[s] = results[i]; });
          return next;
        });
      }
      prefetchPage(clamped - 1);
      prefetchPage(clamped + 1);
      // Prefetch neighbouring pages' true mushaf line layout AND their
      // glyph fonts too, not just their verse text — this is what makes
      // the *next* page turn feel instant and already-fitted instead of
      // showing Unicode fallback text for a moment while its font loads.
      prefetchPageGlyphLines(clamped - 1);
      prefetchPageGlyphLines(clamped + 1);
      loadQcfPageFont(clamped - 1).catch(() => {});
      loadQcfPageFont(clamped + 1).catch(() => {});
    }).catch(() => { if (loadTokenRef.current === token) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recitationsBySurah]);

  const goToAyah = useCallback((surah: number, ayah: number) => {
    setSidebarOpen(false);
    setSearchOpen(false);
    getAyahPage(surah, ayah).then(page => {
      goToPage(page);
      setTimeout(() => {
        setSelected({ surah, ayah });
        verseRefs.current[`${surah}-${ayah}`]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 350);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Initial load ─────────────────────────────────────────────────────
  useEffect(() => {
    const saved = Number(localStorage.getItem(LAST_PAGE_KEY));
    goToPage(saved >= 1 && saved <= TOTAL_PAGES ? saved : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tear down the hidden line-measurement probe when this page unmounts.
  useEffect(() => () => { measureProbeRef.current?.remove(); }, []);

  // ── Bookmarks (per user) ────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    db.from("quran_bookmarks").select("surah_number,ayah_number").eq("user_id", userId)
      .then(({ data }: any) => setBookmarks(data ?? []));
  }, [userId]);

  // ── Reading-progress autosave (debounced) ───────────────────────────────
  useEffect(() => {
    if (!userId || loading) return;
    const timeout = setTimeout(() => {
      db.from("quran_reading_progress").upsert(
        { user_id: userId, last_surah: primarySurahNumber, last_ayah: selected?.ayah ?? 1, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      ).then(() => {});
    }, 1500);
    return () => clearTimeout(timeout);
  }, [userId, primarySurahNumber, selected, loading]);

  // ── Fit the mushaf page's text to the screen width ──────────────────────
  // QCF glyph fonts are typeset so every FULL printed line fills the exact
  // same column width at a given font-size — that's the whole point of
  // justified Uthmani typesetting, baked directly into each word's glyph
  // advance width by King Fahd Complex. That means this only needs to find
  // ONE font-size for the whole page, not a separate one per line: measure
  // the widest full line (a handful of words — not a short tail-end
  // fragment that was never meant to stretch edge-to-edge) in the page's
  // real glyph font, and every other full line will reach the same margins
  // on its own once that size is applied.
  useLayoutEffect(() => {
    if (qcfLines === null) return; // still pending — wait for real data or the grace-period fallback, don't flash
    if (!qcfLines.length) { setPageFontSize(BASE_LINE_FONT_SIZE); setLinesReady(true); return; }
    const containerEl = linesContainerRef.current;
    if (!containerEl) return;
    let cancelled = false;
    const pageForMeasure = currentPage;

    const measure = () => {
      const width = containerEl.clientWidth;
      if (!width) return;

      let probe = measureProbeRef.current;
      if (!probe) {
        probe = document.createElement("div");
        probe.style.position = "fixed";
        probe.style.top = "-9999px";
        probe.style.left = "-9999px";
        probe.style.visibility = "hidden";
        probe.style.whiteSpace = "nowrap";
        probe.style.direction = "rtl";
        probe.style.fontWeight = "400";
        document.body.appendChild(probe);
        measureProbeRef.current = probe;
      }
      probe.style.fontFamily = isQcfPageFontLoaded(pageForMeasure) ? qcfPageFontFamily(pageForMeasure) : Q_MUSHAF_FONT;
      probe.style.fontSize = `${BASE_LINE_FONT_SIZE}px`;

      let maxNatural = 0;
      for (const line of qcfLines) {
        if (line.words.length < 4) continue; // short tail-end lines were never meant to stretch edge-to-edge — see isFullLine below
        probe.innerHTML = line.words
          .map(w => (w.charType === "end" ? w.textQpcHafs : (isQcfPageFontLoaded(pageForMeasure) ? w.codeV2 : w.textQpcHafs)) || "")
          .join(" ");
        maxNatural = Math.max(maxNatural, probe.scrollWidth);
      }
      if (!maxNatural) { if (!cancelled) { setPageFontSize(BASE_LINE_FONT_SIZE); setLinesReady(true); } return; }

      // A little safety margin for the sub-pixel rounding differences
      // between this hidden probe and the real, scaled page.
      const target = width * 0.98;
      const next = maxNatural > target
        ? Math.max(MIN_LINE_FONT_SIZE, Math.floor((BASE_LINE_FONT_SIZE * target) / maxNatural))
        : BASE_LINE_FONT_SIZE;
      if (!cancelled) { setPageFontSize(next); setLinesReady(true); }
    };

    // Measuring before this page's real glyph font has finished downloading
    // gives the wrong shrink ratio (the probe would measure the fallback
    // Unicode font's different letterforms/widths instead) — wait for it,
    // then measure. If the font fails to load at all, measure() still runs
    // with the Unicode fallback so the page isn't stuck waiting forever.
    loadQcfPageFont(pageForMeasure).then(measure).catch(measure);

    const ro = new ResizeObserver(measure);
    ro.observe(containerEl);
    return () => { cancelled = true; ro.disconnect(); };
  }, [qcfLines, currentPage, fontVersion]);

  // ── Fit the whole page to the screen — no scrolling, ever ──────────────
  // Once the per-line font sizes above have settled the page's *natural*
  // height, compare that to the space actually available. If it's taller
  // than the screen, shrink pageFontSize itself (not a CSS transform) so
  // the page fits without ever needing to scroll.
  //
  // FIX (page rendered "slim" — narrow column with empty margins left and
  // right on phones): this used to apply a uniform CSS
  // `transform: scale(pageScale)` to the whole page box to fit it
  // vertically. A uniform scale shrinks WIDTH by the exact same factor as
  // height, and with transformOrigin "top center" that shrinkage is
  // centered — so on a tall page / small phone screen, the page visibly
  // sat in a slim, centered column with wasted space on both sides.
  //
  // Every full line is `text-align: justify` with `text-align-last:
  // justify` (see isFullLine below), so it ALWAYS stretches to fill 100%
  // of the container's width at ANY font-size — that's what CSS justify
  // does. That means the width-filling behavior never actually depended
  // on using the width-fit font size specifically; reducing pageFontSize
  // further to also satisfy the height constraint still fills the full
  // width, just with a smaller font — instead of the old approach, which
  // kept the (larger) width-fit font size but then shrank the whole
  // rendered box (text included) down and in from both edges.
  useLayoutEffect(() => {
    const container = pageBoxRef.current;
    const wrapper = scaleWrapperRef.current;
    if (!container || !wrapper || !linesReady) return;
    const recompute = () => {
      const availableH = container.clientHeight;
      const naturalH = wrapper.scrollHeight;
      if (!availableH || !naturalH) return;
      if (naturalH <= availableH) { setPageReady(true); return; }
      // Text height scales ~linearly with font-size, so shrink pageFontSize
      // by the same ratio the height needs to shrink by, floored at the
      // legibility minimum. Re-measuring after this triggers the
      // ResizeObserver again, converging quickly (usually one more pass)
      // since naturalH <= availableH short-circuits above once it fits.
      const ratio = availableH / naturalH;
      setPageFontSize(prev => Math.max(MIN_LINE_FONT_SIZE, Math.floor(prev * ratio)));
      setPageReady(true);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    ro.observe(wrapper);
    return () => { ro.disconnect(); };
  }, [qcfLines, pageFontSize, linesReady, showTranslation, currentPage, selected != null]);

  const isBookmarked = useCallback((surah: number, ayah: number) =>
    bookmarks.some(b => b.surah_number === surah && b.ayah_number === ayah), [bookmarks]);

  const toggleBookmark = useCallback((surah: number, ayah: number) => {
    if (!userId) return;
    if (isBookmarked(surah, ayah)) {
      setBookmarks(prev => prev.filter(b => !(b.surah_number === surah && b.ayah_number === ayah)));
      db.from("quran_bookmarks").delete().eq("user_id", userId).eq("surah_number", surah).eq("ayah_number", ayah).then(() => {});
    } else {
      setBookmarks(prev => [...prev, { surah_number: surah, ayah_number: ayah }]);
      db.from("quran_bookmarks").insert({ user_id: userId, surah_number: surah, ayah_number: ayah }).then(() => {});
    }
  }, [userId, isBookmarked]);

  // ── Swipe / drag handling ────────────────────────────────────────────────
  // Arabic reading order, not English: pages advance Al-Fātiḥah → An-Nās as
  // page numbers climb, and swiping *right* moves forward to the next page
  // (the reverse of an LTR book's swipe-left-for-next). Swiping left goes
  // back a page. The gesture's axis is locked on first movement so a page
  // that's tall enough to need vertical scrolling never mistakes a scroll
  // for a page-turn just because the finger also drifted sideways a little.
  //
  // FIX (page couldn't be turned at all on desktop): this used to be wired
  // to touch events only, so a real Mushaf-style page turn only worked on
  // a touchscreen — clicking and dragging with a mouse (the only input a
  // laptop/desktop browser has) did nothing. Pointer Events cover mouse,
  // touch, and pen with one code path, so drag-to-turn now works everywhere;
  // explicit prev/next buttons and arrow-key navigation are added below as
  // well, for people who'd rather click/tap than drag.
  const activePointerId = useRef<number | null>(null);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return; // left-click only
    activePointerId.current = e.pointerId;
    touchStartX.current = e.clientX;
    touchStartY.current = e.clientY;
    touchDeltaX.current = 0;
    swipeAxisRef.current = null;
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (activePointerId.current !== e.pointerId) return;
    if (touchStartX.current == null || touchStartY.current == null) return;
    const dx = e.clientX - touchStartX.current;
    const dy = e.clientY - touchStartY.current;
    if (swipeAxisRef.current == null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // not enough movement to tell yet
      swipeAxisRef.current = Math.abs(dx) > Math.abs(dy) * 1.3 ? "horizontal" : "vertical";
      if (swipeAxisRef.current === "horizontal") e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (swipeAxisRef.current === "horizontal") {
      if (e.cancelable) e.preventDefault(); // own the gesture; don't also scroll
      touchDeltaX.current = dx;
      setDragX(dx);
    }
    // "vertical" gestures are left alone entirely — the page's normal
    // vertical scroll (for pages taller than the fitted scale allows) handles them.
  };
  const endPointerGesture = () => {
    const dx = touchDeltaX.current;
    if (swipeAxisRef.current === "horizontal") {
      if (dx >= SWIPE_THRESHOLD) goToPage(currentPage + 1);
      else if (dx <= -SWIPE_THRESHOLD) goToPage(currentPage - 1);
    }
    setDragX(0);
    touchStartX.current = null;
    touchStartY.current = null;
    touchDeltaX.current = 0;
    swipeAxisRef.current = null;
    activePointerId.current = null;
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    if (activePointerId.current !== e.pointerId) return;
    endPointerGesture();
  };
  const onPointerCancel = (e: ReactPointerEvent) => {
    if (activePointerId.current !== e.pointerId) return;
    endPointerGesture();
  };

  // ── Keyboard navigation — → next page, ← previous page (skipped while a
  // text input has focus, e.g. the surah/search fields, or a modal is open) ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (sidebarOpen || searchOpen) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") goToPage(currentPage + 1);
      else if (e.key === "ArrowLeft") goToPage(currentPage - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentPage, sidebarOpen, searchOpen, goToPage]);

  useEffect(() => {
    if (autoScroll && engine.currentAyah != null && engine.currentSurah != null) {
      verseRefs.current[`${engine.currentSurah}-${engine.currentAyah}`]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [engine.currentAyah, engine.currentSurah, autoScroll]);

  const availableReciters = useMemo(() => {
    const customForPage = distinctSurahsOnPage.flatMap(s => recitationsBySurah[s] ?? []);
    const custom = customForPage.map(r => ({ id: `${CUSTOM_RECITER_PREFIX}${r.id}`, label: r.reciter_name, isCustom: true }));
    return [...custom, ...RECITERS.map(r => ({ ...r, isCustom: false }))];
  }, [distinctSurahsOnPage, recitationsBySurah]);

  const currentReciterLabel = availableReciters.find(r => r.id === reciterId)?.label ?? availableReciters[0]?.label ?? "";

  // Builds the segment list for ONE surah appearing on the page (only the
  // ayat that actually fall on this page, in order).
  const segmentsForSurahOnPage = useCallback((surahNum: number): AyahSegment[] => {
    const meta = SURAHS.find(s => s.num === surahNum);
    if (!meta) return [];
    const all = buildAyahSegments(surahNum, meta.verses, reciterId, recitationsBySurah[surahNum] ?? []);
    const ayatOnPage = new Set(verses.filter(v => v.surah === surahNum).map(v => v.ayah));
    return all.filter(s => ayatOnPage.has(s.ayah));
  }, [reciterId, recitationsBySurah, verses]);

  const handleVerseTap = (surah: number, ayah: number) => {
    setSelected({ surah, ayah });
    const segs = segmentsForSurahOnPage(surah);
    // Continue reciting forward from the tapped verse — unless "Repeat: Verse"
    // is active, in which case the engine's repeat check takes priority over
    // the continuous flag on every ayah-end and just loops this verse instead.
    engine.playFrom(surah, segs, ayah);
  };

  // "Play Page" — plays every ayah on the page in order, surah by surah.
  const playPageFromStart = () => {
    if (verses.length === 0) return;
    const first = verses[0];
    const segs = segmentsForSurahOnPage(first.surah);
    engine.playFrom(first.surah, segs, first.ayah);
  };

  const playFromSelected = () => {
    if (!selected) return;
    const segs = segmentsForSurahOnPage(selected.surah);
    engine.playFrom(selected.surah, segs, selected.ayah);
  };

  const isPagePlaying = engine.isPlaying && distinctSurahsOnPage.includes(engine.currentSurah ?? -1);
  const toggleActivePlayPause = () => {
    if (isPagePlaying) engine.pause();
    else if (engine.currentSurah != null && distinctSurahsOnPage.includes(engine.currentSurah) && engine.currentAyah != null) engine.resume();
    else playPageFromStart();
  };

  // ── Search ───────────────────────────────────────────────────────────
  const openSearch = async () => {
    setSearchOpen(true);
    if (!fullQuran) {
      setSearchLoading(true);
      try { setFullQuran(await getFullQuranText()); } finally { setSearchLoading(false); }
    }
  };
  const searchResults = useMemo(
    () => (fullQuran ? searchQuranText(fullQuran, searchQuery) : []),
    [fullQuran, searchQuery]
  );

  const filteredSurahs = SURAHS.filter(s =>
    !surahQuery.trim() ||
    s.name.toLowerCase().includes(surahQuery.toLowerCase()) ||
    s.nameAr.includes(surahQuery) ||
    String(s.num).includes(surahQuery)
  );

  const juzStarts = useMemo(() => {
    const map: Record<number, number> = {};
    for (const s of SURAHS) if (!(s.juz in map)) map[s.juz] = s.num;
    return map;
  }, []);

  const dragTranslate = Math.max(-80, Math.min(80, dragX * 0.4));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: Q_PARCHMENT, position: "relative" }}>
      {/* ── Header + toolbar — collapsible, so the page can take the full
          screen when the reader wants nothing but the mushaf itself. No
          fixed pixel height is assumed: the block is simply present or
          absent, so it always matches its real content height. ── */}
      {!headerCollapsed && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: Q_GREEN, color: "#fff" }}>
            <button onClick={() => setSidebarOpen(true)} style={iconBtnStyle("#fff")}>
              <BookOpen size={18} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{t("Al-Qur'an Al-Kareem", "القرآن الكريم")}</div>
              <div style={{ fontSize: 12, opacity: 0.85, display: "flex", alignItems: "center", gap: 6 }}>
                <span>{primarySurah.num}. {primarySurah.name}</span>
                <span style={{ fontFamily: Q_ARABIC_FONT }}>{primarySurah.nameAr}</span>
                <span style={{ opacity: 0.6 }}>· {t("Page", "صفحة")} {currentPage}/{TOTAL_PAGES}</span>
              </div>
            </div>
            <button onClick={openSearch} style={iconBtnStyle("#fff")}><Search size={18} /></button>
          </div>

          {/* ── Playback controls — moved up from the old fixed footer so the
              mushaf page itself can use the entire rest of the screen. Lives
              in the same collapsible block as the surah bar above, so both
              hide together. ── */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 8px",
            background: "#fff", borderBottom: `1px solid ${Q_BORDER}`,
            flexWrap: "nowrap", overflowX: "auto", WebkitOverflowScrolling: "touch",
          }}>
            <div style={{ flexShrink: 0 }}>
              <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setReciterMenuAnchor({ left: r.left, top: r.bottom + 6 }); }} style={pillBtnStyle()}>
                <ListMusic size={13} /> {currentReciterLabel} <ChevronDown size={12} />
              </button>
            </div>

            <button onClick={toggleActivePlayPause} style={pillBtnStyle(true)}>
              {isPagePlaying ? <Pause size={13} /> : <Play size={13} />}
              {t("Play Page", "تشغيل الصفحة")}
            </button>

            <button
              onClick={() => engine.setRepeatMode(engine.repeatMode === "off" ? "verse" : engine.repeatMode === "verse" ? "surah" : "off")}
              style={pillBtnStyle(engine.repeatMode !== "off")}
            >
              {engine.repeatMode === "verse" ? <Repeat1 size={13} /> : <Repeat size={13} />}
              {engine.repeatMode === "off" ? t("Repeat: Off", "التكرار: إيقاف") : engine.repeatMode === "verse" ? t("Repeat: Verse", "تكرار الآية") : t("Repeat: Surah", "تكرار السورة")}
            </button>

            <div style={{ flexShrink: 0 }}>
              <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setSpeedMenuAnchor({ left: r.left, top: r.bottom + 6 }); }} style={pillBtnStyle()}>
                <Gauge size={13} /> {engine.rate}x
              </button>
            </div>

            <button onClick={() => { const v = !showTranslation; setShowTranslation(v); localStorage.setItem(TRANSLATION_KEY, v ? "1" : "0"); }} style={pillBtnStyle(showTranslation)}>
              <Languages size={13} /> {t("Translation", "الترجمة")}
            </button>
          </div>
        </div>
      )}

      {/* ── Collapse/expand tab — small centered arrow, always reachable ── */}
      <div style={{ display: "flex", justifyContent: "center", background: headerCollapsed ? Q_PARCHMENT : "#fff", flexShrink: 0 }}>
        <button
          onClick={() => setHeaderCollapsed(v => !v)}
          aria-label={headerCollapsed ? t("Show header", "إظهار الرأس") : t("Hide header", "إخفاء الرأس")}
          style={{
            width: 40, height: 15, borderRadius: "0 0 10px 10px", border: `1px solid ${Q_BORDER}`, borderTop: "none",
            background: "#fff", color: Q_GREEN, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
          }}
        >
          {headerCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
      </div>

      {/* Reciter / speed menus render fixed + ABOVE the backdrop (fixes the
          bug where the invisible backdrop sat above the menu and swallowed
          every tap before it reached an option) and outside the toolbar so
          its horizontal scroll never clips them. */}
      {reciterMenuAnchor && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 35 }} onClick={() => setReciterMenuAnchor(null)} />
          <div style={{ ...dropdownStyle(), position: "fixed", top: reciterMenuAnchor.top, left: reciterMenuAnchor.left, zIndex: 40 }}>
            {availableReciters.map(r => (
              <button key={r.id} onClick={() => { setReciterId(r.id); localStorage.setItem(RECITER_KEY, r.id); setReciterMenuAnchor(null); }}
                style={dropdownItemStyle(r.id === reciterId)}>
                {(r as any).isCustom && <span style={{ fontSize: 10, color: Q_GOLD_DARK, marginRight: 4 }}>★</span>}
                {r.label}
              </button>
            ))}
            {isStaff && (
              <Link to="/admin/quran-recitations" onClick={() => setReciterMenuAnchor(null)} style={{
                display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", padding: "10px 12px",
                borderTop: `1px solid ${Q_BORDER}`, color: Q_GREEN, fontSize: 12, fontWeight: 600, textDecoration: "none",
              }}>
                <PlusCircle size={13} /> {t("Add Ustadh's Recitation", "إضافة تلاوة الأستاذ")}
              </Link>
            )}
          </div>
        </>
      )}
      {speedMenuAnchor && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 35 }} onClick={() => setSpeedMenuAnchor(null)} />
          <div style={{ ...dropdownStyle(), position: "fixed", top: speedMenuAnchor.top, left: speedMenuAnchor.left, minWidth: 90, zIndex: 40 }}>
            {[0.75, 1, 1.25, 1.5].map(r => (
              <button key={r} onClick={() => { engine.setRate(r); setSpeedMenuAnchor(null); }} style={dropdownItemStyle(r === engine.rate)}>{r}x</button>
            ))}
          </div>
        </>
      )}

      {/* ── Page content — swipe/drag left-right, or arrow keys, to turn
          pages. FIX: removed the visible prev/next arrow buttons — they sat
          on top of / got clipped by the mushaf text at the screen edges.
          Drag and ArrowLeft/ArrowRight still work; nothing is lost, it's
          just no longer drawn on the page itself. ── */}
      <div
        ref={pageBoxRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{
          flex: 1,
          // FIX ("some text not showing on a page"): this was `overflow:
          // "hidden"`. The fit-to-screen effect shrinks the font down to
          // MIN_LINE_FONT_SIZE trying to make the page fit without
          // scrolling, but on a very cramped viewport (or a page with an
          // unusually tall surah banner) it can still come up short even at
          // that floor. With `hidden`, whatever didn't fit was silently
          // clipped — present in the DOM, invisible on screen. `auto` keeps
          // pages that DO fit exactly as static as before (no visible
          // scrollbar/movement) but means the rare page that doesn't fit
          // is still fully reachable by scrolling, instead of losing lines.
          overflowY: "auto", overflowX: "hidden",
          padding: selected != null ? "8px 8px 64px" : "8px 8px 10px",
          position: "relative",
          touchAction: "pan-y", display: "flex", justifyContent: "center", alignItems: "flex-start",
          cursor: "grab",
        }}
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: Q_MUTED }}>{t("Loading page…", "جاري تحميل الصفحة…")}</div>
        ) : (
          <div
            key={currentPage}
            ref={scaleWrapperRef}
            style={{
              width: "100%", maxWidth: PAGE_MAX_WIDTH,
              transform: `translateX(${dragTranslate}px)`,
              transformOrigin: "top center",
              // Stays hidden — not unmounted, so it can still be measured —
              // until it's already sized correctly for this exact page, so
              // it only ever appears at its final, static size. No fade, no
              // animated resize; just there, already right, the moment it
              // shows up.
              visibility: pageReady ? "visible" : "hidden",
            }}
          >
          <div className="quran-page-frame">
            {(() => {
              const wordSpan = (surah: number, ayah: number, text: string, isAyahEnd: boolean, key: string, isFirstOfAyah: boolean, waqfMark?: string) => (
                <span
                  key={key}
                  ref={isFirstOfAyah ? (el => { verseRefs.current[`${surah}-${ayah}`] = el; }) : undefined}
                  onClick={() => handleVerseTap(surah, ayah)}
                  style={{
                    position: "relative", // anchors the absolutely-positioned waqf-mark overlay below
                    display: "inline-block",
                    cursor: "pointer", borderRadius: 6, padding: "2px 1px",
                    background: (engine.currentSurah === surah && engine.currentAyah === ayah) ? Q_GOLD
                      : (selected?.surah === surah && selected?.ayah === ayah) ? Q_PARCH_ALT : "transparent",
                    color: isDivineReferenceWord(text, surah, ayah) ? Q_ALLAH_RED : undefined,
                    transition: "background .2s",
                  }}
                >
                  {text}
                  {/* Waqf marks (ۖۗۘۙۚۛۜ) are meant to hover just above the
                      letter they follow, but the mushaf font here doesn't
                      apply that positioning itself — printed inline it just
                      reads as another baseline character. `position:absolute`
                      (rather than `relative`) takes it out of the flex flow
                      entirely, so it can never affect this word's width, the
                      line's space-between distribution, or flex baseline
                      alignment with neighboring words — it's purely a visual
                      overlay, centered above the word it belongs to. */}
                  {waqfMark && (
                    <span aria-hidden="true" style={{
                      position: "absolute", top: "-0.78em", left: "50%", transform: "translateX(-50%)",
                      fontSize: "0.5em", lineHeight: 1, whiteSpace: "nowrap",
                      color: "inherit", pointerEvents: "none",
                    }}>
                      {waqfMark}
                    </span>
                  )}
                  {isAyahEnd && <AyahMedallion ayah={ayah} />}
                  {" "}
                </span>
              );

              // Ornate surah-name banner — a gold-bordered frame around a
              // cream inner panel, echoing the printed Mushaf's decorative
              // header band, with the Bismillah centered underneath it.
              const surahDivider = (surah: number, ayah: number, isFirst: boolean) => {
                const meta = SURAHS.find(s => s.num === surah)!;
                return (
                  <div key={`div-${surah}`} style={{ margin: isFirst ? "0 0 16px" : "26px 0 16px" }}>
                    <div style={{
                      display: "flex", alignItems: "stretch", gap: 6,
                      borderRadius: 10, padding: 3,
                      background: `linear-gradient(135deg, ${Q_GOLD_DARK} 0%, ${Q_GOLD} 45%, #e9d18f 70%, ${Q_GOLD_DARK} 100%)`,
                      boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                    }}>
                      {/* Woven end-piece, echoing the arabesque strapwork
                          that frames a printed Mushaf's surah header. */}
                      <div style={arabesqueBlockStyle} />

                      {/* Surah's sequence number + its verse count — the
                          small roundel and pill sitting beside the header
                          on a printed page. */}
                      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                        <span style={{
                          width: 28, height: 28, borderRadius: "50%", border: `1.5px solid ${Q_GOLD_DARK}`,
                          background: Q_PARCH_ALT, display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: Q_ARABIC_FONT, fontSize: 13, color: Q_GREEN, fontWeight: 700, flexShrink: 0,
                        }}>{toArabicNum(meta.num)}</span>
                        <span style={{
                          padding: "3px 8px", borderRadius: 20, border: `1px solid ${Q_GOLD_DARK}`,
                          background: Q_PARCH_ALT, fontFamily: Q_ARABIC_FONT, fontSize: 11, color: Q_GREEN, whiteSpace: "nowrap",
                        }}>
                          آياتها {toArabicNum(meta.verses)}
                        </span>
                      </div>

                      <div style={{
                        flex: 1, borderRadius: 7, border: `1px solid ${Q_GOLD}`, background: Q_PARCH_ALT,
                        backgroundImage: `repeating-linear-gradient(135deg, rgba(201,168,76,0.08) 0 5px, transparent 5px 11px)`,
                        padding: "9px 16px", textAlign: "center",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <span style={{ fontFamily: Q_ARABIC_FONT, fontSize: 22, color: Q_GREEN, fontWeight: 700 }}>
                          سُورَةُ {meta.nameAr}
                        </span>
                      </div>

                      {/* Mirrored woven end-piece on the far side. */}
                      <div style={arabesqueBlockStyle} />
                    </div>
                    {/* Surah 9 (At-Tawbah) has no Bismillah; Surah 1's ayah 1 IS
                        the Bismillah itself, so drawing it again here would
                        duplicate it. */}
                    {ayah === 1 && surah !== 9 && surah !== 1 && (
                      <div style={{ fontFamily: Q_ARABIC_FONT, fontWeight: 700, fontSize: BASE_LINE_FONT_SIZE, color: Q_INK, marginTop: 18, textAlign: "center", opacity: 0.92 }}>
                        {BISMILLAH}
                      </div>
                    )}
                  </div>
                );
              };

              // ── Preferred: true mushaf layout via QCF V2 glyph fonts — one
              // <div> per printed line, rendered with that exact page's
              // official King Fahd Complex glyph font. The font itself
              // already composes each word (waqf marks, spacing, ayah-end
              // ornaments — everything) exactly as printed; there's no
              // layout math to get right or wrong here, unlike the previous
              // Unicode-text-plus-hand-rolled-justification approach. Falls
              // back to the free-flowing paragraph below if the glyph-line
              // fetch didn't succeed for this page. ──
              if (qcfLines && qcfLines.length) {
                // Only the printed opening page of a surah carries its name
                // banner — a surah that merely continues onto this page (its
                // first ayah here is not ayah 1) must never show it again.
                const surahBannerShown = new Set<number>();
                const seenAyah = new Set<string>();
                const pageFontFamily = qcfPageFontFamily(currentPage);
                const glyphFontReady = isQcfPageFontLoaded(currentPage);
                return (
                  <div ref={linesContainerRef} dir="rtl" lang="ar" style={{ color: Q_INK }}>
                    {qcfLines.map(line => {
                      const firstWord = line.words[0];
                      const showDivider = !!firstWord && firstWord.ayah === 1 && !surahBannerShown.has(firstWord.surah);
                      if (showDivider) surahBannerShown.add(firstWord.surah);
                      // A handful of "lines" are a short tail-end of a
                      // passage rather than a genuine full printed line —
                      // real Mushaf typesetting only stretches a line
                      // edge-to-edge when it's actually full; a short
                      // leftover line sits at its natural width instead.
                      const isFullLine = line.words.length >= 4;
                      // A physical Mushaf page has a fixed line pitch — every
                      // printed line occupies the same vertical space whether
                      // it's a full justified line or a short tail-end one.
                      // Varying this by word count (as before) made short
                      // lines sit much closer to their neighbors than full
                      // lines, which reads as a paragraph break appearing
                      // between ordinary lines. One constant value for every
                      // line keeps the vertical rhythm even down the page.
                      const rowLineHeight = 1.9;
                      return (
                        <div key={line.lineNumber}>
                          {showDivider && surahDivider(firstWord.surah, firstWord.ayah, line.lineNumber === qcfLines[0].lineNumber)}
                          <div
                            style={{
                              direction: "rtl",
                              textAlign: isFullLine ? "justify" : "right",
                              textAlignLast: isFullLine ? ("justify" as any) : undefined,
                              lineHeight: rowLineHeight, fontSize: pageFontSize, overflow: "visible",
                            }}
                          >
                            {line.words.map((w, i) => {
                              const key = `${w.surah}-${w.ayah}-${line.lineNumber}-${i}`;
                              const ayahKey = `${w.surah}-${w.ayah}`;
                              const isFirstOfAyah = !seenAyah.has(ayahKey);
                              seenAyah.add(ayahKey);
                              // Verse-end markers now render as the same
                              // flower-medallion ornament used in the
                              // fallback layout (AyahMedallion) instead of
                              // trusting a font glyph for it — a hand-built
                              // rosette looks the same everywhere regardless
                              // of which page font has or hasn't loaded.
                              // Every other word uses this page's real glyph
                              // code once its font has finished loading;
                              // until then it shows the API's own Unicode
                              // fallback text so nothing is ever blank while
                              // the font downloads.
                              const isEndMarker = w.charType === "end";
                              const useGlyph = !isEndMarker && glyphFontReady && !!w.codeV2;
                              if (isEndMarker) {
                                return <AyahMedallion key={key} ayah={w.ayah} />;
                              }
                              return (
                                <span
                                  key={key}
                                  ref={isFirstOfAyah ? (el => { verseRefs.current[ayahKey] = el; }) : undefined}
                                  onClick={() => handleVerseTap(w.surah, w.ayah)}
                                  style={{
                                    cursor: "pointer", borderRadius: 6, padding: "2px 1px",
                                    fontFamily: useGlyph ? pageFontFamily : Q_MUSHAF_FONT,
                                    background: (engine.currentSurah === w.surah && engine.currentAyah === w.ayah) ? Q_GOLD
                                      : (selected?.surah === w.surah && selected?.ayah === w.ayah) ? Q_PARCH_ALT : "transparent",
                                    // CSS `color` still recolors a QCF glyph normally (it's a plain
                                    // outline font, not a fixed-color one), so this now applies to
                                    // both the glyph and fallback-text render paths, not just fallback.
                                    color: isDivineReferenceWord(w.textQpcHafs, w.surah, w.ayah) ? Q_ALLAH_RED : undefined,
                                    transition: "background .2s",
                                  }}
                                >
                                  {/* code_v2 is a raw glyph-code string, not user content — Quran Foundation's
                                      own reference implementation renders it via innerHTML for this reason. */}
                                  <span dangerouslySetInnerHTML={{ __html: useGlyph ? w.codeV2 : (w.textQpcHafs || w.codeV2 || "") }} />
                                  {" "}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }

              const surahBannerShownFallback = new Set<number>();
              return (
                <div dir="rtl" lang="ar" style={{ fontFamily: Q_MUSHAF_FONT, fontWeight: 400, fontSize: BASE_LINE_FONT_SIZE, lineHeight: 2.1, color: Q_INK, textAlign: "justify", textAlignLast: "justify" as any }}>
                  {verses.map((v, i) => {
                    const showDivider = v.ayah === 1 && !surahBannerShownFallback.has(v.surah);
                    if (showDivider) surahBannerShownFallback.add(v.surah);
                    return (
                      <span key={`${v.surah}-${v.ayah}`}>
                        {showDivider && surahDivider(v.surah, v.ayah, i === 0)}
                        {wordSpan(v.surah, v.ayah, v.text, true, `${v.surah}-${v.ayah}`, true)}
                      </span>
                    );
                  })}
                </div>
              );
            })()}

            {showTranslation && (
              <div style={{ marginTop: 24, borderTop: `1px dashed ${Q_BORDER}`, paddingTop: 16 }}>
                {verses.map(v => (
                  <div key={`${v.surah}-${v.ayah}-tr`} style={{ marginBottom: 10, fontSize: 13, color: (selected?.surah === v.surah && selected?.ayah === v.ayah) ? Q_GREEN_MID : "#444" }}>
                    <b style={{ color: Q_GOLD_DARK }}>{SURAHS.find(s => s.num === v.surah)?.name} {v.ayah}.</b> {v.translation}
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
        )}
      </div>

      {/* ── Selected-verse action bar ── */}
      {selected != null && (
        <div style={{
          position: "fixed", left: 0, right: 0, bottom: 0, background: Q_GREEN, color: "#fff", zIndex: 20,
          padding: "10px 14px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 -4px 12px rgba(0,0,0,0.15)",
        }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{SURAHS.find(s => s.num === selected.surah)?.name} {selected.ayah}</span>
          <button onClick={() => {
            if (engine.isPlaying && engine.currentSurah === selected.surah && engine.currentAyah === selected.ayah) engine.pause();
            else engine.playAyah(selected.surah, segmentsForSurahOnPage(selected.surah), selected.ayah);
          }} style={iconBtnStyle("#fff")}>
            {engine.isPlaying && engine.currentSurah === selected.surah && engine.currentAyah === selected.ayah ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button onClick={playFromSelected} style={iconBtnStyle("#fff")} title={t("Play from here", "التشغيل من هنا")}>
            <SkipForward size={16} />
          </button>
          <button onClick={() => toggleBookmark(selected.surah, selected.ayah)} style={iconBtnStyle(isBookmarked(selected.surah, selected.ayah) ? Q_GOLD : "#fff")}>
            <Star size={16} fill={isBookmarked(selected.surah, selected.ayah) ? Q_GOLD : "none"} />
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={() => { setSelected(null); engine.stop(); }} style={iconBtnStyle("#fff")}><X size={16} /></button>
        </div>
      )}

      {/* ── Sidebar: Surah / Juz / Bookmarks ── */}
      {sidebarOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 40 }} onClick={() => setSidebarOpen(false)}>
          <div style={{ width: "88%", maxWidth: 360, height: "100%", background: "#fff", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", padding: "12px 14px", background: Q_GREEN, color: "#fff", gap: 8 }}>
              <button onClick={() => setSidebarOpen(false)} style={iconBtnStyle("#fff")}><ArrowLeft size={18} /></button>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{t("Browse", "تصفح")}</span>
            </div>
            <div style={{ display: "flex", borderBottom: `1px solid ${Q_BORDER}` }}>
              {(["surah", "juz", "bookmarks"] as SidebarTab[]).map(tab => (
                <button key={tab} onClick={() => setSidebarTab(tab)} style={{
                  flex: 1, padding: "10px 0", border: "none", background: "none", cursor: "pointer",
                  fontWeight: sidebarTab === tab ? 700 : 500, color: sidebarTab === tab ? Q_GREEN : Q_MUTED,
                  borderBottom: sidebarTab === tab ? `2px solid ${Q_GOLD}` : "2px solid transparent", fontSize: 13,
                }}>
                  {tab === "surah" ? t("Surah", "سورة") : tab === "juz" ? t("Juz'", "جزء") : t("Bookmarks", "المفضلة")}
                </button>
              ))}
            </div>

            {sidebarTab === "surah" && (
              <>
                <div style={{ padding: 10 }}>
                  <input value={surahQuery} onChange={e => setSurahQuery(e.target.value)} placeholder={t("Search surah…", "ابحث عن سورة…")}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${Q_BORDER}`, fontSize: 13 }} />
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {filteredSurahs.map(s => (
                    <button key={s.num} onClick={() => { setSidebarOpen(false); goToPage(s.page); }} style={{
                      display: "flex", alignItems: "center", width: "100%", padding: "10px 14px", border: "none",
                      borderBottom: `1px solid ${Q_PARCH_ALT}`, background: s.num === primarySurahNumber ? Q_PARCH_ALT : "#fff",
                      cursor: "pointer", textAlign: "left", gap: 10,
                    }}>
                      <span style={{ width: 26, height: 26, borderRadius: "50%", border: `1px solid ${Q_GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: Q_GOLD_DARK, flexShrink: 0 }}>{s.num}</span>
                      <span style={{ flex: 1, fontSize: 13, color: Q_INK }}>{s.name} <span style={{ color: Q_MUTED }}>· {s.verses} {t("verses", "آية")}</span></span>
                      <span style={{ fontFamily: Q_ARABIC_FONT, fontSize: 16, color: Q_GREEN }}>{s.nameAr}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {sidebarTab === "juz" && (
              <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
                <p style={{ fontSize: 11, color: Q_MUTED, padding: "0 4px 8px" }}>
                  {t("Jumps to the page where each Juz' begins.", "ينتقل إلى صفحة بداية كل جزء.")}
                </p>
                {Array.from({ length: 30 }, (_, i) => i + 1).map(j => (
                  <button key={j} onClick={() => { setSidebarOpen(false); goToPage(SURAHS.find(s => s.num === juzStarts[j])?.page ?? 1); }} style={{
                    display: "flex", justifyContent: "space-between", width: "100%", padding: "10px 12px", marginBottom: 4,
                    borderRadius: 8, border: `1px solid ${Q_BORDER}`, background: "#fff", cursor: "pointer", fontSize: 13,
                  }}>
                    <span>{t("Juz'", "الجزء")} {j}</span>
                    <span style={{ color: Q_MUTED }}>{SURAHS.find(s => s.num === juzStarts[j])?.name}</span>
                  </button>
                ))}
              </div>
            )}

            {sidebarTab === "bookmarks" && (
              <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
                {bookmarks.length === 0 && <p style={{ fontSize: 13, color: Q_MUTED, padding: 10 }}>{t("No bookmarks yet — tap any verse and the star icon to save it.", "لا توجد إشارات مرجعية بعد — اضغط على أي آية ثم أيقونة النجمة لحفظها.")}</p>}
                {bookmarks.map((b, i) => (
                  <button key={i} onClick={() => goToAyah(b.surah_number, b.ayah_number)} style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 12px", marginBottom: 4,
                    borderRadius: 8, border: `1px solid ${Q_BORDER}`, background: "#fff", cursor: "pointer", fontSize: 13,
                  }}>
                    <Bookmark size={14} color={Q_GOLD_DARK} />
                    {SURAHS.find(s => s.num === b.surah_number)?.name} — {t("Ayah", "آية")} {b.ayah_number}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Search overlay ── */}
      {searchOpen && (
        <div style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 50, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 12, background: Q_GREEN }}>
            <button onClick={() => setSearchOpen(false)} style={iconBtnStyle("#fff")}><ArrowLeft size={18} /></button>
            <input autoFocus dir="rtl" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder={t("Search the Qur'an (Arabic)…", "ابحث في القرآن…")}
              style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "none", fontSize: 15, fontFamily: Q_ARABIC_FONT }} />
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
            {searchLoading && <p style={{ textAlign: "center", color: Q_MUTED, marginTop: 30 }}>{t("Loading the full text for search (first time only)…", "جاري تحميل النص الكامل للبحث (أول مرة فقط)…")}</p>}
            {!searchLoading && searchQuery && searchResults.length === 0 && <p style={{ textAlign: "center", color: Q_MUTED, marginTop: 30 }}>{t("No matches.", "لا توجد نتائج.")}</p>}
            {searchResults.map((v, i) => (
              <button key={i} onClick={() => goToAyah(v.surah, v.ayah)} style={{
                display: "block", width: "100%", textAlign: "right", padding: "10px 12px", marginBottom: 6,
                borderRadius: 8, border: `1px solid ${Q_BORDER}`, background: "#fff", cursor: "pointer",
              }}>
                <div style={{ fontSize: 11, color: Q_MUTED, marginBottom: 4 }}>{SURAHS.find(s => s.num === v.surah)?.name} · {v.ayah}</div>
                <div dir="rtl" style={{ fontFamily: Q_ARABIC_FONT, fontSize: 18, color: Q_INK }}>{v.text}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&display=swap');

        /* The actual King Fahd Complex (Madinah) mushaf script — freely
           distributed, single-file, no auth required. See Q_MUSHAF_FONT. */
        @font-face {
          font-family: 'UthmanicHafs';
          src: url('https://verses.quran.foundation/fonts/quran/hafs/uthmanic_hafs/UthmanicHafs1Ver18.woff2') format('woff2'),
               url('https://verses.quran.foundation/fonts/quran/hafs/uthmanic_hafs/UthmanicHafs1Ver18.ttf') format('truetype');
          font-display: swap;
        }

        /* ── Mushaf page — a real margin around the text, not just a sliver,
           so nothing sits right on the physical screen edge. FIX: the old
           4px side padding left almost no breathing room, so on a phone the
           justified line text ran right up against (and, combined with the
           clipping bugs above, past) the edge of the screen. ── */
        .quran-page-frame {
          position: relative;
          margin: 0 auto 2px;
          padding: 10px 18px 10px;
        }
      `}</style>
    </div>
  );
}

// ── shared inline style helpers ──────────────────────────────────────────
function iconBtnStyle(color: string): CSSProperties {
  return { background: "none", border: "none", color, cursor: "pointer", padding: 6, display: "flex", alignItems: "center" };
}
function pillBtnStyle(active = false): CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 20,
    border: `1px solid ${active ? Q_GOLD : Q_BORDER}`, background: active ? Q_GREEN : "#fff",
    color: active ? "#fff" : Q_INK, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
  };
}
function dropdownStyle(): CSSProperties {
  return {
    position: "absolute", top: "110%", left: 0, background: "#fff", border: `1px solid ${Q_BORDER}`,
    borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,0.15)", zIndex: 30, minWidth: 220, maxHeight: 320, overflowY: "auto",
  };
}
function dropdownItemStyle(active: boolean): CSSProperties {
  return {
    display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none",
    background: active ? Q_PARCH_ALT : "#fff", color: Q_INK, fontSize: 13, cursor: "pointer",
  };
}

