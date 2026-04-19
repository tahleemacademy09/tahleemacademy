
/*
  GlobalClassroomOverlay.tsx — Tahleem Academy
  ─────────────────────────────────────────────
  Apr 2026 v5 — Canvas PiP always fires on browser minimize:

  KEY FIX: The OS-level PiP (black window with controls) was only
  showing when camera was on because Chrome auto-enters PiP for
  playing <video> elements. We pre-create an animated canvas stream
  as a hidden <video> with `autopictureinpicture` so Chrome auto-PiPs
  it whenever the page hides — camera on or off.

  We ALSO call requestPictureInPicture() directly inside
  visibilitychange which Chrome allows as a trusted event.

  The canvas design: compact rounded rectangle showing the class
  initial, LIVE pulse, and mic-muted badge. Looks clean in the
  OS PiP window.

  In-browser (tab still open but minimized): draggable bubble.
*/

import { useLiveClass }  from "@/contexts/LiveClassContext";
import ClassroomView      from "@/components/classroom/ClassroomView";
import { Mic, MicOff, X } from "lucide-react";
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
      (["play","pause","stop","previoustrack","nexttrack"] as MediaSessionAction[]).forEach(a => {
        try { navigator.mediaSession.setActionHandler(a, null); } catch {}
      });
    };
  }, [active, title, onReturn, onLeave]);
}

/* ─── Document PiP (Chrome 116+ Android) ─── */
async function tryDocumentPiP(
  title: string, initial: string,
  onReturn: () => void, onLeave: () => void,
  onToggleMic: () => void, micEnabled: boolean,
): Promise<boolean> {
  const dPiP = (window as any).documentPictureInPicture;
  if (!dPiP) return false;
  try {
    const pw: Window = await dPiP.requestWindow({ width: 200, height: 230 });
    const s = pw.document.createElement("style");
    s.textContent = `
      * { box-sizing:border-box;margin:0;padding:0;font-family:system-ui,sans-serif; }
      body { background:#0a1a10;display:flex;align-items:center;justify-content:center;height:100vh; }
      @keyframes p { 0%,100%{opacity:1} 50%{opacity:.2} }
      .c { background:rgba(8,25,15,.98);border:1px solid rgba(201,168,76,.5);border-radius:24px;
           padding:18px 16px;display:flex;flex-direction:column;align-items:center;gap:10px;width:180px; }
      .av { width:62px;height:62px;border-radius:50%;background:#c9a84c;border:2px solid rgba(201,168,76,.3);
            display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:#08190f; }
      .ti { color:#fff;font-size:11px;font-weight:700;text-align:center;max-width:100%;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
      .lv { display:flex;align-items:center;gap:4px; }
      .dot { width:6px;height:6px;border-radius:50%;background:#ef4444;animation:p 1.4s infinite;flex-shrink:0; }
      .lt  { font-size:9px;font-weight:800;color:#ef4444;border:1px solid rgba(239,68,68,.3);
             border-radius:5px;padding:1px 6px; }
      .btns { display:flex;gap:8px;margin-top:4px; }
      .b { width:40px;height:40px;border-radius:50%;border:none;cursor:pointer;font-size:15px;
           display:flex;align-items:center;justify-content:center; }
      .bm-on  { background:rgba(255,255,255,.12); }
      .bm-off { background:rgba(239,68,68,.22); }
      .bg     { background:#c9a84c; }
      .br     { background:rgba(239,68,68,.18);border:1px solid rgba(239,68,68,.35) !important; }
    `;
    pw.document.head.appendChild(s);
    pw.document.body.innerHTML = `
      <div class="c">
        <div class="av">${initial}</div>
        <span class="ti">${title}</span>
        <div class="lv"><span class="dot"></span><span class="lt">LIVE</span></div>
        <div class="btns">
          <button class="b ${micEnabled ? "bm-on" : "bm-off"}" id="bm">${micEnabled ? "🎙️" : "🔇"}</button>
          <button class="b bg" id="bret">⬆</button>
          <button class="b br" id="blv">✕</button>
        </div>
      </div>`;
    pw.document.getElementById("bm")  ?.addEventListener("click", onToggleMic);
    pw.document.getElementById("bret")?.addEventListener("click", () => { pw.close(); onReturn(); });
    pw.document.getElementById("blv") ?.addEventListener("click", () => { pw.close(); onLeave(); });
    pw.addEventListener("pagehide", onReturn);
    return true;
  } catch { return false; }
}

