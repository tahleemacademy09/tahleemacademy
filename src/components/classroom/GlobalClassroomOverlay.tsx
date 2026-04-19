/*
  GlobalClassroomOverlay.tsx — Tahleem Academy
  ─────────────────────────────────────────────
  FIXES (Apr 2026 v3):
  1. RoomToContextBridge in ClassroomView now handles toggle registration —
     buttons always work regardless of phase.
  2. Draggable floating bubble replaces the bottom pill — can be moved anywhere.
  3. Audio-only mode: shows class initial in a gold circle, no camera button.
  4. Canvas PiP pre-created when call starts so requestPictureInPicture()
     fires within the user-gesture window (minimize button tap).
  5. PiP chain: Document PiP → Remote Video PiP → Canvas/Initials PiP.
*/

import { useLiveClass } from "@/contexts/LiveClassContext";
import { useAuth }      from "@/contexts/AuthContext";
import ClassroomView    from "@/components/classroom/ClassroomView";
import { Maximize2, X, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useEffect, useRef, useCallback, useState } from "react";

const GOLD = "#c9a84c";
const DARK = "#08190f";
const RED  = "#ef4444";

/* ─── Silent audio keep-alive ─── */
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
      osc.connect(gain); gain.connect(ctx.destination); osc.start();
      ctxRef.current = ctx;
    } catch {}
    return () => { ctxRef.current?.close(); ctxRef.current = null; };
  }, [active]);
}

/* ─── Wake lock ─── */
function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);
  const request = useCallback(async () => {
    if (!active || !("wakeLock" in navigator)) return;
    try { lockRef.current = await navigator.wakeLock.request("screen"); } catch {}
  }, [active]);
  useEffect(() => {
    if (!active) { lockRef.current?.release(); lockRef.current = null; return; }
    request();
    const onVis = () => { if (document.visibilityState === "visible") request(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); lockRef.current?.release(); };
  }, [active, request]);
}

/* ─── MediaSession ─── */
function useMediaSession(active: boolean, title: string, onReturn: () => void, onLeave: () => void) {
  useEffect(() => {
    if (!active || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: "Tahleem Academy", album: "🟢 Live" });
    navigator.mediaSession.playbackState = "playing";
    const sa = (a: MediaSessionAction, h: () => void) => { try { navigator.mediaSession.setActionHandler(a, h); } catch {} };
    sa("play", onReturn); sa("pause", onReturn); sa("stop", onLeave);
    sa("previoustrack", onReturn); sa("nexttrack", onReturn);
    return () => {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      (["play","pause","stop","previoustrack","nexttrack"] as MediaSessionAction[]).forEach(a => {
        try { navigator.mediaSession.setActionHandler(a, null); } catch {}
      });
    };
  }, [active, title, onReturn, onLeave]);
}

/* ─── Document PiP (Chrome 116+ Android/desktop) ─── */
async function tryDocumentPiP(
  title: string, initial: string,
  onReturn: () => void, onLeave: () => void,
  onToggleMic: () => void, onToggleCam: () => void,
  micEnabled: boolean, camEnabled: boolean,
): Promise<boolean> {
  const dPiP = (window as any).documentPictureInPicture;
  if (!dPiP) return false;
  try {
    const pipWin: Window = await dPiP.requestWindow({ width: 300, height: camEnabled ? 280 : 220 });
    const style = pipWin.document.createElement("style");
    style.textContent = `
      * { box-sizing:border-box;margin:0;padding:0;font-family:system-ui,sans-serif; }
      body { background:#0a1a10;overflow:hidden;height:100vh;display:flex;align-items:center;justify-content:center; }
      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.25} }
      .card { width:260px;background:rgba(8,25,15,.98);border:1px solid rgba(201,168,76,.45);
        border-radius:20px;padding:18px;display:flex;flex-direction:column;align-items:center;gap:12px;
        box-shadow:0 8px 40px rgba(0,0,0,.8); }
      .avatar { width:72px;height:72px;border-radius:50%;background:#c9a84c;display:flex;
        align-items:center;justify-content:center;font-size:28px;font-weight:800;color:#08190f; }
      .title { color:#fff;font-size:14px;font-weight:700;text-align:center; }
      .live-row { display:flex;align-items:center;gap:6px; }
      .dot { width:8px;height:8px;border-radius:50%;background:#ef4444;animation:pulse 1.4s infinite; }
      .live { font-size:10px;font-weight:800;color:#ef4444;border:1px solid rgba(239,68,68,.35);border-radius:6px;padding:2px 8px; }
      .btns { display:flex;gap:10px;margin-top:4px; }
      .btn { width:42px;height:42px;border-radius:50%;border:none;cursor:pointer;font-size:18px;
        display:flex;align-items:center;justify-content:center; }
      .btn-on  { background:rgba(255,255,255,.12); }
      .btn-off { background:rgba(239,68,68,.22); }
      .btn-gold{ background:#c9a84c; font-size:16px; }
      .btn-red { background:rgba(239,68,68,.2);border:1px solid rgba(239,68,68,.4); }
    `;
    pipWin.document.head.appendChild(style);
    pipWin.document.body.innerHTML = `
      <div class="card">
        <div class="avatar">${initial}</div>
        <span class="title">${title}</span>
        <div class="live-row">
          <span class="dot"></span>
          <span class="live">LIVE</span>
        </div>
        <div class="btns">
          <button class="btn ${micEnabled?"btn-on":"btn-off"}" id="bm">${micEnabled?"🎙️":"🔇"}</button>
          ${camEnabled ? `<button class="btn ${camEnabled?"btn-on":"btn-off"}" id="bc">📹</button>` : ""}
          <button class="btn btn-gold" id="br">⬆</button>
          <button class="btn btn-red"  id="bl">✕</button>
        </div>
      </div>
    `;
    pipWin.document.getElementById("bm")?.addEventListener("click", onToggleMic);
    pipWin.document.getElementById("bc")?.addEventListener("click", onToggleCam);
    pipWin.document.getElementById("br")?.addEventListener("click", () => { pipWin.close(); onReturn(); });
    pipWin.document.getElementById("bl")?.addEventListener("click", () => { pipWin.close(); onLeave(); });
    pipWin.addEventListener("pagehide", onReturn);
    return true;
  } catch { return false; }
}

