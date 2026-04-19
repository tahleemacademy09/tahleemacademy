/*
  GlobalClassroomOverlay.tsx — Tahleem Academy
  ─────────────────────────────────────────────
  Rendered at App root level (outside all page routing).

  FIXES (Apr 2026):
  ─────────────────
  1. Canvas PiP fallback: when camera is OFF, creates an animated
     canvas stream showing class name + LIVE indicator in PiP so
     something always floats on the home screen.
  2. Remote-video preference in Video PiP: picks the non-muted remote
     video first so the self-view (which is mirrored in the UI) doesn't
     appear inverted in PiP. If no remote video, skips video PiP and
     goes straight to canvas PiP.
  3. Optimistic mic/cam state in the minimized pill: icon flips
     immediately on tap (local state) so there's instant visual
     feedback, even before the async LiveKit call resolves.
  4. Pill always renders when minimized — regardless of video state.
*/

import { useLiveClass } from "@/contexts/LiveClassContext";
import ClassroomView from "@/components/classroom/ClassroomView";
import { Maximize2, X, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useEffect, useRef, useCallback, useState } from "react";

const GOLD = "#c9a84c";
const DARK = "#08190f";
const RED  = "#ef4444";

/* ─── silent audio node — keeps Chrome from suspending WebRTC ─── */
function useSilentAudioKeepAlive(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!active) { ctxRef.current?.close(); ctxRef.current = null; return; }
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      ctxRef.current = ctx;
    } catch (_) {}
    return () => { ctxRef.current?.close(); ctxRef.current = null; };
  }, [active]);
}

/* ─── screen wake lock ─── */
function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);
  const request = useCallback(async () => {
    if (!active || !("wakeLock" in navigator)) return;
    try { lockRef.current = await navigator.wakeLock.request("screen"); } catch (_) {}
  }, [active]);
  useEffect(() => {
    if (!active) { lockRef.current?.release(); lockRef.current = null; return; }
    request();
    const onVisible = () => { if (document.visibilityState === "visible") request(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lockRef.current?.release(); lockRef.current = null;
    };
  }, [active, request]);
}

/* ─── MediaSession ─── */
function useMediaSession(active: boolean, title: string, onReturn: () => void, onLeave: () => void) {
  useEffect(() => {
    if (!active || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title, artist: "Tahleem Academy — Live Class", album: "🟢 Class in progress",
    });
    navigator.mediaSession.playbackState = "playing";
    const sa = (a: MediaSessionAction, h: () => void) => {
      try { navigator.mediaSession.setActionHandler(a, h); } catch (_) {}
    };
    sa("play", onReturn); sa("pause", onReturn); sa("stop", onLeave);
    sa("previoustrack", onReturn); sa("nexttrack", onReturn);
    return () => {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      (["play","pause","stop","previoustrack","nexttrack"] as MediaSessionAction[])
        .forEach(a => { try { navigator.mediaSession.setActionHandler(a, null); } catch (_) {} });
    };
  }, [active, title, onReturn, onLeave]);
}

