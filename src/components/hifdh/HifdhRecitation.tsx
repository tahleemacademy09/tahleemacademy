import { useState, useEffect, useRef, useCallback } from "react";
import { audioUrl, DEFAULT_RECITER } from "./surahData";
import { audioManager } from "./audioManager";

// Fallback reciters if import fails
const RECITERS = [
  { id: "ar.alafasy", name: "Mishary Rashid Alafasy" },
  { id: "ar.abdurrahmaansudais", name: "Abdurrahman As-Sudais" },
  { id: "ar.husary", name: "Mahmoud Khalil Al-Husary" },
  { id: "ar.minshawi", name: "Mohamed Siddiq Al-Minshawi" },
  { id: "ar.shaatri", name: "Abu Bakr Ash-Shaatree" },
];

const G = "#0f2d1f";
const GM = "#1a4731";
const GOLD = "#c9a84c";
const LIGHT = "#faf6ee";
const TEXT = "#2d4a35";

function toAr(n: number) {
  return String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);
}

interface Props {
  reciter?: string;
  onReciterChange?: (id: string) => void;
}

export default function HifdhRecitation({ reciter: reciterProp, onReciterChange }: Props = {}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageData, setPageData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fontSize, setFontSize] = useState(26);
  const [playingAyah, setPlayingAyah] = useState(0);
  const [reciter, setReciter] = useState(reciterProp || DEFAULT_RECITER);
  const [showHeader, setShowHeader] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingRef = useRef(0);
  const pageDataRef = useRef<any>(null);
  const verseRefs = useRef<Record<number, HTMLSpanElement | null>>({});

  useEffect(() => { pageDataRef.current = pageData; }, [pageData]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  // ── Hide header on scroll ────────────────────────────────────────────────
  useEffect(() => {
    const handleScroll = () => setShowHeader(window.scrollY < 60);    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ── Fullscreen toggle ────────────────────────────────────────────────────
  useEffect(() => {
    const handleFS = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFS);
    return () => document.removeEventListener("fullscreenchange", handleFS);
  }, []);

  const stopAll = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    playingRef.current = 0;
    setPlayingAyah(0);
  }, []);

  const fetchPage = useCallback(async (page: number) => {
    setLoading(true);
    setError("");
    setPageData(null);
    stopAll();
    try {
      const res = await fetch(`https://api.alquran.cloud/v1/page/${page}/ar.uthmani`);
      const json = await res.json();
      if (json.code === 200) setPageData(json.data);
      else setError("Could not load this page.");
    } catch {
      setError("Network error — check your connection.");
    }
    setLoading(false);
  }, [stopAll]);

  useEffect(() => {
    fetchPage(currentPage);
  }, [currentPage, fetchPage]);

  const playAyah = useCallback((num: number) => {
    audioRef.current?.pause();
    audioRef.current = null;
    const pd = pageDataRef.current;
    if (!pd || !pd.ayahs) return;

    const ayah = pd.ayahs.find((a: any) => a.numberInSurah === num);
    if (!ayah) { stopAll(); return; }

    playingRef.current = num;
    setPlayingAyah(num);
    requestAnimationFrame(() => {
      verseRefs.current[num]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    const audio = new Audio(audioUrl(ayah.surah.number, num, reciter));
    audioRef.current = audio;
    audio.play().catch(stopAll);
    audio.onended = () => {
      const next = num + 1;
      const last = pd.ayahs[pd.ayahs.length - 1].numberInSurah;
      if (next <= last) playAyah(next);
      else stopAll();
    };
  }, [stopAll, reciter]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const surahInfo = pageData?.ayahs?.[0]?.surah || {};
  const juzInfo = pageData?.ayahs?.[0]?.juz || 1;
  const pageAyahs = pageData?.ayahs || [];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: LIGHT,
        fontFamily: "'Amiri', serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:1} }
        .quran-text { font-family: 'Amiri Quran', 'Scheherazade New', serif; line-height: 2.4; }
        .ayah-marker { font-family: 'Amiri', serif; color: ${GOLD}; font-size: 0.85em; margin: 0 4px; }
        .juz-marker { display: inline-block; width: 24px; height: 24px; background: ${GOLD}; color: #fff; border-radius: 50%; text-align: center; line-height: 24px; font-size: 11px; margin: 0 6px; }
      `}</style>

      {/* ── TOP CONTROL BAR (Hides on scroll/fullscreen) ──────────────────── */}
      <div
        style={{
          background: `linear-gradient(135deg, ${G}, ${GM})`,
          padding: "12px 16px",          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 2px 12px rgba(15,45,31,0.15)",
          position: "sticky",
          top: 0,
          zIndex: 50,
          transition: "transform 0.3s ease, opacity 0.3s ease",
          transform: showHeader || !isFullscreen ? "translateY(0)" : "translateY(-100%)",
          opacity: showHeader || !isFullscreen ? 1 : 0,
        }}
      >
        {/* Left: Page Info */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8,
              padding: "6px 10px",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <span style={{ fontFamily: "'Amiri', serif", fontSize: 16 }}>{surahInfo.nameAr || "القرآن"}</span>
            <span style={{ fontSize: 11, opacity: 0.8, marginLeft: 6 }}>Juz {juzInfo} · Page {currentPage}</span>
          </div>
        </div>

        {/* Center: Playback Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => {
              const prev = pageAyahs.find((a: any) => a.numberInSurah < playingAyah);
              if (prev) playAyah(prev.numberInSurah);
            }}
            disabled={!pageAyahs.length || playingAyah <= 1}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.3)",
              background: !pageAyahs.length || playingAyah <= 1 ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.15)",
              color: "#fff",
              cursor: !pageAyahs.length || playingAyah <= 1 ? "not-allowed" : "pointer",
              fontSize: 14,
            }}
          >
            ◀          </button>
          <button
            onClick={() => (playingAyah > 0 ? stopAll() : playAyah(pageAyahs[0]?.numberInSurah || 1))}
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: "none",
              background: GOLD,
              color: G,
              cursor: "pointer",
              fontSize: 18,
              fontWeight: 800,
              boxShadow: "0 2px 8px rgba(201,168,76,0.4)",
            }}
          >
            {playingAyah > 0 ? "⏸" : "▶"}
          </button>
          <button
            onClick={() => {
              const next = pageAyahs.find((a: any) => a.numberInSurah > playingAyah);
              if (next) playAyah(next.numberInSurah);
            }}
            disabled={!pageAyahs.length || playingAyah >= pageAyahs[pageAyahs.length - 1]?.numberInSurah}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.3)",
              background:
                !pageAyahs.length || playingAyah >= pageAyahs[pageAyahs.length - 1]?.numberInSurah
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(255,255,255,0.15)",
              color: "#fff",
              cursor:
                !pageAyahs.length || playingAyah >= pageAyahs[pageAyahs.length - 1]?.numberInSurah
                  ? "not-allowed"
                  : "pointer",
              fontSize: 14,
            }}
          >
            ▶
          </button>
        </div>

        {/* Right: Reciter, Font, Fullscreen */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            value={reciter}
            onChange={(e) => {              setReciter(e.target.value);
              onReciterChange?.(e.target.value);
            }}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8,
              padding: "6px 8px",
              color: "#fff",
              fontSize: 12,
              cursor: "pointer",
              outline: "none",
              maxWidth: 120,
            }}
          >
            {RECITERS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setFontSize((v) => Math.max(20, v - 2))}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.1)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            A−
          </button>
          <button
            onClick={() => setFontSize((v) => Math.min(36, v + 2))}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.1)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            A+          </button>
          <button
            onClick={toggleFullscreen}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: isFullscreen ? GOLD : "rgba(255,255,255,0.1)",
              color: isFullscreen ? G : "#fff",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ⛶
          </button>
        </div>
      </div>

      {/* ── QURAN PAGE CONTAINER (No scrolling, fits viewport) ────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px 16px",
          overflow: "hidden",
          height: isFullscreen ? "100vh" : "calc(100vh - 120px)",
        }}
      >
        {loading && (
          <div style={{ textAlign: "center", color: "#7a9e88", animation: "pulse 1.5s infinite" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📖</div>
            Loading Page {currentPage}...
          </div>
        )}
        {error && !loading && (
          <div style={{ textAlign: "center", color: "#c0392b" }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
            {error}
            <button
              onClick={() => fetchPage(currentPage)}
              style={{
                marginTop: 12,
                padding: "10px 20px",
                borderRadius: 10,
                border: "none",
                background: G,                color: "#fff",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        )}
        {pageData && !loading && (
          <div
            style={{
              width: "100%",
              maxWidth: 700,
              background: "#fff",
              borderRadius: 20,
              padding: "24px 20px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              height: "100%",
              overflow: "hidden",
            }}
          >
            {/* Bismillah */}
            {currentPage !== 1 && currentPage !== 2 && (
              <div
                style={{
                  textAlign: "center",
                  fontFamily: "'Amiri Quran', serif",
                  fontSize: fontSize + 2,
                  color: G,
                  marginBottom: 16,
                  padding: "12px",
                  borderRadius: 12,
                  background: LIGHT,
                  border: "1px solid #e5e7eb",
                }}
              >
                بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
              </div>
            )}

            {/* Quran Text - Full Page View */}
            <div
              className="quran-text"
              style={{
                fontSize,                color: TEXT,
                textAlign: "center",
                direction: "rtl",
                width: "100%",
                lineHeight: 2.6,
                letterSpacing: 0.5,
              }}
            >
              {pageAyahs.map((ayah: any, idx: number) => {
                const active = playingAyah === ayah.numberInSurah;
                const isLast = idx === pageAyahs.length - 1;
                const isJuzStart = ayah.juz !== pageAyahs[idx - 1]?.juz && idx > 0;
                const isRukuStart = ayah.ruku !== pageAyahs[idx - 1]?.ruku && idx > 0;

                return (
                  <span
                    key={ayah.numberInSurah}
                    ref={(el) => { verseRefs.current[ayah.numberInSurah] = el; }}
                    onClick={() => (active ? stopAll() : playAyah(ayah.numberInSurah))}
                    style={{
                      cursor: "pointer",
                      padding: "2px 4px",
                      borderRadius: 6,
                      transition: "all 0.2s ease",
                      background: active ? "#fffbeb" : "transparent",
                      border: `1.5px solid ${active ? GOLD : "transparent"}`,
                      display: "inline",
                    }}
                  >
                    {isJuzStart && <span className="juz-marker">{toAr(ayah.juz)}</span>}
                    {isRukuStart && <span style={{ color: "#7a9e88", fontSize: "0.8em", margin: "0 4px" }}>۞</span>}
                    <span style={{ color: active ? G : TEXT }}>{ayah.text}</span>
                    <span className="ayah-marker">۝{toAr(ayah.numberInSurah)}</span>
                    {!isLast && " "}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── BOTTOM PAGE NAV ───────────────────────────────────────────────── */}
      <div
        style={{
          padding: "12px 16px",
          background: "#fff",
          borderTop: "1px solid #e5e7eb",
          display: "flex",
          gap: 12,          position: "sticky",
          bottom: 0,
          zIndex: 40,
          transition: "transform 0.3s ease, opacity 0.3s ease",
          transform: showHeader || !isFullscreen ? "translateY(0)" : "translateY(100%)",
          opacity: showHeader || !isFullscreen ? 1 : 0,
        }}
      >
        <button
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: currentPage <= 1 ? "#f8fafb" : LIGHT,
            color: currentPage <= 1 ? "#ccc" : G,
            fontWeight: 700,
            cursor: currentPage <= 1 ? "not-allowed" : "pointer",
          }}
        >
          ◀ Previous Page
        </button>
        <button
          onClick={() => setCurrentPage((p) => Math.min(604, p + 1))}
          disabled={currentPage >= 604}
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: currentPage >= 604 ? "#f8fafb" : LIGHT,
            color: currentPage >= 604 ? "#ccc" : G,
            fontWeight: 700,
            cursor: currentPage >= 604 ? "not-allowed" : "pointer",
          }}
        >
          Next Page ▶
        </button>
      </div>
    </div>
  );
}