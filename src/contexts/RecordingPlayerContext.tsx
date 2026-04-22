/**
 * RecordingPlayerContext.tsx — Tahleem Academy
 *
 * A global audio/video player that persists across ALL page navigation.
 * The HTMLAudioElement lives inside this context so it never unmounts.
 * Any component can call `playRecording(...)` to start/switch playback.
 *
 * Features:
 *  - Survives route changes (dashboard, other subjects, anywhere)
 *  - Speed control: 0.75x, 1x, 1.25x, 1.5x, 2x
 *  - Resumes from last saved position (localStorage)
 *  - MediaSession API for lock-screen / notification controls
 *  - Floating mini-player at bottom of screen
 *  - Expandable full-player panel
 */

import React, { createContext, useContext, useRef, useState, useEffect, useCallback } from "react";
import { getSignedUrl } from "@/integrations/supabase/storageClient";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  X, ChevronUp, ChevronDown, Loader2,
} from "lucide-react";

// ── Position persistence ──────────────────────────────────────
const POS_KEY   = (id: string) => `tahleem-rec-pos-${id}`;
const savePos   = (id: string, t: number) => { try { localStorage.setItem(POS_KEY(id), String(t)); } catch {} };
const readPos   = (id: string): number    => { try { return parseFloat(localStorage.getItem(POS_KEY(id)) || "0") || 0; } catch { return 0; } };

const SPEEDS    = [0.75, 1, 1.25, 1.5, 2];
const GOLD      = "#C9A84C";
const G         = "#064E3B";
const GM        = "#0a6644";

// ── Types ─────────────────────────────────────────────────────
export interface RecordingInfo {
  id:       string;
  fileUrl:  string;
  title:    string;
  duration: number;   // seconds (hint — actual from metadata)
}

interface PlayerState {
  recording:   RecordingInfo | null;
  signedUrl:   string | null;
  loading:     boolean;
  error:       string | null;
  playing:     boolean;
  currentTime: number;
  duration:    number;
  volume:      number;
  muted:       boolean;
  speed:       number;
  expanded:    boolean;  // false = compact bar, true = full panel
}

interface RecordingPlayerContextType {
  state:          PlayerState;
  playRecording:  (rec: RecordingInfo) => void;
  togglePlay:     () => void;
  stop:           () => void;
  seek:           (t: number) => void;
  skip:           (sec: number) => void;
  setSpeed:       (s: number) => void;
  setVolume:      (v: number) => void;
  toggleMute:     () => void;
  setExpanded:    (v: boolean) => void;
  isActiveId:     (id: string) => boolean;
}

const Ctx = createContext<RecordingPlayerContextType | null>(null);

export const useRecordingPlayer = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRecordingPlayer must be used inside RecordingPlayerProvider");
  return ctx;
};

