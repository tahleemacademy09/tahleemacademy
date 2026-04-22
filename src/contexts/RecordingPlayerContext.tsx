/**
 * RecordingPlayerContext.tsx — Tahleem Academy
 *
 * FIXES in this version:
 *  1. Mini-player is now a small compact DRAGGABLE pill (not full-width bar).
 *     Drag the grip / title row to move it anywhere on screen.
 *  2. 10-second skip FIXED — old code used `duration : 0` as fallback in
 *     Math.min(), so forward skip always jumped to 0 when duration was
 *     unknown. Now uses `Infinity` so it correctly adds 10 seconds.
 *  3. Seek lag UX — buffering spinner shows while audio is waiting/seeking.
 *     Seek bar is debounced so dragging doesn't fire a new network seek
 *     on every pixel; only commits after 200 ms pause.
 *  4. preload="auto" on the audio element to encourage pre-buffering.
 */

import React, {
  createContext, useContext, useRef, useState, useEffect, useCallback,
} from "react";
import { getSignedUrl } from "@/integrations/supabase/storageClient";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  X, Loader2, GripHorizontal,
} from "lucide-react";

/* ── Position persistence ──────────────────────────────────── */
const POS_KEY  = (id: string) => `tahleem-rec-pos-${id}`;
const savePos  = (id: string, t: number) => { try { localStorage.setItem(POS_KEY(id), String(t)); } catch {} };
const readPos  = (id: string): number    => { try { return parseFloat(localStorage.getItem(POS_KEY(id)) || "0") || 0; } catch { return 0; } };

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const GOLD   = "#C9A84C";
const G      = "#064E3B";

/* ── Types ─────────────────────────────────────────────────── */
export interface RecordingInfo {
  id:       string;
  fileUrl:  string;
  title:    string;
  duration: number;
}

interface PlayerState {
  recording:   RecordingInfo | null;
  signedUrl:   string | null;
  loading:     boolean;
  seeking:     boolean;
  error:       string | null;
  playing:     boolean;
  currentTime: number;
  duration:    number;
  volume:      number;
  muted:       boolean;
  speed:       number;
}

interface RecordingPlayerContextType {
  state:         PlayerState;
  audioRef:      React.MutableRefObject<HTMLAudioElement>;
  playRecording: (rec: RecordingInfo) => void;
  togglePlay:    () => void;
  stop:          () => void;
  seek:          (t: number) => void;
  skip:          (sec: number) => void;
  setSpeed:      (s: number) => void;
  setVolume:     (v: number) => void;
  toggleMute:    () => void;
  isActiveId:    (id: string) => boolean;
}

const Ctx = createContext<RecordingPlayerContextType | null>(null);

export const useRecordingPlayer = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRecordingPlayer must be inside RecordingPlayerProvider");
  return c;
};

