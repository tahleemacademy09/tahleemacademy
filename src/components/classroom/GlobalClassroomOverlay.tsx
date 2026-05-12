/*
  GlobalClassroomOverlay.tsx — Tahleem Academy v8
  ─────────────────────────────────────────────────
  - Canvas PiP removed entirely (was causing nav issues)
  - Floating pill (black bar) is the only minimized UI
  - Screen-off keep-alive uses a looping BufferSource node
    (more reliable than oscillator which can be GC'd by iOS/Android)
  - visibilitychange no longer forces minimized state — class
    stays live when screen turns off
*/

import { useLiveClass } from "@/contexts/LiveClassContext";
import ClassroomView     from "@/components/classroom/ClassroomView";
import { useEffect, useRef, useCallback, useState } from "react";

/* ─── Silent audio keep-alive ─────────────────────────────────────────
   Uses a looping 1-second silent BufferSource — more reliable than an
   oscillator on Android/iOS which the OS can suspend or GC.
   Resumes automatically on screen unlock / tab focus.                 */
function useSilentAudio(active: boolean) {
  const acRef  = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    if (!active) {
      srcRef.current?.stop();
      srcRef.current = null;
      acRef.current?.close();
      acRef.current = null;
      return;
    }

    const start = () => {
      try {
        const AC  = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AC();
        // 1-second silent buffer, looping — keeps the audio graph alive
        const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop   = true;
        src.connect(ctx.destination);
        src.start();
        acRef.current  = ctx;
        srcRef.current = src;
      } catch {}
    };

    start();

    const resume = () => {
      if (document.visibilityState !== "visible") return;
      const ctx = acRef.current;
      if (!ctx) { start(); return; }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      if (ctx.state === "closed")    start();
    };

    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);

    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      srcRef.current?.stop();
      srcRef.current = null;
      acRef.current?.close();
      acRef.current = null;
    };
  }, [active]);
}

/* ─── Wake lock ────────────────────────────────────────────────────────
   Requests screen wake lock to prevent screen-off during class.
   Re-acquired after screen unlock (OS releases it on lock).           */
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

/* ─── MediaSession ─────────────────────────────────────────────────────
   Shows class info in the lock screen / notification shade controls.  */
function useMediaSession(
  active: boolean, title: string,
  onReturn: () => void, onLeave: () => void,
) {
  useEffect(() => {
    if (!active || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title, artist: "Tahleem Academy", album: "🟢 Live Class",
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
  }, [active, title, onReturn, onLeave]);
}

/* ════════════════════════════════════════════════════════════ */
export default function GlobalClassroomOverlay() {
  const {
    activeSubject, inCall, minimized, autoJoin,
    leaveClass, setMinimized,
    micEnabled,
    toggleMicFnRef,
  } = useLiveClass();

  const title = activeSubject?.title ?? "Live Class";

  const [localMic, setLocalMic] = useState(micEnabled);
  useEffect(() => setLocalMic(micEnabled), [micEnabled]);

  const handleReturn = useCallback(() => setMinimized(false), [setMinimized]);
  const handleLeave  = useCallback(() => leaveClass(),         [leaveClass]);
  const handleToggleMic = useCallback(() => {
    setLocalMic(v => !v);
    toggleMicFnRef.current?.();
  }, [toggleMicFnRef]);

  useSilentAudio(inCall);
  useWakeLock(inCall);
  useMediaSession(inCall, title, handleReturn, handleLeave);

  /* ── Minimize button — just shows the pill, no PiP ── */
  const handleMinimize = useCallback(() => {
    setMinimized(true);
  }, [setMinimized]);

  if (!inCall || !activeSubject) return null;

  /* ── Minimized floating pill ───────────────────────────────────────── */
  if (minimized) {
    return (
      <div
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
          display: "flex", alignItems: "center",
          background: "linear-gradient(135deg, #064E3B 0%, #0f2d1f 100%)",
          borderTop: "1.5px solid rgba(201,168,76,.35)",
          padding: "10px 16px", gap: 12,
          boxShadow: "0 -4px 24px rgba(0,0,0,.55)",
          animation: "fade-in .2s ease",
        }}
      >
        {/* Pulsing live dot */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%", background: "#ef4444",
            boxShadow: "0 0 0 0 rgba(239,68,68,.6)",
            animation: "lc-pulse 1.4s ease-in-out infinite",
          }}/>
          <style>{`
            @keyframes lc-pulse {
              0%   { box-shadow: 0 0 0 0 rgba(239,68,68,.6); }
              70%  { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
              100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
            }
          `}</style>
        </div>

        {/* Class info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </p>
          <p style={{ margin: 0, fontSize: 10, color: "rgba(201,168,76,.9)", fontWeight: 600 }}>
            🟢 Live · Tap to return
          </p>
        </div>

        {/* Mic toggle */}
        <button
          onClick={handleToggleMic}
          title={localMic ? "Mute mic" : "Unmute mic"}
          style={{
            width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
            background: localMic ? "rgba(201,168,76,.18)" : "rgba(239,68,68,.25)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 18 }}>{localMic ? "🎤" : "🔇"}</span>
        </button>

        {/* Return to live class */}
        <button
          onClick={handleReturn}
          title="Return to class"
          style={{
            height: 40, borderRadius: 20, border: "none", cursor: "pointer",
            background: "rgba(201,168,76,.18)", color: "#c9a84c",
            padding: "0 16px", fontWeight: 800, fontSize: 13, flexShrink: 0,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <span style={{ fontSize: 15 }}>📹</span> Open
        </button>

        {/* Leave call */}
        <button
          onClick={handleLeave}
          title="Leave class"
          style={{
            width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
            background: "rgba(239,68,68,.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 18 }}>📵</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{
      position:      "fixed", inset: 0, zIndex: 8000,
      display:       "flex", flexDirection: "column",
    }}>
      <ClassroomView
        subject={activeSubject}
        onLeave={leaveClass}
        onMinimize={handleMinimize}
        autoJoin={autoJoin}
      />
    </div>
  );
}
