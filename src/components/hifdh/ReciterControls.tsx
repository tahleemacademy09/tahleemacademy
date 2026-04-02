/*  src/components/hifdh/ReciterControls.tsx
    Playback controls — play/pause, prev/next, loop with counter, speed (0.5–1.5×),
    and an inline reciter picker panel.
*/
import { useState, useEffect } from "react";
import { audioManager, type PlaybackSpeed } from "./audioManager";
import { RECITERS } from "./surahData";

const G = "#1a3d24"; const GM = "#276749"; const GOLD = "#b7791f";
const LIGHT = "#f0fff4"; const BORDER = "#d4e8d4";

const SPEED_LABELS: Record<string, string> = {
  "0.5": "½×", "0.75": "¾×", "1": "1×", "1.25": "1¼×", "1.5": "1½×",
};

interface Props {
  surahNum:        number;
  totalAyahs:      number;
  playingAyah:     number;
  onAyahChange:    (ayah: number) => void;
  reciter:         string;
  onReciterChange: (id: string) => void;
}

export default function ReciterControls({
  surahNum, totalAyahs, playingAyah, onAyahChange, reciter, onReciterChange,
}: Props) {
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [looping,     setLooping]     = useState(false);
  const [loopCount,   setLoopCount]   = useState(5);
  const [loopsDone,   setLoopsDone]   = useState(0);
  const [speed,       setSpeed]       = useState<PlaybackSpeed>(1);
  const [buffering,   setBuffering]   = useState(false);
  const [showPicker,  setShowPicker]  = useState(false);

  useEffect(() => { audioManager.setReciter(reciter); }, [reciter]);

  useEffect(() => {
    audioManager.onAyahChanged(onAyahChange);
    audioManager.onLoopProgress((done) => setLoopsDone(done));
    audioManager.onBufferingChange(setBuffering);
    return () => { audioManager.stop(); };
  }, [onAyahChange]);

  const playAyah = (ayah: number) => {
    if (ayah < 1 || ayah > totalAyahs) return;
    audioManager.setLoop(looping, loopCount);
    audioManager.playAyah(surahNum, ayah, () => {
      if (!looping && ayah < totalAyahs) playAyah(ayah + 1);
      else setIsPlaying(false);
    });
    setIsPlaying(true);
    setLoopsDone(0);
  };

  const togglePlay = () => {
    if (isPlaying) { audioManager.stop(); setIsPlaying(false); }
    else playAyah(playingAyah || 1);
  };

  const prevAyah = () => playAyah(Math.max(1, (playingAyah || 1) - 1));
  const nextAyah = () => playAyah(Math.min(totalAyahs, (playingAyah || 0) + 1));

  const toggleLoop = () => {
    const next = !looping;
    setLooping(next);
    audioManager.setLoop(next, loopCount);
  };

  const cycleSpeed = () => {
    const s = audioManager.cycleSpeed();
    setSpeed(s);
  };

  const currentReciter = RECITERS.find(r => r.id === reciter);

  const pill = (active: boolean, extra?: React.CSSProperties): React.CSSProperties => ({
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 10, border: "none", cursor: "pointer", transition: "all .15s",
    background: active ? `linear-gradient(135deg,${G},${GM})` : "#f0f4f0",
    color: active ? "#fff" : G, fontWeight: 700,
    ...extra,
  });

  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 16,
      boxShadow: "0 2px 12px rgba(26,61,36,.07)", overflow: "hidden" }}>

      {/* ── Reciter row ── */}
      <div style={{ padding: "11px 14px", borderBottom: `1px solid ${showPicker ? BORDER : "transparent"}`,
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8,
            background: `linear-gradient(135deg,${G},${GM})`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
            🎙
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: G, lineHeight: 1 }}>
              {currentReciter?.label || "Select reciter"}
            </div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 12, color: GOLD, lineHeight: 1.4 }}>
              {currentReciter?.labelAr}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {buffering && (
            <span style={{ fontSize: 10, color: GOLD, fontWeight: 700,
              background: "#fffbeb", padding: "2px 8px", borderRadius: 10, border: `1px solid ${GOLD}44` }}>
              ⏳ Loading…
            </span>
          )}
          <button onClick={() => setShowPicker(v => !v)}
            style={{ padding: "5px 12px", borderRadius: 10, border: `1.5px solid ${showPicker ? G : BORDER}`,
              background: showPicker ? LIGHT : "#f8fafb", color: showPicker ? G : "#7a9e88",
              fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            {showPicker ? "✕ Close" : "Change ▾"}
          </button>
        </div>
      </div>

      {/* ── Reciter picker panel ── */}
      {showPicker && (
        <div style={{ padding: "8px 10px", borderBottom: `1px solid ${BORDER}`,
          display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
          {RECITERS.map(r => {
            const active = r.id === reciter;
            return (
              <button key={r.id}
                onClick={() => { onReciterChange(r.id); setShowPicker(false); }}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "9px 12px", borderRadius: 12, border: `1.5px solid ${active ? G : BORDER}`,
                  background: active ? LIGHT : "#fafafa", cursor: "pointer", textAlign: "left", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: active ? G : "#374151" }}>{r.label}</div>
                  <div style={{ fontFamily: "'Amiri',serif", fontSize: 13, color: GOLD }}>{r.labelAr}</div>
                </div>
                {active && (
                  <div style={{ width: 22, height: 22, borderRadius: "50%",
                    background: G, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, color: "#fff", flexShrink: 0 }}>✓</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Playback controls ── */}
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" as const }}>

          {/* Speed */}
          <button onClick={cycleSpeed}
            style={{ ...pill(false), padding: "7px 11px", fontSize: 11, border: `1px solid ${BORDER}` }}>
            {SPEED_LABELS[String(speed)] || `${speed}×`}
          </button>

          {/* Prev */}
          <button onClick={prevAyah} disabled={playingAyah <= 1}
            style={{ ...pill(false), width: 40, height: 40, opacity: playingAyah <= 1 ? 0.3 : 1 }}>
            <span style={{ fontSize: 16 }}>⏮</span>
          </button>

          {/* Play / Pause */}
          <button onClick={togglePlay}
            style={{ ...pill(isPlaying, { width: 52, height: 52, borderRadius: "50%",
              boxShadow: isPlaying ? `0 0 0 4px ${G}22` : "none" }) }}>
            <span style={{ fontSize: 22 }}>{isPlaying ? "⏸" : "▶"}</span>
          </button>

          {/* Next */}
          <button onClick={nextAyah} disabled={playingAyah >= totalAyahs}
            style={{ ...pill(false), width: 40, height: 40, opacity: playingAyah >= totalAyahs ? 0.3 : 1 }}>
            <span style={{ fontSize: 16 }}>⏭</span>
          </button>

          {/* Loop */}
          <button onClick={toggleLoop}
            style={{ ...pill(looping, {
              padding: "7px 11px", fontSize: 11,
              border: looping ? `2px solid ${GOLD}` : `1px solid ${BORDER}`,
              background: looping ? "#fffbeb" : "#f0f4f0",
              color: looping ? GOLD : G,
            }) }}>
            🔁 {looping ? `${loopsDone}/${loopCount}` : "Loop"}
          </button>
        </div>

        {/* Loop count adjuster */}
        {looping && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
            gap: 6, marginTop: 10, flexWrap: "wrap" as const }}>
            <span style={{ fontSize: 11, color: "#7a9e88" }}>Repeat each ayah:</span>
            {[3, 5, 7, 10, 20].map(n => (
              <button key={n} onClick={() => { setLoopCount(n); audioManager.setLoop(true, n); }}
                style={{ padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                  border: loopCount === n ? `2px solid ${GOLD}` : `1px solid ${BORDER}`,
                  background: loopCount === n ? "#fffbeb" : "#f8fafb",
                  color: loopCount === n ? GOLD : G, cursor: "pointer" }}>
                {n}×
              </button>
            ))}
          </div>
        )}

        {/* Ayah indicator */}
        {playingAyah > 0 && (
          <div style={{ textAlign: "center", marginTop: 8, fontSize: 12, color: "#7a9e88" }}>
            Ayah&nbsp;<strong style={{ color: G }}>{playingAyah}</strong>&nbsp;/&nbsp;{totalAyahs}
          </div>
        )}
      </div>
    </div>
  );
}