// ── Formatting ────────────────────────────────────────────────
const fmt = (s: number): string => {
  if (!isFinite(s) || isNaN(s) || s < 0) return "--:--";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

// ══ PROVIDER ═════════════════════════════════════════════════
export const RecordingPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const audioRef    = useRef<HTMLAudioElement>(new Audio());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumedRef  = useRef(false);

  const [state, setState] = useState<PlayerState>({
    recording:   null,
    signedUrl:   null,
    loading:     false,
    error:       null,
    playing:     false,
    currentTime: 0,
    duration:    0,
    volume:      1,
    muted:       false,
    speed:       1,
    expanded:    false,
  });

  // ── Wire up audio element events once ───────────────────────
  useEffect(() => {
    const a = audioRef.current;
    const onTime  = () => {
      const t = a.currentTime;
      setState(p => ({ ...p, currentTime: t }));
      // Save position debounced
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        if (state.recording?.id) savePos(state.recording.id, t);
      }, 2000);
    };
    const onMeta  = () => {
      const dur = isFinite(a.duration) ? a.duration : 0;
      setState(p => ({ ...p, duration: dur || p.duration }));
      // Restore saved position
      if (!resumedRef.current && state.recording?.id) {
        const saved = readPos(state.recording.id);
        if (saved > 5 && saved < (dur - 5)) {
          a.currentTime = saved;
          setState(p => ({ ...p, currentTime: saved }));
        }
        resumedRef.current = true;
      }
    };
    const onPlay  = () => setState(p => ({ ...p, playing: true }));
    const onPause = () => setState(p => ({ ...p, playing: false }));
    const onEnded = () => {
      setState(p => ({ ...p, playing: false, currentTime: 0 }));
      if (state.recording?.id) savePos(state.recording.id, 0);
    };
    const onErr   = () => setState(p => ({ ...p, loading: false, error: "Could not play recording", playing: false }));

    a.addEventListener("timeupdate",     onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("play",           onPlay);
    a.addEventListener("pause",          onPause);
    a.addEventListener("ended",          onEnded);
    a.addEventListener("error",          onErr);
    return () => {
      a.removeEventListener("timeupdate",     onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("play",           onPlay);
      a.removeEventListener("pause",          onPause);
      a.removeEventListener("ended",          onEnded);
      a.removeEventListener("error",          onErr);
    };
  }, [state.recording?.id]);

  // ── MediaSession ─────────────────────────────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator) || !state.recording) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  state.recording.title || "Tahleem Recording",
      artist: "Tahleem Academy",
      album:  "Recorded Lesson",
    });
    navigator.mediaSession.setActionHandler("play",         () => audioRef.current.play());
    navigator.mediaSession.setActionHandler("pause",        () => audioRef.current.pause());
    navigator.mediaSession.setActionHandler("seekbackward", () => { audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10); });
    navigator.mediaSession.setActionHandler("seekforward",  () => { audioRef.current.currentTime = Math.min(audioRef.current.duration || Infinity, audioRef.current.currentTime + 10); });
  }, [state.recording]);

  // ── Actions ──────────────────────────────────────────────────
  const playRecording = useCallback(async (rec: RecordingInfo) => {
    const a = audioRef.current;

    // If same recording is already loaded, just toggle
    if (state.recording?.id === rec.id && state.signedUrl) {
      if (state.playing) { a.pause(); } else { a.play().catch(() => {}); }
      setState(p => ({ ...p, expanded: true }));
      return;
    }

    // Load new recording
    resumedRef.current = false;
    setState(p => ({ ...p, loading: true, error: null, recording: rec, playing: false, currentTime: 0, duration: rec.duration || 0, expanded: true, signedUrl: null }));

    a.pause();

    try {
      const url = await getSignedUrl(rec.fileUrl, 7200);
      if (!url) throw new Error("Could not load file URL");

      a.src = url;
      a.playbackRate = state.speed;
      a.volume = state.volume;
      a.muted  = state.muted;
      a.load();

      setState(p => ({ ...p, signedUrl: url, loading: false }));

      // Restore position then play
      const saved = readPos(rec.id);
      if (saved > 5) {
        // Wait for metadata, then seek
        const seekAndPlay = () => {
          const dur = isFinite(a.duration) ? a.duration : 0;
          if (saved < dur - 5) a.currentTime = saved;
          resumedRef.current = true;
          a.play().catch(() => {});
        };
        if (isFinite(a.duration) && a.duration > 0) {
          seekAndPlay();
        } else {
          a.addEventListener("loadedmetadata", seekAndPlay, { once: true });
        }
      } else {
        a.play().catch(() => {});
      }

      // MediaSession update
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: rec.title || "Tahleem Recording", artist: "Tahleem Academy", album: "Recorded Lesson",
        });
      }

    } catch (err: any) {
      setState(p => ({ ...p, loading: false, error: err?.message || "Failed to load recording" }));
    }
  }, [state.recording?.id, state.signedUrl, state.playing, state.speed, state.volume, state.muted]);

  const togglePlay  = useCallback(() => {
    const a = audioRef.current;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  }, []);

  const stop        = useCallback(() => {
    const a = audioRef.current;
    a.pause();
    if (state.recording?.id) savePos(state.recording.id, a.currentTime);
    setState(p => ({ ...p, recording: null, signedUrl: null, playing: false, currentTime: 0, duration: 0 }));
    a.src = "";
  }, [state.recording?.id]);

  const seek        = useCallback((t: number) => {
    audioRef.current.currentTime = t;
    setState(p => ({ ...p, currentTime: t }));
  }, []);

  const skip        = useCallback((sec: number) => {
    const a = audioRef.current;
    const t = Math.max(0, Math.min(isFinite(a.duration) ? a.duration : 0, a.currentTime + sec));
    a.currentTime = t;
    setState(p => ({ ...p, currentTime: t }));
  }, []);

  const setSpeed    = useCallback((s: number) => {
    audioRef.current.playbackRate = s;
    setState(p => ({ ...p, speed: s }));
  }, []);

  const setVolume   = useCallback((v: number) => {
    audioRef.current.volume = v;
    audioRef.current.muted  = v === 0;
    setState(p => ({ ...p, volume: v, muted: v === 0 }));
  }, []);

  const toggleMute  = useCallback(() => {
    const next = !state.muted;
    audioRef.current.muted = next;
    setState(p => ({ ...p, muted: next }));
  }, [state.muted]);

  const setExpanded = useCallback((v: boolean) => setState(p => ({ ...p, expanded: v })), []);
  const isActiveId  = useCallback((id: string) => state.recording?.id === id, [state.recording?.id]);

  const ctx: RecordingPlayerContextType = {
    state, playRecording, togglePlay, stop, seek, skip,
    setSpeed, setVolume, toggleMute, setExpanded, isActiveId,
  };

  return (
    <Ctx.Provider value={ctx}>
      {children}
      <GlobalPlayer ctx={ctx} />
    </Ctx.Provider>
  );
};

