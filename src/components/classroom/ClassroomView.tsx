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
  Monitor, MonitorOff, Pin, Timer, UserCheck, Crosshair,
  Zap, ClipboardList, Bell, Radio,
} from "lucide-react";
import ClassLobby        from "./ClassLobby";
import ClassChatPanel    from "./ClassChatPanel";
import ClassParticipants from "./ClassParticipants";
import ClassPolls        from "./ClassPolls";
import ClassEndScreen    from "./ClassEndScreen";
import LiveQuizOverlay   from "./LiveQuizOverlay";
import PDFViewer, { prewarmPDF } from "./PDFViewer";
import LiveClassFilePanel from "./LiveClassFilePanel";
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

/*
  REMOVED: useSilentAudioKeepAlive (the AudioContext oscillator + duplicate <audio> element).

  WHY: GlobalClassroomOverlay already owns the single authoritative audio keep-alive
  via useBackgroundAudio (startBackgroundAudio / stopBackgroundAudio). That module
  creates ONE <audio> element at volume=0.001 — Android grants audio focus to it and
  keeps the JS thread alive through screen lock, exactly as WhatsApp does.

  Having TWO <audio> elements here created a resource conflict: Chrome on Android can
  suppress duplicate silent-audio sources, cancelling both. The AudioContext oscillator
  at gain=0 is additionally detected by Chrome as "silent audio" and throttled after
  ~30 s of screen lock, defeating the entire point.

  The call site below (useSilentAudioKeepAlive(phase === "live")) is replaced with a
  no-op comment so nothing changes structurally in ClassroomView.
*/


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
  @keyframes emoji-float  { 0%{transform:translateY(0) scale(1);opacity:1}60%{opacity:.95}100%{transform:translateY(-150px) scale(1.3);opacity:0} }
  @keyframes rec-pulse    { 0%,100%{opacity:1}50%{opacity:.3} }
  @keyframes hand-bounce  { 0%,100%{transform:translateY(0)}45%{transform:translateY(-6px)} }
  @keyframes speak-glow   { 0%,100%{box-shadow:0 0 0 2px #1a73e8,0 0 0 4px rgba(26,115,232,.3)}50%{box-shadow:0 0 0 2px #1a73e8,0 0 0 8px rgba(26,115,232,.15)} }
  @keyframes tile-in      { from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)} }
  @keyframes bar-reveal   { from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1} }
  @keyframes ctrl-hover   { from{transform:scale(1)}to{transform:scale(1.08)} }
  @keyframes tooltip-in   { from{opacity:0;transform:translateX(-50%) translateY(6px)}to{opacity:1;transform:translateX(-50%) translateY(0)} }
  @keyframes laser-fade   { 0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(2.5)} }
  @keyframes timer-pulse  { 0%,100%{background:rgba(251,191,36,.15)}50%{background:rgba(251,191,36,.3)} }
  @keyframes spotlight-ring { 0%,100%{box-shadow:0 0 0 3px #1a73e8,0 0 0 6px rgba(26,115,232,.25)}50%{box-shadow:0 0 0 3px #1a73e8,0 0 0 12px rgba(26,115,232,.12)} }

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
      // RACE FIX: snapshot wsDropped BEFORE clearGrace() resets it.
      // Old code: clearGrace() ran first → wsDropped.current became false →
      // the check below never saw the drop → onDisconnected was never called
      // even when the WS actually disconnected during the background period.
      const didDrop = wsDropped.current;
      clearGrace();
      if (room.state === ConnectionState.Disconnected || didDrop) { onDisconnected(); return; }
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
//   MediaStreamSource → GainNode (2.2×) → DynamicsCompressor → speakers
//
// Why this exists:
//   1. LiveKit publishes at 64 kbps; a GainNode amplifies every remote voice
//      without clipping (2.2× is the sweet spot — louder without distortion).
//   2. DynamicsCompressor (4:1, wide knee) auto-levels loud and soft voices so
//      everyone is consistently audible without the "pumping" crackle that
//      aggressive ratios (12:1) produce on poor networks.
//   3. We deliberately SKIP the local participant so you never hear yourself.
//   4. Each track gets its own source node so 2+ people can speak at once
//      with zero interference — Web Audio mixes them natively.
//   5. If the AudioContext is still suspended when a track arrives (common on
//      mobile before first gesture), the <audio> fallback plays unmuted and is
//      migrated to the Web Audio pipeline once the AC resumes.
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

  // ── Helper: resume AudioContext and, once running, migrate any fallback <audio>
  //    elements (created while AC was suspended) into the Web Audio pipeline.
  //    Fixes "teacher joined but I heard nothing for 30 s" on iOS/Android where
  //    the first gesture comes after tracks have already arrived.
  const tryResumeAC = useCallback(() => {
    const ac   = acRef.current;
    const gain = gainRef.current;
    if (!ac || ac.state !== "suspended") return;
    ac.resume().then(() => {
      if (!gain || !webAudioOkRef.current) return;
      for (const [, node] of nodesRef.current) {
        if (!node.el.muted && node.source == null) {
          try {
            const ms2 = new MediaStream((node.el.srcObject as MediaStream).getTracks());
            const src = ac.createMediaStreamSource(ms2);
            src.connect(gain);
            (node as any).source = src;
            node.el.muted = true; // hand off to Web Audio — silence the element
          } catch {}
        }
      }
    }).catch(() => { webAudioOkRef.current = false; });
  }, []);

  // ── 1. Build the Web Audio pipeline once ────────────────────────────────────
  useEffect(() => {
    try {
      // Use native sample rate — avoids resampling artifacts on device DAC.
      // Forcing 48000 when the OS DAC is 44100 causes subtle pitch artifacts.
      const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
      acRef.current = ac;

      // Amplify: 2.2× — loud and clear without clipping distortion.
      // 3.5× was too hot; voices near 0 dBFS would clip audibly.
      const gain = ac.createGain();
      gain.gain.value = 2.2;
      gainRef.current = gain;

      // Compressor: transparent voice levelling — avoids the "pumping" / "wah-wah"
      // crackle that aggressive ratios (12:1) produce on poor-network packets.
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -28;   // −28 dBFS: compress only genuine peaks
      comp.knee.value      = 20;    // wide knee → gradual, transparent onset
      comp.ratio.value     = 4;     // 4:1 gentle ratio → natural voice levelling
      comp.attack.value    = 0.003; // 3 ms → fast enough to catch plosives
      comp.release.value   = 0.25;  // 250 ms → slow enough to avoid pumping
      compRef.current = comp;

      // Pipeline: source(s) → gain → compressor → speakers
      gain.connect(comp);
      comp.connect(ac.destination);
    } catch {
      webAudioOkRef.current = false;
    }

    // Resume AudioContext on ANY user interaction — persistent (not { once })
    // so every tap retries until the context is running.
    const resume = () => tryResumeAC();
    document.addEventListener("click",      resume, { passive: true });
    document.addEventListener("touchstart", resume, { passive: true });
    document.addEventListener("touchend",   resume, { passive: true });
    document.addEventListener("keydown",    resume, { passive: true });

    // Visibility resume — re-run AudioContext the moment the user returns
    // to the tab after backgrounding / screen-lock on mobile.
    const onVis = () => {
      if (document.visibilityState === "visible") tryResumeAC();
    };
    document.addEventListener("visibilitychange", onVis, { passive: true });

    return () => {
      document.removeEventListener("click",            resume);
      document.removeEventListener("touchstart",       resume);
      document.removeEventListener("touchend",         resume);
      document.removeEventListener("keydown",          resume);
      document.removeEventListener("visibilitychange", onVis);
      acRef.current?.close().catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 2. Connect / disconnect tracks as participants join or leave ─────────────
  useEffect(() => {
    const ac   = acRef.current;
    const gain = gainRef.current;

    // Always attempt to resume when new tracks arrive — the critical mobile path.
    // This effect often fires right after the user taps "Join", so the resume
    // may succeed here even on Android/iOS before a separate gesture event fires.
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
        // Try the Web Audio path FIRST (gain + compression).
        // Running BOTH Web Audio AND an unmuted <audio> simultaneously causes the
        // same track to play through two pipelines with slightly different latency
        // → comb-filtering / metallic crackle. One path only.
        let source: MediaStreamAudioSourceNode | null = null;
        let useWebAudio = false;
        if (ac && gain && webAudioOkRef.current && ac.state === "running") {
          try {
            const ms2 = new MediaStream([pub.track.mediaStreamTrack]);
            source = ac.createMediaStreamSource(ms2);
            source.connect(gain);
            useWebAudio = true;
          } catch { source = null; useWebAudio = false; }
        }

        // <audio> element — always created as the fallback anchor.
        // • Web Audio running  → element MUTED  (prevents double-playback / crackle)
        // • Web Audio blocked  → element UNMUTED (students always hear audio)
        // tryResumeAC() will migrate it to Web Audio once the AC wakes up.
        const ms = new MediaStream([pub.track.mediaStreamTrack]);
        const el = document.createElement("audio");
        el.srcObject = ms;
        el.autoplay  = true;
        el.muted     = useWebAudio;
        el.volume    = 1.0;
        // Jitter buffer hint: "playback" tells the browser to buffer slightly more
        // aggressively — smooths over packet bursts on poor networks and reduces
        // the dropout / crackling artifacts during congestion.
        try { (el as any).audioPlaybackHint = "playback"; } catch {}
        el.style.display = "none";
        document.body.appendChild(el);
        el.play().catch(() => {});

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
  <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:40,overflow:"visible"}}>
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

   PING FIX: The previous implementation called getUserMedia and immediately
   released the stream (s.getTracks().forEach(t => t.stop())). On some Android
   builds this creates a ~200ms window where the OS revokes mic permission,
   interrupting the active LiveKit mic track. Now we hold the stream for 500ms
   before releasing — long enough for Android to see "mic is still needed"
   without actually consuming it for longer than necessary.

   PAGESHOW FIX: Added pageshow listener to catch the screen-lock → screen-unlock
   return path. visibilitychange stays "hidden" during screen lock; pageshow fires
   when the user wakes the device.                                              */
const MicKeepAlive = ({ micWasEnabled }: { micWasEnabled: boolean }) => {
  const room = useRoomContext();
  const micWasEnabledRef = useRef(micWasEnabled);
  micWasEnabledRef.current = micWasEnabled;

  useEffect(() => {
    const restoreMic = async () => {
      // Only restore when actually visible — no-op during screen lock
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

    // Ping: keeps mic permission alive on Android while backgrounded.
    // FIX: Hold the stream 500ms before releasing so Android doesn't see
    // a permission gap that could interrupt the live LiveKit mic track.
    const pingMic = async () => {
      if (document.visibilityState === "visible") return; // only ping in background
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        // Hold briefly — prevents the OS from seeing a "mic not needed" gap
        await new Promise(r => setTimeout(r, 500));
        s.getTracks().forEach(t => t.stop());
      } catch {}
    };

    const pingInterval = setInterval(pingMic, 25_000);
    document.addEventListener("visibilitychange", restoreMic);
    window.addEventListener("focus",    restoreMic);
    window.addEventListener("pageshow", restoreMic); // screen-lock → wake path

    return () => {
      clearInterval(pingInterval);
      document.removeEventListener("visibilitychange", restoreMic);
      window.removeEventListener("focus",    restoreMic);
      window.removeEventListener("pageshow", restoreMic);
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


/* ══════════════════════════════════════════════════════════════════════
   WHITEBOARD — full-featured: pen · highlighter · shapes · text · image
   undo/redo · zoom/pan · grid · export · colour picker · line thickness
   Real-time broadcast via LiveKit DataChannel + Supabase persistence
   ══════════════════════════════════════════════════════════════════════ */
type WBTool = "pen"|"highlighter"|"eraser"|"line"|"rect"|"circle"|"arrow"|"text"|"pan";
interface WBStroke {
  type:"stroke"; color:string; lineWidth:number; points:{x:number;y:number}[];
  dash?:number[]; opacity?:number;
}
interface WBShape {
  type:"rect"|"circle"|"line"|"arrow";
  color:string; lineWidth:number; fill?:string;
  x1:number; y1:number; x2:number; y2:number;
}
interface WBText {
  type:"text"; color:string; fontSize:number; fontFamily:string;
  x:number; y:number; text:string;
}
interface WBImage {
  type:"image"; dataUrl:string; x:number; y:number; w:number; h:number;
}
type WBElement = WBStroke|WBShape|WBText|WBImage;

function drawElement(ctx:CanvasRenderingContext2D, el:WBElement){
  ctx.save();
  if(el.type==="stroke"){
    const s=el as WBStroke;
    if(!s.points||s.points.length<1){ctx.restore();return;}
    ctx.globalAlpha=s.opacity??1;
    ctx.strokeStyle=s.color; ctx.lineWidth=s.lineWidth;
    ctx.lineCap="round"; ctx.lineJoin="round";
    if(s.dash)ctx.setLineDash(s.dash);
    ctx.beginPath();
    if(s.points.length===1){ctx.arc(s.points[0].x,s.points[0].y,s.lineWidth/2,0,Math.PI*2);ctx.fillStyle=s.color;ctx.fill();}
    else{
      ctx.moveTo(s.points[0].x,s.points[0].y);
      for(let i=1;i<s.points.length;i++){
        const p0=s.points[i-1],p1=s.points[i];
        ctx.quadraticCurveTo(p0.x,p0.y,(p0.x+p1.x)/2,(p0.y+p1.y)/2);
      }
      ctx.lineTo(s.points[s.points.length-1].x,s.points[s.points.length-1].y);
      ctx.stroke();
    }
  } else if(el.type==="rect"){
    const s=el as WBShape;
    ctx.strokeStyle=s.color; ctx.lineWidth=s.lineWidth;
    if(s.fill){ctx.fillStyle=s.fill;ctx.fillRect(s.x1,s.y1,s.x2-s.x1,s.y2-s.y1);}
    ctx.strokeRect(s.x1,s.y1,s.x2-s.x1,s.y2-s.y1);
  } else if(el.type==="circle"){
    const s=el as WBShape;
    ctx.strokeStyle=s.color; ctx.lineWidth=s.lineWidth;
    const rx=Math.abs(s.x2-s.x1)/2, ry=Math.abs(s.y2-s.y1)/2;
    const cx=(s.x1+s.x2)/2, cy=(s.y1+s.y2)/2;
    ctx.beginPath(); ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);
    if(s.fill){ctx.fillStyle=s.fill;ctx.fill();}
    ctx.stroke();
  } else if(el.type==="line"){
    const s=el as WBShape;
    ctx.strokeStyle=s.color; ctx.lineWidth=s.lineWidth;
    ctx.beginPath(); ctx.moveTo(s.x1,s.y1); ctx.lineTo(s.x2,s.y2); ctx.stroke();
  } else if(el.type==="arrow"){
    const s=el as WBShape;
    ctx.strokeStyle=s.color; ctx.fillStyle=s.color; ctx.lineWidth=s.lineWidth;
    const dx=s.x2-s.x1, dy=s.y2-s.y1, len=Math.hypot(dx,dy)||1;
    const ux=dx/len, uy=dy/len;
    const headLen=Math.max(16,s.lineWidth*4);
    ctx.beginPath(); ctx.moveTo(s.x1,s.y1); ctx.lineTo(s.x2,s.y2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x2,s.y2);
    ctx.lineTo(s.x2-headLen*(ux-uy*0.5),s.y2-headLen*(uy+ux*0.5));
    ctx.lineTo(s.x2-headLen*(ux+uy*0.5),s.y2-headLen*(uy-ux*0.5));
    ctx.closePath(); ctx.fill();
  } else if(el.type==="text"){
    const s=el as WBText;
    ctx.fillStyle=s.color; ctx.font=`${s.fontSize}px ${s.fontFamily}`;
    ctx.textBaseline="top";
    s.text.split("\n").forEach((line,i)=>ctx.fillText(line,s.x,s.y+i*(s.fontSize*1.25)));
  } else if(el.type==="image"){
    const s=el as WBImage;
    const img=new Image(); img.src=s.dataUrl;
    if(img.complete)ctx.drawImage(img,s.x,s.y,s.w,s.h);
    else img.onload=()=>{const c2=canvasCache.get(img.src);if(c2){const cx2=c2.getContext("2d");if(cx2)cx2.drawImage(img,s.x,s.y,s.w,s.h);}};
  }
  ctx.restore();
}
// tiny global image cache to avoid flicker
const canvasCache=new Map<string,HTMLCanvasElement>();

const Whiteboard = ({room,onClose,isTeacher,initialStrokes,subjectId,canStudentWrite}:any) => {
  const canDraw=isTeacher||canStudentWrite;
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const overlayRef=useRef<HTMLCanvasElement>(null); // preview layer for shapes
  const drawing=useRef(false);
  const startPos=useRef<{x:number;y:number}>({x:0,y:0});
  const elementsRef=useRef<WBElement[]>([]);
  const historyRef=useRef<WBElement[][]>([]); // undo stack
  const saveTimer=useRef<any>(null);
  const imgInputRef=useRef<HTMLInputElement>(null);
  // pan state
  const panOffset=useRef<{x:number;y:number}>({x:0,y:0});
  const panStart=useRef<{x:number;y:number}>({x:0,y:0});
  const isPanning=useRef(false);

  const [color,setColor]=useState("#1a1a1a");
  const [lineWidth,setLineWidth]=useState(3);
  const [tool,setTool]=useState<WBTool>("pen");
  const [fontSize,setFontSize]=useState(22);
  const [fontFamily,setFontFamily]=useState("sans-serif");
  const [fillShape,setFillShape]=useState(false);
  const [showGrid,setShowGrid]=useState(false);
  const [zoom,setZoom]=useState(1);
  const [busy,setBusy]=useState(true);
  const [textInput,setTextInput]=useState<{x:number;y:number;value:string}|null>(null);
  const textareaRef=useRef<HTMLTextAreaElement>(null);
  const [undoLen,setUndoLen]=useState(0);

  // Derived: legacy "strokes" arrays from old saves are auto-upgraded
  const upgradeStrokes=(raw:any[]):WBElement[]=>{
    return raw.map((el:any)=>{
      if(el.type&&["stroke","rect","circle","line","arrow","text","image"].includes(el.type))return el;
      // legacy stroke format
      return {type:"stroke",color:el.color||"#1a1a1a",lineWidth:el.lineWidth||3,points:el.points||[]} as WBStroke;
    });
  };

  const redrawMain=useCallback(()=>{
    const cv=canvasRef.current; if(!cv)return;
    const ctx=cv.getContext("2d"); if(!ctx)return;
    ctx.save();
    // background
    ctx.fillStyle="#fff"; ctx.fillRect(0,0,cv.width,cv.height);
    // grid
    if(showGrid){
      ctx.strokeStyle="rgba(180,210,200,.45)"; ctx.lineWidth=1;
      const gs=40;
      for(let x=0;x<cv.width;x+=gs){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,cv.height);ctx.stroke();}
      for(let y=0;y<cv.height;y+=gs){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(cv.width,y);ctx.stroke();}
    }
    ctx.translate(panOffset.current.x,panOffset.current.y);
    ctx.scale(zoom,zoom);
    for(const el of elementsRef.current)drawElement(ctx,el);
    ctx.restore();
  },[showGrid,zoom]);

  const redrawOverlay=useCallback((previewEl?:WBElement)=>{
    const cv=overlayRef.current; if(!cv)return;
    const ctx=cv.getContext("2d"); if(!ctx)return;
    ctx.clearRect(0,0,cv.width,cv.height);
    if(previewEl){ctx.save();ctx.translate(panOffset.current.x,panOffset.current.y);ctx.scale(zoom,zoom);drawElement(ctx,previewEl);ctx.restore();}
  },[zoom]);

  // load from supabase
  useEffect(()=>{(async()=>{
    try{
      const{data}=await supabase.from("subject_whiteboard"as any).select("strokes").eq("subject_id",subjectId).maybeSingle();
      if((data as any)?.strokes?.length)elementsRef.current=upgradeStrokes((data as any).strokes);
      else if(initialStrokes?.length)elementsRef.current=upgradeStrokes(initialStrokes);
    }catch{if(initialStrokes?.length)elementsRef.current=upgradeStrokes(initialStrokes);}
    setBusy(false); setTimeout(redrawMain,40);
  })();},[]);

  // re-render when showGrid/zoom changes
  useEffect(()=>{redrawMain();},[redrawMain]);

  const save=useCallback(()=>{
    if(!canDraw)return; clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(async()=>{
      try{await supabase.from("subject_whiteboard"as any).upsert({subject_id:subjectId,strokes:elementsRef.current,updated_at:new Date().toISOString()},{onConflict:"subject_id"});}catch{}
    },1200);
  },[canDraw,subjectId]);

  const broadcast=useCallback((msg:object)=>{
    try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify(msg)),{reliable:true});}catch{}
  },[room]);

  useEffect(()=>{
    if(!room)return;
    const h=(payload:Uint8Array)=>{
      try{
        const msg=JSON.parse(new TextDecoder().decode(payload));
        if(msg.type==="wb_elements"){elementsRef.current=upgradeStrokes(msg.elements);redrawMain();}
        if(msg.type==="wb_strokes"){elementsRef.current=upgradeStrokes(msg.strokes);redrawMain();} // compat
        if(msg.type==="wb_clear"){elementsRef.current=[];redrawMain();}
      }catch{}
    };
    room.on(RoomEvent.DataReceived,h); return()=>room.off(RoomEvent.DataReceived,h);
  },[room,redrawMain]);

  const pushHistory=()=>{
    historyRef.current.push(JSON.parse(JSON.stringify(elementsRef.current)));
    if(historyRef.current.length>60)historyRef.current.shift();
    setUndoLen(historyRef.current.length);
  };
  const undo=()=>{
    if(!historyRef.current.length)return;
    elementsRef.current=historyRef.current.pop()||[];
    setUndoLen(historyRef.current.length);
    redrawMain(); broadcast({type:"wb_elements",elements:elementsRef.current}); save();
  };

  const canvasToWorld=(cx:number,cy:number)=>({
    x:(cx-panOffset.current.x)/zoom,
    y:(cy-panOffset.current.y)/zoom,
  });
  const getPos=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    const r=overlayRef.current!.getBoundingClientRect();
    return canvasToWorld((e.clientX-r.left)*(overlayRef.current!.width/r.width),(e.clientY-r.top)*(overlayRef.current!.height/r.height));
  };

  const onDown=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    if(!canDraw)return;
    (e.target as any).setPointerCapture(e.pointerId);
    const pos=getPos(e);
    if(tool==="pan"){isPanning.current=true;panStart.current={x:e.clientX-panOffset.current.x,y:e.clientY-panOffset.current.y};return;}
    if(tool==="text"){
      setTextInput({x:pos.x,y:pos.y,value:""});
      setTimeout(()=>textareaRef.current?.focus(),30);
      return;
    }
    drawing.current=true;
    startPos.current=pos;
    if(tool==="pen"||tool==="highlighter"||tool==="eraser"){
      pushHistory();
      const opacity=tool==="highlighter"?0.35:1;
      const lw=tool==="eraser"?Math.max(lineWidth*4,24):lineWidth;
      const col=tool==="eraser"?"#ffffff":color;
      elementsRef.current.push({type:"stroke",color:col,lineWidth:lw,points:[pos],opacity} as WBStroke);
    }
  };

  const onMove=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    if(tool==="pan"&&isPanning.current){
      panOffset.current={x:e.clientX-panStart.current.x,y:e.clientY-panStart.current.y};
      redrawMain(); return;
    }
    if(!drawing.current||!canDraw)return;
    const pos=getPos(e);
    if(tool==="pen"||tool==="highlighter"||tool==="eraser"){
      const s=elementsRef.current[elementsRef.current.length-1] as WBStroke;
      if(s?.type==="stroke"){s.points.push(pos);redrawMain();}
    } else {
      // shape preview on overlay canvas
      const fill=fillShape?color+"44":undefined;
      let preview:WBElement|undefined;
      if(tool==="rect")preview={type:"rect",color,lineWidth,fill,x1:startPos.current.x,y1:startPos.current.y,x2:pos.x,y2:pos.y};
      else if(tool==="circle")preview={type:"circle",color,lineWidth,fill,x1:startPos.current.x,y1:startPos.current.y,x2:pos.x,y2:pos.y};
      else if(tool==="line")preview={type:"line",color,lineWidth,x1:startPos.current.x,y1:startPos.current.y,x2:pos.x,y2:pos.y};
      else if(tool==="arrow")preview={type:"arrow",color,lineWidth,x1:startPos.current.x,y1:startPos.current.y,x2:pos.x,y2:pos.y};
      if(preview)redrawOverlay(preview);
    }
  };

  const onUp=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    if(tool==="pan"){isPanning.current=false;return;}
    if(!canDraw||!drawing.current)return;
    drawing.current=false;
    const pos=getPos(e);
    if(tool==="rect"||tool==="circle"||tool==="line"||tool==="arrow"){
      pushHistory();
      const fill=fillShape?color+"44":undefined;
      if(tool==="rect")elementsRef.current.push({type:"rect",color,lineWidth,fill,x1:startPos.current.x,y1:startPos.current.y,x2:pos.x,y2:pos.y});
      else if(tool==="circle")elementsRef.current.push({type:"circle",color,lineWidth,fill,x1:startPos.current.x,y1:startPos.current.y,x2:pos.x,y2:pos.y});
      else if(tool==="line")elementsRef.current.push({type:"line",color,lineWidth,x1:startPos.current.x,y1:startPos.current.y,x2:pos.x,y2:pos.y});
      else if(tool==="arrow")elementsRef.current.push({type:"arrow",color,lineWidth,x1:startPos.current.x,y1:startPos.current.y,x2:pos.x,y2:pos.y});
      redrawOverlay();
    }
    redrawMain();
    broadcast({type:"wb_elements",elements:elementsRef.current}); save();
  };

  const commitText=()=>{
    if(!textInput||!textInput.value.trim()){setTextInput(null);return;}
    pushHistory();
    elementsRef.current.push({type:"text",color,fontSize,fontFamily,x:textInput.x,y:textInput.y,text:textInput.value});
    setTextInput(null); redrawMain();
    broadcast({type:"wb_elements",elements:elementsRef.current}); save();
  };

  const clearBoard=()=>{
    if(!canDraw)return;
    pushHistory();
    elementsRef.current=[]; redrawMain(); redrawOverlay();
    broadcast({type:"wb_clear"}); save();
  };

  const exportPNG=()=>{
    const cv=canvasRef.current; if(!cv)return;
    const a=document.createElement("a"); a.href=cv.toDataURL("image/png");
    a.download=`whiteboard-${Date.now()}.png`; a.click();
  };

  const handleImageUpload=(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0]; if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const dataUrl=ev.target?.result as string;
      const img=new Image(); img.onload=()=>{
        const maxW=400,maxH=300;
        const scale=Math.min(1,maxW/img.width,maxH/img.height);
        const cv=canvasRef.current;
        const cx=cv?(cv.width/2-panOffset.current.x)/zoom:200;
        const cy=cv?(cv.height/2-panOffset.current.y)/zoom:200;
        pushHistory();
        elementsRef.current.push({type:"image",dataUrl,x:cx-img.width*scale/2,y:cy-img.height*scale/2,w:img.width*scale,h:img.height*scale});
        redrawMain(); broadcast({type:"wb_elements",elements:elementsRef.current}); save();
      };img.src=dataUrl;
    };
    reader.readAsDataURL(file); e.target.value="";
  };

  const onWheel=(e:React.WheelEvent<HTMLDivElement>)=>{
    e.preventDefault();
    const delta=e.deltaY>0?-0.1:0.1;
    setZoom(z=>Math.max(0.3,Math.min(4,z+delta)));
  };

  const COLORS=["#1a1a1a","#EF4444","#F97316","#F59E0B","#22C55E","#3B82F6","#8B5CF6","#EC4899","#06B6D4","#ffffff"];
  type ToolDef={id:WBTool;icon:string;label:string};
  const TOOLS:ToolDef[]=[
    {id:"pen",icon:"✏️",label:"Pen"},
    {id:"highlighter",icon:"🖊️",label:"Highlight"},
    {id:"eraser",icon:"⬜",label:"Eraser"},
    {id:"line",icon:"╱",label:"Line"},
    {id:"arrow",icon:"→",label:"Arrow"},
    {id:"rect",icon:"▭",label:"Rectangle"},
    {id:"circle",icon:"◯",label:"Ellipse"},
    {id:"text",icon:"T",label:"Text"},
    {id:"pan",icon:"✋",label:"Pan"},
  ];

  const getCursor=()=>{
    if(!canDraw)return"default";
    if(tool==="pan")return isPanning.current?"grabbing":"grab";
    if(tool==="eraser")return"cell";
    if(tool==="text")return"text";
    return"crosshair";
  };

  return createPortal(
    <div style={{position:"fixed",inset:0,zIndex:9999,background:"#f0f4f3",display:"flex",flexDirection:"column"}}>
      {/* ── TOOLBAR ── */}
      <div style={{background:`linear-gradient(135deg,${TEAL2},${TEAL})`,display:"flex",alignItems:"center",gap:6,padding:"7px 10px",flexShrink:0,boxShadow:"0 2px 16px rgba(0,0,0,.4)",overflowX:"auto",minHeight:52}}>
        {/* Close */}
        <button onClick={onClose} title="Close" style={{width:32,height:32,borderRadius:8,background:"rgba(255,255,255,.15)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",flexShrink:0}}>
          <X style={{width:14,height:14}}/>
        </button>
        <div style={{width:1,height:28,background:"rgba(255,255,255,.2)",flexShrink:0}}/>
        {/* Title */}
        <PenTool style={{width:13,height:13,color:"rgba(255,255,255,.6)",flexShrink:0}}/>
        <span style={{fontSize:12,fontWeight:700,color:"#fff",flexShrink:0,marginRight:2}}>
          Whiteboard{!canDraw&&<span style={{fontSize:10,opacity:.4,marginLeft:4}}>View only</span>}
        </span>
        {canDraw&&<>
          <div style={{width:1,height:28,background:"rgba(255,255,255,.2)",flexShrink:0}}/>
          {/* Tool buttons */}
          {TOOLS.map(t=>(
            <button key={t.id} onClick={()=>{setTool(t.id);setTextInput(null);}} title={t.label}
              style={{width:30,height:30,borderRadius:7,border:"none",background:tool===t.id?"rgba(255,255,255,.32)":"rgba(255,255,255,.1)",
                fontSize:t.id==="text"?13:15,fontWeight:t.id==="text"?800:400,cursor:"pointer",flexShrink:0,
                display:"flex",alignItems:"center",justifyContent:"center",color:tool===t.id?"#fff":"rgba(255,255,255,.8)",
                boxShadow:tool===t.id?"0 0 0 2px rgba(255,255,255,.5)":"none",transition:"all .12s"}}>
              {t.icon}
            </button>
          ))}
          <div style={{width:1,height:28,background:"rgba(255,255,255,.2)",flexShrink:0}}/>
          {/* Colours */}
          {COLORS.map(col=>(
            <button key={col} onClick={()=>{setColor(col);if(tool==="pan"||tool==="eraser")setTool("pen");}} title={col}
              style={{width:18,height:18,borderRadius:"50%",background:col,flexShrink:0,cursor:"pointer",
                border:color===col?"3px solid #fff":"2px solid rgba(255,255,255,.25)",
                boxShadow:color===col?"0 0 6px rgba(255,255,255,.6)":"none",transition:"all .1s"}}/>
          ))}
          {/* Custom colour */}
          <div style={{position:"relative",flexShrink:0}}>
            <input type="color" value={color} onChange={e=>setColor(e.target.value)}
              style={{width:22,height:22,borderRadius:6,border:"2px solid rgba(255,255,255,.4)",cursor:"pointer",padding:0,background:"transparent"}}/>
          </div>
          <div style={{width:1,height:28,background:"rgba(255,255,255,.2)",flexShrink:0}}/>
          {/* Line width */}
          <span style={{fontSize:10,color:"rgba(255,255,255,.6)",flexShrink:0}}>Size</span>
          <input type="range" min={1} max={32} value={tool==="text"?fontSize:lineWidth}
            onChange={e=>tool==="text"?setFontSize(+e.target.value):setLineWidth(+e.target.value)}
            style={{width:60,accentColor:"#fff",flexShrink:0}}/>
          <span style={{fontSize:11,color:"#fff",minWidth:18,flexShrink:0,fontVariantNumeric:"tabular-nums"}}>
            {tool==="text"?fontSize:lineWidth}
          </span>
          {/* Fill toggle for shapes */}
          {(tool==="rect"||tool==="circle")&&(
            <button onClick={()=>setFillShape(f=>!f)} title="Fill shape"
              style={{height:26,padding:"0 8px",borderRadius:7,border:"none",background:fillShape?"rgba(255,255,255,.32)":"rgba(255,255,255,.1)",
                color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>
              {fillShape?"■ Filled":"□ Outline"}
            </button>
          )}
          {/* Font for text tool */}
          {tool==="text"&&(
            <select value={fontFamily} onChange={e=>setFontFamily(e.target.value)}
              style={{height:26,borderRadius:7,border:"none",background:"rgba(255,255,255,.15)",color:"#fff",fontSize:11,padding:"0 6px",cursor:"pointer",flexShrink:0}}>
              <option value="sans-serif">Sans</option>
              <option value="serif">Serif</option>
              <option value="monospace">Mono</option>
              <option value="'Amiri', serif">Amiri (Arabic)</option>
              <option value="'Scheherazade New', serif">Scheherazade</option>
            </select>
          )}
          <div style={{width:1,height:28,background:"rgba(255,255,255,.2)",flexShrink:0}}/>
          {/* Grid */}
          <button onClick={()=>setShowGrid(g=>!g)} title="Toggle grid"
            style={{height:26,padding:"0 8px",borderRadius:7,border:"none",background:showGrid?"rgba(255,255,255,.32)":"rgba(255,255,255,.1)",
              color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer",flexShrink:0}}>
            ⊞ Grid
          </button>
          {/* Zoom */}
          <button onClick={()=>setZoom(z=>Math.min(4,+(z+0.25).toFixed(2)))} title="Zoom in"
            style={{width:26,height:26,borderRadius:7,border:"none",background:"rgba(255,255,255,.1)",color:"#fff",fontSize:15,cursor:"pointer",flexShrink:0}}>+</button>
          <span style={{fontSize:11,color:"#fff",flexShrink:0,minWidth:34,textAlign:"center"}}>
            {Math.round(zoom*100)}%
          </span>
          <button onClick={()=>setZoom(z=>Math.max(0.3,+(z-0.25).toFixed(2)))} title="Zoom out"
            style={{width:26,height:26,borderRadius:7,border:"none",background:"rgba(255,255,255,.1)",color:"#fff",fontSize:15,cursor:"pointer",flexShrink:0}}>−</button>
          <button onClick={()=>{setZoom(1);panOffset.current={x:0,y:0};redrawMain();}} title="Reset view"
            style={{height:26,padding:"0 7px",borderRadius:7,border:"none",background:"rgba(255,255,255,.1)",color:"#fff",fontSize:11,cursor:"pointer",flexShrink:0}}>
            ⊙ Reset
          </button>
          <div style={{width:1,height:28,background:"rgba(255,255,255,.2)",flexShrink:0}}/>
          {/* Undo */}
          <button onClick={undo} disabled={undoLen===0} title="Undo (remove last action)"
            style={{height:26,padding:"0 8px",borderRadius:7,border:"none",
              background:undoLen>0?"rgba(255,255,255,.18)":"rgba(255,255,255,.06)",
              color:undoLen>0?"#fff":"rgba(255,255,255,.3)",fontSize:11,fontWeight:700,cursor:undoLen>0?"pointer":"default",flexShrink:0}}>
            ↩ Undo
          </button>
          {/* Image upload */}
          <button onClick={()=>imgInputRef.current?.click()} title="Insert image"
            style={{height:26,padding:"0 8px",borderRadius:7,border:"none",background:"rgba(255,255,255,.1)",color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer",flexShrink:0}}>
            🖼 Image
          </button>
          <input ref={imgInputRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleImageUpload}/>
          {/* Export */}
          <button onClick={exportPNG} title="Export as PNG"
            style={{height:26,padding:"0 8px",borderRadius:7,border:"none",background:"rgba(255,255,255,.1)",color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer",flexShrink:0}}>
            ↓ Export
          </button>
          {/* Clear (teacher only) */}
          {isTeacher&&(
            <button onClick={clearBoard} title="Clear board"
              style={{height:26,padding:"0 10px",borderRadius:7,border:"none",background:"#EF4444",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>
              ✕ Clear
            </button>
          )}
        </>}
      </div>
      {/* ── CANVAS AREA ── */}
      <div style={{flex:1,position:"relative",overflow:"hidden",background:"#f7f9f8",cursor:getCursor()}} onWheel={onWheel}>
        {busy&&(
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"#fff",zIndex:10}}>
            <Loader2 style={{width:32,height:32,color:TEAL,animation:"wb-spin .8s linear infinite"}}/>
          </div>
        )}
        {/* Main canvas (drawn elements) */}
        <canvas ref={canvasRef} width={1600} height={1000}
          style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block"}}/>
        {/* Overlay canvas (shape preview + pointer events) */}
        <canvas ref={overlayRef} width={1600} height={1000}
          style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block",touchAction:"none"}}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
          onPointerLeave={e=>{if(tool!=="pan")onUp(e);}} onPointerCancel={e=>{if(tool!=="pan")onUp(e);}}/>
        {/* Floating text input */}
        {textInput&&(()=>{
          const cv=overlayRef.current;
          if(!cv)return null;
          const r=cv.getBoundingClientRect();
          const sx=(textInput.x*zoom+panOffset.current.x)*(r.width/cv.width);
          const sy=(textInput.y*zoom+panOffset.current.y)*(r.height/cv.height);
          return(
            <textarea ref={textareaRef} value={textInput.value}
              onChange={e=>setTextInput(t=>t?{...t,value:e.target.value}:null)}
              onKeyDown={e=>{if(e.key==="Escape"){setTextInput(null);}if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();commitText();}}}
              onBlur={commitText}
              placeholder="Type here… (Enter to place, Shift+Enter for new line)"
              style={{position:"absolute",left:r.left+sx,top:r.top+sy,
                minWidth:160,minHeight:40,
                font:`${fontSize*zoom*(r.width/cv.width)}px ${fontFamily}`,
                color:color,background:"rgba(255,255,255,.92)",
                border:`2px dashed ${TEAL}`,borderRadius:6,padding:"4px 8px",
                resize:"both",zIndex:20,outline:"none",boxShadow:"0 4px 20px rgba(0,0,0,.18)"}}/>
          );
        })()}
        {/* View-only label */}
        {!canDraw&&!busy&&(
          <div style={{position:"absolute",bottom:16,left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,0,.55)",color:"#fff",borderRadius:20,padding:"6px 18px",fontSize:12,pointerEvents:"none"}}>
            👁 View only — teacher controls this board
          </div>
        )}
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

  // ── resolve Supabase storage path to a working viewer URL ────────────────
  // Strategy: if rawUrl is already https:// (teacher pre-resolved it before
  // broadcasting) we skip all network calls entirely — zero latency.
  // Otherwise we try public URL first (HEAD check), then signed URL fallback.
  const [resolvedUrl, setResolvedUrl] = useState<string>(
    rawUrl.startsWith("http") ? rawUrl : ""
  );
  const [urlLoading, setUrlLoading] = useState(!rawUrl.startsWith("http"));

  useEffect(()=>{
    if(rawUrl.startsWith("http")){
      setResolvedUrl(rawUrl);
      setUrlLoading(false);
      // Kick off background PDF render immediately so viewer opens instantly
      const ext = rawUrl.split("?")[0].split(".").pop()?.toLowerCase();
      if(ext==="pdf") prewarmPDF(rawUrl);
      return;
    }

    // Raw storage path — need to resolve
    setUrlLoading(true);

    const isSupabaseStorage = rawUrl.includes(".supabase.co/storage");

    if(isSupabaseStorage){
      // Try public URL first (fast, no token needed)
      const match = rawUrl.match(/\/storage\/v1\/object\/(?:public\/)?([^/?]+)\/(.+?)(\?.*)?$/);
      if(match){
        const [,bucketName,storagePath]=match;
        const { data: pub } = supabase.storage.from(bucketName).getPublicUrl(storagePath);
        if(pub?.publicUrl){
          fetch(pub.publicUrl,{method:"HEAD",signal:AbortSignal.timeout(4000)})
            .then(r=>{
              if(r.ok||r.status===304){
                setResolvedUrl(pub.publicUrl);
                setUrlLoading(false);
                prewarmPDF(pub.publicUrl);
              } else { throw new Error("not public"); }
            })
            .catch(()=>{
              // Fall back to signed URL
              supabase.storage.from(bucketName).createSignedUrl(storagePath,604800)
                .then(({data:signed})=>{
                  const u=signed?.signedUrl||rawUrl;
                  setResolvedUrl(u);
                  setUrlLoading(false);
                  prewarmPDF(u);
                })
                .catch(()=>{ setResolvedUrl(rawUrl); setUrlLoading(false); });
            });
          return;
        }
      }
    }

    // Legacy path or non-Supabase storage path — use getSignedUrl
    getSignedUrl(rawUrl).then(signed=>{
      const u=signed||rawUrl;
      setResolvedUrl(u);
      setUrlLoading(false);
      prewarmPDF(u);
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
    // Text-only material (e.g. a note shared from the live class) — no file to load.
    if(!rawUrl&&material.content)return(
      <div style={{flex:1,overflowY:"auto",background:"#0f1117",padding:"22px 18px"}}>
        <div style={{maxWidth:560,margin:"0 auto",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:14,padding:"20px 22px"}}>
          <p style={{whiteSpace:"pre-wrap" as const,fontSize:14,lineHeight:1.7,color:"#e8eaf0",margin:0,fontFamily:"'Google Sans',sans-serif"}}>{material.content}</p>
        </div>
      </div>
    );
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
        {rawUrl&&<a href={url} target="_blank" rel="noopener noreferrer"
          style={{fontSize:11,color:"#d1d5db",background:"rgba(255,255,255,.1)",borderRadius:8,padding:"4px 10px",textDecoration:"none",fontWeight:600,flexShrink:0}}>↗</a>}
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
        setExpandedTafseer(p=>({...p,[key]:raw.replace(/