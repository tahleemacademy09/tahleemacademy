// src/pages/student/QuranPage.tsx
// Al-Qur'an — full Mushaf-style reader for students.
// Verses flow as one continuous passage — like a real Mushaf — and scrolling
// past the end of a surah automatically loads the next one in, so reading
// never has to stop and go through the surah picker or search. Tapping any
// verse selects + plays it and opens a small action bar (play / play-from-
// here / repeat / bookmark).
import type { CSSProperties } from "react";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen, Search, X, Play, Pause, Repeat, Repeat1, Star, ChevronDown,
  SkipForward, Gauge, Languages, ListMusic, Bookmark, ArrowLeft, PlusCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { SURAHS, RECITERS, DEFAULT_RECITER } from "@/components/hifdh/surahData";
import { getSurahText, getFullQuranText, searchQuranText, QuranVerse } from "@/lib/quranTextApi";
import { listRecitationsForSurah, CustomRecitation } from "@/lib/quranRecitations";
import { buildAyahSegments, CUSTOM_RECITER_PREFIX } from "@/lib/quranPlaybackSource";
import { useQuranAudioEngine } from "@/hooks/useQuranAudioEngine";
import {
  Q_GREEN, Q_GREEN_MID, Q_GOLD, Q_GOLD_DARK, Q_PARCHMENT, Q_PARCH_ALT,
  Q_INK, Q_BORDER, Q_MUTED, Q_ARABIC_FONT,
} from "@/components/quran/quranReaderTokens";

const db: any = supabase;
const BISMILLAH = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";
const AR_NUMERALS = ["٠","١","٢","٣","٤","٥","٦","٧","٨","٩"];
const toArabicNum = (n: number) => String(n).split("").map(d => AR_NUMERALS[Number(d)] ?? d).join("");

const LAST_SURAH_KEY = "quran_last_surah";
const RECITER_KEY = "quran_reciter";
const TRANSLATION_KEY = "quran_show_translation";

type SidebarTab = "surah" | "juz" | "bookmarks";

interface LoadedSurah {
  surahNumber: number;
  verses: QuranVerse[];
  customRecitations: CustomRecitation[];
}

async function loadSurahEntry(surahNumber: number): Promise<LoadedSurah> {
  const [verses, customRecitations] = await Promise.all([
    getSurahText(surahNumber, true),
    listRecitationsForSurah(surahNumber).then(list => list.filter(r => r.is_published)).catch(() => []),
  ]);
  return { surahNumber, verses, customRecitations };
}