/* ─── Remote Video PiP (non-mirrored — avoids inverted self-view) ─── */
async function tryVideoPiP(): Promise<boolean> {
  if (!("requestPictureInPicture" in HTMLVideoElement.prototype)) return false;
  const videos = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
  const remote = videos.find(v => !v.muted && v.readyState >= 2 && v.videoWidth > 0);
  if (!remote) return false;
  if (document.pictureInPictureElement === remote) return true;
  try { await remote.requestPictureInPicture(); return true; } catch { return false; }
}

/* ─── Canvas / Initials PiP ───────────────────────────────────────────
   Pre-creates the canvas+video on call start so requestPictureInPicture
   can fire SYNCHRONOUSLY within the minimize-button user gesture.      */
interface CanvasPipHandle {
  video: HTMLVideoElement;
  rafId: { current: number };
  stop: () => void;
}

function createCanvasPipHandle(title: string, initial: string): CanvasPipHandle | null {
  if (!("requestPictureInPicture" in HTMLVideoElement.prototype)) return null;
  const W = 300, H = 300;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const rafId = { current: 0 };

  const draw = () => {
    ctx.fillStyle = "#0a1a10";
    ctx.fillRect(0, 0, W, H);

    // Avatar circle
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(W / 2, 110, 68, 0, Math.PI * 2); ctx.fill();

    // Initial letter
    ctx.fillStyle = DARK;
    ctx.font = "bold 56px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(initial.toUpperCase().slice(0, 2), W / 2, 110);

    // Class name
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 17px system-ui, sans-serif";
    ctx.textBaseline = "top";
    const label = title.length > 20 ? title.slice(0, 18) + "…" : title;
    ctx.fillText(label, W / 2, 196);

    // Pulsing LIVE
    const alpha = 0.5 + 0.5 * Math.abs(Math.sin(Date.now() / 700));
    ctx.fillStyle = `rgba(239,68,68,${alpha})`;
    ctx.beginPath(); ctx.arc(W / 2 - 22, 238, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(239,68,68,${alpha})`;
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("LIVE", W / 2 + 2, 238);

    rafId.current = requestAnimationFrame(draw);
  };

  draw();

  const video = document.createElement("video");
  video.srcObject = canvas.captureStream(8);
  video.muted = true;
  video.playsInline = true;
  video.style.cssText = "position:fixed;top:-99px;left:-99px;width:1px;height:1px;opacity:0.01;pointer-events:none";
  document.body.appendChild(video);

  const stop = () => {
    cancelAnimationFrame(rafId.current);
    const stream = video.srcObject as MediaStream | null;
    stream?.getTracks().forEach(t => t.stop());
    video.remove();
    if (document.pictureInPictureElement === video) {
      document.exitPictureInPicture().catch(() => {});
    }
  };

  video.addEventListener("leavepictureinpicture", stop);

  return { video, rafId, stop };
}

/* ════════════════════════════════════════════════════════════ */
export default function GlobalClassroomOverlay() {
  const {
    activeSubject, inCall, minimized, autoJoin,
    leaveClass, setMinimized,
    micEnabled, camEnabled,
    toggleMicFnRef, toggleCamFnRef,
  } = useLiveClass();

  const { user } = useAuth();

  const title   = activeSubject?.title ?? "Live Class";
  const initial = (activeSubject?.title ?? user?.email ?? "L").charAt(0).toUpperCase();

  // ── Optimistic pill state (instant visual feedback) ──────────────────
  const [localMic, setLocalMic] = useState(micEnabled);
  const [localCam, setLocalCam] = useState(camEnabled);
  useEffect(() => { setLocalMic(micEnabled); }, [micEnabled]);
  useEffect(() => { setLocalCam(camEnabled); }, [camEnabled]);

  // ── Draggable bubble position ─────────────────────────────────────────
  const [pos, setPos] = useState({ right: 16, bottom: 120 });
  const drag = useRef({ active: false, sx: 0, sy: 0, sr: 0, sb: 0, moved: false });

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    drag.current = { active: true, sx: t.clientX, sy: t.clientY, sr: pos.right, sb: pos.bottom, moved: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!drag.current.active) return;
    const t = e.touches[0];
    const dx = t.clientX - drag.current.sx;
    const dy = t.clientY - drag.current.sy;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) drag.current.moved = true;
    if (!drag.current.moved) return;
    e.preventDefault();
    const bw = 168; // bubble width
    const bh = 200; // bubble height (approx)
    setPos({
      right:  Math.max(8, Math.min(window.innerWidth  - bw - 8, drag.current.sr - dx)),
      bottom: Math.max(8, Math.min(window.innerHeight - bh - 8, drag.current.sb - dy)),
    });
  };
  const onTouchEnd = () => { drag.current.active = false; };

  // ── Canvas PiP handle — pre-created on call start ─────────────────────
  const canvasPipRef = useRef<CanvasPipHandle | null>(null);

  useEffect(() => {
    if (!inCall) {
      canvasPipRef.current?.stop();
      canvasPipRef.current = null;
      return;
    }
    // Pre-create and start playing (no user gesture needed for .play())
    const handle = createCanvasPipHandle(title, initial);
    if (handle) {
      handle.video.play().catch(() => {});
      canvasPipRef.current = handle;
    }
    return () => {
      canvasPipRef.current?.stop();
      canvasPipRef.current = null;
    };
  }, [inCall, title, initial]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleReturn = useCallback(() => setMinimized(false), [setMinimized]);
  const handleLeave  = useCallback(() => leaveClass(),         [leaveClass]);

  const handleToggleMic = useCallback(() => {
    setLocalMic(v => !v);
    toggleMicFnRef.current?.();
  }, [toggleMicFnRef]);

  const handleToggleCam = useCallback(() => {
    setLocalCam(v => !v);
    toggleCamFnRef.current?.();
  }, [toggleCamFnRef]);

  // ── Keep-alive hooks ─────────────────────────────────────────────────
  useSilentAudioKeepAlive(inCall);
  useWakeLock(inCall);
  useMediaSession(inCall, title, handleReturn, handleLeave);

  // ── Minimize handler — called by ClassroomView minimize button ────────
  // Must be a stable ref so ClassroomView doesn't re-render when mic/cam changes
  const pipReqRef = useRef<() => void>(() => {});
  useEffect(() => {
    pipReqRef.current = () => {
      const mic = micEnabled; const cam = camEnabled;
      // Attempt 1: Document PiP (card with avatar + buttons)
      tryDocumentPiP(title, initial, handleReturn, handleLeave,
        handleToggleMic, handleToggleCam, mic, cam)
        .then(ok => {
          if (ok) return;
          // Attempt 2: Remote video PiP (non-inverted)
          tryVideoPiP().then(ok2 => {
            if (ok2) return;
            // Attempt 3: Canvas/initials PiP — video already playing, just call PiP
            // This MUST be called while we're still within the user-gesture window
            const handle = canvasPipRef.current;
            if (handle?.video) {
              handle.video.requestPictureInPicture().catch(() => {});
            }
          });
        });
    };
  }, [title, initial, micEnabled, camEnabled, handleReturn, handleLeave, handleToggleMic, handleToggleCam]);

  const handleMinimize = useCallback(() => {
    setMinimized(true);
    pipReqRef.current(); // fires within user-gesture window
  }, [setMinimized]);

  // Clean up PiP when call ends or user returns
  useEffect(() => {
    if (!inCall || !minimized) {
      if (!minimized && document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      }
    }
  }, [inCall, minimized]);

  if (!inCall || !activeSubject) return null;

  // ── Bubble button style helper ────────────────────────────────────────
  const bubbleBtn = (active: boolean, danger = false): React.CSSProperties => ({
    width: 38, height: 38, borderRadius: "50%", border: "none",
    cursor: "pointer", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: danger
      ? "rgba(239,68,68,.2)"
      : active ? "rgba(255,255,255,.16)" : "rgba(239,68,68,.22)",
    transition: "transform .12s",
  });

  return (
    <>
      {/* ── Full classroom (hidden when minimized, still running) ── */}
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

      {/* ── Draggable floating bubble (in-browser minimized) ─────────────
          Shows when minimized within the browser tab. Draggable via touch.
          Audio-only: shows initials + LIVE, no camera button.
          Video-on: shows initials + LIVE + camera toggle.            ── */}
      {minimized && (
        <>
          <style>{`
            @keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:.28} }
            @keyframes bubbleIn  { from{opacity:0;transform:scale(.82)} to{opacity:1;transform:scale(1)} }
            .pip-bubble-btn:active { transform: scale(0.85) !important; }
          `}</style>

          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{
              position: "fixed",
              right: pos.right,
              bottom: pos.bottom,
              zIndex: 9000,
              width: 164,
              borderRadius: 20,
              background: "rgba(8,25,15,.97)",
              border: "1px solid rgba(201,168,76,.45)",
              boxShadow: "0 10px 40px rgba(0,0,0,.75), 0 0 0 1px rgba(201,168,76,.12)",
              animation: "bubbleIn .25s ease",
              touchAction: "none",
              userSelect: "none",
              fontFamily: "'Cairo', sans-serif",
              overflow: "hidden",
            }}
          >
            {/* Avatar / preview area */}
            <div style={{
              height: 110, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 8,
              background: "rgba(0,0,0,.35)", position: "relative",
            }}>
              {/* Gold avatar circle with initial */}
              <div style={{
                width: 58, height: 58, borderRadius: "50%", background: GOLD,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 16px rgba(201,168,76,.45)",
              }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: DARK }}>
                  {initial}
                </span>
              </div>

              {/* Class name */}
              <span style={{
                fontSize: 11, color: "rgba(255,255,255,.75)", fontWeight: 600,
                maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap", textAlign: "center",
              }}>
                {title}
              </span>

              {/* LIVE indicator top-left */}
              <div style={{
                position: "absolute", top: 8, left: 10,
                display: "flex", alignItems: "center", gap: 4,
              }}>
                <span style={{
                  width: 7, height: 7, borderRadius: "50%", background: RED,
                  animation: "livePulse 1.4s ease-in-out infinite",
                }} />
                <span style={{ fontSize: 9, fontWeight: 800, color: RED, letterSpacing: ".5px" }}>
                  LIVE
                </span>
              </div>
            </div>

            {/* Controls row */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 8, padding: "10px 10px",
            }}>
              {/* Mic toggle */}
              <button
                className="pip-bubble-btn"
                onClick={handleToggleMic}
                title={localMic ? "Mute mic" : "Unmute mic"}
                style={bubbleBtn(localMic)}
              >
                {localMic
                  ? <Mic     style={{ width: 15, height: 15, color: "#fff" }} />
                  : <MicOff  style={{ width: 15, height: 15, color: RED   }} />}
              </button>

              {/* Camera toggle — only shown when camera was/is enabled */}
              {localCam && (
                <button
                  className="pip-bubble-btn"
                  onClick={handleToggleCam}
                  title="Turn off camera"
                  style={bubbleBtn(localCam)}
                >
                  <Video style={{ width: 15, height: 15, color: "#fff" }} />
                </button>
              )}

              {/* Expand / return */}
              <button
                className="pip-bubble-btn"
                onClick={handleReturn}
                title="Return to class"
                style={{
                  width: 38, height: 38, borderRadius: "50%",
                  background: GOLD, border: "none", cursor: "pointer", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 2px 10px rgba(201,168,76,.4)", transition: "transform .12s",
                }}
              >
                <Maximize2 style={{ width: 14, height: 14, color: DARK }} />
              </button>

              {/* End call */}
              <button
                className="pip-bubble-btn"
                onClick={handleLeave}
                title="Leave class"
                style={{
                  width: 38, height: 38, borderRadius: "50%",
                  background: "rgba(239,68,68,.18)",
                  border: "1px solid rgba(239,68,68,.4)",
                  cursor: "pointer", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "transform .12s",
                }}
              >
                <X style={{ width: 14, height: 14, color: RED }} />
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
