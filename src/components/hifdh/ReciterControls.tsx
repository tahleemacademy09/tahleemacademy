/*  src/components/hifdh/ReciterControls.tsx
    Elegant reciter playback controls — play/pause, prev/next ayah, loop, speed
*/
import { useState, useEffect } from "react";
import { audioManager, type PlaybackSpeed } from "./audioManager";
import { RECITERS } from "./surahData";

const G = "#1a3d24"; const GM = "#276749"; const GOLD = "#b7791f";
const LIGHT = "#f0fff4"; const BORDER = "#d4e8d4";

interface Props {
  surahNum: number;
  totalAyahs: number;
  playingAyah: number;
  onAyahChange: (ayah: number) => void;
  reciter: string;
  onReciterChange: (id: string) => void;
}

export default function ReciterControls({ surahNum, totalAyahs, playingAyah, onAyahChange, reciter, onReciterChange }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [looping, setLooping] = useState(false);
  const [loopCount, setLoopCount] = useState(10);
  const [loopsDone, setLoopsDone] = useState(0);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [buffering, setBuffering] = useState(false);

  useEffect(() => {
    audioManager.setReciter(reciter);
  }, [reciter]);

  useEffect(() => {
    audioManager.onAyahChanged(onAyahChange);
    audioManager.onLoopProgress((done, total) => setLoopsDone(done));
    audioManager.onBufferingChange(setBuffering);
    return () => { audioManager.stop(); };
  }, [onAyahChange]);

  const playAyah = (ayah: number) => {
    if (ayah < 1 || ayah > totalAyahs) return;
    audioManager.setLoop(looping, loopCount);
    audioManager.playAyah(surahNum, ayah, () => {
      // Auto-advance to next ayah
      if (!looping && ayah < totalAyahs) {
        playAyah(ayah + 1);
      } else {
        setIsPlaying(false);
      }
    });
    setIsPlaying(true);
    setLoopsDone(0);
  };

  const togglePlay = () => {
    if (isPlaying) {
      audioManager.stop();
      setIsPlaying(false);
    } else {
      playAyah(playingAyah || 1);
    }
  };

  const prevAyah = () => {
    const a = Math.max(1, (playingAyah || 1) - 1);
    playAyah(a);
  };

  const nextAyah = () => {
    const a = Math.min(totalAyahs, (playingAyah || 0) + 1);
    playAyah(a);
  };

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

  const btn = (active: boolean, extra?: React.CSSProperties): React.CSSProperties => ({
    width: 40, height: 40, borderRadius: "50%", border: "none",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", transition: "all .15s", flexShrink: 0,
    background: active ? `linear-gradient(135deg,${G},${GM})` : "#f0f4f0",
    color: active ? "#fff" : G,
    ...extra,
  });

  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 16,
      boxShadow: "0 2px 12px rgba(26,61,36,.07)", padding: "12px 14px" }}>
      
      {/* Reciter name */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14 }}>🎙</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: G }}>{currentReciter?.label || "Reciter"}</span>
          <span style={{ fontFamily: "'Amiri',serif", fontSize: 12, color: GOLD }}>{currentReciter?.labelAr}</span>
        </div>
        {buffering && (
          <span style={{ fontSize: 10, color: GOLD, fontWeight: 600, animation: "pulse 1s infinite" }}>
            Buffering…
          </span>
        )}
      </div>

      {/* Controls row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {/* Speed */}
        <button onClick={cycleSpeed} style={{
          ...btn(false),
          width: "auto", borderRadius: 10, padding: "6px 10px",
          border: `1px solid ${BORDER}`, fontSize: 11, fontWeight: 800,
        }}>
          {speed}×
        </button>

        {/* Prev */}
        <button onClick={prevAyah} disabled={playingAyah <= 1}
          style={btn(false, { opacity: playingAyah <= 1 ? 0.3 : 1 })}>
          <span style={{ fontSize: 16 }}>⏮</span>
        </button>

        {/* Play/Pause */}
        <button onClick={togglePlay} style={btn(isPlaying, { width: 50, height: 50 })}>
          <span style={{ fontSize: 20 }}>{isPlaying ? "⏸" : "▶"}</span>
        </button>

        {/* Next */}
        <button onClick={nextAyah} disabled={playingAyah >= totalAyahs}
          style={btn(false, { opacity: playingAyah >= totalAyahs ? 0.3 : 1 })}>
          <span style={{ fontSize: 16 }}>⏭</span>
        </button>

        {/* Loop */}
        <button onClick={toggleLoop}
          style={btn(looping, {
            width: "auto", borderRadius: 10, padding: "6px 10px",
            border: looping ? `2px solid ${GOLD}` : `1px solid ${BORDER}`,
            background: looping ? "#fffbeb" : "#f0f4f0",
            color: looping ? GOLD : G,
            fontSize: 11, fontWeight: 800,
          })}>
          🔁 {looping ? `${loopsDone}/${loopCount}` : "Loop"}
        </button>
      </div>

      {/* Loop count adjuster */}
      {looping && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10 }}>
          <span style={{ fontSize: 11, color: "#7a9e88" }}>Repeat:</span>
          {[3, 5, 10, 20].map(n => (
            <button key={n} onClick={() => { setLoopCount(n); audioManager.setLoop(true, n); }}
              style={{
                padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                border: loopCount === n ? `2px solid ${GOLD}` : `1px solid ${BORDER}`,
                background: loopCount === n ? "#fffbeb" : "#f8fafb",
                color: loopCount === n ? GOLD : G, cursor: "pointer",
              }}>
              {n}×
            </button>
          ))}
        </div>
      )}

      {/* Active ayah indicator */}
      {playingAyah > 0 && (
        <div style={{ textAlign: "center", marginTop: 8, fontSize: 12, color: "#7a9e88" }}>
          Ayah <strong style={{ color: G }}>{playingAyah}</strong> / {totalAyahs}
        </div>
      )}
    </div>
  );
}
