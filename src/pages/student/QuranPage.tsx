// src/pages/student/QuranPage.tsx
// Al-Qur'an — true Mushaf-style reader for students: one physical, fixed-size
// page at a time (scaled to fit the screen, never scrolled), turned by swipe
// like a real Mushaf. Swipe right = next page (forward, Al-Fātiḥah → An-Nās,
// ascending page numbers); swipe left = previous page. This is the reverse
// of an English/LTR book's swipe-left-for-next.
import type { CSSProperties, TouchEvent as ReactTouchEvent } from "react";
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
import { getPageText, getAyahPage, getFullQuranText, searchQuranText, QuranVerse, prefetchPage, getPageLines, QuranPageLine } from "@/lib/quranTextApi";
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
const BASE_LINE_FONT_SIZE = 24;
const MIN_LINE_FONT_SIZE = 13;

const LAST_PAGE_KEY = "quran_last_page";
const RECITER_KEY = "quran_reciter";
const TRANSLATION_KEY = "quran_show_translation";
const SWIPE_THRESHOLD = 60;

type SidebarTab = "surah" | "juz" | "bookmarks";

export default function QuranPage() {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const userId = user?.id ?? null;
  const isStaff = hasRole("admin") || hasRole("teacher");

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [verses, setVerses] = useState<QuranVerse[]>([]);
  const [pageLines, setPageLines] = useState<QuranPageLine[] | null>(null);
  const [lineFontSizes, setLineFontSizes] = useState<Record<number, number>>({});
  const linesContainerRef = useRef<HTMLDivElement | null>(null);
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [recitationsBySurah, setRecitationsBySurah] = useState<Record<number, CustomRecitation[]>>({});
  const [slideDir, setSlideDir] = useState<"next" | "prev" | null>(null);
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
  const [pageScale, setPageScale] = useState(1);
  const [linesReady, setLinesReady] = useState(false);

  const engine = useQuranAudioEngine();

  const distinctSurahsOnPage = useMemo(
    () => Array.from(new Set(verses.map(v => v.surah))).sort((a, b) => a - b),
    [verses]
  );
  const primarySurahNumber = distinctSurahsOnPage[0] ?? 1;
  const primarySurah = SURAHS.find(s => s.num === primarySurahNumber) ?? SURAHS[0];

  // ── Load a page's verses + any custom recitations for surahs on it ──────
  const goToPage = useCallback((target: number, direction: "next" | "prev" | null = null) => {
    const clamped = Math.min(Math.max(target, 1), TOTAL_PAGES);
    const token = ++loadTokenRef.current;
    setSlideDir(direction);
    setLoading(true);
    setSelected(null);
    engine.stop();
    setPageLines(null);
    setLinesReady(false);
    getPageText(clamped, true).then(async (v) => {
      if (loadTokenRef.current !== token) return;
      setVerses(v);
      setCurrentPage(clamped);
      localStorage.setItem(LAST_PAGE_KEY, String(clamped));
      setLoading(false);
      // Best-effort: true mushaf line layout for this page. If it fails
      // (offline, CORS, etc.) we silently keep the free-flowing fallback
      // built from `verses` above — nothing breaks either way.
      getPageLines(clamped).then(lines => { if (loadTokenRef.current === token) setPageLines(lines); });
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

  // ── Fit each mushaf line to one row ─────────────────────────────────────
  // Measures the natural width of every printed line's text (Arabic word
  // text + ayah-end markers) with an offscreen canvas at BASE_LINE_FONT_SIZE,
  // then — only for lines that would overflow the column — shrinks that
  // line's own font-size just enough to fit, instead of letting the browser
  // wrap it onto a second visual row. Re-runs whenever the page's lines
  // change or the reader column is resized (e.g. rotate, sidebar toggle).
  useLayoutEffect(() => {
    if (!pageLines || !pageLines.length) { setLineFontSizes({}); setLinesReady(true); return; }
    const containerEl = linesContainerRef.current;
    if (!containerEl) return;
    let cancelled = false;

    const measure = () => {
      const width = containerEl.clientWidth;
      if (!width) return;
      const canvas = measureCanvasRef.current ?? (measureCanvasRef.current = document.createElement("canvas"));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const next: Record<number, number> = {};
      for (const line of pageLines) {
        const text = line.words
          .map(w => w.text + (w.isAyahEnd ? ` ﴿${toArabicNum(w.ayah)}﴾` : ""))
          .join(" ");
        ctx.font = `${BASE_LINE_FONT_SIZE}px ${Q_ARABIC_FONT}`;
        const naturalWidth = ctx.measureText(text).width;
        next[line.lineNumber] = naturalWidth > width && naturalWidth > 0
          ? Math.max(MIN_LINE_FONT_SIZE, Math.floor((BASE_LINE_FONT_SIZE * width) / naturalWidth))
          : BASE_LINE_FONT_SIZE;
      }
      if (!cancelled) { setLineFontSizes(next); setLinesReady(true); }
    };

    // Canvas text measurement silently falls back to a system font's metrics
    // until the actual Amiri webfont has finished downloading — measuring
    // too early gives the wrong shrink ratio for every line on the page.
    // Wait for the real font (and re-measure once it's ready) before trusting
    // the numbers; if it's already loaded this resolves on the next tick.
    Promise.all([
      document.fonts?.ready,
      document.fonts?.load(`${BASE_LINE_FONT_SIZE}px ${Q_ARABIC_FONT}`),
    ]).then(measure).catch(measure);

    const ro = new ResizeObserver(measure);
    ro.observe(containerEl);
    return () => { cancelled = true; ro.disconnect(); };
  }, [pageLines]);

  // ── Fit the whole page to the screen — no scrolling, ever ──────────────
  // Once the per-line font sizes above have settled the page's *natural*
  // height, compare that to the space actually available and shrink the
  // entire page (banner, Bismillah, every line) by one uniform factor so
  // it always lands exactly inside the visible area, the way a printed
  // Mushaf page is a fixed size that never needs a scrollbar.
  useLayoutEffect(() => {
    const container = pageBoxRef.current;
    const wrapper = scaleWrapperRef.current;
    if (!container || !wrapper || !linesReady) return;
    let raf = 0;
    const recompute = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const availableH = container.clientHeight;
        // Measure at natural size — a CSS transform: scale() never affects
        // scrollHeight/clientHeight, so this stays accurate even while a
        // previous scale is already applied.
        const naturalH = wrapper.scrollHeight;
        if (!availableH || !naturalH) return;
        const next = naturalH > availableH ? Math.max(0.32, availableH / naturalH) : 1;
        setPageScale(prev => (Math.abs(prev - next) > 0.005 ? next : prev));
      });
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    ro.observe(wrapper);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [pageLines, lineFontSizes, linesReady, showTranslation, currentPage, selected != null]);

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

  // ── Swipe handling ───────────────────────────────────────────────────────
  // Arabic reading order, not English: pages advance Al-Fātiḥah → An-Nās as
  // page numbers climb, and swiping *right* moves forward to the next page
  // (the reverse of an LTR book's swipe-left-for-next). Swiping left goes
  // back a page. The gesture's axis is locked on first movement so a page
  // that's tall enough to need vertical scrolling never mistakes a scroll
  // for a page-turn just because the finger also drifted sideways a little.
  const onTouchStart = (e: ReactTouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchDeltaX.current = 0;
    swipeAxisRef.current = null;
  };
  const onTouchMove = (e: ReactTouchEvent) => {
    if (touchStartX.current == null || touchStartY.current == null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (swipeAxisRef.current == null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // not enough movement to tell yet
      swipeAxisRef.current = Math.abs(dx) > Math.abs(dy) * 1.3 ? "horizontal" : "vertical";
    }
    if (swipeAxisRef.current === "horizontal") {
      if (e.cancelable) e.preventDefault(); // own the gesture; don't also scroll
      touchDeltaX.current = dx;
      setDragX(dx);
    }
    // "vertical" gestures are left alone entirely — the page's normal
    // vertical scroll (for pages taller than the fitted scale allows) handles them.
  };
  const onTouchEnd = () => {
    const dx = touchDeltaX.current;
    if (swipeAxisRef.current === "horizontal") {
      if (dx >= SWIPE_THRESHOLD) goToPage(currentPage + 1, "next");
      else if (dx <= -SWIPE_THRESHOLD) goToPage(currentPage - 1, "prev");
    }
    setDragX(0);
    touchStartX.current = null;
    touchStartY.current = null;
    touchDeltaX.current = 0;
    swipeAxisRef.current = null;
  };

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

          {/* ── Toolbar — single scrollable row, nothing wraps to a second line ── */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderBottom: `1px solid ${Q_BORDER}`,
            background: "#fff", flexWrap: "nowrap", overflowX: "auto", WebkitOverflowScrolling: "touch",
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
          <div style={{ ...dropdownStyle(), position: "fixed", left: reciterMenuAnchor.left, top: reciterMenuAnchor.top, zIndex: 40 }}>
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
          <div style={{ ...dropdownStyle(), position: "fixed", left: speedMenuAnchor.left, top: speedMenuAnchor.top, minWidth: 90, zIndex: 40 }}>
            {[0.75, 1, 1.25, 1.5].map(r => (
              <button key={r} onClick={() => { engine.setRate(r); setSpeedMenuAnchor(null); }} style={dropdownItemStyle(r === engine.rate)}>{r}x</button>
            ))}
          </div>
        </>
      )}

      {/* ── Page content — swipe left/right to turn pages ── */}
      <div
        ref={pageBoxRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          flex: 1, overflow: "hidden", padding: selected != null ? "10px 16px 60px" : "10px 16px", position: "relative",
          touchAction: "pan-y", display: "flex", justifyContent: "center", alignItems: "flex-start",
        }}
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: Q_MUTED }}>{t("Loading page…", "جاري تحميل الصفحة…")}</div>
        ) : (
          <div
            key={currentPage}
            ref={scaleWrapperRef}
            style={{
              width: "100%", maxWidth: 720,
              transform: `translateX(${dragTranslate}px) scale(${pageScale})`,
              transformOrigin: "top center",
              opacity: linesReady ? 1 : 0,
              animation: slideDir === "next" ? "quranPageInFromLeft .28s ease" : slideDir === "prev" ? "quranPageInFromRight .28s ease" : undefined,
              transition: dragX === 0 ? "transform .2s ease, opacity .15s ease" : "opacity .15s ease",
            }}
          >
            {(() => {
              const wordSpan = (surah: number, ayah: number, text: string, isAyahEnd: boolean, key: string, isFirstOfAyah: boolean) => (
                <span
                  key={key}
                  ref={isFirstOfAyah ? (el => { verseRefs.current[`${surah}-${ayah}`] = el; }) : undefined}
                  onClick={() => handleVerseTap(surah, ayah)}
                  style={{
                    cursor: "pointer", borderRadius: 6, padding: "2px 1px",
                    background: (engine.currentSurah === surah && engine.currentAyah === ayah) ? Q_GOLD
                      : (selected?.surah === surah && selected?.ayah === ayah) ? Q_PARCH_ALT : "transparent",
                    transition: "background .2s",
                  }}
                >
                  {text}
                  {isAyahEnd && <span style={{ fontSize: "0.67em", color: Q_GOLD_DARK, margin: "0 3px" }}>﴿{toArabicNum(ayah)}﴾</span>}
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
                      borderRadius: 10, padding: 3,
                      background: `linear-gradient(135deg, ${Q_GOLD_DARK} 0%, ${Q_GOLD} 45%, #e9d18f 70%, ${Q_GOLD_DARK} 100%)`,
                      boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                    }}>
                      <div style={{
                        borderRadius: 7, border: `1px solid ${Q_GOLD}`, background: Q_PARCH_ALT,
                        backgroundImage: `repeating-linear-gradient(135deg, rgba(201,168,76,0.08) 0 5px, transparent 5px 11px)`,
                        padding: "9px 16px", textAlign: "center",
                      }}>
                        <span style={{ fontFamily: Q_ARABIC_FONT, fontSize: 22, color: Q_GREEN, fontWeight: 700 }}>
                          سُورَةُ {meta.nameAr}
                        </span>
                      </div>
                    </div>
                    {ayah === 1 && surah !== 9 && (
                      <div style={{ fontFamily: Q_ARABIC_FONT, fontSize: BASE_LINE_FONT_SIZE, color: Q_INK, marginTop: 18, textAlign: "center", opacity: 0.92 }}>
                        {BISMILLAH}
                      </div>
                    )}
                  </div>
                );
              };

              // ── Preferred: true mushaf layout — one <div> per printed line,
              // justified edge-to-edge so word position matches the physical
              // page. Falls back to the free-flowing paragraph below if the
              // line-layout fetch didn't succeed for this page. ──
              if (pageLines && pageLines.length) {
                let lastSurahRendered: number | null = null;
                const seenAyah = new Set<string>();
                return (
                  <div ref={linesContainerRef} dir="rtl" lang="ar" style={{ fontFamily: Q_ARABIC_FONT, color: Q_INK }}>
                    {pageLines.map(line => {
                      const firstWord = line.words[0];
                      const showDivider = firstWord && firstWord.surah !== lastSurahRendered;
                      if (firstWord) lastSurahRendered = firstWord.surah;
                      const lineFontSize = lineFontSizes[line.lineNumber] ?? BASE_LINE_FONT_SIZE;
                      return (
                        <div key={line.lineNumber}>
                          {showDivider && surahDivider(firstWord.surah, firstWord.ayah, line.lineNumber === pageLines[0].lineNumber)}
                          <div
                            style={{
                              direction: "rtl", textAlign: "justify", textAlignLast: "justify" as any,
                              lineHeight: 2.1, fontSize: lineFontSize, whiteSpace: "nowrap", overflow: "hidden",
                            }}
                          >
                            {line.words.map((w, i) => {
                              const key = `${w.surah}-${w.ayah}-${line.lineNumber}-${i}`;
                              const ayahKey = `${w.surah}-${w.ayah}`;
                              const isFirstOfAyah = !seenAyah.has(ayahKey);
                              seenAyah.add(ayahKey);
                              return wordSpan(w.surah, w.ayah, w.text, w.isAyahEnd, key, isFirstOfAyah);
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }

              let lastSurahRendered: number | null = null;
              return (
                <div dir="rtl" lang="ar" style={{ fontFamily: Q_ARABIC_FONT, fontSize: 26, lineHeight: 2.1, color: Q_INK, textAlign: "justify" }}>
                  {verses.map((v, i) => {
                    const showDivider = v.surah !== lastSurahRendered;
                    lastSurahRendered = v.surah;
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
        )}
      </div>

      {/* ── Selected-verse action bar ── */}
      {selected != null && (
        <div style={{
          position: "fixed", left: 0, right: 0, bottom: 0, background: Q_GREEN, color: "#fff",
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
        @keyframes quranPageInFromRight { from { opacity:0; transform:translateX(40px); } to { opacity:1; transform:translateX(0); } }
        @keyframes quranPageInFromLeft { from { opacity:0; transform:translateX(-40px); } to { opacity:1; transform:translateX(0); } }
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

