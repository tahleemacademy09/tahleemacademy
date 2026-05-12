/*
  GlobalClassroomOverlay.tsx — Tahleem Academy v9
  ─────────────────────────────────────────────────
  - Green bottom pill removed
  - Black canvas PiP card (with initial + LIVE) restored
  - Clicking the PiP card returns directly to live class
  - Screen-off: looping BufferSource keeps WebRTC alive
  - visibilitychange does NOT force minimized state
*/

import { useLiveClass } from "@/contexts/LiveClassContext";
import ClassroomView     from "@/components/classroom/ClassroomView";
import { useEffect, useRef, useCallback, useState } from "react";

/* ─── Silent audio keep-alive ─────────────────────────────────────────
   Looping silent BufferSource — harder for Android/iOS to GC than an
   oscillator. Keeps the WebRTC audio pipeline alive on screen-off.    */
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

/* ─── Wake lock — re-acquired after screen unlock ─── */
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

/* ─── MediaSession — lock screen / notification shade controls ─── */
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

/* ─── Canvas PiP card ─────────────────────────────────────────────────
   Black rounded card with initial letter + pulsing LIVE dot + mic badge.
   Auto-enters PiP when tab hides. Tapping it returns to the live class. */
const GOLD = "#c9a84c";
const DARK = "#0c1f12";
const W = 160, H = 160;

interface PipHandle {
  video:       HTMLVideoElement;
  setMicMuted: (v: boolean) => void;
  pip:         () => Promise<void>;
  stop:        () => void;
}

function buildCanvasPip(initial: string, onTap: () => void): PipHandle | null {
  if (!("requestPictureInPicture" in HTMLVideoElement.prototype)) return null;

  const cv  = document.createElement("canvas");
  cv.width  = W; cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;

  let micMuted = true;
  let raf = 0;

  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    // Black rounded card
    ctx.fillStyle = "#0c1f12"; rr(0, 0, W, H, 28); ctx.fill();
    ctx.strokeStyle = "rgba(201,168,76,0.65)"; ctx.lineWidth = 2;
    rr(1, 1, W - 2, H - 2, 27); ctx.stroke();

    // Avatar circle
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(W / 2, 62, 42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = DARK;
    ctx.font = "bold 32px system-ui,-apple-system,sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(initial.toUpperCase().slice(0, 2), W / 2, 62);

    // Pulsing LIVE dot
    const p = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() / 700));
    ctx.fillStyle = `rgba(239,68,68,${p})`;
    ctx.beginPath(); ctx.arc(W / 2 - 16, 118, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(239,68,68,${Math.min(p + 0.2, 1)})`;
    ctx.font = "bold 9px system-ui,sans-serif"; ctx.textBaseline = "middle";
    ctx.fillText("LIVE", W / 2 + 4, 118);

    // Mic badge
    const bx = W / 2 + 28, by = 92;
    ctx.fillStyle = micMuted ? "rgba(239,68,68,.95)" : "rgba(34,120,60,.95)";
    ctx.beginPath(); ctx.arc(bx, by, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(bx, by, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.fillStyle = "#fff";
    if (micMuted) {
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.arc(bx, by - 2, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(bx - 6, by + 5); ctx.lineTo(bx + 6, by - 5);
      ctx.lineWidth = 2.2; ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(bx, by - 2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bx - 3.5, by - 1);
      ctx.quadraticCurveTo(bx - 3.5, by + 3, bx, by + 4);
      ctx.quadraticCurveTo(bx + 3.5, by + 3, bx + 3.5, by - 1);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx, by + 4); ctx.lineTo(bx, by + 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - 2.5, by + 7); ctx.lineTo(bx + 2.5, by + 7); ctx.stroke();
    }
    raf = requestAnimationFrame(draw);
  };

  draw();

  const vid = document.createElement("video");
  vid.srcObject = cv.captureStream(10);
  vid.muted = true; vid.playsInline = true;
  (vid as any).autopictureinpicture = true;
  vid.setAttribute("autopictureinpicture", "");
  vid.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;pointer-events:none;opacity:0.01;z-index:-999;";
  document.body.appendChild(vid);

  // Tapping the PiP card calls onTap → returns to live class
  vid.addEventListener("leavepictureinpicture", onTap);

  const pip = async () => {
    if (document.pictureInPictureElement === vid) return;
    try { await vid.requestPictureInPicture(); } catch {}
  };

  const stop = () => {
    cancelAnimationFrame(raf);
    (vid.srcObject as MediaStream | null)?.getTracks().forEach(t => t.stop());
    if (document.pictureInPictureElement === vid) document.exitPictureInPicture().catch(() => {});
    vid.remove();
  };

  return { video: vid, setMicMuted: (v) => { micMuted = v; }, pip, stop };
}

/* ════════════════════════════════════════════════════════════ */
export default function GlobalClassroomOverlay() {
  const {
    activeSubject, inCall, minimized, autoJoin,
    leaveClass, setMinimized,
    micEnabled, camEnabled,
    toggleMicFnRef,
  } = useLiveClass();

  const title   = activeSubject?.title ?? "Live Class";
  const initial = (activeSubject?.title ?? "L").charAt(0).toUpperCase();

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

  /* ── Canvas PiP — built when call starts ── */
  const pipHandle    = useRef<PipHandle | null>(null);
  const handleReturnRef = useRef(handleReturn);
  handleReturnRef.current = handleReturn;

  useEffect(() => {
    if (!inCall) { pipHandle.current?.stop(); pipHandle.current = null; return; }
    const h = buildCanvasPip(initial, () => handleReturnRef.current());
    if (h) {
      h.video.play().catch(() => {});
      pipHandle.current = h;
    }
    return () => { pipHandle.current?.stop(); pipHandle.current = null; };
  }, [inCall, initial]);

  useEffect(() => { pipHandle.current?.setMicMuted(!localMic); }, [localMic]);

  /* ── Minimize: show PiP card, hide class overlay ── */
  const handleMinimize = useCallback(async () => {
    setMinimized(true);
    const h = pipHandle.current;
    if (!h) return;
    if (document.pictureInPictureElement) return;
    // Camera on → use real video element if available
    if (camEnabled) {
      const vids = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
      const live = vids.find(v => v.readyState >= 2 && v.videoWidth > 0 && v !== h.video);
      if (live) { try { await live.requestPictureInPicture(); return; } catch {} }
    }
    // Camera off → black canvas card
    h.pip().catch(() => {});
  }, [setMinimized, camEnabled]);

  /* ── Back button (popstate) → minimize + PiP ── */
  const handleMinimizeRef = useRef(handleMinimize);
  handleMinimizeRef.current = handleMinimize;
  useEffect(() => {
    if (!inCall) return;
    const onPop = () => setTimeout(() => handleMinimizeRef.current(), 50);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [inCall]);

  /* ── Screen off / tab hidden → PiP (trusted event) ── */
  useEffect(() => {
    if (!inCall) return;
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      if (document.pictureInPictureElement) return;
      pipHandle.current?.pip().catch(() => {});
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [inCall]);

  /* ── Exit PiP when returning to full class ── */
  useEffect(() => {
    if (!minimized && document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
  }, [minimized]);

  if (!inCall || !activeSubject) return null;

  return (
    <div style={{
      position:      "fixed", inset: 0, zIndex: 8000,
      display:       "flex", flexDirection: "column",
      visibility:    minimized ? "hidden" : "visible",
      pointerEvents: minimized ? "none"   : "all",
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