/* ─── Canvas PiP pre-handle ────────────────────────────────────────────
   Creates an animated canvas that renders the class avatar + mic status.
   Captured as a MediaStream → played in a hidden <video> element.

   CRITICAL: sets `autopictureinpicture` so Chrome automatically enters
   PiP whenever the page goes to background — no user gesture needed.
   Also: we re-draw the canvas when micEnabled changes so the icon
   updates live in the PiP window.
*/
interface PipHandle {
  video: HTMLVideoElement;
  setMicMuted: (muted: boolean) => void;
  stop: () => void;
}

function buildCanvasPip(title: string, initial: string): PipHandle | null {
  if (!("requestPictureInPicture" in HTMLVideoElement.prototype)) return null;

  const W = 200, H = 200;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;

  let micMuted = true; // start muted by default
  let raf = 0;

  const draw = () => {
    ctx.clearRect(0, 0, W, H);

    // Dark rounded background
    ctx.fillStyle = "#0c1f12";
    // Rounded rect (r=28)
    const r = 28;
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(W - r, 0);
    ctx.quadraticCurveTo(W, 0, W, r);
    ctx.lineTo(W, H - r);
    ctx.quadraticCurveTo(W, H, W - r, H);
    ctx.lineTo(r, H); ctx.quadraticCurveTo(0, H, 0, H - r);
    ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath(); ctx.fill();

    // Gold border
    ctx.strokeStyle = "rgba(201,168,76,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r, 1); ctx.lineTo(W - r, 1);
    ctx.quadraticCurveTo(W - 1, 1, W - 1, r);
    ctx.lineTo(W - 1, H - r);
    ctx.quadraticCurveTo(W - 1, H - 1, W - r, H - 1);
    ctx.lineTo(r, H - 1); ctx.quadraticCurveTo(1, H - 1, 1, H - r);
    ctx.lineTo(1, r); ctx.quadraticCurveTo(1, 1, r, 1);
    ctx.closePath(); ctx.stroke();

    // Avatar circle (gold)
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(W / 2, 80, 52, 0, Math.PI * 2); ctx.fill();

    // Avatar border
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W / 2, 80, 52, 0, Math.PI * 2); ctx.stroke();

    // Initial letter
    ctx.fillStyle = DARK;
    ctx.font = "bold 40px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(initial.toUpperCase().slice(0, 2), W / 2, 80);

    // Pulsing LIVE dot + text
    const a = 0.45 + 0.55 * Math.abs(Math.sin(Date.now() / 700));
    ctx.fillStyle = `rgba(239,68,68,${a})`;
    ctx.beginPath(); ctx.arc(W / 2 - 20, 148, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(239,68,68,${Math.min(a + 0.2, 1)})`;
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("LIVE", W / 2 + 4, 148);

    // Mic status badge (bottom-right of avatar)
    const bx = W / 2 + 36, by = 108;
    ctx.fillStyle = micMuted ? "rgba(239,68,68,0.9)" : "rgba(40,140,70,0.9)";
    ctx.beginPath(); ctx.arc(bx, by, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(bx, by, 13, 0, Math.PI * 2); ctx.stroke();

    // Mic icon (drawn manually — no SVG in canvas)
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.8;
    ctx.fillStyle = "#fff";
    if (micMuted) {
      // Mic with slash
      ctx.beginPath(); ctx.arc(bx, by - 3, 4, 0, Math.PI * 2);
      ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1;
      // Slash line
      ctx.beginPath();
      ctx.moveTo(bx - 7, by + 7); ctx.lineTo(bx + 7, by - 7);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.2; ctx.stroke();
    } else {
      // Mic body
      ctx.beginPath(); ctx.arc(bx, by - 3, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#fff"; ctx.fill();
      // Stand
      ctx.beginPath();
      ctx.moveTo(bx - 4, by - 2);
      ctx.quadraticCurveTo(bx - 4, by + 4, bx, by + 5);
      ctx.quadraticCurveTo(bx + 4, by + 4, bx + 4, by - 2);
      ctx.stroke();
      // Base line
      ctx.beginPath(); ctx.moveTo(bx, by + 5); ctx.lineTo(bx, by + 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - 3, by + 8); ctx.lineTo(bx + 3, by + 8); ctx.stroke();
    }

    raf = requestAnimationFrame(draw);
  };

  draw();

  const vid = document.createElement("video");
  vid.srcObject = cv.captureStream(10);
  vid.muted = true;
  vid.playsInline = true;

  // ── KEY: autopictureinpicture makes Chrome auto-enter PiP on tab hide ──
  (vid as any).autopictureinpicture = true;
  vid.setAttribute("autopictureinpicture", "");

  // Fully off-screen — CANNOT use display:none (breaks PiP)
  vid.style.cssText = [
    "position:fixed",
    "top:-9999px",
    "left:-9999px",
    "width:2px",
    "height:2px",
    "pointer-events:none",
    "opacity:0.01",
    "z-index:-1",
  ].join(";");

  document.body.appendChild(vid);

  const stop = () => {
    cancelAnimationFrame(raf);
    const s = vid.srcObject as MediaStream | null;
    s?.getTracks().forEach(t => t.stop());
    if (document.pictureInPictureElement === vid) {
      document.exitPictureInPicture().catch(() => {});
    }
    vid.remove();
  };

  vid.addEventListener("leavepictureinpicture", () => {});

  return {
    video: vid,
    setMicMuted: (m: boolean) => { micMuted = m; },
    stop,
  };
}

/* ══════════════════════════════════════════════════════════ */
export default function GlobalClassroomOverlay() {
  const {
    activeSubject, inCall, minimized, autoJoin,
    leaveClass, setMinimized,
    micEnabled, camEnabled,
    toggleMicFnRef, toggleCamFnRef,
  } = useLiveClass();

  const title   = activeSubject?.title ?? "Live Class";
  const initial = (activeSubject?.title ?? "L").charAt(0).toUpperCase();

  // Optimistic local state — flips instantly on tap
  const [localMic, setLocalMic] = useState(micEnabled);
  const [localCam, setLocalCam] = useState(camEnabled);
  useEffect(() => setLocalMic(micEnabled), [micEnabled]);
  useEffect(() => setLocalCam(camEnabled), [camEnabled]);

  // Draggable bubble position
  const [pos, setPos] = useState({ right: 16, bottom: 100 });
  const drag = useRef({ active: false, sx: 0, sy: 0, sr: 0, sb: 0, moved: false });
  const [showControls, setShowControls] = useState(false);
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    drag.current = { active: true, sx: t.clientX, sy: t.clientY, sr: pos.right, sb: pos.bottom, moved: false };
    longTimer.current = setTimeout(() => setShowControls(v => !v), 480);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!drag.current.active) return;
    const t = e.touches[0];
    const dx = t.clientX - drag.current.sx, dy = t.clientY - drag.current.sy;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      drag.current.moved = true;
      if (longTimer.current) { clearTimeout(longTimer.current); longTimer.current = null; }
    }
    if (!drag.current.moved) return;
    e.preventDefault();
    setPos({
      right:  Math.max(8, Math.min(window.innerWidth  - 96, drag.current.sr - dx)),
      bottom: Math.max(8, Math.min(window.innerHeight - 150, drag.current.sb - dy)),
    });
  };
  const onTouchEnd = () => {
    drag.current.active = false;
    if (longTimer.current) { clearTimeout(longTimer.current); longTimer.current = null; }
  };

  // Canvas PiP handle
  const pipHandle = useRef<PipHandle | null>(null);

  useEffect(() => {
    if (!inCall) { pipHandle.current?.stop(); pipHandle.current = null; return; }
    const h = buildCanvasPip(title, initial);
    if (h) {
      // play() must be called ASAP so Chrome sees it as an active video
      h.video.play().catch(() => {});
      pipHandle.current = h;
    }
    return () => { pipHandle.current?.stop(); pipHandle.current = null; };
  }, [inCall, title, initial]);

  // Keep mic-muted state in sync with canvas so badge updates
  useEffect(() => {
    pipHandle.current?.setMicMuted(!localMic);
  }, [localMic]);

  // ── AUTO-ENTER PiP when tab is hidden ────────────────────────────────
  // visibilitychange is a trusted event — requestPictureInPicture() is allowed
  useEffect(() => {
    if (!inCall) return;
    const onHide = async () => {
      if (document.visibilityState !== "hidden") return;
      const h = pipHandle.current;
      if (!h?.video) return;
      // Only request if not already in PiP
      if (document.pictureInPictureElement) return;
      try {
        await h.video.requestPictureInPicture();
      } catch {
        // Silently fail — autopictureinpicture handles the rest
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [inCall]);

  // Handlers
  const handleReturn = useCallback(() => { setMinimized(false); setShowControls(false); }, [setMinimized]);
  const handleLeave  = useCallback(() => leaveClass(), [leaveClass]);

  const handleToggleMic = useCallback(() => {
    setLocalMic(v => !v);
    toggleMicFnRef.current?.();
  }, [toggleMicFnRef]);

  const handleToggleCam = useCallback(() => {
    setLocalCam(v => !v);
    toggleCamFnRef.current?.();
  }, [toggleCamFnRef]);

  // Keep-alive hooks
  useSilentAudio(inCall);
  useWakeLock(inCall);
  useMediaSession(inCall, title, handleReturn, handleLeave);

  // PiP request helper (for in-app minimize button)
  const pipReqRef = useRef<() => void>(() => {});
  useEffect(() => {
    pipReqRef.current = () => {
      tryDocumentPiP(title, initial, handleReturn, handleLeave, handleToggleMic, micEnabled)
        .then(ok => {
          if (ok) return;
          // Remote video PiP (avoids inverted self-view)
          const vids = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
          const remote = vids.find(v => !v.muted && v.readyState >= 2 && v.videoWidth > 0 && v !== pipHandle.current?.video);
          if (remote) { remote.requestPictureInPicture().catch(() => {}); return; }
          // Canvas PiP
          const h = pipHandle.current;
          if (h?.video) h.video.requestPictureInPicture().catch(() => {});
        });
    };
  }, [title, initial, micEnabled, handleReturn, handleLeave, handleToggleMic]);

  const handleMinimize = useCallback(() => {
    setMinimized(true);
    pipReqRef.current(); // within user-gesture window
  }, [setMinimized]);

  // Exit PiP when returning to full class
  useEffect(() => {
    if (!minimized && document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
  }, [minimized]);

  if (!inCall || !activeSubject) return null;

  return (
    <>
      {/* Full classroom — hidden but running when minimized */}
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

      {/* ── Draggable in-browser bubble ── */}
      {minimized && (
        <>
          <style>{`
            @keyframes livering {
              0%   { box-shadow: 0 0 0 0 rgba(239,68,68,.75), 0 6px 20px rgba(0,0,0,.55); }
              70%  { box-shadow: 0 0 0 9px rgba(239,68,68,0), 0 6px 20px rgba(0,0,0,.55); }
              100% { box-shadow: 0 0 0 0 rgba(239,68,68,0), 0 6px 20px rgba(0,0,0,.55); }
            }
            @keyframes bub-in { from{opacity:0;transform:scale(.65)} to{opacity:1;transform:scale(1)} }
            .pip-bub { animation: bub-in .22s cubic-bezier(.34,1.56,.64,1); }
            .pip-ctrl-btn:active { opacity:.7; transform:scale(.84) !important; }
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
            {/* Controls tray — shown on long-press */}
            {showControls && (
              <div style={{
                background: "rgba(8,25,15,.97)",
                border: "1px solid rgba(201,168,76,.4)",
                borderRadius: 18,
                padding: "10px 8px",
                display: "flex", flexDirection: "column",
                alignItems: "center", gap: 8,
                boxShadow: "0 8px 28px rgba(0,0,0,.7)",
              }}>
                {/* Mic toggle */}
                <button
                  className="pip-ctrl-btn"
                  onClick={handleToggleMic}
                  style={{
                    width: 44, height: 44, borderRadius: "50%", border: "none", cursor: "pointer",
                    background: localMic ? "rgba(255,255,255,.14)" : "rgba(239,68,68,.28)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "transform .12s",
                  }}
                >
                  {localMic
                    ? <Mic    style={{ width: 16, height: 16, color: "#fff" }} />
                    : <MicOff style={{ width: 16, height: 16, color: RED   }} />}
                </button>
                {/* End call */}
                <button
                  className="pip-ctrl-btn"
                  onClick={handleLeave}
                  style={{
                    width: 44, height: 44, borderRadius: "50%", border: "none", cursor: "pointer",
                    background: "rgba(239,68,68,.22)",
                    border: "1px solid rgba(239,68,68,.45)" as any,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "transform .12s",
                  }}
                >
                  <X style={{ width: 16, height: 16, color: RED }} />
                </button>
              </div>
            )}

            {/* Main bubble — tap = return */}
            <button
              onClick={() => { if (!drag.current.moved) handleReturn(); }}
              style={{
                width: 80, height: 80, borderRadius: "50%",
                background: `radial-gradient(circle at 38% 35%, #2a6a3a, ${GREEN})`,
                border: `3px solid ${GOLD}`,
                cursor: "pointer", outline: "none",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 2, position: "relative",
                animation: "livering 1.8s ease-out infinite",
              }}
            >
              <span style={{ fontSize: 26, fontWeight: 800, color: GOLD, lineHeight: 1 }}>
                {initial}
              </span>
              <span style={{ fontSize: 8, fontWeight: 800, color: RED, letterSpacing: ".6px" }}>
                LIVE
              </span>
              {/* Mic muted badge */}
              {!localMic && (
                <div style={{
                  position: "absolute", top: -2, right: -2,
                  width: 22, height: 22, borderRadius: "50%",
                  background: RED, border: "2px solid #fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <MicOff style={{ width: 10, height: 10, color: "#fff" }} />
                </div>
              )}
            </button>
          </div>
        </>
      )}
    </>
  );
}
