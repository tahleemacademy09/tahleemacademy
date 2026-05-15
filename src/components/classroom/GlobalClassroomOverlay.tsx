/*
  GlobalClassroomOverlay.tsx — Tahleem Academy
  ─────────────────────────────────────────────
  PiP strategy:
    - Canvas video PiP only (no Document PiP).
    - Document PiP was removed because Android Chrome enforces a ~300×200px
      minimum on it. Video element PiP has a much smaller minimum (~160×90px).
    - Canvas is 16:9 (320×180) so Chrome doesn't letterbox.
    - Content is a horizontal bar: LIVE dot | avatar | label | mic badge.
    - Screen-off: canvas auto-enters PiP via visibilitychange.
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

/* ══════════════════════════════════════════════════════════════════════
   CANVAS VIDEO PiP
   16:9 canvas (320×180). Android Chrome video PiP minimum is ~160×90px —
   significantly smaller than Document PiP (~300×200px minimum).
   Layout: dark green fill · horizontal row · LIVE | avatar | name | mic
   ══════════════════════════════════════════════════════════════════════ */
const GOLD = "#c9a84c";
const DARK = "#0c1f12";
// 16:9 — matches what Chrome expects for a video PiP window
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

  // ── Mic icon drawn at (mx, my) ──────────────────────────────────────
  const drawMic = (mx: number, my: number, r: number) => {
    ctx.fillStyle = micMuted ? "rgba(239,68,68,.95)" : "rgba(34,120,60,.95)";
    ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
    const cs = r * 0.28; // capsule size

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

    // ── Background ────────────────────────────────────────────────────
    ctx.fillStyle = DARK;
    ctx.fillRect(0, 0, W, H);

    // Thin gold bottom border (decorative)
    ctx.fillStyle = "rgba(201,168,76,0.35)";
    ctx.fillRect(0, H - 2, W, 2);

    // ── LIVE indicator (left strip) ───────────────────────────────────
    const STRIP = 52;
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0, 0, STRIP, H);

    const p = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() / 700));
    // dot
    ctx.fillStyle = `rgba(239,68,68,${p})`;
    ctx.beginPath(); ctx.arc(STRIP / 2, H / 2 - 10, 6, 0, Math.PI * 2); ctx.fill();
    // pulse ring
    ctx.strokeStyle = `rgba(239,68,68,${p * 0.4})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(STRIP / 2, H / 2 - 10, 10, 0, Math.PI * 2); ctx.stroke();
    // "LIVE" text
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px system-ui,sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("LIVE", STRIP / 2, H / 2 + 8);

    // Divider
    ctx.fillStyle = "rgba(201,168,76,0.2)";
    ctx.fillRect(STRIP, 20, 1, H - 40);

    // ── Avatar circle ─────────────────────────────────────────────────
    const avX = STRIP + 52, avY = H / 2, avR = 36;
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = DARK;
    ctx.font = `bold ${avR * 0.75}px system-ui,-apple-system,sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(letter.toUpperCase().slice(0, 1), avX, avY);

    // ── Subject name ──────────────────────────────────────────────────
    const nameX = avX + avR + 12;
    const nameW = W - nameX - 52; // leave room for mic
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "600 13px system-ui,-apple-system,sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    // Truncate if too long
    let name = subjectName;
    while (name.length > 1 && ctx.measureText(name).width > nameW) {
      name = name.slice(0, -1);
    }
    if (name !== subjectName) name = name.trimEnd() + "…";
    ctx.fillText(name, nameX, H / 2 - 8);

    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "10px system-ui,sans-serif";
    ctx.fillText("Tap to return", nameX, H / 2 + 12);

    // ── Mic badge (right) ─────────────────────────────────────────────
    drawMic(W - 30, H / 2, 20);

    raf = requestAnimationFrame(draw);
  };

  draw();

  const vid = document.createElement("video");
  vid.srcObject = cv.captureStream(12);
  vid.muted = true; vid.playsInline = true;
  (vid as any).autopictureinpicture = true;
  vid.setAttribute("autopictureinpicture", "");
  vid.style.cssText = [
    "position:fixed", "top:-9999px", "left:-9999px",
    "width:1px", "height:1px",
    "pointer-events:none", "opacity:.01", "z-index:-999",
  ].join(";") + ";";
  document.body.appendChild(vid);
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
    toggleMicFnRef,
  } = useLiveClass();

  const title   = activeSubject?.title ?? "Live Class";
  const initial = (activeSubject?.title ?? "L").charAt(0).toUpperCase();

  const [localMic, setLocalMic] = useState(micEnabled);
  useEffect(() => setLocalMic(micEnabled), [micEnabled]);

  const handleReturn    = useCallback(() => setMinimized(false), [setMinimized]);
  const handleLeave     = useCallback(() => leaveClass(),        [leaveClass]);
  const handleToggleMic = useCallback(() => {
    setLocalMic(v => !v);
    toggleMicFnRef.current?.();
  }, [toggleMicFnRef]);

  useSilentAudio(inCall);
  useWakeLock(inCall);
  useMediaSession(inCall, title, handleReturn, handleLeave);

  const pipHandle       = useRef<PipHandle | null>(null);
  const handleReturnRef = useRef(handleReturn);
  handleReturnRef.current = handleReturn;

  /* ── Build canvas PiP when call starts ── */
  useEffect(() => {
    if (!inCall) { pipHandle.current?.stop(); pipHandle.current = null; return; }
    const h = buildCanvasPip(initial, title, () => handleReturnRef.current());
    if (h) { h.video.play().catch(() => {}); pipHandle.current = h; }
    return () => { pipHandle.current?.stop(); pipHandle.current = null; };
  }, [inCall, initial, title]);

  /* ── Sync mic state into canvas ── */
  useEffect(() => { pipHandle.current?.setMicMuted(!localMic); }, [localMic]);

  /* ── Minimize ── */
  const handleMinimize = useCallback(async () => {
    setMinimized(true);
    const h = pipHandle.current;
    if (!h) return;
    if (document.pictureInPictureElement) return;
    // Camera on → try real video element first
    if (camEnabled) {
      const vids = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
      const live = vids.find(v => v.readyState >= 2 && v.videoWidth > 0 && v !== h.video);
      if (live) { try { await live.requestPictureInPicture(); return; } catch {} }
    }
    h.pip().catch(() => {});
  }, [setMinimized, camEnabled]);

  /* ── Back button → minimize ── */
  const handleMinimizeRef = useRef(handleMinimize);
  handleMinimizeRef.current = handleMinimize;
  useEffect(() => {
    if (!inCall) return;
    const onPop = () => setTimeout(() => handleMinimizeRef.current(), 50);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [inCall]);

  /* ── Screen off → canvas PiP (keep-alive) ── */
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

  /* ── Return to full class → exit PiP ── */
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