export default function QuranPage() {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const userId = user?.id ?? null;
  const isStaff = hasRole("admin") || hasRole("teacher");

  const [loadedSurahs, setLoadedSurahs] = useState<LoadedSurah[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [activeSurahNumber, setActiveSurahNumber] = useState<number>(1);

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
  const dividerObserverRef = useRef<IntersectionObserver | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lastLoadedNumRef = useRef<number>(1);
  const loadingMoreRef = useRef(false);
  const reachedEndRef = useRef(false);

  const activeSurah = SURAHS.find(s => s.num === activeSurahNumber) ?? SURAHS[0];
  const activeEntry = loadedSurahs.find(e => e.surahNumber === activeSurahNumber);

  const engine = useQuranAudioEngine();

  // ── Initial load (last-read surah, or Al-Fatihah) ───────────────────────
  useEffect(() => {
    const saved = Number(localStorage.getItem(LAST_SURAH_KEY));
    const start = saved >= 1 && saved <= 114 ? saved : 1;
    jumpToSurah(start);
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
    if (!userId) return;
    const timeout = setTimeout(() => {
      db.from("quran_reading_progress").upsert(
        { user_id: userId, last_surah: activeSurahNumber, last_ayah: selected?.ayah ?? 1, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      ).then(() => {});
    }, 1500);
    return () => clearTimeout(timeout);
  }, [userId, activeSurahNumber, selected]);

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

  // ── Jump to a surah: clears the continuous list and starts fresh there ──
  const jumpToSurah = useCallback((num: number, ayahToSelect?: number) => {
    setLoadingInitial(true);
    setReachedEnd(false);
    reachedEndRef.current = false;
    setSelected(null);
    engine.stop();
    loadSurahEntry(num).then(entry => {
      setLoadedSurahs([entry]);
      lastLoadedNumRef.current = num;
      setActiveSurahNumber(num);
      setLoadingInitial(false);
      localStorage.setItem(LAST_SURAH_KEY, String(num));
      if (ayahToSelect) {
        setTimeout(() => {
          setSelected({ surah: num, ayah: ayahToSelect });
          verseRefs.current[`${num}-${ayahToSelect}`]?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 300);
      }
    }).catch(() => setLoadingInitial(false));
    setSidebarOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Continuous scroll: load the next surah in when nearing the bottom ──
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || reachedEndRef.current) return;
    if (lastLoadedNumRef.current >= 114) {
      reachedEndRef.current = true;
      setReachedEnd(true);
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const next = lastLoadedNumRef.current + 1;
    try {
      const entry = await loadSurahEntry(next);
      lastLoadedNumRef.current = next;
      setLoadedSurahs(prev => [...prev, entry]);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    const el = bottomSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore();
    }, { root: scrollContainerRef.current, rootMargin: "800px 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore, loadingInitial]);

  // ── Track which surah is "active" (drives the header + toolbar context) ─
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const num = Number((e.target as HTMLElement).dataset.surah);
          if (num) setActiveSurahNumber(num);
        }
      });
    }, { root: scrollContainerRef.current, rootMargin: "-40% 0px -55% 0px", threshold: 0 });
    dividerObserverRef.current = obs;
    return () => obs.disconnect();
  }, []);
  const registerDivider = useCallback((surahNumber: number) => (el: HTMLDivElement | null) => {
    if (el) { el.dataset.surah = String(surahNumber); dividerObserverRef.current?.observe(el); }
  }, []);

  useEffect(() => {
    if (autoScroll && engine.currentAyah != null && engine.currentSurah != null) {
      verseRefs.current[`${engine.currentSurah}-${engine.currentAyah}`]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [engine.currentAyah, engine.currentSurah, autoScroll]);

  const availableReciters = useMemo(() => {
    const custom = (activeEntry?.customRecitations ?? []).map(r => ({
      id: `${CUSTOM_RECITER_PREFIX}${r.id}`, label: r.reciter_name, isCustom: true,
    }));
    return [...custom, ...RECITERS.map(r => ({ ...r, isCustom: false }))];
  }, [activeEntry]);

  const currentReciterLabel = availableReciters.find(r => r.id === reciterId)?.label ?? availableReciters[0]?.label ?? "";

  const segmentsFor = useCallback((entry: LoadedSurah) =>
    buildAyahSegments(entry.surahNumber, entry.verses.length, reciterId, entry.customRecitations),
  [reciterId]);

  const handleVerseTap = (entry: LoadedSurah, ayah: number) => {
    setSelected({ surah: entry.surahNumber, ayah });
    setActiveSurahNumber(entry.surahNumber);
    engine.playAyah(entry.surahNumber, segmentsFor(entry), ayah);
  };

  const playActiveSurahFromStart = () => {
    if (!activeEntry) return;
    engine.playFrom(activeEntry.surahNumber, segmentsFor(activeEntry), 1);
  };

  const playFromSelected = () => {
    if (!selected) return;
    const entry = loadedSurahs.find(e => e.surahNumber === selected.surah);
    if (!entry) return;
    engine.playFrom(entry.surahNumber, segmentsFor(entry), selected.ayah);
  };

  const toggleActivePlayPause = () => {
    if (engine.isPlaying && engine.currentSurah === activeSurahNumber) engine.pause();
    else if (engine.currentSurah === activeSurahNumber && engine.currentAyah != null) engine.resume();
    else playActiveSurahFromStart();
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
  const jumpToResult = (v: QuranVerse) => {
    setSearchOpen(false);
    jumpToSurah(v.surah, v.ayah);
  };

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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: Q_PARCHMENT }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: Q_GREEN, color: "#fff" }}>
        <button onClick={() => setSidebarOpen(true)} style={iconBtnStyle("#fff")}>
          <BookOpen size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{t("Al-Qur'an Al-Kareem", "القرآن الكريم")}</div>
          <div style={{ fontSize: 12, opacity: 0.85, display: "flex", alignItems: "center", gap: 6 }}>
            <span>{activeSurah.num}. {activeSurah.name}</span>
            <span style={{ fontFamily: Q_ARABIC_FONT }}>{activeSurah.nameAr}</span>
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
          {engine.isPlaying && engine.currentSurah === activeSurahNumber ? <Pause size={13} /> : <Play size={13} />}
          {t("Play Surah", "تشغيل السورة")}
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

      {/* Reciter / speed menus render fixed + outside the toolbar so the
          toolbar's horizontal scroll (needed to keep every control on one
          line) never clips them, and a full-screen backdrop closes them. */}
      {reciterMenuAnchor && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 35 }} onClick={() => setReciterMenuAnchor(null)} />
          <div style={{ ...dropdownStyle(), position: "fixed", left: reciterMenuAnchor.left, top: reciterMenuAnchor.top }}>
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
          <div style={{ ...dropdownStyle(), position: "fixed", left: speedMenuAnchor.left, top: speedMenuAnchor.top, minWidth: 90 }}>
            {[0.75, 1, 1.25, 1.5].map(r => (
              <button key={r} onClick={() => { engine.setRate(r); setSpeedMenuAnchor(null); }} style={dropdownItemStyle(r === engine.rate)}>{r}x</button>
            ))}
          </div>
        </>
      )}

      {/* ── Verse content — continuous scroll across surahs ── */}
      <div ref={scrollContainerRef} style={{ flex: 1, overflowY: "auto", padding: "18px 16px 100px" }}>
        {loadingInitial ? (
          <div style={{ textAlign: "center", padding: 40, color: Q_MUTED }}>{t("Loading verses…", "جاري تحميل الآيات…")}</div>
        ) : (
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            {loadedSurahs.map(entry => {
              const meta = SURAHS.find(s => s.num === entry.surahNumber)!;
              return (
                <div key={entry.surahNumber} style={{ marginBottom: 36 }}>
                  <div ref={registerDivider(entry.surahNumber)} style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10, margin: "0 0 18px",
                    padding: "10px 0", borderTop: `1px solid ${Q_BORDER}`, borderBottom: `1px solid ${Q_BORDER}`,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: Q_GOLD_DARK, letterSpacing: 1 }}>
                      {entry.surahNumber}. {meta.name.toUpperCase()}
                    </span>
                    <span style={{ fontFamily: Q_ARABIC_FONT, fontSize: 18, color: Q_GREEN }}>{meta.nameAr}</span>
                  </div>

                  {entry.surahNumber !== 9 && (
                    <div style={{ textAlign: "center", fontFamily: Q_ARABIC_FONT, fontSize: 26, color: Q_INK, marginBottom: 18, opacity: 0.9 }}>
                      {BISMILLAH}
                    </div>
                  )}

                  <p dir="rtl" lang="ar" style={{ fontFamily: Q_ARABIC_FONT, fontSize: 26, lineHeight: 2.1, color: Q_INK, textAlign: "justify", margin: 0 }}>
                    {entry.verses.map(v => (
                      <span
                        key={v.ayah}
                        ref={el => { verseRefs.current[`${entry.surahNumber}-${v.ayah}`] = el; }}
                        onClick={() => handleVerseTap(entry, v.ayah)}
                        style={{
                          cursor: "pointer", borderRadius: 6, padding: "2px 1px",
                          background: (engine.currentSurah === entry.surahNumber && engine.currentAyah === v.ayah) ? Q_GOLD
                            : (selected?.surah === entry.surahNumber && selected?.ayah === v.ayah) ? Q_PARCH_ALT : "transparent",
                          transition: "background .2s",
                        }}
                      >
                        {v.text}
                        <span style={{ fontSize: 16, color: Q_GOLD_DARK, margin: "0 3px" }}>﴿{toArabicNum(v.ayah)}﴾</span>{" "}
                      </span>
                    ))}
                  </p>

                  {showTranslation && (
                    <div style={{ marginTop: 24, borderTop: `1px dashed ${Q_BORDER}`, paddingTop: 16 }}>
                      {entry.verses.map(v => (
                        <div key={v.ayah} style={{ marginBottom: 10, fontSize: 13, color: (selected?.surah === entry.surahNumber && selected?.ayah === v.ayah) ? Q_GREEN_MID : "#444" }}>
                          <b style={{ color: Q_GOLD_DARK }}>{v.ayah}.</b> {v.translation}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <div ref={bottomSentinelRef} style={{ height: 1 }} />
            {loadingMore && <div style={{ textAlign: "center", padding: 20, color: Q_MUTED, fontSize: 13 }}>{t("Loading next surah…", "جاري تحميل السورة التالية…")}</div>}
            {reachedEnd && (
              <div style={{ textAlign: "center", padding: 40, color: Q_MUTED }}>
                <div style={{ fontFamily: Q_ARABIC_FONT, fontSize: 22, color: Q_GREEN, marginBottom: 6 }}>صدق الله العظيم</div>
                <div style={{ fontSize: 13 }}>{t("You've reached the end of the Qur'an.", "لقد وصلت إلى نهاية القرآن الكريم.")}</div>
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
            else {
              const entry = loadedSurahs.find(e => e.surahNumber === selected.surah);
              if (entry) engine.playAyah(entry.surahNumber, segmentsFor(entry), selected.ayah);
            }
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
                    <button key={s.num} onClick={() => jumpToSurah(s.num)} style={{
                      display: "flex", alignItems: "center", width: "100%", padding: "10px 14px", border: "none",
                      borderBottom: `1px solid ${Q_PARCH_ALT}`, background: s.num === activeSurahNumber ? Q_PARCH_ALT : "#fff",
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
                  {t("Jumps to the surah where each Juz' begins.", "ينتقل إلى بداية سورة كل جزء.")}
                </p>
                {Array.from({ length: 30 }, (_, i) => i + 1).map(j => (
                  <button key={j} onClick={() => jumpToSurah(juzStarts[j] ?? 1)} style={{
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
                  <button key={i} onClick={() => jumpToSurah(b.surah_number, b.ayah_number)} style={{
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
              <button key={i} onClick={() => jumpToResult(v)} style={{
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