/* ─── Document Picture-in-Picture (Chrome 116+ desktop/Android) ─── */
async function tryDocumentPiP(
  title: string,
  onReturn: () => void,
  onLeave: () => void,
  onToggleMic: () => void,
  onToggleCam: () => void,
  micEnabled: boolean,
  camEnabled: boolean,
): Promise<boolean> {
  const dPiP = (window as any).documentPictureInPicture;
  if (!dPiP) return false;
  try {
    const pipWin: Window = await dPiP.requestWindow({ width: 340, height: 80 });
    const style = pipWin.document.createElement("style");
    style.textContent = `
      * { box-sizing:border-box; margin:0; padding:0; font-family:system-ui,sans-serif; }
      body { background:transparent; overflow:hidden; }
      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.25} }
      .pill { background:rgba(8,25,15,.97); border:1px solid rgba(201,168,76,.5); border-radius:50px;
        padding:10px 14px; display:flex; align-items:center; gap:8px; width:100%; height:80px;
        box-shadow:0 4px 24px rgba(0,0,0,.8); }
      .dot { width:9px;height:9px;border-radius:50%;background:#ef4444;
        animation:pulse 1.4s ease-in-out infinite;flex-shrink:0; }
      .name { color:#fff;font-size:12px;font-weight:700;flex:1;overflow:hidden;
        text-overflow:ellipsis;white-space:nowrap; }
      .live { font-size:10px;font-weight:800;color:#ef4444;border:1px solid rgba(239,68,68,.35);
        border-radius:7px;padding:2px 7px;flex-shrink:0; }
      .btn { width:34px;height:34px;border-radius:50%;border:none;cursor:pointer;
        display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px; }
      .btn-active { background:rgba(255,255,255,.12); }
      .btn-muted  { background:rgba(239,68,68,.22); }
      .btn-return { background:#c9a84c; }
      .btn-leave  { background:rgba(239,68,68,.2);border:1px solid rgba(239,68,68,.4); }
    `;
    pipWin.document.head.appendChild(style);
    pipWin.document.body.innerHTML = `
      <div class="pill">
        <span class="dot"></span>
        <span class="name">${title}</span>
        <span class="live">LIVE</span>
        <button class="btn ${micEnabled?"btn-active":"btn-muted"}" id="bm">${micEnabled?"🎙️":"🔇"}</button>
        <button class="btn ${camEnabled?"btn-active":"btn-muted"}" id="bc">${camEnabled?"📹":"📷"}</button>
        <button class="btn btn-return" id="br">⬆</button>
        <button class="btn btn-leave"  id="bl">✕</button>
      </div>
    `;
    pipWin.document.getElementById("bm")?.addEventListener("click", onToggleMic);
    pipWin.document.getElementById("bc")?.addEventListener("click", onToggleCam);
    pipWin.document.getElementById("br")?.addEventListener("click", () => { pipWin.close(); onReturn(); });
    pipWin.document.getElementById("bl")?.addEventListener("click", () => { pipWin.close(); onLeave(); });
    pipWin.addEventListener("pagehide", onReturn);
    return true;
  } catch (_) { return false; }
}

/* ─── Video PiP — prefers REMOTE (non-mirrored) video ─── */
async function tryVideoPiP(): Promise<boolean> {
  if (!("requestPictureInPicture" in HTMLVideoElement.prototype)) return false;
  const videos = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
  // Prefer unmuted remote video (avoids the mirrored self-view)
  const remote = videos.find(v => !v.muted && v.readyState >= 2 && v.videoWidth > 0);
  // Do NOT fall back to a muted/local video — it appears inverted
  const target = remote;
  if (!target) return false;
  if (document.pictureInPictureElement === target) return true;
  try { await target.requestPictureInPicture(); return true; } catch (_) { return false; }
}

/* ─── Canvas PiP — animated pill when camera is off ─── */
// Creates a canvas stream showing class name + pulsing LIVE dot,
// then puts it in Video PiP so something always floats on the home screen.
let _canvasPipVideo: HTMLVideoElement | null = null;
let _canvasRafId: number = 0;

function stopCanvasPiP() {
  cancelAnimationFrame(_canvasRafId);
  if (_canvasPipVideo) {
    const stream = _canvasPipVideo.srcObject as MediaStream | null;
    stream?.getTracks().forEach(t => t.stop());
    _canvasPipVideo.remove();
    _canvasPipVideo = null;
  }
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(() => {});
  }
}