/* ── Helpers ────────────────────────────────────────────────── */
const fmt = (s: number): string => {
  if (!isFinite(s) || isNaN(s) || s < 0) return "--:--";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

/* ══ PROVIDER ═══════════════════════════════════════════════ */
export const RecordingPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Create audio element once — never recreated on re-render
  const audioRef = useRef<HTMLAudioElement>(null as any);
  if (!audioRef.current) {
    const a = new Audio();
    a.preload = "auto";
    (audioRef as any).current = a;
  }

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumedRef   = useRef(false);
  const recIdRef     = useRef<string | null>(null); // avoids stale closure in events

  const [state, setState] = useState<PlayerState>({
    recording:   null,
    signedUrl:   null,
    loading:     false,
    seeking:     false,
    error:       null,
    playing:     false,
    currentTime: 0,
    duration:    0,
    volume:      1,
    muted:       false,
    speed:       1,
  });

  /* ── Wire audio events once ──────────────────────────────── */
  useEffect(() => {
    const a = audioRef.current;

    const onTime    = () => {
      const t = a.currentTime;
      setState(p => ({ ...p, currentTime: t }));
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        if (recIdRef.current) savePos(recIdRef.current, t);
      }, 2000);
    };
    const onMeta    = () => {
      const dur = isFinite(a.duration) ? a.duration : 0;
      setState(p => ({ ...p, duration: dur || p.duration }));
      if (!resumedRef.current && recIdRef.current) {
        const saved = readPos(recIdRef.current);
        if (saved > 5 && saved < (dur - 5)) {
          a.currentTime = saved;
          setState(p => ({ ...p, currentTime: saved }));
        }
        resumedRef.current = true;
      }
    };
    const onPlay    = () => setState(p => ({ ...p, playing: true, seeking: false }));
    const onPause   = () => setState(p => ({ ...p, playing: false }));
    const onEnded   = () => {
      setState(p => ({ ...p, playing: false, currentTime: 0 }));
      if (recIdRef.current) savePos(recIdRef.current, 0);
    };
    const onSeeking = () => setState(p => ({ ...p, seeking: true }));
    const onSeeked  = () => setState(p => ({ ...p, seeking: false }));
    const onWaiting = () => setState(p => ({ ...p, seeking: true }));
    const onPlaying = () => setState(p => ({ ...p, seeking: false }));
    const onErr     = () => setState(p => ({ ...p, loading: false, seeking: false, error: "Could not play recording", playing: false }));

    a.addEventListener("timeupdate",     onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("play",           onPlay);
    a.addEventListener("pause",          onPause);
    a.addEventListener("ended",          onEnded);
    a.addEventListener("seeking",        onSeeking);
    a.addEventListener("seeked",         onSeeked);
    a.addEventListener("waiting",        onWaiting);
    a.addEventListener("playing",        onPlaying);
    a.addEventListener("error",          onErr);
    return () => {
      a.removeEventListener("timeupdate",     onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("play",           onPlay);
      a.removeEventListener("pause",          onPause);
      a.removeEventListener("ended",          onEnded);
      a.removeEventListener("seeking",        onSeeking);
      a.removeEventListener("seeked",         onSeeked);
      a.removeEventListener("waiting",        onWaiting);
      a.removeEventListener("playing",        onPlaying);
      a.removeEventListener("error",          onErr);
    };
  }, []); // mount once, audio element is stable

  /* ── MediaSession ────────────────────────────────────────── */
  useEffect(() => {
    if (!("mediaSession" in navigator) || !state.recording) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: state.recording.title || "Tahleem Recording",
      artist: "Tahleem Academy",
      album: "Recorded Lesson",
    });
    navigator.mediaSession.setActionHandler("play",         () => audioRef.current.play());
    navigator.mediaSession.setActionHandler("pause",        () => audioRef.current.pause());
    navigator.mediaSession.setActionHandler("seekbackward", () => { audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10); });
    navigator.mediaSession.setActionHandler("seekforward",  () => { audioRef.current.currentTime += 10; });
  }, [state.recording]);

  /* ── Actions ─────────────────────────────────────────────── */
  const playRecording = useCallback(async (rec: RecordingInfo) => {
    const a = audioRef.current;
    if (state.recording?.id === rec.id && state.signedUrl) {
      if (state.playing) { a.pause(); } else { a.play().catch(() => {}); }
      return;
    }
    resumedRef.current = false;
    recIdRef.current   = rec.id;
    setState(p => ({ ...p, loading: true, error: null, recording: rec, playing: false, currentTime: 0, duration: rec.duration || 0, signedUrl: null }));
    a.pause();
    try {
      const url = await getSignedUrl(rec.fileUrl, 7200);
      if (!url) throw new Error("Could not load file URL");
      a.src          = url;
      a.playbackRate = state.speed;
      a.volume       = state.volume;
      a.muted        = state.muted;
      a.load();
      setState(p => ({ ...p, signedUrl: url, loading: false }));
      const saved = readPos(rec.id);
      if (saved > 5) {
        const seekAndPlay = () => {
          const dur = isFinite(a.duration) ? a.duration : 0;
          if (saved < dur - 5) a.currentTime = saved;
          resumedRef.current = true;
          a.play().catch(() => {});
        };
        if (isFinite(a.duration) && a.duration > 0) seekAndPlay();
        else a.addEventListener("loadedmetadata", seekAndPlay, { once: true });
      } else {
        a.play().catch(() => {});
      }
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
    if (recIdRef.current) savePos(recIdRef.current, a.currentTime);
    recIdRef.current = null;
    setState(p => ({ ...p, recording: null, signedUrl: null, playing: false, currentTime: 0, duration: 0 }));
    a.src = "";
  }, []);

  const seek        = useCallback((t: number) => {
    const a = audioRef.current;
    /* FIX: use Infinity when duration unknown so forward-skip works */
    const clamped = Math.max(0, Math.min(isFinite(a.duration) ? a.duration : Infinity, t));
    a.currentTime = clamped;
    setState(p => ({ ...p, currentTime: clamped }));
  }, []);

  /* FIX: was Math.min(duration || 0, ...) which capped forward skip to 0 */
  const skip        = useCallback((sec: number) => {
    const a   = audioRef.current;
    const cap = isFinite(a.duration) ? a.duration : Infinity;
    const t   = Math.max(0, Math.min(cap, a.currentTime + sec));
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

  const isActiveId  = useCallback((id: string) => state.recording?.id === id, [state.recording?.id]);

  const ctx: RecordingPlayerContextType = {
    state, audioRef, playRecording, togglePlay, stop, seek, skip,
    setSpeed, setVolume, toggleMute, isActiveId,
  };

  return (
    <Ctx.Provider value={ctx}>
      {children}
      <GlobalPlayer ctx={ctx} />
    </Ctx.Provider>
  );
};

/* ══ COMPACT DRAGGABLE MINI-PLAYER ═════════════════════════ */
const GlobalPlayer: React.FC<{ ctx: RecordingPlayerContextType }> = ({ ctx }) => {
  const { state, togglePlay, stop, seek, skip, setSpeed, setVolume, toggleMute } = ctx;
  const { recording, playing, currentTime, duration, volume, muted, speed, loading, seeking, error } = state;

  /* ── Draggable state ─────────────────────────────────────── */
  const [pos, setPos]       = useState<{ x: number; y: number } | null>(null);
  const [showSpeeds, setSS] = useState(false);
  const cardRef             = useRef<HTMLDivElement>(null);
  const dragging            = useRef(false);
  const dragOrigin          = useRef({ cx: 0, cy: 0, cardX: 0, cardY: 0 });

  /* ── Debounced seek for lag improvement ──────────────────── */
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);

  const handleSeekInput = useCallback((val: number) => {
    setSeekDraft(val); // instant visual feedback
    if (seekTimerRef.current) clearTimeout(seekTimerRef.current);
    seekTimerRef.current = setTimeout(() => {
      seek(val);
      setSeekDraft(null);
    }, 250); // only hit the audio element after user pauses
  }, [seek]);

  /* ── Global pointer move / up for dragging ───────────────── */
  useEffect(() => {
    const onMove = (e: TouchEvent | MouseEvent) => {
      if (!dragging.current) return;
      const cx = "touches" in e ? (e as TouchEvent).touches[0]?.clientX ?? 0 : (e as MouseEvent).clientX;
      const cy = "touches" in e ? (e as TouchEvent).touches[0]?.clientY ?? 0 : (e as MouseEvent).clientY;
      const card = cardRef.current;
      if (!card) return;
      const w = card.offsetWidth, h = card.offsetHeight;
      setPos({
        x: Math.max(8, Math.min(window.innerWidth  - w - 8, dragOrigin.current.cardX + cx - dragOrigin.current.cx)),
        y: Math.max(8, Math.min(window.innerHeight - h - 8, dragOrigin.current.cardY + cy - dragOrigin.current.cy)),
      });
    };
    const onEnd = () => { dragging.current = false; };
    document.addEventListener("touchmove",  onMove, { passive: true });
    document.addEventListener("touchend",   onEnd);
    document.addEventListener("mousemove",  onMove);
    document.addEventListener("mouseup",    onEnd);
    return () => {
      document.removeEventListener("touchmove",  onMove);
      document.removeEventListener("touchend",   onEnd);
      document.removeEventListener("mousemove",  onMove);
      document.removeEventListener("mouseup",    onEnd);
    };
  }, []);

  const startDrag = useCallback((clientX: number, clientY: number) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragging.current = true;
    dragOrigin.current = { cx: clientX, cy: clientY, cardX: rect.left, cardY: rect.top };
  }, []);

  if (!recording) return null;

  const displayTime = seekDraft ?? currentTime;
  const pct         = duration > 0 ? Math.min(100, (displayTime / duration) * 100) : 0;
  const isBusy      = loading || seeking;

  const posStyle: React.CSSProperties = pos
    ? { top: pos.y, left: pos.x, bottom: "auto", transform: "none" }
    : { bottom: 20, left: "50%", transform: "translateX(-50%)" };

  return (
    <div
      ref={cardRef}
      style={{
        position:   "fixed",
        ...posStyle,
        zIndex:     9999,
        width:      "min(92vw, 310px)",
        background: "#111",
        borderRadius: 20,
        boxShadow:  "0 10px 40px rgba(0,0,0,.65), 0 0 0 1.5px rgba(201,168,76,.3)",
        fontFamily: "'Cairo', sans-serif",
        overflow:   "hidden",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* ── Progress track — tap anywhere to seek ──────────── */}
      <div
        style={{
          height: 4, background: "rgba(255,255,255,.08)",
          cursor: "pointer", position: "relative",
        }}
        onClick={e => {
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          seek(((e.clientX - rect.left) / rect.width) * (duration || 0));
        }}
      >
        <div style={{
          height: "100%", width: `${pct}%`,
          background: `linear-gradient(90deg, #b8870a, ${GOLD})`,
          borderRadius: 2, transition: seekDraft !== null ? "none" : "width .15s linear",
          position: "relative",
        }}>
          <div style={{ position: "absolute", right: -3, top: "50%", transform: "translateY(-50%)", width: 7, height: 7, borderRadius: "50%", background: GOLD }} />
        </div>
      </div>

      <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>

        {/* ── Drag handle + title + time ──────────────────── */}
        <div
          onMouseDown={e  => startDrag(e.clientX, e.clientY)}
          onTouchStart={e => { e.stopPropagation(); startDrag(e.touches[0].clientX, e.touches[0].clientY); }}
          style={{ display: "flex", alignItems: "center", gap: 7, cursor: "grab", touchAction: "none" }}
        >
          <GripHorizontal size={14} color="#444" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#e0e0e0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {recording.title}
            </div>
            <div style={{ fontSize: 10, display: "flex", gap: 4, marginTop: 1, alignItems: "center" }}>
              <span style={{ color: "#888" }}>{fmt(displayTime)}</span>
              <span style={{ color: "#444" }}>/</span>
              <span style={{ color: "#555" }}>{fmt(duration)}</span>
              <span style={{ color: "#333" }}>•</span>
              <span style={{ color: GOLD, fontWeight: 700 }}>{speed}×</span>
              {isBusy && <span style={{ color: "#f59e0b", fontSize: 9 }}>⏳ buffering</span>}
            </div>
          </div>
        </div>

        {/* ── Transport controls ──────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>

          {/* Skip −10 s */}
          <button
            onClick={() => skip(-10)}
            style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", padding: "3px 5px", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}
          >
            <SkipBack size={19} color="#aaa" />
            <span style={{ fontSize: 8, color: "#666", lineHeight: 1 }}>10s</span>
          </button>

          {/* Play / Pause */}
          <button
            onClick={togglePlay}
            disabled={loading}
            style={{
              width: 44, height: 44, borderRadius: "50%",
              background: GOLD, border: "none", color: G,
              cursor: loading ? "wait" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, boxShadow: "0 2px 14px rgba(201,168,76,.45)",
            }}
          >
            {isBusy
              ? <Loader2 size={20} style={{ animation: "rpc-spin .7s linear infinite" }} />
              : playing
                ? <Pause  size={20} />
                : <Play   size={20} style={{ marginLeft: 2 }} />}
          </button>

          {/* Skip +10 s */}
          <button
            onClick={() => skip(10)}
            style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", padding: "3px 5px", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}
          >
            <SkipForward size={19} color="#aaa" />
            <span style={{ fontSize: 8, color: "#666", lineHeight: 1 }}>10s</span>
          </button>

          <div style={{ flex: 1 }} />

          {/* Speed */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setSS(s => !s)}
              style={{
                padding: "4px 9px", borderRadius: 8,
                background: showSpeeds ? GOLD : "rgba(201,168,76,.15)",
                border: `1.5px solid ${GOLD}`,
                color: showSpeeds ? G : GOLD,
                fontSize: 12, fontWeight: 800, cursor: "pointer",
              }}
            >
              {speed}×
            </button>
            {showSpeeds && (
              <div style={{ position: "absolute", bottom: "calc(100% + 6px)", right: 0, background: "#1e1e1e", border: "1px solid #333", borderRadius: 10, overflow: "hidden", minWidth: 68, zIndex: 1, boxShadow: "0 4px 16px rgba(0,0,0,.5)" }}>
                {SPEEDS.map(s => (
                  <button
                    key={s}
                    onClick={() => { setSpeed(s); setSS(false); }}
                    style={{ display: "block", width: "100%", padding: "9px 0", background: s === speed ? "rgba(201,168,76,.2)" : "none", border: "none", color: s === speed ? GOLD : "#ccc", fontSize: 13, fontWeight: s === speed ? 800 : 500, cursor: "pointer", textAlign: "center" }}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mute toggle */}
          <button
            onClick={toggleMute}
            style={{ background: "none", border: "none", color: muted ? "#f87171" : "#777", cursor: "pointer", padding: "4px 3px" }}
          >
            {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          {/* Close */}
          <button
            onClick={stop}
            style={{ background: "rgba(255,255,255,.08)", border: "none", color: "#999", cursor: "pointer", borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Seek slider (debounced) ──────────────────────── */}
        <div style={{ padding: "0 2px" }}>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={1}
            value={displayTime}
            onChange={e => handleSeekInput(parseFloat(e.target.value))}
            style={{ width: "100%", accentColor: GOLD, height: 3, cursor: "pointer", display: "block" }}
          />
        </div>

        {/* Volume slider */}
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Volume2 size={11} color="#444" />
          <input
            type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
            onChange={e => setVolume(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: GOLD, height: 2, cursor: "pointer" }}
          />
        </div>

        {error && (
          <div style={{ fontSize: 11, color: "#f87171", padding: "4px 8px", borderRadius: 6, background: "rgba(239,68,68,.1)" }}>
            ⚠ {error}
          </div>
        )}
      </div>

      <style>{`@keyframes rpc-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default RecordingPlayerProvider;
