// src/components/hifdh/HifdhRecitation.tsx
// Fully upgraded: auto-count per ayah, bookmarks, session stats,
// surah progress bar, per-ayah loop tracking, reciter panel.
import { useState, useEffect, useRef, useCallback } from "react";
import { SURAHS, audioUrl, RECITERS, DEFAULT_RECITER } from "./surahData";
import { audioManager } from "./audioManager";
import ReciterControls from "./ReciterControls";

interface Ayah     { numberInSurah: number; text: string; }
interface SurahData { englishName: string; name: string; numberOfAyahs: number; ayahs: Ayah[]; }

const G = "#1a3d24"; const GM = "#276749"; const GOLD = "#b7791f";
const LIGHT = "#f0fff4"; const BORDER = "#d4e8d4";

function toAr(n: number) { return String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]); }
function fmtTime(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface Props { reciter?: string; onReciterChange?: (id: string) => void; }

export default function HifdhRecitation({ reciter: reciterProp, onReciterChange }: Props = {}) {
  const [selSurah,    setSelSurah]    = useState(1);
  const [surahData,   setSurahData]   = useState<SurahData | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [fontSize,    setFontSize]    = useState(26);
  const [playingAyah, setPlayingAyah] = useState(0);
  const [isFullscreen, setIsFS]       = useState(false);
  const [showList,    setShowList]    = useState(false);
  const [search,      setSearch]      = useState("");
  const [reciter,     setReciter]     = useState(reciterProp || DEFAULT_RECITER);

  // ── Auto-count: tracks plays per ayah in current session ──────────────────
  const [ayahCounts,    setAyahCounts]    = useState<Record<number, number>>({});
  const [sessionStart]                    = useState(() => Date.now());
  const [sessionTick,   setSessionTick]   = useState(0);   // forces re-render for clock

  // ── Bookmarks ─────────────────────────────────────────────────────────────
  const [bookmarks,     setBookmarks]     = useState<Set<number>>(new Set());
  const [showBookmarks, setShowBookmarks] = useState(false);

  // Refs — avoid stale closures inside audio callbacks
  const audioRef     = useRef<HTMLAudioElement | null>(null);
  const playingRef   = useRef(0);
  const surahDataRef = useRef<SurahData | null>(null);
  const selSurahRef  = useRef(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const verseRefs    = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => { surahDataRef.current = surahData; }, [surahData]);
  useEffect(() => { selSurahRef.current  = selSurah; },  [selSurah]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  // Session timer — updates every 10s for display
  useEffect(() => {
    const iv = setInterval(() => setSessionTick(t => t + 1), 10000);
    return () => clearInterval(iv);
  }, []);

  const stopAll = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    playingRef.current = 0;
    setPlayingAyah(0);
  }, []);

  const fetchSurah = useCallback(async (num: number) => {
    setLoading(true); setError(""); setSurahData(null); stopAll();
    setAyahCounts({});  // reset counts on surah change
    try {
      const res  = await fetch(`https://api.alquran.cloud/v1/surah/${num}/ar.uthmani`);
      const json = await res.json();
      if (json.code === 200) setSurahData(json.data);
      else setError("Could not load this surah — please try again.");
    } catch { setError("Network error — check your connection."); }
    setLoading(false);
  }, [stopAll]);

  useEffect(() => { fetchSurah(selSurah); }, [selSurah, fetchSurah]);

  // ── Play an ayah and increment its count ──────────────────────────────────
  const playAyah = useCallback((num: number) => {
    audioRef.current?.pause();
    audioRef.current = null;
    const sd = surahDataRef.current;
    if (!sd || num < 1 || num > sd.numberOfAyahs) { stopAll(); return; }

    playingRef.current = num;
    setPlayingAyah(num);

    // Increment play count for this ayah
    setAyahCounts(prev => ({ ...prev, [num]: (prev[num] ?? 0) + 1 }));

    requestAnimationFrame(() => {
      verseRefs.current[num]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    const audio = new Audio(audioUrl(selSurahRef.current, num, reciter));
    audioRef.current  = audio;
    audio.play().catch(stopAll);
    audio.onended = () => {
      const next  = playingRef.current + 1;
      const total = surahDataRef.current?.numberOfAyahs ?? 0;
      if (next <= total) playAyah(next);
      else stopAll();
    };
  }, [stopAll, reciter]);

  // Fullscreen
  const toggleFS = () => {
    if (!isFullscreen) containerRef.current?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
    setIsFS(v => !v);
  };
  useEffect(() => {
    const h = () => setIsFS(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  // Bookmark helpers
  const toggleBookmark = (num: number) => {
    setBookmarks(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num); else next.add(num);
      return next;
    });
  };

  const surah    = SURAHS[selSurah - 1];
  const filtered = SURAHS.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.nameAr.includes(search) || String(s.num).includes(search)
  );

  const totalPlays      = Object.values(ayahCounts).reduce((a, b) => a + b, 0);
  const uniqueAyahsPlayed = Object.keys(ayahCounts).length;
  const sessionMs       = Date.now() - sessionStart + sessionTick * 0; // sessionTick forces rerender

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18,
    boxShadow: "0 2px 12px rgba(26,61,36,.07)", ...ex,
  });

  return (
    <div style={{ padding: "14px 14px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
      <style>{`
        @keyframes wave  { 0%,100%{transform:scaleY(.4)} 50%{transform:scaleY(1)} }
        @keyframes pulse { 0%,100%{opacity:.5}           50%{opacity:1} }
        @keyframes popIn { from{transform:scale(.7);opacity:0} to{transform:scale(1);opacity:1} }
        .ayah-card:hover { border-color: ${BORDER} !important; }
      `}</style>

      {/* ── Session Stats Bar ──────────────────────────────────────────────── */}
      {totalPlays > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          {[
            { icon: "🔁", val: totalPlays,         label: "plays" },
            { icon: "📖", val: uniqueAyahsPlayed,  label: "ayahs" },
            { icon: "⏱",  val: fmtTime(Date.now() - sessionStart), label: "" },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5,
              padding: "5px 11px", borderRadius: 20,
              background: i === 0 ? "#fffbeb" : LIGHT,
              border: `1px solid ${i === 0 ? GOLD + "44" : BORDER}`,
              fontSize: 12 }}>
              <span>{s.icon}</span>
              <strong style={{ color: G }}>{s.val}</strong>
              {s.label && <span style={{ color: "#7a9e88" }}>{s.label}</span>}
            </div>
          ))}
          {bookmarks.size > 0 && (
            <button onClick={() => setShowBookmarks(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px",
                borderRadius: 20, border: `1.5px solid ${showBookmarks ? GOLD : BORDER}`,
                background: showBookmarks ? "#fffbeb" : LIGHT,
                fontSize: 12, fontWeight: 700, color: showBookmarks ? GOLD : G, cursor: "pointer" }}>
              ⭐ {bookmarks.size} bookmark{bookmarks.size !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {/* ── Bookmarks Panel ───────────────────────────────────────────────── */}
      {showBookmarks && bookmarks.size > 0 && surahData && (
        <div style={card({ padding: "12px 14px" })}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a9e88",
            letterSpacing: 1, marginBottom: 10 }}>
            ⭐ BOOKMARKED AYAHS · الآيات المحفوظة
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            {Array.from(bookmarks).sort((a, b) => a - b).map(num => (
              <button key={num}
                onClick={() => { playAyah(num); }}
                style={{ display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 12px", borderRadius: 12,
                  border: `1.5px solid ${playingAyah === num ? GOLD : BORDER}`,
                  background: playingAyah === num ? "#fffbeb" : LIGHT,
                  cursor: "pointer", fontSize: 12, fontWeight: 700, color: G }}>
                <span style={{ fontFamily: "'Amiri',serif", fontSize: 14, color: GOLD }}>
                  {toAr(num)}
                </span>
                <span style={{ color: "#7a9e88" }}>Ayah {num}</span>
                {playingAyah === num && <span style={{ fontSize: 10 }}>🔊</span>}
              </button>
            ))}
          </div>
          <button onClick={() => setBookmarks(new Set())}
            style={{ marginTop: 10, fontSize: 11, color: "#e57373", background: "none",
              border: "none", cursor: "pointer", fontWeight: 600 }}>
            Clear all bookmarks
          </button>
        </div>
      )}

      {/* ── Surah Picker ──────────────────────────────────────────────────── */}
      <div style={card({ padding: "14px 16px" })}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#7a9e88", letterSpacing: 1, marginBottom: 8 }}>
          SELECTED SURAH · السورة المختارة
        </div>
        <button onClick={() => setShowList(v => !v)}
          style={{ width: "100%", padding: "11px 14px", borderRadius: 12,
            border: `1.5px solid ${showList ? G : BORDER}`,
            background: showList ? LIGHT : "#f8fafb", cursor: "pointer",
            display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10,
              background: `linear-gradient(135deg,${G},${GM})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 900, color: "#fff" }}>{surah.num}</div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontWeight: 800, color: G, fontSize: 14, lineHeight: 1.2 }}>{surah.name}</div>
              <div style={{ fontFamily: "'Amiri',serif", fontSize: 14, color: GOLD }}>{surah.nameAr}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Surah progress */}
            {surahData && playingAyah > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 60, height: 4, borderRadius: 4, background: "#e8f5e9", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, background: G,
                    width: `${(playingAyah / surahData.numberOfAyahs) * 100}%`,
                    transition: "width .3s" }} />
                </div>
                <span style={{ fontSize: 10, color: "#7a9e88" }}>
                  {playingAyah}/{surahData.numberOfAyahs}
                </span>
              </div>
            )}
            <span style={{ color: "#7a9e88" }}>{showList ? "▲" : "▼"}</span>
          </div>
        </button>

        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" as const }}>
          {[["📖", surah.verses, "Ayahs"], ["📚", `Juz ${surah.juz}`, ""], ["📄", `Pg ${surah.page}`, ""]].map(([icon, val, lbl], i) => (
            <div key={i} style={{ padding: "5px 11px", borderRadius: 10, background: LIGHT,
              border: `1px solid ${BORDER}`, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <span>{icon}</span>
              <span style={{ fontWeight: 800, color: G }}>{val}</span>
              {lbl && <span style={{ color: "#7a9e88" }}>{lbl}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Surah Dropdown ────────────────────────────────────────────────── */}
      {showList && (
        <div style={card({ padding: "12px", maxHeight: 300,
          display: "flex", flexDirection: "column", overflow: "hidden" })}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or number…"
            style={{ padding: "8px 12px", borderRadius: 10, border: `1px solid ${BORDER}`,
              fontSize: 13, color: G, background: "#f8fafb", marginBottom: 8, outline: "none" }} />
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.map(s => {
              const ac = s.num === selSurah;
              return (
                <div key={s.num}
                  onClick={() => { setSelSurah(s.num); setShowList(false); setSearch(""); }}
                  style={{ display: "flex", alignItems: "center", gap: 10,
                    padding: "8px", borderRadius: 10, cursor: "pointer", marginBottom: 2,
                    background: ac ? LIGHT : "transparent",
                    border: `1px solid ${ac ? BORDER : "transparent"}` }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7,
                    background: ac ? G : "#f0f4f0",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: ac ? "#fff" : "#7a9e88" }}>{s.num}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: G }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: "#7a9e88" }}>{s.verses} ayahs · Juz {s.juz}</div>
                  </div>
                  <div style={{ fontFamily: "'Amiri',serif", fontSize: 16, color: GOLD }}>{s.nameAr}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Reciter Controls (includes picker panel) ──────────────────────── */}
      <ReciterControls
        surahNum={selSurah}
        totalAyahs={surahData?.numberOfAyahs || surah.verses}
        playingAyah={playingAyah}
        onAyahChange={(a) => {
          setPlayingAyah(a);
          setAyahCounts(prev => ({ ...prev, [a]: (prev[a] ?? 0) + 1 }));
          requestAnimationFrame(() => {
            verseRefs.current[a]?.scrollIntoView({ behavior: "smooth", block: "center" });
          });
        }}
        reciter={reciter}
        onReciterChange={(id) => { setReciter(id); onReciterChange?.(id); }}
      />

      {/* ── Font Size + Fullscreen ─────────────────────────────────────────── */}
      <div style={card({ padding: "10px 14px" })}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={() => setFontSize(v => Math.max(18, v - 2))}
              style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${BORDER}`,
                background: "#f8fafb", fontSize: 13, cursor: "pointer", color: G, fontWeight: 800 }}>A−</button>
            <span style={{ fontSize: 11, color: "#7a9e88", minWidth: 24, textAlign: "center" }}>{fontSize}</span>
            <button onClick={() => setFontSize(v => Math.min(44, v + 2))}
              style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${BORDER}`,
                background: "#f8fafb", fontSize: 13, cursor: "pointer", color: G, fontWeight: 800 }}>A+</button>
          </div>

          {/* Bookmark toggle info */}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11, color: "#7a9e88" }}>
            ⭐ tap any ayah to bookmark
          </div>

          <button onClick={toggleFS}
            style={{ padding: "8px 10px", borderRadius: 10,
              border: `1px solid ${isFullscreen ? G : BORDER}`,
              background: isFullscreen ? G : "#f8fafb",
              color: isFullscreen ? "#fff" : G, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {isFullscreen ? "⊠ Exit" : "⛶ Full"}
          </button>
        </div>
      </div>

      {/* ── Quran Text Container ───────────────────────────────────────────── */}
      <div ref={containerRef}
        style={isFullscreen
          ? { position: "fixed", inset: 0, zIndex: 9999, background: "#fff",
              display: "flex", flexDirection: "column", overflow: "hidden" }
          : card({ padding: 0, overflow: "hidden", minHeight: 160 })}>

        {/* Fullscreen top bar */}
        {isFullscreen && (
          <div style={{ background: `linear-gradient(90deg,${G},${GM})`, padding: "10px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div>
              <span style={{ fontFamily: "'Amiri',serif", fontSize: 18, color: "#fff", fontWeight: 700 }}>
                {surah.nameAr}
              </span>
              <span style={{ color: "rgba(255,255,255,.65)", fontSize: 11, marginLeft: 8 }}>{surah.name}</span>
              {playingAyah > 0 && surahData && (
                <span style={{ color: GOLD, fontSize: 11, marginLeft: 8 }}>
                  · Ayah {playingAyah}/{surahData.numberOfAyahs}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {playingAyah > 0
                ? <button onClick={stopAll} style={{ padding: "6px 12px", borderRadius: 8, border: "none",
                    background: "#fee2e2", color: "#c0392b", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    ⏹ Stop
                  </button>
                : <button onClick={() => playAyah(1)} style={{ padding: "6px 12px", borderRadius: 8,
                    border: "none", background: GOLD, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    ▶ Play
                  </button>
              }
              <button onClick={toggleFS} style={{ padding: "6px 10px", borderRadius: 8,
                border: "1px solid rgba(255,255,255,.3)", background: "transparent",
                color: "#fff", fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
          </div>
        )}

        <div style={{ overflowY: "auto", flex: 1, padding: "14px" }}>

          {loading && (
            <div style={{ textAlign: "center", padding: "50px 20px" }}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>📖</div>
              <div style={{ fontSize: 13, color: "#7a9e88", animation: "pulse 1s infinite" }}>جارٍ التحميل…</div>
            </div>
          )}

          {error && !loading && (
            <div style={{ textAlign: "center", padding: "40px 16px" }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
              <div style={{ fontSize: 13, color: "#c0392b", marginBottom: 12 }}>{error}</div>
              <button onClick={() => fetchSurah(selSurah)}
                style={{ padding: "10px 20px", borderRadius: 10, border: "none",
                  background: G, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Retry
              </button>
            </div>
          )}

          {surahData && !loading && (
            <>
              {/* Bismillah */}
              {selSurah !== 1 && selSurah !== 9 && (
                <div style={{ textAlign: "center", fontFamily: "'Amiri Quran',serif",
                  fontSize: Math.min(fontSize + 2, 32), color: G, marginBottom: 16,
                  padding: "12px", borderRadius: 14, background: LIGHT, border: `1px solid ${BORDER}` }}>
                  بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
                </div>
              )}

              {/* Surah header with progress bar */}
              <div style={{ textAlign: "center", marginBottom: 14,
                padding: "12px 16px", borderRadius: 14,
                background: `linear-gradient(135deg,${G},${GM})` }}>
                <div style={{ fontFamily: "'Amiri',serif", fontSize: 20, color: "#fff", fontWeight: 700 }}>
                  {surahData.name}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)", marginTop: 3 }}>
                  {surahData.englishName} · {surahData.numberOfAyahs} ayahs
                </div>
                {/* Surah-level progress bar */}
                {playingAyah > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ height: 4, borderRadius: 4, background: "rgba(255,255,255,.2)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 4, background: GOLD,
                        width: `${(playingAyah / surahData.numberOfAyahs) * 100}%`,
                        transition: "width .4s" }} />
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,.6)", marginTop: 4 }}>
                      {playingAyah} / {surahData.numberOfAyahs} · {Math.round((playingAyah / surahData.numberOfAyahs) * 100)}%
                    </div>
                  </div>
                )}
              </div>

              {/* Ayah cards */}
              {surahData.ayahs.map(ayah => {
                const active      = playingAyah === ayah.numberInSurah;
                const count       = ayahCounts[ayah.numberInSurah] ?? 0;
                const isBookmarked = bookmarks.has(ayah.numberInSurah);

                return (
                  <div key={ayah.numberInSurah}
                    ref={el => { verseRefs.current[ayah.numberInSurah] = el; }}
                    onClick={() => active ? stopAll() : playAyah(ayah.numberInSurah)}
                    className="ayah-card"
                    style={{
                      direction: "rtl", padding: "14px 14px 12px",
                      borderRadius: 14, marginBottom: 8, cursor: "pointer",
                      transition: "all .18s ease",
                      background: active ? "#fffbeb" : isBookmarked ? "#f0fff4" : "#fafafa",
                      border: `1.5px solid ${active ? GOLD : isBookmarked ? G : "#f0f4f0"}`,
                      boxShadow: active
                        ? `0 0 0 3px ${GOLD}22, 0 2px 8px rgba(0,0,0,.06)`
                        : "0 1px 3px rgba(0,0,0,.03)",
                    }}>

                    {/* Ayah meta row */}
                    <div style={{ display: "flex", justifyContent: "space-between",
                      marginBottom: 8, direction: "ltr", alignItems: "center" }}>

                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {/* Sound wave animation when playing */}
                        {active && (
                          <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 16 }}>
                            {[1, .55, .8, .45, .7].map((h, i) => (
                              <div key={i} style={{
                                width: 3, borderRadius: 2, background: GOLD,
                                height: `${16 * h}px`,
                                animation: `wave 0.7s ${i * 0.12}s infinite ease-in-out`,
                              }} />
                            ))}
                          </div>
                        )}
                        {/* Ayah number badge */}
                        <div style={{ width: 30, height: 30, borderRadius: "50%",
                          background: active ? GOLD : LIGHT,
                          border: `1px solid ${active ? GOLD : BORDER}`,
                          display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontFamily: "'Amiri',serif", fontSize: 11, fontWeight: 700,
                            color: active ? "#fff" : G }}>
                            {toAr(ayah.numberInSurah)}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {/* Play count badge */}
                        {count > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 3,
                            padding: "2px 7px", borderRadius: 10, fontSize: 10, fontWeight: 700,
                            background: count >= 10 ? "#fffbeb" : LIGHT,
                            border: `1px solid ${count >= 10 ? GOLD + "55" : BORDER}`,
                            color: count >= 10 ? GOLD : G,
                            animation: "popIn .2s ease",
                          }}>
                            🔁 {count}×
                          </div>
                        )}
                        {/* Bookmark button */}
                        <button
                          onClick={e => { e.stopPropagation(); toggleBookmark(ayah.numberInSurah); }}
                          style={{ width: 28, height: 28, borderRadius: 8, border: "none",
                            background: isBookmarked ? "#fffbeb" : "transparent",
                            cursor: "pointer", display: "flex", alignItems: "center",
                            justifyContent: "center", fontSize: 14,
                            transition: "all .15s" }}
                          title={isBookmarked ? "Remove bookmark" : "Add bookmark"}>
                          {isBookmarked ? "⭐" : "☆"}
                        </button>
                      </div>
                    </div>

                    {/* Arabic text */}
                    <div style={{
                      fontFamily: "'Amiri Quran',serif", fontSize: fontSize,
                      color: active ? G : "#2d4a35", lineHeight: 2, textAlign: "right",
                    }}>
                      {ayah.text}
                    </div>
                  </div>
                );
              })}
              <div style={{ height: 32 }} />
            </>
          )}
        </div>

        {/* Fullscreen bottom nav */}
        {isFullscreen && surahData && (
          <div style={{ padding: "10px 16px", background: "#f8fafb",
            borderTop: `1px solid ${BORDER}`,
            display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <button onClick={() => { const n = Math.max(1, playingAyah - 1); playAyah(n); }}
              disabled={playingAyah <= 1}
              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${BORDER}`,
                background: "#fff", color: playingAyah <= 1 ? BORDER : G,
                fontWeight: 700, cursor: playingAyah <= 1 ? "not-allowed" : "pointer" }}>
              ◀ Prev
            </button>
            <div style={{ flex: 1, textAlign: "center", fontSize: 12, color: "#7a9e88" }}>
              {playingAyah > 0
                ? <>Ayah <strong style={{ color: G }}>{playingAyah}</strong> / {surahData.numberOfAyahs}</>
                : "Tap a verse"}
            </div>
            <button onClick={() => { const n = Math.min(surahData.numberOfAyahs, (playingAyah || 0) + 1); playAyah(n); }}
              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${BORDER}`,
                background: "#fff", color: G, fontWeight: 700, cursor: "pointer" }}>
              Next ▶
            </button>
          </div>
        )}
      </div>

      {/* ── Prev / Next Surah ─────────────────────────────────────────────── */}
      <div style={card({ padding: "10px 12px", display: "flex", gap: 10 })}>
        <button onClick={() => setSelSurah(v => Math.max(1, v - 1))} disabled={selSurah <= 1}
          style={{ flex: 1, padding: "11px 0", borderRadius: 12,
            border: `1px solid ${BORDER}`, background: selSurah <= 1 ? "#f8fafb" : LIGHT,
            color: selSurah <= 1 ? BORDER : G, fontWeight: 700, fontSize: 13,
            cursor: selSurah <= 1 ? "not-allowed" : "pointer" }}>
          ◀ Previous Surah
        </button>
        <button onClick={() => setSelSurah(v => Math.min(114, v + 1))} disabled={selSurah >= 114}
          style={{ flex: 1, padding: "11px 0", borderRadius: 12,
            border: `1px solid ${BORDER}`, background: selSurah >= 114 ? "#f8fafb" : LIGHT,
            color: selSurah >= 114 ? BORDER : G, fontWeight: 700, fontSize: 13,
            cursor: selSurah >= 114 ? "not-allowed" : "pointer" }}>
          Next Surah ▶
        </button>
      </div>
    </div>
  );
}
