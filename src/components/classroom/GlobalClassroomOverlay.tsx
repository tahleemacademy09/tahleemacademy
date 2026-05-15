/*
  GlobalClassroomOverlay.tsx — Tahleem Academy
  ─────────────────────────────────────────────
  Minimize strategy (in order):
    1. Document PiP API  — custom HTML floating window outside the browser,
                           exact size we control (160 × 52 px).
    2. Real camera PiP   — if cam is on and doc-pip unavailable.
    3. Canvas video PiP  — fallback (screen-off keep-alive / older Chrome).

  Canvas PiP is still built silently on call-start so it auto-enters PiP
  when the tab goes hidden (screen-off), regardless of which path minimized used.
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
   DOCUMENT PICTURE-IN-PICTURE  (Chrome 116+)
   Opens a real OS-level floating window with our own HTML at an exact
   pixel size. Tap anywhere inside → returns to live class.
   ══════════════════════════════════════════════════════════════════════ */
interface DocPipHandle {
  updateMic: (muted: boolean) => void;
  close:     () => void;
}

async function openDocumentPip(
  initial:  string,
  micMuted: boolean,
  onReturn: () => void,
): Promise<DocPipHandle | null> {
  const dPiP = (window as any).documentPictureInPicture;
  if (!dPiP) return null;

  try {
    const pipWin: Window = await dPiP.requestWindow({
      width:  160,   // very small — just a pill outside the browser
      height: 52,
    });

    const doc = pipWin.document;
    doc.documentElement.style.cssText = "height:100%;margin:0;padding:0;";

    const style = doc.createElement("style");
    style.textContent = `
      *{box-sizing:border-box;margin:0;padding:0}
      @keyframes livePulse{0%,100%{opacity:1}50%{opacity:.2}}
      body{
        height:52px;background:#0c1f12;overflow:hidden;cursor:pointer;
        display:flex;align-items:center;gap:7px;padding:0 10px;
        font-family:system-ui,-apple-system,sans-serif;
        border:1.5px solid rgba(201,168,76,.5);border-radius:10px;
      }
      .dot{
        width:7px;height:7px;border-radius:50%;
        background:#ef4444;flex-shrink:0;
        animation:livePulse 1.4s ease-in-out infinite;
      }
      .av{
        width:30px;height:30px;border-radius:50%;
        background:#c9a84c;flex-shrink:0;
        display:flex;align-items:center;justify-content:center;
        color:#0c1f12;font-weight:700;font-size:14px;
      }
      .lbl{
        color:rgba(255,255,255,.75);font-size:9px;
        font-weight:700;letter-spacing:.6px;flex:1;white-space:nowrap;
      }
      .mic{
        width:26px;height:26px;border-radius:50%;flex-shrink:0;
        display:flex;align-items:center;justify-content:center;
        font-size:13px;transition:background .2s;
      }
    `;
    doc.head.appendChild(style);

    const dot = doc.createElement("div"); dot.className = "dot";
    const av  = doc.createElement("div"); av.className  = "av";
    av.textContent = initial.toUpperCase().slice(0, 1);
    const lbl = doc.createElement("div"); lbl.className = "lbl";
    lbl.textContent = "LIVE";
    const mic = doc.createElement("div"); mic.className = "mic";

    const applyMic = (muted: boolean) => {
      mic.style.background = muted ? "rgba(239,68,68,.9)" : "rgba(34,120,60,.9)";
      mic.textContent      = muted ? "🔇" : "🎤";
    };
    applyMic(micMuted);

    doc.body.append(dot, av, lbl, mic);

    // Tap → expand back to full class
    doc.body.addEventListener("click", () => { pipWin.close(); onReturn(); });
    // User presses OS close button
    pipWin.addEventListener("pagehide", onReturn);

    return {
      updateMic: applyMic,
      close: () => { try { pipWin.close(); } catch {} },
    };
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════
   CANVAS VIDEO PiP  — screen-off keep-alive / older Chrome fallback.
   16:9 so Chrome renders it without letterboxing.
   ══════════════════════════════════════════════════════════════════════ */
const GOLD = "#c9a84c";
const DARK = "#0c1f12";
const W = 320, H = 180, CX = W / 2, CY = H / 2;

interface CanvasPipHandle {
  video:       HTMLVideoElement;
  setMicMuted: (v: boolean) => void;
  pip:         () => Promise<void>;
  stop:        () => void;
}

function buildCanvasPip(initial: string, onTap: () => void): CanvasPipHandle | null {
  if (!("requestPictureInPicture" in HTMLVideoElement.prototype)) return null;

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;

  let micMuted = true, raf = 0;

  const draw = () => {
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = DARK; ctx.fillRect(0, 0, W, H);
    const grd = ctx.createRadialGradient(CX, CY, 10, CX, CY, 70);
    grd.addColorStop(0, "rgba(201,168,76,0.12)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

    // Avatar
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(CX, CY - 4, 44, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = DARK;
    ctx.font = "bold 36px system-ui,-apple-system,sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(initial.toUpperCase().slice(0, 1), CX, CY - 4);

    // LIVE badge — top left
    const p = 0.45 + 0.55 * Math.abs(Math.sin(Date.now() / 700));
    ctx.fillStyle = `rgba(239,68,68,${p})`;
    ctx.beginPath(); ctx.arc(18, 18, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px system-ui,sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText("LIVE", 27, 18);

    // Mic badge — bottom right
    const mx = W - 22, my = H - 22;
    ctx.fillStyle = micMuted ? "rgba(239,68,68,.92)" : "rgba(34,120,60,.92)";
    ctx.beginPath(); ctx.arc(mx, my, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4;
    if (micMuted) {
      ctx.globalAlpha = 0.4;
      ctx.beginPath(); ctx.arc(mx, my - 3, 4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(mx - 8, my + 7); ctx.lineTo(mx + 8, my - 7); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(mx, my - 3, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(mx - 4.5, my - 1);
      ctx.quadraticCurveTo(mx - 4.5, my + 5, mx, my + 6);
      ctx.quadraticCurveTo(mx + 4.5, my + 5, mx + 4.5, my - 1);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx, my + 6); ctx.lineTo(mx, my + 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx - 3, my + 10); ctx.lineTo(mx + 3, my + 10); ctx.stroke();
    }

    raf = requestAnimationFrame(draw);
  };
  draw();

  const vid = document.createElement("video");
  vid.srcObject = cv.captureStream(10);
  vid.muted = true; vid.playsInline = true;
  (vid as any).autopictureinpicture = true;
  vid.setAttribute("autopictureinpicture", "");
  vid.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;pointer-events:none;opacity:.01;z-index:-999;";
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

  return { video: vid, setMicMuted: v => { micMuted = v; }, pip, stop };
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

  const handleReturn = useCallback(() => setMinimized(false), [setMinimized]);
  const handleLeave  = useCallback(() => leaveClass(),        [leaveClass]);
  const handleToggleMic = useCallback(() => {
    setLocalMic(v => !v);
    toggleMicFnRef.current?.();
  }, [toggleMicFnRef]);

  useSilentAudio(inCall);
  useWakeLock(inCall);
  useMediaSession(inCall, title, handleReturn, handleLeave);

  /* ── Build canvas PiP silently as soon as call starts (screen-off) ── */
  const canvasPip       = useRef<CanvasPipHandle | null>(null);
  const docPip          = useRef<DocPipHandle | null>(null);
  const handleReturnRef = useRef(handleReturn);
  handleReturnRef.current = handleReturn;

  useEffect(() => {
    if (!inCall) {
      canvasPip.current?.stop(); canvasPip.current = null;
      docPip.current?.close();   docPip.current    = null;
      return;
    }
    const h = buildCanvasPip(initial, () => handleReturnRef.current());
    if (h) { h.video.play().catch(() => {}); canvasPip.current = h; }
    return () => {
      canvasPip.current?.stop(); canvasPip.current = null;
      docPip.current?.close();   docPip.current    = null;
    };
  }, [inCall, initial]);

  // Sync mic state into both pip handles
  useEffect(() => {
    canvasPip.current?.setMicMuted(!localMic);
    docPip.current?.updateMic(!localMic);
  }, [localMic]);

  /* ── Minimize ─────────────────────────────────────────────────────── */
  const handleMinimize = useCallback(async () => {
    setMinimized(true);

    // ① Document PiP — tiny custom window outside browser (Chrome 116+)
    const dp = await openDocumentPip(initial, !localMic, () => handleReturnRef.current());
    if (dp) { docPip.current = dp; return; }

    // ② Real camera video PiP
    const h = canvasPip.current;
    if (!h) return;
    if (document.pictureInPictureElement) return;
    if (camEnabled) {
      const vids = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
      const live = vids.find(v => v.readyState >= 2 && v.videoWidth > 0 && v !== h.video);
      if (live) { try { await live.requestPictureInPicture(); return; } catch {} }
    }

    // ③ Canvas video PiP fallback
    h.pip().catch(() => {});
  }, [setMinimized, initial, localMic, camEnabled]);

  /* ── Back button (popstate) → minimize ── */
  const handleMinimizeRef = useRef(handleMinimize);
  handleMinimizeRef.current = handleMinimize;
  useEffect(() => {
    if (!inCall) return;
    const onPop = () => setTimeout(() => handleMinimizeRef.current(), 50);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [inCall]);

  /* ── Screen off / tab hidden → canvas PiP (screen-off keep-alive) ── */
  useEffect(() => {
    if (!inCall) return;
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      if (document.pictureInPictureElement) return;
      canvasPip.current?.pip().catch(() => {});
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [inCall]);

  /* ── Returning to full class → close all pip windows ── */
  useEffect(() => {
    if (minimized) return;
    docPip.current?.close();   docPip.current = null;
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
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