async function tryCanvasPiP(title: string): Promise<boolean> {
  if (!("requestPictureInPicture" in HTMLVideoElement.prototype)) return false;
  // Clean up any previous canvas PiP
  stopCanvasPiP();

  const W = 360, H = 80;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  const draw = () => {
    ctx.clearRect(0, 0, W, H);

    // Dark background
    ctx.fillStyle = "rgba(8,25,15,1)";
    if ((ctx as any).roundRect) {
      (ctx as any).roundRect(0, 0, W, H, 40);
    } else {
      ctx.rect(0, 0, W, H);
    }
    ctx.fill();

    // Gold border
    ctx.strokeStyle = "rgba(201,168,76,0.55)";
    ctx.lineWidth = 1.5;
    if ((ctx as any).roundRect) {
      ctx.beginPath(); (ctx as any).roundRect(1, 1, W - 2, H - 2, 39); ctx.stroke();
    }

    // Pulsing red dot
    const alpha = 0.45 + 0.55 * Math.abs(Math.sin(Date.now() / 700));
    ctx.fillStyle = `rgba(239,68,68,${alpha})`;
    ctx.beginPath(); ctx.arc(24, H / 2, 5, 0, Math.PI * 2); ctx.fill();

    // Title
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px system-ui, -apple-system, sans-serif";
    ctx.textBaseline = "middle";
    const name = title.length > 22 ? title.slice(0, 20) + "…" : title;
    ctx.fillText(name, 40, H / 2);

    // LIVE badge
    ctx.fillStyle = "rgba(239,68,68,0.18)";
    if ((ctx as any).roundRect) {
      ctx.beginPath(); (ctx as any).roundRect(258, 26, 48, 26, 6); ctx.fill();
    }
    ctx.strokeStyle = "rgba(239,68,68,0.45)";
    ctx.lineWidth = 1;
    if ((ctx as any).roundRect) {
      ctx.beginPath(); (ctx as any).roundRect(258, 26, 48, 26, 6); ctx.stroke();
    }
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("LIVE", 267, H / 2);

    _canvasRafId = requestAnimationFrame(draw);
  };

  draw();

  try {
    const stream = canvas.captureStream(10);
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;top:-9999px";
    document.body.appendChild(video);
    _canvasPipVideo = video;
    await video.play();
    await video.requestPictureInPicture();
    video.addEventListener("leavepictureinpicture", () => stopCanvasPiP());
    return true;
  } catch (_) {
    stopCanvasPiP();
    return false;
  }
}

