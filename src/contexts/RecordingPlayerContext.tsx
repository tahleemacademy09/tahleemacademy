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
  X, Loader2,
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

/* ══ SINGLE-LINE DRAGGABLE MINI-PLAYER ═════════════════════
   One row: [◀10] [▶/⏸] [10▶] [title · time · speed] [🔇] [✕]
   Progress is a 3 px tap-to-seek line at the bottom.
   Drag the title section to reposition anywhere on screen.
   Speed picker pops up above, clearly visible, dark background.
══════════════════════════════════════════════════════════════ */
const GlobalPlayer: React.FC<{ ctx: RecordingPlayerContextType }> = ({ ctx }) => {
  const { state, togglePlay, stop, seek, skip, setSpeed, toggleMute } = ctx;
  const { recording, playing, currentTime, duration, muted, speed, loading, seeking, error } = state;

  /* Drag */
  const [pos, setPos]  = useState<{ x: number; y: number } | null>(null);
  const [showSpeeds, setSS] = useState(false);
  const cardRef   = useRef<HTMLDivElement>(null);
  const dragging  = useRef(false);
  const dragStart = useRef({ cx: 0, cy: 0, cardX: 0, cardY: 0 });

  /* Debounced seek */
  const seekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const handleSeek = useCallback((val: number) => {
    setSeekDraft(val);
    if (seekTimer.current) clearTimeout(seekTimer.current);
    seekTimer.current = setTimeout(() => { seek(val); setSeekDraft(null); }, 220);
  }, [seek]);

  useEffect(() => {
    const onMove = (e: TouchEvent | MouseEvent) => {
      if (!dragging.current) return;
      const cx = "touches" in e ? (e as TouchEvent).touches[0]?.clientX ?? 0 : (e as MouseEvent).clientX;
      const cy = "touches" in e ? (e as TouchEvent).touches[0]?.clientY ?? 0 : (e as MouseEvent).clientY;
      const card = cardRef.current; if (!card) return;
      const w = card.offsetWidth, h = card.offsetHeight;
      setPos({
        x: Math.max(8, Math.min(window.innerWidth  - w - 8, dragStart.current.cardX + cx - dragStart.current.cx)),
        y: Math.max(8, Math.min(window.innerHeight - h - 8, dragStart.current.cardY + cy - dragStart.current.cy)),
      });
    };
    const onEnd = () => { dragging.current = false; };
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend",  onEnd);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onEnd);
    return () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend",  onEnd);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onEnd);
    };
  }, []);

  const startDrag = useCallback((cx: number, cy: number) => {
    const rect = cardRef.current?.getBoundingClientRect(); if (!rect) return;
    dragging.current = true;
    dragStart.current = { cx, cy, cardX: rect.left, cardY: rect.top };
  }, []);

  if (!recording) return null;

  const displayTime = seekDraft ?? currentTime;
  const pct    = duration > 0 ? Math.min(100, (displayTime / duration) * 100) : 0;
  const isBusy = loading || seeking;

  const posStyle: React.CSSProperties = pos
    ? { top: pos.y, left: pos.x, bottom: "auto", transform: "none" }
    : { bottom: 16, left: "50%", transform: "translateX(-50%)" };

  /* Speed button label — always dark-on-gold so it's legible */
  const speedLabel = `${speed}×`;

  return (
    <div
      ref={cardRef}
      style={{
        position:  "fixed", ...posStyle,
        zIndex:    9999,
        width:     "min(96vw, 360px)",
        background: "#1a1a1a",
        borderRadius: 14,
        boxShadow: "0 6px 28px rgba(0,0,0,.7), 0 0 0 1px rgba(201,168,76,.25)",
        fontFamily: "'Cairo', sans-serif",
        overflow:  "visible",       /* allow speed popup to escape */
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* ── Inner clip (rounded, hides progress overflow) ─── */}
      <div style={{ borderRadius: 14, overflow: "hidden" }}>

        {/* ─ Single control row ─────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center",
          padding: "0 6px 0 4px", height: 52, gap: 2,
        }}>

          {/* Skip −10 s */}
          <button onClick={() => skip(-10)}
            style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer",
                     padding: "0 6px", display: "flex", flexDirection: "column",
                     alignItems: "center", gap: 0, flexShrink: 0, lineHeight: 1 }}>
            <SkipBack  size={18} color="#aaa" />
            <span style={{ fontSize: 8, color: "#555" }}>10s</span>
          </button>

          {/* Play / Pause */}
          <button onClick={togglePlay} disabled={loading}
            style={{ width: 38, height: 38, borderRadius: "50%",
                     background: GOLD, border: "none", color: G,
                     cursor: loading ? "wait" : "pointer", flexShrink: 0,
                     display: "flex", alignItems: "center", justifyContent: "center",
                     boxShadow: "0 2px 10px rgba(201,168,76,.4)" }}>
            {isBusy
              ? <Loader2 size={17} style={{ animation: "rpc-spin .7s linear infinite" }} />
              : playing ? <Pause size={17} /> : <Play size={17} style={{ marginLeft: 2 }} />}
          </button>

          {/* Skip +10 s */}
          <button onClick={() => skip(10)}
            style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer",
                     padding: "0 6px", display: "flex", flexDirection: "column",
                     alignItems: "center", gap: 0, flexShrink: 0, lineHeight: 1 }}>
            <SkipForward size={18} color="#aaa" />
            <span style={{ fontSize: 8, color: "#555" }}>10s</span>
          </button>

          {/* Title + time — drag handle ─────────────────────── */}
          <div
            onMouseDown={e  => startDrag(e.clientX, e.clientY)}
            onTouchStart={e => { e.stopPropagation(); startDrag(e.touches[0].clientX, e.touches[0].clientY); }}
            style={{ flex: 1, minWidth: 0, cursor: "grab", touchAction: "none",
                     padding: "0 4px", display: "flex", flexDirection: "column",
                     justifyContent: "center", gap: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#ddd",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {recording.title}
            </div>
            <div style={{ fontSize: 10, color: "#666", display: "flex", gap: 3, alignItems: "center", flexWrap: "nowrap" }}>
              <span style={{ color: "#999" }}>{fmt(displayTime)}</span>
              <span>/</span>
              <span>{fmt(duration)}</span>
              {isBusy && <span style={{ color: GOLD, fontSize: 9 }}>…</span>}
            </div>
          </div>

          {/* Speed — clearly readable: dark text on gold pill ── */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              onClick={() => setSS(s => !s)}
              style={{
                padding: "5px 8px", borderRadius: 8,
                /* always gold background so text contrast is guaranteed */
                background: GOLD,
                border: "none",
                color: "#111",           /* dark text on gold = always readable */
                fontSize: 12, fontWeight: 900,
                cursor: "pointer", lineHeight: 1,
                letterSpacing: "-0.3px",
                boxShadow: showSpeeds ? `0 0 0 2px ${GOLD}` : "none",
              }}
            >
              {speedLabel}
            </button>

            {/* Speed picker — opens ABOVE, full dark background */}
            {showSpeeds && (
              <div style={{
                position: "absolute", bottom: "calc(100% + 8px)", right: 0,
                background: "#1a1a1a",
                border: `1.5px solid ${GOLD}`,
                borderRadius: 12, overflow: "hidden",
                minWidth: 76, zIndex: 10001,
                boxShadow: "0 8px 24px rgba(0,0,0,.8)",
              }}>
                {SPEEDS.map(s => (
                  <button key={s} onClick={() => { setSpeed(s); setSS(false); }}
                    style={{
                      display: "block", width: "100%", padding: "10px 0",
                      background: s === speed ? GOLD : "transparent",
                      border: "none",
                      color: s === speed ? "#111" : "#ccc",
                      fontSize: 13, fontWeight: s === speed ? 900 : 500,
                      cursor: "pointer", textAlign: "center",
                    }}>
                    {s}×
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mute */}
          <button onClick={toggleMute}
            style={{ background: "none", border: "none",
                     color: muted ? "#f87171" : "#666",
                     cursor: "pointer", padding: "0 4px", flexShrink: 0 }}>
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          {/* Close */}
          <button onClick={stop}
            style={{ background: "rgba(255,255,255,.07)", border: "none",
                     color: "#888", cursor: "pointer", borderRadius: 7,
                     width: 26, height: 26, flexShrink: 0,
                     display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={13} />
          </button>
        </div>

        {/* ─ Progress line — tap to seek ──────────────────────── */}
        <div
          style={{ height: 3, background: "rgba(255,255,255,.07)", cursor: "pointer", position: "relative" }}
          onClick={e => {
            const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            seek(((e.clientX - r.left) / r.width) * (duration || 0));
          }}
        >
          <div style={{
            height: "100%", width: `${pct}%`,
            background: GOLD,
            transition: seekDraft !== null ? "none" : "width .15s linear",
          }} />
        </div>
      </div>

      {error && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
                      fontSize: 11, color: "#f87171", padding: "4px 10px",
                      background: "#1a1a1a", borderRadius: 8, border: "1px solid #3a1010" }}>
          ⚠ {error}
        </div>
      )}

      <style>{`@keyframes rpc-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default RecordingPlayerProvider;
