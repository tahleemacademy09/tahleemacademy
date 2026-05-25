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
    }, 20_000);

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
const MINIMIZE_GRACE_MS = 5 * 60 * 1000; // 5 minutes

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
          const lp = room.localParticipant;
          if (lp.isMicrophoneEnabled) {
            await lp.setMicrophoneEnabled(false);
            await new Promise(r => setTimeout(r, 150));
            await lp.setMicrophoneEnabled(true);
          }
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

  // ── 1. Build the Web Audio pipeline once ────────────────────────────────────
  useEffect(() => {
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
    acRef.current = ac;

    // Amplify: 2.5× makes a quiet speaker clearly audible
    const gain = ac.createGain();
    gain.gain.value = 2.5;
    gainRef.current = gain;

    // Compressor: evens out volume differences between participants
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -24;   // start compressing at −24 dBFS
    comp.knee.value      = 30;    // smooth knee for natural sound
    comp.ratio.value     = 8;     // 8:1 compression ratio
    comp.attack.value    = 0.003; // 3 ms attack – reacts quickly
    comp.release.value   = 0.2;   // 200 ms release – no pumping artefacts
    compRef.current = comp;

    // Pipeline: source(s) → gain → compressor → speakers
    gain.connect(comp);
    comp.connect(ac.destination);

    // AudioContext needs a user gesture to start; resume on first interaction
    const resume = () => { if (ac.state === "suspended") ac.resume().catch(() => {}); };
    document.addEventListener("click",      resume, { passive: true });
    document.addEventListener("touchstart", resume, { passive: true });
    document.addEventListener("keydown",    resume, { passive: true });

    return () => {
      document.removeEventListener("click",      resume);
      document.removeEventListener("touchstart", resume);
      document.removeEventListener("keydown",    resume);
      ac.close().catch(() => {});
    };
  }, []);

  // ── 2. Connect / disconnect tracks as participants join or leave ─────────────
  useEffect(() => {
    const ac   = acRef.current;
    const gain = gainRef.current;
    if (!ac || !gain) return;

    // Resume if suspended (e.g. after tab switch on mobile)
    if (ac.state === "suspended") ac.resume().catch(() => {});

    const activeIds = new Set<string>();

    for (const ref of tracks) {
      // Never play back your own microphone
      if (ref.participant.isLocal) continue;

      const pub = ref.publication as RemoteTrackPublication | undefined;
      if (!pub?.track?.mediaStreamTrack) continue;

      const sid = pub.trackSid;
      activeIds.add(sid);

      if (!nodesRef.current.has(sid)) {
        // Create a silent <audio> element so the browser doesn't also render
        // this track through RoomAudioRenderer (we're replacing it for remotes).
        // We DON'T use createMediaElementSource here because that would require
        // the element to be playing. Instead we pull straight from the track.
        const ms     = new MediaStream([pub.track.mediaStreamTrack]);
        const source = ac.createMediaStreamSource(ms);
        source.connect(gain);

        // Dummy audio element — muted so there's no double-playback
        const el = document.createElement("audio");
        el.muted  = true;
        el.srcObject = ms;
        el.autoplay  = false;

        nodesRef.current.set(sid, { source, el });
      }
    }

    // Disconnect tracks that are no longer subscribed
    for (const [sid, { source }] of nodesRef.current) {
      if (!activeIds.has(sid)) {
        source.disconnect();
        nodesRef.current.delete(sid);
      }
    }
  }, [tracks]);

  // ── 3. Full cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      for (const { source } of nodesRef.current.values()) {
        try { source.disconnect(); } catch {}
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

