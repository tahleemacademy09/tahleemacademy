/*
  GlobalClassroomOverlay.tsx — Tahleem Academy
  ─────────────────────────────────────────────
  The classroom is a position:fixed overlay (z-8000) that sits on top of
  whatever page React Router is currently rendering.

  Key insight: we NEVER navigate() during a class. The page underneath
  the fixed overlay is always whatever route was active — it renders
  normally. We just slide the classroom on/off screen with translateX.

  Minimize behaviour:
    • Minimize button                → translateX(-200%) + browser PiP opens
    • Phone home/recents button      → visibilitychange hidden → translateX(-200%)
    • Back button                    → popstate → translateX(-200%)
    • Tapping the PiP window         → exitPictureInPicture + translateX(0)
    • Screen lock                    → canvas PiP keep-alive (re-enters PiP)

  Back-button: LiveClassContext intercepts popstate and sets minimized.
  We do NOT push extra history entries here to avoid double-guard bugs.
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
    // Only show the system media bar when minimized — prevents the
    // "Tap to return" overlay appearing while the classroom is fullscreen.
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

/* ══════════════════════════════════════════════════════════════════════
   CANVAS VIDEO PiP — only used for screen-lock keep-alive
   ══════════════════════════════════════════════════════════════════════ */
const GOLD = "#c9a84c";
const DARK = "#0c1f12";
const W = 320, H = 180;

interface PipHandle {
  video:       HTMLVideoElement;
  setMicMuted: (v: boolean) => void;
  setInitial:  (v: string)  => void;
  pip:         () => Promise<void>;
  stop:        () => void;
}