/* ════════════════════════════════════════════════════════════ */
export default function GlobalClassroomOverlay() {
  const {
    activeSubject, inCall, minimized, autoJoin,
    leaveClass, setMinimized,
    micEnabled, camEnabled,
    toggleMicFnRef, toggleCamFnRef,
  } = useLiveClass();

  const title = activeSubject?.title ?? "Live Class";

  // ── Optimistic local state for INSTANT visual feedback in the pill ──
  // Mirrors context state but flips immediately on tap so the icon
  // changes right away — even before the async LiveKit call resolves.
  const [localMic, setLocalMic] = useState(micEnabled);
  const [localCam, setLocalCam] = useState(camEnabled);

  // Keep local state in sync whenever context changes (LiveKit resolved)
  useEffect(() => { setLocalMic(micEnabled); }, [micEnabled]);
  useEffect(() => { setLocalCam(camEnabled); }, [camEnabled]);

  const handleReturn = useCallback(() => setMinimized(false), [setMinimized]);
  const handleLeave  = useCallback(() => leaveClass(),         [leaveClass]);

  const handleToggleMic = useCallback(() => {
    setLocalMic(v => !v);           // flip icon immediately
    toggleMicFnRef.current?.();     // fire real LiveKit toggle
  }, [toggleMicFnRef]);

  const handleToggleCam = useCallback(() => {
    setLocalCam(v => !v);
    toggleCamFnRef.current?.();
  }, [toggleCamFnRef]);

  /* Keep-alive hooks */
  useSilentAudioKeepAlive(inCall);
  useWakeLock(inCall);
  useMediaSession(inCall, title, handleReturn, handleLeave);

  /* PiP management */
  useEffect(() => {
    if (!inCall) return;

    if (minimized) {
      // 1. Try Document PiP first (requires user gesture — works when
      //    the user tapped the in-app minimize button)
      tryDocumentPiP(title, handleReturn, handleLeave,
        handleToggleMic, handleToggleCam, micEnabled, camEnabled)
        .then(ok => {
          if (ok) return;
          // 2. Try remote-video PiP (avoids inverted self-view)
          return tryVideoPiP().then(ok2 => {
            if (ok2) return;
            // 3. Canvas PiP — always works, shows class name + LIVE dot
            //    even when camera is completely off
            tryCanvasPiP(title);
          });
        });
    } else {
      // Restore: exit any active PiP
      stopCanvasPiP();
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minimized, inCall]);

  /* Clean up PiP on call end */
  useEffect(() => {
    if (!inCall) {
      stopCanvasPiP();
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      }
    }
  }, [inCall]);

  if (!inCall || !activeSubject) return null;

  return (
    <>
      {/* Full classroom — always mounted while inCall=true, hidden when minimized */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 8000,
        display: minimized ? "none" : "flex", flexDirection: "column",
      }}>
        <ClassroomView
          subject={activeSubject}
          onLeave={leaveClass}
          onMinimize={() => setMinimized(true)}
          autoJoin={autoJoin}
        />
      </div>

      {/* ── In-browser minimized pill ──────────────────────────────────────
          Always rendered when minimized, with mic + camera toggles.
          Uses LOCAL (optimistic) state so icons flip instantly on tap. */}
      {minimized && (
        <>
          <style>{`
            @keyframes livePulse  { 0%,100%{opacity:1} 50%{opacity:.3} }
            @keyframes pipSlideUp {
              from { transform:translateX(-50%) translateY(20px); opacity:0 }
              to   { transform:translateX(-50%) translateY(0);    opacity:1 }
            }
            .pip-btn { transition: transform .12s, background .15s; }
            .pip-btn:active { transform: scale(0.88) !important; }
          `}</style>

          <div style={{
            position: "fixed", bottom: 24, left: "50%",
            transform: "translateX(-50%)", zIndex: 9000,
            background: "rgba(8,25,15,.97)",
            border: "1px solid rgba(201,168,76,.45)", borderRadius: 50,
            padding: "10px 16px", display: "flex", alignItems: "center", gap: 10,
            boxShadow: "0 8px 40px rgba(0,0,0,.75), 0 0 0 1px rgba(201,168,76,.15)",
            animation: "pipSlideUp .3s ease",
            minWidth: 330, maxWidth: "94vw",
            fontFamily: "'Cairo', sans-serif",
          }}>

            {/* Pulsing live dot */}
            <span style={{
              width: 8, height: 8, borderRadius: "50%", background: RED,
              flexShrink: 0, animation: "livePulse 1.4s ease-in-out infinite",
            }} />

            {/* Subject name */}
            <span style={{
              color: "#fff", fontSize: 12, fontWeight: 700, flex: 1,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {activeSubject.title}
            </span>

            {/* LIVE badge */}
            <span style={{
              fontSize: 10, fontWeight: 800, color: RED,
              background: "rgba(239,68,68,.15)",
              border: "1px solid rgba(239,68,68,.3)",
              borderRadius: 8, padding: "2px 7px",
              letterSpacing: ".5px", flexShrink: 0,
            }}>
              LIVE
            </span>

            {/* ── Mic toggle ── uses localMic for instant feedback */}
            <button
              className="pip-btn"
              onClick={handleToggleMic}
              title={localMic ? "Mute microphone" : "Unmute microphone"}
              style={{
                width: 36, height: 36, borderRadius: "50%", border: "none",
                cursor: "pointer", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: localMic ? "rgba(255,255,255,0.14)" : "rgba(239,68,68,0.22)",
              }}
            >
              {localMic
                ? <Mic     style={{ width: 14, height: 14, color: "#fff" }} />
                : <MicOff  style={{ width: 14, height: 14, color: RED   }} />}
            </button>

            {/* ── Camera toggle ── uses localCam for instant feedback */}
            <button
              className="pip-btn"
              onClick={handleToggleCam}
              title={localCam ? "Turn off camera" : "Turn on camera"}
              style={{
                width: 36, height: 36, borderRadius: "50%", border: "none",
                cursor: "pointer", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: localCam ? "rgba(255,255,255,0.14)" : "rgba(239,68,68,0.22)",
              }}
            >
              {localCam
                ? <Video    style={{ width: 14, height: 14, color: "#fff" }} />
                : <VideoOff style={{ width: 14, height: 14, color: RED   }} />}
            </button>

            {/* ── Return to class ── */}
            <button
              className="pip-btn"
              onClick={handleReturn}
              title="Return to class"
              style={{
                width: 36, height: 36, borderRadius: "50%",
                background: GOLD, border: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0,
                boxShadow: "0 2px 12px rgba(201,168,76,.45)",
              }}
            >
              <Maximize2 style={{ width: 14, height: 14, color: DARK }} />
            </button>

            {/* ── End call ── */}
            <button
              className="pip-btn"
              onClick={handleLeave}
              title="Leave class"
              style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "rgba(239,68,68,.18)",
                border: "1px solid rgba(239,68,68,.45)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,.4)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(239,68,68,.18)")}
            >
              <X style={{ width: 14, height: 14, color: RED }} />
            </button>
          </div>
        </>
      )}
    </>
  );
}
