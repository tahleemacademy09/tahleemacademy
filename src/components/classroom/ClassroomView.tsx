/*
  ClassroomView.tsx — Tahleem Academy Live Classroom
  Google Meet-style UI · iOS-safe · Persistent call context
*/

import {
  LiveKitRoom, useRoomContext,
  useParticipants, useLocalParticipant, useTracks,
} from "@livekit/components-react";
// @ts-ignore
import "@livekit/components-styles";
import { Track, RoomEvent, ConnectionState, RemoteTrackPublication, RemoteParticipant } from "livekit-client";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { getSignedUrl } from "../../integrations/supabase/storageClient";
import { playJoinSound, playLeaveSound } from "@/lib/soundUtils";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLiveClass } from "@/contexts/LiveClassContext";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Mic, MicOff, Video, VideoOff, Phone, Hand,
  PenTool, MessageCircle, MoreVertical, BookOpen,
  Circle, Loader2, X, Smile, Play, Pause,
  Volume2, ChevronDown, ChevronLeft, ChevronRight, Users, Eye,
  LayoutGrid, AlignJustify, Columns, Rows, Maximize2, Minimize2,
  SwitchCamera, Settings, Check, Wifi,
} from "lucide-react";
import ClassLobby        from "./ClassLobby";
import ClassChatPanel    from "./ClassChatPanel";
import ClassParticipants from "./ClassParticipants";
import ClassPolls        from "./ClassPolls";
import ClassEndScreen    from "./ClassEndScreen";
import LiveQuizOverlay   from "./LiveQuizOverlay";
import PDFViewer         from "./PDFViewer";
import { useIsMobile }   from "@/hooks/use-mobile";
import { useState, useEffect, useRef, useCallback } from "react";

interface ClassroomViewProps { subject: any; onLeave: () => void; onMinimize?: () => void; autoJoin?: boolean; }
type LayoutMode = "grid"|"spotlight"|"horizontal"|"vertical"|"focus";
interface FloatingEmoji { id:number; emoji:string; x:number; sender:string; }
interface RaisedHand   { identity:string; name:string; raisedAt:number; }

const TEAL  = "#0a7c68";
const TEAL2 = "#064E3B";
const DARK  = "#0f1117";
const GLASS = "rgba(15,17,23,0.88)";
const GLASSB= "rgba(255,255,255,0.08)";
const GREEN = "#22c55e";
const RED   = "#ef4444";
const BAR_H = 76;

/* ══════════════════════════════════════════════════════════════════════
   BACKGROUND AUDIO KEEP-ALIVE
   Keeps LiveKit audio alive when the student/teacher backgrounds the tab,
   locks the screen, or switches apps on mobile.

   Layer 1 — <audio> element (near-silent looping WAV)
     Browsers treat a playing <audio> as "active media" → JS thread stays
     alive through screen lock, just like a music app.

   Layer 2 — AudioContext oscillator at 1 Hz, gain = 0
     A second keep-alive signal independent of the <audio> element.

   Layer 3 — setInterval heartbeat every 20 s
     Forces event-loop ticks even when Chrome throttles background timers.

   Layer 4 — visibilitychange / pageshow resume
     Re-starts both layers the moment the user returns to the tab.
   ══════════════════════════════════════════════════════════════════════ */

const _CV_SILENCE_WAV =
  "data:audio/wav;base64," +
  "UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