function buildCanvasPip(
  initialChar: string,
  subjectName: string,
  onTap: () => void,
): PipHandle | null {
  if (!("requestPictureInPicture" in HTMLVideoElement.prototype)) return null;

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;

  let micMuted = true;
  let letter   = initialChar;
  let raf      = 0;

  const drawMic = (mx: number, my: number, r: number) => {
    ctx.fillStyle = micMuted ? "rgba(239,68,68,.95)" : "rgba(34,120,60,.95)";
    ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
    const cs = r * 0.28;
    if (micMuted) {
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(mx, my - cs, cs, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = r * 0.18;
      ctx.beginPath();
      ctx.moveTo(mx - r * 0.52, my + r * 0.48);
      ctx.lineTo(mx + r * 0.52, my - r * 0.48);
      ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(mx, my - cs, cs, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(mx - cs * 1.2, my - cs * 0.3);
      ctx.quadraticCurveTo(mx - cs * 1.2, my + cs * 1.4, mx, my + cs * 1.7);
      ctx.quadraticCurveTo(mx + cs * 1.2, my + cs * 1.4, mx + cs * 1.2, my - cs * 0.3);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx, my + cs * 1.7); ctx.lineTo(mx, my + cs * 2.5); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx - cs * 0.9, my + cs * 2.5);
      ctx.lineTo(mx + cs * 0.9, my + cs * 2.5);
      ctx.stroke();
    }
  };

  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = DARK; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(201,168,76,0.35)"; ctx.fillRect(0, H - 2, W, 2);

    const STRIP = 52;
    ctx.fillStyle = "rgba(255,255,255,0.04)"; ctx.fillRect(0, 0, STRIP, H);
    const p = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() / 700));
    ctx.fillStyle = `rgba(239,68,68,${p})`;
    ctx.beginPath(); ctx.arc(STRIP / 2, H / 2 - 10, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(239,68,68,${p * 0.4})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(STRIP / 2, H / 2 - 10, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "bold 10px system-ui,sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("LIVE", STRIP / 2, H / 2 + 8);
    ctx.fillStyle = "rgba(201,168,76,0.2)"; ctx.fillRect(STRIP, 20, 1, H - 40);

    const avX = STRIP + 52, avY = H / 2, avR = 36;
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = DARK;
    ctx.font = `bold ${avR * 0.75}px system-ui,-apple-system,sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(letter.toUpperCase().slice(0, 1), avX, avY);

    const nameX = avX + avR + 12;
    const nameW = W - nameX - 52;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "600 13px system-ui,-apple-system,sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    let name = subjectName;
    while (name.length > 1 && ctx.measureText(name).width > nameW) name = name.slice(0, -1);
    if (name !== subjectName) name = name.trimEnd() + "…";
    ctx.fillText(name, nameX, H / 2 - 8);
    ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "10px system-ui,sans-serif";
    ctx.fillText("Tap to return", nameX, H / 2 + 12);

    drawMic(W - 30, H / 2, 20);
    raf = requestAnimationFrame(draw);
  };

  draw();

  const vid = document.createElement("video");
  vid.srcObject = cv.captureStream(12);
  vid.muted = true; vid.playsInline = true;
  // BUG FIX: do NOT set autopictureinpicture — that attribute tells the browser
  // to auto-enter PiP whenever the tab loses focus (every app switch), which is
  // the "overlay that is not the browser pip" students were seeing uninvited.
  // Canvas PiP is only triggered explicitly on screen-lock via the visibility handler.
  vid.style.cssText = [
    "position:fixed", "top:-9999px", "left:-9999px",
    "width:1px", "height:1px",
    "pointer-events:none", "opacity:.01", "z-index:-999",
  ].join(";") + ";";
  document.body.appendChild(vid);
  vid.addEventListener("leavepictureinpicture", onTap);

  const keepPlaying = () => { if (document.body.contains(vid)) vid.play().catch(() => {}); };
  vid.addEventListener("pause", keepPlaying);
  vid.addEventListener("ended", keepPlaying);
  keepPlaying();

  const ensurePlaying = async () => {
    if (vid.paused || vid.readyState < 2) {
      try { await vid.play(); } catch {}
      await new Promise(r => setTimeout(r, 80));
    }
  };

  const pip = async () => {
    if (document.pictureInPictureElement === vid) return;
    await ensurePlaying();
    try { await vid.requestPictureInPicture(); } catch {}
  };

  const stop = () => {
    cancelAnimationFrame(raf);
    vid.removeEventListener("pause", keepPlaying);
    vid.removeEventListener("ended", keepPlaying);
    (vid.srcObject as MediaStream | null)?.getTracks().forEach(t => t.stop());
    if (document.pictureInPictureElement === vid) document.exitPictureInPicture().catch(() => {});
    vid.remove();
  };

  return {
    video:       vid,
    setMicMuted: v => { micMuted = v; },
    setInitial:  v => { letter   = v; },
    pip,
    stop,
  };
}

/* ════════════════════════════════════════════════════════════════════ */
export default function GlobalClassroomOverlay() {
  const {
    activeSubject, inCall, minimized, autoJoin,
    leaveClass, setMinimized,
    micEnabled, camEnabled,
    hasConnected,
    toggleMicFnRef,
  } = useLiveClass();

  const title   = activeSubject?.title ?? "Live Class";
  const initial = (activeSubject?.title ?? "L").charAt(0).toUpperCase();

  const [localMic, setLocalMic] = useState(micEnabled);
  useEffect(() => setLocalMic(micEnabled), [micEnabled]);

  // Track whether the user explicitly minimized vs tab-switched — used by visibilitychange handler
  const userMinimizedRef = useRef(false);

  // handleReturn: just slide the classroom back in — no navigate() needed.
  // The page underneath is exactly the same route that was showing before
  // the classroom appeared (position:fixed overlay doesn't change the route).
  const handleReturn = useCallback(() => {
    userMinimizedRef.current = false; // user chose to return — clear the flag
    setMinimized(false);
  }, [setMinimized]);
  const handleLeave  = useCallback(() => leaveClass(), [leaveClass]);
  const handleToggleMic = useCallback(() => {
    setLocalMic(v => !v);
    toggleMicFnRef.current?.();
  }, [toggleMicFnRef]);

  useSilentAudio(hasConnected);
  useWakeLock(hasConnected);
  useMediaSession(hasConnected, minimized, title, handleReturn, handleLeave);

  const pipHandle       = useRef<PipHandle | null>(null);
  const handleReturnRef = useRef(handleReturn);
  handleReturnRef.current = handleReturn;

  /* ── Build canvas PiP once connected ── */
  useEffect(() => {
    if (!hasConnected) { pipHandle.current?.stop(); pipHandle.current = null; return; }
    const h = buildCanvasPip(initial, title, () => handleReturnRef.current());
    if (h) { h.video.play().catch(() => {}); pipHandle.current = h; }
    return () => { pipHandle.current?.stop(); pipHandle.current = null; };
  }, [hasConnected, initial, title]);

  /* ── Sync mic state into canvas ── */
  useEffect(() => { pipHandle.current?.setMicMuted(!localMic); }, [localMic]);

  /* ── Minimize button ── */
  const handleMinimize = useCallback(async () => {
    // User explicitly minimized — set flag so visibility restore doesn't auto-return
    userMinimizedRef.current = true;
    setMinimized(true);

    // Always open browser PiP when minimized — this is the ONLY UI shown.
    // Prefer a live camera stream (if cam is on), otherwise fall back to the canvas overlay.
    if (document.pictureInPictureElement) return; // already in PiP
    const h = pipHandle.current;
    const vids = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
    const liveCam = vids.find(v => v.readyState >= 2 && v.videoWidth > 0 && (!h || v !== h.video));
    if (liveCam) {
      try { await liveCam.requestPictureInPicture(); return; } catch {}
    }
    // Canvas PiP fallback — works even when camera is off (audio-only class)
    if (h) { try { await h.pip(); } catch {} }
  }, [setMinimized, camEnabled]);

  /* ── Back button: LiveClassContext already sets minimized=true via popstate.
     Nothing extra needed here — the floating bar appears automatically.
     BUG FIX: the old code was calling pip() here, which showed the canvas PiP
     window every time the student pressed Back. That was the second source of
     the unwanted overlay. Canvas PiP is screen-lock only (handled below).   ── */
  const pipHandleRef = useRef(pipHandle);
  pipHandleRef.current = pipHandle;

  /* ── Phone home/recent button: visibilitychange → hidden → setMinimized.
     When the user returns (visible), auto-restore the classroom so there is no
     persistent floating bar requiring an extra tap. The floating bar is only for
     users who deliberately minimized (via the minimize button or back button).   ── */
  useEffect(() => {
    if (!hasConnected) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        setMinimized(true);
      } else if (document.visibilityState === "visible" && !userMinimizedRef.current) {
        // Auto-restore: user switched back to the browser tab — bring classroom back
        setMinimized(false);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [hasConnected, setMinimized]);

  /* ── Screen off (lock button) → canvas PiP keep-alive ── */
  useEffect(() => {
    if (!hasConnected) return;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const tryPip = async (attempt = 0) => {
      if (document.visibilityState !== "hidden") return;
      if (document.pictureInPictureElement) return;
      const h = pipHandle.current;
      if (!h) return;
      try { await h.pip(); } catch {
        if (attempt < 3) retryTimer = setTimeout(() => tryPip(attempt + 1), 300 * (attempt + 1));
      }
    };

    const onHide = () => {
      if (document.visibilityState !== "hidden" || document.pictureInPictureElement) return;
      retryTimer = setTimeout(() => tryPip(0), 150);
    };

    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [hasConnected]);

  /* ── Return from minimized → exit PiP ── */
  useEffect(() => {
    if (!minimized && document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
  }, [minimized]);

  if (!inCall || !activeSubject) return null;

  return (
    <>
      {/* ── Full classroom — always mounted so LiveKit stays alive.
         position:fixed means it overlays whatever page React Router renders.
         translateX(-200%) moves it fully off-screen when minimized without
         affecting the route or causing any re-renders of the page below.   */}
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

      {/* Floating bar removed — browser PiP is the only minimized UI */}
    </>
  );
}