// ══ GLOBAL FLOATING PLAYER UI ════════════════════════════════
const GlobalPlayer: React.FC<{ ctx: RecordingPlayerContextType }> = ({ ctx }) => {
  const { state, togglePlay, stop, seek, skip, setSpeed, setVolume, toggleMute, setExpanded } = ctx;
  const [showSpeeds, setShowSpeeds] = useState(false);
  const { recording, playing, currentTime, duration, volume, muted, speed, expanded, loading, error } = state;

  if (!recording) return null;

  const pct         = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const savedPos    = readPos(recording.id);
  const hasSaved    = savedPos > 5;

  return (
    <div
      style={{
        position:    "fixed",
        bottom:      0,
        left:        0,
        right:       0,
        zIndex:      9999,
        fontFamily:  "'Cairo', sans-serif",
        boxShadow:   "0 -4px 32px rgba(0,0,0,.35)",
        background:  "#0f0f0f",
        borderTop:   `2px solid ${GOLD}`,
        transition:  "all .25s ease",
      }}
    >
      {/* ── PROGRESS LINE (always visible) ── */}
      <div style={{ height: 3, background: "rgba(255,255,255,.08)", position: "relative", cursor: "pointer" }}
        onClick={e => {
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          seek(ratio * duration);
        }}>
        <div style={{ height: "100%", width: `${pct}%`, background: GOLD, transition: "width .4s linear" }} />
      </div>

      {/* ── COMPACT BAR (always) ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>

        {/* Play/Pause */}
        <button onClick={togglePlay} disabled={loading}
          style={{ width: 40, height: 40, borderRadius: "50%", background: GOLD, border: "none", color: G, cursor: loading ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {loading
            ? <Loader2 size={18} style={{ animation: "spin .8s linear infinite" }} />
            : playing
              ? <Pause size={18} />
              : <Play  size={18} style={{ marginLeft: 2 }} />}
        </button>

        {/* Title + time */}
        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {recording.title}
          </div>
          <div style={{ fontSize: 10, color: "#888", display: "flex", gap: 6 }}>
            <span>{fmt(currentTime)}</span>
            <span>/</span>
            <span>{fmt(duration)}</span>
            <span>•</span>
            <span style={{ color: GOLD }}>{speed}×</span>
            {playing && <span style={{ color: "#22c55e" }}>▶ Live</span>}
          </div>
        </div>

        {/* Expand / Collapse */}
        <button onClick={() => setExpanded(!expanded)}
          style={{ background: "none", border: "none", color: "#888", cursor: "pointer", padding: 4 }}>
          {expanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>

        {/* Stop */}
        <button onClick={stop}
          style={{ background: "rgba(255,255,255,.08)", border: "none", color: "#aaa", cursor: "pointer", borderRadius: 6, padding: "5px 8px", fontSize: 11 }}>
          <X size={15} />
        </button>
      </div>

      {/* ── EXPANDED FULL CONTROLS ── */}
      {expanded && (
        <div style={{ padding: "0 14px 16px", borderTop: "1px solid rgba(255,255,255,.06)" }}>

          {error && (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: "#2a1010", color: "#f87171", fontSize: 12, marginBottom: 10 }}>
              ⚠ {error}
            </div>
          )}

          {/* Seek bar */}
          <div style={{ padding: "14px 0 4px", position: "relative" }}>
            <div style={{ position: "relative", height: 6, background: "rgba(255,255,255,.12)", borderRadius: 4, cursor: "pointer" }}>
              <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${pct}%`, background: GOLD, borderRadius: 4, pointerEvents: "none" }} />
              <input
                type="range" min={0} max={duration || 100} step={0.5} value={currentTime}
                onChange={e => seek(parseFloat(e.target.value))}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", margin: 0 }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#666", marginTop: 4 }}>
              <span>{fmt(currentTime)}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>

          {/* Controls row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>

            {/* Skip back 10s */}
            <button onClick={() => skip(-10)}
              style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "4px 6px" }}>
              <SkipBack size={20} color="#aaa" />
              <span style={{ fontSize: 9, color: "#666" }}>10s</span>
            </button>

            {/* Play/Pause (large) */}
            <button onClick={togglePlay} disabled={loading}
              style={{ width: 56, height: 56, borderRadius: "50%", background: GOLD, border: "none", color: G, cursor: loading ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 16px rgba(201,168,76,.4)" }}>
              {loading
                ? <Loader2 size={24} style={{ animation: "spin .8s linear infinite" }} />
                : playing
                  ? <Pause size={24} />
                  : <Play  size={24} style={{ marginLeft: 3 }} />}
            </button>

            {/* Skip forward 10s */}
            <button onClick={() => skip(10)}
              style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "4px 6px" }}>
              <SkipForward size={20} color="#aaa" />
              <span style={{ fontSize: 9, color: "#666" }}>10s</span>
            </button>

            {/* Speed */}
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowSpeeds(s => !s)}
                style={{ padding: "6px 11px", borderRadius: 8, background: showSpeeds ? GOLD : "rgba(201,168,76,.15)", border: `1.5px solid ${GOLD}`, color: showSpeeds ? G : GOLD, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                {speed}×
              </button>
              {showSpeeds && (
                <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, background: "#1a1a1a", border: "1px solid #333", borderRadius: 10, overflow: "hidden", minWidth: 72, zIndex: 1 }}>
                  {SPEEDS.map(s => (
                    <button key={s} onClick={() => { setSpeed(s); setShowSpeeds(false); }}
                      style={{ display: "block", width: "100%", padding: "9px 0", background: s === speed ? "rgba(201,168,76,.25)" : "none", border: "none", color: s === speed ? GOLD : "#ccc", fontSize: 13, fontWeight: s === speed ? 800 : 500, cursor: "pointer", textAlign: "center" }}>
                      {s}×
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Volume */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
              <button onClick={toggleMute} style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", flexShrink: 0 }}>
                {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input
                type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
                onChange={e => setVolume(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: GOLD, height: 3, cursor: "pointer" }}
              />
            </div>
          </div>

          {/* Resume hint */}
          {hasSaved && currentTime < 3 && (
            <div style={{ textAlign: "center", fontSize: 11, color: "#666", marginTop: 8 }}>
              ↩ Resumed from {fmt(savedPos)}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default RecordingPlayerProvider;
