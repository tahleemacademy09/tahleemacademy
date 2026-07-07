/*
  GuestClassroom.tsx — Tahleem Academy Public Live Class
  ──────────────────────────────────────────────────────
  WhatsApp-call-style background behaviour:
  • Canvas PiP (Picture-in-Picture) fires automatically when:
      - user presses the Minimize button
      - user presses the Android Back button
      - screen turns off / browser is sent to background
  • Audio keeps playing via silent AudioContext keep-alive
  • MediaSession exposes lock-screen controls (return / leave)
  • Wake-lock prevents screen sleeping mid-class
  • Auto-reconnect: up to 5 attempts, progressive back-off
  • Top bar: compact mobile layout — no overflow/overlap
  
  Fixes:
  • Leave/End button in header — sets intentional flag BEFORE disconnect
  • LiveKit default leave button is hidden (it reconnects without the flag)
  • Participant count badge in header
  • Join/leave chime sounds (Web Audio API — no external file needed)
  • Participant join toast notification
*/

import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  LiveKitRoom, VideoConference, RoomAudioRenderer, useRoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track, ConnectionState, RoomEvent, Participant, ConnectionQuality } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import {
  UserPlus, Radio, Circle, Loader2,
  Mic, Pause, Play, Square, X, Phone,
  Hand, Smile, MoreVertical, RefreshCw, Users, LogOut,
} from "lucide-react";
import ClassChatPanel    from "@/components/classroom/ClassChatPanel";
import ClassPolls        from "@/components/classroom/ClassPolls";
import ClassParticipants from "@/components/classroom/ClassParticipants";
import ClassControls     from "@/components/classroom/ClassControls";
import LiveQuizOverlay   from "@/components/classroom/LiveQuizOverlay";
import { useIsMobile }   from "@/hooks/use-mobile";


/* ════════════════════════════════════════════════════════
   STYLES
   ════════════════════════════════════════════════════════ */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap');

  @keyframes gc-spin      { to { transform:rotate(360deg); } }
  @keyframes gc-pulse     { 0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.82)} }
  @keyframes gc-rec-pulse { 0%,100%{opacity:1}50%{opacity:.25} }
  @keyframes gc-fade-up   { from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)} }
  @keyframes gc-slide-up   { from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1} }
  @keyframes gc-emoji-float { 0%{transform:translateY(0) scale(1);opacity:1}70%{opacity:.9}100%{transform:translateY(-280px) scale(1.3);opacity:0} }
  @keyframes gc-hand-bounce { 0%,100%{transform:translateY(0)}45%{transform:translateY(-5px)} }
  @keyframes gc-bounce-in { 0%{transform:scale(.82);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1} }
  @keyframes gc-toast-in  { from{opacity:0;transform:translateY(-14px) scale(.94)}to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes gc-toast-out { from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-8px)} }

  [data-gc-root] {
    font-family:'Google Sans','Roboto',sans-serif;
    -webkit-font-smoothing:antialiased;
    overscroll-behavior:none;
    -webkit-overflow-scrolling:touch;
    touch-action:pan-y;
    padding-bottom:env(safe-area-inset-bottom,0px);
  }
  [data-gc-root] * { box-sizing:border-box; }
  [data-gc-root] button {
    -webkit-tap-highlight-color:transparent;
    touch-action:manipulation;
    font-family:'Google Sans','Roboto',sans-serif;
  }

  /* Badge pill */
  .gc-pill {
    display:inline-flex; align-items:center; gap:4px;
    padding:4px 8px; border-radius:20px;
    font-size:11px; font-weight:600; white-space:nowrap; flex-shrink:0;
    font-family:'Google Sans',sans-serif;
  }

  /* Sidebar */
  .gc-sidebar {
    width:280px; display:flex; flex-direction:column;
    background:rgba(32,33,36,.97);
    border-left:1px solid rgba(255,255,255,.07);
    flex-shrink:0; animation:gc-slide-up .22s ease;
  }

  /* Reconnect overlay */
  .gc-reconnect-overlay {
    position:absolute; inset:0; z-index:200;
    background:rgba(32,33,36,.92); backdrop-filter:blur(12px);
    display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:16px;
    animation:gc-fade-up .2s ease;
  }

  /* LK theme override — hide the default leave/disconnect button */
  [data-lk-theme] { height:100%!important; display:flex!important; flex-direction:column!important; }
  .lk-video-conference { height:100%!important; }
  .lk-disconnect-button { display:none!important; }

  /* LK control bar */
  .lk-control-bar {
    border-top: 1px solid rgba(255,255,255,.08) !important;
    background: rgba(22,23,25,.98) !important;
    backdrop-filter: blur(16px) !important;
    padding: 10px 118px 10px 16px !important;
    padding-bottom: calc(10px + env(safe-area-inset-bottom,0px)) !important;
    gap: 10px !important;
    position: relative !important;
  }

  /* Mic and Camera split-button groups — dark pill background like image 3 */
  .lk-button-group {
    background: rgba(255,255,255,.1) !important;
    border-radius: 24px !important;
    overflow: visible !important;
  }
  .lk-button-group .lk-button {
    background: transparent !important;
    border-radius: 24px !important;
  }
  .lk-button-group .lk-button:hover {
    background: rgba(255,255,255,.08) !important;
  }

  /* All other standalone buttons in the control bar */
  .lk-control-bar > .lk-button {
    background: rgba(255,255,255,.08) !important;
    border-radius: 24px !important;
    padding: 10px 14px !important;
  }
  .lk-control-bar > .lk-button:hover {
    background: rgba(255,255,255,.14) !important;
  }

  /* ── Fix: tile containers — LiveKit forces aspect-ratio:16/9 which
     letterboxes portrait phone video. Strip it so tiles fill freely. ── */
  .lk-grid-layout,
  .lk-focus-layout {
    width: 100% !important;
    height: 100% !important;
  }
  .lk-participant-tile {
    overflow: hidden !important;
    aspect-ratio: unset !important;
    width: 100% !important;
  }

  /* ── Fix: videos fill their tile with no black bars ── */
  .lk-participant-tile video,
  .lk-grid-layout video,
  .lk-focus-layout video,
  .lk-video-conference video {
    object-fit: cover !important;
    width: 100% !important;
    height: 100% !important;
  }

  /* ── CSS baseline: strip mirror from all tiles.
     The MutationObserver sets per-tile inline !important which wins. ── */
  .lk-participant-tile video {
    transform: none !important;
    -webkit-transform: none !important;
  }
