/*
  GlobalClassroomOverlay.tsx — Tahleem Academy
  ─────────────────────────────────────────────
  FIXES (Apr 2026 v4):
  - Minimized overlay is a small draggable circular bubble (~90px),
    NOT a large card. Tap to expand. 
  - The large ClassroomView is display:none when minimized so it never
    bleeds into the page.
  - Canvas video element is off-screen (-9999px) so it never shows as 
    a black box on the page.
  - Back button and browser minimize both trigger the overlay 
    (handled in LiveClassContext).
  - Pre-created canvas PiP video is ready before user taps minimize,
    so requestPictureInPicture() fires inside the gesture window.
  - Long-press bubble → expand controls row (mic/cam/end).
  - Tap bubble → open full class.
*/

import { useLiveClass }   from "@/contexts/LiveClassContext";
import ClassroomView       from "@/components/classroom/ClassroomView";
import { Mic, MicOff, VideoOff, X } from "lucide-react";
import { useEffect, useRef, useCallback, useState } from "react";

const GOLD  = "#c9a84c";
const DARK  = "#08190f";
const RED   = "#ef4444";
const GREEN = "#1a4a2a";

/* ─── Silent audio keep-alive ─── */
function useSilentAudio(active: boolean) {
  const r = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!active) { r.current?.close(); r.current = null; return; }
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AC();
      const o = ctx.createOscillator(), g = ctx.createGain();
      g.gain.value = 0; o.connect(g); g.connect(ctx.destination); o.start();
      r.current = ctx;
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
function useMediaSession(active: boolean, title: string, onReturn: () => void, onLeave: () => void) {
  useEffect(() => {
    if (!active || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: "Tahleem Academy", album: "🟢 Live Class" });
    navigator.mediaSession.playbackState = "playing";
    const sa = (a: MediaSessionAction, h: () => void) => { try { navigator.mediaSession.setActionHandler(a, h); } catch {} };
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

/* ─── Document PiP ─── */
async function tryDocumentPiP(title: string, initial: string,
  onReturn: () => void, onLeave: () => void,
  onToggleMic: () => void, micEnabled: boolean): Promise<boolean> {
  const dPiP = (window as any).documentPictureInPicture;
  if (!dPiP) return false;
  try {
    const pw: Window = await dPiP.requestWindow({ width: 220, height: 260 });
    const s = pw.document.createElement("style");
    s.textContent = `
      * { box-sizing:border-box;margin:0;padding:0;font-family:system-ui,sans-serif; }
      body { background:#0a1a10;display:flex;align-items:center;justify-content:center;height:100vh; }
      @keyframes p { 0%,100%{opacity:1} 50%{opacity:.2} }
      .c { background:rgba(8,25,15,.98);border:1px solid rgba(201,168,76,.45);border-radius:20px;
           padding:20px;display:flex;flex-direction:column;align-items:center;gap:12px;width:190px; }
      .av { width:66px;height:66px;border-radius:50%;background:#c9a84c;
            display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:#08190f; }
      .ti { color:#fff;font-size:12px;font-weight:700;text-align:center; }
      .lv { display:flex;align-items:center;gap:5px; }
      .dot { width:7px;height:7px;border-radius:50%;background:#ef4444;animation:p 1.4s infinite; }
      .lt { font-size:10px;font-weight:800;color:#ef4444;border:1px solid rgba(239,68,68,.35);border-radius:6px;padding:2px 7px; }
      .btns { display:flex;gap:8px;margin-top:2px; }
      .b { width:40px;height:40px;border-radius:50%;border:none;cursor:pointer;
           display:flex;align-items:center;justify-content:center;font-size:16px; }
      .bm { background:rgba(239,68,68,.22); }
      .bg { background:#c9a84c; }
      .br { background:rgba(239,68,68,.2);border:1px solid rgba(239,68,68,.4); }
    `;
    pw.document.head.appendChild(s);
    pw.document.body.innerHTML = `
      <div class="c">
        <div class="av">${initial}</div>
        <span class="ti">${title}</span>
        <div class="lv"><span class="dot"></span><span class="lt">LIVE</span></div>
        <div class="btns">
          <button class="b ${micEnabled?"":"bm"}" id="bm">${micEnabled?"🎙️":"🔇"}</button>
          <button class="b bg" id="br">⬆</button>
          <button class="b br" id="bl">✕</button>
        </div>
      </div>`;
    pw.document.getElementById("bm")?.addEventListener("click", onToggleMic);
    pw.document.getElementById("br")?.addEventListener("click", () => { pw.close(); onReturn(); });
    pw.document.getElementById("bl")?.addEventListener("click", () => { pw.close(); onLeave(); });
    pw.addEventListener("pagehide", onReturn);
    return true;
  } catch { return false; }
}

/* ─── Remote Video PiP ─── */
async function tryVideoPiP(): Promise<boolean> {
  if (!("requestPictureInPicture" in HTMLVideoElement.prototype)) return false;
  const vids = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
  const v = vids.find(v => !v.muted && v.readyState >= 2 && v.videoWidth > 0);
  if (!v) return false;
  if (document.pictureInPictureElement === v) return true;
  try { await v.requestPictureInPicture(); return true; } catch { return false; }
}

/* ─── Canvas PiP pre-handle ─── */
interface PipHandle { video: HTMLVideoElement; stop: () => void; }

function buildCanvasPip(title: string, initial: string): PipHandle | null {
  if (!("requestPictureInPicture" in HTMLVideoElement.prototype)) return null;
  const W = 240, H = 280;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d"); if (!ctx) return null;
  let raf = 0;

  const draw = () => {
    ctx.fillStyle = "#0a1a10"; ctx.fillRect(0, 0, W, H);
    // Gold avatar
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(W/2, 105, 60, 0, Math.PI*2); ctx.fill();
    // Initial
    ctx.fillStyle = DARK; ctx.font = "bold 44px system-ui";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(initial.toUpperCase().slice(0, 2), W/2, 105);
    // Title
    ctx.fillStyle = "#fff"; ctx.font = "bold 14px system-ui";
    ctx.textBaseline = "top";
    const lbl = title.length > 18 ? title.slice(0, 16)+"…" : title;
    ctx.fillText(lbl, W/2, 182);
    // LIVE pulse
    const a = 0.4 + 0.6 * Math.abs(Math.sin(Date.now()/700));
    ctx.fillStyle = `rgba(239,68,68,${a})`;
    ctx.beginPath(); ctx.arc(W/2 - 20, 218, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = `rgba(239,68,68,${a})`;
    ctx.font = "bold 11px system-ui"; ctx.textBaseline = "middle";
    ctx.fillText("LIVE", W/2+4, 218);
    raf = requestAnimationFrame(draw);
  };
  draw();

  const vid = document.createElement("video");
  vid.srcObject = cv.captureStream(8);
  vid.muted = true; vid.playsInline = true;
  // Off-screen — must NOT use display:none or browser blocks PiP
  vid.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;pointer-events:none;opacity:0.01;";
  document.body.appendChild(vid);

  const stop = () => {
    cancelAnimationFrame(raf);
    const s = vid.srcObject as MediaStream | null;
    s?.getTracks().forEach(t => t.stop());
    vid.remove();
    if (document.pictureInPictureElement === vid) document.exitPictureInPicture().catch(() => {});
  };
  vid.addEventListener("leavepictureinpicture", stop);
  return { video: vid, stop };
}

/* ════════════════════════════════════════════════════════════ */
export default function GlobalClassroomOverlay() {
  const {
    activeSubject, inCall, minimized, autoJoin,
    leaveClass, setMinimized,
    micEnabled, camEnabled,
    toggleMicFnRef, toggleCamFnRef,
  } = useLiveClass();

  const title   = activeSubject?.title ?? "Live Class";
  const initial = (activeSubject?.title ?? "L").charAt(0).toUpperCase();

  // Optimistic local state — flip instantly on tap
  const [localMic, setLocalMic] = useState(micEnabled);
  const [localCam, setLocalCam] = useState(camEnabled);
  useEffect(() => setLocalMic(micEnabled), [micEnabled]);
  useEffect(() => setLocalCam(camEnabled), [camEnabled]);

  // Long-press to reveal controls row inside bubble
  const [showControls, setShowControls] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Draggable bubble
  const [pos, setPos] = useState({ right: 16, bottom: 100 });
  const dragRef = useRef({ active: false, sx: 0, sy: 0, sr: 0, sb: 0, moved: false });

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    dragRef.current = { active: true, sx: t.clientX, sy: t.clientY, sr: pos.right, sb: pos.bottom, moved: false };
    longPressTimer.current = setTimeout(() => setShowControls(v => !v), 500);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragRef.current.active) return;
    const t = e.touches[0];
    const dx = t.clientX - dragRef.current.sx;
    const dy = t.clientY - dragRef.current.sy;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      dragRef.current.moved = true;
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    }
    if (!dragRef.current.moved) return;
    e.preventDefault();
    setPos({
      right:  Math.max(8, Math.min(window.innerWidth  - 96, dragRef.current.sr - dx)),
      bottom: Math.max(8, Math.min(window.innerHeight - 140, dragRef.current.sb - dy)),
    });
  };
  const onTouchEnd = () => {
    dragRef.current.active = false;
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  // Canvas PiP handle — pre-built when call starts
  const pipHandle = useRef<PipHandle | null>(null);
  useEffect(() => {
    if (!inCall) { pipHandle.current?.stop(); pipHandle.current = null; return; }
    const h = buildCanvasPip(title, initial);
    if (h) { h.video.play().catch(() => {}); pipHandle.current = h; }
    return () => { pipHandle.current?.stop(); pipHandle.current = null; };
  }, [inCall, title, initial]);

  // Handlers
  const handleReturn = useCallback(() => { setMinimized(false); setShowControls(false); }, [setMinimized]);
  const handleLeave  = useCallback(() => leaveClass(), [leaveClass]);
  const handleToggleMic = useCallback(() => { setLocalMic(v => !v); toggleMicFnRef.current?.(); }, [toggleMicFnRef]);
  const handleToggleCam = useCallback(() => { setLocalCam(v => !v); toggleCamFnRef.current?.(); }, [toggleCamFnRef]);

  // Keep-alive hooks
  useSilentAudio(inCall);
  useWakeLock(inCall);
  useMediaSession(inCall, title, handleReturn, handleLeave);

  // Minimize — fires PiP within user gesture window
  const pipRequestRef = useRef<() => void>(() => {});
  useEffect(() => {
    pipRequestRef.current = () => {
      tryDocumentPiP(title, initial, handleReturn, handleLeave, handleToggleMic, micEnabled)
        .then(ok => { if (ok) return; return tryVideoPiP(); })
        .then(ok => {
          if (ok) return;
          const h = pipHandle.current;
          if (h?.video) h.video.requestPictureInPicture().catch(() => {});
        });
    };
  }, [title, initial, micEnabled, handleReturn, handleLeave, handleToggleMic]);

  const handleMinimize = useCallback(() => {
    setMinimized(true);
    pipRequestRef.current(); // must call within gesture window
  }, [setMinimized]);

  // Clean up PiP when restoring
  useEffect(() => {
    if (!minimized && document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
  }, [minimized]);

  if (!inCall || !activeSubject) return null;

  return (
    <>
      {/* ── Full classroom (always mounted, hidden when minimized) ── */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 8000,
        display: minimized ? "none" : "flex",
        flexDirection: "column",
      }}>
        <ClassroomView
          subject={activeSubject}
          onLeave={leaveClass}
          onMinimize={handleMinimize}
          autoJoin={autoJoin}
        />
      </div>

      {/* ── Draggable floating bubble ─────────────────────────────────
          When minimized in-browser: a small draggable circle.
          Tap  → return to full class
          Long-press → toggle mic/cam/end controls row below bubble  */}
      {minimized && (
        <>
          <style>{`
            @keyframes livering {
              0%   { box-shadow: 0 0 0 0 rgba(239,68,68,.7); }
              70%  { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
              100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
            }
            @keyframes bubIn { from{opacity:0;transform:scale(.7)} to{opacity:1;transform:scale(1)} }
            .pip-bub { animation: bubIn .2s ease; }
            .pip-bub-btn:active { transform:scale(.82) !important; }
          `}</style>

          <div
            className="pip-bub"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{
              position: "fixed",
              right: pos.right,
              bottom: pos.bottom,
              zIndex: 9000,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              touchAction: "none",
              userSelect: "none",
            }}
          >
            {/* ── Controls tray (shown on long-press) ── */}
            {showControls && (
              <div style={{
                display: "flex", flexDirection: "column", gap: 8,
                alignItems: "center",
                background: "rgba(8,25,15,.96)",
                border: "1px solid rgba(201,168,76,.4)",
                borderRadius: 16,
                padding: "10px 8px",
                boxShadow: "0 6px 28px rgba(0,0,0,.7)",
              }}>
                {/* Mic */}
                <button
                  className="pip-bub-btn"
                  onClick={handleToggleMic}
                  style={{
                    width: 44, height: 44, borderRadius: "50%", border: "none", cursor: "pointer",
                    background: localMic ? "rgba(255,255,255,.15)" : "rgba(239,68,68,.25)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "transform .12s",
                  }}
                >
                  {localMic
                    ? <Mic    style={{ width: 16, height: 16, color: "#fff" }} />
                    : <MicOff style={{ width: 16, height: 16, color: RED   }} />}
                </button>
                {/* Cam off (only shown if cam was on) */}
                {localCam && (
                  <button
                    className="pip-bub-btn"
                    onClick={handleToggleCam}
                    style={{
                      width: 44, height: 44, borderRadius: "50%", border: "none", cursor: "pointer",
                      background: "rgba(255,255,255,.15)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "transform .12s",
                    }}
                  >
                    <VideoOff style={{ width: 16, height: 16, color: "#fff" }} />
                  </button>
                )}
                {/* End call */}
                <button
                  className="pip-bub-btn"
                  onClick={handleLeave}
                  style={{
                    width: 44, height: 44, borderRadius: "50%", border: "none", cursor: "pointer",
                    background: "rgba(239,68,68,.2)",
                    border: "1px solid rgba(239,68,68,.4)" as any,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "transform .12s",
                  }}
                >
                  <X style={{ width: 16, height: 16, color: RED }} />
                </button>
              </div>
            )}

            {/* ── Main bubble ── tap = return, long-press = controls ── */}
            <button
              onClick={() => { if (!dragRef.current.moved) handleReturn(); }}
              style={{
                width: 80, height: 80, borderRadius: "50%",
                background: `radial-gradient(circle at 35% 35%, #2a6a3a, ${GREEN})`,
                border: `3px solid ${GOLD}`,
                boxShadow: "0 6px 24px rgba(0,0,0,.6), 0 0 0 0 rgba(239,68,68,.7)",
                animation: "livering 1.8s ease-out infinite",
                cursor: "pointer",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 2,
                position: "relative",
                outline: "none",
              }}
            >
              {/* Initial letter */}
              <span style={{ fontSize: 26, fontWeight: 800, color: GOLD, lineHeight: 1 }}>
                {initial}
              </span>
              {/* LIVE label */}
              <span style={{ fontSize: 8, fontWeight: 800, color: RED, letterSpacing: ".6px" }}>
                LIVE
              </span>
              {/* Mic muted indicator */}
              {!localMic && (
                <div style={{
                  position: "absolute", top: -2, right: -2,
                  width: 22, height: 22, borderRadius: "50%",
                  background: RED, border: "2px solid #fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <MicOff style={{ width: 11, height: 11, color: "#fff" }} />
                </div>
              )}
            </button>
          </div>
        </>
      )}
    </>
  );
}
