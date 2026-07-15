// src/pages/student/QuranPage.tsx
// Al-Qur'an — full Mushaf-style reader for students.
// Verse text flows as one continuous passage per surah (like a real Mushaf
// page) rather than a chat-style list; tapping any verse selects + plays it
// and opens a small action bar (play / play-from-here / repeat / bookmark).
import type { CSSProperties } from "react";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  BookOpen, Search, X, Play, Pause, Repeat, Repeat1, Star, ChevronDown,
  SkipForward, Gauge, Languages, ListMusic, Bookmark, ArrowLeft,
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

export default function QuranPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const userId = user?.id ?? null;

  const [surahNumber, setSurahNumber] = useState<number>(() => {
    const saved = Number(localStorage.getItem(LAST_SURAH_KEY));
    return saved >= 1 && saved <= 114 ? saved : 1;
  });
  const [verses, setVerses] = useState<QuranVerse[]>([]);
  const [loadingVerses, setLoadingVerses] = useState(true);
  const [customRecitations, setCustomRecitations] = useState<CustomRecitation[]>([]);
  const [reciterId, setReciterId] = useState<string>(() => localStorage.getItem(RECITER_KEY) || DEFAULT_RECITER);
  const [showTranslation, setShowTranslation] = useState(() => localStorage.getItem(TRANSLATION_KEY) === "1");
  const [selectedAyah, setSelectedAyah] = useState<number | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("surah");
  const [surahQuery, setSurahQuery] = useState("");

  const [reciterMenuOpen, setReciterMenuOpen] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [fullQuran, setFullQuran] = useState<QuranVerse[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [bookmarks, setBookmarks] = useState<{ surah_number: number; ayah_number: number }[]>([]);

  const verseRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const surah = SURAHS.find(s => s.num === surahNumber)!;

  // ── Load verse text for the selected surah ─────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoadingVerses(true);
    setSelectedAyah(null);
    getSurahText(surahNumber, true).then(v => {
      if (!cancelled) { setVerses(v); setLoadingVerses(false); }
    }).catch(() => { if (!cancelled) setLoadingVerses(false); });
    localStorage.setItem(LAST_SURAH_KEY, String(surahNumber));
    return () => { cancelled = true; };
  }, [surahNumber]);

  // ── Load any admin-recorded recitations available for this surah ───────
  useEffect(() => {
    let cancelled = false;
    listRecitationsForSurah(surahNumber).then(list => {
      if (!cancelled) setCustomRecitations(list.filter(r => r.is_published));
    }).catch(() => { if (!cancelled) setCustomRecitations([]); });
    return () => { cancelled = true; };
  }, [surahNumber]);

  // ── Bookmarks + reading-progress (per user) ─────────────────────────────
  useEffect(() => {
    if (!userId) return;
    db.from("quran_bookmarks").select("surah_number,ayah_number").eq("user_id", userId)
      .then(({ data }: any) => setBookmarks(data ?? []));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const timeout = setTimeout(() => {
      db.from("quran_reading_progress").upsert(
        { user_id: userId, last_surah: surahNumber, last_ayah: selectedAyah ?? 1, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      ).then(() => {});
    }, 1500);
    return () => clearTimeout(timeout);
  }, [userId, surahNumber, selectedAyah]);

  const isBookmarked = useCallback((ayah: number) =>
    bookmarks.some(b => b.surah_number === surahNumber && b.ayah_number === ayah), [bookmarks, surahNumber]);

  const toggleBookmark = useCallback((ayah: number) => {
    if (!userId) return;
    if (isBookmarked(ayah)) {
      setBookmarks(prev => prev.filter(b => !(b.surah_number === surahNumber && b.ayah_number === ayah)));
      db.from("quran_bookmarks").delete().eq("user_id", userId).eq("surah_number", surahNumber).eq("ayah_number", ayah).then(() => {});
    } else {
      setBookmarks(prev => [...prev, { surah_number: surahNumber, ayah_number: ayah }]);
      db.from("quran_bookmarks").insert({ user_id: userId, surah_number: surahNumber, ayah_number: ayah }).then(() => {});
    }
  }, [userId, isBookmarked, surahNumber]);

  // ── Audio engine ─────────────────────────────────────────────────────
  const segments = useMemo(
    () => buildAyahSegments(surahNumber, surah.verses, reciterId, customRecitations),
    [surahNumber, surah.verses, reciterId, customRecitations]
  );
  const engine = useQuranAudioEngine(segments);

  useEffect(() => {
    if (autoScroll && engine.currentAyah != null) {
      verseRefs.current[engine.currentAyah]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [engine.currentAyah, autoScroll]);

  const availableReciters = useMemo(() => {
    const custom = customRecitations.map(r => ({ id: `${CUSTOM_RECITER_PREFIX}${r.id}`, label: r.reciter_name, labelAr: r.reciter_name_ar || r.reciter_name, isCustom: true }));
    return [...custom, ...RECITERS.map(r => ({ ...r, isCustom: false }))];
  }, [customRecitations]);

  const currentReciterLabel = availableReciters.find(r => r.id === reciterId)?.label
    ?? availableReciters[0]?.label ?? "";

  const selectSurah = (num: number) => {
    setSurahNumber(num);
    setSidebarOpen(false);
    engine.stop();
  };

  const handleVerseTap = (ayah: number) => {
    setSelectedAyah(ayah);
    engine.playAyah(ayah);
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
    setSurahNumber(v.surah);
    setTimeout(() => { setSelectedAyah(v.ayah); verseRefs.current[v.ayah]?.scrollIntoView({ behavior: "smooth", block: "center" }); }, 400);
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
            <span>{surah.num}. {surah.name}</span>
            <span style={{ fontFamily: Q_ARABIC_FONT }}>{surah.nameAr}</span>
          </div>
        </div>
        <button onClick={openSearch} style={iconBtnStyle("#fff")}><Search size={18} /></button>
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderBottom: `1px solid ${Q_BORDER}`, background: "#fff", flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <button onClick={() => setReciterMenuOpen(o => !o)} style={pillBtnStyle()}>
            <ListMusic size={13} /> {currentReciterLabel} <ChevronDown size={12} />
          </button>
          {reciterMenuOpen && (
            <div style={dropdownStyle()}>
              {availableReciters.map(r => (
                <button key={r.id} onClick={() => { setReciterId(r.id); localStorage.setItem(RECITER_KEY, r.id); setReciterMenuOpen(false); engine.stop(); }}
                  style={dropdownItemStyle(r.id === reciterId)}>
                  {(r as any).isCustom && <span style={{ fontSize: 10, color: Q_GOLD_DARK, marginRight: 4 }}>★</span>}
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => engine.isPlaying ? engine.pause() : (engine.currentAyah ? engine.resume() : engine.playFrom(1))}
          style={pillBtnStyle(true)}
        >
          {engine.isPlaying ? <Pause size={13} /> : <Play size={13} />}
          {t("Play Surah", "تشغيل السورة")}
        </button>

        <button
          onClick={() => engine.setRepeatMode(engine.repeatMode === "off" ? "verse" : engine.repeatMode === "verse" ? "surah" : "off")}
          style={pillBtnStyle(engine.repeatMode !== "off")}
          title={t("Repeat mode", "وضع التكرار")}
        >
          {engine.repeatMode === "verse" ? <Repeat1 size={13} /> : <Repeat size={13} />}
          {engine.repeatMode === "off" ? t("Repeat: Off", "التكرار: إيقاف") : engine.repeatMode === "verse" ? t("Repeat: Verse", "تكرار الآية") : t("Repeat: Surah", "تكرار السورة")}
        </button>

        <div style={{ position: "relative" }}>
          <button onClick={() => setSpeedMenuOpen(o => !o)} style={pillBtnStyle()}>
            <Gauge size={13} /> {engine.rate}x
          </button>
          {speedMenuOpen && (
            <div style={dropdownStyle()}>
              {[0.75, 1, 1.25, 1.5].map(r => (
                <button key={r} onClick={() => { engine.setRate(r); setSpeedMenuOpen(false); }} style={dropdownItemStyle(r === engine.rate)}>{r}x</button>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => { const v = !showTranslation; setShowTranslation(v); localStorage.setItem(TRANSLATION_KEY, v ? "1" : "0"); }} style={pillBtnStyle(showTranslation)}>
          <Languages size={13} /> {t("Translation", "الترجمة")}
        </button>
      </div>

      {/* ── Verse content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 16px 100px" }}>
        {loadingVerses ? (
          <div style={{ textAlign: "center", padding: 40, color: Q_MUTED }}>{t("Loading verses…", "جاري تحميل الآيات…")}</div>
        ) : (
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            {surahNumber !== 9 && (
              <div style={{ textAlign: "center", fontFamily: Q_ARABIC_FONT, fontSize: 26, color: Q_INK, marginBottom: 18, opacity: 0.9 }}>
                {BISMILLAH}
              </div>
            )}
            <p dir="rtl" lang="ar" style={{ fontFamily: Q_ARABIC_FONT, fontSize: 26, lineHeight: 2.1, color: Q_INK, textAlign: "justify", margin: 0 }}>
              {verses.map(v => (
                <span
                  key={v.ayah}
                  ref={el => { verseRefs.current[v.ayah] = el; }}
                  onClick={() => handleVerseTap(v.ayah)}
                  style={{
                    cursor: "pointer",
                    borderRadius: 6,
                    padding: "2px 1px",
                    background: engine.currentAyah === v.ayah ? Q_GOLD : selectedAyah === v.ayah ? Q_PARCH_ALT : "transparent",
                    transition: "background .2s",
                  }}
                >
                  {v.text}
                  <span style={{ fontSize: 16, color: Q_GOLD_DARK, margin: "0 3px" }}>
                    ﴿{toArabicNum(v.ayah)}﴾
                  </span>{" "}
                </span>
              ))}
            </p>

            {showTranslation && (
              <div style={{ marginTop: 24, borderTop: `1px dashed ${Q_BORDER}`, paddingTop: 16 }}>
                {verses.map(v => (
                  <div key={v.ayah} style={{ marginBottom: 10, fontSize: 13, color: selectedAyah === v.ayah ? Q_GREEN_MID : "#444" }}>
                    <b style={{ color: Q_GOLD_DARK }}>{v.ayah}.</b> {v.translation}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Selected-verse action bar ── */}
      {selectedAyah != null && (
        <div style={{
          position: "fixed", left: 0, right: 0, bottom: 0, background: Q_GREEN, color: "#fff",
          padding: "10px 14px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 -4px 12px rgba(0,0,0,0.15)",
        }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{surah.name} {selectedAyah}</span>
          <button onClick={() => engine.isPlaying && engine.currentAyah === selectedAyah ? engine.pause() : engine.playAyah(selectedAyah)} style={iconBtnStyle("#fff")}>
            {engine.isPlaying && engine.currentAyah === selectedAyah ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button onClick={() => engine.playFrom(selectedAyah)} style={iconBtnStyle("#fff")} title={t("Play from here", "التشغيل من هنا")}>
            <SkipForward size={16} />
          </button>
          <button onClick={() => toggleBookmark(selectedAyah)} style={iconBtnStyle(isBookmarked(selectedAyah) ? Q_GOLD : "#fff")}>
            <Star size={16} fill={isBookmarked(selectedAyah) ? Q_GOLD : "none"} />
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={() => { setSelectedAyah(null); engine.stop(); }} style={iconBtnStyle("#fff")}><X size={16} /></button>
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
                    <button key={s.num} onClick={() => selectSurah(s.num)} style={{
                      display: "flex", alignItems: "center", width: "100%", padding: "10px 14px", border: "none",
                      borderBottom: `1px solid ${Q_PARCH_ALT}`, background: s.num === surahNumber ? Q_PARCH_ALT : "#fff",
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
                  <button key={j} onClick={() => selectSurah(juzStarts[j] ?? 1)} style={{
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
                  <button key={i} onClick={() => { setSurahNumber(b.surah_number); setSidebarOpen(false); setTimeout(() => setSelectedAyah(b.ayah_number), 400); }} style={{
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
    color: active ? "#fff" : Q_INK, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  };
}
function dropdownStyle(): CSSProperties {
  return {
    position: "absolute", top: "110%", left: 0, background: "#fff", border: `1px solid ${Q_BORDER}`,
    borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,0.15)", zIndex: 30, minWidth: 200, maxHeight: 280, overflowY: "auto",
  };
}
function dropdownItemStyle(active: boolean): CSSProperties {
  return {
    display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none",
    background: active ? Q_PARCH_ALT : "#fff", color: Q_INK, fontSize: 13, cursor: "pointer",
  };
}
