/*
  GlobalClassroomOverlay.tsx — Tahleem Academy v6
  ─────────────────────────────────────────────────
  - NO in-browser green bubble at all.
  - Only the OS-level PiP window (the small black card) shows.
  - PiP triggers on: down-arrow minimize button, back button (popstate),
    phone home/minimize key (autopictureinpicture + visibilitychange).
  - Canvas is 160×160 — tiny, rounded, shows initial + mic badge.
*/

import { useLiveClass } from "@/contexts/LiveClassContext";
import ClassroomView     from "@/components/classroom/ClassroomView";
import { useEffect, useRef, useCallback, useState } from "react";

/* ─── Silent audio keep-alive ─── */
function useSilentAudio(active: boolean) {
  const r = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!active) { r.current?.close(); r.current = null; return; }
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const c = new AC(), o = c.createOscillator(), g = c.createGain();
      g.gain.value = 0; o.connect(g); g.connect(c.destination); o.start();
      r.current = c;
    } catch {}
    return () => { r.current?.close(); r.current = null; };
  }, [active]);
}

/* ─── Wake lock ─── */
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

/* ─── MediaSession ─── */
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

/* ─── Canvas PiP ──────────────────────────────────────────────────────
   160×160 tiny canvas. Rounded corners. Shows gold avatar + mic badge.
   Uses autopictureinpicture so Chrome auto-enters PiP on tab hide.
*/
const GOLD = "#c9a84c";
const DARK = "#0c1f12";
const RED  = "#ef4444";
const W = 160, H = 160;

interface PipHandle {
  video:       HTMLVideoElement;
  setMicMuted: (v: boolean) => void;
  pip:         () => Promise<void>;
  stop:        () => void;
}

function buildCanvasPip(title: string, initial: string): PipHandle | null {
  if (!("requestPictureInPicture" in HTMLVideoElement.prototype)) return null;

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;

  let micMuted = true;
  let raf = 0;

  const drawRoundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  const draw = () => {
    ctx.clearRect(0, 0, W, H);

    // Rounded dark background
    ctx.fillStyle = "#0c1f12";
    drawRoundRect(0, 0, W, H, 28);
    ctx.fill();

    // Gold border
    ctx.strokeStyle = "rgba(201,168,76,0.65)";
    ctx.lineWidth = 2;
    drawRoundRect(1, 1, W - 2, H - 2, 27);
    ctx.stroke();

    // Avatar circle
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(W / 2, 62, 42, 0, Math.PI * 2); ctx.fill();

    // Initial letter
    ctx.fillStyle = DARK;
    ctx.font = "bold 32px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(initial.toUpperCase().slice(0, 2), W / 2, 62);

    // Pulsing LIVE dot
    const pulse = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() / 700));
    ctx.fillStyle = `rgba(239,68,68,${pulse})`;
    ctx.beginPath(); ctx.arc(W / 2 - 16, 118, 4, 0, Math.PI * 2); ctx.fill();

    // LIVE text
    ctx.fillStyle = `rgba(239,68,68,${Math.min(pulse + 0.2, 1)})`;
    ctx.font = "bold 9px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("LIVE", W / 2 + 4, 118);

    // Mic badge (bottom-right of avatar)
    const bx = W / 2 + 28, by = 92;
    ctx.fillStyle = micMuted ? "rgba(239,68,68,.95)" : "rgba(34,120,60,.95)";
    ctx.beginPath(); ctx.arc(bx, by, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(bx, by, 11, 0, Math.PI * 2); ctx.stroke();

    // Mic icon in badge
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.fillStyle = "#fff";
    if (micMuted) {
      // Mic outline (faded)
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.arc(bx, by - 2, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // Slash
      ctx.beginPath(); ctx.moveTo(bx - 6, by + 5); ctx.lineTo(bx + 6, by - 5);
      ctx.lineWidth = 2; ctx.stroke();
    } else {
      // Mic body
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
  vid.muted = true;
  vid.playsInline = true;

  // Critical: tells Chrome to auto-enter PiP when tab goes background
  (vid as any).autopictureinpicture = true;
  vid.setAttribute("autopictureinpicture", "");

  // Off-screen — CANNOT use display:none (breaks PiP)
  vid.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;pointer-events:none;opacity:0.01;z-index:-999;";
  document.body.appendChild(vid);

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

  return {
    video: vid,
    setMicMuted: (v: boolean) => { micMuted = v; },
    pip,
    stop,
  };
}

/* ════════════════════════════════════════════════════════════ */
export default function GlobalClassroomOverlay() {
  const {
    activeSubject, inCall, minimized, autoJoin,
    leaveClass, setMinimized,
    micEnabled,
    toggleMicFnRef, toggleCamFnRef,
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

  // Keep-alive
  useSilentAudio(inCall);
  useWakeLock(inCall);
  useMediaSession(inCall, title, handleReturn, handleLeave);

  // Canvas PiP handle — built once when call starts
  const pipHandle = useRef<PipHandle | null>(null);

  useEffect(() => {
    if (!inCall) { pipHandle.current?.stop(); pipHandle.current = null; return; }
    const h = buildCanvasPip(title, initial);
    if (h) { h.video.play().catch(() => {}); pipHandle.current = h; }
    return () => { pipHandle.current?.stop(); pipHandle.current = null; };
  }, [inCall, title, initial]);

  // Sync mic badge in canvas
  useEffect(() => { pipHandle.current?.setMicMuted(!localMic); }, [localMic]);

  // ── PiP trigger function ──────────────────────────────────────────────
  // Tries: 1) remote video PiP (non-inverted)  2) canvas PiP
  const triggerPiP = useCallback(async () => {
    if (!pipHandle.current) return;
    // Prefer a real remote video so user sees the teacher
    const vids = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
    const remote = vids.find(v =>
      !v.muted && v.readyState >= 2 && v.videoWidth > 0 &&
      v !== pipHandle.current?.video,
    );
    if (remote && !document.pictureInPictureElement) {
      try { await remote.requestPictureInPicture(); return; } catch {}
    }
    // Fall back to canvas PiP
    await pipHandle.current.pip();
  }, []);

  // ── Minimize button (down arrow) — direct user gesture ───────────────
  const handleMinimize = useCallback(() => {
    setMinimized(true);
    triggerPiP();          // called within gesture window — always works
  }, [setMinimized, triggerPiP]);

  // ── Back button (popstate) — also a user gesture on Android ──────────
  useEffect(() => {
    if (!inCall) return;
    const onPop = () => {
      // Re-push guard state (LiveClassContext already sets minimized)
      history.pushState({ tahleem: true }, "");
      triggerPiP();        // popstate IS trusted on Android Chrome
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [inCall, triggerPiP]);

  // ── Phone home button / browser minimize (visibilitychange) ──────────
  // visibilitychange is trusted on desktop Chrome; on Android Chrome
  // autopictureinpicture handles it. We still try both.
  useEffect(() => {
    if (!inCall) return;
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      if (document.pictureInPictureElement) return;
      triggerPiP();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [inCall, triggerPiP]);

  // Exit PiP when returning to full-screen class
  useEffect(() => {
    if (!minimized && document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
  }, [minimized]);

  if (!inCall || !activeSubject) return null;

  return (
    /* Full classroom — always mounted, hidden when minimized */
    <div style={{
      position: "fixed", inset: 0, zIndex: 8000,
      display: minimized ? "none" : "flex", flexDirection: "column",
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