`;

/* ════════════════════════════════════════════════════════
   HOOKS
   (Canvas PiP removed — background keep-alive only)
   ════════════════════════════════════════════════════════ */

interface PipHandle {
  stop:        () => void;
  pip:         () => Promise<void>;
  setMicMuted: (v: boolean) => void;
  setInitial:  (v: string)  => void;
}
// Canvas PiP removed — always returns null.
function buildCanvasPip(_a: string, _b: string, _c: () => void): PipHandle | null { return null; }


/* ════════════════════════════════════════════════════════
   HOOKS
   ════════════════════════════════════════════════════════ */
/* ─────────────────────────────────────────────────────────────────────────────
   BACKGROUND AUDIO KEEP-ALIVE
   ─────────────────────────────────────────────────────────────────────────────
   Strategy (layered — each layer adds resilience):

   Layer 1 — <audio> element with a looping 1-second near-silence WAV (data URI).
     Browsers (Chrome Android, Safari iOS) treat a playing <audio> element as
     "active media" and keep the JS thread alive through screen lock.
     The WAV is 1 s of silence at 8 kHz mono — tiny, no perceptible sound.

   Layer 2 — AudioContext oscillator at 1 Hz, gain=0.
     Creates a Web Audio graph the browser marks as "active audio output",
     giving a second keep-alive signal independent of the <audio> element.

   Layer 3 — setInterval heartbeat every 20 s.
     Forces the JS event loop to tick even if the browser throttles timers.
     On Chrome Android, throttled timers fire at ~1 min intervals instead of
     the set interval; 20 s is low enough that we get at least one tick per
     throttling window, which is enough to keep WebRTC ICE alive.

   Layer 4 — visibilitychange / pageshow resume.
     When the user returns from lock screen, immediately resume the AudioContext
     and restart the <audio> element if it paused.

   WHY NOT JUST WAKE LOCK?
     Screen Wake Lock (navigator.wakeLock) only prevents the screen from
     dimming while the page is visible. Once the user manually locks the
     phone the lock is released by the OS — we cannot prevent that.
     The audio keep-alive approach works *after* the screen locks because it
     piggybacks on the same mechanism music/podcast apps use.

   iOS CAVEAT:
     Safari on iOS 16+ allows background audio from a playing <audio> element
     but requires the AudioContext to be resumed inside a user-gesture handler.
     We prime it on the first touch/click (see primeAudioContext below).
     Background WebRTC audio (LiveKit) continues because the audio track itself
     keeps the RTCPeerConnection alive on iOS.
   ─────────────────────────────────────────────────────────────────────────── */

// 1-second near-silence WAV, 8 kHz mono, 16-bit PCM — base64 encoded.
// Generating inline avoids any network fetch.
const SILENCE_WAV =
  "data:audio/wav;base64," +
  "UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

function useSilentAudio(active: boolean) {
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const acRef      = useRef<AudioContext | null>(null);
  const oscRef     = useRef<OscillatorNode | null>(null);
  const gainRef    = useRef<GainNode | null>(null);
  const hbRef      = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      // ── Teardown ──────────────────────────────────────────────────────
      if (hbRef.current)    { clearInterval(hbRef.current); hbRef.current = null; }
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current.src = "";
        audioElRef.current = null;
      }
      try { oscRef.current?.stop(); } catch {}
      oscRef.current = null; gainRef.current = null;
      acRef.current?.close().catch(() => {});
      acRef.current = null;
      return;
    }

    // ── Layer 1: <audio> element ──────────────────────────────────────
    const startAudioEl = () => {
      if (audioElRef.current) return;
      try {
        const el = new Audio(SILENCE_WAV);
        el.loop    = true;
        el.volume  = 0.001;          // near-silent but not muted (muted = no keep-alive)
        el.play().catch(() => {});   // may be blocked until user gesture — Layer 4 retries
        audioElRef.current = el;
      } catch {}
    };

    // ── Layer 2: AudioContext oscillator at 1 Hz, gain = 0 ───────────
    const startAC = () => {
      if (acRef.current && acRef.current.state !== "closed") return;
      try {
        const AC  = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AC();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 1;     // 1 Hz — inaudible
        gain.gain.value     = 0;     // gain 0 = silent
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        acRef.current  = ctx;
        oscRef.current = osc;
        gainRef.current = gain;
      } catch {}
    };

    startAudioEl();
    startAC();

    // ── Layer 3: heartbeat every 20 s ─────────────────────────────────
    hbRef.current = setInterval(() => {
      // Ping the AudioContext to keep it alive
      const ctx = acRef.current;
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
      // Restart audio element if it paused (e.g. after OS audio interruption)
      const el = audioElRef.current;
      if (el && el.paused) el.play().catch(() => {});
    }, 20_000);

    // ── Layer 4: resume on visibility / page show ─────────────────────
    const resume = () => {
      // Re-start audio element regardless of visibility state
      // (visibilitychange fires "visible" when user returns from lock screen)
      const el = audioElRef.current;
      if (!el) { startAudioEl(); }
      else if (el.paused) { el.play().catch(() => {}); }

      const ctx = acRef.current;
      if (!ctx || ctx.state === "closed") { startAC(); return; }
      if (ctx.state === "suspended")      { ctx.resume().catch(() => {}); }
    };

    document.addEventListener("visibilitychange", resume);
    document.addEventListener("pageshow",         resume);
    window.addEventListener("focus",              resume);

    return () => {
      document.removeEventListener("visibilitychange", resume);
      document.removeEventListener("pageshow",         resume);
      window.removeEventListener("focus",              resume);
      if (hbRef.current) { clearInterval(hbRef.current); hbRef.current = null; }
      audioElRef.current?.pause();
      if (audioElRef.current) { audioElRef.current.src = ""; audioElRef.current = null; }
      try { oscRef.current?.stop(); } catch {}
      acRef.current?.close().catch(() => {});
    };
  }, [active]);
}

function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  const request = useCallback(async () => {
    if (!active || !("wakeLock" in navigator)) return;
    // Release any stale sentinel first
    try { await lockRef.current?.release(); } catch {}
    lockRef.current = null;
    try { lockRef.current = await navigator.wakeLock.request("screen"); } catch {}
  }, [active]);

  useEffect(() => {
    if (!active) {
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
      return;
    }
    request();
    // Re-request whenever the page becomes visible (screen unlock, tab switch back)
    const fn = () => { if (document.visibilityState === "visible") request(); };
    document.addEventListener("visibilitychange", fn);
    document.addEventListener("pageshow",         fn);
    return () => {
      document.removeEventListener("visibilitychange", fn);
      document.removeEventListener("pageshow",         fn);
      lockRef.current?.release().catch(() => {});
    };
  }, [active, request]);
}

function useMediaSession(active: boolean, title: string, onReturn: () => void, onLeave: () => void) {
  useEffect(() => {
    if (!active || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: "Tahleem Academy",
      album: "🟢 Live Class",
      // artwork helps iOS/Android show the notification with an icon
      artwork: [
        { src: "/brand-logo.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
      ],
    });
    navigator.mediaSession.playbackState = "playing";
    const sa = (a: MediaSessionAction, h: () => void) => { try { navigator.mediaSession.setActionHandler(a, h); } catch {} };
    // Map all media actions to "return to class" — this is what shows on lock screen
    sa("play",          onReturn);
    sa("pause",         onReturn);
    sa("stop",          onLeave);
    sa("previoustrack", onReturn);
    sa("nexttrack",     onReturn);
    // seekto / seekbackward / seekforward — keep alive by doing nothing
    try { navigator.mediaSession.setActionHandler("seekto",       () => {}); } catch {}
    try { navigator.mediaSession.setActionHandler("seekbackward", () => {}); } catch {}
    try { navigator.mediaSession.setActionHandler("seekforward",  () => {}); } catch {}
    return () => {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      (["play","pause","stop","previoustrack","nexttrack","seekto","seekbackward","seekforward"] as MediaSessionAction[])
        .forEach(a => { try { navigator.mediaSession.setActionHandler(a, null); } catch {} });
    };
  }, [active, title, onReturn, onLeave]);
}

/* ════════════════════════════════════════════════════════
   CHIME — synthesised Google Meet-style join/leave sound
   Shared AudioContext — primed on first user gesture so
   it works after mobile browser autoplay policy.
   ════════════════════════════════════════════════════════ */
let _sharedAC: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!_sharedAC || _sharedAC.state === "closed") _sharedAC = new AC();
    return _sharedAC;
  } catch { return null; }
}
function primeAudioContext() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}
if (typeof document !== "undefined") {
  ["touchstart", "touchend", "click", "keydown"].forEach(ev => {
    document.addEventListener(ev, primeAudioContext, { once: false, passive: true, capture: true });
  });
}

function playChime(type: "join" | "leave") {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const resume = ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
    resume.then(() => {
      const master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
      const notes = type === "join"
        ? [{ freq:880, start:0, dur:0.12 }, { freq:1046, start:0.10, dur:0.18 }]
        : [{ freq:880, start:0, dur:0.12 }, { freq:698, start:0.10, dur:0.18 }];
      notes.forEach(({ freq, start, dur }) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(1, ctx.currentTime + start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.connect(gain); gain.connect(master);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur + 0.05);
      });
    }).catch(() => {});
  } catch {}
}

/* ════════════════════════════════════════════════════════
   CONNECTION QUALITY INDICATOR (inside LiveKitRoom)
   ════════════════════════════════════════════════════════ */
const ConnectionIndicator = () => {
  const room = useRoomContext();
  const [quality, setQuality] = useState<"excellent"|"good"|"fair"|"poor">("good");
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    // RoomEvent.ConnectionQualityChanged fires with (quality: ConnectionQuality, participant: Participant)
    const syncQ = (q: ConnectionQuality, participant: Participant) => {
      if (participant.identity !== room.localParticipant.identity) return;
      setQuality(
        q === ConnectionQuality.Excellent ? "excellent" :
        q === ConnectionQuality.Good      ? "good"      :
        q === ConnectionQuality.Poor      ? "poor"      : "fair"
      );
    };
    // Also poll from localParticipant directly as fallback
    const pollQ = () => {
      const q = room.localParticipant.connectionQuality;
      setQuality(
        q === ConnectionQuality.Excellent ? "excellent" :
        q === ConnectionQuality.Good      ? "good"      :
        q === ConnectionQuality.Poor      ? "poor"      : "good"
      );
    };
    const syncS = (s: ConnectionState) => setReconnecting(s === ConnectionState.Reconnecting);
    room.on(RoomEvent.ConnectionQualityChanged, syncQ);
    room.on(RoomEvent.ConnectionStateChanged, syncS);
    const iv = setInterval(pollQ, 3000);
    pollQ();
    return () => {
      room.off(RoomEvent.ConnectionQualityChanged, syncQ);
      room.off(RoomEvent.ConnectionStateChanged, syncS);
      clearInterval(iv);
    };
  }, [room]);

  if (reconnecting) return (
    <div style={{ display:"flex", alignItems:"center", gap:3 }}>
      <RefreshCw style={{ width:10, height:10, color:"#facc15", animation:"gc-spin .8s linear infinite" }} />
      <span style={{ fontSize:9, color:"#facc15", fontWeight:600 }}>SYNC</span>
    </div>
  );

  const col = { excellent:"#22c55e", good:"#86efac", fair:"#facc15", poor:"#ef4444" }[quality];
  const bars = { excellent:4, good:3, fair:2, poor:1 }[quality];
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:13 }}>
      {[1,2,3,4].map(i => (
        <div key={i} style={{ width:3, borderRadius:2, height:`${i*3+2}px`, background: i<=bars ? col : "rgba(255,255,255,.18)", transition:"background .3s" }} />
      ))}
    </div>
  );
};

/* ════════════════════════════════════════════════════════
   PARTICIPANT COUNT BADGE (inside LiveKitRoom context)
   ════════════════════════════════════════════════════════ */
const ParticipantCountBadge = ({ onClick }: { onClick?: () => void }) => {
  const room = useRoomContext();
  const [count, setCount] = useState(room.numParticipants || 1);

  useEffect(() => {
    const update = () => setCount(room.numParticipants || 1);
    room.on(RoomEvent.ParticipantConnected, update);
    room.on(RoomEvent.ParticipantDisconnected, update);
    room.on(RoomEvent.ConnectionStateChanged, update);
    update();
    return () => {
      room.off(RoomEvent.ParticipantConnected, update);
      room.off(RoomEvent.ParticipantDisconnected, update);
      room.off(RoomEvent.ConnectionStateChanged, update);
    };
  }, [room]);

  return (
    <button
      onClick={onClick}
      title="Participants"
      className="gc-pill"
      style={{
        background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)",
        color:"rgba(255,255,255,.8)", cursor:onClick?"pointer":"default",
        gap:4,
      }}
    >
      <Users style={{ width:10, height:10 }} />
      {count}
    </button>
  );
};

/* ════════════════════════════════════════════════════════
   ROOM DATA BRIDGE — listens for emoji_react + hand_raise inside LiveKitRoom
   ════════════════════════════════════════════════════════ */
interface FloatingEmoji { id: number; emoji: string; sender: string; }
interface RaisedHand    { identity: string; name: string; }

const RoomDataBridge = ({
  onEmoji,
  onHand,
  exposeRoom,
}: {
  onEmoji: (emoji: string, sender: string) => void;
  onHand:  (identity: string, name: string, raised: boolean) => void;
  exposeRoom: (r: any) => void;
}) => {
  const room = useRoomContext();
  useEffect(() => { exposeRoom(room); }, [room, exposeRoom]);
  useEffect(() => {
    const onData = (data: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(data));
        if (msg.type === "emoji_react") onEmoji(msg.emoji, msg.sender || "");
        if (msg.type === "hand_raise")  onHand(msg.identity || "", msg.name || "Guest", !!msg.raised);
      } catch {}
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => { room.off(RoomEvent.DataReceived, onData); };
  }, [room, onEmoji, onHand]);
  return null;
};

/* ════════════════════════════════════════════════════════
   PARTICIPANT JOIN/LEAVE SOUNDS + TOAST
   (inside LiveKitRoom context)
   ════════════════════════════════════════════════════════ */
interface JoinToast { id: number; name: string; type: "join"|"leave"; }

const ParticipantEventHandler = ({
  onToast,
  soundEnabled,
}: {
  onToast: (t: JoinToast) => void;
  soundEnabled: boolean;
}) => {
  const room = useRoomContext();
  const toastId = useRef(0);
  // Seed with participants already in the room — only toast truly new arrivals.
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    room.remoteParticipants.forEach((_, identity) => seenRef.current.add(identity));
  }, [room]);

  useEffect(() => {
    const onJoin = (p: Participant) => {
      if (seenRef.current.has(p.identity)) return; // reconnect echo — skip
      seenRef.current.add(p.identity);
      if (soundEnabled) playChime("join");
      onToast({ id: ++toastId.current, name: p.name || p.identity || "Someone", type: "join" });
    };
    const onLeave = (p: Participant) => {
      seenRef.current.delete(p.identity);
      onToast({ id: ++toastId.current, name: p.name || p.identity || "Someone", type: "leave" });
    };
    room.on(RoomEvent.ParticipantConnected, onJoin);
    room.on(RoomEvent.ParticipantDisconnected, onLeave);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onJoin);
      room.off(RoomEvent.ParticipantDisconnected, onLeave);
    };
  }, [room, onToast, soundEnabled]);

  return null;
};

/* ════════════════════════════════════════════════════════
   RECONNECT MONITOR (inside LiveKitRoom)
   ════════════════════════════════════════════════════════ */
const ReconnectMonitor = ({ onReconnecting, onReconnected, onDisconnected }: {
  onReconnecting: () => void; onReconnected: () => void; onDisconnected: () => void;
}) => {
  const room = useRoomContext();
  const onReconnectingRef  = useRef(onReconnecting);
  const onReconnectedRef   = useRef(onReconnected);
  const onDisconnectedRef  = useRef(onDisconnected);
  onReconnectingRef.current  = onReconnecting;
  onReconnectedRef.current   = onReconnected;
  onDisconnectedRef.current  = onDisconnected;

  useEffect(() => {
    const h = (s: ConnectionState) => {
      if (s === ConnectionState.Reconnecting)   onReconnectingRef.current();
      else if (s === ConnectionState.Connected)  onReconnectedRef.current();
      else if (s === ConnectionState.Disconnected) onDisconnectedRef.current();
    };
    room.on(RoomEvent.ConnectionStateChanged, h);
    return () => { room.off(RoomEvent.ConnectionStateChanged, h); };
  }, [room]);
  return null;
};

/* ════════════════════════════════════════════════════════
   RECORDING CONTROLLER (host only)
   ════════════════════════════════════════════════════════ */
const RecordingController = ({ classId, isHost, onSavingChange }: {
  classId: string; isHost: boolean; onSavingChange:(v:boolean)=>void;
}) => {
  const room = useRoomContext();
  const [recording, setRecording]         = useState(false);
  const [paused, setPaused]               = useState(false);
  const [recTime, setRecTime]             = useState(0);
  const [saving, setSaving]               = useState(false);
  const [mode, setMode]                   = useState<"screen"|"audio"|null>(null);
  const timerRef     = useRef<any>(null);
  const recRef       = useRef<MediaRecorder|null>(null);
  const chunksRef    = useRef<Blob[]>([]);
  const streamsRef   = useRef<MediaStream[]>([]);
  const acRef        = useRef<AudioContext|null>(null);

  useEffect(() => () => { clearInterval(timerRef.current); streamsRef.current.forEach(s=>s.getTracks().forEach(t=>t.stop())); }, []);

  const collectAudio = useCallback((): MediaStream|null => {
    try {
      const ac = new AudioContext(); acRef.current = ac;
      const dest = ac.createMediaStreamDestination();
      let n = 0;
      for (const p of [room.localParticipant, ...Array.from(room.remoteParticipants.values())]) {
        for (const pub of p.trackPublications.values()) {
          if (pub.track && (pub.source===Track.Source.Microphone||pub.source===Track.Source.ScreenShareAudio)) {
            const mst = pub.track.mediaStreamTrack;
            if (mst?.readyState==="live") { ac.createMediaStreamSource(new MediaStream([mst])).connect(dest); n++; }
          }
        }
      }
      return n > 0 ? dest.stream : null;
    } catch { return null; }
  }, [room]);

  const start = useCallback(async () => {
    let stream: MediaStream|null = null; let m: "screen"|"audio" = "audio";
    if (typeof navigator.mediaDevices.getDisplayMedia === "function") {
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video:{ width:1280, height:720 } as any, audio:true });
        m = "screen";
        const ra = collectAudio();
        if (ra && acRef.current) {
          const ctx=acRef.current; const dest=ctx.createMediaStreamDestination();
          stream.getAudioTracks().forEach(t=>{ ctx.createMediaStreamSource(new MediaStream([t])).connect(dest); });
          ra.getAudioTracks().forEach(t=>{ ctx.createMediaStreamSource(new MediaStream([t])).connect(dest); });
          stream = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
        }
      } catch { stream=null; }
    }
    if (!stream) { m="audio"; stream=collectAudio(); if (!stream) { try { stream=await navigator.mediaDevices.getUserMedia({audio:true}); } catch { return; } } }
    streamsRef.current.push(stream);
    const isVid = stream.getVideoTracks().length > 0;
    const mime = isVid
      ? (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")?"video/webm;codecs=vp9,opus":"video/webm")
      : (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"audio/webm");
    const rec = new MediaRecorder(stream, { mimeType:mime });
    chunksRef.current = [];
    rec.ondataavailable = e => { if (e.data.size>0) chunksRef.current.push(e.data); };
    if (isVid) stream.getVideoTracks()[0]?.addEventListener("ended", ()=>{ if (recRef.current?.state!=="inactive") stop(); });
    rec.start(1000); recRef.current=rec; setMode(m); setRecording(true); setPaused(false); setRecTime(0);
    timerRef.current = setInterval(()=>setRecTime(p=>p+1), 1000);
  }, [collectAudio]);

  const stop = useCallback(async () => {
    clearInterval(timerRef.current);
    const m=mode;
    if (!recRef.current||recRef.current.state==="inactive") { setRecording(false); setPaused(false); setRecTime(0); return; }
    setSaving(true); onSavingChange(true);
    await new Promise<void>(res=>{ recRef.current!.onstop=()=>res(); recRef.current!.stop(); });
    streamsRef.current.forEach(s=>s.getTracks().forEach(t=>t.stop())); streamsRef.current=[];
    if (acRef.current) { acRef.current.close().catch(()=>{}); acRef.current=null; }
    setRecording(false); setPaused(false); setRecTime(0);
    const isVid=m==="screen";
    const blob=new Blob(chunksRef.current, { type:isVid?"video/webm":"audio/webm" });
    chunksRef.current=[];
    if (blob.size<500) { setSaving(false); onSavingChange(false); return; }
    try {
      const { error } = await storageSupabase.storage.from("subject-files")
        .upload(`recordings/public-class/${classId}/${Date.now()}.webm`, blob, { contentType:isVid?"video/webm":"audio/webm", upsert:false });
      if (error) throw error;
    } catch (e) { console.error("Recording save failed", e); }
    finally { setSaving(false); onSavingChange(false); }
  }, [mode, classId, onSavingChange]);

  const fmtT=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  if (!isHost) return null;

  return (
    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
      {recording && (
        <div className="gc-pill" style={{ background:"rgba(239,68,68,.15)", border:"1px solid rgba(239,68,68,.35)", color:"#fca5a5", animation:"gc-rec-pulse 1.4s ease-in-out infinite" }}>
          <Circle style={{ width:6, height:6, fill:"#ef4444", color:"#ef4444" }} />
          {fmtT(recTime)}{paused?" ⏸":""}
        </div>
      )}
      {saving && (
        <div className="gc-pill" style={{ background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.1)", color:"rgba(255,255,255,.5)" }}>
          <Loader2 style={{ width:10, height:10, animation:"gc-spin .8s linear infinite" }} /> Saving
        </div>
      )}
      {!recording && !saving && (
        <button onClick={start} style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 10px", borderRadius:20, border:"none", background:"#ef4444", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer" }}>
          <Circle style={{ width:6, height:6, fill:"#fff", color:"#fff" }} /> REC
        </button>
      )}
      {recording && (
        <>
          {paused
            ? <button onClick={()=>{ recRef.current?.resume(); setPaused(false); timerRef.current=setInterval(()=>setRecTime(p=>p+1),1000); }} style={{ display:"flex", alignItems:"center", gap:3, padding:"4px 9px", borderRadius:20, border:"1px solid rgba(255,255,255,.2)", background:"rgba(255,255,255,.08)", color:"#fff", fontSize:10, cursor:"pointer" }}><Play style={{width:9,height:9}}/>Resume</button>
            : <button onClick={()=>{ recRef.current?.pause(); setPaused(true); clearInterval(timerRef.current); }} style={{ display:"flex", alignItems:"center", gap:3, padding:"4px 9px", borderRadius:20, border:"1px solid rgba(255,255,255,.2)", background:"rgba(255,255,255,.08)", color:"#fff", fontSize:10, cursor:"pointer" }}><Pause style={{width:9,height:9}}/>Pause</button>
          }
          <button onClick={stop} style={{ display:"flex", alignItems:"center", gap:3, padding:"4px 9px", borderRadius:20, border:"none", background:"#ef4444", color:"#fff", fontSize:10, cursor:"pointer" }}><Square style={{width:9,height:9}}/>Stop</button>
        </>
      )}
    </div>
  );
};

/* ════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════ */
const GuestClassroom = () => {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { roomCode } = useParams<{ roomCode: string }>();
  const isMobile  = useIsMobile();

  const [connected, setConnected]         = useState(false);
  const [ended, setEnded]                 = useState(false);
  const [quizCode, setQuizCode]           = useState<string>("");
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [classDuration, setClassDuration] = useState(0);
  const [savingRec, setSavingRec]         = useState(false);
  const [minimized, setMinimized]         = useState(false);
  const [handUp,    setHandUp]             = useState(false);
  const [gcMoreOpen,      setGcMoreOpen]      = useState(false);
  const [emojiTrayOpen,   setEmojiTrayOpen]   = useState(false);
  const [floatingEmojis,  setFloatingEmojis]  = useState<{id:number;emoji:string;sender:string}[]>([]);
  const [raisedHands,     setRaisedHands]     = useState<{identity:string;name:string}[]>([]);
  const [reconnecting, setReconnecting]   = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [roomKey, setRoomKey]             = useState(0);
  const [soundEnabled, setSoundEnabled]   = useState(true);
  const [localGuestName, setLocalGuestName] = useState<string>("");
  const [editingGuestName, setEditingGuestName] = useState(false);
  const [guestNameInput, setGuestNameInput] = useState<string>("");
  const intentionalRef = useRef(false);
  const roomRef = useRef<any>(null);
  const exposeRoom = useCallback((r: any) => { roomRef.current = r; }, []);

  // Join/leave toasts
  const [joinToasts, setJoinToasts] = useState<JoinToast[]>([]);
  const addToast = useCallback((t: JoinToast) => {
    setJoinToasts(prev => [...prev.slice(-2), t]); // max 3 toasts
    setTimeout(() => setJoinToasts(prev => prev.filter(x => x.id !== t.id)), 3500);
  }, []);

  // Side panels
  const [chatOpen, setChatOpen]           = useState(!isMobile);
  const [partOpen, setPartOpen]           = useState(false);
  const [sideTab, setSideTab]             = useState<"chat"|"polls">("chat");
  const [chatUnread, setChatUnread]       = useState(0);
  const [showQuiz, setShowQuiz]           = useState(false);

  const handleRetRef = useRef<()=>void>(()=>{});

  const {
    token, url, room: roomName, guestName, classTitle, classTitleAr,
    isHost, classId, sessionId,
  } = (location.state||{}) as {
    token?:string; url?:string; room?:string; guestName?:string;
    classTitle?:string; classTitleAr?:string;
    isHost?:boolean; classId?:string; sessionId?:string;
  };

  // Initialise localGuestName once from location state
  useEffect(() => {
    if (guestName && !localGuestName) {
      setLocalGuestName(guestName);
      setGuestNameInput(guestName);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestName]);

  const saveGuestName = () => {
    const trimmed = guestNameInput.trim();
    if (trimmed) setLocalGuestName(trimmed);
    setEditingGuestName(false);
  };

  const title   = classTitle || "Public Class";
  const initial = title.charAt(0).toUpperCase();

  useSilentAudio(connected && !ended);
  useWakeLock(connected && !ended);

  const handleReturn = useCallback(() => setMinimized(false), []);
  const handleLeave  = useCallback(() => {
    intentionalRef.current = true;
    setReconnecting(false);
    setEnded(true);
  }, []);
  handleRetRef.current = handleReturn;

  /* ── Host: end class for everyone ── */
  const handleEndClass = useCallback(() => {
    setShowEndConfirm(false);
    intentionalRef.current = true;
    setReconnecting(false);
    setEnded(true);
    if (classId) {
      supabase.from("public_classes")
        .update({ status: "ended", actual_end_time: new Date().toISOString() })
        .eq("id", classId)
        .then(() => {}).catch(() => {});
    }
  }, [classId]);

  /* ── Leave button click (used in header) ──
     Sets intentional flag first, THEN the room will disconnect naturally
     when `ended` causes the LiveKitRoom to unmount. */
  const handleLeaveClick = useCallback(() => {
    if (isHost) {
      setShowEndConfirm(true);
    } else {
      handleLeave();
    }
  }, [isHost, handleLeave]);

  useMediaSession(connected && !ended, title, handleReturn, handleLeave);

  useEffect(() => { if (!token||!url) navigate("/live"); }, [token, url, navigate]);

  // Duration timer
  useEffect(() => {
    if (!connected) return;
    const t = setInterval(()=>setClassDuration(p=>p+1), 1000);
    return () => clearInterval(t);
  }, [connected]);

  // Fetch quiz_code from live_sessions for the post-class quiz auto-fill
  useEffect(() => {
    if (!classId) return;
    supabase
      .from("live_sessions")
      .select("quiz_code")
      .eq("id", classId)
      .single()
      .then(({ data }) => { if (data?.quiz_code) setQuizCode(data.quiz_code); });
  }, [classId]);

  // Fix LiveKit video: object-fit cover + un-mirror remote tiles.
  useEffect(() => {
    if (!connected) return;
    let patching = false;
    const patchVideos = () => {
      if (patching) return;
      patching = true;
      try {
        const lkRoot = document.querySelector("[data-lk-theme]") ?? document.body;
        lkRoot.querySelectorAll<HTMLVideoElement>("video").forEach(vid => {
          const carrier = vid.closest("[data-lk-local-participant]") as HTMLElement | null;
          const attr = carrier
            ? carrier.getAttribute("data-lk-local-participant")
            : vid.getAttribute("data-lk-local-participant");
          const isLocal = attr === "true" || attr === "";
          const wantedTransform = "none"; // no mirroring — local shows true-to-life, same as remote
          const curTransform = vid.style.getPropertyValue("transform");
          const curPriority  = vid.style.getPropertyPriority("transform");
          const curObjFit    = vid.style.getPropertyValue("object-fit");
          if (curTransform !== wantedTransform || curPriority !== "important" || curObjFit !== "cover") {
            vid.style.setProperty("object-fit", "cover",          "important");
            vid.style.setProperty("width",      "100%",           "important");
            vid.style.setProperty("height",     "100%",           "important");
            vid.style.setProperty("transform",         wantedTransform, "important");
            vid.style.setProperty("-webkit-transform", wantedTransform, "important");
          }
        });
      } finally {
        patching = false;
      }
    };
    patchVideos();
    const observer = new MutationObserver(() => { if (!patching) patchVideos(); });
    observer.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ["style", "data-lk-local-participant"],
    });
    const poll = setInterval(patchVideos, 300);
    return () => { observer.disconnect(); clearInterval(poll); };
  }, [connected]);

  // Auto-reconnect (up to 5 attempts)
  const endedRef = useRef(false);
  useEffect(() => { endedRef.current = ended; }, [ended]);

  const autoReconnect = useCallback(() => {
    if (intentionalRef.current || endedRef.current) return;
    setReconnecting(true);
    setReconnectCount(prev => {
      if (prev >= 5) { setEnded(true); return prev; }
      setTimeout(() => { setReconnecting(false); setRoomKey(k=>k+1); }, 2000 + prev*1000);
      return prev+1;
    });
  }, []);

  /* ── Emoji + Raise Hand for public class ── */
  const addFloatingEmoji = useCallback((emoji: string, sender: string) => {
    const id = Date.now() + Math.random();
    setFloatingEmojis(prev => [...prev, { id, emoji, sender }]);
    setTimeout(() => setFloatingEmojis(prev => prev.filter(f => f.id !== id)), 3000);
  }, []);

  const sendGuestEmoji = useCallback((emoji: string) => {
    setEmojiTrayOpen(false);
    setGcMoreOpen(false);
    const sender = localGuestName || guestName || "Guest";
    addFloatingEmoji(emoji, sender);
    try {
      const enc = new TextEncoder().encode(JSON.stringify({ type: "emoji_react", emoji, sender }));
      roomRef.current?.localParticipant?.publishData(enc, { reliable: false });
    } catch {}
  }, [localGuestName, guestName, addFloatingEmoji]);

  const toggleGuestHand = useCallback(async () => {
    const next = !handUp;
    setHandUp(next);
    setGcMoreOpen(false);
    const name = localGuestName || guestName || "Guest";
    const identity = roomRef.current?.localParticipant?.identity || "guest";
    try {
      const enc = new TextEncoder().encode(JSON.stringify({ type: "hand_raise", identity, name, raised: next }));
      roomRef.current?.localParticipant?.publishData(enc, { reliable: true });
    } catch {}
    // Show locally too
    if (next) {
      setRaisedHands(prev => prev.some(h => h.identity === identity) ? prev : [...prev, { identity, name }]);
    } else {
      setRaisedHands(prev => prev.filter(h => h.identity !== identity));
    }
  }, [handUp, localGuestName, guestName]);

  /* ── Minimize → slide classroom off-screen. Audio stays alive via keep-alive hooks. ── */
  const doMinimize = useCallback(() => {
    setMinimized(true);
  }, [setMinimized]);

  const navigateAway = useCallback(async (to: string) => {
    if (connected && !ended) {
      await doMinimize();
      setTimeout(() => navigate(to), 80);
    } else {
      navigate(to);
    }
  }, [connected, ended, doMinimize, navigate]);

  /* ── Back button: intercept every press while in class.
     Re-push the sentinel entry each time so the back button
     is always caught, whether the user is in or out of minimized. ── */
  useEffect(() => {
    if (!connected) return;

    // Push sentinel so first back press is caught
    window.history.pushState({ gc: true }, "");

    const onPop = () => {
      setMinimized(true);
      // Re-push so the NEXT back press is also caught
      window.history.pushState({ gc: true }, "");
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [connected]);

  /* ── Home button / app switcher → minimize. Auto-restore when returning. ── */
  useEffect(() => {
    if (!connected) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        setMinimized(true);
      } else if (document.visibilityState === "visible") {
        // Auto-restore: user switched back — bring classroom straight back
        setMinimized(false);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [connected]);

  /* ── Return from minimized → re-push sentinel ── */
  useEffect(() => {
    if (!minimized && connected) {
      window.history.pushState({ gc: true }, "");
    }
  }, [minimized, connected]);



  const fmtT = (s:number) => {
    const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
    return h>0 ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };

  if (!token||!url) return null;

  /* ── Ended screen ── */
  if (ended) {
    return (
      <div style={{ minHeight:"100dvh", overflowY:"auto", background:"#0b1f13", color:"#fff", fontFamily:"'Google Sans','Roboto',sans-serif", padding:"0 0 48px" }}>
        <style>{`
          ${CSS}
          @keyframes gc-ended-fade{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
          .gc-ended-card{animation:gc-ended-fade .35s ease both;}
          .gc-cta-btn{transition:opacity .15s,transform .1s;cursor:pointer;}
          .gc-cta-btn:active{opacity:.8;transform:scale(.97);}
        `}</style>

        {/* ── Header ── */}
        <div style={{ background:"linear-gradient(160deg,#0f2e1a 0%,#0b1f13 100%)", padding:"48px 24px 36px", textAlign:"center", borderBottom:"1px solid rgba(201,151,58,.15)" }}>
          {/* Gold divider */}
          <div style={{ width:48, height:2, background:"#c9973a", borderRadius:2, margin:"0 auto 20px", opacity:.7 }} />
          <p style={{ fontSize:28, fontFamily:"'Amiri',serif", color:"#c9973a", margin:"0 0 8px", lineHeight:1.4 }}>جزاكم الله خيراً</p>
          <h2 style={{ fontSize:22, fontWeight:700, color:"#fff", margin:"0 0 8px" }}>Class Has Ended</h2>
          <p style={{ color:"rgba(255,255,255,.45)", fontSize:13, margin:0 }}>JazakAllahu Khayran for attending <strong style={{color:"rgba(255,255,255,.75)"}}>{title}</strong></p>
        </div>

        <div style={{ maxWidth:460, margin:"0 auto", padding:"0 16px" }}>

          {/* ── Name edit section (for guests) ── */}
          {!isHost && (
            <div className="gc-ended-card" style={{ marginTop:24, background:"rgba(138,180,248,.06)", border:"1.5px solid rgba(138,180,248,.2)", borderRadius:20, padding:"18px 20px", animationDelay:"0s" }}>
              <p style={{ fontSize:11, fontWeight:700, letterSpacing:1.4, color:"#8ab4f8", margin:"0 0 6px", textTransform:"uppercase" }}>👤 Your Display Name</p>
              {editingGuestName ? (
                <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:4 }}>
                  <input
                    value={guestNameInput}
                    onChange={e => setGuestNameInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveGuestName()}
                    autoFocus
                    placeholder="Enter your name"
                    style={{ flex:1, background:"rgba(255,255,255,.08)", border:"1px solid rgba(138,180,248,.35)", borderRadius:10, padding:"8px 12px", fontSize:14, color:"#fff", outline:"none", fontFamily:"'Google Sans',sans-serif" }}
                  />
                  <button
                    onClick={saveGuestName}
                    style={{ padding:"8px 16px", borderRadius:10, border:"none", background:"#8ab4f8", color:"#0b1f13", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'Google Sans',sans-serif" }}
                  >Save</button>
                  <button
                    onClick={() => setEditingGuestName(false)}
                    style={{ padding:"8px 12px", borderRadius:10, border:"1px solid rgba(255,255,255,.15)", background:"transparent", color:"rgba(255,255,255,.5)", fontSize:13, cursor:"pointer", fontFamily:"'Google Sans',sans-serif" }}
                  >Cancel</button>
                </div>
              ) : (
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:4 }}>
                  <span style={{ fontSize:16, fontWeight:600, color:"#fff" }}>{localGuestName || guestName || "Guest"}</span>
                  <button
                    onClick={() => { setGuestNameInput(localGuestName || guestName || ""); setEditingGuestName(true); }}
                    style={{ fontSize:12, color:"#8ab4f8", background:"rgba(138,180,248,.1)", border:"1px solid rgba(138,180,248,.25)", borderRadius:10, padding:"4px 12px", cursor:"pointer", fontFamily:"'Google Sans',sans-serif" }}
                  >✏️ Edit</button>
                </div>
              )}
              <p style={{ fontSize:11, color:"rgba(255,255,255,.35)", margin:"6px 0 0", lineHeight:1.5 }}>This is the name shown during class discussion. The <strong style={{color:"rgba(201,168,76,.7)"}}>**</strong> prefix is reserved for verified teachers/admins only.</p>
            </div>
          )}

          {/* ── Post-class Quiz CTA ── */}
          <div className="gc-ended-card" style={{ marginTop:28, background:"rgba(34,197,94,.06)", border:"1.5px solid rgba(34,197,94,.3)", borderRadius:20, padding:"24px 20px", animationDelay:"0s" }}>
            <p style={{ fontSize:11, fontWeight:700, letterSpacing:1.4, color:"#22c55e", margin:"0 0 8px", textTransform:"uppercase" }}>📝 Test Your Knowledge</p>
            <h3 style={{ fontSize:18, fontWeight:700, color:"#fff", margin:"0 0 8px", lineHeight:1.3 }}>Take the Post-Class Quiz</h3>
            <p style={{ fontSize:13, color:"rgba(255,255,255,.5)", margin:"0 0 20px", lineHeight:1.6 }}>
              Reinforce what you just learned — answer questions from today's class and track your progress.
            </p>
            <a
              href={`/quiz${quizCode ? `?code=${quizCode}&` : "?"}name=${encodeURIComponent(localGuestName || guestName || title)}`}
              className="gc-cta-btn"
              style={{ display:"block", textAlign:"center", padding:"13px 0", borderRadius:999, background:"#22c55e", color:"#0b1f13", fontSize:14, fontWeight:800, textDecoration:"none" }}
            >
              {quizCode ? "Join Quiz →" : "Go to Quiz →"}
            </a>
            {quizCode && (
              <p style={{ textAlign:"center", fontSize:12, color:"rgba(255,255,255,0.4)", margin:"8px 0 0" }}>
                Room code <strong style={{color:"#22c55e",fontFamily:"monospace",letterSpacing:2}}>{quizCode}</strong> will be pre-filled
              </p>
            )}
          </div>

          {/* ── Enroll CTA ── */}
          <div className="gc-ended-card" style={{ marginTop:28, background:"rgba(201,151,58,.08)", border:"1.5px solid rgba(201,151,58,.3)", borderRadius:20, padding:"24px 20px", animationDelay:".05s" }}>
            <p style={{ fontSize:11, fontWeight:700, letterSpacing:1.4, color:"#c9973a", margin:"0 0 8px", textTransform:"uppercase" }}>🎓 Want to learn more?</p>
            <h3 style={{ fontSize:18, fontWeight:700, color:"#fff", margin:"0 0 8px", lineHeight:1.3 }}>Enrol in Full Courses at Tahleem Academy</h3>
            <p style={{ fontSize:13, color:"rgba(255,255,255,.5)", margin:"0 0 20px", lineHeight:1.6 }}>
              Access structured Islamic studies — Qur'an, Fiqh, Aqeedah, Arabic &amp; more — taught by qualified scholars. Live classes, recordings, and personal feedback.
            </p>
            <a
              href="/courses"
              className="gc-cta-btn"
              style={{ display:"block", textAlign:"center", padding:"13px 0", borderRadius:999, background:"#c9973a", color:"#0b1f13", fontSize:14, fontWeight:800, textDecoration:"none" }}
            >
              Browse Courses →
            </a>
            <a
              href="/register"
              className="gc-cta-btn"
              style={{ display:"block", textAlign:"center", marginTop:10, padding:"12px 0", borderRadius:999, border:"1px solid rgba(201,151,58,.4)", background:"transparent", color:"#c9973a", fontSize:13, fontWeight:600, textDecoration:"none" }}
            >
              Create Free Account
            </a>
          </div>

          {/* ── More live classes ── */}
          <div className="gc-ended-card" style={{ marginTop:16, background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:20, padding:"20px", animationDelay:".12s" }}>
            <p style={{ fontSize:11, fontWeight:700, letterSpacing:1.4, color:"rgba(255,255,255,.4)", margin:"0 0 8px", textTransform:"uppercase" }}>📡 Free Live Classes</p>
            <p style={{ fontSize:14, color:"rgba(255,255,255,.7)", margin:"0 0 16px", lineHeight:1.5 }}>
              We host regular free public classes open to everyone — no account needed.
            </p>
            <a
              href="/live"
              className="gc-cta-btn"
              style={{ display:"block", textAlign:"center", padding:"12px 0", borderRadius:999, background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.12)", color:"rgba(255,255,255,.85)", fontSize:13, fontWeight:600, textDecoration:"none" }}
            >
              See Upcoming Classes
            </a>
          </div>

          {/* ── WhatsApp ── */}
          <div className="gc-ended-card" style={{ marginTop:16, background:"rgba(37,211,102,.05)", border:"1px solid rgba(37,211,102,.2)", borderRadius:20, padding:"20px", animationDelay:".18s" }}>
            <p style={{ fontSize:11, fontWeight:700, letterSpacing:1.4, color:"#25d366", margin:"0 0 8px", textTransform:"uppercase" }}>💬 Stay Connected</p>
            <p style={{ fontSize:14, color:"rgba(255,255,255,.6)", margin:"0 0 16px", lineHeight:1.5 }}>
              Get notified about upcoming classes, new courses, and announcements directly on WhatsApp.
            </p>
            <a
              href="https://wa.me/2348163310471"
              target="_blank"
              rel="noopener noreferrer"
              className="gc-cta-btn"
              style={{ display:"block", textAlign:"center", padding:"12px 0", borderRadius:999, background:"rgba(37,211,102,.12)", border:"1px solid rgba(37,211,102,.3)", color:"#25d366", fontSize:13, fontWeight:700, textDecoration:"none" }}
            >
              WhatsApp Us
            </a>
          </div>

          {/* ── Host nav / Guest browse ── */}
          <div style={{ textAlign:"center", marginTop:28 }}>
            {isHost
              ? <button onClick={()=>navigateAway("/admin/public-classes")} style={{ fontSize:13, color:"rgba(255,255,255,.3)", background:"none", border:"none", cursor:"pointer", textDecoration:"underline", fontFamily:"inherit" }}>Back to Dashboard</button>
              : <button onClick={()=>navigateAway("/live")} style={{ fontSize:13, color:"rgba(255,255,255,.3)", background:"none", border:"none", cursor:"pointer", textDecoration:"underline", fontFamily:"inherit" }}>Browse Other Classes</button>
            }
          </div>

        </div>
      </div>
    );
  }

  return (
    <>
    {/* Classroom always visible — slides off-screen when backgrounded, auto-restores. */}
    <div
      data-gc-root
      style={{
        position:"fixed", inset:0, zIndex:8000,
        display:"flex", flexDirection:"column",
        background:"#202124",
      }}
    >
      <style>{CSS}</style>

      {/* ── Join/Leave toasts ── */}
      <div style={{ position:"absolute", top:56, left:"50%", transform:"translateX(-50%)", zIndex:9000, display:"flex", flexDirection:"column", gap:6, alignItems:"center", pointerEvents:"none" }}>
        {joinToasts.map(t => (
          <div key={t.id} style={{
            display:"flex", alignItems:"center", gap:8,
            background:"rgba(32,33,36,.95)", backdropFilter:"blur(16px)",
            border:"1px solid rgba(255,255,255,.1)", borderRadius:24,
            padding:"7px 14px", fontSize:12, fontWeight:600,
            color:"rgba(255,255,255,.9)", whiteSpace:"nowrap",
            boxShadow:"0 4px 20px rgba(0,0,0,.4)",
            animation:"gc-toast-in .22s ease forwards",
          }}>
            <span style={{ width:8, height:8, borderRadius:"50%", background: t.type==="join"?"#22c55e":"#ef4444", flexShrink:0 }} />
            <span style={{ fontWeight:700, color: t.type==="join"?"#86efac":"#fca5a5" }}>{t.name}</span>
            <span style={{ color:"rgba(255,255,255,.55)" }}>{t.type==="join"?"joined":"left"}</span>
          </div>
        ))}
      </div>

      <LiveKitRoom
        key={roomKey}
        serverUrl={url}
        token={token}
        connect={true}
        onConnected={()=>{ setConnected(true); setReconnecting(false); setReconnectCount(0); }}
        // FIX: onDisconnected removed — handled exclusively by ReconnectMonitor below.
        // Keeping it here AND in ReconnectMonitor caused autoReconnect() to fire
        // TWICE per disconnect, scheduling two setRoomKey() increments ~2 s apart
        // and creating a permanent "Reconnecting..." loop that never resolved.
        options={{
          adaptiveStream:{ pixelDensity:"screen" },
          dynacast:true,
          disconnectOnPageLeave:false,
          audioCaptureDefaults:{
            echoCancellation:true, noiseSuppression:true,
            autoGainControl:true, sampleRate:48000, channelCount:1,
          },
          publishDefaults:{
            audioPreset:{ maxBitrate:64000 },
            dtx:false, red:true, stopMicTrackOnMute:false,
            videoEncoding:{ maxBitrate:700_000, maxFramerate:20 },
            backupCodec:true,
          },
          videoCaptureDefaults:{ resolution:{ width:1280, height:720 } },
        }}
        style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0, position:"relative" }}
        data-lk-theme="default"
      >
        <ReconnectMonitor
          onReconnecting={()=>setReconnecting(true)}
          onReconnected={()=>{ setReconnecting(false); setReconnectCount(0); }}
          onDisconnected={()=>{ if (!intentionalRef.current) autoReconnect(); }}
        />

        {/* Participant event handler (sounds + toasts) */}
        <ParticipantEventHandler onToast={addToast} soundEnabled={soundEnabled} />
        <RoomDataBridge
          exposeRoom={exposeRoom}
          onEmoji={(emoji, sender) => addFloatingEmoji(emoji, sender)}
          onHand={(identity, name, raised) => setRaisedHands(prev =>
            raised
              ? prev.some(h => h.identity === identity) ? prev : [...prev, { identity, name }]
              : prev.filter(h => h.identity !== identity)
          )}
        />

        {/* Reconnecting overlay */}
        {reconnecting && (
          <div className="gc-reconnect-overlay">
            <div style={{ width:52, height:52, border:"3px solid rgba(138,180,248,.2)", borderTopColor:"#8ab4f8", borderRadius:"50%", animation:"gc-spin .8s linear infinite" }} />
            <p style={{ color:"#e8eaed", fontSize:16, fontWeight:500, fontFamily:"'Google Sans',sans-serif" }}>Reconnecting…</p>
            <p style={{ color:"rgba(255,255,255,.4)", fontSize:13, fontFamily:"'Google Sans',sans-serif" }}>
              {reconnectCount>0 ? `Attempt ${reconnectCount} of 5` : "Please stay on the page"}
            </p>
          </div>
        )}

        {/* ════ TOP BAR ════ */}
        <div style={{
          height:48, flexShrink:0,
          background:"rgba(32,33,36,.97)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
          display:"flex", alignItems:"center",
          padding:"0 10px", gap:6,
          borderBottom:"1px solid rgba(255,255,255,.06)",
          overflow:"hidden",
        }}>
          {/* LEFT GROUP */}
          <div style={{ display:"flex", alignItems:"center", gap:5, flex:1, minWidth:0, overflow:"hidden" }}>
            {isHost
              ? <div className="gc-pill" style={{ background:"rgba(239,68,68,.13)", border:"1px solid rgba(239,68,68,.3)", color:"#fca5a5" }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:"#ef4444", display:"inline-block", animation:"gc-pulse 1.8s ease-in-out infinite" }} />
                  LIVE
                </div>
              : <div className="gc-pill" style={{ background:"rgba(201,151,58,.12)", border:"1px solid rgba(201,151,58,.3)", color:"#c9973a" }}>
                  Guest
                </div>
            }

            {/* Class title */}
            <span style={{ fontSize:12, fontWeight:600, color:"rgba(255,255,255,.85)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1, minWidth:0 }}>
              {title}
            </span>

            {/* Timer */}
            <div className="gc-pill" style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", color:"rgba(255,255,255,.65)", fontVariantNumeric:"tabular-nums" }}>
              <Circle style={{ width:5, height:5, fill:"#ef4444", color:"#ef4444", animation:"gc-rec-pulse 1.4s ease-in-out infinite", flexShrink:0 }} />
              {fmtT(classDuration)}
            </div>

            {/* Participant count badge — IN HEADER */}
            <ParticipantCountBadge onClick={()=>setPartOpen(v=>!v)} />
          </div>

          {/* RIGHT GROUP */}
          <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
            {/* Connection quality */}
            <ConnectionIndicator />

            {/* Record (host only) */}
            <RecordingController classId={classId||""} isHost={!!isHost} onSavingChange={setSavingRec} />

            {/* Sound toggle */}
            <button
              onClick={()=>setSoundEnabled(v=>!v)}
              title={soundEnabled?"Mute join sounds":"Unmute join sounds"}
              style={{
                width:28, height:28, borderRadius:"50%", border:"none",
                background: soundEnabled ? "rgba(255,255,255,.1)" : "rgba(239,68,68,.15)",
                color: soundEnabled ? "rgba(255,255,255,.6)" : "#fca5a5",
                cursor:"pointer", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center",
              }}
            >
              {soundEnabled ? "🔔" : "🔕"}
            </button>
          </div>
        </div>

        {/* ════ MAIN CONTENT ════ */}
        <div style={{ flex:1, display:"flex", minHeight:0, overflow:"hidden" }}>
          {/* Participants (desktop) */}
          {partOpen && !isMobile && sessionId && (
            <div style={{ width:216, background:"rgba(32,33,36,.97)", borderRight:"1px solid rgba(255,255,255,.07)", display:"flex", flexDirection:"column", flexShrink:0 }}>
              <ClassParticipants
                sessionId={sessionId}
                onMuteStudent={isHost?(id)=>{ supabase.from("class_participants").update({is_muted:true}).eq("session_id",sessionId).eq("student_id",id); }:undefined}
                onRemoveStudent={isHost?(id)=>{ supabase.from("class_participants").update({left_at:new Date().toISOString()}).eq("session_id",sessionId).eq("student_id",id); }:undefined}
              />
            </div>
          )}

          {/* Video + LK control bar — wrapped so we can overlay Leave icon */}
          <div style={{ flex:1, position:"relative", minWidth:0, display:"flex", flexDirection:"column" }}>
            <VideoConference />
            <RoomAudioRenderer />

          {/* ── Floating emoji layer ── */}
            <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:25, overflow:"hidden" }}>
              {floatingEmojis.map(fe => (
                <div key={fe.id} style={{
                  position:"absolute",
                  bottom: 80,
                  left: `${20 + Math.random() * 60}%`,
                  display:"flex", flexDirection:"column", alignItems:"center", gap:3,
                  animation:"gc-emoji-float 2.8s ease-out forwards",
                  pointerEvents:"none",
                }}>
                  <span style={{ fontSize:38, filter:"drop-shadow(0 2px 8px rgba(0,0,0,.5))", lineHeight:1 }}>{fe.emoji}</span>
                  {fe.sender && <span style={{ fontSize:10, color:"rgba(255,255,255,.7)", fontWeight:600, background:"rgba(0,0,0,.4)", borderRadius:8, padding:"1px 6px", whiteSpace:"nowrap" }}>{fe.sender}</span>}
                </div>
              ))}
            </div>

            {/* ── Raised hands overlay ── */}
            {raisedHands.length > 0 && (
              <div style={{
                position:"absolute", top:56, left:"50%", transform:"translateX(-50%)",
                zIndex:26, display:"flex", gap:8, pointerEvents:"none", flexWrap:"wrap", justifyContent:"center",
              }}>
                {raisedHands.map(h => (
                  <div key={h.identity} style={{
                    display:"flex", alignItems:"center", gap:5,
                    background:"rgba(32,33,36,.92)", backdropFilter:"blur(12px)",
                    border:"1px solid rgba(251,191,36,.4)", borderRadius:20,
                    padding:"5px 12px", fontSize:12, fontWeight:600, color:"#fbbf24",
                    animation:"gc-toast-in .22s ease forwards",
                  }}>
                    <span style={{ fontSize:16, animation:"gc-hand-bounce 1.2s ease-in-out infinite" }}>✋</span>
                    <span style={{ color:"rgba(255,255,255,.9)" }}>{h.name}</span>
                  </div>
                ))}
              </div>
            )}

          {/* ── Three-dot menu + Leave ── */}

            {/* Click-away for three-dot menu */}
            {(gcMoreOpen || emojiTrayOpen) && (
              <div onClick={()=>{ setGcMoreOpen(false); setEmojiTrayOpen(false); }}
                style={{ position:"fixed", inset:0, zIndex:28 }} />
            )}

            {/* Emoji tray (slides up from menu) */}
            {emojiTrayOpen && (
              <div style={{
                position:"absolute",
                bottom:"calc(env(safe-area-inset-bottom,0px) + 62px)",
                right: 68,
                display:"flex", gap:6,
                background:"rgba(32,33,36,.97)", backdropFilter:"blur(20px)",
                border:"1px solid rgba(255,255,255,.12)", borderRadius:16,
                padding:"10px 12px", zIndex:29,
                boxShadow:"0 8px 32px rgba(0,0,0,.5)",
              }}>
                {["👏","🤲","❤️","😂","🌟","👍","🙏","🔥"].map(e=>(
                  <button key={e} onClick={()=>sendGuestEmoji(e)} style={{
                    width:38, height:38, borderRadius:10, border:"none",
                    background:"none", fontSize:24, cursor:"pointer",
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>{e}</button>
                ))}
              </div>
            )}

            {/* Three-dot menu */}
            {gcMoreOpen && !emojiTrayOpen && (
              <div style={{
                position:"absolute",
                bottom:"calc(env(safe-area-inset-bottom,0px) + 62px)",
                right: 68,
                background:"rgba(32,33,36,.97)", backdropFilter:"blur(20px)",
                border:"1px solid rgba(255,255,255,.1)", borderRadius:14,
                padding:"6px 0", zIndex:29, minWidth:190,
                boxShadow:"0 8px 32px rgba(0,0,0,.5)",
              }}>
                {/* Send a Reaction */}
                <button onClick={()=>{ setEmojiTrayOpen(true); setGcMoreOpen(false); }} style={{
                  width:"100%", padding:"11px 16px", border:"none", background:"none",
                  color:"#e8eaed", fontSize:13, fontWeight:500, cursor:"pointer",
                  display:"flex", alignItems:"center", gap:10, textAlign:"left",
                  fontFamily:"'Google Sans',sans-serif",
                  borderBottom:"1px solid rgba(255,255,255,.07)",
                }}>
                  <Smile style={{ width:16, height:16, opacity:.75, flexShrink:0 }} />
                  Send a Reaction
                </button>
                {/* Raise / Lower Hand */}
                <button onClick={toggleGuestHand} style={{
                  width:"100%", padding:"11px 16px", border:"none", background:"none",
                  color: handUp ? "#fbbf24" : "#e8eaed",
                  fontSize:13, fontWeight:500, cursor:"pointer",
                  display:"flex", alignItems:"center", gap:10, textAlign:"left",
                  fontFamily:"'Google Sans',sans-serif",
                }}>
                  <Hand style={{ width:16, height:16, opacity:.75, flexShrink:0 }} />
                  {handUp ? "Lower Hand ✋" : "Raise Hand ✋"}
                </button>
              </div>
            )}

            {/* Three-dot button */}
            <button
              onClick={()=>{ setGcMoreOpen(v=>!v); setEmojiTrayOpen(false); }}
              title="More options"
              style={{
                position:"absolute",
                bottom: "calc(env(safe-area-inset-bottom,0px) + 11px)",
                right: 68,
                width: 48, height: 46,
                borderRadius: 24, border: "none",
                background: (gcMoreOpen || emojiTrayOpen || handUp)
                  ? "rgba(251,191,36,.2)" : "rgba(255,255,255,.1)",
                color: (gcMoreOpen || emojiTrayOpen || handUp)
                  ? "#fbbf24" : "rgba(255,255,255,.85)",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                zIndex: 30,
              }}
            >
              {handUp
                ? <span style={{ fontSize:18, animation:"gc-hand-bounce 1.2s ease-in-out infinite" }}>✋</span>
                : <MoreVertical style={{ width:19, height:19 }} />
              }
            </button>

            {/* Leave / End button */}
            <button
              onClick={handleLeaveClick}
              title={isHost ? "End class for everyone" : "Leave class"}
              style={{
                position:"absolute",
                bottom: "calc(env(safe-area-inset-bottom,0px) + 11px)",
                right: 12,
                width: 48, height: 46,
                borderRadius: 24, border: "none",
                background: "#ea4335", color: "#fff",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 12px rgba(234,67,53,.45)",
                zIndex: 20,
              }}
            >
              <LogOut style={{ width:19, height:19 }} />
            </button>
          </div>

          {/* Chat / Polls (desktop) */}
          {chatOpen && !isMobile && sessionId && (
            <div className="gc-sidebar">
              <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,.07)", flexShrink:0, background:"rgba(32,33,36,.97)" }}>
                {(["chat","polls"] as const).map(tab=>(
                  <button key={tab} onClick={()=>{ setSideTab(tab); if(tab==="chat") setChatUnread(0); }} style={{
                    flex:1, padding:"13px 4px", background:"none", border:"none",
                    color:sideTab===tab?"#8ab4f8":"rgba(255,255,255,.4)",
                    fontSize:13, fontWeight:sideTab===tab?600:400,
                    borderBottom:sideTab===tab?"2px solid #8ab4f8":"2px solid transparent",
                    cursor:"pointer", fontFamily:"'Google Sans',sans-serif", transition:"color .15s",
                  }}>
                    {tab==="chat"?"💬 Chat":"📊 Polls"}
                    {tab==="chat" && chatUnread>0 && (
                      <span style={{ marginLeft:4, background:"#ef4444", color:"#fff", borderRadius:10, fontSize:10, padding:"1px 5px" }}>{chatUnread}</span>
                    )}
                  </button>
                ))}
                <button onClick={()=>setChatOpen(false)} style={{ background:"none", border:"none", color:"rgba(255,255,255,.3)", cursor:"pointer", padding:"0 12px", flexShrink:0 }}>
                  <X style={{ width:14, height:14 }} />
                </button>
              </div>
              <div style={{ flex:1, overflow:"hidden" }}>
                {sideTab==="chat" ? <ClassChatPanel sessionId={sessionId} guestName={!isHost ? (localGuestName || guestName) : undefined} onEditName={!isHost ? () => { setEditingGuestName(true); setGuestNameInput(localGuestName || guestName || ""); } : undefined} /> : <ClassPolls sessionId={sessionId} />}
              </div>
            </div>
          )}
        </div>

        {/* ════ CONTROLS ════ */}
        {sessionId ? (
          <ClassControls
            sessionId={sessionId}
            isHostOverride={!!isHost}
            onToggleChat={()=>{ setChatOpen(v=>!v); if(!chatOpen) setChatUnread(0); }}
            onToggleParticipants={()=>setPartOpen(v=>!v)}
            onEndClass={isHost?()=>setShowEndConfirm(true):undefined}
            onLeaveClass={handleLeave}
            chatUnread={chatUnread}
            onLaunchPoll={isHost?()=>{ setChatOpen(true); setSideTab("polls"); }:undefined}
            onLaunchQuiz={isHost?()=>setShowQuiz(true):undefined}
          />
        ) : null}

        {sessionId && <LiveQuizOverlay sessionId={sessionId} isOpen={showQuiz} onClose={()=>setShowQuiz(false)} />}
      </LiveKitRoom>

      {/* ════ MOBILE BOTTOM SHEETS ════ */}
      {isMobile && partOpen && sessionId && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.65)", zIndex:50 }} onClick={()=>setPartOpen(false)}>
          <div style={{ position:"absolute", bottom:64, left:0, right:0, background:"#13181f", borderRadius:"22px 22px 0 0", maxHeight:"65vh", overflow:"auto", animation:"gc-slide-up .22s ease" }} onClick={e=>e.stopPropagation()}>
            <div style={{ width:40, height:4, borderRadius:2, background:"rgba(255,255,255,.2)", margin:"12px auto 6px" }} />
            <ClassParticipants sessionId={sessionId} />
          </div>
        </div>
      )}

      {isMobile && chatOpen && sessionId && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.65)", zIndex:50 }} onClick={()=>setChatOpen(false)}>
          <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"#13181f", borderRadius:"22px 22px 0 0", maxHeight:"82vh", display:"flex", flexDirection:"column", animation:"gc-slide-up .22s ease", paddingBottom:"env(safe-area-inset-bottom,0px)" }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", padding:"12px 16px 0", flexShrink:0 }}>
              <div style={{ flex:1, display:"flex" }}>
                {(["chat","polls"] as const).map(tab=>(
                  <button key={tab} onClick={()=>setSideTab(tab)} style={{ flex:1, padding:"10px 6px", background:"none", border:"none", color:sideTab===tab?"#fff":"rgba(255,255,255,.35)", fontSize:13, fontWeight:sideTab===tab?700:400, borderBottom:sideTab===tab?"2px solid #0a7c68":"2px solid transparent", cursor:"pointer" }}>
                    {tab==="chat"?"💬 Chat":"📊 Polls"}
                  </button>
                ))}
              </div>
              <button onClick={()=>setChatOpen(false)} style={{ width:32, height:32, borderRadius:"50%", background:"rgba(255,255,255,.1)", border:"none", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <X style={{ width:14, height:14 }} />
              </button>
            </div>
            <div style={{ flex:1, overflow:"hidden", minHeight:320 }}>
              {sideTab==="chat" ? <ClassChatPanel sessionId={sessionId} guestName={!isHost ? (localGuestName || guestName) : undefined} onEditName={!isHost ? () => { setChatOpen(false); setTimeout(()=>setEditingGuestName(true), 200); } : undefined} /> : <ClassPolls sessionId={sessionId} />}
            </div>
          </div>
        </div>
      )}

      {/* ════ EDIT GUEST NAME MODAL ════ */}
      {editingGuestName && (
        <div style={{ position:"fixed", inset:0, zIndex:9600, background:"rgba(0,0,0,.65)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setEditingGuestName(false)}>
          <div style={{ background:"#1e2535", borderRadius:20, padding:"28px 24px", width:"100%", maxWidth:360, margin:"0 16px", boxShadow:"0 24px 64px rgba(0,0,0,.7)", border:"1px solid rgba(138,180,248,.2)", animation:"gc-fade-up .18s ease" }} onClick={e=>e.stopPropagation()}>
            <h2 style={{ textAlign:"center", fontSize:17, fontWeight:700, color:"#e8eaed", marginBottom:6, fontFamily:"'Google Sans',sans-serif" }}>✏️ Edit Your Name</h2>
            <p style={{ textAlign:"center", fontSize:12, color:"rgba(255,255,255,.4)", marginBottom:20, lineHeight:1.5, fontFamily:"'Google Sans',sans-serif" }}>
              This is the name shown in the class chat and discussion.<br/>
              <span style={{color:"rgba(201,168,76,.7)",fontWeight:600}}>**</span> prefix is reserved for verified teachers &amp; admins.
            </p>
            <input
              value={guestNameInput}
              onChange={e => setGuestNameInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveGuestName()}
              autoFocus
              placeholder="Enter your display name"
              style={{ width:"100%", background:"rgba(255,255,255,.08)", border:"1px solid rgba(138,180,248,.35)", borderRadius:12, padding:"11px 14px", fontSize:15, color:"#fff", outline:"none", fontFamily:"'Google Sans',sans-serif", boxSizing:"border-box" }}
            />
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:16 }}>
              <button
                onClick={saveGuestName}
                disabled={!guestNameInput.trim()}
                style={{ width:"100%", padding:12, borderRadius:24, border:"none", background:guestNameInput.trim()?"#8ab4f8":"rgba(255,255,255,.12)", color:guestNameInput.trim()?"#0b1f13":"rgba(255,255,255,.3)", fontSize:14, fontWeight:700, cursor:guestNameInput.trim()?"pointer":"default", fontFamily:"'Google Sans',sans-serif" }}
              >Save Name</button>
              <button
                onClick={() => setEditingGuestName(false)}
                style={{ width:"100%", padding:11, borderRadius:24, border:"1px solid rgba(255,255,255,.12)", background:"transparent", color:"rgba(255,255,255,.5)", fontSize:13, cursor:"pointer", fontFamily:"'Google Sans',sans-serif" }}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ END CLASS CONFIRM ════ */}
      {showEndConfirm && (
        <div style={{ position:"fixed", inset:0, zIndex:9500, background:"rgba(0,0,0,.65)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setShowEndConfirm(false)}>
          <div style={{ background:"#2D2E30", borderRadius:20, padding:"32px 28px 24px", width:"100%", maxWidth:380, margin:"0 16px", boxShadow:"0 24px 64px rgba(0,0,0,.7)", border:"1px solid rgba(255,255,255,.08)", animation:"gc-fade-up .18s ease" }} onClick={e=>e.stopPropagation()}>
            <div style={{ width:56, height:56, borderRadius:"50%", background:"rgba(239,68,68,.12)", border:"1px solid rgba(239,68,68,.2)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 18px" }}>
              <Phone style={{ width:22, height:22, color:"#ef4444", transform:"rotate(135deg)" }} />
            </div>
            <h2 style={{ textAlign:"center", fontSize:18, fontWeight:500, color:"#e8eaed", marginBottom:8, fontFamily:"'Google Sans',sans-serif" }}>End class for everyone?</h2>
            <p style={{ textAlign:"center", fontSize:13, color:"rgba(255,255,255,.45)", marginBottom:24, lineHeight:1.6, fontFamily:"'Google Sans',sans-serif" }}>This will disconnect all participants.</p>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <button onClick={handleEndClass} style={{ width:"100%", padding:13, borderRadius:24, border:"none", background:"#ea4335", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"'Google Sans',sans-serif" }}>End for All</button>
              <button onClick={()=>{ setShowEndConfirm(false); handleLeave(); }} style={{ width:"100%", padding:12, borderRadius:24, border:"1px solid rgba(255,255,255,.15)", background:"rgba(255,255,255,.06)", color:"rgba(255,255,255,.8)", fontSize:14, cursor:"pointer", fontFamily:"'Google Sans',sans-serif" }}>Leave but Keep Open</button>
              <button onClick={()=>setShowEndConfirm(false)} style={{ width:"100%", padding:12, borderRadius:24, border:"none", background:"transparent", color:"rgba(255,255,255,.4)", fontSize:14, cursor:"pointer", fontFamily:"'Google Sans',sans-serif" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};

export default GuestClassroom;