function useSilentAudioKeepAlive(active: boolean) {
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const acRef      = useRef<AudioContext | null>(null);
  const oscRef     = useRef<OscillatorNode | null>(null);
  const gainRef    = useRef<GainNode | null>(null);
  const hbRef      = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      if (hbRef.current)      { clearInterval(hbRef.current); hbRef.current = null; }
      if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current.src = ""; audioElRef.current = null; }
      try { oscRef.current?.stop(); } catch {}
      oscRef.current = null; gainRef.current = null;
      acRef.current?.close().catch(() => {}); acRef.current = null;
      return;
    }

    // Layer 1 — <audio>
    const startAudioEl = () => {
      if (audioElRef.current) return;
      try {
        const el = new Audio(_CV_SILENCE_WAV);
        el.loop = true; el.volume = 0.001;
        el.play().catch(() => {});
        audioElRef.current = el;
      } catch {}
    };

    // iOS primer — first touch/click unlocks AudioContext
    const prime = () => {
      startAudioEl();
      const ctx = acRef.current;
      if (ctx?.state === "suspended") ctx.resume().catch(() => {});
    };
    ["touchstart","pointerdown","click","keydown"].forEach(ev =>
      document.addEventListener(ev, prime, { once: true, passive: true, capture: true })
    );

    // Layer 2 — AudioContext
    const startAC = () => {
      if (acRef.current && acRef.current.state !== "closed") return;
      try {
        const AC   = window.AudioContext || (window as any).webkitAudioContext;
        const ctx  = new AC();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 1; gain.gain.value = 0;
        osc.connect(gain); gain.connect(ctx.destination); osc.start();
        acRef.current = ctx; oscRef.current = osc; gainRef.current = gain;
      } catch {}
    };

    startAudioEl(); startAC();

    // Layer 3 — heartbeat
    hbRef.current = setInterval(() => {
      const ctx = acRef.current;
      if (ctx?.state === "suspended") ctx.resume().catch(() => {});
      const el = audioElRef.current;
      if (el?.paused) el.play().catch(() => {});
    }, 15_000);

    // Layer 4 — resume on return
    const resume = () => {
      const el = audioElRef.current;
      if (!el)       startAudioEl();
      else if (el.paused) el.play().catch(() => {});
      const ctx = acRef.current;
      if (!ctx || ctx.state === "closed") startAC();
      else if (ctx.state === "suspended") ctx.resume().catch(() => {});
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


const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Google+Sans+Display:wght@400;500;700&display=swap');

  @keyframes cv-spin      { to { transform:rotate(360deg); } }
  @keyframes wb-spin      { to { transform:rotate(360deg); } }
  @keyframes speak-bar    { 0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)} }
  @keyframes pip-pulse    { 0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(.85)} }
  @keyframes slide-up     { from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1} }
  @keyframes slide-right  { from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1} }
  @keyframes fade-in      { from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)} }
  @keyframes fade-up      { from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)} }
  @keyframes emoji-float  { 0%{transform:translateY(0) scale(1);opacity:1}70%{opacity:.9}100%{transform:translateY(-300px) scale(1.4);opacity:0} }
  @keyframes rec-pulse    { 0%,100%{opacity:1}50%{opacity:.3} }
  @keyframes hand-bounce  { 0%,100%{transform:translateY(0)}45%{transform:translateY(-6px)} }
  @keyframes speak-glow   { 0%,100%{box-shadow:0 0 0 2px #1a73e8,0 0 0 4px rgba(26,115,232,.3)}50%{box-shadow:0 0 0 2px #1a73e8,0 0 0 8px rgba(26,115,232,.15)} }
  @keyframes tile-in      { from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)} }
  @keyframes bar-reveal   { from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1} }
  @keyframes ctrl-hover   { from{transform:scale(1)}to{transform:scale(1.08)} }
  @keyframes tooltip-in   { from{opacity:0;transform:translateX(-50%) translateY(6px)}to{opacity:1;transform:translateX(-50%) translateY(0)} }

  * { box-sizing: border-box; }

  [data-lk-theme]{ height:100%!important;display:flex!important;flex-direction:column!important; }

  [data-classroom-root]{
    overscroll-behavior:none;
    -webkit-overflow-scrolling:touch;
    touch-action:pan-y;
    padding-bottom:env(safe-area-inset-bottom,0px);
    font-family:'Google Sans','Roboto',sans-serif;
    background:#202124;
  }
  [data-classroom-root] button{
    -webkit-tap-highlight-color:transparent;
    touch-action:manipulation;
    font-family:'Google Sans','Roboto',sans-serif;
  }
  [data-classroom-root] canvas{-webkit-user-select:none;user-select:none;}

  @supports not (height:100dvh){[data-classroom-root]{height:-webkit-fill-available!important;}}

  /* Scrollbar */
  .cv-bar{scrollbar-width:none;-ms-overflow-style:none;}
  .cv-bar::-webkit-scrollbar{display:none;}
  .cv-bar{will-change:transform;transform:translateZ(0);contain:layout style;}

  /* Tile grid */
  .gm-grid { display:grid; gap:6px; width:100%; height:100%; padding:6px; box-sizing:border-box; }

  /* Participant tile */
  .gm-tile {
    position:relative; border-radius:12px; overflow:hidden;
    background:#2D2E30;
    animation: tile-in .22s cubic-bezier(.34,1.56,.64,1) both;
    transition: box-shadow .2s ease;
  }
  .gm-tile.speaking {
    animation: speak-glow 1.8s ease-in-out infinite;
  }

  /* Control bar button base */
  .gm-ctrl {
    position:relative; display:flex; flex-direction:column;
    align-items:center; gap:4px; background:none; border:none;
    cursor:pointer; padding:0; outline:none;
    -webkit-tap-highlight-color:transparent;
  }
  .gm-ctrl-icon {
    width:48px; height:48px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    transition:background .15s ease, transform .12s ease;
    background:rgba(255,255,255,.1);
  }
  @media (max-width:767px) {
    .gm-ctrl-icon { width:42px; height:42px; }
    .gm-av-main  { width:42px; height:42px; }
    .gm-av-chevron { height:42px; }
  }
  .gm-ctrl:hover .gm-ctrl-icon { background:rgba(255,255,255,.18); transform:scale(1.06); }
  .gm-ctrl.danger .gm-ctrl-icon { background:#ea4335; }
  .gm-ctrl.danger:hover .gm-ctrl-icon { background:#c5352a; }
  .gm-ctrl.active .gm-ctrl-icon { background:rgba(138,180,248,.2); }
  .gm-ctrl-label {
    font-size:10px; font-weight:500; color:rgba(255,255,255,.7);
    white-space:nowrap; letter-spacing:.3px;
    font-family:'Google Sans',sans-serif;
    display:none;
  }
  @media (min-width:768px) {
    .gm-ctrl-label { display:block; }
  }

  /* Tooltip — desktop hover only, never on touch */
  .gm-tooltip {
    position:absolute; bottom:calc(100% + 10px); left:50%;
    transform:translateX(-50%);
    background:rgba(32,33,36,.96); color:#fff;
    font-size:11px; font-weight:500; white-space:nowrap;
    padding:5px 10px; border-radius:6px;
    pointer-events:none; opacity:0;
    font-family:'Google Sans',sans-serif;
    box-shadow:0 2px 12px rgba(0,0,0,.4);
    border:1px solid rgba(255,255,255,.06);
    z-index:9999;
    transition:opacity .12s ease;
  }
  @media (hover:hover) and (pointer:fine) {
    .gm-ctrl:hover .gm-tooltip { opacity:1; }
  }

  /* Speaking waveform */
  .gm-wave { display:flex; align-items:center; gap:2px; height:14px; }
  .gm-wave-bar {
    width:3px; border-radius:2px; background:#1a73e8;
    animation: speak-bar .7s ease-in-out infinite;
  }

  /* Bar animation */
  .gm-bar { animation: bar-reveal .3s cubic-bezier(.34,1.2,.64,1) both; }

  /* Separator */
  .gm-sep { width:1px; height:36px; background:rgba(255,255,255,.1); flex-shrink:0; }

  /* Layout button pill */
  .gm-layout-btn {
    display:flex; align-items:center; gap:5px;
    padding:0 12px; height:30px; border-radius:15px;
    background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.12);
    color:rgba(255,255,255,.9); font-size:12px; font-weight:500;
    cursor:pointer; transition:background .15s;
    font-family:'Google Sans',sans-serif;
  }
  .gm-layout-btn:hover { background:rgba(255,255,255,.15); }

  /* Top badge pill */
  .gm-badge {
    display:inline-flex; align-items:center; gap:5px;
    padding:4px 10px; border-radius:20px; font-size:12px; font-weight:500;
    font-family:'Google Sans',sans-serif;
  }

  /* Mic/Cam merged button */
  .gm-av-group {
    display:flex; align-items:center;
    border-radius:28px; overflow:hidden;
    box-shadow:0 2px 8px rgba(0,0,0,.4);
  }
  .gm-av-main {
    width:48px; height:48px; display:flex; align-items:center; justify-content:center;
    background:rgba(255,255,255,.1); border:none; cursor:pointer; color:#fff;
    transition:background .15s;
  }
  .gm-av-main.off { background:#ea4335; }
  .gm-av-main:hover { background:rgba(255,255,255,.18); }
  .gm-av-main.off:hover { background:#c5352a; }
  .gm-av-chevron {
    width:18px; height:48px; display:flex; align-items:center; justify-content:center;
    border:none; cursor:pointer; color:rgba(255,255,255,.7);
    transition:background .15s; padding-right:2px;
  }
  .gm-av-chevron.off { background:rgba(234,67,53,.7); }
  .gm-av-chevron:not(.off) { background:rgba(255,255,255,.06); }
  .gm-av-chevron:hover { background:rgba(255,255,255,.15); }

  /* Leave pill */
  .gm-leave {
    display:flex; align-items:center; gap:7px;
    padding:0 20px; height:48px; border-radius:24px;
    background:#ea4335; border:none; color:#fff;
    font-size:14px; font-weight:600; cursor:pointer;
    font-family:'Google Sans',sans-serif;
    box-shadow:0 2px 12px rgba(234,67,53,.35);
    transition:background .15s, box-shadow .15s;
    flex-shrink:0;
  }
  .gm-leave:hover { background:#c5352a; box-shadow:0 4px 18px rgba(234,67,53,.5); }

  /* Chat sidebar */
  .gm-sidebar {
    width:360px; background:#2D2E30; border-left:1px solid rgba(255,255,255,.07);
    display:flex; flex-direction:column; flex-shrink:0;
    animation: slide-right .22s cubic-bezier(.34,1.2,.64,1) both;
  }

  /* Avatar circle */
  .gm-avatar {
    border-radius:50%; display:flex; align-items:center; justify-content:center;
    font-weight:700; color:#fff; flex-shrink:0;
    background:linear-gradient(135deg,#1a73e8,#0d47a1);
    font-family:'Google Sans Display',sans-serif;
    letter-spacing:-.5px;
  }

  /* More menu */
  .gm-more-menu {
    position:fixed; background:#2D2E30;
    border:1px solid rgba(255,255,255,.08);
    border-radius:16px; overflow:hidden;
    box-shadow:0 8px 40px rgba(0,0,0,.7);
    min-width:220px; z-index:9200;
    animation:fade-up .14s ease both;
  }
  .gm-more-item {
    width:100%; display:flex; align-items:center; gap:12px;
    padding:13px 18px; background:none; border:none;
    cursor:pointer; color:#e8eaed; font-size:14px;
    font-weight:400; text-align:left; transition:background .1s;
    font-family:'Google Sans',sans-serif;
    border-bottom:1px solid rgba(255,255,255,.04);
  }
  .gm-more-item:last-child { border-bottom:none; }
  .gm-more-item:hover { background:rgba(255,255,255,.08); }

  /* Device picker sheet */
  .gm-sheet {
    position:fixed; background:#2D2E30;
    border:1px solid rgba(255,255,255,.08); border-radius:16px;
    box-shadow:0 16px 48px rgba(0,0,0,.75); overflow:hidden;
    z-index:9200; width:280px;
    animation:fade-up .14s ease both;
  }
  .gm-sheet-item {
    width:100%; display:flex; align-items:center; gap:10px;
    padding:11px 16px; background:none; border:none; cursor:pointer;
    text-align:left; border-bottom:1px solid rgba(255,255,255,.04);
    transition:background .1s; font-family:'Google Sans',sans-serif;
  }
  .gm-sheet-item:hover { background:rgba(255,255,255,.08); }

  /* Emoji tray */
  .gm-emoji-tray {
    position:fixed; left:50%; transform:translateX(-50%);
    background:#2D2E30; border:1px solid rgba(255,255,255,.1);
    border-radius:40px; padding:8px 14px;
    display:flex; gap:4px; z-index:9200;
    box-shadow:0 8px 32px rgba(0,0,0,.6);
    animation:fade-up .14s ease both;
  }
  .gm-emoji-btn {
    font-size:26px; background:none; border:none; cursor:pointer;
    padding:4px 5px; border-radius:12px; line-height:1;
    transition:transform .12s ease, background .1s;
  }
  .gm-emoji-btn:hover { transform:scale(1.3); background:rgba(255,255,255,.08); }
`;

/* ══ RECONNECT MONITOR ══
   Listens to Reconnecting, Reconnected, AND Disconnected events.
   On Android, minimizing kills the WebSocket → LiveKit fires Disconnected
   (not Reconnecting), so we must handle all three.
   visibilitychange also catches the tab coming back from background.       */
/* ── 5-MINUTE MINIMIZE GRACE PERIOD ─────────────────────────────────────
   When the user minimizes / backgrounds the tab, we wait 5 minutes before
   triggering a disconnect. If they come back within 5 minutes the timer is
   cancelled and the session continues seamlessly — matching Google Meet's
   behaviour. Only if the WebSocket itself also drops (Disconnected event)
   AND the grace period has elapsed do we call onDisconnected.             */
const MINIMIZE_GRACE_MS = 10 * 60 * 1000; // 10 minutes

const ReconnectMonitor = ({ onReconnecting, onReconnected, onDisconnected }: {
  onReconnecting: () => void;
  onReconnected:  () => void;
  onDisconnected: () => void;
}) => {
  const room = useRoomContext();
  const graceTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenAt     = useRef<number | null>(null);
  const wsDropped    = useRef(false); // did LiveKit also fire Disconnected?

  useEffect(() => {
    const clearGrace = () => {
      if (graceTimer.current) { clearTimeout(graceTimer.current); graceTimer.current = null; }
      hiddenAt.current = null;
      wsDropped.current = false;
    };

    const handleDisconnect = () => {
      wsDropped.current = true;
      // If still within grace window — wait; grace timer will call onDisconnected
      if (graceTimer.current) return;
      // No grace window active (tab is visible) → reconnect immediately
      onDisconnected();
    };

    room.on(RoomEvent.Reconnecting, onReconnecting);
    room.on(RoomEvent.Reconnected,  onReconnected);
    room.on(RoomEvent.Disconnected, handleDisconnect);

    const onVis = async () => {
      if (document.visibilityState === "hidden") {
        // Tab going to background — start grace timer
        hiddenAt.current = Date.now();
        graceTimer.current = setTimeout(() => {
          graceTimer.current = null;
          // 5 minutes elapsed in background — disconnect if WS also dropped
          if (wsDropped.current || room.state === ConnectionState.Disconnected) {
            onDisconnected();
          }
          // If somehow still connected after 5 min — leave as-is; LiveKit
          // will reconnect on its own when the tab returns.
        }, MINIMIZE_GRACE_MS);
        return;
      }

      // Tab coming back to foreground
      clearGrace();
      if (room.state === ConnectionState.Disconnected) { onDisconnected(); return; }
      try {
        if (room.state === ConnectionState.Connected) {
          // NOTE: mic restoration is handled by MicKeepAliveFromContext which reads
          // live mic state from context and never cycles an intentionally-muted mic.
          onReconnected();
        }
      } catch {}
    };

    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearGrace();
      room.off(RoomEvent.Reconnecting, onReconnecting);
      room.off(RoomEvent.Reconnected,  onReconnected);
      room.off(RoomEvent.Disconnected, handleDisconnect);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [room, onReconnecting, onReconnected, onDisconnected]);
  return null;
};

/* ══ WB SYNC BRIDGE ══ */
const WbSyncBridge = ({ wbOpen, isTeacher }: { wbOpen: boolean; isTeacher: boolean }) => {
  const room = useRoomContext();
  const prevRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!isTeacher) return;
    if (prevRef.current === null) { prevRef.current = wbOpen; return; }
    if (prevRef.current === wbOpen) return;
    prevRef.current = wbOpen;
    try {
      const msg = JSON.stringify({ type: wbOpen ? "wb_open" : "wb_close" });
      room.localParticipant.publishData(new TextEncoder().encode(msg), { reliable: true });
    } catch {}
  }, [wbOpen, isTeacher, room]);
  return null;
};

/* ══ ADMIN MUTE LISTENER ══
   Students only. Handles:
   - admin_mute_all  → mute everyone
   - force_mute      → mute a specific participant (by identity)
   - force_cam_off   → disable camera for a specific participant          */
const AdminMuteListener = ({ isPrivileged }: { isPrivileged: boolean }) => {
  const room = useRoomContext();
  useEffect(() => {
    if (isPrivileged) return;
    const h = (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        const myIdentity = room.localParticipant.identity;
        if (msg.type === "admin_mute_all") {
          room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
          toast({ title: "🔇 Muted by teacher" });
        }
        if (msg.type === "force_mute" && (!msg.target || msg.target === myIdentity)) {
          room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
          toast({ title: "🔇 Your mic was muted by the teacher" });
        }
        if (msg.type === "force_cam_off" && (!msg.target || msg.target === myIdentity)) {
          room.localParticipant.setCameraEnabled(false).catch(() => {});
          toast({ title: "📷 Your camera was turned off by the teacher" });
        }
      } catch {}
    };
    room.on(RoomEvent.DataReceived, h);
    return () => { room.off(RoomEvent.DataReceived, h); };
  }, [room, isPrivileged]);
  return null;
};

// ═══════════════════════════════════════════════════════════════════════════════
// VolumeBooster — routes every remote audio track through a Web Audio pipeline:
//   MediaStreamSource → GainNode (2.5×) → DynamicsCompressor → speakers
//
// Why this exists:
//   1. LiveKit publishes at 64 kbps, but browser default output can still be
//      quiet. A GainNode amplifies every remote voice without clipping.
//   2. DynamicsCompressor auto-levels loud and soft voices so everyone is
//      consistently audible.
//   3. We deliberately SKIP the local participant so you never hear yourself.
//   4. Each track gets its own source node so 2+ people can speak at once
//      with zero interference — Web Audio mixes them natively.
// ═══════════════════════════════════════════════════════════════════════════════
const VolumeBooster = () => {
  const room = useRoomContext();
  const tracks = useTracks([Track.Source.Microphone, Track.Source.ScreenShareAudio], { onlySubscribed: true });

  const acRef        = useRef<AudioContext | null>(null);
  const gainRef      = useRef<GainNode | null>(null);
  const compRef      = useRef<DynamicsCompressorNode | null>(null);
  // Map trackSid → { source, audioEl } so we can clean up properly
  const nodesRef     = useRef<Map<string, { source: MediaStreamAudioSourceNode; el: HTMLAudioElement }>>(new Map());
  // FIX: track whether Web Audio pipeline is usable; fall back to plain <audio> if not
  const webAudioOkRef = useRef<boolean>(true);

  // ── Helper: resume AudioContext — must be called from within a user-gesture
  //    handler OR re-tried after interaction since mobile browsers (Android Chrome,
  //    iOS Safari) silently swallow resume() calls that arrive outside a gesture.
  const tryResumeAC = () => {
    const ac = acRef.current;
    if (ac && ac.state === "suspended") {
      ac.resume().catch(() => { webAudioOkRef.current = false; });
    }
  };

  // ── 1. Build the Web Audio pipeline once ────────────────────────────────────
  useEffect(() => {
    try {
      const ac = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
      acRef.current = ac;

      // Amplify: 3.5× — noticeably louder without clipping on most voices
      const gain = ac.createGain();
      gain.gain.value = 3.5;
      gainRef.current = gain;

      // Compressor: tuned for voice — keeps everyone at consistent volume
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -18;   // start compressing earlier (−18 dBFS)
      comp.knee.value      = 10;    // tighter knee = more transparent compression
      comp.ratio.value     = 12;    // 12:1 — stronger levelling for voice
      comp.attack.value    = 0.001; // 1 ms — catches transients instantly
      comp.release.value   = 0.15;  // 150 ms — quick recovery, no pumping
      compRef.current = comp;

      // Pipeline: source(s) → gain → compressor → speakers
      gain.connect(comp);
      comp.connect(ac.destination);
    } catch {
      webAudioOkRef.current = false;
    }

    // FIX: resume AudioContext on ANY user interaction — { once: false } so it keeps
    // retrying on every tap/click until the context is running. On mobile the first
    // gesture may fire before the AC is created, so we re-register persistently.
    const resume = () => tryResumeAC();
    document.addEventListener("click",      resume, { passive: true });
    document.addEventListener("touchstart", resume, { passive: true });
    document.addEventListener("touchend",   resume, { passive: true });
    document.addEventListener("keydown",    resume, { passive: true });

    return () => {
      document.removeEventListener("click",      resume);
      document.removeEventListener("touchstart", resume);
      document.removeEventListener("touchend",   resume);
      document.removeEventListener("keydown",    resume);
      acRef.current?.close().catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 2. Connect / disconnect tracks as participants join or leave ─────────────
  useEffect(() => {
    const ac   = acRef.current;
    const gain = gainRef.current;

    // FIX: Always attempt to resume when new tracks arrive — this is the critical
    // path where mobile browsers need the AudioContext running. If the AC is still
    // suspended here it means no user gesture has fired yet; we attempt anyway (it
    // may succeed if this effect runs inside a React synthetic event flush) and fall
    // back to plain unmuted <audio> elements so students always hear the teacher.
    if (ac && ac.state === "suspended") {
      ac.resume().catch(() => { webAudioOkRef.current = false; });
    }

    const activeIds = new Set<string>();

    for (const ref of tracks) {
      // Never play back your own microphone
      if (ref.participant.isLocal) continue;

      const pub = ref.publication as RemoteTrackPublication | undefined;
      if (!pub?.track?.mediaStreamTrack) continue;

      const sid = pub.trackSid;
      activeIds.add(sid);

      if (!nodesRef.current.has(sid)) {
        const ms = new MediaStream([pub.track.mediaStreamTrack]);

        // FIX: Always create and play an unmuted <audio> element as the primary
        // playback path. Web Audio (createMediaStreamSource) is used IN ADDITION
        // for gain/compression, but the <audio> element guarantees sound on browsers
        // where the AudioContext is blocked (e.g. Android WebView, iOS before gesture).
        const el = document.createElement("audio");
        el.srcObject  = ms;
        el.autoplay   = true;
        // NOT muted — this is the reliable fallback so students always hear the teacher
        el.muted      = false;
        el.volume     = 1.0;
        // Attach to DOM so mobile browsers don't suppress it
        el.style.display = "none";
        document.body.appendChild(el);
        el.play().catch(() => {});

        let source: MediaStreamAudioSourceNode | null = null;
        if (ac && gain && webAudioOkRef.current && ac.state === "running") {
          try {
            // Web Audio pipeline adds gain+compression on top of the <audio> element.
            // Use a separate MediaStream source — do NOT use createMediaElementSource
            // because that would silence the <audio> element itself.
            const ms2 = new MediaStream([pub.track.mediaStreamTrack]);
            source = ac.createMediaStreamSource(ms2);
            source.connect(gain);
          } catch { source = null; }
        }

        nodesRef.current.set(sid, { source: source as any, el });
      }
    }

    // Disconnect tracks that are no longer subscribed
    for (const [sid, { source, el }] of nodesRef.current) {
      if (!activeIds.has(sid)) {
        try { source?.disconnect(); } catch {}
        try { el.pause(); el.srcObject = null; el.remove(); } catch {}
        nodesRef.current.delete(sid);
      }
    }
  }, [tracks]);

  // ── 3. Full cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      for (const { source, el } of nodesRef.current.values()) {
        try { source?.disconnect(); } catch {}
        try { el.pause(); el.srcObject = null; el.remove(); } catch {}
      }
      nodesRef.current.clear();
    };
  }, []);

  return null; // pure audio processing — no visible UI
};

const MediaAutoPublish = ({ lobbyMic = false, lobbyCam = false }: { lobbyMic?: boolean; lobbyCam?: boolean }) => {
  const room = useRoomContext();
  // FIX BUG 5: Capture the latest lobby values in a ref so the async effect always
  // reads the current state even if React batches the prop update after mount.
  // The empty dependency array is intentional — we only want this to run once on
  // join, but we read from the ref (not the closure) to get fresh values.
  const optsRef = useRef({ lobbyMic, lobbyCam });
  optsRef.current = { lobbyMic, lobbyCam }; // keep ref fresh every render

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      // Slightly longer delay so LiveKit finishes its own track setup first
      await new Promise(r => setTimeout(r, 450));
      if (cancelled) return;
      try {
        const lp = room.localParticipant;
        const { lobbyMic: mic, lobbyCam: cam } = optsRef.current; // read latest via ref
        // Apply the exact lobby choices — not a blanket disable
        if (lp.isMicrophoneEnabled !== mic) await lp.setMicrophoneEnabled(mic);
        if (lp.isCameraEnabled     !== cam) await lp.setCameraEnabled(cam);
      } catch {}
    };
    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // safe: reads optsRef which is always up-to-date
  return null;
};

/* ══ ROOM DATA LISTENER ══ */
const RoomDataListener = ({ onWbOpen,onWbClose,strokesBuffer,onMatOpen,onMatClose,onWbAllowWrite,onRecAllowed,onEmojiReact,onGroupRecite,onHandRaise,onAdminMuteAll,onClassEnded,roomRef }:any) => {
  const room = useRoomContext();
  useEffect(() => {
    // FIX BUG 10: Store room in a React ref instead of window.__lkRoom__ global.
    // The global breaks when multiple tabs run simultaneously (each overwrites the other).
    if (roomRef) roomRef.current = room;
    const h = (payload:Uint8Array,participant?:any) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if(msg.type==="wb_open")          onWbOpen();
        if(msg.type==="wb_close")         onWbClose();
        if(msg.type==="wb_strokes")       strokesBuffer.current=msg.strokes;
        if(msg.type==="wb_clear")         strokesBuffer.current=[];
        if(msg.type==="mat_open")         onMatOpen?.(msg.material);
        if(msg.type==="mat_close")        onMatClose?.();
        if(msg.type==="wb_allow_write")   onWbAllowWrite?.(msg.allow);
        if(msg.type==="rec_allowed")      onRecAllowed?.(msg.allow);
        if(msg.type==="emoji_react")      onEmojiReact?.(msg.emoji, msg.sender);
        if(msg.type==="group_recite")     onGroupRecite?.(msg.active);
        if(msg.type==="hand_raise")       onHandRaise?.(msg.identity||participant?.identity, msg.name, msg.raised);
        if(msg.type==="admin_mute_all")   onAdminMuteAll?.();
        if(msg.type==="class_ended")      onClassEnded?.();
      } catch {}
    };
    room.on(RoomEvent.DataReceived,h);
    return ()=>{ room.off(RoomEvent.DataReceived,h); if(roomRef) roomRef.current=null; };
  },[room]);
  return null;
};

/* ══ FLOATING EMOJI LAYER ══ */
const FloatingEmojiLayer=({emojis}:{emojis:FloatingEmoji[]})=>(
  <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:40,overflow:"hidden"}}>
    {emojis.map(fe=>(
      <div key={fe.id} style={{
        position:"absolute", bottom:90, left:`${fe.x}%`,
        display:"flex",flexDirection:"column",alignItems:"center",gap:3,
        animation:"emoji-float 2.6s ease-out forwards",
        userSelect:"none",
      }}>
        <span style={{fontSize:38,filter:"drop-shadow(0 2px 6px rgba(0,0,0,.55))",lineHeight:1}}>{fe.emoji}</span>
        {fe.sender&&<span style={{fontSize:10,fontWeight:700,color:"#fff",background:"rgba(0,0,0,.55)",borderRadius:8,padding:"1px 6px",whiteSpace:"nowrap",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis"}}>{fe.sender}</span>}
      </div>
    ))}
  </div>
);

/* ══ RAISED HANDS OVERLAY ══ */
const RaisedHandsOverlay=({hands}:{hands:RaisedHand[]})=>{
  if(!hands.length)return null;
  return(
    <div style={{position:"absolute",top:10,left:10,zIndex:45,display:"flex",flexDirection:"column",gap:5,pointerEvents:"none"}}>
      {hands.map(h=>(
        <div key={h.identity} style={{display:"flex",alignItems:"center",gap:6,background:"rgba(251,191,36,.92)",borderRadius:20,padding:"5px 12px 5px 8px",boxShadow:"0 2px 12px rgba(0,0,0,.4)"}}>
          <span style={{fontSize:16,animation:"hand-bounce 1.2s ease-in-out infinite"}}>✋</span>
          <span style={{fontSize:12,fontWeight:800,color:"#1a1a1a",whiteSpace:"nowrap",maxWidth:130,overflow:"hidden",textOverflow:"ellipsis"}}>{h.name}</span>
        </div>
      ))}
    </div>
  );
};

/* ══ GROUP RECITE PERMISSION DIALOG ══ */
const GroupRecitePermDialog=({onAccept,onDecline}:{onAccept:()=>void;onDecline:()=>void})=>createPortal(
  <div style={{position:"fixed",inset:0,zIndex:9600,background:"rgba(0,0,0,.72)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div style={{background:"#17202a",borderRadius:20,padding:"28px 24px",maxWidth:340,width:"100%",boxShadow:"0 24px 60px rgba(0,0,0,.7)",border:"1px solid rgba(255,255,255,.1)",animation:"fade-in .18s ease",textAlign:"center"}}>
      <div style={{fontSize:44,marginBottom:12}}>🎙️</div>
      <h2 style={{fontSize:17,fontWeight:800,color:"#fff",marginBottom:8}}>Group Recitation</h2>
      <p style={{fontSize:13,color:"rgba(255,255,255,.55)",marginBottom:22,lineHeight:1.55}}>
        The teacher has started Group Recitation.<br/>Allow your microphone so everyone can recite together?
      </p>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onDecline} style={{flex:1,padding:"11px",borderRadius:12,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.07)",color:"rgba(255,255,255,.7)",fontSize:13,fontWeight:600,cursor:"pointer"}}>Not Now</button>
        <button onClick={onAccept} style={{flex:1,padding:"11px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${TEAL2},${TEAL})`,color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer"}}>Allow Mic ✓</button>
      </div>
    </div>
  </div>,document.body
);

/* ══ LAYOUT SWITCHER — Google Meet pill style ══ */
const LAYOUT_OPTIONS:{mode:LayoutMode;icon:any;label:string}[]=[
  {mode:"grid",      icon:LayoutGrid,    label:"Grid"},
  {mode:"spotlight", icon:Maximize2,     label:"Spotlight"},
  {mode:"horizontal",icon:AlignJustify,  label:"Side by side"},
  {mode:"vertical",  icon:Columns,       label:"Stacked"},
  {mode:"focus",     icon:Rows,          label:"Focus"},
];
const LayoutSwitcher=({layout,onChange}:{layout:LayoutMode;onChange:(m:LayoutMode)=>void})=>{
  const[open,setOpen]=useState(false);
  const cur=LAYOUT_OPTIONS.find(o=>o.mode===layout)||LAYOUT_OPTIONS[0];
  return(
    <div style={{position:"relative"}}>
      <button className="gm-layout-btn" onClick={()=>setOpen(v=>!v)} title="Change layout">
        <cur.icon style={{width:13,height:13,opacity:.8}}/>{cur.label}
        <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor" style={{opacity:.5,marginLeft:2}}><path d="M4 5L0 0h8z"/></svg>
      </button>
      {open&&createPortal(
        <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:9200}}>
          <div onClick={e=>e.stopPropagation()} style={{
            position:"fixed",top:60,right:14,
            background:"#2D2E30",border:"1px solid rgba(255,255,255,.08)",
            borderRadius:12,overflow:"hidden",minWidth:180,
            boxShadow:"0 8px 36px rgba(0,0,0,.65)",animation:"fade-in .15s ease",
          }}>
            {LAYOUT_OPTIONS.map(o=>(
              <button key={o.mode} onClick={()=>{onChange(o.mode);setOpen(false);}}
                style={{
                  width:"100%",display:"flex",alignItems:"center",gap:10,padding:"11px 16px",
                  background:layout===o.mode?"rgba(138,180,248,.12)":"none",
                  border:"none",cursor:"pointer",
                  color:layout===o.mode?"#8ab4f8":"rgba(255,255,255,.75)",
                  fontSize:13,fontWeight:layout===o.mode?600:400,
                  borderBottom:"1px solid rgba(255,255,255,.04)",
                  fontFamily:"'Google Sans',sans-serif",
                  transition:"background .1s",
                }}>
                <o.icon style={{width:15,height:15,opacity:.7}}/>
                {o.label}
                {layout===o.mode&&<span style={{marginLeft:"auto",fontSize:11,color:"#8ab4f8"}}>✓</span>}
              </button>
            ))}
          </div>
        </div>,document.body
      )}
    </div>
  );
};

/* ══ MIC KEEP-ALIVE ══
   WhatsApp-style: when Android returns from background/screen-lock,
   the mic track may be suspended. This re-enables it automatically.
   Also fires a silent getUserMedia ping every 25 s to prevent Android
   from revoking the mic permission while the app is backgrounded.    */
const MicKeepAlive = ({ micWasEnabled }: { micWasEnabled: boolean }) => {
  const room = useRoomContext();
  const micWasEnabledRef = useRef(micWasEnabled);
  micWasEnabledRef.current = micWasEnabled;

  useEffect(() => {
    const restoreMic = async () => {
      if (document.visibilityState !== "visible") return;
      const lp = room?.localParticipant;
      if (!lp) return;
      // If mic was on before backgrounding, re-enable it
      if (micWasEnabledRef.current && !lp.isMicrophoneEnabled) {
        try { await lp.setMicrophoneEnabled(true); } catch {}
      }
      // Resume any suspended mic tracks directly
      const micPub = lp.getTrackPublication(Track.Source.Microphone);
      const track = micPub?.track?.mediaStreamTrack;
      if (track && track.readyState === "ended" && micWasEnabledRef.current) {
        // Track was killed by OS — republish
        try {
          await lp.setMicrophoneEnabled(false);
          await new Promise(r => setTimeout(r, 150));
          await lp.setMicrophoneEnabled(true);
        } catch {}
      }
    };

    // Ping: keeps mic permission alive on Android while backgrounded
    const pingMic = async () => {
      if (document.visibilityState === "visible") return;
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        s.getTracks().forEach(t => t.stop()); // immediately release — just a keep-alive ping
      } catch {}
    };

    const pingInterval = setInterval(pingMic, 25_000);
    document.addEventListener("visibilitychange", restoreMic);
    window.addEventListener("focus", restoreMic);

    return () => {
      clearInterval(pingInterval);
      document.removeEventListener("visibilitychange", restoreMic);
      window.removeEventListener("focus", restoreMic);
    };
  }, [room]);

  return null;
};


/* ══ MIC KEEP-ALIVE — CONTEXT-AWARE WRAPPER ══
   MicKeepAlive takes a static boolean snapshot (micWasEnabled) but the mic
   state changes during the call. This wrapper reads the live micEnabled value
   from LiveClassContext on every render so the keep-alive always has current state.
   Usage: <MicKeepAliveFromContext /> — replaces <MicKeepAlive micWasEnabled={lobbyMic}/> */
const MicKeepAliveFromContext = () => {
  const { micEnabled } = useLiveClass();
  return <MicKeepAlive micWasEnabled={micEnabled} />;
};

const GroupReciteAutoMic=({active,isPrivileged}:{active:boolean;isPrivileged:boolean})=>{
  const room=useRoomContext();
  useEffect(()=>{
    if(!room?.localParticipant)return;
    if(active){
      room.localParticipant.setMicrophoneEnabled(true).catch(()=>{});
    }
    if(!active&&!isPrivileged){
      room.localParticipant.setMicrophoneEnabled(false).catch(()=>{});
    }
  },[active,isPrivileged,room]);
  return null;
};


const Whiteboard = ({room,onClose,isTeacher,initialStrokes,subjectId,canStudentWrite}:any) => {
  const canDraw=isTeacher||canStudentWrite;
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const drawing=useRef(false);
  const strokesRef=useRef<any[]>([]);
  const saveTimer=useRef<any>(null);
  const [color,setColor]=useState("#1a1a1a");
  const [lineWidth,setLineWidth]=useState(4);
  const [tool,setTool]=useState<"pen"|"eraser">("pen");
  const [busy,setBusy]=useState(true);
  const redraw=useCallback(()=>{
    const cv=canvasRef.current;if(!cv)return;
    const ctx=cv.getContext("2d");if(!ctx)return;
    ctx.fillStyle="#fff";ctx.fillRect(0,0,cv.width,cv.height);
    for(const s of strokesRef.current){
      if(!s.points||s.points.length<2)continue;
      ctx.beginPath();ctx.strokeStyle=s.color;ctx.lineWidth=s.lineWidth;
      ctx.lineCap="round";ctx.lineJoin="round";
      ctx.moveTo(s.points[0].x,s.points[0].y);
      for(let i=1;i<s.points.length;i++)ctx.lineTo(s.points[i].x,s.points[i].y);
      ctx.stroke();
    }
  },[]);
  useEffect(()=>{(async()=>{
    try{const{data}=await supabase.from("subject_whiteboard"as any).select("strokes").eq("subject_id",subjectId).maybeSingle();
      if((data as any)?.strokes?.length)strokesRef.current=(data as any).strokes;
      else if(initialStrokes?.length)strokesRef.current=initialStrokes;
    }catch{if(initialStrokes?.length)strokesRef.current=initialStrokes;}
    setBusy(false);setTimeout(redraw,40);
  })();},[]);
  const save=useCallback(()=>{
    if(!canDraw)return;clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(async()=>{try{await supabase.from("subject_whiteboard"as any).upsert({subject_id:subjectId,strokes:strokesRef.current,updated_at:new Date().toISOString()},{onConflict:"subject_id"});}catch{}},1200);
  },[isTeacher,subjectId]);
  useEffect(()=>{
    if(!room)return;
    const h=(payload:Uint8Array)=>{try{const msg=JSON.parse(new TextDecoder().decode(payload));if(msg.type==="wb_strokes"){strokesRef.current=msg.strokes;redraw();}if(msg.type==="wb_clear"){strokesRef.current=[];redraw();}}catch{}};
    room.on(RoomEvent.DataReceived,h);return()=>room.off(RoomEvent.DataReceived,h);
  },[room,redraw]);
  const broadcast=useCallback((msg:object)=>{try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify(msg)),{reliable:true});}catch{}},[room]);
  const getPos=(e:React.PointerEvent<HTMLCanvasElement>)=>{const r=canvasRef.current!.getBoundingClientRect();return{x:(e.clientX-r.left)*(canvasRef.current!.width/r.width),y:(e.clientY-r.top)*(canvasRef.current!.height/r.height)};};
  const onDown=(e:React.PointerEvent<HTMLCanvasElement>)=>{if(!canDraw)return;drawing.current=true;(e.target as any).setPointerCapture(e.pointerId);strokesRef.current.push({color:tool==="eraser"?"#fff":color,lineWidth:tool==="eraser"?28:lineWidth,points:[getPos(e)]});};
  const onMove=(e:React.PointerEvent<HTMLCanvasElement>)=>{if(!drawing.current||!canDraw)return;const s=strokesRef.current[strokesRef.current.length-1];if(s){s.points.push(getPos(e));redraw();}};
  const onUp=()=>{if(!canDraw||!drawing.current)return;drawing.current=false;broadcast({type:"wb_strokes",strokes:strokesRef.current});save();};
  const clearBoard=()=>{if(!canDraw)return;strokesRef.current=[];redraw();broadcast({type:"wb_clear"});save();};
  const COLORS=["#1a1a1a","#EF4444","#3B82F6","#22C55E","#F59E0B","#8B5CF6","#EC4899","#ffffff"];
  return createPortal(
    <div style={{position:"fixed",inset:0,zIndex:9999,background:"#f8f8f8",display:"flex",flexDirection:"column"}}>
      <div style={{background:`linear-gradient(135deg,${TEAL2},${TEAL})`,display:"flex",alignItems:"center",gap:8,padding:"8px 12px",flexShrink:0,boxShadow:"0 2px 16px rgba(0,0,0,.4)",overflowX:"auto"as const}}>
        <button onClick={onClose} style={{width:34,height:34,borderRadius:10,background:"rgba(255,255,255,.15)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",flexShrink:0}}><X style={{width:15,height:15}}/></button>
        <PenTool style={{width:14,height:14,color:"rgba(255,255,255,.55)",flexShrink:0}}/>
        <span style={{fontSize:13,fontWeight:700,color:"#fff",flexShrink:0,marginRight:4}}>Whiteboard{!canDraw&&<span style={{fontSize:10,opacity:.4,marginLeft:4}}>View only</span>}</span>
        {canDraw&&<>
          {[{id:"pen",icon:"✏️"},{id:"eraser",icon:"⬜"}].map(t=>(<button key={t.id} onClick={()=>setTool(t.id as any)} style={{width:30,height:30,borderRadius:8,border:"none",background:tool===t.id?"rgba(255,255,255,.28)":"rgba(255,255,255,.1)",fontSize:14,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>{t.icon}</button>))}
          {COLORS.map(col=>(<button key={col} onClick={()=>{setColor(col);setTool("pen");}} style={{width:20,height:20,borderRadius:"50%",background:col,border:color===col&&tool==="pen"?"3px solid #fff":"2px solid rgba(255,255,255,.2)",cursor:"pointer",flexShrink:0}}/>))}
          <input type="range" min={1} max={24} value={lineWidth} onChange={e=>setLineWidth(+e.target.value)} style={{width:52,accentColor:"#fff",flexShrink:0}}/>
          {isTeacher&&<button onClick={clearBoard} style={{height:28,padding:"0 10px",borderRadius:8,border:"none",background:"#EF4444",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>✕ Clear</button>}
        </>}
      </div>
      <div style={{flex:1,position:"relative",overflow:"hidden",background:"#fff"}}>
        {busy&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"#fff",zIndex:5}}><Loader2 style={{width:32,height:32,color:TEAL,animation:"wb-spin .8s linear infinite"}}/></div>}
        <canvas ref={canvasRef} width={1600} height={1000} style={{width:"100%",height:"100%",display:"block",cursor:canDraw?(tool==="eraser"?"cell":"crosshair"):"default",touchAction:"none"}} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onPointerCancel={onUp}/>
      </div>
    </div>,document.body
  );
};
const WhiteboardBridge=({onClose,isTeacher,initialStrokes,subjectId,canStudentWrite}:any)=>{const room=useRoomContext();return<Whiteboard room={room} onClose={onClose} isTeacher={isTeacher} initialStrokes={initialStrokes} subjectId={subjectId} canStudentWrite={canStudentWrite}/>;};

/* ══ MATERIAL VIEWER ══ */
/* ══ MATERIAL PICKER ══ */
const MaterialPicker=({subjectId,onShare,onClose}:any)=>{
  const[mats,setMats]=useState<any[]>([]);const[busy,setBusy]=useState(true);
  useEffect(()=>{supabase.from("subject_materials").select("*").eq("subject_id",subjectId).order("created_at",{ascending:false}).then(({data})=>{setMats(data||[]);setBusy(false);});},[subjectId]);
  return createPortal(<div style={{position:"fixed",inset:0,zIndex:9997,background:"rgba(0,0,0,.72)",backdropFilter:"blur(8px)",display:"flex",alignItems:"flex-end"}} onClick={onClose}>
    <div style={{width:"100%",background:"#17202a",borderRadius:"22px 22px 0 0",maxHeight:"70vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
      <div style={{padding:"14px 18px",borderBottom:"1px solid rgba(255,255,255,.08)",display:"flex",alignItems:"center",gap:10}}>
        <BookOpen style={{width:17,height:17,color:TEAL}}/><span style={{color:"#fff",fontWeight:700,fontSize:15,flex:1}}>Share Material with Class</span>
        <button onClick={onClose} style={{background:"none",border:"none",color:"rgba(255,255,255,.4)",cursor:"pointer"}}><X style={{width:17,height:17}}/></button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"6px 0"}}>
        {busy&&<div style={{display:"flex",justifyContent:"center",padding:28}}><Loader2 style={{width:24,height:24,color:TEAL,animation:"wb-spin .8s linear infinite"}}/></div>}
        {!busy&&!mats.length&&<p style={{textAlign:"center",padding:"28px",color:"rgba(255,255,255,.35)",fontSize:14}}>No materials for this subject</p>}
        {mats.map(m=>(<button key={m.id} onClick={()=>onShare(m)} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"13px 18px",background:"none",border:"none",cursor:"pointer",textAlign:"left"as const,borderBottom:"1px solid rgba(255,255,255,.06)"}}>
          <div style={{width:40,height:40,borderRadius:10,background:"rgba(10,124,104,.3)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><BookOpen style={{width:17,height:17,color:"#4ade80"}}/></div>
          <div style={{flex:1,minWidth:0}}><p style={{color:"#fff",fontWeight:600,fontSize:14,margin:"0 0 3px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"as const}}>{m.title||m.name||"Untitled"}</p><p style={{color:"rgba(255,255,255,.35)",fontSize:11,margin:0,textTransform:"capitalize"as const}}>{m.material_type||"file"}</p></div>
          <span style={{fontSize:12,color:TEAL,fontWeight:700}}>Share →</span>
        </button>))}
      </div>
    </div>
  </div>,document.body);
};

/* ══ MATERIAL TYPE ICONS ══ */
const MAT_TYPE_ICON: Record<string, string> = {
  pdf:      "📄",
  PDF:      "📄",
  video:    "🎬",
  Video:    "🎬",
  audio:    "🎵",
  Audio:    "🎵",
  image:    "🖼️",
  Image:    "🖼️",
  link:     "🔗",
  Link:     "🔗",
  text:     "📝",
  Text:     "📝",
  document: "📝",
  Document: "📝",
};

/* ══ URL → BEST EMBEDDABLE URL ══ */
function toMaterialEmbedUrl(url: string): {
  embedUrl: string;
  kind: "youtube" | "gdrive" | "pdf" | "video" | "audio" | "image" | "doc" | "iframe";
} {
  if (!url) return { embedUrl: "", kind: "iframe" };

  // YouTube
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  if (ytMatch)
    return { embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0`, kind: "youtube" };

  // Google Drive /file/d/ID/view → /file/d/ID/preview
  const gdMatch = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if (gdMatch)
    return { embedUrl: `https://drive.google.com/file/d/${gdMatch[1]}/preview`, kind: "gdrive" };
  const gdMatch2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (gdMatch2)
    return { embedUrl: `https://drive.google.com/file/d/${gdMatch2[1]}/preview`, kind: "gdrive" };

  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";

  if (ext === "pdf") {
    return { embedUrl: url, kind: "pdf" };
  }
  if (["mp4","webm","mov","m4v","avi","mkv"].includes(ext))
    return { embedUrl: url, kind: "video" };
  if (["mp3","wav","m4a","aac","ogg","flac","opus"].includes(ext))
    return { embedUrl: url, kind: "audio" };
  if (["jpg","jpeg","png","gif","webp","svg","avif","bmp"].includes(ext))
    return { embedUrl: url, kind: "image" };
  if (["doc","docx","xls","xlsx","ppt","pptx","odt","ods","odp","csv","rtf"].includes(ext))
    return {
      embedUrl: `https://docs.google.com/gviewer?url=${encodeURIComponent(url)}&embedded=true`,
      kind: "doc",
    };

  return { embedUrl: url, kind: "iframe" };
}

/* ══ RESUME POSITION HELPERS ══ */
const RESUME_KEY=(id:string)=>`mat-resume-${id}`;
function saveResume(id:string,data:{time?:number;page?:number}){
  try{localStorage.setItem(RESUME_KEY(id),JSON.stringify({...data,at:Date.now()}));}catch{}
}
function loadResume(id:string):{time?:number;page?:number}|null{
  try{const raw=localStorage.getItem(RESUME_KEY(id));if(!raw)return null;return JSON.parse(raw);}
  catch{return null;}
}

/* ══ IN-CLASS MATERIAL VIEWER ══
   Renders INSIDE the content area (position:absolute) so the footer and top bar
   always remain visible. Has an opt-in fullscreen button that expands to the full
   viewport when needed. Saves / restores video time and PDF page automatically.   */
const InClassMaterialViewer=({material,onClose,isTeacher=false}:any)=>{
  const rawUrl=material.file_url||material.url||"";
  const matId=material.id||rawUrl;

  // ── resolve Supabase storage path to a signed/public URL ─────────────────
  const [resolvedUrl, setResolvedUrl] = useState<string>(
    rawUrl.startsWith("http") ? rawUrl : ""
  );
  const [urlLoading, setUrlLoading] = useState(!rawUrl.startsWith("http"));
  useEffect(()=>{
    if(rawUrl.startsWith("http")){ setResolvedUrl(rawUrl); setUrlLoading(false); return; }
    setUrlLoading(true);
    getSignedUrl(rawUrl).then(signed=>{
      setResolvedUrl(signed||rawUrl);
      setUrlLoading(false);
    }).catch(()=>{ setResolvedUrl(rawUrl); setUrlLoading(false); });
  },[rawUrl]);

  const url=resolvedUrl;
  const {embedUrl,kind}=toMaterialEmbedUrl(url);

  // ── resume position ──────────────────────────────────────────────────────
  const resume=loadResume(matId);
  const videoRef=useRef<HTMLVideoElement>(null);
  const iframeRef=useRef<HTMLIFrameElement>(null);
  const pdfSrc=embedUrl;

  // Restore video time on load
  useEffect(()=>{
    if(kind!=="video"||!videoRef.current)return;
    const el=videoRef.current;
    const onLoaded=()=>{if(resume?.time&&isFinite(resume.time))el.currentTime=resume.time;};
    el.addEventListener("loadedmetadata",onLoaded);
    return()=>el.removeEventListener("loadedmetadata",onLoaded);
  },[]);

  // Save video time on unmount and periodically
  useEffect(()=>{
    if(kind!=="video")return;
    const iv=setInterval(()=>{
      if(videoRef.current&&isFinite(videoRef.current.currentTime)&&videoRef.current.currentTime>0)
        saveResume(matId,{time:videoRef.current.currentTime});
    },3000);
    return()=>{
      clearInterval(iv);
      if(videoRef.current&&videoRef.current.currentTime>0)
        saveResume(matId,{time:videoRef.current.currentTime});
    };
  },[matId,kind]);

  // ── fullscreen toggle (expands to cover full viewport including footer) ──
  const[loaded,setLoaded]=useState(false);

  // ── PDF page tracking via postMessage / hash listener ────────────────────
  const[currentPage,setCurrentPage]=useState(resume?.page||1);
  const[totalPages,setTotalPages]=useState(0);
  // For direct PDF: use custom page controls (we control the src hash)
  const isPdfDirect=kind==="pdf";
  const[pdfPage,setPdfPage]=useState(resume?.page||1);
  const navigatePdfPage=(p:number)=>{
    setPdfPage(p);
    saveResume(matId,{page:p});
    // Force iframe reload at new page
    if(iframeRef.current){
      iframeRef.current.src=`${embedUrl}#page=${p}`;
    }
  };

  // ── minimize pip state ──────────────────────────────────────────────────
  const[minimized,setMinimized]=useState(false);
  const[pipPos,setPipPos]=useState({x:20,y:80});
  const dragging=useRef(false);
  const dragStart=useRef({px:0,py:0,ox:0,oy:0});
  const onPipDown=(e:React.PointerEvent)=>{dragging.current=true;dragStart.current={px:e.clientX,py:e.clientY,ox:pipPos.x,oy:pipPos.y};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);};
  const onPipMove=(e:React.PointerEvent)=>{if(!dragging.current)return;setPipPos({x:dragStart.current.ox+(e.clientX-dragStart.current.px),y:dragStart.current.oy+(e.clientY-dragStart.current.py)});};
  const onPipUp=()=>{dragging.current=false;};

  // ── pip (minimized) ──────────────────────────────────────────────────────
  if(minimized){
    return(
      <div onPointerDown={onPipDown} onPointerMove={onPipMove} onPointerUp={onPipUp}
        onClick={()=>setMinimized(false)}
        style={{position:"absolute",left:pipPos.x,top:pipPos.y,zIndex:60,
          width:54,height:54,borderRadius:"50%",cursor:"grab",userSelect:"none",touchAction:"none",
          background:"linear-gradient(135deg,#064e3b,#1a73e8)",
          boxShadow:"0 4px 20px rgba(0,0,0,.55)",border:"2px solid rgba(255,255,255,.2)",
          display:"flex",alignItems:"center",justifyContent:"center",
        }} title="Open material">
        <span style={{fontSize:20}}>{MAT_TYPE_ICON[material.material_type||"document"]||"📄"}</span>
      </div>
    );
  }

  // Use absolute positioning scoped to the video content area so footer is always visible
  const overlayStyle: React.CSSProperties = {
    position: "absolute", inset: 0, zIndex: 55,
  };

  const renderContent=()=>{
    // Wait for URL resolution before rendering any media
    if(urlLoading||!url)return(
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#0f1117",gap:14}}>
        <div style={{width:40,height:40,borderRadius:"50%",border:"3px solid rgba(255,255,255,.1)",borderTopColor:TEAL,animation:"cv-spin .7s linear infinite"}}/>
        <p style={{color:"#9ca3af",fontSize:13,margin:0}}>Preparing material...</p>
      </div>
    );
    if(kind==="image")return(
      <div style={{flex:1,background:"#000",display:"flex",alignItems:"center",justifyContent:"center",overflow:"auto"}}>
        <img src={embedUrl} alt={material.title} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",display:"block"}}/>
      </div>
    );
    if(kind==="audio")return(
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",background:"#0f1a14",flexDirection:"column",gap:16,padding:20}}>
        <div style={{fontSize:56}}>🎵</div>
        <p style={{color:"#fff",fontWeight:700,fontSize:16,margin:0,textAlign:"center"}}>{material.title}</p>
        <audio ref={undefined} src={embedUrl} controls autoPlay style={{maxWidth:380,width:"100%"}}
          onLoadedMetadata={e=>{if(resume?.time)(e.target as HTMLAudioElement).currentTime=resume.time;}}
          onTimeUpdate={e=>{const el=e.target as HTMLAudioElement;if(el.currentTime>0)saveResume(matId,{time:el.currentTime});}}
        />
      </div>
    );
    if(kind==="video")return(
      <div style={{flex:1,background:"#000",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <video ref={videoRef} src={embedUrl} controls autoPlay playsInline
          style={{maxWidth:"100%",maxHeight:"100%",display:"block"}}/>
      </div>
    );
    // PDF — rendered inline via pdf.js (no Google redirect, works on all devices)
    if(kind==="pdf")return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>
        <PDFViewer url={embedUrl} bg="#0f1117" materialId={matId} />
      </div>
    );
    // iframes (YouTube, Google Drive, Google Docs viewer, etc.)
    return(
      <div style={{flex:1,position:"relative",minHeight:0}}>
        {!loaded&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"#0f1a14",zIndex:1}}>
          <div style={{width:32,height:32,border:"3px solid rgba(255,255,255,.2)",borderTopColor:TEAL,borderRadius:"50%",animation:"cv-spin .7s linear infinite"}}/>
        </div>}
        <iframe src={embedUrl} title={material.title}
          style={{width:"100%",height:"100%",border:"none",display:"block"}}
          allow="autoplay;fullscreen;accelerometer;encrypted-media;picture-in-picture"
          allowFullScreen onLoad={()=>setLoaded(true)}/>
      </div>
    );
  };

  const resumeBadge=resume?.time||resume?.page;

  return(
    <div style={{...overlayStyle,background:"#0f1117",display:"flex",flexDirection:"column",animation:"fade-in .18s ease"}}>
      {/* Viewer header */}
      <div style={{height:46,background:"#2d2e30",display:"flex",alignItems:"center",padding:"0 10px",gap:8,flexShrink:0,borderBottom:"1px solid rgba(255,255,255,.08)"}}>
        {/* Minimize to pip */}
        <button onClick={()=>setMinimized(true)} title="Minimize"
          style={{width:30,height:30,borderRadius:8,background:"rgba(255,255,255,.1)",border:"none",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <ChevronDown style={{width:13,height:13}}/>
        </button>
        <span style={{fontSize:15,flexShrink:0}}>{MAT_TYPE_ICON[material.material_type||"document"]||"📄"}</span>
        <span style={{flex:1,fontSize:13,fontWeight:600,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{material.title||"Material"}</span>
        {resumeBadge&&(
          <span style={{fontSize:10,color:"rgba(255,255,255,.5)",background:"rgba(255,255,255,.1)",borderRadius:8,padding:"2px 7px",flexShrink:0}}>
            {resume?.time?`▶ ${Math.floor((resume.time||0)/60)}m${Math.floor((resume.time||0)%60)}s`:`p.${resume?.page}`} resumed
          </span>
        )}
        {!isTeacher&&<span style={{fontSize:10,color:"rgba(255,255,255,.4)",flexShrink:0}}>Shared by teacher</span>}
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{fontSize:11,color:"#d1d5db",background:"rgba(255,255,255,.1)",borderRadius:8,padding:"4px 10px",textDecoration:"none",fontWeight:600,flexShrink:0}}>↗</a>
        <button onClick={onClose} title="Close material"
          style={{width:30,height:30,borderRadius:8,background:"rgba(255,255,255,.12)",border:"none",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <X style={{width:13,height:13}}/>
        </button>
      </div>
      {renderContent()}
    </div>
  );
};

/* ══ SUBJECT MATERIALS PANEL ══
   Renders as position:absolute inside the content area — footer always visible.
   Clicking a material opens InClassMaterialViewer on top of the panel.          */
/* ══ SURAH → PAGE mapping (Madinah 604-page Mushaf) ══ */
const SURAH_PAGE:Record<number,number>={
  1:1,2:2,3:50,4:77,5:106,6:128,7:151,8:177,9:187,10:208,
  11:221,12:235,13:249,14:255,15:262,16:267,17:282,18:293,19:305,20:312,
  21:322,22:332,23:342,24:350,25:359,26:367,27:377,28:385,29:396,30:404,
  31:411,32:415,33:418,34:428,35:434,36:440,37:446,38:453,39:458,40:467,
  41:477,42:483,43:489,44:496,45:499,46:502,47:507,48:511,49:515,50:518,
  51:520,52:523,53:526,54:528,55:531,56:534,57:537,58:542,59:545,60:549,
  61:551,62:553,63:554,64:556,65:558,66:560,67:562,68:564,69:566,70:568,
  71:570,72:572,73:574,74:575,75:577,76:578,77:580,78:582,79:583,80:585,
  81:586,82:587,83:587,84:589,85:590,86:591,87:591,88:592,89:593,90:594,
  91:595,92:595,93:596,94:596,95:597,96:597,97:598,98:598,99:599,100:599,
  101:600,102:600,103:601,104:601,105:601,106:602,107:602,108:602,
  109:603,110:603,111:603,112:604,113:604,114:604,
};

/* Reverse map: page → which surah starts on or before that page.
   Built once at module level — used to keep tafseer in sync when
   the user navigates pages in Mushaf / Translation mode.          */
const PAGE_SURAH:Record<number,number>=(()=>{
  const map:Record<number,number>={};
  // Fill all 604 pages; last surah that started on or before each page wins
  for(let p=1;p<=604;p++){
    let best=1;
    for(let s=1;s<=114;s++){
      if((SURAH_PAGE[s]||1)<=p) best=s;
    }
    map[p]=best;
  }
  return map;
})();

type QuranMode="quran"|"translation"|"tafseer";

/* ══ FULL QURAN READER — Page-by-page · Translation · Tafseer Ibn Katheer ══ */
const SURAHS_LIST = [
  {n:1,name:"Al-Fatihah",ar:"الفاتحة",v:7},{n:2,name:"Al-Baqarah",ar:"البقرة",v:286},{n:3,name:"Aal-Imran",ar:"آل عمران",v:200},
  {n:4,name:"An-Nisa",ar:"النساء",v:176},{n:5,name:"Al-Maidah",ar:"المائدة",v:120},{n:6,name:"Al-Anam",ar:"الأنعام",v:165},
  {n:7,name:"Al-Araf",ar:"الأعراف",v:206},{n:8,name:"Al-Anfal",ar:"الأنفال",v:75},{n:9,name:"At-Tawbah",ar:"التوبة",v:129},
  {n:10,name:"Yunus",ar:"يونس",v:109},{n:11,name:"Hud",ar:"هود",v:123},{n:12,name:"Yusuf",ar:"يوسف",v:111},
  {n:13,name:"Ar-Ra'd",ar:"الرعد",v:43},{n:14,name:"Ibrahim",ar:"إبراهيم",v:52},{n:15,name:"Al-Hijr",ar:"الحجر",v:99},
  {n:16,name:"An-Nahl",ar:"النحل",v:128},{n:17,name:"Al-Isra",ar:"الإسراء",v:111},{n:18,name:"Al-Kahf",ar:"الكهف",v:110},
  {n:19,name:"Maryam",ar:"مريم",v:98},{n:20,name:"Taha",ar:"طه",v:135},{n:21,name:"Al-Anbiya",ar:"الأنبياء",v:112},
  {n:22,name:"Al-Hajj",ar:"الحج",v:78},{n:23,name:"Al-Mu'minun",ar:"المؤمنون",v:118},{n:24,name:"An-Nur",ar:"النور",v:64},
  {n:25,name:"Al-Furqan",ar:"الفرقان",v:77},{n:26,name:"Ash-Shu'ara",ar:"الشعراء",v:227},{n:27,name:"An-Naml",ar:"النمل",v:93},
  {n:28,name:"Al-Qasas",ar:"القصص",v:88},{n:29,name:"Al-Ankabut",ar:"العنكبوت",v:69},{n:30,name:"Ar-Rum",ar:"الروم",v:60},
  {n:31,name:"Luqman",ar:"لقمان",v:34},{n:32,name:"As-Sajdah",ar:"السجدة",v:30},{n:33,name:"Al-Ahzab",ar:"الأحزاب",v:73},
  {n:34,name:"Saba",ar:"سبأ",v:54},{n:35,name:"Fatir",ar:"فاطر",v:45},{n:36,name:"Ya-Sin",ar:"يس",v:83},
  {n:37,name:"As-Saffat",ar:"الصافات",v:182},{n:38,name:"Sad",ar:"ص",v:88},{n:39,name:"Az-Zumar",ar:"الزمر",v:75},
  {n:40,name:"Ghafir",ar:"غافر",v:85},{n:41,name:"Fussilat",ar:"فصلت",v:54},{n:42,name:"Ash-Shura",ar:"الشورى",v:53},
  {n:43,name:"Az-Zukhruf",ar:"الزخرف",v:89},{n:44,name:"Ad-Dukhan",ar:"الدخان",v:59},{n:45,name:"Al-Jathiyah",ar:"الجاثية",v:37},
  {n:46,name:"Al-Ahqaf",ar:"الأحقاف",v:35},{n:47,name:"Muhammad",ar:"محمد",v:38},{n:48,name:"Al-Fath",ar:"الفتح",v:29},
  {n:49,name:"Al-Hujurat",ar:"الحجرات",v:18},{n:50,name:"Qaf",ar:"ق",v:45},{n:51,name:"Adh-Dhariyat",ar:"الذاريات",v:60},
  {n:52,name:"At-Tur",ar:"الطور",v:49},{n:53,name:"An-Najm",ar:"النجم",v:62},{n:54,name:"Al-Qamar",ar:"القمر",v:55},
  {n:55,name:"Ar-Rahman",ar:"الرحمن",v:78},{n:56,name:"Al-Waqi'ah",ar:"الواقعة",v:96},{n:57,name:"Al-Hadid",ar:"الحديد",v:29},
  {n:58,name:"Al-Mujadila",ar:"المجادلة",v:22},{n:59,name:"Al-Hashr",ar:"الحشر",v:24},{n:60,name:"Al-Mumtahanah",ar:"الممتحنة",v:13},
  {n:61,name:"As-Saf",ar:"الصف",v:14},{n:62,name:"Al-Jumu'ah",ar:"الجمعة",v:11},{n:63,name:"Al-Munafiqun",ar:"المنافقون",v:11},
  {n:64,name:"At-Taghabun",ar:"التغابن",v:18},{n:65,name:"At-Talaq",ar:"الطلاق",v:12},{n:66,name:"At-Tahrim",ar:"التحريم",v:12},
  {n:67,name:"Al-Mulk",ar:"الملك",v:30},{n:68,name:"Al-Qalam",ar:"القلم",v:52},{n:69,name:"Al-Haqqah",ar:"الحاقة",v:52},
  {n:70,name:"Al-Ma'arij",ar:"المعارج",v:44},{n:71,name:"Nuh",ar:"نوح",v:28},{n:72,name:"Al-Jinn",ar:"الجن",v:28},
  {n:73,name:"Al-Muzzammil",ar:"المزمل",v:20},{n:74,name:"Al-Muddaththir",ar:"المدثر",v:56},{n:75,name:"Al-Qiyamah",ar:"القيامة",v:40},
  {n:76,name:"Al-Insan",ar:"الإنسان",v:31},{n:77,name:"Al-Mursalat",ar:"المرسلات",v:50},{n:78,name:"An-Naba",ar:"النبأ",v:40},
  {n:79,name:"An-Nazi'at",ar:"النازعات",v:46},{n:80,name:"Abasa",ar:"عبس",v:42},{n:81,name:"At-Takwir",ar:"التكوير",v:29},
  {n:82,name:"Al-Infitar",ar:"الانفطار",v:19},{n:83,name:"Al-Mutaffifin",ar:"المطففين",v:36},{n:84,name:"Al-Inshiqaq",ar:"الانشقاق",v:25},
  {n:85,name:"Al-Buruj",ar:"البروج",v:22},{n:86,name:"At-Tariq",ar:"الطارق",v:17},{n:87,name:"Al-Ala",ar:"الأعلى",v:19},
  {n:88,name:"Al-Ghashiyah",ar:"الغاشية",v:26},{n:89,name:"Al-Fajr",ar:"الفجر",v:30},{n:90,name:"Al-Balad",ar:"البلد",v:20},
  {n:91,name:"Ash-Shams",ar:"الشمس",v:15},{n:92,name:"Al-Layl",ar:"الليل",v:21},{n:93,name:"Ad-Duha",ar:"الضحى",v:11},
  {n:94,name:"Ash-Sharh",ar:"الشرح",v:8},{n:95,name:"At-Tin",ar:"التين",v:8},{n:96,name:"Al-Alaq",ar:"العلق",v:19},
  {n:97,name:"Al-Qadr",ar:"القدر",v:5},{n:98,name:"Al-Bayyinah",ar:"البينة",v:8},{n:99,name:"Az-Zalzalah",ar:"الزلزلة",v:8},
  {n:100,name:"Al-Adiyat",ar:"العاديات",v:11},{n:101,name:"Al-Qari'ah",ar:"القارعة",v:11},{n:102,name:"At-Takathur",ar:"التكاثر",v:8},
  {n:103,name:"Al-Asr",ar:"العصر",v:3},{n:104,name:"Al-Humazah",ar:"الهمزة",v:9},{n:105,name:"Al-Fil",ar:"الفيل",v:5},
  {n:106,name:"Quraysh",ar:"قريش",v:4},{n:107,name:"Al-Ma'un",ar:"الماعون",v:7},{n:108,name:"Al-Kawthar",ar:"الكوثر",v:3},
  {n:109,name:"Al-Kafirun",ar:"الكافرون",v:6},{n:110,name:"An-Nasr",ar:"النصر",v:3},{n:111,name:"Al-Masad",ar:"المسد",v:5},
  {n:112,name:"Al-Ikhlas",ar:"الإخلاص",v:4},{n:113,name:"Al-Falaq",ar:"الفلق",v:5},{n:114,name:"An-Nas",ar:"الناس",v:6},
];

const QURAN_PAGE_KEY="inclass_quran_page_v1";
const InClassQuranReader=({onClose}:any)=>{
  const[mode,setMode]=useState<QuranMode>("quran");
  const[page,setPage]=useState(()=>{try{const s=localStorage.getItem(QURAN_PAGE_KEY);return s?Math.max(1,Math.min(604,parseInt(s)||1)):1;}catch{return 1;}});
  const[pageInput,setPageInput]=useState("");
  const[pageInputOpen,setPageInputOpen]=useState(false);
  const[fullscreen,setFullscreen]=useState(false);
  /* mushaf text (page-based) */
  const[mushafAyahs,setMushafAyahs]=useState<any[]>([]);
  const[mushafLoading,setMushafLoading]=useState(false);
  /* translation panel data (page-based) */
  const[transAyahs,setTransAyahs]=useState<any[]>([]);
  const[transLoading,setTransLoading]=useState(false);
  /* tafseer panel data (surah-based) */
  const[surahNum,setSurahNum]=useState(1);
  const[surahAyahs,setSurahAyahs]=useState<any[]>([]);
  const[surahLoading,setSurahLoading]=useState(false);
  const[expandedTafseer,setExpandedTafseer]=useState<Record<string,string>>({});
  const[loadingTafseer,setLoadingTafseer]=useState<Record<string,boolean>>({});
  const[showPicker,setShowPicker]=useState(false);
  /* audio + reciters */
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const[playingVerse,setPlayingVerse]=useState<string|null>(null);
  const[reciter,setReciter]=useState("Alafasy_128kbps");

  const RECITERS=[
    {id:"Alafasy_128kbps",       name:"Alafasy",    ar:"العفاسي"},
    {id:"Abdul_Basit_Murattal_192kbps", name:"Abdul Basit", ar:"عبد الباسط"},
    {id:"Husary_128kbps",        name:"Husary",     ar:"الحصري"},
    {id:"Hudhaify_128kbps",      name:"Hudhaify",   ar:"الحذيفي"},
    {id:"Minshawy_Murattal_128kbps",name:"Minshawi", ar:"المنشاوي"},
    {id:"Mohammad_al_Tablaway_128kbps",name:"Tablaway",ar:"الطبلاوي"},
  ];

  const toAr=(n:number)=>String(n).replace(/[0-9]/g,d=>"٠١٢٣٤٥٦٧٨٩"[+d]);

  /* ── Mushaf word-line data from quran.com ─────────────────────────────────
     quran.com /api/v4/verses/by_page returns each verse with its words,
     and each word includes line_number (1-15) matching the physical Madani Mushaf.
     We group words by line to render each line as it appears in print.
     Fallback: if quran.com is unavailable, falls back to alquran.cloud flowing text.
  ────────────────────────────────────────────────────────────────────────── */
  const [mushafLines, setMushafLines] = useState<MushafLine[]>([]);
  const [mushafLineMode, setMushafLineMode] = useState(true); // true = line mode, false = flow fallback

  interface MushafWord {
    text: string;          // Uthmani text of the word
    lineNumber: number;    // 1-15 (physical Mushaf line on this page)
    ayahKey: string;       // "surah:ayah" for playback
    isEnd: boolean;        // is this the ayah-end marker (۝)?
    ayahNum: number;       // numberInSurah for marker display
    surahNum: number;
    surahName: string;
    surahEnglish: string;
  }
  interface MushafLine {
    lineNum: number;       // 1-15
    words: MushafWord[];
    isCentered: boolean;   // basmala / surah name lines are centered
  }

  const fetchMushafPage=async(p:number)=>{
    setMushafLoading(true); setMushafAyahs([]); setMushafLines([]);

    // ── Attempt 1: quran.com word-level API with line numbers ────────────
    try {
      const url = `https://api.quran.com/api/v4/verses/by_page/${p}?words=true&word_fields=line_number%2Ctext_uthmani%2Cchar_type_name&per_page=50&page=1`;
      const resp = await fetch(url, { headers: { Accept: "application/json" } });
      if (resp.ok) {
        const json = await resp.json();
        const verses: any[] = json.verses || [];
        if (verses.length > 0) {
          // Build a flat word list with line assignments
          const allWords: MushafWord[] = [];
          verses.forEach((v: any) => {
            const surahNum  = parseInt(v.verse_key?.split(":")?.[0] || "0", 10);
            const ayahNum   = parseInt(v.verse_key?.split(":")?.[1] || "0", 10);
            const surahName = v.translations?.[0]?.resource_name || "";
            const surahEn   = "";
            (v.words || []).forEach((w: any) => {
              if (!w.text_uthmani && !w.text) return;
              allWords.push({
                text:        w.text_uthmani || w.text || "",
                lineNumber:  w.line_number  || 1,
                ayahKey:     v.verse_key    || "",
                isEnd:       w.char_type_name === "end" || w.char_type_name === "ayah",
                ayahNum,
                surahNum,
                surahName,
                surahEnglish: surahName,
              });
            });
          });

          if (allWords.length > 0) {
            // Group into lines 1-15
            const lineMap = new Map<number, MushafWord[]>();
            for (let i = 1; i <= 15; i++) lineMap.set(i, []);
            allWords.forEach(w => {
              const ln = Math.max(1, Math.min(15, w.lineNumber));
              lineMap.get(ln)!.push(w);
            });

            // Detect centered lines (basmala / surah nameplate):
            // A line is centered if it contains only basmala or start-of-surah markers
            // Heuristic: line has very few words (≤5) and all from verse 1 of a new surah
            const lines: MushafLine[] = [];
            lineMap.forEach((words, ln) => {
              if (!words.length) return;
              const isCent = words.length <= 6 && words.every(w => w.ayahNum === 1 || w.isEnd);
              lines.push({ lineNum: ln, words, isCentered: isCent });
            });
            lines.sort((a, b) => a.lineNum - b.lineNum);
            setMushafLines(lines);
            setMushafLineMode(true);
            setMushafLoading(false);
            return;
          }
        }
      }
    } catch { /* fall through to alquran.cloud */ }

    // ── Attempt 2: alquran.cloud (flowing text, no line data) ─────────────
    setMushafLineMode(false);
    try{
      for(const ed of["ar.uthmani","quran-uthmani","quran-simple"]){
        const j=await fetch(`https://api.alquran.cloud/v1/page/${p}/${ed}`).then(r=>r.json());
        if(j.code===200&&j.data?.ayahs?.length>0){setMushafAyahs(j.data.ayahs);break;}
      }
    }catch{}
    setMushafLoading(false);
  };

  /* fetch translation — English first (guaranteed), Arabic as optional enrichment */
  const fetchTranslation=async(p:number)=>{
    setTransLoading(true);setTransAyahs([]);
    try{
      const enRes=await fetch(`https://api.alquran.cloud/v1/page/${p}/en.sahih`).then(r=>r.json());
      const enAyahs=enRes?.data?.ayahs||[];
      if(enAyahs.length>0){
        let arAyahs:any[]=[];
        try{
          const arRes=await fetch(`https://api.alquran.cloud/v1/page/${p}/ar.uthmani`).then(r=>r.json());
          arAyahs=arRes?.data?.ayahs||[];
          if(!arAyahs.length){
            const ar2=await fetch(`https://api.alquran.cloud/v1/page/${p}/quran-uthmani`).then(r=>r.json());
            arAyahs=ar2?.data?.ayahs||[];
          }
        }catch{}
        setTransAyahs(enAyahs.map((e:any,i:number)=>({...e,arabicText:arAyahs[i]?.text||""})));
      }
    }catch{}
    setTransLoading(false);
  };

  /* fetch Arabic text for tafseer mode (surah-level) */
  const fetchSurahArabic=async(num:number)=>{
    setSurahLoading(true);setSurahAyahs([]);setExpandedTafseer({});
    try{
      const j=await fetch(`https://api.alquran.cloud/v1/surah/${num}/ar.uthmani`).then(r=>r.json());
      if(j.code===200)setSurahAyahs(j.data.ayahs||[]);
    }catch{}
    setSurahLoading(false);
  };

  /* fetch tafseer for a single ayah — used by auto-loader */
  const fetchOneTafseer=async(surah:number,ayah:number)=>{
    const key=`${surah}:${ayah}`;
    if(expandedTafseer[key]!==undefined) return; // already loaded
    setLoadingTafseer(p=>({...p,[key]:true}));
    try{
      const ctrl=new AbortController();
      const t=setTimeout(()=>ctrl.abort(),8000);
      const r=await fetch(`https://api.quran.com/api/v4/tafsirs/16/by_ayah?verse_key=${surah}:${ayah}`,{signal:ctrl.signal});
      clearTimeout(t);
      const j=await r.json();
      const raw=j?.tafsir?.text||"";
      if(raw){
        setExpandedTafseer(p=>({...p,[key]:raw.replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim()}));
      }else throw new Error("empty");
    }catch{
      try{
        const r2=await fetch(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/ar.muyassar`);
        const j2=await r2.json();
        const txt=(j2?.data?.text||"").replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();
        if(txt)setExpandedTafseer(p=>({...p,[key]:txt}));
        else throw new Error("empty");
      }catch{
        setExpandedTafseer(p=>({...p,[key]:"تعذّر تحميل التفسير. تحقق من الاتصال بالإنترنت."}));
      }
    }
    setLoadingTafseer(p=>({...p,[key]:false}));
  };

  /* auto-load all tafseer when surahAyahs changes in tafseer mode */
  useEffect(()=>{
    if(mode!=="tafseer"||surahAyahs.length===0) return;
    // Load sequentially to avoid hammering the API
    (async()=>{for(const a of surahAyahs){await fetchOneTafseer(surahNum,a.numberInSurah);}})();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[surahAyahs,mode]);

  /* audio — uses selected reciter */
  const playVerse=(surah:number,verse:number)=>{
    const key=`${surah}:${verse}`;
    if(playingVerse===key){audioRef.current?.pause();setPlayingVerse(null);return;}
    audioRef.current?.pause();
    const s3=String(surah).padStart(3,"0"),v3=String(verse).padStart(3,"0");
    const au=new Audio(`https://everyayah.com/data/${reciter}/${s3}${v3}.mp3`);
    audioRef.current=au;setPlayingVerse(key);
    au.play().catch(()=>{
      const s2=String(surah).padStart(3,"0");const v2=String(verse).padStart(3,"0");
      const fb=new Audio(`https://everyayah.com/data/Alafasy_128kbps/${s2}${v2}.mp3`);
      audioRef.current=fb;fb.play().catch(()=>setPlayingVerse(null));
      fb.onended=()=>setPlayingVerse(null);
    });
    au.onended=()=>setPlayingVerse(null);
  };

  const jumpToSurah=(num:number)=>{
    setSurahNum(num);setShowPicker(false);
    if(mode!=="tafseer"){setPage(SURAH_PAGE[num]||1);}
  };

  const changePage=(delta:number)=>{
    const np=Math.max(1,Math.min(604,page+delta));
    setPage(np);
  };

  const commitPageInput=()=>{
    const n=parseInt(pageInput,10);
    if(n>=1&&n<=604){setPage(n);}
    setPageInputOpen(false);setPageInput("");
  };

  useEffect(()=>{
    if(mode==="quran")fetchMushafPage(page);
    if(mode==="translation")fetchTranslation(page);
    // Keep surahNum in sync so switching to Tafseer shows the correct surah
    if(mode==="quran"||mode==="translation"){
      const surahForPage=PAGE_SURAH[page]||1;
      if(surahForPage!==surahNum){
        setSurahNum(surahForPage);
        // Clear old tafseer cache so the new surah loads fresh
        setExpandedTafseer({});
      }
    }
  },[page,mode]);

  useEffect(()=>{try{localStorage.setItem(QURAN_PAGE_KEY,String(page));}catch{}},[page]);

  useEffect(()=>{
    if(mode==="tafseer")fetchSurahArabic(surahNum);
  },[surahNum,mode]);

  useEffect(()=>{
    if(mode==="quran")fetchMushafPage(page);
    if(mode==="translation")fetchTranslation(page);
    if(mode==="tafseer"&&surahAyahs.length===0)fetchSurahArabic(surahNum);
  },[mode]);

  useEffect(()=>{return()=>{audioRef.current?.pause();};},[]);

  const MODES=[
    {key:"quran" as QuranMode,icon:"📖",label:"Mushaf"},
    {key:"translation" as QuranMode,icon:"🌐",label:"Trans."},
    {key:"tafseer" as QuranMode,icon:"📚",label:"Tafseer"},
  ];

  /* ── single-line nav bar: prev | page | next | Surah | reciters (scrollable) ── */
  const PageNav=()=>(
    <div style={{display:"flex",alignItems:"center",gap:3,padding:"4px 6px",borderBottom:"1px solid #e8dfc8",background:"#fff",flexShrink:0,overflowX:"auto",WebkitOverflowScrolling:"touch" as any}}>
      {/* Prev */}
      <button onClick={()=>changePage(-1)} disabled={page<=1}
        style={{flexShrink:0,padding:"4px 10px",borderRadius:6,border:"1px solid #d4c9a0",background:"#f5f0e4",color:"#1a3d24",cursor:page<=1?"not-allowed":"pointer",fontSize:14,fontWeight:700,opacity:page<=1?0.35:1}}>
        ←
      </button>
      {/* Page number / jump input */}
      {pageInputOpen?(
        <div style={{display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
          <input autoFocus type="number" min={1} max={604} value={pageInput}
            onChange={e=>setPageInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")commitPageInput();if(e.key==="Escape"){setPageInputOpen(false);setPageInput("");}}}
            onBlur={commitPageInput}
            style={{width:48,textAlign:"center",padding:"2px 4px",border:"2px solid #b7791f",borderRadius:6,fontSize:13,fontWeight:700,color:"#1a3d24",outline:"none"}}
            placeholder={String(page)}/>
          <span style={{fontSize:9,color:"#b7791f",fontWeight:600,flexShrink:0}}>/ 604</span>
        </div>
      ):(
        <button onClick={()=>{setPageInput(String(page));setPageInputOpen(true);}} title="Tap to jump"
          style={{flexShrink:0,background:"none",border:"1px solid transparent",borderRadius:6,cursor:"pointer",padding:"3px 4px"}}>
          <span style={{fontSize:11,fontWeight:800,color:"#1a3d24"}}>P{page}</span>
          <span style={{fontSize:9,color:"#b7791f"}}>/604</span>
        </button>
      )}
      {/* Next */}
      <button onClick={()=>changePage(1)} disabled={page>=604}
        style={{flexShrink:0,padding:"4px 10px",borderRadius:6,border:"1px solid #d4c9a0",background:"#f5f0e4",color:"#1a3d24",cursor:page>=604?"not-allowed":"pointer",fontSize:14,fontWeight:700,opacity:page>=604?0.35:1}}>
        →
      </button>
      {/* Surah picker */}
      <button onClick={()=>setShowPicker(true)}
        style={{flexShrink:0,padding:"4px 8px",borderRadius:6,border:"1px solid #b7791f",background:"#fffbf0",color:"#b7791f",cursor:"pointer",fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>
        ☰ Surah
      </button>
      {/* Divider */}
      <div style={{flexShrink:0,width:1,height:20,background:"#e8dfc8",margin:"0 2px"}}/>
      {/* Reciters — scroll within the same row */}
      {RECITERS.map(r=>(
        <button key={r.id} onClick={()=>{
          setReciter(r.id);
          if(playingVerse){const[s,v]=playingVerse.split(":").map(Number);audioRef.current?.pause();setPlayingVerse(null);setTimeout(()=>playVerse(s,v),80);}
        }}
          style={{flexShrink:0,padding:"3px 9px",borderRadius:12,border:`1.5px solid ${reciter===r.id?"#b7791f":"rgba(183,121,31,.3)"}`,
            background:reciter===r.id?"#b7791f":"#fff",color:reciter===r.id?"#fff":"#7a5c1e",
            fontSize:10,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",transition:"all .15s"}}>
          {r.ar}
        </button>
      ))}
    </div>
  );

  /* ReciterStrip kept as no-op so existing references don't break */
  const ReciterStrip=()=>null;

  /* ── surah picker overlay ── */
  const SurahPicker=()=>showPicker?(
    <div style={{position:"absolute",inset:0,zIndex:30,background:"rgba(0,0,0,.5)"}} onClick={()=>setShowPicker(false)}>
      <div onClick={e=>e.stopPropagation()}
        style={{position:"absolute",inset:0,background:"#faf6ec",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"10px 14px",background:"linear-gradient(135deg,#1a3d24,#276749)",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <div style={{flex:1,fontSize:13,fontWeight:800,color:"#fff"}}>Jump to Surah</div>
          <button onClick={()=>setShowPicker(false)}
            style={{background:"rgba(255,255,255,.2)",border:"none",color:"#fff",borderRadius:6,width:26,height:26,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <X style={{width:12,height:12}}/>
          </button>
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {SURAHS_LIST.map(s=>(
            <button key={s.n} onClick={()=>jumpToSurah(s.n)}
              style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 14px",background:surahNum===s.n?"#f0fff4":"none",border:"none",borderBottom:"1px solid #f0e8d4",cursor:"pointer",textAlign:"left"}}>
              <span style={{width:24,height:24,borderRadius:"50%",background:"#1a3d24",color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{s.n}</span>
              <span style={{flex:1,fontSize:13,fontWeight:600,color:"#1a3d24"}}>{s.name}</span>
              <span style={{fontFamily:"'Amiri',serif",fontSize:16,color:"#b7791f",fontWeight:700}}>{s.ar}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  ):null;

  /* ── swipe-to-turn-page ── */
  const swipeStartX = useRef<number|null>(null);
  const swipeStartY = useRef<number|null>(null);
  const SWIPE_THRESHOLD = 50; // px horizontal movement needed
  const SWIPE_ANGLE_MAX = 0.7; // tan(~35°) — reject vertical drags

  const onTouchStart=(e:React.TouchEvent)=>{
    swipeStartX.current=e.touches[0].clientX;
    swipeStartY.current=e.touches[0].clientY;
  };
  const onTouchEnd=(e:React.TouchEvent)=>{
    if(swipeStartX.current===null||swipeStartY.current===null) return;
    const dx=e.changedTouches[0].clientX - swipeStartX.current;
    const dy=e.changedTouches[0].clientY - swipeStartY.current;
    swipeStartX.current=null; swipeStartY.current=null;
    // Reject mostly-vertical swipes
    if(Math.abs(dy)/Math.max(Math.abs(dx),1) > SWIPE_ANGLE_MAX) return;
    if(Math.abs(dx) < SWIPE_THRESHOLD) return;
    // Arabic Quran is RTL — the next page is physically to the LEFT of the current page.
    // To "turn forward" you swipe from right to left (like turning a page in an Arabic book).
    // BUT on a phone, the natural gesture to reveal the next page is to swipe the current
    // page away to the LEFT — i.e. dx > 0 means your thumb moved RIGHT which pushes
    // content left, revealing the next page.
    //
    // Standard Arabic Quran apps (Tarteel, Quran.com, Muslim Pro):
    //   Swipe RIGHT (dx > 0) → next page  (page number increases)
    //   Swipe LEFT  (dx < 0) → prev page  (page number decreases)
    if(dx > 0) changePage(1);   // swipe right → next page (Arabic forward)
    else        changePage(-1); // swipe left  → previous page
  };
  const outerStyle:React.CSSProperties=fullscreen
    ?{position:"fixed",inset:0,zIndex:9999,background:"#000",display:"flex",flexDirection:"column"}
    :{position:"absolute",inset:0,zIndex:55,background:"rgba(0,0,0,.6)"};

  const panelStyle:React.CSSProperties=fullscreen
    ?{flex:1,display:"flex",flexDirection:"column",background:"#faf6ec",overflow:"hidden"}
    :{position:"absolute",top:0,right:0,bottom:0,width:"min(460px,100%)",background:"#faf6ec",display:"flex",flexDirection:"column",boxShadow:"-8px 0 40px rgba(0,0,0,.5)",borderLeft:"1px solid rgba(183,121,31,.2)"};

  return(
    <div style={outerStyle} onClick={fullscreen?undefined:onClose}>
      <div onClick={e=>e.stopPropagation()} style={panelStyle}>

        {/* ── Single-line compact header ── */}
        <div style={{background:"linear-gradient(135deg,#1a3d24,#276749)",padding:"7px 10px",flexShrink:0,display:"flex",alignItems:"center",gap:6}}>
          {/* Title */}
          <span style={{fontFamily:"'Amiri',serif",fontSize:14,fontWeight:800,color:"#fff",whiteSpace:"nowrap"}}>📖 القرآن</span>
          {/* Mode tabs */}
          <div style={{flex:1,display:"flex",gap:2,background:"rgba(0,0,0,.25)",borderRadius:6,padding:2}}>
            {MODES.map(m=>(
              <button key={m.key} onClick={()=>setMode(m.key)}
                style={{flex:1,padding:"4px 2px",borderRadius:4,border:"none",fontSize:10,fontWeight:700,cursor:"pointer",
                  background:mode===m.key?"rgba(255,255,255,.22)":"transparent",
                  color:mode===m.key?"#fff":"rgba(255,255,255,.45)",transition:"all .15s",whiteSpace:"nowrap"}}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>
          {/* Fullscreen toggle */}
          <button onClick={()=>setFullscreen(f=>!f)}
            style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:6,width:28,height:28,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}
            title={fullscreen?"Exit fullscreen":"Fullscreen"}>
            {fullscreen?"⊡":"⛶"}
          </button>
          {/* Close */}
          <button onClick={onClose}
            style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:6,width:28,height:28,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <X style={{width:13,height:13}}/>
          </button>
        </div>

        {/* ══ MODE: MUSHAF — authentic line-by-line Quran layout ══ */}
        {mode==="quran"&&(
          <>
            <PageNav/>
            <ReciterStrip/>
            <div
              style={{flex:1,overflowY:"auto",background:"linear-gradient(180deg,#f5f0e8 0%,#ede8da 100%)"}}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >              {mushafLoading&&(
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:40,gap:10}}>
                  <div style={{width:28,height:28,border:"3px solid #1a3d24",borderTopColor:"transparent",borderRadius:"50%",animation:"cv-spin .7s linear infinite"}}/>
                  <span style={{fontSize:11,color:"#7a9e88",fontFamily:"'Amiri',serif"}}>جارٍ تحميل الصفحة…</span>
                </div>
              )}

              {/* ── Line-by-line mode (quran.com word data) ── */}
              {!mushafLoading&&mushafLineMode&&mushafLines.length>0&&(
                <div style={{padding:"8px 6px 16px",maxWidth:460,margin:"0 auto"}}>
                  <div style={{
                    background:"#fdf6e3",
                    border:"2px solid rgba(201,168,76,.5)",
                    borderRadius:4,
                    boxShadow:"0 4px 20px rgba(26,61,36,0.15)",
                    position:"relative",
                    overflow:"hidden",
                  }}>
                    {/* Inner decorative border (Mushaf style) */}
                    <div style={{position:"absolute",inset:6,border:"1px solid rgba(201,168,76,.3)",borderRadius:1,pointerEvents:"none",zIndex:1}}/>

                    {/* Page number header */}
                    <div style={{padding:"6px 16px",borderBottom:"1px solid rgba(201,168,76,.4)",display:"flex",justifyContent:"space-between",alignItems:"center",background:"linear-gradient(to bottom,rgba(201,168,76,.12),transparent)"}}>
                      <span style={{fontSize:10,fontWeight:700,color:"#b7791f",fontFamily:"'Amiri',serif"}}>
                        {/* Surah info for first ayah on this page */}
                        {mushafLines[0]?.words[0]?.surahEnglish||""}
                      </span>
                      <span style={{fontSize:11,fontWeight:700,color:"#b7791f",fontFamily:"'Amiri',serif"}}>
                        صفحة {toAr(page)}
                      </span>
                      <span style={{fontSize:10,fontWeight:700,color:"#b7791f",fontFamily:"'Amiri',serif"}}>
                        {mushafLines[mushafLines.length-1]?.words[0]?.surahEnglish||""}
                      </span>
                    </div>

                    {/* ── The 15 Mushaf lines ── */}
                    <div style={{padding:"10px 14px 6px",display:"flex",flexDirection:"column",gap:0}}>
                      {mushafLines.map((line, li) => {
                        const isBismillah = line.words.some((w: any) =>
                          w.text.includes("بِسۡمِ") || w.text.includes("بسم")
                        ) && line.words.length <= 8;
                        const isLastLine = li === mushafLines.length - 1;
                        const hasEndMarker = line.words.some((w: any) => w.isEnd);
                        // Physical Mushaf justification rules:
                        // • Basmala / surah opener → center
                        // • Any line with ≥3 words → space-between (full width), even if it's the last
                        // • Last line with only 1-2 words and no end marker → flex-end (right-align orphan)
                        const justify = (line.isCentered || isBismillah)
                          ? "center"
                          : (isLastLine && line.words.length <= 2 && !hasEndMarker)
                            ? "flex-end"
                            : "space-between";

                        return (
                          <div
                            key={line.lineNum}
                            style={{
                              minHeight: "3.2em",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: justify,
                              direction: "rtl",
                              padding: "0 2px",
                              borderBottom: !isLastLine ? "1px solid rgba(201,168,76,.1)" : "none",
                            }}
                          >
                            {/* ── Centered lines (Basmala / Surah nameplate) ── */}
                            {(line.isCentered || isBismillah) ? (
                              <div style={{
                                fontFamily: "'Amiri Quran','Scheherazade New','Amiri',serif",
                                fontSize: 20,
                                color: "#1c1208",
                                direction: "rtl",
                                textAlign: "center",
                                lineHeight: 1,
                              }}>
                                {line.words.map((w: any, wi: number) => (
                                  <span key={wi}>{w.text}{" "}</span>
                                ))}
                              </div>
                            ) : (
                              <>
                                {line.words.map((w: any, wi: number) => {
                                  const isPlaying = playingVerse === w.ayahKey;
                                  if (w.isEnd) {
                                    return (
                                      <span
                                        key={wi}
                                        onClick={() => playVerse(w.surahNum, w.ayahNum)}
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          width: 22, height: 22,
                                          borderRadius: "50%",
                                          background: isPlaying ? "#1a3d24" : "rgba(183,121,31,.85)",
                                          fontSize: 9,
                                          fontWeight: 700,
                                          color: "#fff",
                                          cursor: "pointer",
                                          flexShrink: 0,
                                          boxShadow: isPlaying ? "0 0 0 2px #c9a84c" : "none",
                                          transition: "all .2s",
                                          fontFamily: "'Amiri',serif",
                                        }}
                                      >
                                        {isPlaying ? "▶" : toAr(w.ayahNum)}
                                      </span>
                                    );
                                  }
                                  return (
                                    <span
                                      key={wi}
                                      onClick={() => playVerse(w.surahNum, w.ayahNum)}
                                      style={{
                                        fontFamily: "'Amiri Quran','Scheherazade New','Amiri',serif",
                                        fontSize: 20,
                                        color: "#1c1208",
                                        cursor: "pointer",
                                        background: isPlaying ? "rgba(201,168,76,.18)" : "transparent",
                                        borderRadius: 2,
                                        padding: "0 1px",
                                        transition: "background .2s",
                                        lineHeight: 1,
                                        flexShrink: 0,
                                      }}
                                    >
                                      {w.text}
                                    </span>
                                  );
                                })}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Page footer */}
                    <div style={{padding:"5px 16px",borderTop:"1px solid rgba(201,168,76,.4)",display:"flex",justifyContent:"center"}}>
                      <span style={{fontSize:10,color:"#b7791f",fontFamily:"'Amiri',serif"}}>— {toAr(page)} —</span>
                    </div>
                  </div>

                  {/* Bottom nav */}
                  <div style={{display:"flex",gap:8,marginTop:10}}>
                    <button onClick={()=>changePage(-1)} disabled={page<=1}
                      style={{flex:1,padding:"10px",borderRadius:8,border:"1px solid rgba(201,168,76,.5)",background:"#fdf6e3",color:"#1a3d24",fontSize:18,fontWeight:700,cursor:page<=1?"not-allowed":"pointer",opacity:page<=1?0.3:1}}>◀</button>
                    <button onClick={()=>changePage(1)} disabled={page>=604}
                      style={{flex:1,padding:"10px",borderRadius:8,border:"1px solid rgba(201,168,76,.5)",background:"#fdf6e3",color:"#1a3d24",fontSize:18,fontWeight:700,cursor:page>=604?"not-allowed":"pointer",opacity:page>=604?0.3:1}}>▶</button>
                  </div>
                </div>
              )}

              {/* ── Fallback: flowing text mode (alquran.cloud, no line data) ── */}
              {!mushafLoading&&!mushafLineMode&&mushafAyahs.length>0&&(
                <div style={{padding:"10px 8px 20px",maxWidth:460,margin:"0 auto"}}>
                  <div style={{background:"#fdf6e3",border:"2px solid rgba(201,168,76,.5)",borderRadius:4,boxShadow:"0 4px 20px rgba(26,61,36,0.15)",position:"relative"}}>
                    <div style={{position:"absolute",inset:7,border:"1px solid rgba(201,168,76,.25)",borderRadius:1,pointerEvents:"none",zIndex:1}}/>
                    <div style={{padding:"7px 16px",borderBottom:"1px solid rgba(201,168,76,.4)",d