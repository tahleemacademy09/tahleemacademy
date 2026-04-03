import { useState, useEffect, useRef, useCallback } from "react";
import { audioUrl, DEFAULT_RECITER } from "./surahData";
import { Play, Pause, SkipBack, SkipForward, Volume2, Type, ChevronLeft, ChevronRight } from "lucide-react";

// Fallback reciters (ensures dropdown always works)
const RECITERS = [
  { id: "ar.alafasy", name: "Mishary Rashid Alafasy" },
  { id: "ar.abdurrahmaansudais", name: "Abdurrahman As-Sudais" },
  { id: "ar.husary", name: "Mahmoud Khalil Al-Husary" },
  { id: "ar.minshawi", name: "Mohamed Siddiq Al-Minshawi" },
  { id: "ar.shaatri", name: "Abu Bakr Ash-Shaatree" },
  { id: "ar.abdulsamad", name: "Abdul Basit Abdul Samad" },
];

const G = "#0f2d1f";
const GM = "#1a4731";
const GOLD = "#c9a84c";
const BG = "#faf6ee";
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
  const [fontSize, setFontSize] = useState(28);
  const [playingAyah, setPlayingAyah] = useState(0);
  const [reciter, setReciter] = useState(reciterProp || DEFAULT_RECITER);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingRef = useRef(0);
  const pageDataRef = useRef<any>(null);
  const verseRefs = useRef<Record<number, HTMLSpanElement | null>>({});

  useEffect(() => { pageDataRef.current = pageData; }, [pageData]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const stopAll = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;    playingRef.current = 0;
    setPlayingAyah(0);
    setIsPlaying(false);
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

  useEffect(() => { fetchPage(currentPage); }, [currentPage, fetchPage]);

  const playAyah = useCallback((num: number) => {
    audioRef.current?.pause();
    audioRef.current = null;
    const pd = pageDataRef.current;
    if (!pd || !pd.ayahs) return;

    const ayah = pd.ayahs.find((a: any) => a.numberInSurah === num);
    if (!ayah) { stopAll(); return; }

    playingRef.current = num;
    setPlayingAyah(num);
    setIsPlaying(true);

    requestAnimationFrame(() => {
      verseRefs.current[num]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    const audio = new Audio(audioUrl(ayah.surah.number, num, reciter));
    audioRef.current = audio;
    audio.play().catch(() => { stopAll(); setIsPlaying(false); });
    audio.onended = () => {
      const next = num + 1;
      const last = pd.ayahs[pd.ayahs.length - 1].numberInSurah;
      if (next <= last) playAyah(next);
      else { stopAll(); setIsPlaying(false); }
    };
    audio.onerror = () => { stopAll(); setIsPlaying(false); };  }, [stopAll, reciter]);

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      const start = playingAyah > 0 ? playingAyah : (pageData?.ayahs?.[0]?.numberInSurah || 1);
      playAyah(start);
    }
  };

  const nextAyah = () => {
    const pd = pageDataRef.current;
    if (!pd || !pd.ayahs) return;
    const next = playingAyah > 0 ? playingAyah + 1 : pd.ayahs[0].numberInSurah;
    if (next <= pd.ayahs[pd.ayahs.length - 1].numberInSurah) playAyah(next);
  };

  const prevAyah = () => {
    const pd = pageDataRef.current;
    if (!pd || !pd.ayahs) return;
    const prev = playingAyah > 1 ? playingAyah - 1 : pd.ayahs[0].numberInSurah;
    playAyah(prev);
  };

  const surahInfo = pageData?.ayahs?.[0]?.surah || {};
  const juzInfo = pageData?.ayahs?.[0]?.juz || 1;
  const pageAyahs = pageData?.ayahs || [];

  return (
    <div style={{ height: "100dvh", background: BG, fontFamily: "'Amiri', serif", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:1} }
        .quran-text { font-family: 'Amiri Quran', 'Scheherazade New', serif; line-height: 2.4; }
        .ayah-marker { font-family: 'Amiri', serif; color: ${GOLD}; font-size: 0.85em; margin: 0 4px; }
        .juz-badge { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; background: ${GOLD}; color: #fff; border-radius: 50%; font-size: 10px; margin: 0 6px; vertical-align: middle; }
        .verse-active { background: #fffbeb; border-radius: 8px; padding: 2px 4px; box-shadow: 0 0 0 2px ${GOLD}33; }
      `}</style>

      {/* ── TOP CONTROL BAR (Compact, Mobile-Optimized) ──────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${G}, ${GM})`,
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 2px 12px rgba(15,45,31,0.15)",
        position: "sticky",
        top: 0,        zIndex: 50,
        gap: 8,
        flexWrap: "nowrap"
      }}>
        {/* Left: Page Info */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <div style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "5px 8px", color: "#fff", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <span style={{ fontFamily: "'Amiri', serif", fontSize: 15 }}>{surahInfo.nameAr || "القرآن"}</span>
            <span style={{ fontSize: 10, opacity: 0.8, marginLeft: 4 }}>Juz {juzInfo} · {currentPage}</span>
          </div>
        </div>

        {/* Center: Playback Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={prevAyah} disabled={!pageAyahs.length}
            style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <SkipBack size={16} />
          </button>
          <button onClick={togglePlay}
            style={{ width: 42, height: 42, borderRadius: "50%", border: "none", background: GOLD, color: G, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(201,168,76,0.4)" }}>
            {isPlaying ? <Pause size={20} fill={G} /> : <Play size={20} fill={G} style={{ marginLeft: 2 }} />}
          </button>
          <button onClick={nextAyah} disabled={!pageAyahs.length}
            style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <SkipForward size={16} />
          </button>
        </div>

        {/* Right: Reciter & Font */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <select value={reciter} onChange={(e) => { setReciter(e.target.value); onReciterChange?.(e.target.value); }}
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "5px 6px", color: "#fff", fontSize: 11, cursor: "pointer", outline: "none", maxWidth: 90 }}>
            {RECITERS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button onClick={() => setFontSize((v) => Math.max(22, v - 2))}
            style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Type size={14} />−
          </button>
          <button onClick={() => setFontSize((v) => Math.min(38, v + 2))}
            style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Type size={14} />+
          </button>
        </div>
      </div>

      {/* ── QURAN PAGE CONTAINER (Mushaf Style, Full Viewport) ───────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px", overflow: "hidden", height: "calc(100dvh - 110px)" }}>
        {loading && (
          <div style={{ textAlign: "center", color: "#7a9e88", animation: "pulse 1.5s infinite" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📖</div>            Loading Page {currentPage}...
          </div>
        )}
        {error && !loading && (
          <div style={{ textAlign: "center", color: "#c0392b", padding: "20px" }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
            {error}
            <button onClick={() => fetchPage(currentPage)} style={{ marginTop: 12, padding: "10px 20px", borderRadius: 10, border: "none", background: G, color: "#fff", cursor: "pointer" }}>Retry</button>
          </div>
        )}
        {pageData && !loading && (
          <div style={{ width: "100%", maxWidth: 680, background: "#fff", borderRadius: 20, padding: "20px 16px", border: "1px solid #e5e7eb", boxShadow: "0 4px 20px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%", overflowY: "auto" }}>
            {/* Bismillah */}
            {currentPage !== 1 && currentPage !== 2 && (
              <div style={{ textAlign: "center", fontFamily: "'Amiri Quran', serif", fontSize: fontSize + 2, color: G, marginBottom: 16, padding: "12px", borderRadius: 12, background: BG, border: "1px solid #e5e7eb" }}>
                بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
              </div>
            )}

            {/* Quran Text - Mushaf Layout */}
            <div className="quran-text" style={{ fontSize, color: TEXT, textAlign: "center", direction: "rtl", width: "100%", lineHeight: 2.6, letterSpacing: 0.5 }}>
              {pageAyahs.map((ayah: any, idx: number) => {
                const active = playingAyah === ayah.numberInSurah;
                const isLast = idx === pageAyahs.length - 1;
                const isJuzStart = ayah.juz !== pageAyahs[idx - 1]?.juz && idx > 0;
                const isRukuStart = ayah.ruku !== pageAyahs[idx - 1]?.ruku && idx > 0;

                return (
                  <span key={ayah.numberInSurah} ref={(el) => { verseRefs.current[ayah.numberInSurah] = el; }}
                    onClick={() => (active ? stopAll() : playAyah(ayah.numberInSurah))}
                    className={active ? "verse-active" : ""}
                    style={{ cursor: "pointer", padding: "2px 4px", borderRadius: 6, transition: "all 0.2s ease", display: "inline" }}>
                    {isJuzStart && <span className="juz-badge">{toAr(ayah.juz)}</span>}
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
      <div style={{ padding: "10px 12px", background: "#fff", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, position: "sticky", bottom: 0, zIndex: 40 }}>
        <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}
          style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid #e5e7eb", background: currentPage <= 1 ? "#f8fafb" : BG, color: currentPage <= 1 ? "#ccc" : G, fontWeight: 700, cursor: currentPage <= 1 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <ChevronLeft size={18} /> Page {currentPage - 1}        </button>
        <button onClick={() => setCurrentPage((p) => Math.min(604, p + 1))} disabled={currentPage >= 604}
          style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid #e5e7eb", background: currentPage >= 604 ? "#f8fafb" : BG, color: currentPage >= 604 ? "#ccc" : G, fontWeight: 700, cursor: currentPage >= 604 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          Page {currentPage + 1} <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}