/*
  GlobalClassroomOverlay.tsx — Tahleem Academy
  ─────────────────────────────────────────────
  Rendered at App root level (outside all page routing).
  This means the call NEVER unmounts when you navigate —
  the ClassroomView stays mounted and connected even if
  you go to Dashboard, Majlis, or anywhere else.

  When minimized (within the browser):
  - A floating pill overlay appears on every page
  - Shows mic + camera toggle buttons regardless of whether video is on
  - The full ClassroomView is hidden (display:none) but still running
  - Clicking the expand icon brings the full view back (NOT the lobby!)
  - Clicking X on the pill ends the call

  When the browser itself is backgrounded / home screen shown:
  - Document PiP (Chrome 116+): a real floating mini-window hovers
    over the home screen showing the live indicator and controls.
  - Video PiP fallback: the teacher/student video floats on-screen.
  - MediaSession: controls + subject name appear in the notification
    bar and on the lock screen.
  - Wake Lock: prevents the screen sleeping mid-class.
  - Silent audio keep-alive: prevents Chrome from fully suspending
    the WebRTC connection when the tab is backgrounded.

  Persistence:
  - If the page is refreshed while in a call, LiveClassContext restores
    from sessionStorage and sets autoJoin=true, which tells ClassroomView
    to skip the lobby and connect immediately.
*/

import { useLiveClass } from "@/contexts/LiveClassContext";
import ClassroomView from "@/components/classroom/ClassroomView";
import { Maximize2, X, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useEffect, useRef, useCallback } from "react";

const GOLD  = "#c9a84c";
const DARK  = "#08190f";
const RED   = "#ef4444";

/* ─── silent audio node — keeps Chrome from suspending WebRTC ─── */
function useSilentAudioKeepAlive(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!active) {
      ctxRef.current?.close();
      ctxRef.current = null;
      return;
    }
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

    return () => {
      ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, [active]);
}

/* ─── screen wake lock ─── */
function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  const request = useCallback(async () => {
    if (!active || !("wakeLock" in navigator)) return;
    try {
      lockRef.current = await navigator.wakeLock.request("screen");
    } catch (_) {}
  }, [active]);

  useEffect(() => {
    if (!active) {
      lockRef.current?.release();
      lockRef.current = null;
      return;
    }
    request();
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lockRef.current?.release();
      lockRef.current = null;
    };
  }, [active, request]);
}

/* ─── MediaSession ─── */
function useMediaSession(active: boolean, title: string, onReturn: () => void, onLeave: () => void) {
  useEffect(() => {
    if (!active || !("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: "Tahleem Academy — Live Class",
      album: "🟢 Class in progress",
    });
    navigator.mediaSession.playbackState = "playing";

    const setAction = (action: MediaSessionAction, handler: () => void) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch (_) {}
    };

    setAction("play",          onReturn);
    setAction("pause",         onReturn);
    setAction("stop",          onLeave);
    setAction("previoustrack", onReturn);
    setAction("nexttrack",     onReturn);

    return () => {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      (["play","pause","stop","previoustrack","nexttrack"] as MediaSessionAction[])
        .forEach(a => { try { navigator.mediaSession.setActionHandler(a, null); } catch (_) {} });
    };
  }, [active, title, onReturn, onLeave]);
}

