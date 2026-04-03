import { useState, useEffect, useRef, useCallback } from "react";
import { SURAHS, audioUrl, RECITERS, DEFAULT_RECITER } from "./surahData";
import { audioManager } from "./audioManager";

interface Ayah { numberInSurah: number; text: string; }
interface SurahData { englishName: string; name: string; numberOfAyahs: number; ayahs: Ayah[]; }

const G = "#0f2d1f"; const GM = "#1a4731"; const GOLD = "#c9a84c";
const LIGHT = "#faf6ee"; const TEXT = "#2d4a35";

function toAr(n: number) { return String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]); }

interface Props { reciter?: string; onReciterChange?: (id: string) => void; }

export default function HifdhRecitation({ reciter: reciterProp, onReciterChange }: Props = {}) {
  const [selSurah, setSelSurah] = useState(1);
  const [surahData, setSurahData] = useState<SurahData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fontSize, setFontSize] = useState(28);
  const [playingAyah, setPlayingAyah] = useState(0);
  const [reciter, setReciter] = useState(reciterProp || DEFAULT_RECITER);
  const [showSurahList, setShowSurahList] = useState(false);
  const [search, setSearch] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingRef = useRef(0);
  const surahDataRef = useRef<SurahData | null>(null);
  const selSurahRef = useRef(1);
  const verseRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => { surahDataRef.current = surahData; }, [surahData]);
  useEffect(() => { selSurahRef.current = selSurah; }, [selSurah]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const stopAll = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    playingRef.current = 0;
    setPlayingAyah(0);
  }, []);

  const fetchSurah = useCallback(async (num: number) => {
    setLoading(true); setError(""); setSurahData(null); stopAll();
    try {
      const res = await fetch(`https://api.alquran.cloud/v1/surah/${num}/ar.uthmani`);
      const json = await res.json();
      if (json.code === 200) setSurahData(json.data);
      else setError("Could not load this surah.");
    } catch { setError("Network error — check your connection."); }    setLoading(false);
  }, [stopAll]);

  useEffect(() => { fetchSurah(selSurah); }, [selSurah, fetchSurah]);

  const playAyah = useCallback((num: number) => {
    audioRef.current?.pause();
    audioRef.current = null;
    const sd = surahDataRef.current;
    if (!sd || num < 1 || num > sd.numberOfAyahs) { stopAll(); return; }

    playingRef.current = num;
    setPlayingAyah(num);

    requestAnimationFrame(() => {
      verseRefs.current[num]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    const audio = new Audio(audioUrl(selSurahRef.current, num, reciter));
    audioRef.current = audio;
    audio.play().catch(stopAll);
    audio.onended = () => {
      const next = playingRef.current + 1;
      const total = surahDataRef.current?.numberOfAyahs ?? 0;
      if (next <= total) playAyah(next);
      else stopAll();
    };
  }, [stopAll, reciter]);

  const surah = SURAHS[selSurah - 1];
  const filtered = SURAHS.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.nameAr.includes(search) || String(s.num).includes(search)
  );

  return (
    <div style={{ minHeight: "100vh", background: LIGHT, fontFamily: "'Amiri', serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:1} }
        .quran-text { font-family: 'Amiri Quran', 'Scheherazade New', serif; line-height: 2.2; }
      `}</style>

      {/* ── TOP CONTROL BAR (Single Line) ──────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${G}, ${GM})`,
        padding: "12px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 2px 12px rgba(15,45,31,0.15)",
        position: "sticky", top: 0, zIndex: 50
      }}>        {/* Left: Surah Info */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setShowSurahList(v => !v)}
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8, padding: "6px 10px", color: "#fff", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
            <span style={{ fontFamily: "'Amiri', serif", fontSize: 16 }}>{surah.nameAr}</span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>Juz {surah.juz}</span>
          </button>
        </div>

        {/* Center: Playback Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => { const n = Math.max(1, playingAyah - 1); if (n !== playingAyah) playAyah(n); }}
            disabled={playingAyah <= 1}
            style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.3)",
              background: playingAyah <= 1 ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.15)",
              color: "#fff", cursor: playingAyah <= 1 ? "not-allowed" : "pointer", fontSize: 14 }}>
            ◀
          </button>
          <button onClick={() => playingAyah > 0 ? stopAll() : playAyah(1)}
            style={{ width: 44, height: 44, borderRadius: "50%", border: "none",
              background: GOLD, color: G, cursor: "pointer", fontSize: 18, fontWeight: 800,
              boxShadow: "0 2px 8px rgba(201,168,76,0.4)" }}>
            {playingAyah > 0 ? "⏸" : "▶"}
          </button>
          <button onClick={() => { const n = Math.min(surahData?.numberOfAyahs || 1, (playingAyah || 0) + 1); if (n !== playingAyah) playAyah(n); }}
            disabled={!surahData || playingAyah >= surahData.numberOfAyahs}
            style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.3)",
              background: !surahData || playingAyah >= surahData.numberOfAyahs ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.15)",
              color: "#fff", cursor: !surahData || playingAyah >= surahData.numberOfAyahs ? "not-allowed" : "pointer", fontSize: 14 }}>
            ▶
          </button>
        </div>

        {/* Right: Reciter & Font */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select value={reciter} onChange={e => { setReciter(e.target.value); onReciterChange?.(e.target.value); }}
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8, padding: "6px 8px", color: "#fff", fontSize: 12, cursor: "pointer", outline: "none" }}>
            {RECITERS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button onClick={() => setFontSize(v => Math.max(20, v - 2))}
            style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer", fontSize: 12 }}>A−</button>
          <button onClick={() => setFontSize(v => Math.min(40, v + 2))}
            style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer", fontSize: 12 }}>A+</button>
        </div>
      </div>
      {/* ── SURAH DROPDOWN ─────────────────────────────────────────────────── */}
      {showSurahList && (
        <div style={{ position: "absolute", top: 60, left: 16, right: 16, background: "#fff",
          borderRadius: 16, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", zIndex: 60, overflow: "hidden" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search surah..."
            style={{ width: "100%", padding: "12px 16px", border: "none", borderBottom: "1px solid #e5e7eb",
              fontSize: 14, outline: "none", boxSizing: "border-box" }} />
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {filtered.map(s => (
              <div key={s.num} onClick={() => { setSelSurah(s.num); setShowSurahList(false); setSearch(""); }}
                style={{ padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between",
                  background: s.num === selSurah ? "#f0fdf4" : "transparent", borderBottom: "1px solid #f0f4f0" }}>
                <span style={{ fontWeight: 600, color: G }}>{s.num}. {s.name}</span>
                <span style={{ fontFamily: "'Amiri', serif", color: GOLD }}>{s.nameAr}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── QURAN TEXT CONTAINER ───────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 40px", maxWidth: 800, margin: "0 auto", width: "100%" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#7a9e88", animation: "pulse 1.5s infinite" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📖</div>
            Loading Surah...
          </div>
        )}
        {error && !loading && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#c0392b" }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
            {error}
            <button onClick={() => fetchSurah(selSurah)}
              style={{ marginTop: 12, padding: "10px 20px", borderRadius: 10, border: "none",
                background: G, color: "#fff", cursor: "pointer" }}>Retry</button>
          </div>
        )}
        {surahData && !loading && (
          <>
            {/* Bismillah */}
            {selSurah !== 1 && selSurah !== 9 && (
              <div style={{ textAlign: "center", fontFamily: "'Amiri Quran', serif", fontSize: fontSize + 4,
                color: G, marginBottom: 24, padding: "16px", borderRadius: 16,
                background: "#fff", border: "1px solid #e5e7eb", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
              </div>
            )}

            {/* Verses */}            <div style={{ background: "#fff", borderRadius: 20, padding: "24px 20px",
              border: "1px solid #e5e7eb", boxShadow: "0 4px 20px rgba(0,0,0,0.05)" }}>
              {surahData.ayahs.map(ayah => {
                const active = playingAyah === ayah.numberInSurah;
                return (
                  <div key={ayah.numberInSurah} ref={el => { verseRefs.current[ayah.numberInSurah] = el; }}
                    onClick={() => active ? stopAll() : playAyah(ayah.numberInSurah)}
                    style={{
                      direction: "rtl", padding: "16px 12px", borderRadius: 14, marginBottom: 12,
                      cursor: "pointer", transition: "all .2s ease",
                      background: active ? "#fffbeb" : "transparent",
                      border: `1.5px solid ${active ? GOLD : "transparent"}`,
                      boxShadow: active ? "0 0 0 3px rgba(201,168,76,0.15)" : "none",
                    }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, direction: "ltr" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {active && <span style={{ fontSize: 12, color: GOLD, animation: "pulse 1s infinite" }}>🔊</span>}
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: active ? GOLD : "#f0f4f0",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          border: `1px solid ${active ? GOLD : "#e5e7eb"}` }}>
                          <span style={{ fontFamily: "'Amiri', serif", fontSize: 10, fontWeight: 700, color: active ? "#fff" : G }}>
                            {toAr(ayah.numberInSurah)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="quran-text" style={{ fontSize, color: active ? G : TEXT, textAlign: "right" }}>
                      {ayah.text}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── BOTTOM NAV (Surah Switch) ──────────────────────────────────────── */}
      <div style={{ padding: "12px 16px", background: "#fff", borderTop: "1px solid #e5e7eb",
        display: "flex", gap: 12, position: "sticky", bottom: 0 }}>
        <button onClick={() => setSelSurah(v => Math.max(1, v - 1))} disabled={selSurah <= 1}
          style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid #e5e7eb",
            background: selSurah <= 1 ? "#f8fafb" : LIGHT, color: selSurah <= 1 ? "#ccc" : G,
            fontWeight: 700, cursor: selSurah <= 1 ? "not-allowed" : "pointer" }}>
          ◀ Previous
        </button>
        <button onClick={() => setSelSurah(v => Math.min(114, v + 1))} disabled={selSurah >= 114}
          style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid #e5e7eb",
            background: selSurah >= 114 ? "#f8fafb" : LIGHT, color: selSurah >= 114 ? "#ccc" : G,
            fontWeight: 700, cursor: selSurah >= 114 ? "not-allowed" : "pointer" }}>          Next ▶
        </button>
      </div>
    </div>
  );
}