/* ══ GROUP RECITE BRIDGE ══ */
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
                    <div style={{padding:"7px 16px",borderBottom:"1px solid rgba(201,168,76,.4)",display:"flex",justifyContent:"center",background:"linear-gradient(to bottom,rgba(201,168,76,.1),transparent)"}}>
                      <span style={{fontSize:11,fontWeight:700,color:"#b7791f",fontFamily:"'Amiri',serif"}}>صفحة {toAr(page)}</span>
                    </div>
                    {(()=>{
                      const groups:any[]=[];
                      mushafAyahs.forEach((a:any)=>{
                        const sn=a.surah?.number;
                        if(!groups.length||groups[groups.length-1].surah!==sn)
                          groups.push({surah:sn,surahData:a.surah,ayahs:[]});
                        groups[groups.length-1].ayahs.push(a);
                      });
                      return groups.map((g:any,gi:number)=>(
                        <div key={g.surah}>
                          <div style={{margin:`${gi===0?8:14}px 12px 6px`,padding:"5px 12px",background:"linear-gradient(135deg,#1a3d24,#276749)",borderRadius:4,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <span style={{fontFamily:"'Amiri',serif",fontSize:10,color:"rgba(255,255,255,.65)"}}>{g.surahData?.englishName}</span>
                            <span style={{fontFamily:"'Amiri',serif",fontSize:15,color:"#c9a84c",fontWeight:700}}>{g.surahData?.name}</span>
                          </div>
                          {g.surah!==1&&g.surah!==9&&g.ayahs[0]?.numberInSurah===1&&(
                            <div style={{fontFamily:"'Amiri Quran','Amiri',serif",fontSize:19,color:"#1c1208",textAlign:"center",direction:"rtl",padding:"6px 16px 2px",lineHeight:2}}>
                              بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ
                            </div>
                          )}
                          <p style={{fontFamily:"'Amiri Quran','Scheherazade New','Amiri',serif",direction:"rtl",textAlign:"justify",lineHeight:2.8,color:"#1c1208",fontSize:23,margin:0,padding:"6px 18px 12px",wordBreak:"break-word"}}>
                            {g.ayahs.map((a:any)=>{
                              const vk=`${g.surah}:${a.numberInSurah}`;
                              const isPlaying=playingVerse===vk;
                              return(
                                <span key={a.numberInSurah}>
                                  <span style={{background:isPlaying?"rgba(201,168,76,.18)":"transparent",borderRadius:3,transition:"background .2s"}}>
                                    {a.text}
                                  </span>
                                  {"\u00a0"}
                                  <span
                                    style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,borderRadius:"50%",
                                      background:isPlaying?"#1a3d24":"rgba(183,121,31,.85)",
                                      fontSize:9,fontWeight:700,color:"#fff",verticalAlign:"middle",flexShrink:0,margin:"0 1px",cursor:"pointer",
                                      boxShadow:isPlaying?"0 0 0 2px #c9a84c":"none",transition:"all .2s"}}
                                    onClick={()=>playVerse(g.surah,a.numberInSurah)}>
                                    {isPlaying?"▶":toAr(a.numberInSurah)}
                                  </span>
                                  {"\u00a0"}
                                </span>
                              );
                            })}
                          </p>
                        </div>
                      ));
                    })()}
                    <div style={{padding:"5px 16px",borderTop:"1px solid rgba(201,168,76,.4)",display:"flex",justifyContent:"center"}}>
                      <span style={{fontSize:10,color:"#b7791f",fontFamily:"'Amiri',serif"}}>— {toAr(page)} —</span>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:10}}>
                    <button onClick={()=>changePage(-1)} disabled={page<=1}
                      style={{flex:1,padding:"10px",borderRadius:8,border:"1px solid rgba(201,168,76,.5)",background:"#fdf6e3",color:"#1a3d24",fontSize:18,fontWeight:700,cursor:page<=1?"not-allowed":"pointer",opacity:page<=1?0.3:1}}>◀</button>
                    <button onClick={()=>changePage(1)} disabled={page>=604}
                      style={{flex:1,padding:"10px",borderRadius:8,border:"1px solid rgba(201,168,76,.5)",background:"#fdf6e3",color:"#1a3d24",fontSize:18,fontWeight:700,cursor:page>=604?"not-allowed":"pointer",opacity:page>=604?0.3:1}}>▶</button>
                  </div>
                </div>
              )}

              {!mushafLoading&&mushafLines.length===0&&mushafAyahs.length===0&&(
                <div style={{padding:"40px 20px",textAlign:"center",fontFamily:"'Amiri',serif"}}>
                  <div style={{fontSize:36,marginBottom:12}}>📖</div>
                  <p style={{fontSize:13,color:"#7a9e88",margin:"0 0 16px"}}>تعذّر تحميل الصفحة</p>
                  <button onClick={()=>fetchMushafPage(page)}
                    style={{padding:"8px 20px",borderRadius:8,border:"none",background:"#1a3d24",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                    🔄 إعادة المحاولة
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══ MODE: TRANSLATION (page nav + Arabic + English per ayah, no image) ══ */}
        {mode==="translation"&&(
          <>
            <PageNav/>
            <div style={{flex:1,overflowY:"auto",background:"#fff"}}>
              <div style={{padding:"6px 12px",background:"linear-gradient(90deg,rgba(26,61,36,.06),transparent)",borderBottom:"1px solid #f0e8d4",display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:10,fontWeight:800,color:"#1a3d24",letterSpacing:.5,textTransform:"uppercase"}}>🌐 Sahih International · Page {page}</span>
              </div>
              {transLoading&&(
                <div style={{display:"flex",justifyContent:"center",padding:24}}>
                  <div style={{width:22,height:22,border:"3px solid #1a3d24",borderTopColor:"transparent",borderRadius:"50%",animation:"cv-spin .7s linear infinite"}}/>
                </div>
              )}
              {!transLoading&&transAyahs.map((a:any,i:number)=>{
                const sn=a.surah?.number;
                const vKey=`${sn}:${a.numberInSurah}`;
                return(
                  <div key={i} style={{padding:"12px 14px",borderBottom:"1px solid #f5f0e4"}}>
                    {/* Arabic ayah */}
                    <div style={{fontFamily:"'Amiri Quran','Amiri',serif",fontSize:20,color:"#1a3d24",lineHeight:2.1,textAlign:"right",direction:"rtl",wordBreak:"break-word",marginBottom:8}}>
                      {a.arabicText}
                      <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,borderRadius:"50%",background:"#b7791f",marginRight:5,fontSize:9,fontWeight:700,color:"#fff",verticalAlign:"middle",flexShrink:0}}>
                        {toAr(a.numberInSurah)}
                      </span>
                    </div>
                    {/* English translation */}
                    <p style={{margin:"0 0 6px",fontSize:12,color:"#2d3748",lineHeight:1.75}}>{a.text}</p>
                    <button onClick={()=>playVerse(sn,a.numberInSurah)}
                      style={{padding:"2px 8px",borderRadius:5,border:"1px solid #d4e8d4",background:playingVerse===vKey?"#fee2e2":"#f0fff4",color:playingVerse===vKey?"#c0392b":"#1a3d24",fontSize:9,fontWeight:700,cursor:"pointer"}}>
                      {playingVerse===vKey?"⏹ Stop":"▶ Listen"}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ══ MODE: TAFSEER (surah header + ayah list, no image) ══ */}
        {mode==="tafseer"&&(
          <>
            {/* Surah header */}
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"7px 10px",borderBottom:"1px solid #e8dfc8",background:"#fff",flexShrink:0}}>
              <div style={{flex:1,textAlign:"center"}}>
                <span style={{fontFamily:"'Amiri',serif",fontSize:15,color:"#1a3d24",fontWeight:700}}>{SURAHS_LIST[surahNum-1]?.ar}</span>
                <span style={{fontSize:11,color:"#666",marginLeft:6}}>{SURAHS_LIST[surahNum-1]?.name}</span>
              </div>
              <button onClick={()=>setShowPicker(true)}
                style={{padding:"4px 10px",borderRadius:6,border:"1px solid #b7791f",background:"#fffbf0",color:"#b7791f",cursor:"pointer",fontSize:11,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>
                Surah ▾
              </button>
            </div>
            {/* Tafseer list */}
            <div style={{flex:1,overflowY:"auto",background:"#fffbf0"}}>
              <div style={{padding:"6px 12px",background:"linear-gradient(90deg,rgba(183,121,31,.08),transparent)",borderBottom:"1px solid #f0dda0",display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:10,fontWeight:800,color:"#b7791f",letterSpacing:.5,textTransform:"uppercase"}}>📚 تفسير ابن كثير — Tafseer Ibn Katheer</span>
              </div>
              {surahLoading&&(
                <div style={{display:"flex",justifyContent:"center",padding:24}}>
                  <div style={{width:22,height:22,border:"3px solid #b7791f",borderTopColor:"transparent",borderRadius:"50%",animation:"cv-spin .7s linear infinite"}}/>
                </div>
              )}
              {!surahLoading&&(
                <>
                  {surahNum!==9&&(
                    <div style={{fontFamily:"'Amiri',serif",fontSize:18,color:"#b7791f",textAlign:"center",direction:"rtl",padding:"10px 0 10px",borderBottom:"1px dashed #e8dfc8"}}>
                      بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
                    </div>
                  )}
                  {surahAyahs.map((a:any)=>{
                    const key=`${surahNum}:${a.numberInSurah}`;
                    const tafseerText=expandedTafseer[key];
                    const isLoadingT=loadingTafseer[key];
                    return(
                      <div key={a.numberInSurah} style={{borderBottom:"1px solid #f0e8d4",background:"#fff"}}>
                        {/* Arabic ayah */}
                        <div style={{padding:"12px 12px 6px"}}>
                          <div style={{fontFamily:"'Amiri Quran','Amiri',serif",fontSize:22,color:"#1a3d24",lineHeight:2.2,textAlign:"right",direction:"rtl",wordBreak:"break-word"}}>
                            {a.text}
                            <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:24,height:24,borderRadius:"50%",background:"#b7791f",marginRight:6,fontSize:9,fontWeight:700,color:"#fff",verticalAlign:"middle",flexShrink:0}}>
                              {toAr(a.numberInSurah)}
                            </span>
                          </div>
                          {/* Listen button only */}
                          <button onClick={()=>playVerse(surahNum,a.numberInSurah)}
                            style={{padding:"3px 10px",borderRadius:5,border:"1px solid #d4e8d4",background:playingVerse===key?"#fee2e2":"#f0fff4",color:playingVerse===key?"#c0392b":"#1a3d24",fontSize:10,fontWeight:700,cursor:"pointer",marginTop:4}}>
                            {playingVerse===key?"⏹ Stop":"▶ Listen"}
                          </button>
                        </div>
                        {/* Tafseer — always visible */}
                        <div style={{padding:"8px 12px 12px",background:"#fffbf0",borderTop:"1px solid #f5edd8"}}>
                          <div style={{fontSize:9,fontWeight:800,color:"#b7791f",letterSpacing:.7,textTransform:"uppercase",marginBottom:6}}>
                            تفسير ابن كثير
                          </div>
                          {isLoadingT?(
                            <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 0"}}>
                              <div style={{width:12,height:12,border:"2px solid #b7791f",borderTopColor:"transparent",borderRadius:"50%",animation:"cv-spin .6s linear infinite",flexShrink:0}}/>
                              <span style={{fontSize:11,color:"#b7791f"}}>جارٍ تحميل التفسير…</span>
                            </div>
                          ):(
                            <div style={{fontFamily:"'Amiri',serif",fontSize:14,color:"#3d3522",lineHeight:2,direction:"rtl",textAlign:"right",whiteSpace:"pre-wrap"}}>
                              {tafseerText||"—"}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </>
        )}

        {/* Surah picker overlay — shared */}
        {SurahPicker()}

        {/* Google Fonts */}
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&display=swap');`}</style>
      </div>
    </div>
  );
};

const SubjectMaterialsPanel=({subjectId,subject,onClose,canStudentRec,isPrivileged,stuRec,onToggleStuRecord}:any)=>{
  const[mats,setMats]=useState<any[]>([]);
  const[busy,setBusy]=useState(true);
  const[viewing,setViewing]=useState<any>(null);
  const[quranOpen,setQuranOpen]=useState(false);
  const[minimized,setMinimized]=useState(false);
  // Draggable pip position
  const[pipPos,setPipPos]=useState({x:20,y:120});
  const dragging=useRef(false);
  const dragStart=useRef({px:0,py:0,ox:0,oy:0});

  useEffect(()=>{
    supabase.from("subject_materials" as any).select("*").eq("subject_id",subjectId).order("created_at",{ascending:false})
      .then(({data})=>{setMats(data||[]);setBusy(false);});
  },[subjectId]);

  const onPipPointerDown=(e:React.PointerEvent)=>{
    dragging.current=true;
    dragStart.current={px:e.clientX,py:e.clientY,ox:pipPos.x,oy:pipPos.y};
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPipPointerMove=(e:React.PointerEvent)=>{
    if(!dragging.current)return;
    const dx=e.clientX-dragStart.current.px;
    const dy=e.clientY-dragStart.current.py;
    setPipPos({x:dragStart.current.ox+dx,y:dragStart.current.oy+dy});
  };
  const onPipPointerUp=()=>{dragging.current=false;};

  /* ── MINIMIZED: draggable floating circle pip ── */
  if(minimized){
    return(
      <div
        onPointerDown={onPipPointerDown}
        onPointerMove={onPipPointerMove}
        onPointerUp={onPipPointerUp}
        onClick={()=>setMinimized(false)}
        style={{
          position:"absolute",
          left:pipPos.x,top:pipPos.y,
          zIndex:60,width:54,height:54,
          borderRadius:"50%",
          background:"linear-gradient(135deg,#0a7a5e,#1a73e8)",
          boxShadow:"0 4px 20px rgba(0,0,0,.5)",
          display:"flex",alignItems:"center",justifyContent:"center",
          cursor:"grab",userSelect:"none",touchAction:"none",
          border:"2px solid rgba(255,255,255,.2)",
        }}
        title="Open Materials"
      >
        <Eye style={{width:22,height:22,color:"#fff"}}/>
      </div>
    );
  }

  /* ── VIEWING A MATERIAL ── */
  if(quranOpen){
    return(
      <>
        {/* pip always rendered when minimized so video shows through */}
        {minimized
          ? <div onPointerDown={onPipPointerDown} onPointerMove={onPipPointerMove} onPointerUp={onPipPointerUp}
              onClick={()=>setMinimized(false)}
              style={{position:"absolute",left:pipPos.x,top:pipPos.y,zIndex:60,width:54,height:54,borderRadius:"50%",background:"linear-gradient(135deg,#0a7a5e,#1a73e8)",boxShadow:"0 4px 20px rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"grab",userSelect:"none",touchAction:"none",border:"2px solid rgba(255,255,255,.2)"}} title="Open Materials">
              <Eye style={{width:22,height:22,color:"#fff"}}/>
            </div>
          : <div style={{position:"absolute",inset:0,zIndex:55,background:"#202124",display:"flex",flexDirection:"column"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"#2d2e30",borderBottom:"1px solid rgba(255,255,255,.08)",flexShrink:0,height:46}}>
                <button onClick={()=>setMinimized(true)} title="Minimize" style={{background:"rgba(255,255,255,.1)",border:"none",color:"#fff",borderRadius:8,width:30,height:30,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <ChevronDown style={{width:14,height:14}}/>
                </button>
                <button onClick={()=>setQuranOpen(false)} style={{background:"rgba(255,255,255,.08)",border:"none",color:"rgba(255,255,255,.7)",borderRadius:8,padding:"4px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontSize:12,fontFamily:"'Google Sans',sans-serif"}}>
                  <ChevronLeft style={{width:13,height:13}}/> Back
                </button>
                <span style={{flex:1,fontSize:13,fontWeight:500,color:"#e8eaed",fontFamily:"'Google Sans',sans-serif"}}>Full Quran</span>
                <button onClick={onClose} style={{background:"rgba(255,255,255,.08)",border:"none",color:"rgba(255,255,255,.5)",borderRadius:8,width:30,height:30,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <X style={{width:13,height:13}}/>
                </button>
              </div>
              <div style={{flex:1,overflow:"hidden"}}><InClassQuranReader onClose={()=>setQuranOpen(false)}/></div>
            </div>
        }
      </>
    );
  }

  if(viewing){
    return(
      <>
        {minimized
          ? <div onPointerDown={onPipPointerDown} onPointerMove={onPipPointerMove} onPointerUp={onPipPointerUp}
              onClick={()=>setMinimized(false)}
              style={{position:"absolute",left:pipPos.x,top:pipPos.y,zIndex:60,width:54,height:54,borderRadius:"50%",background:"linear-gradient(135deg,#0a7a5e,#1a73e8)",boxShadow:"0 4px 20px rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"grab",userSelect:"none",touchAction:"none",border:"2px solid rgba(255,255,255,.2)"}} title="Open Materials">
              <Eye style={{width:22,height:22,color:"#fff"}}/>
            </div>
          : <div style={{position:"absolute",inset:0,zIndex:55,background:"#202124",display:"flex",flexDirection:"column"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"#2d2e30",borderBottom:"1px solid rgba(255,255,255,.08)",flexShrink:0,height:46}}>
                <button onClick={()=>setMinimized(true)} title="Minimize" style={{background:"rgba(255,255,255,.1)",border:"none",color:"#fff",borderRadius:8,width:30,height:30,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <ChevronDown style={{width:14,height:14}}/>
                </button>
                <button onClick={()=>setViewing(null)} style={{background:"rgba(255,255,255,.08)",border:"none",color:"rgba(255,255,255,.7)",borderRadius:8,padding:"4px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontSize:12,fontFamily:"'Google Sans',sans-serif"}}>
                  <ChevronLeft style={{width:13,height:13}}/> Back
                </button>
                <span style={{flex:1,fontSize:13,fontWeight:500,color:"#e8eaed",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:"'Google Sans',sans-serif"}}>{viewing.title||viewing.name||"Material"}</span>
                <button onClick={onClose} style={{background:"rgba(255,255,255,.08)",border:"none",color:"rgba(255,255,255,.5)",borderRadius:8,width:30,height:30,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <X style={{width:13,height:13}}/>
                </button>
              </div>
              <div style={{flex:1,overflow:"hidden"}}><InClassMaterialViewer material={viewing} onClose={()=>setViewing(null)}/></div>
            </div>
        }
      </>
    );
  }

  /* ── MATERIAL LIST — slides from right, does NOT cover full height ── */
  return(
    <div style={{position:"absolute",inset:0,zIndex:55,background:"rgba(0,0,0,.4)"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        position:"absolute",top:0,right:0,
        /* Important: bottom:0 so footer stays below this panel */
        bottom:0,
        width:"min(340px,100%)",
        background:"#202124",
        borderLeft:"1px solid rgba(255,255,255,.08)",
        display:"flex",flexDirection:"column",
        animation:"slide-right .2s cubic-bezier(.34,1.2,.64,1) both",
        boxShadow:"-6px 0 28px rgba(0,0,0,.5)",
      }}>
        {/* Header — no minimize button here, only close */}
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderBottom:"1px solid rgba(255,255,255,.08)",flexShrink:0,background:"#2d2e30",height:50}}>
          <Eye style={{width:15,height:15,color:TEAL,flexShrink:0}}/>
          <span style={{flex:1,fontSize:14,fontWeight:600,color:"#fff",fontFamily:"'Google Sans',sans-serif"}}>Materials</span>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.08)",border:"none",color:"rgba(255,255,255,.5)",borderRadius:8,width:30,height:30,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <X style={{width:14,height:14}}/>
          </button>
        </div>

        {/* Student record toggle (if allowed) */}
        {!isPrivileged&&canStudentRec&&(
          <button onClick={onToggleStuRecord} style={{
            margin:"10px 10px 0",padding:"11px 14px",borderRadius:10,
            border:`1px solid ${stuRec?"rgba(239,68,68,.4)":"rgba(255,255,255,.1)"}`,
            background:stuRec?"rgba(239,68,68,.12)":"rgba(255,255,255,.04)",
            cursor:"pointer",display:"flex",alignItems:"center",gap:10,flexShrink:0,
          }}>
            <Circle style={{width:11,height:11,fill:stuRec?"#ef4444":"none",color:stuRec?"#ef4444":"rgba(255,255,255,.5)"}}/>
            <span style={{fontSize:13,color:stuRec?"#ef4444":"rgba(255,255,255,.7)",fontFamily:"'Google Sans',sans-serif"}}>{stuRec?"Stop Recording":"Record Audio"}</span>
          </button>
        )}

        {/* Quran button */}
        <button onClick={()=>setQuranOpen(true)} style={{
          margin:"10px 10px 0",padding:"12px 14px",borderRadius:10,
          border:"1px solid rgba(183,121,31,.4)",
          background:"linear-gradient(135deg,rgba(26,61,36,.9),rgba(39,103,73,.9))",
          cursor:"pointer",textAlign:"left" as const,display:"flex",alignItems:"center",gap:10,flexShrink:0,
        }}>
          <div style={{fontSize:22,flexShrink:0}}>📖</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:"'Amiri',serif",fontSize:14,fontWeight:700,color:"#fef9ee"}}>Open Full Quran</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.5)"}}>Arabic · Translation · Tafseer</div>
          </div>
          <ChevronRight style={{width:13,height:13,color:"#34d399",flexShrink:0}}/>
        </button>

        {/* List */}
        <div style={{flex:1,overflowY:"auto",padding:"8px 10px"}}>
          {mats.length>0&&<div style={{fontSize:10,color:"rgba(255,255,255,.3)",fontWeight:600,letterSpacing:.6,padding:"8px 2px 6px",fontFamily:"'Google Sans',sans-serif"}}>UPLOADED MATERIALS</div>}
          {busy&&<div style={{display:"flex",justifyContent:"center",padding:32}}><div style={{width:22,height:22,border:`2px solid ${TEAL}`,borderTopColor:"transparent",borderRadius:"50%",animation:"cv-spin .7s linear infinite"}}/></div>}
          {!busy&&mats.length===0&&<div style={{textAlign:"center" as const,padding:"24px 16px",color:"rgba(255,255,255,.3)"}}>
            <div style={{fontSize:30,marginBottom:6}}>📭</div>
            <p style={{fontSize:12,margin:0,fontFamily:"'Google Sans',sans-serif"}}>No materials yet</p>
          </div>}
          {mats.map(m=>{
            const icon=MAT_TYPE_ICON[m.material_type||"document"]||"📄";
            const resume=loadResume(m.id||"");
            return(
              <button key={m.id} onClick={()=>setViewing(m)} style={{
                width:"100%",display:"flex",alignItems:"center",gap:10,
                padding:"10px 12px",background:"rgba(255,255,255,.04)",
                border:"1px solid rgba(255,255,255,.07)",borderRadius:10,
                cursor:"pointer",textAlign:"left" as const,marginBottom:6,
              }}
                onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,.08)")}
                onMouseLeave={e=>(e.currentTarget.style.background="rgba(255,255,255,.04)")}>
                <div style={{width:36,height:36,borderRadius:8,background:"rgba(10,124,104,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{margin:0,fontSize:12,fontWeight:600,color:"#e8eaf0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:"'Google Sans',sans-serif"}}>{m.title||m.name||"Untitled"}</p>
                  <p style={{margin:"2px 0 0",fontSize:10,color:"rgba(255,255,255,.35)",textTransform:"capitalize" as const}}>
                    {m.material_type||"file"}
                    {resume?.time&&<span style={{marginLeft:5,color:TEAL}}>▶ {Math.floor((resume.time||0)/60)}m</span>}
                    {resume?.page&&!resume?.time&&<span style={{marginLeft:5,color:TEAL}}>p.{resume.page}</span>}
                  </p>
                </div>
                <ChevronRight style={{width:13,height:13,color:"rgba(255,255,255,.25)",flexShrink:0}}/>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ══ MATERIAL VIEWER (teacher-shared) ══
   Renders as position:absolute inside content area so footer stays visible.     */
const MaterialViewer=({material,isTeacher,onClose}:any)=>{
  return <InClassMaterialViewer material={material} isTeacher={isTeacher} onClose={onClose}/>;
};

/* ══ RECORDING CONTROLLER ══ */
const RecController=({sessionId,subjectId,userEmail,onSavingChange,stopRecRef}:any)=>{
  const room=useRoomContext();const{t}=useLanguage();
  const[recording,setRecording]=useState(false);const[paused,setPaused]=useState(false);const[time,setTime]=useState(0);
  const timerRef=useRef<any>(null);const mrRef=useRef<MediaRecorder|null>(null);const chunksRef=useRef<Blob[]>([]);const acRef=useRef<AudioContext|null>(null);
  const collectAudio=useCallback(()=>{
    try{
      const ac=new((window as any).AudioContext||(window as any).webkitAudioContext)();
      acRef.current=ac;
      ac.resume().catch(()=>{});
      const dest=ac.createMediaStreamDestination();
      let n=0;
      [room.localParticipant,...Array.from(room.remoteParticipants.values())].forEach((p:any)=>{
        p.trackPublications?.forEach?.((pub:any)=>{
          if(pub.kind==="audio"&&pub.track?.mediaStreamTrack){
            try {
              ac.createMediaStreamSource(new MediaStream([pub.track.mediaStreamTrack])).connect(dest);
              n++;
            } catch(trackErr) {
              console.warn("[RecController] could not connect track:", trackErr);
            }
          }
        });
      });
      if(n>0) console.log("[RecController] collectAudio connected",n,"audio track(s) from room");
      return n>0?dest.stream:null;
    }catch(e){
      console.warn("[RecController] collectAudio failed:",e);
      return null;
    }
  },[room]);
  const startRec=async()=>{
    try{
      let audio=collectAudio();
      if(!audio){
        console.warn("[RecController] No room audio tracks found — falling back to getUserMedia");
        try{
          audio=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
        }catch(gumErr:any){
          toast({title:"Microphone access denied",description:gumErr?.message||"Check browser permissions",variant:"destructive"});
          return;
        }
      }
      chunksRef.current=[];
      const mimeType=["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg"].find(t=>{try{return MediaRecorder.isTypeSupported(t);}catch{return false;}})||"";
      const mr=new MediaRecorder(audio,mimeType?{mimeType}:undefined);
      mr.ondataavailable=e=>{if(e.data.size>0)chunksRef.current.push(e.data);};
      mr.start(1000);mrRef.current=mr;setRecording(true);setPaused(false);setTime(0);
      timerRef.current=setInterval(()=>setTime(t=>t+1),1000);
      if(sessionId)await supabase.from("live_sessions").update({is_recording:true}as any).eq("id",sessionId);
    }catch(err:any){
      console.error("[RecController] startRec error:",err);
      toast({title:"Recording failed to start",description:err?.message||"Unknown error",variant:"destructive"});
      setRecording(false);
    }
  };
  const stopRec=async()=>{
    const mr=mrRef.current;
    if(!mr||mr.state==="inactive")return;
    clearInterval(timerRef.current);
    const finalTime=time;
    onSavingChange?.(true);
    setRecording(false);
    setPaused(false);
    if(sessionId)supabase.from("live_sessions").update({is_recording:false}as any).eq("id",sessionId).then(()=>{}).catch(()=>{});
    mr.onstop=async()=>{
      try{
        const recMime=mr.mimeType||"audio/webm";
        const recExt=recMime.includes("mp4")?"mp4":recMime.includes("ogg")?"ogg":"webm";
        const blob=new Blob(chunksRef.current,{type:recMime});
        if(blob.size===0){
          toast({title:"Recording empty",description:"No audio was captured. Make sure your mic is on.",variant:"destructive"});
          return;
        }
        // Use a unique path every time (timestamp + random suffix) to avoid collisions
        const uid = `${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
        const recPath=`sessions/${sessionId||subjectId}/${uid}.${recExt}`;
        console.log("[RecController] uploading",blob.size,"bytes to recordings/",recPath);

        // Try upload with upsert:true so path collisions never block the save.
        // Attempt 1: upsert
        let upErr: any = null;
        let attempt = 0;
        while (attempt < 3) {
          const res = await storageSupabase.storage
            .from("recordings")
            .upload(recPath, blob, {cacheControl:"3600", upsert:true, contentType:recMime});
          if (!res.error) { upErr = null; break; }
          upErr = res.error;
          attempt++;
          if (attempt < 3) await new Promise(r => setTimeout(r, 1500 * attempt));
        }

        if(upErr){
          console.error("[RecController] upload error after retries:",upErr);
          // Still save the DB row with a note so admin knows recording was attempted
          // even if storage failed (bucket might not exist yet)
          await supabase.from("session_recordings").insert({
            session_id:   sessionId||null,
            subject_id:   subjectId,
            file_url:     recPath,           // path even if upload failed
            teacher_name: userEmail,
            duration_seconds: finalTime,
          }as any);
          toast({title:"Recording metadata saved",description:`Upload had an error: ${upErr.message}. Check the storage bucket settings.`,variant:"destructive"});
          return;
        }
        console.log("[RecController] upload OK, inserting session_recordings row");

        // Build a signed URL immediately so the DB row has a directly playable URL
        let signedFileUrl: string = recPath;
        try {
          const { data: sd } = await storageSupabase.storage.from("recordings").createSignedUrl(recPath, 60*60*24*365);
          if (sd?.signedUrl) signedFileUrl = recPath; // keep path; player resolves at play-time
        } catch {}

        await supabase.from("session_recordings").insert({
          session_id:   sessionId||null,
          subject_id:   subjectId,
          file_url:     signedFileUrl,
          teacher_name: userEmail,
          duration_seconds: finalTime,
        }as any);
        toast({title:t("Recording saved ✅","تم حفظ التسجيل ✅")});
      }catch(e:any){
        console.error("[RecController] stopRec onstop error:",e);
        toast({title:"Recording save failed",description:e?.message||"Unknown error",variant:"destructive"});
      }finally{
        acRef.current?.close();
        acRef.current=null;
        chunksRef.current=[];
        onSavingChange?.(false);
      }
    };
    mr.stop();
    mrRef.current=null;
  };
  const togglePause=()=>{const mr=mrRef.current;if(!mr)return;if(paused){mr.resume();timerRef.current=setInterval(()=>setTime(t=>t+1),1000);setPaused(false);}else{mr.pause();clearInterval(timerRef.current);setPaused(true);}};
  // Expose stopRec to parent so it can auto-save on class exit / tab close
  useEffect(()=>{if(stopRecRef)stopRecRef.current=stopRec;},[stopRec,stopRecRef]);
  const fmt=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  return(<div style={{display:"flex",alignItems:"center",gap:8}}>
    {recording&&<><span style={{fontSize:12,color:paused?"#fbbf24":RED,fontWeight:700}}>{paused?"⏸":"⏺"} {fmt(time)}</span>
      <button onClick={togglePause} style={{background:GLASSB,border:"none",borderRadius:8,padding:"4px 10px",color:"#fff",fontSize:12,cursor:"pointer"}}>{paused?<Play style={{width:12,height:12}}/>:<Pause style={{width:12,height:12}}/>}</button>
      <button onClick={stopRec} style={{background:"rgba(239,68,68,.25)",border:"none",borderRadius:8,padding:"4px 10px",color:RED,fontSize:12,fontWeight:700,cursor:"pointer"}}>Stop</button></>}
    {!recording&&<button onClick={startRec} style={{display:"flex",alignItems:"center",gap:6,background:"rgba(239,68,68,.14)",border:"1px solid rgba(239,68,68,.35)",borderRadius:20,padding:"5px 14px",color:"#fca5a5",fontSize:12,fontWeight:700,cursor:"pointer"}}><Circle style={{width:7,height:7,fill:RED,color:RED}}/> Record</button>}
  </div>);
};

/* ══ ROOM SETTINGS MODAL ══
   Device picker: mic, speaker, camera (front/back), video quality.
   Adapted from ClassControls SettingsModal — unified UX across both views. */
const RoomSettingsModal = ({ onClose, room }: { onClose: () => void; room: any }) => {
  const [tab, setTab] = useState<"audio" | "video">("audio");
  const [audioIn,    setAudioIn]    = useState<MediaDeviceInfo[]>([]);
  const [audioOut,   setAudioOut]   = useState<MediaDeviceInfo[]>([]);
  const [videoIn,    setVideoIn]    = useState<MediaDeviceInfo[]>([]);
  const [selAudioIn,  setSelAudioIn]  = useState("");
  const [selAudioOut, setSelAudioOut] = useState("");
  const [selVideoIn,  setSelVideoIn]  = useState("");
  const [quality,    setQuality]    = useState<"low"|"medium"|"high">("medium");

  useEffect(() => {
    (async () => {
      try { await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {}
      const all = await navigator.mediaDevices.enumerateDevices();
      setAudioIn(all.filter(d => d.kind === "audioinput"));
      setAudioOut(all.filter(d => d.kind === "audiooutput"));
      setVideoIn(all.filter(d => d.kind === "videoinput"));
      try {
        const mic = await room.getActiveDevice("audioinput"); if (mic) setSelAudioIn(mic);
        const spk = await room.getActiveDevice("audiooutput"); if (spk) setSelAudioOut(spk);
        const cam = await room.getActiveDevice("videoinput"); if (cam) setSelVideoIn(cam);
      } catch {}
    })();
  }, [room]);

  const switchDevice = async (kind: MediaDeviceKind, deviceId: string) => {
    try {
      await room.switchActiveDevice(kind, deviceId);
      if (kind === "audioinput")  setSelAudioIn(deviceId);
      if (kind === "audiooutput") setSelAudioOut(deviceId);
      if (kind === "videoinput")  setSelVideoIn(deviceId);
      toast({ title: "Device switched ✓" });
    } catch (e: any) {
      toast({ title: "Failed to switch device", description: e?.message, variant: "destructive" });
    }
  };

  const applyQuality = async (q: "low"|"medium"|"high") => {
    setQuality(q);
    const bitrate = q === "low" ? 150_000 : q === "medium" ? 700_000 : 2_500_000;
    const fps     = q === "low" ? 15 : q === "medium" ? 20 : 30;
    try {
      for (const pub of Array.from(room.localParticipant.trackPublications.values()) as any[]) {
        if (pub.track?.kind === "video" && pub.source !== Track.Source.ScreenShare) {
          const sender = (pub.track as any)?.sender;
          if (sender) {
            const params = sender.getParameters();
            if (params.encodings?.length) {
              params.encodings[0].maxBitrate   = bitrate;
              params.encodings[0].maxFramerate = fps;
              await sender.setParameters(params);
            }
          }
        }
      }
      toast({ title: `Quality set to ${q}` });
    } catch {}
  };

  const DeviceRow = ({ device, selected, onClick }: { device: MediaDeviceInfo; selected: boolean; onClick: () => void }) => (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
      borderRadius: 10, border: "1px solid",
      borderColor: selected ? "#22c55e" : "rgba(255,255,255,.1)",
      background:  selected ? "rgba(34,197,94,.12)" : "rgba(255,255,255,.03)",
      cursor: "pointer", width: "100%", marginBottom: 6,
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
        border: `2px solid ${selected ? "#22c55e" : "rgba(255,255,255,.3)"}`,
        background: selected ? "#22c55e" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {selected && <Check style={{ width: 9, height: 9, color: "#fff" }} />}
      </div>
      <span style={{ fontSize: 13, color: selected ? "#fff" : "rgba(255,255,255,.7)", textAlign: "left", flex: 1 }}>
        {device.label || `${device.kind} — ${device.deviceId.slice(0, 8)}`}
      </span>
    </button>
  );

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const,
      color: "rgba(255,255,255,.35)", letterSpacing: 1, marginBottom: 8, marginTop: 18 }}>
      {children}
    </div>
  );

  return createPortal(
    <div style={{ position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.65)",display:"flex",alignItems:"center",justifyContent:"center" }}
      onClick={onClose}>
      <div style={{ background:"#17202a",borderRadius:20,width:"min(460px,96vw)",maxHeight:"85vh",
        display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 24px 64px rgba(0,0,0,.7)" }}
        onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{ display:"flex",alignItems:"center",padding:"18px 20px",borderBottom:"1px solid rgba(255,255,255,.07)" }}>
          <Settings style={{ width:18,height:18,color:"rgba(255,255,255,.5)",marginRight:10 }} />
          <span style={{ fontWeight:700,color:"#fff",fontSize:16,flex:1 }}>Settings</span>
          <button onClick={onClose} style={{ width:32,height:32,borderRadius:"50%",background:"rgba(255,255,255,.1)",border:"none",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
            <X style={{ width:15,height:15 }} />
          </button>
        </div>
        {/* Tabs */}
        <div style={{ display:"flex",borderBottom:"1px solid rgba(255,255,255,.07)" }}>
          {(["audio","video"] as const).map(tb=>(
            <button key={tb} onClick={()=>setTab(tb)} style={{
              flex:1,padding:"12px 6px",background:"none",border:"none",cursor:"pointer",
              fontSize:13,fontWeight:tab===tb?700:400,
              color:tab===tb?"#fff":"rgba(255,255,255,.4)",
              borderBottom:`2px solid ${tab===tb?TEAL:"transparent"}`,transition:".15s",
            }}>{tb==="audio"?"🎙️ Audio":"📹 Video"}</button>
          ))}
        </div>
        {/* Body */}
        <div style={{ flex:1,overflowY:"auto",padding:"4px 20px 20px" }}>
          {tab==="audio"&&(
            <>
              <SectionLabel>Microphone (incl. Bluetooth)</SectionLabel>
              {audioIn.length===0
                ? <p style={{ fontSize:13,color:"rgba(255,255,255,.35)" }}>No microphones found</p>
                : audioIn.map(d=><DeviceRow key={d.deviceId} device={d} selected={selAudioIn===d.deviceId} onClick={()=>switchDevice("audioinput",d.deviceId)}/>)
              }
              <SectionLabel>Speaker / Headset / Bluetooth</SectionLabel>
              {audioOut.length===0
                ? <p style={{ fontSize:13,color:"rgba(255,255,255,.35)" }}>Output switching not supported on this browser</p>
                : audioOut.map(d=><DeviceRow key={d.deviceId} device={d} selected={selAudioOut===d.deviceId} onClick={()=>switchDevice("audiooutput",d.deviceId)}/>)
              }
            </>
          )}
          {tab==="video"&&(
            <>
              <SectionLabel>Camera (incl. Front / Back)</SectionLabel>
              {videoIn.length===0
                ? <p style={{ fontSize:13,color:"rgba(255,255,255,.35)" }}>No cameras found</p>
                : videoIn.map(d=><DeviceRow key={d.deviceId} device={d} selected={selVideoIn===d.deviceId} onClick={()=>switchDevice("videoinput",d.deviceId)}/>)
              }
              <SectionLabel>Video Quality</SectionLabel>
              <div style={{ display:"flex",gap:8 }}>
                {(["low","medium","high"] as const).map(q=>(
                  <button key={q} onClick={()=>applyQuality(q)} style={{
                    flex:1,padding:"12px 4px",borderRadius:10,border:"1px solid",cursor:"pointer",
                    fontSize:12,fontWeight:600,
                    borderColor:quality===q?"#22c55e":"rgba(255,255,255,.12)",
                    background: quality===q?"rgba(34,197,94,.14)":"rgba(255,255,255,.04)",
                    color:quality===q?"#22c55e":"rgba(255,255,255,.55)",
                  }}>
                    {q==="low"?"Low 📶":q==="medium"?"Medium 📶📶":"High 📶📶📶"}
                  </button>
                ))}
              </div>
              <p style={{ fontSize:11,color:"rgba(255,255,255,.3)",marginTop:8,lineHeight:1.6 }}>
                Low quality reduces data usage on slow connections.
              </p>
              <SectionLabel>Tips</SectionLabel>
              {[
                ["📱","Tap the flip button (↺) next to the camera button to switch front/back."],
                ["🔵","Bluetooth mic/speaker: enable on your device first, then select above."],
                ["📡","Poor connection? Lower video quality above."],
                ["🖥️","Screen sharing works best on desktop Chrome/Edge."],
              ].map(([icon,text],i)=>(
                <div key={i} style={{ display:"flex",gap:12,padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,.05)" }}>
                  <span style={{ fontSize:20 }}>{icon}</span>
                  <p style={{ fontSize:13,color:"rgba(255,255,255,.65)",lineHeight:1.65,margin:0 }}>{text}</p>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

/* ══ PARTICIPANT TILE — Google Meet premium style ══ */
const ParticipantTile=({participant,isLocal,size="normal"}:{participant:any;isLocal:boolean;size?:"normal"|"large"|"small"})=>{
  const videoRef=useRef<HTMLVideoElement>(null);
  const[hasVideo,setHasVideo]=useState(false);const[isSpeaking,setIsSpeaking]=useState(false);const[micEnabled,setMicEnabled]=useState(true);
  const room=useRoomContext();
  const attachVideo=useCallback(()=>{
    let pub=participant.getTrackPublication?.(Track.Source.Camera);
    if(!pub){participant.trackPublications?.forEach?.((p:any)=>{if(p.source===Track.Source.Camera||p.kind==="video")pub=pub||p;});}
    const track=pub?.videoTrack||pub?.track;const mst=track?.mediaStreamTrack;
    if(mst&&mst.readyState==="live"&&!pub?.isMuted&&videoRef.current){
      if(!(videoRef.current.srcObject instanceof MediaStream)||(videoRef.current.srcObject as MediaStream).getTracks()[0]?.id!==mst.id){
        videoRef.current.srcObject=new MediaStream([mst]);
      }
      if(isLocal)videoRef.current.muted=true;
      videoRef.current.play().catch(()=>{});setHasVideo(true);
    }else{if(videoRef.current&&videoRef.current.srcObject)videoRef.current.srcObject=null;setHasVideo(false);}
    let micPub=participant.getTrackPublication?.(Track.Source.Microphone);
    if(!micPub)participant.trackPublications?.forEach?.((p:any)=>{if(p.source===Track.Source.Microphone)micPub=micPub||p;});
    setMicEnabled(!(micPub?.isMuted??false));
  },[participant,isLocal]);
  useEffect(()=>{
    attachVideo();
    const onSpeak=(v:boolean)=>setIsSpeaking(v);
    participant.on?.("trackSubscribed",attachVideo);participant.on?.("trackUnsubscribed",attachVideo);
    participant.on?.("trackMuted",attachVideo);participant.on?.("trackUnmuted",attachVideo);
    participant.on?.("trackPublished",attachVideo);participant.on?.("trackUnpublished",attachVideo);
    participant.on?.("isSpeakingChanged",onSpeak);
    if(isLocal){room.on(RoomEvent.LocalTrackPublished,attachVideo);room.on(RoomEvent.LocalTrackUnpublished,attachVideo);room.on(RoomEvent.TrackMuted,attachVideo);room.on(RoomEvent.TrackUnmuted,attachVideo);}
    const poll=setInterval(attachVideo,1500);
    return()=>{
      clearInterval(poll);
      participant.off?.("trackSubscribed",attachVideo);participant.off?.("trackUnsubscribed",attachVideo);
      participant.off?.("trackMuted",attachVideo);participant.off?.("trackUnmuted",attachVideo);
      participant.off?.("trackPublished",attachVideo);participant.off?.("trackUnpublished",attachVideo);
      participant.off?.("isSpeakingChanged",onSpeak);
      if(isLocal){room.off(RoomEvent.LocalTrackPublished,attachVideo);room.off(RoomEvent.LocalTrackUnpublished,attachVideo);room.off(RoomEvent.TrackMuted,attachVideo);room.off(RoomEvent.TrackUnmuted,attachVideo);}
    };
  },[participant,attachVideo,room,isLocal]);

  const name=participant.name||participant.identity||"User";
  // avatarSz/avatarFs kept for speaking wave sizing only
  const avatarSz = size==="large" ? 80 : size==="small" ? 40 : 56;

  // Speaking ring color — Google Meet blue
  const speakBorder = isSpeaking ? "2px solid #1a73e8" : "2px solid transparent";

  return(
    <div
      className={`gm-tile${isSpeaking?" speaking":""}`}
      style={{width:"100%",height:"100%",border:speakBorder,transition:"border-color .2s"}}
    >
      {/* Live video */}
      <video ref={videoRef} autoPlay playsInline muted={isLocal}
        style={{width:"100%",height:"100%",objectFit:"cover",display:hasVideo?"block":"none",transform:isLocal?"scaleX(-1)":"none",background:"#202124"}}
      />

      {/* Camera-off avatar — exact silhouette match to GuestClassroom/Image 2 */}
      {!hasVideo&&(
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"#111111"}}>
          {/* Exact silhouette from Image 2 — light grey, large, fills tile */}
          <svg
            viewBox="0 0 200 220"
            style={{
              width:size==="small"?"65%":"72%",
              height:size==="small"?"65%":"72%",
              maxWidth:220,maxHeight:220,
            }}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Head — large circle, same proportions as Image 2 */}
            <circle cx="100" cy="72" r="52" fill="#6e7681"/>
            {/* Shoulders/body — wide rounded trapezoid matching Image 2 */}
            <path d="M0 220 C0 148 36 128 100 128 C164 128 200 148 200 220Z" fill="#6e7681"/>
          </svg>
          {isSpeaking&&(
            <div className="gm-wave" style={{position:"absolute",bottom:52}}>
              {[0,1,2,3].map(i=>(
                <div key={i} className="gm-wave-bar" style={{height:14,animationDelay:`${i*.1}s`}}/>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Speaking border ring over video */}
      {isSpeaking&&hasVideo&&(
        <div style={{position:"absolute",inset:0,border:"3px solid #1a73e8",borderRadius:"inherit",pointerEvents:"none",transition:"opacity .2s"}}/>
      )}

      {/* Name bar — single pill bottom-left, exactly like Image 2 */}
      <div style={{
        position:"absolute",bottom:8,left:8,
        display:"inline-flex",alignItems:"center",gap:5,
        background:"rgba(0,0,0,.6)",backdropFilter:"blur(6px)",
        borderRadius:20,padding:"5px 12px",
        maxWidth:"calc(100% - 16px)",pointerEvents:"none",
      }}>
        <MicOff style={{width:13,height:13,color:"rgba(255,255,255,.75)",flexShrink:0,display:micEnabled?"none":"block"}}/>
        {micEnabled&&<Mic style={{width:13,height:13,color:"rgba(255,255,255,.75)",flexShrink:0}}/>}
        <span style={{
          fontSize:13,fontWeight:400,color:"#fff",
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
          fontFamily:"'Google Sans',sans-serif",
        }}>{name}{isLocal?" (You)":""}</span>
      </div>
    </div>
  );
};

/* ══ VIDEO GRID — Google Meet adaptive tiling ══ */
const VideoGrid=({layout="grid",isMobile=false}:{layout?:LayoutMode;isMobile?:boolean})=>{
  const{localParticipant}=useLocalParticipant();
  const allParticipants=useParticipants();
  const remotes=allParticipants.filter(p=>p.identity!==localParticipant?.identity);
  const all=localParticipant?[localParticipant,...remotes]:remotes;
  const n=all.length;

  // Check for active screen share
  const screensharer=all.find(p=>{
    const pub=p.getTrackPublication?.(Track.Source.ScreenShare)||p.trackPublications?.get(Track.Source.ScreenShare);
    return pub?.track&&!pub.isMuted;
  });

  if(screensharer)return(
    <div style={{width:"100%",height:"100%",display:"flex",gap:6,padding:6,boxSizing:"border-box"}}>
      <div style={{flex:1,minWidth:0}}><ParticipantTile participant={screensharer} isLocal={screensharer.identity===localParticipant?.identity} size="large"/></div>
      <div style={{width:140,display:"flex",flexDirection:"column",gap:6,overflowY:"auto"}}>
        {all.map(p=>(<div key={p.identity} style={{height:90,flexShrink:0}}><ParticipantTile participant={p} isLocal={p.identity===localParticipant?.identity} size="small"/></div>))}
      </div>
    </div>
  );

  if(layout==="spotlight")return(
    <div style={{width:"100%",height:"100%",display:"flex",gap:6,padding:6,boxSizing:"border-box"}}>
      <div style={{flex:1,minWidth:0}}><ParticipantTile participant={all[0]} isLocal={all[0]?.identity===localParticipant?.identity} size="large"/></div>
      {n>1&&<div style={{width:130,display:"flex",flexDirection:"column",gap:6,overflowY:"auto"}}>
        {all.slice(1).map(p=>(<div key={p.identity} style={{height:88,flexShrink:0}}><ParticipantTile participant={p} isLocal={p.identity===localParticipant?.identity} size="small"/></div>))}
      </div>}
    </div>
  );

  if(layout==="horizontal")return(
    <div style={{width:"100%",height:"100%",display:"flex",gap:6,padding:6,boxSizing:"border-box"}}>
      {all.map(p=>(<div key={p.identity} style={{flex:1,minWidth:0,height:"100%"}}>
        <ParticipantTile participant={p} isLocal={p.identity===localParticipant?.identity} size={n===1?"large":"normal"}/>
      </div>))}
    </div>
  );

  if(layout==="vertical")return(
    <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",gap:6,padding:6,boxSizing:"border-box"}}>
      {all.map(p=>(<div key={p.identity} style={{flex:1,minHeight:0,width:"100%"}}>
        <ParticipantTile participant={p} isLocal={p.identity===localParticipant?.identity} size={n===1?"large":"normal"}/>
      </div>))}
    </div>
  );

  if(layout==="focus"){
    const local=all.find(p=>p.identity===localParticipant?.identity)||all[0];
    const others=all.filter(p=>p.identity!==local?.identity);
    return(
      <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",gap:6,padding:6,boxSizing:"border-box"}}>
        <div style={{flex:1,minHeight:0}}>{local&&<ParticipantTile participant={local} isLocal size="large"/>}</div>
        {others.length>0&&<div style={{height:96,display:"flex",gap:6,flexShrink:0,overflowX:"auto"}}>
          {others.map(p=>(<div key={p.identity} style={{width:128,flexShrink:0}}><ParticipantTile participant={p} isLocal={false} size="small"/></div>))}
        </div>}
      </div>
    );
  }

  if(n===1)return(
    <div style={{width:"100%",height:"100%",padding:6,boxSizing:"border-box"}}>
      <ParticipantTile participant={all[0]} isLocal={all[0]?.identity===localParticipant?.identity} size="large"/>
    </div>
  );

  // Mobile: always 2 columns so tiles stack in rows (2×3 portrait grid).
  // Desktop: adaptive — ≤4: 2×2, ≤6: 3×2, ≤9: 3×3, else 4-col.
  const COLS = isMobile ? 2 : (n<=2?2:n<=4?2:n<=6?3:n<=9?3:4);
  const ROWS = Math.ceil(n/COLS);
  const isOdd = n%COLS!==0;
  return(
    <div style={{width:"100%",height:"100%",display:"grid",gridTemplateColumns:`repeat(${COLS},1fr)`,gridTemplateRows:`repeat(${ROWS},1fr)`,gap:6,padding:6,boxSizing:"border-box"}}>
      {all.map((p,i)=>{
        const isLastLone=isOdd&&i===n-1;
        return(
          <div key={p.identity} style={isLastLone?{gridColumn:"1 / -1",display:"flex",justifyContent:"center"}:{}}>
            <div style={isLastLone?{width:`${100/COLS}%`,height:"100%"}:{width:"100%",height:"100%"}}>
              <ParticipantTile participant={p} isLocal={p.identity===localParticipant?.identity} size={isMobile||n<=4?"normal":"small"}/>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ══ BOTTOM BAR — Google Meet premium ══ */
const BottomBar=({sessionId,onToggleChat,onToggleParticipants,onEndClass,onLeaveClass,chatUnread,onToggleWhiteboard,whiteboardOpen,onGroupRecite,groupReciteMode,onShareMaterial,isPrivileged,canStudentWriteProp,canStudentRecProp,onPermChange,onMinimize,room,isMobile,onToggleMaterials,matPanelOpen,onSendEmoji,layout,onLayoutChange,onLaunchQuiz}:any)=>{
  const{user}=useAuth();
  const[micOn,setMicOn]=useState(false);
  const[camOn,setCamOn]=useState(false);
  const[handUp,setHandUp]=useState(false);
  const[moreOpen,setMoreOpen]=useState(false);
  const[emojisOpen,setEmojisOpen]=useState(false);
  const[audioPicker,setAudioPicker]=useState(false);
  const[videoPicker,setVideoPicker]=useState(false);
  const[stuRec,setStuRec]=useState(false);
  const stuMrRef=useRef<MediaRecorder|null>(null);
  const stuChunks=useRef<Blob[]>([]);
  const[camFacing,setCamFacing]=useState<"user"|"environment">("user");
  const[audioDevices,setAudioDevices]=useState<MediaDeviceInfo[]>([]);
  const[videoDevices,setVideoDevices]=useState<MediaDeviceInfo[]>([]);
  const[selAudio,setSelAudio]=useState("");
  const[selVideo,setSelVideo]=useState("");
  const[liveCount,setLiveCount]=useState(0);
  const micBusy=useRef(false);
  const camBusy=useRef(false);
  const micBtnRef=useRef<HTMLDivElement>(null);
  const camBtnRef=useRef<HTMLDivElement>(null);
  const moreBtnRef=useRef<HTMLDivElement>(null);
  const[audioPickerPos,setAudioPickerPos]=useState({bottom:0,left:0});
  const[videoPickerPos,setVideoPickerPos]=useState({bottom:0,left:0});
  const[morePos,setMorePos]=useState({bottom:0,right:0});

  useEffect(()=>{
    if(!room)return;
    const sync=()=>{setMicOn(!!room.localParticipant?.isMicrophoneEnabled);setCamOn(!!room.localParticipant?.isCameraEnabled);};
    sync();
    room.on(RoomEvent.LocalTrackPublished,sync);room.on(RoomEvent.LocalTrackUnpublished,sync);
    room.on(RoomEvent.TrackMuted,sync);room.on(RoomEvent.TrackUnmuted,sync);
    return()=>{room.off(RoomEvent.LocalTrackPublished,sync);room.off(RoomEvent.LocalTrackUnpublished,sync);room.off(RoomEvent.TrackMuted,sync);room.off(RoomEvent.TrackUnmuted,sync);};
  },[room]);

  useEffect(()=>{
    if(!room)return;
    const update=()=>setLiveCount(room.numParticipants||0);
    update();
    room.on(RoomEvent.ParticipantConnected,update);room.on(RoomEvent.ParticipantDisconnected,update);
    return()=>{room.off(RoomEvent.ParticipantConnected,update);room.off(RoomEvent.ParticipantDisconnected,update);};
  },[room]);

  const computePos=(ref:React.RefObject<HTMLDivElement>,align:"left"|"right")=>{
    if(!ref.current)return;
    const r=ref.current.getBoundingClientRect();
    const bottom=window.innerHeight-r.top+10;
    if(align==="left")return{bottom,left:Math.max(8,r.left)};
    return{bottom,right:Math.max(8,window.innerWidth-r.right)};
  };

  const openAudioPicker=async()=>{
    try{await navigator.mediaDevices.getUserMedia({audio:true}).catch(()=>{});}catch{}
    const all=await navigator.mediaDevices.enumerateDevices();
    setAudioDevices(all.filter(d=>d.kind==="audioinput"));
    try{const cur=await room.getActiveDevice("audioinput");if(cur)setSelAudio(cur);}catch{}
    const pos=computePos(micBtnRef,"left");if(pos)setAudioPickerPos(pos as any);
    setAudioPicker(true);setVideoPicker(false);setMoreOpen(false);setEmojisOpen(false);
  };
  const openVideoPicker=async()=>{
    try{await navigator.mediaDevices.getUserMedia({video:true}).catch(()=>{});}catch{}
    const all=await navigator.mediaDevices.enumerateDevices();
    setVideoDevices(all.filter(d=>d.kind==="videoinput"));
    try{const cur=await room.getActiveDevice("videoinput");if(cur)setSelVideo(cur);}catch{}
    const pos=computePos(camBtnRef,"left");if(pos)setVideoPickerPos(pos as any);
    setVideoPicker(true);setAudioPicker(false);setMoreOpen(false);setEmojisOpen(false);
  };
  const openMore=()=>{
    const pos=computePos(moreBtnRef,"right");if(pos)setMorePos(pos as any);
    setMoreOpen(v=>!v);setAudioPicker(false);setVideoPicker(false);setEmojisOpen(false);
  };
  const closeAll=()=>{setAudioPicker(false);setVideoPicker(false);setMoreOpen(false);setEmojisOpen(false);};

  const switchAudio=async(id:string)=>{
    try{await room.switchActiveDevice("audioinput",id);setSelAudio(id);toast({title:"Microphone switched ✓"});}
    catch(e:any){toast({title:"Could not switch",description:e?.message,variant:"destructive"});}
    setAudioPicker(false);
  };
  const switchVideo=async(id:string)=>{
    try{await room.switchActiveDevice("videoinput",id);setSelVideo(id);toast({title:"Camera switched ✓"});}
    catch(e:any){toast({title:"Could not switch",description:e?.message,variant:"destructive"});}
    setVideoPicker(false);
  };
  const flipCamera=async()=>{
    if(!room?.localParticipant||!camOn)return;
    try{
      const next=camFacing==="user"?"environment":"user";
      await room.localParticipant.setCameraEnabled(false);
      await new Promise(r=>setTimeout(r,200));
      await room.localParticipant.setCameraEnabled(true,{facingMode:next}as any);
      setCamFacing(next);toast({title:next==="environment"?"🔄 Back camera":"🔄 Front camera"});
    }catch{toast({title:"Could not flip camera",variant:"destructive"});}
    setVideoPicker(false);
  };
  const toggleMic=async()=>{
    if(!room?.localParticipant||micBusy.current)return;
    micBusy.current=true;
    try{await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);}
    catch(e){console.error("toggleMic:",e);}finally{micBusy.current=false;}
  };
  const toggleCam=async()=>{
    if(!room?.localParticipant||camBusy.current)return;
    camBusy.current=true;
    try{await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled);}
    catch(e){console.error("toggleCam:",e);}finally{camBusy.current=false;}
  };
  const toggleHand=async()=>{
    if(!user||!sessionId)return;
    const n=!handUp;setHandUp(n);
    await supabase.from("class_participants").update({hand_raised:n,hand_raised_at:n?new Date().toISOString():null}).eq("session_id",sessionId).eq("student_id",user.id);
    try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"hand_raise",identity:room.localParticipant.identity,name:room.localParticipant.name||user?.user_metadata?.full_name||"Student",raised:n})),{reliable:true});}catch{}
  };
  const toggleStuRecord=async()=>{
    if(stuRec){
      stuMrRef.current?.stop();
      stuMrRef.current!.onstop=()=>{
        const mt=stuMrRef.current?.mimeType||"audio/webm";
        const blob=new Blob(stuChunks.current,{type:mt});
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");a.href=url;a.download=`class-${Date.now()}.webm`;a.click();URL.revokeObjectURL(url);stuChunks.current=[];
      };setStuRec(false);
    }else{
      try{
        const s=await navigator.mediaDevices.getUserMedia({audio:true});
        const mime=["audio/webm","audio/mp4","audio/ogg"].find(t=>{try{return MediaRecorder.isTypeSupported(t);}catch{return false;}})||"";
        const mr=new MediaRecorder(s,mime?{mimeType:mime}:undefined);
        stuChunks.current=[];mr.ondataavailable=e=>{if(e.data.size>0)stuChunks.current.push(e.data);};
        mr.start(1000);stuMrRef.current=mr;setStuRec(true);
      }catch{toast({title:"Microphone access denied"});}
    }
  };
  const sendEmoji=(e:string)=>{
    setEmojisOpen(false);
    try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"emoji_react",emoji:e,sender:user?.user_metadata?.full_name||""})),{reliable:false});}catch{}
    onSendEmoji?.(e);
    if(user&&sessionId)supabase.from("class_chat_messages").insert({session_id:sessionId,sender_id:user.id,message:e,type:"reaction"});
  };

  const portal=typeof document!=="undefined"?document.body:null;
  const SZ=isMobile?18:20;const IS={width:SZ,height:SZ};

  /* ── Google Meet style ctrl button ── */
  const Ctrl=({icon,label,onClick,active=false,danger=false,badge=0,bRef,tooltip}:{icon:React.ReactNode;label:string;onClick:()=>void;active?:boolean;danger?:boolean;badge?:number;bRef?:any;tooltip?:string})=>(
    <div ref={bRef} style={{position:"relative",flexShrink:0}}>
      <button
        className={`gm-ctrl${danger?" danger":active?" active":""}`}
        onClick={onClick} title={tooltip||label}
        style={{background:"none",border:"none",cursor:"pointer",padding:0,outline:"none"}}
      >
        <div className="gm-ctrl-icon">
          {icon}
          {badge>0&&<span style={{position:"absolute",top:2,right:2,background:"#ea4335",color:"#fff",borderRadius:"50%",width:16,height:16,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,border:"2px solid #202124"}}>{badge>9?"9+":badge}</span>}
        </div>
        {!isMobile&&<span className="gm-ctrl-label">{label}</span>}
        <div className="gm-tooltip">{tooltip||label}</div>
      </button>
    </div>
  );

  /* ── Device list item ── */
  const DeviceRow=({label,selected,onClick}:{label:string;selected:boolean;onClick:()=>void})=>(
    <button onClick={onClick} className="gm-sheet-item" style={{color:selected?"#8ab4f8":"rgba(255,255,255,.75)"}}>
      <div style={{width:16,height:16,borderRadius:"50%",border:`2px solid ${selected?"#8ab4f8":"rgba(255,255,255,.3)"}`,background:selected?"#8ab4f8":"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
        {selected&&<div style={{width:5,height:5,borderRadius:"50%",background:"#202124"}}/>}
      </div>
      <span style={{fontSize:13,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:"'Google Sans',sans-serif"}}>{label}</span>
    </button>
  );

  return(<>
    {/* Click-away */}
    {(audioPicker||videoPicker||moreOpen||emojisOpen)&&portal&&createPortal(
      <div onClick={closeAll} style={{position:"fixed",inset:0,zIndex:9100}}/>,portal
    )}

    {/* Audio picker */}
    {audioPicker&&portal&&createPortal(
      <div className="gm-sheet" style={{bottom:audioPickerPos.bottom,left:(audioPickerPos as any).left}}>
        <div style={{padding:"13px 16px",borderBottom:"1px solid rgba(255,255,255,.07)",fontSize:12,fontWeight:600,color:"rgba(255,255,255,.6)",fontFamily:"'Google Sans',sans-serif",letterSpacing:.3}}>🎤 Microphone</div>
        {audioDevices.map(d=>(<DeviceRow key={d.deviceId} label={d.label||"Microphone "+d.deviceId.slice(0,6)} selected={selAudio===d.deviceId} onClick={()=>switchAudio(d.deviceId)}/>))}
        {audioDevices.length===0&&<p style={{fontSize:12,color:"rgba(255,255,255,.3)",padding:14,textAlign:"center"}}>No microphones found</p>}
      </div>,portal
    )}

    {/* Video picker */}
    {videoPicker&&portal&&createPortal(
      <div className="gm-sheet" style={{bottom:videoPickerPos.bottom,left:(videoPickerPos as any).left}}>
        <div style={{padding:"13px 16px",borderBottom:"1px solid rgba(255,255,255,.07)",fontSize:12,fontWeight:600,color:"rgba(255,255,255,.6)",fontFamily:"'Google Sans',sans-serif",letterSpacing:.3}}>📷 Camera</div>
        {videoDevices.map(d=>(<DeviceRow key={d.deviceId} label={d.label||"Camera "+d.deviceId.slice(0,6)} selected={selVideo===d.deviceId} onClick={()=>switchVideo(d.deviceId)}/>))}
        {videoDevices.length>1&&(
          <button onClick={flipCamera} className="gm-sheet-item" style={{color:"rgba(255,255,255,.7)",borderTop:"1px solid rgba(255,255,255,.07)",marginTop:0}}>
            <SwitchCamera style={{width:14,height:14,opacity:.6,flexShrink:0}}/><span style={{fontSize:13,fontFamily:"'Google Sans',sans-serif"}}>Flip (Front / Back)</span>
          </button>
        )}
        {videoDevices.length===0&&<p style={{fontSize:12,color:"rgba(255,255,255,.3)",padding:14,textAlign:"center"}}>No cameras found</p>}
      </div>,portal
    )}

    {/* Emoji tray */}
    {emojisOpen&&portal&&createPortal(
      <div className="gm-emoji-tray" style={{bottom:84+(isMobile?4:12)}}>
        {["👏","🤲","❤️","😂","🌟","👍","🙏","🔥"].map(e=>(
          <button key={e} className="gm-emoji-btn" onClick={()=>sendEmoji(e)}>{e}</button>
        ))}
      </div>,portal
    )}

    {/* More menu — clean */}
    {moreOpen&&portal&&createPortal(
      <div className="gm-more-menu" style={{bottom:morePos.bottom,right:(morePos as any).right,minWidth:240}}>
        {isMobile&&<>
          {isPrivileged
            ?<button className="gm-more-item" onClick={()=>{onToggleWhiteboard();setMoreOpen(false);}} style={{color:whiteboardOpen?"#34d399":"#e8eaed"}}>
              <PenTool style={{width:16,height:16}}/> {whiteboardOpen?"Close Whiteboard":"Whiteboard"}
            </button>
            :<button className="gm-more-item" onClick={()=>{toggleHand();setMoreOpen(false);}} style={{color:handUp?"#fbbf24":"#e8eaed"}}>
              <Hand style={{width:16,height:16}}/> {handUp?"Lower Hand":"Raise Hand"}
            </button>
          }
          {!isPrivileged&&canStudentWriteProp&&(
            <button className="gm-more-item" onClick={()=>{onToggleWhiteboard();setMoreOpen(false);}} style={{color:whiteboardOpen?"#34d399":"#e8eaed"}}>
              <PenTool style={{width:16,height:16}}/> {whiteboardOpen?"Close Whiteboard":"Whiteboard"}
            </button>
          )}
        </>}
        <button className="gm-more-item" onClick={()=>{setEmojisOpen(true);setMoreOpen(false);}}>
          <Smile style={{width:16,height:16,opacity:.7}}/> Send a Reaction
        </button>
        <button className="gm-more-item" onClick={()=>{onToggleMaterials();setMoreOpen(false);}}>
          <Eye style={{width:16,height:16,opacity:.7}}/> Materials
        </button>
        {isPrivileged&&<>
          <button className="gm-more-item" onClick={()=>{onGroupRecite(room);setMoreOpen(false);}} style={{color:groupReciteMode?"#34d399":"#e8eaed"}}>
            <Volume2 style={{width:16,height:16}}/> {groupReciteMode?"End Group Recitation":"Group Recitation"}
          </button>
          <button className="gm-more-item" onClick={()=>{onPermChange?.("write",!canStudentWriteProp,room);setMoreOpen(false);}} style={{color:canStudentWriteProp?"#34d399":"#e8eaed"}}>
            <PenTool style={{width:16,height:16}}/> {canStudentWriteProp?"Revoke Board Access":"Allow Students to Write"}
          </button>
          <button className="gm-more-item" onClick={()=>{onPermChange?.("rec",!canStudentRecProp,room);setMoreOpen(false);}} style={{color:canStudentRecProp?"#f87171":"#e8eaed"}}>
            <Circle style={{width:13,height:13,fill:canStudentRecProp?"#ef4444":"none",color:canStudentRecProp?"#ef4444":"#e8eaed"}}/> {canStudentRecProp?"Revoke Recording":"Allow Students to Record"}
          </button>
          <button className="gm-more-item" onClick={async()=>{
            await supabase.from("class_participants").update({is_muted:true}).eq("session_id",sessionId);
            try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"admin_mute_all"})),{reliable:true});}catch{}
            toast({title:"\uD83D\uDD07 All students muted"});setMoreOpen(false);
          }} style={{color:"#fb923c"}}>
            <MicOff style={{width:16,height:16}}/> Mute All Students
          </button>
        </>}
        {!isPrivileged&&canStudentRecProp&&(
          <button className="gm-more-item" onClick={()=>{toggleStuRecord();setMoreOpen(false);}} style={{color:stuRec?"#ef4444":"#e8eaed"}}>
            <Circle style={{width:13,height:13,fill:stuRec?"#ef4444":"none"}}/> {stuRec?"Stop Recording":"Record Audio"}
          </button>
        )}

      </div>,portal
    )}

    {/* ══ CONTROL BAR ══ */}
    <div className="cv-bar gm-bar" style={{
      height:isMobile?58:80,
      background:isMobile?"#f1f3f4":"rgba(32,33,36,.97)",
      backdropFilter:isMobile?"none":"blur(20px)",
      WebkitBackdropFilter:isMobile?"none":"blur(20px)",
      borderTop:isMobile?"none":"1px solid rgba(255,255,255,.06)",
      display:"flex",alignItems:"center",
      justifyContent:"center",
      padding:`0 ${isMobile?14:24}px calc(${isMobile?4:8}px + env(safe-area-inset-bottom,0px)) ${isMobile?14:24}px`,
      flexShrink:0,gap:isMobile?8:12,
    }}>

      {isMobile ? (
        /* ── MOBILE: Image 2 exact — light bar, rectangle pill buttons ── */
        <>
          {/* Mic pill + chevron */}
          <div ref={micBtnRef} style={{display:"flex",alignItems:"center",background:"#e2e5e9",borderRadius:12,overflow:"hidden",height:44,flexShrink:0}}>
            <button onClick={toggleMic} style={{width:46,height:44,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:"transparent",color:"#202124"}}>
              {micOn?<Mic style={{width:20,height:20,color:"#202124"}}/>:<MicOff style={{width:20,height:20,color:"#202124"}}/>}
            </button>
            <button onClick={openAudioPicker} style={{width:24,height:44,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:"transparent",color:"#5f6368",borderLeft:"1px solid rgba(0,0,0,.08)"}}>
              <svg width="9" height="6" viewBox="0 0 8 5" fill="currentColor"><path d="M4 5L0 0h8z"/></svg>
            </button>
          </div>

          {/* Cam pill + chevron */}
          <div ref={camBtnRef} style={{display:"flex",alignItems:"center",background:"#e2e5e9",borderRadius:12,overflow:"hidden",height:44,flexShrink:0}}>
            <button onClick={toggleCam} style={{width:46,height:44,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:"transparent"}}>
              {camOn?<Video style={{width:20,height:20,color:"#202124"}}/>:<VideoOff style={{width:20,height:20,color:"#202124"}}/>}
            </button>
            <button onClick={openVideoPicker} style={{width:24,height:44,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:"transparent",color:"#5f6368",borderLeft:"1px solid rgba(0,0,0,.08)"}}>
              <svg width="9" height="6" viewBox="0 0 8 5" fill="currentColor"><path d="M4 5L0 0h8z"/></svg>
            </button>
          </div>

          {/* Chat */}
          <button onClick={onToggleChat} style={{width:44,height:44,borderRadius:12,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:"#e2e5e9",color:"#202124",position:"relative",flexShrink:0}}>
            <MessageCircle style={{width:20,height:20}}/>
            {chatUnread>0&&<span style={{position:"absolute",top:5,right:5,background:"#ea4335",color:"#fff",borderRadius:"50%",width:14,height:14,fontSize:8,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{chatUnread>9?"9+":chatUnread}</span>}
          </button>

          {/* More ⋮ */}
          <div ref={moreBtnRef} style={{flexShrink:0}}>
            <button onClick={openMore} style={{width:44,height:44,borderRadius:12,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:moreOpen?"#d2e3fc":"#e2e5e9",color:"#202124"}}>
              <MoreVertical style={{width:20,height:20}}/>
            </button>
          </div>

          {/* Leave */}
          <button onClick={isPrivileged?onEndClass:onLeaveClass} style={{height:44,padding:"0 16px",borderRadius:12,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5,background:"#ea4335",color:"#fff",flexShrink:0,boxShadow:"0 2px 8px rgba(234,67,53,.35)"}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </>
      ) : (
        /* ── DESKTOP: full Google Meet layout ── */
        <>
          {/* LEFT — Mic + Cam with chevrons */}
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            <div ref={micBtnRef} className="gm-av-group">
              <button className={`gm-av-main${micOn?"":" off"}`} onClick={toggleMic} title={micOn?"Mute microphone":"Unmute microphone"}>
                {micOn?<Mic style={IS}/>:<MicOff style={IS}/>}
              </button>
              <button className={`gm-av-chevron${micOn?"":" off"}`} onClick={openAudioPicker} title="Microphone options">
                <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor"><path d="M4 5L0 0h8z"/></svg>
              </button>
            </div>
            <div ref={camBtnRef} className="gm-av-group">
              <button className={`gm-av-main${camOn?"":" off"}`} onClick={toggleCam} title={camOn?"Turn off camera":"Turn on camera"}>
                {camOn?<Video style={IS}/>:<VideoOff style={IS}/>}
              </button>
              <button className={`gm-av-chevron${camOn?"":" off"}`} onClick={openVideoPicker} title="Camera options">
                <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor"><path d="M4 5L0 0h8z"/></svg>
              </button>
            </div>
          </div>
          {/* CENTER */}
          <div style={{display:"flex",alignItems:"center",gap:8,flex:1,justifyContent:"center"}}>
            {isPrivileged
              ?<Ctrl icon={<PenTool style={{...IS,color:whiteboardOpen?"#34d399":"#e8eaed"}}/>} label="Board" onClick={onToggleWhiteboard} active={whiteboardOpen} tooltip="Whiteboard"/>
              :<Ctrl icon={<Hand style={{...IS,color:handUp?"#fbbf24":"#e8eaed"}}/>} label={handUp?"Lower":"Raise Hand"} onClick={toggleHand} active={handUp} tooltip={handUp?"Lower hand":"Raise hand"}/>
            }
            {!isPrivileged&&canStudentWriteProp&&(
              <Ctrl icon={<PenTool style={{...IS,color:whiteboardOpen?"#34d399":"#e8eaed"}}/>} label="Board" onClick={onToggleWhiteboard} active={whiteboardOpen} tooltip="Whiteboard"/>
            )}
            <Ctrl icon={<MessageCircle style={{...IS,color:"#e8eaed"}}/>} label="Chat" onClick={onToggleChat} badge={chatUnread} tooltip="Open chat"/>
            <Ctrl icon={<Smile style={{...IS,color:emojisOpen?"#fbbf24":"#e8eaed"}}/>} label="React" onClick={()=>{setEmojisOpen(v=>!v);setMoreOpen(false);setAudioPicker(false);setVideoPicker(false);}} active={emojisOpen} tooltip="Send a reaction"/>
            <Ctrl icon={<MoreVertical style={{...IS,color:"#e8eaed"}}/>} label="More" bRef={moreBtnRef} onClick={openMore} active={moreOpen} tooltip="More options"/>
          </div>
          {/* RIGHT */}
          <button className="gm-leave" onClick={isPrivileged?onEndClass:onLeaveClass}>
            <Phone style={{width:16,height:16,transform:"rotate(135deg)"}}/>
            {isPrivileged?"End":"Leave"}
          </button>
        </>
      )}
    </div>
  </>);
};
const BottomBarBridge=(props:any)=>{const room=useRoomContext();const isMobile=useIsMobile();return<BottomBar {...props} room={room} isMobile={isMobile}/>;};
/* ══ MAIN ══ */
/* ══ ROOM - CONTEXT BRIDGE ══
   Lives INSIDE LiveKitRoom. Always mounted regardless of phase.
   Registers reliable mic/cam toggle functions into LiveClassContext
   so the GlobalClassroomOverlay pill can call them even when minimized.
   This replaces the fragile ClassControls-based ref registration.      */
const RoomToContextBridge = () => {
  const room = useRoomContext();
  const { setMicEnabled, setCamEnabled, setHasConnected, toggleMicFnRef, toggleCamFnRef } = useLiveClass();

  // Re-register on every render so closures are always fresh
  useEffect(() => {
    toggleMicFnRef.current = async () => {
      try {
        const next = !room.localParticipant.isMicrophoneEnabled;
        await room.localParticipant.setMicrophoneEnabled(next);
        setMicEnabled(next);
      } catch {}
    };
    toggleCamFnRef.current = async () => {
      try {
        const next = !room.localParticipant.isCameraEnabled;
        await room.localParticipant.setCameraEnabled(next);
        setCamEnabled(next);
      } catch {}
    };
  });

  // Sync enabled state whenever LiveKit track events fire
  useEffect(() => {
    const sync = () => {
      setMicEnabled(room.localParticipant.isMicrophoneEnabled);
      setCamEnabled(room.localParticipant.isCameraEnabled);
    };
    room.on(RoomEvent.LocalTrackPublished,   sync);
    room.on(RoomEvent.LocalTrackUnpublished, sync);
    room.on(RoomEvent.TrackMuted,            sync);
    room.on(RoomEvent.TrackUnmuted,          sync);
    sync();
    return () => {
      room.off(RoomEvent.LocalTrackPublished,   sync);
      room.off(RoomEvent.LocalTrackUnpublished, sync);
      room.off(RoomEvent.TrackMuted,            sync);
      room.off(RoomEvent.TrackUnmuted,          sync);
    };
  }, [room, setMicEnabled, setCamEnabled]);

  return null;
};

const ClassroomView=({subject,onLeave,onMinimize,autoJoin=false}:ClassroomViewProps)=>{
  const{user,hasRole}=useAuth();const{t}=useLanguage();const isMobile=useIsMobile();const isPrivileged=hasRole("admin")||hasRole("teacher");
  const{setHasConnected}=useLiveClass();
  const[phase,setPhase]=useState<"lobby"|"live"|"ended">("lobby");
  const[token,setToken]=useState<string|null>(null);const[wsUrl,setWsUrl]=useState<string|null>(null);
  const[error,setError]=useState<string|null>(null);const[loading,setLoading]=useState(false);
  const[reconnecting,setReconnecting]=useState(false);
  /* ── reconnect state ── */
  const[roomKey,setRoomKey]=useState(0);          // bump to remount <LiveKitRoom> with fresh token
  // Use refs instead of state so autoReconnect useCallback never needs them as deps.
  // State-based count was causing useCallback to recreate on every attempt, which
  // destabilised ReconnectMonitor's event listeners and caused the infinite reconnect loop.
  const autoReconnectCountRef=useRef(0);
  const isReconnectingRef=useRef(false);           // guard against concurrent autoReconnect calls
  const intentionalLeaveRef=useRef(false);         // true on manual leave → skip auto-reconnect
  const participantCountRef=useRef(0);              // tracks peak live participant count for ClassEndScreen
  /* ── lobby media choices ── */
  const[lobbyMic,setLobbyMic]=useState(false); // OFF by default — user must explicitly enable
  const[lobbyCam,setLobbyCam]=useState(false); // OFF by default — user must explicitly enable
  /* ── Background keep-alive: silent audio + wake lock (student & teacher) ── */
  useSilentAudioKeepAlive(phase === "live");

  const wakeLockRef=useRef<any>(null);
  useEffect(()=>{
    if(phase!=="live")return;
    const acquire=async()=>{try{if("wakeLock"in navigator)wakeLockRef.current=await(navigator as any).wakeLock.request("screen");}catch{}};
    acquire();const onVis=()=>{if(document.visibilityState==="visible")acquire();};
    document.addEventListener("visibilitychange",onVis);
    return()=>{document.removeEventListener("visibilitychange",onVis);wakeLockRef.current?.release().catch(()=>{});};
  },[phase]);
  const[sessionId,setSessionId]=useState<string|null>(null);const[sessionInfo,setSessionInfo]=useState<any>(null);
  const[attendanceId,setAttendanceId]=useState<string|null>(null);const[joinedAt]=useState(Date.now());
  const[savingRec,setSavingRec]=useState(false);const[isSessionLive,setIsSessionLive]=useState(false);const[duration,setDuration]=useState(0);
  const recStopRef=useRef<()=>Promise<void>>(async()=>{});
  // Auto-save recording when teacher closes/refreshes the tab
  useEffect(()=>{
    const onPageHide=()=>{recStopRef.current?.();};
    window.addEventListener("pagehide",onPageHide);
    return()=>window.removeEventListener("pagehide",onPageHide);
  },[]);
  const[chatOpen,setChatOpen]=useState(false);const[partOpen,setPartOpen]=useState(false);const[chatUnread,setChatUnread]=useState(0);
  useEffect(()=>{
    if(!sessionId||phase!=="live")return;
    const ch=supabase.channel(`chat-unread-${sessionId}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"class_chat_messages",filter:`session_id=eq.${sessionId}`},
        (payload:any)=>{
          if(payload.new?.sender_id===user?.id)return;
          if(payload.new?.type==="system")return;
          setChatUnread(n=>{const panelClosed=!chatOpen;return panelClosed?n+1:0;});
        })
      .subscribe();
    return()=>{supabase.removeChannel(ch);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[sessionId,phase,user?.id]);
  const[sideTab,setSideTab]=useState<"chat"|"polls">("chat");const[showEnd,setShowEnd]=useState(false);
  // FIX BUG 2: quizOpen state — LiveQuizOverlay was permanently disabled with hardcoded isOpen={false}
  const[quizOpen,setQuizOpen]=useState(false);
  const[wbOpen,setWbOpen]=useState(false);const[matOpen,setMatOpen]=useState<any>(null);const[matPicker,setMatPicker]=useState(false);const[matPanelOpen,setMatPanelOpen]=useState(false);
  const[groupRecite,setGroupRecite]=useState(false);const[canStudentWrite,setCanStudentWrite]=useState(false);const[canStudentRec,setCanStudentRec]=useState(false);
  // Student recording — lifted here so SubjectMaterialsPanel can also trigger it
  const[stuRec,setStuRec]=useState(false);
  const stuMrRefTop=useRef<MediaRecorder|null>(null);
  const stuChunksTop=useRef<Blob[]>([]);
  const toggleStuRecordTop=async()=>{
    if(stuRec){
      stuMrRefTop.current?.stop();
      stuMrRefTop.current!.onstop=()=>{
        const mt=stuMrRefTop.current?.mimeType||"audio/webm";
        const blob=new Blob(stuChunksTop.current,{type:mt});
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");a.href=url;a.download=`class-${Date.now()}.webm`;a.click();URL.revokeObjectURL(url);stuChunksTop.current=[];
      };setStuRec(false);
    }else{
      try{
        const s=await navigator.mediaDevices.getUserMedia({audio:true});
        const mime=["audio/webm","audio/mp4","audio/ogg"].find(t2=>{try{return MediaRecorder.isTypeSupported(t2);}catch{return false;}})||"";
        const mr=new MediaRecorder(s,mime?{mimeType:mime}:undefined);
        stuChunksTop.current=[];mr.ondataavailable=e=>{if(e.data.size>0)stuChunksTop.current.push(e.data);};
        mr.start(1000);stuMrRefTop.current=mr;setStuRec(true);
      }catch{toast({title:"Microphone access denied"});}
    }
  };
  const[floatingEmojis,setFloatingEmojis]=useState<FloatingEmoji[]>([]);
  const[raisedHands,setRaisedHands]=useState<RaisedHand[]>([]);
  const[layout,setLayout]=useState<LayoutMode>("grid");
  const[groupReciteDialog,setGroupReciteDialog]=useState(false);
  const emojiIdRef=useRef(0);
  const wbBuffer=useRef<any[]|null>(null);
  // FIX BUG 10: roomRef stores the LiveKit Room object via RoomDataListener — replaces __lkRoom__ global
  const roomRef=useRef<any>(null);
  // FIX BUG 8: ref to hold the session-end channel so we can subscribe immediately on join
  const sessionEndChannelRef=useRef<any>(null);
  // FIX BUG 6: prefetch includes a fetchedAt timestamp so stale tokens can be detected
  const prefetch=useRef<{token:string;url:string;fetchedAt:number}|null>(null);
  useEffect(()=>{supabase.functions.invoke("livekit-token",{body:{subject_id:subject.id,action:isPrivileged?"start_session":"join"}}).then(({data})=>{if(data?.token&&data?.url)prefetch.current={token:data.token,url:data.url,fetchedAt:Date.now()};}).catch(()=>{});},[subject.id,isPrivileged]);
  useEffect(()=>{
    if(!autoJoin)return;
    const t=setTimeout(()=>{
      if(phase==="lobby"&&!loading&&!error){
        connect(isPrivileged?"start_session":"join");
      }
    },120);
    return()=>clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[autoJoin]);
  useEffect(()=>{const check=async()=>{const{data}=await supabase.from("live_sessions").select("*").eq("subject_id",subject.id).eq("status","live").maybeSingle();if(data){setSessionInfo(data);setSessionId(data.id);setIsSessionLive(true);}else setIsSessionLive(false);};check();const iv=setInterval(check,4000);return()=>clearInterval(iv);},[subject.id]);

  /* ── Student auto-kick: watch DB for session.status → "ended" ────────────
     Two-pronged approach: LiveKit data channel (fast) + Supabase realtime (backup).
     Both converge on setPhase("ended") which shows ClassEndScreen.
     FIX BUG 8: The channel is also stored in sessionEndChannelRef so connect() can
     subscribe immediately when the fresh sessionId is known — before this effect runs. */
  useEffect(()=>{
    if(!sessionId||isPrivileged||phase!=="live")return;
    // If connect() already set up a channel for this sessionId, reuse it — don't double-subscribe
    if(sessionEndChannelRef.current)return;
    const ch=supabase.channel(`session-end-${sessionId}`)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"live_sessions",filter:`id=eq.${sessionId}`},
        (payload:any)=>{
          if(payload.new?.status==="ended"&&!intentionalLeaveRef.current){
            // Teacher ended the class
            setPhase("ended");
          }
        })
      .subscribe();
    sessionEndChannelRef.current=ch;
    return()=>{
      if(sessionEndChannelRef.current){supabase.removeChannel(sessionEndChannelRef.current);sessionEndChannelRef.current=null;}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[sessionId,isPrivileged,phase]);
  useEffect(()=>{if(phase!=="live")return;const ti=setInterval(()=>setDuration(d=>d+1),1000);return()=>clearInterval(ti);},[phase]);
  useEffect(()=>{
    if(phase!=="live"||!("mediaSession"in navigator))return;
    try{
      (navigator as any).mediaSession.metadata=new(window as any).MediaMetadata({title:subject.title,artist:"Tahleem Academy — Live Class",album:"In Progress"});
      (navigator as any).mediaSession.playbackState="playing";
      (navigator as any).mediaSession.setActionHandler("stop",()=>leaveSession());
      (navigator as any).mediaSession.setActionHandler("pause",()=>leaveSession());
    }catch{}
    return()=>{try{(navigator as any).mediaSession.playbackState="none";}catch{}};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[phase,subject.title]);

  const connect=async(action:string,settings?:any,mediaSettings?:{micOn:boolean;cameraOn:boolean})=>{
    if(mediaSettings){setLobbyMic(mediaSettings.micOn);setLobbyCam(mediaSettings.cameraOn);}
    // Guard: user must be loaded before inserting attendance rows
    if(!user){setError("Session expired. Please refresh the page.");return;}
    setLoading(true);setError(null);
    try{
      // FIX BUG 6: Consume and clear the prefetch so it is never reused stale.
      // Also check freshness — tokens older than 5 min are discarded (room state may have changed).
      const isFresh=prefetch.current&&(Date.now()-prefetch.current.fetchedAt)<5*60_000;
      let tk=isFresh?prefetch.current!.token:null;
      let url=isFresh?prefetch.current!.url:null;
      prefetch.current=null; // always clear after reading so Try Again fetches a new token
      if(!tk||!url){const{data,error:e}=await supabase.functions.invoke("livekit-token",{body:{subject_id:subject.id,action}});if(e)throw e;if(data?.error)throw new Error(data.error);tk=data.token;url=data.url;}
      setToken(tk!);setWsUrl(url!);
      const{data:sessions}=await supabase.from("live_sessions").select("*").eq("subject_id",subject.id).in("status",["live","active","scheduled"]).order("scheduled_at",{ascending:false,nullsFirst:false}).limit(1);
      if(sessions?.length){
        const freshSessionId=sessions[0].id;
        // FIX BUG 1: Apply class settings using the freshly-retrieved session ID, not the
        // stale sessionId state (which is null when a teacher starts a new class for the first time).
        if(settings){await supabase.from("live_sessions").update({...settings,actual_start_time:new Date().toISOString(),status:"live"}).eq("id",freshSessionId);}
        setSessionId(freshSessionId);setSessionInfo(sessions[0]);
        const{data:att}=await supabase.from("attendance_logs").insert({session_id:freshSessionId,user_id:user.id,device_info:navigator.userAgent}).select("id").single();
        if(att)setAttendanceId(att.id);
        await supabase.from("class_participants").upsert({session_id:freshSessionId,student_id:user.id,joined_at:new Date().toISOString(),is_muted:!isPrivileged,camera_on:true,left_at:null,left_minutes:null},{onConflict:"session_id,student_id"});
        // FIX BUG 8: Subscribe to session-end immediately here — before the useEffect cycle —
        // so there is no window where the teacher can end the class and students miss the event.
        if(!isPrivileged&&!sessionEndChannelRef.current){
          const endCh=supabase.channel(`session-end-${freshSessionId}`)
            .on("postgres_changes",{event:"UPDATE",schema:"public",table:"live_sessions",filter:`id=eq.${freshSessionId}`},
              (payload:any)=>{if(payload.new?.status==="ended"&&!intentionalLeaveRef.current)setPhase("ended");})
            .subscribe();
          sessionEndChannelRef.current=endCh;
        }
      }
      setPhase("live");
      setHasConnected(true);   // unlock overlay PiP/minimize — user is now in the class
      try { playJoinSound(); } catch {}
    }catch(e:any){setError(e?.message||"Failed to connect");}finally{setLoading(false);}
  };

  /* ══ AUTO-RECONNECT ══
     Fires when LiveKit emits Disconnected unexpectedly (e.g. Android tab suspension).
     Uses refs for count + in-progress flag so the useCallback is stable (no deps that
     change mid-session). A stable callback means ReconnectMonitor never re-registers
     its event listeners mid-reconnect — which was the root cause of the infinite loop. */
  const autoReconnect=useCallback(async()=>{
    // Guard 1: user manually left — never auto-reconnect
    if(intentionalLeaveRef.current)return;
    // Guard 2: already mid-reconnect — don't stack concurrent calls
    if(isReconnectingRef.current)return;
    // Guard 3: exhausted retries — give up and drop back to lobby
    if(autoReconnectCountRef.current>=5){
      setReconnecting(false);
      setError("Connection lost after several attempts. Please try again.");
      setPhase("lobby");
      setHasConnected(false);
      return;
    }
    isReconnectingRef.current=true;
    setReconnecting(true);
    // Exponential backoff: 1s, 2s, 4s, 8s, 15s cap
    const backoffMs=Math.min(1000*Math.pow(2,autoReconnectCountRef.current),15000);
    await new Promise(r=>setTimeout(r,backoffMs));
    try{
      const{data}=await supabase.functions.invoke("livekit-token",{body:{subject_id:subject.id,action:isPrivileged?"start_session":"join"}});
      if(data?.token&&data?.url){
        prefetch.current={token:data.token,url:data.url,fetchedAt:Date.now()};
        autoReconnectCountRef.current+=1;  // ref — won't trigger useCallback recreation
        setToken(data.token);
        setWsUrl(data.url);
        setRoomKey(k=>k+1); // remount LiveKitRoom with fresh token
        // Do NOT setReconnecting(false) here — overlay stays up until the new room
        // fires Connected, which triggers onReconnected → setReconnecting(false).
      }else{
        // Token fetch returned no usable data
        setError("Reconnection failed. Please try again.");
        setPhase("lobby");
        isReconnectingRef.current=false;
        setReconnecting(false);
      }
    }catch{
      setError("Reconnection failed. Please try again.");
      setPhase("lobby");
      isReconnectingRef.current=false;
      setReconnecting(false);
    }
    // No finally{setReconnecting(false)} — success path is cleared by onReconnected
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[subject.id,isPrivileged]); // stable — refs handle mutable values

  useEffect(()=>()=>{
    if(attendanceId){const d=Math.floor((Date.now()-joinedAt)/1000);supabase.from("attendance_logs").update({left_at:new Date().toISOString(),duration_seconds:d}).eq("id",attendanceId);}
    if(sessionId&&user)supabase.from("class_participants").update({left_at:new Date().toISOString(),duration_minutes:Math.floor((Date.now()-joinedAt)/60000)}).eq("session_id",sessionId).eq("student_id",user.id);
  },[attendanceId,joinedAt,sessionId,user]);

  const endSession=async()=>{
    intentionalLeaveRef.current=true; // prevent auto-reconnect on disconnect
    setShowEnd(false);
    // Auto-save any active recording before tearing down the session
    await recStopRef.current?.();
    try{
      if(sessionId){
        // 1. Update DB so students' Supabase subscription detects the end
        await supabase.from("live_sessions").update({status:"ended",ended_at:new Date().toISOString(),actual_end_time:new Date().toISOString()}).eq("id",sessionId);
        if(user)await supabase.from("class_chat_messages").insert({session_id:sessionId,sender_id:user.id,message:t("Class has ended","انتهت الحصة"),type:"system"});
        // 2. Broadcast class_ended via LiveKit data channel so students disconnect immediately
        // (faster than waiting for DB subscription)
        try{
          // FIX BUG 10: Use roomRef instead of window.__lkRoom__ global
          const room=roomRef.current;
          if(room?.localParticipant){
            room.localParticipant.publishData(
              new TextEncoder().encode(JSON.stringify({type:"class_ended"})),
              {reliable:true}
            );
            // Give data message a moment to propagate before disconnecting
            await new Promise(r=>setTimeout(r,400));
            room.disconnect();
          }
        }catch(err){console.warn("[endSession] LiveKit broadcast failed:",err);}
        // Clear chat after short delay
        setTimeout(async()=>{
          try{ await supabase.from("class_chat_messages").delete().eq("session_id",sessionId); }
          catch(e){console.warn("[endSession] chat clear failed:",e);}
        }, 4000);
      }
    }catch(e:any){
      console.error("[endSession] DB error (continuing anyway):",e?.message);
    }finally{
      setPhase("ended");
    }
  };

  const leaveSession=async()=>{
    intentionalLeaveRef.current=true; // prevent auto-reconnect on disconnect
    // Auto-save any active recording before leaving
    await recStopRef.current?.();
    try{playLeaveSound();}catch{}
    if(attendanceId){const d=Math.floor((Date.now()-joinedAt)/1000);supabase.from("attendance_logs").update({left_at:new Date().toISOString(),duration_seconds:d}).eq("id",attendanceId);}
    if(sessionId&&user)supabase.from("class_participants").update({left_at:new Date().toISOString(),duration_minutes:Math.floor((Date.now()-joinedAt)/60000)}).eq("session_id",sessionId).eq("student_id",user.id);
    onLeave();
  };

  const handlePermChange=(type:"write"|"rec",allow:boolean,room?:any)=>{
    if(type==="write"){setCanStudentWrite(allow);try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"wb_allow_write",allow})),{reliable:true});}catch{}toast({title:allow?"✅ Students can now write on the board":"🔒 Write access revoked"});}
    else{setCanStudentRec(allow);try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"rec_allowed",allow})),{reliable:true});}catch{}toast({title:allow?"✅ Students can now record":"🔒 Record permission revoked"});}
  };
  const addFloatingEmoji=(emoji:string,sender:string="")=>{
    const id=++emojiIdRef.current;
    const x=5+Math.random()*70;
    setFloatingEmojis(prev=>[...prev,{id,emoji,x,sender}]);
    setTimeout(()=>setFloatingEmojis(prev=>prev.filter(fe=>fe.id!==id)),2800);
  };
  const handleHandRaise=(identity:string,name:string,raised:boolean)=>{
    setRaisedHands(prev=>{
      if(raised)return prev.some(h=>h.identity===identity)?prev:[...prev,{identity,name,raisedAt:Date.now()}];
      return prev.filter(h=>h.identity!==identity);
    });
  };
  const handleGroupRecite=async(room?:any)=>{
    const n=!groupRecite;
    setGroupRecite(n);
    toast({title:n?"🎙️ Group Recitation ON — all mics enabled":"🔇 Group Recitation ended"});
    try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"group_recite",active:n})),{reliable:true});}catch{}
    if(sessionId&&user)await supabase.from("class_chat_messages").insert({session_id:sessionId,sender_id:user.id,message:n?"🎙️ Group Recitation Mode — all mics ON":"🔇 Recitation ended",type:"system"});
  };
  const handleGroupReciteFromTeacher=(active:boolean)=>{
    setGroupRecite(active);
    if(active&&!isPrivileged){setGroupReciteDialog(true);}
    else if(!active&&!isPrivileged){setGroupReciteDialog(false);}
  };
  const ParticipantCountBadge=()=>{
    const all=useParticipants();
    useEffect(()=>{if(all.length>participantCountRef.current)participantCountRef.current=all.length;},[all.length]);
    if(all.length===0)return null;
    return(
      <div className="gm-badge" style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.8)",flexShrink:0,cursor:"pointer"}} onClick={()=>setPartOpen(v=>!v)}>
        <Users style={{width:12,height:12,opacity:.7}}/>
        <span style={{fontSize:12,fontWeight:500,fontFamily:"'Google Sans',sans-serif"}}>{all.length}</span>
      </div>
    );
  };
  const fmtT=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  if(phase==="ended")return<ClassEndScreen subject={subject} session={sessionInfo} duration={duration} participantCount={participantCountRef.current} onGoToDashboard={onLeave} onGoToRevision={()=>{window.location.href=`/student/revision/${subject.id}`;}} />;
  if(phase==="lobby"&&!loading&&!error&&!autoJoin)return<ClassLobby subject={subject} session={sessionInfo} onStartClass={(s:any,media?:any)=>connect("start_session",s,media)} onJoinClass={(media?:any)=>connect("join",undefined,media)} onBack={onLeave} isLive={isSessionLive}/>;
  if(loading)return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",background:"#202124"}}>
      <style>{CSS}</style>
      <div style={{textAlign:"center"}}>
        <div style={{width:56,height:56,border:"3px solid rgba(138,180,248,.2)",borderTopColor:"#8ab4f8",borderRadius:"50%",animation:"cv-spin .8s linear infinite",margin:"0 auto 20px"}}/>
        <p style={{color:"rgba(255,255,255,.55)",fontSize:15,fontFamily:"'Google Sans',sans-serif",fontWeight:500}}>{t("Connecting…","جاري الاتصال…")}</p>
      </div>
    </div>
  );
  if(error)return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",background:"#202124"}}>
      <style>{CSS}</style>
      <div style={{textAlign:"center",maxWidth:340,padding:32}}>
        <div style={{width:68,height:68,borderRadius:"50%",background:"rgba(234,67,53,.1)",border:"1px solid rgba(234,67,53,.2)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px"}}>
          <X style={{width:28,height:28,color:"#ea4335"}}/>
        </div>
        <h2 style={{fontSize:22,fontWeight:500,color:"#e8eaed",marginBottom:10,fontFamily:"'Google Sans Display',sans-serif"}}>Connection failed</h2>
        <p style={{color:"rgba(255,255,255,.45)",fontSize:14,marginBottom:28,lineHeight:1.6,fontFamily:"'Google Sans',sans-serif"}}>{error}</p>
        <div style={{display:"flex",gap:12,justifyContent:"center"}}>
          <button onClick={()=>{
            intentionalLeaveRef.current=false;
            isReconnectingRef.current=false;
            autoReconnectCountRef.current=0;
            setError(null);setToken(null);setWsUrl(null);
            connect(isPrivileged?"start_session":"join");
          }} style={{
            padding:"10px 24px",borderRadius:24,background:"#8ab4f8",border:"none",
            color:"#202124",fontSize:14,cursor:"pointer",fontWeight:600,
            fontFamily:"'Google Sans',sans-serif",
          }}>Try again</button>
          <button onClick={onLeave} style={{
            padding:"10px 24px",borderRadius:24,background:"rgba(255,255,255,.08)",
            border:"1px solid rgba(255,255,255,.15)",color:"#e8eaed",fontSize:14,
            cursor:"pointer",fontFamily:"'Google Sans',sans-serif",
          }}>Go back</button>
        </div>
      </div>
    </div>
  );
  return(
    <div data-classroom-root style={{height:"100dvh",display:"flex",flexDirection:"column",background:"#202124",overflow:"hidden"}}>
      <style>{CSS}</style>
      {token&&wsUrl&&(
        // key={roomKey} forces a full remount whenever autoReconnect bumps the key,
        // ensuring LiveKit starts with a fresh connection and token.
        <LiveKitRoom key={roomKey} serverUrl={wsUrl} token={token} connect={phase==="live"} audio={false} video={false} options={{adaptiveStream:{pixelDensity:"screen"},dynacast:true,disconnectOnPageLeave:false,audioCaptureDefaults:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,sampleRate:48000,channelCount:1},publishDefaults:{audioPreset:{maxBitrate:64000},dtx:false,red:true,stopMicTrackOnMute:false,videoEncoding:{maxBitrate:700_000,maxFramerate:20},backupCodec:true},videoCaptureDefaults:{resolution:{width:640,height:480,frameRate:20},facingMode:"user"}}} style={{flex:1,display:"flex",flexDirection:"column",minHeight:0,position:"relative"}} data-lk-theme="default">
          {/* VolumeBooster replaces bare RoomAudioRenderer — Web Audio pipeline: GainNode(2.5×) + DynamicsCompressor ensures every remote voice is amplified and normalised without echo or self-playback */}
          <VolumeBooster/>
          <RoomToContextBridge />
          <MediaAutoPublish lobbyMic={lobbyMic} lobbyCam={lobbyCam}/>
          <WbSyncBridge wbOpen={wbOpen} isTeacher={isPrivileged}/>
          <AdminMuteListener isPrivileged={isPrivileged}/>
          <GroupReciteAutoMic active={groupRecite} isPrivileged={isPrivileged}/>
          {/* onDisconnected wired to autoReconnect — handles Android tab suspension */}
          <ReconnectMonitor
            onReconnecting={()=>setReconnecting(true)}
            onReconnected={()=>{
              // New room is fully connected — clear overlay and reset all reconnect state
              isReconnectingRef.current=false;
              autoReconnectCountRef.current=0;
              setReconnecting(false);
            }}
            onDisconnected={autoReconnect}
          />
          <RoomDataListener onWbOpen={()=>setWbOpen(true)} onWbClose={()=>setWbOpen(false)} strokesBuffer={wbBuffer} onMatOpen={mat=>setMatOpen(mat)} onMatClose={()=>setMatOpen(null)} onWbAllowWrite={allow=>setCanStudentWrite(allow)} onRecAllowed={allow=>setCanStudentRec(allow)} onEmojiReact={(emoji:string,sender:string)=>addFloatingEmoji(emoji,sender)} onGroupRecite={handleGroupReciteFromTeacher} onHandRaise={handleHandRaise} onAdminMuteAll={()=>{}}
            onClassEnded={!isPrivileged?()=>setPhase("ended"):undefined} roomRef={roomRef}/>{/* FIX BUG 10: pass roomRef */}
          {reconnecting&&<div style={{position:"absolute",inset:0,zIndex:200,background:"rgba(32,33,36,.92)",backdropFilter:"blur(12px)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
            <div style={{width:52,height:52,border:"3px solid rgba(138,180,248,.2)",borderTopColor:"#8ab4f8",borderRadius:"50%",animation:"cv-spin .8s linear infinite"}}/>
            <p style={{color:"#e8eaed",fontSize:16,fontWeight:500,fontFamily:"'Google Sans',sans-serif"}}>Reconnecting…</p>
            <p style={{color:"rgba(255,255,255,.4)",fontSize:13,fontFamily:"'Google Sans',sans-serif"}}>Please stay on the page</p>
          </div>}
          {/* ══ GOOGLE MEET STYLE TOP BAR ══ */}
          <div style={{
            height:56,
            background:"rgba(32,33,36,.97)",
            backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
            display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"0 14px 0 16px",flexShrink:0,
            borderBottom:"1px solid rgba(255,255,255,.05)",gap:8,
          }}>
            {/* LEFT — LIVE badge + subject title only (keeps mobile header uncluttered) */}
            <div style={{display:"flex",alignItems:"center",gap:6,flex:1,minWidth:0,overflow:"hidden"}}>
              <div className="gm-badge" style={{background:"rgba(234,67,53,.12)",border:"1px solid rgba(234,67,53,.25)",color:"#fff",flexShrink:0,maxWidth:isMobile?"52vw":"none"}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:"#ea4335",display:"inline-block",flexShrink:0,animation:"pip-pulse 1.8s ease-in-out infinite"}}/>
                <span style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:"'Google Sans',sans-serif"}}>{subject.title}</span>
              </div>
              {/* Raised-hand count — admin only, compact dot badge */}
              {isPrivileged&&raisedHands.length>0&&(
                <div className="gm-badge" style={{background:"rgba(251,191,36,.12)",border:"1px solid rgba(251,191,36,.3)",color:"#fbbf24",flexShrink:0,padding:"3px 8px"}}>
                  <span style={{fontSize:12,animation:"hand-bounce 1.2s ease-in-out infinite"}}>✋</span>
                  <span style={{fontSize:11,fontWeight:600,fontFamily:"'Google Sans',sans-serif"}}>{raisedHands.length}</span>
                </div>
              )}
            </div>

            {/* RIGHT — timer · participants · [layout desktop] · [rec admin] */}
            <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
              {/* Timer */}
              <div className="gm-badge" style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.8)",padding:"3px 8px"}}>
                <Circle style={{width:6,height:6,fill:"#ea4335",color:"#ea4335",animation:"rec-pulse 1.4s ease-in-out infinite",flexShrink:0}}/>
                <span style={{fontSize:12,fontWeight:500,fontVariantNumeric:"tabular-nums",fontFamily:"'Google Sans',sans-serif"}}>{fmtT(duration)}</span>
              </div>
              {/* Participant count */}
              <ParticipantCountBadge/>
              {/* Layout switcher — desktop only */}
              {!isMobile&&<LayoutSwitcher layout={layout} onChange={setLayout}/>}
              {/* RecController — admin only */}
              {isPrivileged&&<RecController sessionId={sessionId} subjectId={subject.id} userEmail={user?.email||""} onSavingChange={setSavingRec} stopRecRef={recStopRef}/>}
            </div>
          </div>
          {/* Content — material panels render here so footer always stays visible */}
          <div style={{flex:1,display:"flex",minHeight:0,overflow:"hidden"}}>
            <div style={{flex:1,position:"relative",minWidth:0}}>
              <VideoGrid layout={layout} isMobile={isMobile}/>
              <FloatingEmojiLayer emojis={floatingEmojis}/>
              <RaisedHandsOverlay hands={raisedHands}/>
              {/* Materials panel — absolute inside content, footer always visible */}
              {matPanelOpen&&<SubjectMaterialsPanel subjectId={subject.id} subject={subject} onClose={()=>setMatPanelOpen(false)} canStudentRec={canStudentRec} isPrivileged={isPrivileged} stuRec={stuRec} onToggleStuRecord={toggleStuRecordTop}/>}
              {/* Teacher-shared material viewer — absolute inside content */}
              {matOpen&&<MatViewerInlineBridge material={matOpen} isPrivileged={isPrivileged} onClose={()=>setMatOpen(null)}/>}
            </div>
            {chatOpen&&!isMobile&&(
              <div className="gm-sidebar">
                <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,.07)",flexShrink:0,background:"rgba(32,33,36,.97)"}}>
                  {[["chat","💬","Chat"],["polls","📊","Polls"]].map(([k,ic,lb])=>(
                    <button key={k} onClick={()=>{setSideTab(k as any);if(k==="chat")setChatUnread(0);}} style={{
                      flex:1,padding:"14px 4px",background:"none",border:"none",
                      color:sideTab===k?"#8ab4f8":"rgba(255,255,255,.45)",
                      fontSize:13,fontWeight:sideTab===k?600:400,
                      borderBottom:sideTab===k?"2px solid #8ab4f8":"2px solid transparent",
                      cursor:"pointer",fontFamily:"'Google Sans',sans-serif",transition:"color .15s",
                    }}>{ic} {lb}</button>
                  ))}
                  <button onClick={()=>setChatOpen(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,.3)",cursor:"pointer",padding:"0 14px",flexShrink:0}}>
                    <X style={{width:16,height:16}}/>
                  </button>
                </div>
                <div style={{flex:1,overflow:"hidden"}}>{sideTab==="chat"?<ClassChatPanel sessionId={sessionId||""} sessionStartedAt={sessionInfo?.started_at??sessionInfo?.actual_start_time}/>:<ClassPolls sessionId={sessionId||""}/>}</div>
              </div>
            )}
          </div>
          {wbOpen&&<WhiteboardBridge onClose={()=>setWbOpen(false)} isTeacher={isPrivileged} initialStrokes={wbBuffer.current} subjectId={subject.id} canStudentWrite={canStudentWrite}/>}
          {groupReciteDialog&&!isPrivileged&&(
            <GroupRecitePermDialog
              onAccept={()=>{setGroupReciteDialog(false);}}
              onDecline={()=>{setGroupReciteDialog(false);setGroupRecite(false);}}
            />
          )}
          <BottomBarBridge sessionId={sessionId||""} onToggleChat={()=>{setChatOpen(v=>!v);if(!chatOpen)setChatUnread(0);}} onToggleParticipants={()=>setPartOpen(v=>!v)} onEndClass={()=>setShowEnd(true)} onLeaveClass={leaveSession} chatUnread={chatUnread} onToggleWhiteboard={()=>setWbOpen(v=>!v)} whiteboardOpen={wbOpen} onGroupRecite={handleGroupRecite} groupReciteMode={groupRecite} onShareMaterial={()=>setMatPicker(true)} isPrivileged={isPrivileged} canStudentWriteProp={canStudentWrite} canStudentRecProp={canStudentRec} onPermChange={(type:any,allow:any,room:any)=>handlePermChange(type,allow,room)} onMinimize={onMinimize} onToggleMaterials={()=>setMatPanelOpen(v=>!v)} matPanelOpen={matPanelOpen} onSendEmoji={addFloatingEmoji} layout={layout} onLayoutChange={setLayout} onLaunchQuiz={()=>setQuizOpen(true)}/>{/* FIX BUG 2: quiz launcher */}
          {isMobile&&chatOpen&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:50}} onClick={()=>setChatOpen(false)}><div style={{position:"absolute",bottom:0,left:0,right:0,background:"#13181f",borderRadius:"22px 22px 0 0",maxHeight:"82vh",display:"flex",flexDirection:"column",animation:"slide-up .22s ease",paddingBottom:"env(safe-area-inset-bottom,0px)"}} onClick={e=>e.stopPropagation()}><div style={{display:"flex",alignItems:"center",padding:"12px 16px 0",flexShrink:0}}><div style={{flex:1,display:"flex"}}>{[["chat","💬","Chat"],["polls","📊","Polls"]].map(([k,ic,lb])=>(<button key={k} onClick={()=>setSideTab(k as any)} style={{flex:1,padding:"10px 6px",background:"none",border:"none",color:sideTab===k?"#fff":"rgba(255,255,255,.35)",fontSize:13,fontWeight:sideTab===k?700:400,borderBottom:sideTab===k?`2px solid ${TEAL}`:"2px solid transparent",cursor:"pointer"}}>{ic} {lb}</button>))}</div><button onClick={()=>setChatOpen(false)} style={{width:32,height:32,borderRadius:"50%",background:"rgba(255,255,255,.1)",border:"none",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><X style={{width:14,height:14}}/></button></div><div style={{flex:1,overflow:"hidden",minHeight:340}}>{sideTab==="chat"?<ClassChatPanel sessionId={sessionId||""} sessionStartedAt={sessionInfo?.started_at??sessionInfo?.actual_start_time}/>:<ClassPolls sessionId={sessionId||""}/>}</div></div></div>)}
          {isMobile&&partOpen&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:50}} onClick={()=>setPartOpen(false)}><div style={{position:"absolute",bottom:BAR_H,left:0,right:0,background:"#13181f",borderRadius:"22px 22px 0 0",maxHeight:"65vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}><div style={{width:40,height:4,borderRadius:2,background:"rgba(255,255,255,.18)",margin:"12px auto 6px"}}/><ClassParticipants sessionId={sessionId||""}/></div></div>)}
          {/* FIX BUG 2: LiveQuizOverlay now controlled by quizOpen state — was permanently disabled with hardcoded isOpen={false} */}
          <LiveQuizOverlay sessionId={sessionId||""} isOpen={quizOpen} onClose={()=>setQuizOpen(false)}/>
        </LiveKitRoom>
      )}
      {matPicker&&<MatPickerBridge subjectId={subject.id} onShare={(mat:any,room:any)=>{setMatOpen(mat);setMatPicker(false);try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"mat_open",material:mat})),{reliable:true});}catch{}}} onClose={()=>setMatPicker(false)}/>}
      {showEnd&&createPortal(
        <div style={{position:"fixed",inset:0,zIndex:9500,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.6)",backdropFilter:"blur(8px)"}} onClick={()=>setShowEnd(false)}>
          <div style={{background:"#2D2E30",borderRadius:20,padding:"32px 28px 24px",width:"100%",maxWidth:380,margin:"0 16px",boxShadow:"0 24px 64px rgba(0,0,0,.7)",border:"1px solid rgba(255,255,255,.08)",animation:"fade-in .18s ease"}} onClick={e=>e.stopPropagation()}>
            <div style={{width:56,height:56,borderRadius:"50%",background:"rgba(234,67,53,.12)",border:"1px solid rgba(234,67,53,.2)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 18px"}}>
              <Phone style={{width:22,height:22,color:"#ea4335",transform:"rotate(135deg)"}}/>
            </div>
            <h2 style={{textAlign:"center",fontSize:18,fontWeight:500,color:"#e8eaed",marginBottom:8,fontFamily:"'Google Sans Display',sans-serif"}}>{t("End class for everyone?","إنهاء الحصة للجميع؟")}</h2>
            <p style={{textAlign:"center",fontSize:14,color:"rgba(255,255,255,.45)",marginBottom:28,lineHeight:1.6,fontFamily:"'Google Sans',sans-serif"}}>{t("This will disconnect all participants.","سيتم قطع الاتصال عن جميع المشاركين.")}</p>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button onClick={endSession} style={{width:"100%",padding:"13px",borderRadius:24,border:"none",background:"#ea4335",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"'Google Sans',sans-serif",boxShadow:"0 2px 12px rgba(234,67,53,.4)"}}>{t("End for all","إنهاء للجميع")}</button>
              <button onClick={()=>{setShowEnd(false);leaveSession();}} style={{width:"100%",padding:"12px",borderRadius:24,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.06)",color:"rgba(255,255,255,.8)",fontSize:14,fontWeight:400,cursor:"pointer",fontFamily:"'Google Sans',sans-serif"}}>{t("Leave but keep open","غادر لكن أبقِ الحصة")}</button>
              <button onClick={()=>setShowEnd(false)} style={{width:"100%",padding:"12px",borderRadius:24,border:"none",background:"transparent",color:"rgba(255,255,255,.4)",fontSize:14,cursor:"pointer",fontFamily:"'Google Sans',sans-serif"}}>{t("Cancel","إلغاء")}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const MatPickerBridge=({subjectId,onShare,onClose}:any)=>{const room=useRoomContext();return<MaterialPicker subjectId={subjectId} onShare={(mat:any)=>onShare(mat,room)} onClose={onClose}/>;};
// MatViewerBridge (legacy — kept for backwards compat, now delegates to InClassMaterialViewer)
const MatViewerBridge=({material,isTeacher,onClose}:any)=>{const room=useRoomContext();return<InClassMaterialViewer material={material} isTeacher={isTeacher} onClose={()=>onClose(room)}/>;};
// MatViewerInlineBridge — renders INSIDE LiveKitRoom (has room context) so mat_close can be broadcast
const MatViewerInlineBridge=({material,isPrivileged,onClose}:any)=>{
  const room=useRoomContext();
  return<InClassMaterialViewer material={material} isTeacher={isPrivileged} onClose={()=>{
    onClose();
    if(isPrivileged){try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"mat_close"})),{reliable:true});}catch{}}
  }}/>;
};

export default ClassroomView;
