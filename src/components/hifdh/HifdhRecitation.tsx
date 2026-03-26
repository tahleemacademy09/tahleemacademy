// src/components/hifdh/HifdhRecitation.tsx
// Full Quran page reader with fullscreen, surah jump, prev/next navigation
import { SURAHS, audioUrl } from "./surahData";
import { useState, useEffect, useRef, useCallback } from "react";
import { SURAHS, audioUrl } from "./surahData";

interface Ayah { numberInSurah: number; text: string; }
interface SurahData { englishName: string; name: string; numberOfAyahs: number; ayahs: Ayah[]; }

const C = { green: "#1a3d24", gold: "#b7791f", light: "#f0fff4", border: "#d4e8d4" };

export default function HifdhRecitation() {
  const [selectedSurah, setSelectedSurah] = useState(1);
  const [surahData, setSurahData] = useState<SurahData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontSize, setFontSize] = useState(26);
  const [showTajweed, setShowTajweed] = useState(false);
  const [currentAyah, setCurrentAyah] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSurahList, setShowSurahList] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ayahRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const fetchSurah = useCallback(async (num: number) => {
    setLoading(true); setError(""); setSurahData(null); setCurrentAyah(1);
    try {
      const res = await fetch(`https://api.alquran.cloud/v1/surah/${num}/ar.uthmani`);
      const json = await res.json();
      if (json.code === 200) setSurahData(json.data);
      else setError("Failed to load surah. Please try again.");
    } catch { setError("Network error. Please check your connection."); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSurah(selectedSurah); }, [selectedSurah, fetchSurah]);

  const playAyah = (ayahNum: number) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setCurrentAyah(ayahNum); setIsPlaying(true);
    const audio = new Audio(audioUrl(selectedSurah, ayahNum));
    audioRef.current = audio;
    audio.play().catch(() => setIsPlaying(false));
    audio.onended = () => {
      setIsPlaying(false);
      if (surahData && ayahNum < surahData.numberOfAyahs) {
        setTimeout(() => playAyah(ayahNum + 1), 400);
      }
    };
    // scroll to ayah
    setTimeout(() => {
      ayahRefs.current[ayahNum]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  const stopAudio = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIsPlaying(false);
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
    setIsFullscreen(v => !v);
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const filteredSurahs = SURAHS.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.nameAr.includes(searchTerm) ||
    String(s.num).includes(searchTerm)
  );

  const surah = SURAHS[selectedSurah - 1];

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background: "#fff", border: `1px solid ${C.border}`, borderRadius: 16,
    boxShadow: "0 2px 8px rgba(0,0,0,.06)", ...ex,
  });

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Surah Selector */}
      <div style={card({ padding: "16px" })}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#7a9e88", fontWeight: 600, marginBottom: 4 }}>Selected Surah · السورة المختارة</div>
            <button onClick={() => setShowSurahList(v => !v)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`,
                background: "#f8fafb", cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontWeight: 700, color: C.green, fontSize: 14 }}>{surah.num}. {surah.name}</span>
                <span style={{ fontFamily: "'Amiri',serif", fontSize: 16, color: C.gold, marginLeft: 8 }}>{surah.nameAr}</span>
              </div>
              <span style={{ color: "#7a9e88", fontSize: 12 }}>{showSurahList ? "▲" : "▼"}</span>
            </button>
          </div>
        </div>

        {/* Surah meta badges */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          {[
            { label: "Verses", value: surah.verses, ar: "آيات" },
            { label: "Juz", value: surah.juz, ar: "جزء" },
            { label: "Page", value: surah.page, ar: "صفحة" },
          ].map((b, i) => (
            <div key={i} style={{ padding: "5px 12px", borderRadius: 10, background: C.light, border: `1px solid ${C.border}`, fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: C.green }}>{b.value}</span>
              <span style={{ color: "#7a9e88", marginLeft: 4 }}>{b.label}</span>
              <span style={{ color: C.gold, marginLeft: 4, fontFamily: "'Amiri',serif" }}>{b.ar}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Surah List Dropdown */}
      {showSurahList && (
        <div style={card({ padding: "14px", maxHeight: 340, overflow: "hidden", display: "flex", flexDirection: "column" })}>
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search surah... البحث عن سورة"
            style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13,
              background: "#f8fafb", color: C.green, marginBottom: 10 }} />
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filteredSurahs.map(s => (
              <div key={s.num} onClick={() => { setSelectedSurah(s.num); setShowSurahList(false); setSearchTerm(""); }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderRadius: 8, cursor: "pointer",
                  background: s.num === selectedSurah ? C.light : "transparent",
                  border: s.num === selectedSurah ? `1px solid ${C.border}` : "1px solid transparent",
                  marginBottom: 3 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: s.num === selectedSurah ? C.green : "#f0f4f0",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: s.num === selectedSurah ? "#fff" : "#7a9e88" }}>{s.num}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.green }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: "#7a9e88" }}>{s.verses} verses · Juz {s.juz}</div>
                </div>
                <div style={{ fontFamily: "'Amiri',serif", fontSize: 18, color: C.gold }}>{s.nameAr}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls Bar */}
      <div style={card({ padding: "12px 14px" })}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => setFontSize(v => Math.max(18, v - 2))}
              style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.border}`, background: "#f8fafb", fontSize: 16, cursor: "pointer", color: C.green }}>A-</button>
            <span style={{ fontSize: 12, color: "#7a9e88", minWidth: 28, textAlign: "center" }}>{fontSize}</span>
            <button onClick={() => setFontSize(v => Math.min(44, v + 2))}
              style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.border}`, background: "#f8fafb", fontSize: 16, cursor: "pointer", color: C.green }}>A+</button>
          </div>

          <div style={{ flex: 1 }} />

          {isPlaying ? (
            <button onClick={stopAudio}
              style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "#fee2e2", color: "#c0392b", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              ⏹ Stop
            </button>
          ) : (
            <button onClick={() => playAyah(1)}
              style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: C.green, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              ▶ Play All
            </button>
          )}

          <button onClick={toggleFullscreen}
            style={{ padding: "8px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: isFullscreen ? C.green : "#f8fafb",
              color: isFullscreen ? "#fff" : C.green, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {isFullscreen ? "⊠ Exit" : "⛶ Full"}
          </button>
        </div>
      </div>

      {/* Quran Text Display — Fullscreen container */}
      <div ref={containerRef}
        style={{ ...(isFullscreen ? {
          position: "fixed", inset: 0, zIndex: 9999, background: "#fff",
          display: "flex", flexDirection: "column", overflow: "hidden"
        } : card({ padding: 0, overflow: "hidden" })) }}>

        {isFullscreen && (
          <div style={{ padding: "12px 16px", background: C.green, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div>
              <span style={{ fontFamily: "'Amiri',serif", fontSize: 20, color: "#fff" }}>{surah.nameAr}</span>
              <span style={{ color: "rgba(255,255,255,.7)", fontSize: 12, marginLeft: 8 }}>{surah.name}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {isPlaying ? (
                <button onClick={stopAudio}
                  style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "#fee2e2", color: "#c0392b", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  ⏹ Stop
                </button>
              ) : (
                <button onClick={() => playAyah(currentAyah)}
                  style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: C.gold, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  ▶ Play
                </button>
              )}
              <button onClick={toggleFullscreen}
                style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.3)", background: "transparent",
                  color: "#fff", fontSize: 12, cursor: "pointer" }}>✕ Close</button>
            </div>
          </div>
        )}

        <div style={{ overflowY: "auto", flex: 1, padding: isFullscreen ? "20px 16px" : "20px 16px" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ fontSize: 14, color: "#7a9e88", animation: "pulse 1s infinite" }}>Loading · جارٍ التحميل…</div>
            </div>
          )}

          {error && (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontSize: 13, color: "#c0392b", marginBottom: 12 }}>{error}</div>
              <button onClick={() => fetchSurah(selectedSurah)}
                style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Retry
              </button>
            </div>
          )}

          {surahData && !loading && (
            <>
              {/* Bismillah */}
              {selectedSurah !== 1 && selectedSurah !== 9 && (
                <div style={{ textAlign: "center", fontFamily: "'Amiri Quran',serif", fontSize: Math.min(fontSize + 4, 36),
                  color: C.green, marginBottom: 24, padding: "12px 0", borderBottom: `1px solid ${C.light}` }}>
                  بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                </div>
              )}

              {/* Surah Header */}
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontFamily: "'Amiri',serif", fontSize: 22, color: C.green, fontWeight: 700 }}>{surahData.name}</div>
                <div style={{ fontSize: 12, color: "#7a9e88", marginTop: 4 }}>{surahData.englishName} · {surahData.numberOfAyahs} verses</div>
              </div>

              {/* Verses */}
              <div style={{ textAlign: "right", direction: "rtl", lineHeight: 2.2 }}>
                {surahData.ayahs.map((ayah) => (
                  <span key={ayah.numberInSurah}
                    ref={el => { ayahRefs.current[ayah.numberInSurah] = el; }}
                    onClick={() => isPlaying && currentAyah === ayah.numberInSurah ? stopAudio() : playAyah(ayah.numberInSurah)}
                    style={{ cursor: "pointer", display: "inline",
                      background: currentAyah === ayah.numberInSurah && isPlaying ? "#fffbeb" : "transparent",
                      borderRadius: 4, transition: "background .2s" }}>
                    <span style={{ fontFamily: "'Amiri Quran',serif", fontSize: fontSize, color: C.green, lineHeight: 2.2 }}>
                      {ayah.text}
                    </span>
                    <span style={{ fontFamily: "'Amiri',serif", fontSize: Math.max(fontSize - 8, 16),
                      color: C.gold, margin: "0 4px", verticalAlign: "middle" }}>
                      ‏﴿{toArabicNum(ayah.numberInSurah)}﴾
                    </span>
                  </span>
                ))}
              </div>

              {/* Bottom padding */}
              <div style={{ height: 60 }} />
            </>
          )}
        </div>

        {/* Ayah Navigation (fullscreen) */}
        {isFullscreen && surahData && (
          <div style={{ padding: "12px 16px", background: "#f8fafb", borderTop: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <button onClick={() => { const n = Math.max(1, currentAyah - 1); setCurrentAyah(n); if (isPlaying) playAyah(n); }}
              disabled={currentAyah <= 1}
              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff",
                color: currentAyah <= 1 ? "#d4e8d4" : C.green, fontWeight: 700, cursor: currentAyah <= 1 ? "not-allowed" : "pointer" }}>
              ◀ Prev
            </button>
            <div style={{ flex: 1, textAlign: "center", fontSize: 13, color: "#7a9e88" }}>
              Ayah <strong style={{ color: C.green }}>{currentAyah}</strong> / {surahData.numberOfAyahs}
            </div>
            <button onClick={() => { const n = Math.min(surahData.numberOfAyahs, currentAyah + 1); setCurrentAyah(n); if (isPlaying) playAyah(n); }}
              disabled={currentAyah >= surahData.numberOfAyahs}
              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff",
                color: currentAyah >= surahData.numberOfAyahs ? "#d4e8d4" : C.green, fontWeight: 700,
                cursor: currentAyah >= surahData.numberOfAyahs ? "not-allowed" : "pointer" }}>
              Next ▶
            </button>
          </div>
        )}
      </div>

      {/* Surah Navigation */}
      <div style={card({ padding: "12px 14px", display: "flex", gap: 10 })}>
        <button onClick={() => setSelectedSurah(v => Math.max(1, v - 1))} disabled={selectedSurah <= 1}
          style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${C.border}`,
            background: "#f8fafb", color: selectedSurah <= 1 ? "#d4e8d4" : C.green, fontWeight: 700, cursor: selectedSurah <= 1 ? "not-allowed" : "pointer" }}>
          ◀ Previous Surah
        </button>
        <button onClick={() => setSelectedSurah(v => Math.min(114, v + 1))} disabled={selectedSurah >= 114}
          style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${C.border}`,
            background: "#f8fafb", color: selectedSurah >= 114 ? "#d4e8d4" : C.green, fontWeight: 700, cursor: selectedSurah >= 114 ? "not-allowed" : "pointer" }}>
          Next Surah ▶
        </button>
      </div>
    </div>
  );
}

function toArabicNum(n: number) {
  return String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
}
