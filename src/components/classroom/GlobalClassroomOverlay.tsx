/*
  GlobalClassroomOverlay.tsx — Tahleem Academy
  ─────────────────────────────────────────────
  The classroom is a position:fixed overlay (z-8000) that sits on top of
  whatever page React Router is currently rendering.

  Key insight: we NEVER navigate() during a class. The page underneath
  the fixed overlay is always whatever route was active — it renders
  normally. We just slide the classroom on/off screen with translateX.

  Minimize / background behaviour (simplified):
    • Minimize button                → translateX(-200%)   + "Return to Class" banner shown
    • Phone home / recents button   → visibilitychange hidden → translateX(-200%)
    • Back button                   → popstate (handled by LiveClassContext) → translateX(-200%)
    • Tapping "Return to Class"     → translateX(0) + banner hidden
    • Returning to tab              → auto-restore (banner never needed)

  NO canvas PiP. NO browser PiP. NO video element hacks.
  Background audio keep-alive (silent AudioContext) + Wake Lock + MediaSession
  are the only background strategies.
*/

import { useLiveClass } from "@/contexts/LiveClassContext";
import ClassroomView from "@/components/classroom/ClassroomView";
import { useEffect, useRef, useCallback, useState } from "react";

/* ─── Silent audio keep-alive ─────────────────────────────────────────── */
function useSilentAudio(active: boolean) {
  const acRef  = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  useEffect(() => {
    if (!active) {
      srcRef.current?.stop(); srcRef.current = null;
      acRef.current?.close(); acRef.current  = null;
      return;
    }
    const start = () => {
      try {
        const AC  = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AC();
        const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        src.connect(ctx.destination); src.start();
        acRef.current = ctx; srcRef.current = src;
      } catch {}
    };
    start();
    const resume = () => {
      if (document.visibilityState !== "visible") return;
      const ctx = acRef.current;
      if (!ctx)                      { start(); return; }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      if (ctx.state === "closed")    start();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      srcRef.current?.stop(); srcRef.current = null;
      acRef.current?.close(); acRef.current  = null;
    };
  }, [active]);
}

/* ─── Wake lock ─────────────────────────────────────────────────────── */
function useWakeLock(active: boolean) {
  const r = useRef<WakeLockSentinel | null>(null);
  const req = useCallback(async () => {
    if (!active || !("wakeLock" in navigator)) return;
    try { r.current = await navigator.wakeLock.request("screen"); } catch {}
  }, [active]);
  useEffect(() => {
    if (!active) { r.current?.release(); r.current = null; return; }
    req();
    const fn = () => { if (document.visibilityState === "visible") req(); };
    document.addEventListener("visibilitychange", fn);
    return () => { document.removeEventListener("visibilitychange", fn); r.current?.release(); };
  }, [active, req]);
}

/* ─── MediaSession ───────────────────────────────────────────────────── */
function useMediaSession(
  active: boolean,
  minimized: boolean,
  title: string,
  onReturn: () => void,
  onLeave: () => void,
) {
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    // Only show the system media bar when minimized
    if (!active || !minimized) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      (["play","pause","stop","previoustrack","nexttrack"] as MediaSessionAction[])
        .forEach(a => { try { navigator.mediaSession.setActionHandler(a, null); } catch {} });
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title, artist: "Tahleem Academy", album: "\u{1F7E2} Live Class",
    });
    navigator.mediaSession.playbackState = "playing";
    const sa = (a: MediaSessionAction, h: () => void) => {
      try { navigator.mediaSession.setActionHandler(a, h); } catch {}
    };
    sa("play", onReturn); sa("pause", onReturn); sa("stop", onLeave);
    sa("previoustrack", onReturn); sa("nexttrack", onReturn);
    return () => {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      (["play","pause","stop","previoustrack","nexttrack"] as MediaSessionAction[])
        .forEach(a => { try { navigator.mediaSession.setActionHandler(a, null); } catch {} });
    };
  }, [active, minimized, title, onReturn, onLeave]);
}