/* ─── Document Picture-in-Picture ─── */
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
      * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, sans-serif; }
      body { background: transparent; overflow: hidden; }
      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.25} }
      .pill {
        background: rgba(8,25,15,.97);
        border: 1px solid rgba(201,168,76,.5);
        border-radius: 50px;
        padding: 10px 14px;
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        height: 80px;
        box-shadow: 0 4px 24px rgba(0,0,0,.8);
      }
      .dot { width:9px;height:9px;border-radius:50%;background:#ef4444;animation:pulse 1.4s ease-in-out infinite;flex-shrink:0; }
      .name { color:#fff;font-size:12px;font-weight:700;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
      .live { font-size:10px;font-weight:800;color:#ef4444;border:1px solid rgba(239,68,68,.35);border-radius:7px;padding:2px 7px;flex-shrink:0; }
      .btn { width:34px;height:34px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:15px; }
      .btn-mic-on  { background:rgba(255,255,255,0.12); }
      .btn-mic-off { background:rgba(239,68,68,0.22); }
      .btn-cam-on  { background:rgba(255,255,255,0.12); }
      .btn-cam-off { background:rgba(239,68,68,0.22); }
      .btn-return  { background:#c9a84c; }
      .btn-leave   { background:rgba(239,68,68,.2);border:1px solid rgba(239,68,68,.4); }
    `;
    pipWin.document.head.appendChild(style);

    pipWin.document.body.innerHTML = `
      <div class="pill">
        <span class="dot"></span>
        <span class="name">${title}</span>
        <span class="live">LIVE</span>
        <button class="btn ${micEnabled ? "btn-mic-on" : "btn-mic-off"}" id="btn-mic" title="${micEnabled ? "Mute mic" : "Unmute mic"}">${micEnabled ? "🎙️" : "🔇"}</button>
        <button class="btn ${camEnabled ? "btn-cam-on" : "btn-cam-off"}" id="btn-cam" title="${camEnabled ? "Turn off camera" : "Turn on camera"}">${camEnabled ? "📹" : "📷"}</button>
        <button class="btn btn-return" id="btn-return" title="Return to class">⬆</button>
        <button class="btn btn-leave"  id="btn-leave"  title="Leave class">✕</button>
      </div>
    `;

    pipWin.document.getElementById("btn-mic")?.addEventListener("click", () => { onToggleMic(); });
    pipWin.document.getElementById("btn-cam")?.addEventListener("click", () => { onToggleCam(); });
    pipWin.document.getElementById("btn-return")?.addEventListener("click", () => { pipWin.close(); onReturn(); });
    pipWin.document.getElementById("btn-leave")?.addEventListener("click", () => { pipWin.close(); onLeave(); });
    pipWin.addEventListener("pagehide", onReturn);

    return true;
  } catch (_) {
    return false;
  }
}

async function tryVideoPiP(): Promise<boolean> {
  const videos = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
  const remote = videos.find(v => !v.muted && v.readyState >= 2);
  const any    = videos.find(v => v.readyState >= 2);
  const target = remote || any;

  if (!target || !("requestPictureInPicture" in target)) return false;
  if (document.pictureInPictureElement === target) return true;

  try {
    await target.requestPictureInPicture();
    return true;
  } catch (_) {
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

  const handleReturn    = useCallback(() => setMinimized(false),      [setMinimized]);
  const handleLeave     = useCallback(() => leaveClass(),              [leaveClass]);
  const handleToggleMic = useCallback(() => toggleMicFnRef.current?.(), [toggleMicFnRef]);
  const handleToggleCam = useCallback(() => toggleCamFnRef.current?.(), [toggleCamFnRef]);

  /* Keep-alive hooks */
  useSilentAudioKeepAlive(inCall);
  useWakeLock(inCall);
  useMediaSession(inCall, title, handleReturn, handleLeave);

  /* Enter PiP when minimized; exit when restored */
  useEffect(() => {
    if (!inCall) return;

    if (minimized) {
      tryDocumentPiP(title, handleReturn, handleLeave, handleToggleMic, handleToggleCam, micEnabled, camEnabled)
        .then(ok => { if (!ok) tryVideoPiP(); });
    } else {
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      }
    }
  }, [minimized, inCall, title, handleReturn, handleLeave, handleToggleMic, handleToggleCam, micEnabled, camEnabled]);

  /* Clean up PiP on call end */
  useEffect(() => {
    if (!inCall && document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
  }, [inCall]);

  if (!inCall || !activeSubject) return null;

  /* ── Button style helper ── */
  const pillBtn = (active: boolean, danger = false): React.CSSProperties => ({
    width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer",
    flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
    background: danger
      ? active ? "rgba(239,68,68,0.18)" : "rgba(239,68,68,0.18)"
      : active ? "rgba(255,255,255,0.14)" : "rgba(239,68,68,0.22)",
    transition: "background .15s, transform .15s",
  });

  return (
    <>
      {/* Full classroom — always mounted while inCall=true, hidden when minimized */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 8000,
          display: minimized ? "none" : "flex",
          flexDirection: "column",
        }}
      >
        <ClassroomView
          subject={activeSubject}
          onLeave={leaveClass}
          onMinimize={() => setMinimized(true)}
          autoJoin={autoJoin}
        />
      </div>

      {/* ── In-browser minimized pill ──
          Shown whenever the call is minimized within the browser tab.
          Includes mic + camera toggles so you can mute without returning. */}
      {minimized && (
        <>
          <style>{`
            @keyframes livePulse  { 0%,100%{opacity:1} 50%{opacity:.3} }
            @keyframes pipSlideUp { from{transform:translateX(-50%) translateY(20px);opacity:0} to{transform:translateX(-50%) translateY(0);opacity:1} }
            .pip-pill-btn:active { transform: scale(0.9) !important; }
          `}</style>
          <div
            style={{
              position: "fixed",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 9000,
              background: "rgba(8,25,15,.97)",
              border: "1px solid rgba(201,168,76,.45)",
              borderRadius: 50,
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: "0 8px 40px rgba(0,0,0,.75), 0 0 0 1px rgba(201,168,76,.15)",
              animation: "pipSlideUp .3s ease",
              minWidth: 330,
              maxWidth: "94vw",
              fontFamily: "'Cairo', sans-serif",
            }}
          >
            {/* Live pulse dot */}
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

            {/* LIVE label */}
            <span style={{
              fontSize: 10, fontWeight: 800, color: RED,
              background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.3)",
              borderRadius: 8, padding: "2px 7px", letterSpacing: ".5px", flexShrink: 0,
            }}>
              LIVE
            </span>

            {/* ── Mic toggle ── */}
            <button
              className="pip-pill-btn"
              onClick={handleToggleMic}
              title={micEnabled ? "Mute microphone" : "Unmute microphone"}
              style={pillBtn(micEnabled)}
              onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.1)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
            >
              {micEnabled
                ? <Mic    style={{ width: 14, height: 14, color: "#fff" }} />
                : <MicOff style={{ width: 14, height: 14, color: RED   }} />}
            </button>

            {/* ── Camera toggle ── */}
            <button
              className="pip-pill-btn"
              onClick={handleToggleCam}
              title={camEnabled ? "Turn off camera" : "Turn on camera"}
              style={pillBtn(camEnabled)}
              onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.1)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
            >
              {camEnabled
                ? <Video    style={{ width: 14, height: 14, color: "#fff" }} />
                : <VideoOff style={{ width: 14, height: 14, color: RED   }} />}
            </button>

            {/* ── Expand (return to class) ── */}
            <button
              className="pip-pill-btn"
              onClick={handleReturn}
              title="Return to class"
              style={{
                width: 36, height: 36, borderRadius: "50%", background: GOLD,
                border: "none", display: "flex", alignItems: "center",
                justifyContent: "center", cursor: "pointer", flexShrink: 0,
                boxShadow: "0 2px 12px rgba(201,168,76,.45)", transition: "transform .15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.1)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
            >
              <Maximize2 style={{ width: 14, height: 14, color: DARK }} />
            </button>

            {/* ── End call ── */}
            <button
              className="pip-pill-btn"
              onClick={handleLeave}
              title="Leave class"
              style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "rgba(239,68,68,.18)", border: "1px solid rgba(239,68,68,.45)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0, transition: "background .15s, transform .15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,.4)"; e.currentTarget.style.transform = "scale(1.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,.18)"; e.currentTarget.style.transform = "scale(1)"; }}
            >
              <X style={{ width: 14, height: 14, color: RED }} />
            </button>
          </div>
        </>
      )}
    </>
  );
}