/* ════════════════════════════════════════════════════════════════════ */
export default function GlobalClassroomOverlay() {
  const {
    activeSubject, inCall, minimized, autoJoin,
    leaveClass, setMinimized,
    micEnabled,
    hasConnected,
    toggleMicFnRef,
  } = useLiveClass();

  const title = activeSubject?.title ?? "Live Class";

  const [localMic, setLocalMic] = useState(micEnabled);
  useEffect(() => setLocalMic(micEnabled), [micEnabled]);

  // Track whether the user explicitly minimized (button/back) vs tab-switched
  const userMinimizedRef = useRef(false);

  // handleReturn: slide the classroom back — no navigate() needed.
  const handleReturn = useCallback(() => {
    userMinimizedRef.current = false;
    setMinimized(false);
  }, [setMinimized]);

  const handleLeave = useCallback(() => leaveClass(), [leaveClass]);

  const handleToggleMic = useCallback(() => {
    setLocalMic(v => !v);
    toggleMicFnRef.current?.();
  }, [toggleMicFnRef]);

  useSilentAudio(hasConnected);
  useWakeLock(hasConnected);
  useMediaSession(hasConnected, minimized, title, handleReturn, handleLeave);

  /* ── Minimize button ── */
  const handleMinimize = useCallback(() => {
    userMinimizedRef.current = true;
    setMinimized(true);
  }, [setMinimized]);

  /* ── Phone home/recent button: visibilitychange → hidden → setMinimized.
     When the user returns (visible), auto-restore if they didn't explicitly minimize. */
  useEffect(() => {
    if (!hasConnected) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        setMinimized(true);
      } else if (document.visibilityState === "visible" && !userMinimizedRef.current) {
        setMinimized(false);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [hasConnected, setMinimized]);

  if (!inCall || !activeSubject) return null;

  return (
    <>
      {/* ── Full classroom — always mounted so LiveKit stays alive.
         position:fixed overlays whatever page React Router renders.
         translateX(-200%) moves it off-screen when minimized without
         affecting the route or re-rendering the page below. */}
      <div style={{
        position:      "fixed",
        inset:         0,
        zIndex:        8000,
        display:       "flex",
        flexDirection: "column",
        transform:     minimized ? "translateX(-200%)" : "translateX(0)",
        pointerEvents: minimized ? "none" : "all",
        transition:    minimized ? "none" : "transform .12s ease",
      }}>
        <ClassroomView
          subject={activeSubject}
          onLeave={leaveClass}
          onMinimize={handleMinimize}
          autoJoin={autoJoin}
        />
      </div>

      {/* ── "Return to Class" floating banner — shown when minimized ── */}
      {minimized && (
        <div
          onClick={handleReturn}
          style={{
            position:       "fixed",
            bottom:         "env(safe-area-inset-bottom, 16px)",
            left:           "50%",
            transform:      "translateX(-50%)",
            zIndex:         9000,
            display:        "flex",
            alignItems:     "center",
            gap:            "10px",
            background:     "linear-gradient(135deg, #0c1f12 0%, #14290f 100%)",
            border:         "1.5px solid #c9a84c",
            borderRadius:   "999px",
            padding:        "10px 20px 10px 14px",
            cursor:         "pointer",
            boxShadow:      "0 4px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(201,168,76,0.15)",
            userSelect:     "none",
            WebkitUserSelect: "none",
            whiteSpace:     "nowrap",
          }}
        >
          {/* Pulsing live dot */}
          <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 10, height: 10 }}>
            <span style={{
              position:     "absolute",
              width:        "100%",
              height:       "100%",
              borderRadius: "50%",
              background:   "#ef4444",
              opacity:      0.6,
              animation:    "tahleem-ping 1.4s cubic-bezier(0,0,0.2,1) infinite",
            }} />
            <span style={{
              position:     "relative",
              width:        8,
              height:       8,
              borderRadius: "50%",
              background:   "#ef4444",
              display:      "block",
            }} />
          </span>

          {/* Subject name */}
          <span style={{
            color:      "#f5f0e8",
            fontSize:   "13px",
            fontWeight: 600,
            maxWidth:   "160px",
            overflow:   "hidden",
            textOverflow: "ellipsis",
          }}>
            {title}
          </span>

          {/* Divider */}
          <span style={{ width: 1, height: 14, background: "rgba(201,168,76,0.35)" }} />

          {/* CTA */}
          <span style={{
            color:       "#c9a84c",
            fontSize:    "12px",
            fontWeight:  700,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
          }}>
            Return to Class
          </span>

          {/* Chevron */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      )}

      {/* Keyframe for the pulsing dot */}
      <style>{`
        @keyframes tahleem-ping {
          75%, 100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </>
  );
}
