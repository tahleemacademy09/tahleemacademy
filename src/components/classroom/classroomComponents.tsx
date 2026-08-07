/*
  classroomComponents.tsx — Tahleem Academy Live Classroom
  All of the standalone helper hooks/components used by ClassroomView.tsx,
  split out of that file to keep each file a manageable size. Nothing in
  here changed behaviourally — every top-level declaration just gained an
  `export` keyword so ClassroomView.tsx (and RecitationCallRoom.tsx-style
  consumers, if any) can import it.
*/

import {
  LiveKitRoom, useRoomContext,
  useParticipants, useLocalParticipant, useTracks,
} from "@livekit/components-react";
// @ts-ignore
import "@livekit/components-styles";
import { Track, RoomEvent, ConnectionState, ConnectionQuality, RemoteTrackPublication, RemoteParticipant } from "livekit-client";
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
  Zap, ClipboardList, Bell, Radio, Layers,
  UserMinus, UserX, ShieldCheck,
} from "lucide-react";
import ClassLobby        from "./ClassLobby";
import ClassChatPanel    from "./ClassChatPanel";
import ClassParticipants from "./ClassParticipants";

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT CAUSE FIX — "nobody can hear each other in class" (intermittent, both
// sides, no error shown):
//
// room.localParticipant.setMicrophoneEnabled()/setCameraEnabled() are NOT safe
// to call concurrently. Internally each call does getUserMedia → publishTrack
// (or unpublishTrack) → SDP renegotiation with the server over the SAME signal
// connection. This app has (at least) seven independent places that call one
// of these with zero coordination between them: ClassControls' toggle button,
// AdminMuteListener (teacher force-mute), MediaAutoPublish (applies the lobby
// choice ~450ms after every join/reconnect), MicKeepAliveFromContext's repair
// heartbeat (runs every 8s, plus on every visibility/focus/track-ended/mute
// event), GroupReciteAutoMic, and RoomToContextBridge's toggle/restore
// functions (used by the minimized pill). Each of those guards against
// double-firing ITSELF, but nothing stops two of them firing at once — e.g.
// the 8s keep-alive heartbeat landing in the same tick as a teacher's
// force-mute, or MediaAutoPublish's delayed apply landing while
// GroupReciteAutoMic is also toggling the mic on join.
//
// When two of these race, the SECOND publishTrack/unpublishTrack call can
// start renegotiating before the first one's SDP offer/answer has finished.
// LiveKit's local state (`isMicrophoneEnabled`) still flips to whatever the
// last call requested — so the UI (mic icon, waveform) looks completely
// normal — but the underlying track publication can be left half-negotiated
// and never actually reaches the server, so no other participant ever
// receives it. That's exactly the reported symptom: mic shows as on, nothing
// looks wrong, but the room is silent.
//
// Fix: every mic/cam mutation across the whole classroom now funnels through
// this single per-room promise chain, so LiveKit only ever runs one
// enable/disable negotiation at a time no matter which component triggered
// it. This doesn't change what any of them does — it just guarantees they
// can no longer step on each other.
const mediaOpChains = new WeakMap<object, Promise<any>>();
export function queueMediaOp<T>(room: any, op: () => Promise<T>): Promise<T> {
  if (!room) return op();
  const prevChain = mediaOpChains.get(room) || Promise.resolve();
  const result = prevChain.then(op, op); // run regardless of whether the previous queued op failed
  mediaOpChains.set(room, result.catch(() => {}));
  return result;
}
import ClassPolls        from "./ClassPolls";
import ClassEndScreen    from "./ClassEndScreen";
import LiveQuizOverlay   from "./LiveQuizOverlay";
import PDFViewer, { prewarmPDF } from "./PDFViewer";
import LiveClassFilePanel from "./LiveClassFilePanel";
import SubjectAssignments from "./SubjectAssignments";
import { useIsMobile }   from "@/hooks/use-mobile";
import { useState, useEffect, useRef, useCallback, useReducer, createContext, useContext } from "react";

export interface ClassroomViewProps { subject: any; onLeave: () => void; onMinimize?: () => void; autoJoin?: boolean; }
export type LayoutMode = "grid"|"spotlight"|"horizontal"|"vertical"|"focus";
export interface FloatingEmoji { id:number; emoji:string; x:number; sender:string; }
export interface RaisedHand   { identity:string; name:string; raisedAt:number; }

export const TEAL  = "#0a7c68";
export const TEAL2 = "#064E3B";
export const DARK  = "#0f1117";
export const GLASS = "rgba(15,17,23,0.88)";
export const GLASSB= "rgba(255,255,255,0.08)";
export const GREEN = "#22c55e";
export const RED   = "#ef4444";
export const BAR_H = 76;

/* ══════════════════════════════════════════════════════════════════════
   BACKGROUND AUDIO KEEP-ALIVE — now handled entirely by
   src/hooks/useBackgroundAudio.ts (started/stopped from GlobalClassroomOverlay
   based on `hasConnected`). That hook uses a single real <audio> element at
   volume=0.001 instead of an AudioContext oscillator.

   REMOVED (this used to live here): a second, duplicate keep-alive with its
   own <audio> element AND an AudioContext oscillator at gain=0. Running two
   silent <audio> elements at once is wasteful and can cause audio-focus
   contention on Android, and the oscillator is actively counterproductive —
   Chrome (Android 9+) detects a silent AudioContext and throttles the JS
   thread after ~30s of screen lock, which is the opposite of what we want.
   Keeping only one implementation (useBackgroundAudio.ts) avoids both problems.
   ══════════════════════════════════════════════════════════════════════ */


export const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Google+Sans+Display:wght@400;500;700&display=swap');

  @keyframes cv-spin      { to { transform:rotate(360deg); } }
  @keyframes slide-down   { from { transform:translateY(-100%);opacity:0; } to { transform:translateY(0);opacity:1; } }
  @keyframes speak-bar    { 0%,100% { transform:scaleY(0.4); } 50% { transform:scaleY(1.3); } }
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
    /* Intentionally no edge glow/border animation here — the waveform
       (.gm-wave-tile) is the only element that should move while speaking. */
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

  /* In-tile speaking waveform — overlays the participant's square (video or avatar)
     while they're actively talking, instead of only a tiny indicator in the corner. */
  .gm-wave-tile {
    position:absolute; left:50%; bottom:14px; transform:translateX(-50%);
    display:flex; align-items:center; justify-content:center; gap:3px;
    height:26px; padding:6px 12px; border-radius:14px;
    background:rgba(0,0,0,.4); backdrop-filter:blur(6px);
    pointer-events:none; z-index:2;
    animation: fade-in .18s ease both;
  }
  .gm-wave-tile-bar {
    width:3px; height:100%; border-radius:2px; background:#25D366;
    animation: speak-bar-tile .9s ease-in-out infinite;
  }
  @keyframes speak-bar-tile { 0%,100% { transform:scaleY(.25); } 50% { transform:scaleY(1); } }

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
    transition:background .15s; border-radius:28px;
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
/* ── DEBOUNCE, NOT A DEAD ZONE ───────────────────────────────────────────
   CHANGED: this used to wait a fixed 10 minutes after backgrounding before
   doing ANYTHING, even if the WebSocket had already dropped in the first
   few seconds — meaning zero reconnect attempts were made for up to 10
   minutes while the user sat there thinking they were still connected.

   Now: a short debounce (WS_DROP_DEBOUNCE_MS) just filters out momentary
   flicker (e.g. a single missed ping), then reconnection starts right away
   via the existing autoReconnect backoff loop — whether the tab is visible
   or not. Background reconnection is allowed to be far more patient before
   giving up (see BACKGROUND_MAX_ATTEMPTS in autoReconnect below) instead of
   relying on a silent multi-minute wait to do that job.                    */
export const WS_DROP_DEBOUNCE_MS = 1_000; // 1s — enough to ignore a single flicker, fast enough that reconnect starts almost immediately

/* ══════════════════════════════════════════════════════════════════════
   FEATURE 1: RECONNECTING OVERLAY
   Shows attempt count, countdown to next retry, and a "stay on page" nudge.
   Much better UX than a plain spinner — user knows what's happening.
   ══════════════════════════════════════════════════════════════════════ */
export const ReconnectingOverlay = ({ attempt }: { attempt: number }) => {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    // Show countdown matching the backoff: 0.4s, 0.8s, 1.6s, 3.2s... 15s cap
    const wait = Math.min(0.4 * Math.pow(2, attempt), 15);
    setSecs(wait);
    const iv = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(iv);
  }, [attempt]);
  const msgs = [
    "Checking connection…",
    "Network blip — retrying…",
    "Still trying…",
    "Weak signal detected…",
    "Switching to audio-only…",
  ];
  const msg = msgs[Math.min(attempt, msgs.length - 1)];
  return (
    <div style={{
      position:"absolute",inset:0,zIndex:200,
      background:"rgba(15,17,23,.93)",backdropFilter:"blur(14px)",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,
    }}>
      {/* Animated ring */}
      <div style={{position:"relative",width:64,height:64}}>
        <div style={{
          position:"absolute",inset:0,
          border:"3px solid rgba(138,180,248,.12)",
          borderTopColor:"#8ab4f8",borderRadius:"50%",
          animation:"cv-spin .9s linear infinite",
        }}/>
        <div style={{
          position:"absolute",inset:6,
          border:"2px solid rgba(138,180,248,.06)",
          borderTopColor:"rgba(138,180,248,.4)",borderRadius:"50%",
          animation:"cv-spin 1.4s linear infinite reverse",
        }}/>
        <span style={{
          position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:11,fontWeight:700,color:"#8ab4f8",
        }}>{attempt > 0 ? attempt : ""}</span>
      </div>
      <div style={{textAlign:"center"}}>
        <p style={{color:"#e8eaed",fontSize:15,fontWeight:600,margin:"0 0 4px",fontFamily:"'Google Sans',sans-serif"}}>{msg}</p>
        {secs > 0 && <p style={{color:"rgba(255,255,255,.35)",fontSize:12,margin:0,fontFamily:"'Google Sans',sans-serif"}}>Retrying in {Math.ceil(secs)}s…</p>}
      </div>
      {/* Soft signal bars animation */}
      <div style={{display:"flex",gap:3,alignItems:"flex-end",height:20}}>
        {[6,10,14,10,6].map((h,i) => (
          <div key={i} style={{
            width:4,borderRadius:2,
            background:"rgba(138,180,248,.3)",
            height:h,
            animation:`speak-bar ${0.6+i*0.1}s ease-in-out infinite`,
            animationDelay:`${i*0.08}s`,
          }}/>
        ))}
      </div>
      <p style={{color:"rgba(255,255,255,.25)",fontSize:11,fontFamily:"'Google Sans',sans-serif",margin:0}}>
        Stay on the page — your session is saved
      </p>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════
   FEATURE 2: AUDIO-ONLY MODE TOGGLE
   Manual button to force camera off + reduce Opus bitrate.
   Best used proactively when on a known weak connection.
   ══════════════════════════════════════════════════════════════════════ */
export const useAudioOnlyMode = () => {
  const room = useRoomContext();
  const [audioOnly, setAudioOnly] = useState(false);
  const toggle = useCallback(async () => {
    if (!room?.localParticipant) return;
    const lp = room.localParticipant;
    try {
      if (!audioOnly) {
        // Enable audio-only: camera off, reduce audio bitrate to 16kbps
        await queueMediaOp(room, () => lp.setCameraEnabled(false));
        // Reduce audio encoding quality to save ~14kbps more
        const micPub = lp.getTrackPublication(Track.Source.Microphone);
        if (micPub?.track) {
          try {
            const sender = (micPub.track as any)?.sender as RTCRtpSender | undefined;
            if (sender) {
              const params = sender.getParameters();
              if (params.encodings?.length) {
                params.encodings[0].maxBitrate = 20000; // 20kbps — audio-only mode, still clear for voice
                await sender.setParameters(params);
              }
            }
          } catch { /* not all browsers support setParameters */ }
        }
        setAudioOnly(true);
        toast({ title: "📵 Audio-only mode", description: "Camera off — using minimal bandwidth." });
      } else {
        // Restore camera + normal audio bitrate
        await queueMediaOp(room, () => lp.setCameraEnabled(true));
        const micPub = lp.getTrackPublication(Track.Source.Microphone);
        if (micPub?.track) {
          try {
            const sender = (micPub.track as any)?.sender as RTCRtpSender | undefined;
            if (sender) {
              const params = sender.getParameters();
              if (params.encodings?.length) {
                params.encodings[0].maxBitrate = 40000; // restore 40kbps
                await sender.setParameters(params);
              }
            }
          } catch {}
        }
        setAudioOnly(false);
        toast({ title: "📷 Video restored", description: "Full quality mode re-enabled." });
      }
    } catch { /* camera may be blocked */ }
  }, [room, audioOnly]);
  return { audioOnly, toggleAudioOnly: toggle };
};

/* ══════════════════════════════════════════════════════════════════════
   FEATURE 5: CONNECTION HEARTBEAT PING (diagnostics only)
   Sends a lightweight Supabase ping every 15s. Previously this also forced
   the camera off after consecutive failures corroborated by LiveKit's own
   connection-quality reading — that behaviour has been removed entirely per
   request. The camera is never auto-disabled or auto-restored because of
   network conditions; the ping below no longer has any effect on media.
   ══════════════════════════════════════════════════════════════════════ */
// NOTE: this hook used to force the camera off after 3 missed connectivity
// pings corroborated by a "poor"/"lost" LiveKit connection-quality reading,
// then try to silently restore it later. Removed entirely per request — the
// camera must never be auto-disabled (or auto re-enabled) because of network
// conditions. Those repeated setCameraEnabled(false)/(true) cycles were also
// a real source of visible freezes/hangs during class, since every toggle
// renegotiates the peer connection. Quality adaptation is now left entirely
// to LiveKit's own simulcast/dynacast (see publishDefaults in
// ClassroomView.tsx), which swaps encoding layers server-side with no
// renegotiation and no camera restart. The heartbeat ping itself is kept
// (harmless, useful if reintroduced later for pure diagnostics) but it no
// longer touches media tracks in any way.
export const useConnectionHeartbeat = (sessionId: string | null, active: boolean) => {
  const room = useRoomContext();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active || !sessionId) return;
    const ping = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        await supabase.from("live_sessions").select("id").eq("id", sessionId).maybeSingle();
      } catch {}
    };
    timerRef.current = setInterval(ping, 15_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [active, sessionId, room]);
};

/* ══════════════════════════════════════════════════════════════════════
   FEATURE 9: DATA CHANNEL MESSAGE QUEUE
   Buffers publishData calls made during reconnect window.
   On reconnect, flushes queued messages so no whiteboard stroke,
   emoji, or control message is silently dropped.
   ══════════════════════════════════════════════════════════════════════ */
export const pendingDataQueue: Array<{ data: Uint8Array; opts: any }> = [];
let _roomForQueue: any = null;

export function queuePublish(data: Uint8Array, opts: any = { reliable: true }) {
  if (_roomForQueue?.localParticipant && _roomForQueue.state === "connected") {
    try { _roomForQueue.localParticipant.publishData(data, opts); } catch {}
  } else {
    pendingDataQueue.push({ data, opts });
  }
}

export function flushDataQueue(room: any) {
  _roomForQueue = room;
  while (pendingDataQueue.length > 0) {
    const item = pendingDataQueue.shift()!;
    try { room.localParticipant.publishData(item.data, item.opts); } catch {}
  }
}

export const DataQueueFlusher = ({ roomRef }: { roomRef: React.MutableRefObject<any> }) => {
  const room = useRoomContext();
  useEffect(() => {
    if (!room) return;
    _roomForQueue = room;
    const onConnected = () => { flushDataQueue(room); };
    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.Reconnected, onConnected);
    // Flush immediately if already connected
    if (room.state === "connected") flushDataQueue(room);
    return () => {
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.Reconnected, onConnected);
    };
  }, [room]);
  return null;
};

/* ══════════════════════════════════════════════════════════════════════
   FEATURE 7: WAKE LOCK (screen stays on during class)
   navigator.wakeLock.request("screen") prevents Android/iOS from
   dimming the screen mid-class. Released automatically on leave.
   ══════════════════════════════════════════════════════════════════════ */
export function useScreenWakeLock(active: boolean) {
  const lockRef = useRef<any>(null);
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let released = false;
    const acquire = async () => {
      try {
        lockRef.current = await (navigator as any).wakeLock.request("screen");
        lockRef.current.addEventListener("release", () => {
          // Auto-reacquire if tab is still visible (lock released by browser on visibility change)
          if (!released && document.visibilityState === "visible") acquire();
        });
      } catch { /* not supported or permission denied */ }
    };
    acquire();
    const onVis = () => { if (document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVis);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}

// Module-scope (not component-scope) so both the network-quality hook and the
// manual mic/cam toggle handler — which live in two separate components —
// can read/clear the same flag. Single active call per app instance, so a
// module-level value (rather than context) is fine here.
// true only while camera is off because the network hook turned it off for
// a "lost" connection; cleared the instant the student manually touches the
// camera toggle, so a later quality-recovery event never overrides a
// deliberate user action.
export const cameraAutoDisabledByNetwork = { current: false };

export const ReconnectMonitor = ({ onReconnecting, onReconnected, onDisconnected }: {
  onReconnecting: () => void;
  onReconnected:  () => void;
  onDisconnected: () => void;
}) => {
  const room = useRoomContext();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearDebounce = () => {
      if (debounceTimer.current) { clearTimeout(debounceTimer.current); debounceTimer.current = null; }
    };

    // A drop is confirmed after WS_DROP_DEBOUNCE_MS with no recovery — filters
    // out a single missed ping/flicker without sitting idle for minutes.
    // Fires the same whether the tab is visible or hidden: reconnection
    // should start as soon as we know it's needed, not only once someone is
    // looking at the screen. autoReconnect's own backoff (and its separate,
    // more patient budget while backgrounded) takes it from here.
    const handleDisconnect = () => {
      clearDebounce();
      debounceTimer.current = setTimeout(() => {
        debounceTimer.current = null;
        onDisconnected();
      }, WS_DROP_DEBOUNCE_MS);
    };

    room.on(RoomEvent.Reconnecting, onReconnecting);
    room.on(RoomEvent.Reconnected,  onReconnected);
    room.on(RoomEvent.Disconnected, handleDisconnect);

    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      // Tab coming back to foreground.
      if (room.state === ConnectionState.Disconnected) {
        clearDebounce();
        onDisconnected(); // reconnect immediately; don't wait for the debounce
        return;
      }
      if (room.state === ConnectionState.Connected) {
        clearDebounce(); // we recovered before the debounce fired — cancel it
        // NOTE: mic restoration is handled by MicKeepAliveFromContext which reads
        // live mic state from context and never cycles an intentionally-muted mic.
        onReconnected();
      }
    };

    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearDebounce();
      room.off(RoomEvent.Reconnecting, onReconnecting);
      room.off(RoomEvent.Reconnected,  onReconnected);
      room.off(RoomEvent.Disconnected, handleDisconnect);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [room, onReconnecting, onReconnected, onDisconnected]);
  return null;
};

/* ══ FEATURE 4: CONNECTION STATE BANNER ══
   Thin amber bar that appears when LiveKit itself is reconnecting.
   Unlike the full overlay, this is non-blocking — video/audio may still work.
   ══════════════════════════════════════════════════════════════════════ */
export const ConnectionStateBanner = () => {
  const room = useRoomContext();
  const [state, setState] = useState<string>("connected");
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!room) return;
    const onReconnecting = () => {
      setState("reconnecting");
      startRef.current = Date.now();
      setElapsed(0);
    };
    const onReconnected = () => { setState("connected"); startRef.current = null; };
    const onDisconnected = () => { setState("disconnected"); };
    room.on(RoomEvent.Reconnecting, onReconnecting);
    room.on(RoomEvent.Reconnected,  onReconnected);
    room.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.Reconnecting, onReconnecting);
      room.off(RoomEvent.Reconnected,  onReconnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
    };
  }, [room]);

  // Tick elapsed seconds while reconnecting
  useEffect(() => {
    if (state !== "reconnecting") return;
    const iv = setInterval(() => {
      setElapsed(startRef.current ? Math.floor((Date.now() - startRef.current) / 1000) : 0);
    }, 1000);
    return () => clearInterval(iv);
  }, [state]);

  if (state === "connected") return null;

  const isDisconnected = state === "disconnected";
  const bg  = isDisconnected ? "rgba(239,68,68,.92)"  : "rgba(217,119,6,.92)";
  const msg = isDisconnected ? "⚠️ Disconnected — reconnecting…"
                              : `↻ Reconnecting… ${elapsed > 0 ? `${elapsed}s` : ""}`;
  return (
    <div style={{
      position:"absolute",top:0,left:0,right:0,zIndex:199,
      background:bg,backdropFilter:"blur(8px)",
      padding:"5px 14px",
      display:"flex",alignItems:"center",justifyContent:"center",gap:8,
      animation:"slide-down .2s ease",
    }}>
      <div style={{
        width:10,height:10,borderRadius:"50%",
        border:"2px solid rgba(255,255,255,.6)",
        borderTopColor:"#fff",
        animation:"cv-spin .7s linear infinite",
        flexShrink:0,
      }}/>
      <span style={{
        color:"#fff",fontSize:12,fontWeight:600,
        fontFamily:"'Google Sans',sans-serif",
      }}>{msg}</span>
    </div>
  );
};

/* ══ AUDIO-ONLY BRIDGE — inside LiveKitRoom ══ */
export const AudioOnlyBridge = ({ active }: { active: boolean }) => {
  const room = useRoomContext();
  const prevRef = useRef(false);
  useEffect(() => {
    if (!room?.localParticipant) return;
    if (prevRef.current === active) return;
    prevRef.current = active;
    const lp = room.localParticipant;
    (async () => {
      try {
        if (active) {
          await queueMediaOp(room, () => lp.setCameraEnabled(false));
          // Drop audio bitrate to 16kbps
          const micPub = lp.getTrackPublication(Track.Source.Microphone);
          const sender = (micPub?.track as any)?.sender as RTCRtpSender | undefined;
          if (sender) {
            const p = sender.getParameters();
            if (p.encodings?.[0]) { p.encodings[0].maxBitrate = 16000; await sender.setParameters(p); }
          }
        } else {
          await queueMediaOp(room, () => lp.setCameraEnabled(true));
          const micPub = lp.getTrackPublication(Track.Source.Microphone);
          const sender = (micPub?.track as any)?.sender as RTCRtpSender | undefined;
          if (sender) {
            const p = sender.getParameters();
            if (p.encodings?.[0]) { p.encodings[0].maxBitrate = 32000; await sender.setParameters(p); }
          }
        }
      } catch {}
    })();
  }, [active, room]);
  return null;
};

/* ══ PROFILE SYNC BRIDGE — inside LiveKitRoom ══
   FIX ("when a user changes their profile pic it should show for everyone in
   the room"): ParticipantTile already reads name/avatar for REMOTE users from
   participant.metadata, and already re-renders instantly whenever LiveKit
   fires participantMetadataChanged — that part was already wired up. What was
   missing was anything that ever pushed a NEW metadata value after the
   initial one baked into the join token. This listens for the local user's
   own `profiles` row changing (avatar_url or full_name) and calls
   localParticipant.setMetadata() with the fresh values — that single call is
   what fans out to every other participant's tile in real time. Requires the
   join token's video grant to include canUpdateOwnMetadata: true (added to
   supabase/functions/livekit-token). */
export const ProfileSyncBridge = () => {
  const room = useRoomContext();
  const { user, refreshProfile } = useAuth();
  useEffect(() => {
    if (!user?.id || !room) return;
    const ch = supabase.channel(`profile-sync-${user.id}-${room.name}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` },
        async (payload: any) => {
          // Keep AuthContext's cached profile in sync too (fixes the local
          // user's own tile, which reads avatar_url from useAuth(), not metadata).
          refreshProfile().catch(() => {});
          try {
            const lp = room.localParticipant;
            const existing = lp.metadata ? JSON.parse(lp.metadata) : {};
            const next = {
              ...existing,
              name: payload.new?.full_name ?? existing.name,
              avatar_url: payload.new?.avatar_url ?? existing.avatar_url,
            };
            await lp.setMetadata(JSON.stringify(next));
          } catch { /* canUpdateOwnMetadata missing on an old/unrefreshed token — silently skip */ }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, room, refreshProfile]);
  return null;
};

/* ══ HEARTBEAT BRIDGE — inside LiveKitRoom ══ */
export const HeartbeatBridge = ({ sessionId, active }: { sessionId: string | null; active: boolean }) => {
  useConnectionHeartbeat(sessionId, active);
  return null;
};

/* ══ WB SYNC BRIDGE ══ */
export const WbSyncBridge = ({ wbOpen, isTeacher }: { wbOpen: boolean; isTeacher: boolean }) => {
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
// ── Camera un-mirror processor ───────────────────────────────────────────
// BUG FIX ("shows well for me, flipped for others"): CSS transforms (used
// for the local self-preview mirror above) only ever change how a video
// element is RENDERED on the screen it's applied on — they cannot change
// what's actually captured and sent over the network. If the raw camera
// frames a browser hands back from getUserMedia are themselves already
// horizontally flipped (a real, if uncommon, quirk of some webcam driver
// stacks — most often DirectShow-based front cameras on Windows/Chrome,
// though it can happen on other platforms too), that flipped frame is
// exactly what gets published and is exactly what every remote viewer
// sees, no matter what CSS the local browser applies to its own preview.
// The only real fix is to correct the actual pixels before they're
// encoded: draw every incoming frame onto a canvas mirrored back the
// other way, then publish the CANVAS's stream instead of the raw camera
// stream. This is what LiveKit's Track Processor API exists for — it lets
// us intercept and replace a track's frames post-capture, pre-encode,
// without touching any of the setCameraEnabled()/switchCamera() call
// sites elsewhere in the app (see CameraUnmirrorEngine below, which
// attaches this automatically the moment ANY camera track gets published,
// covering every one of those call sites from one place).
class MirrorCorrectProcessor {
  name = "un-mirror-camera";
  processedTrack?: MediaStreamTrack;
  private canvas?: HTMLCanvasElement;
  private ctx?: CanvasRenderingContext2D | null;
  private sourceEl?: HTMLVideoElement;
  private rafId: number | null = null;

  private async setup(track: MediaStreamTrack){
    this.sourceEl = document.createElement("video");
    this.sourceEl.muted = true;
    this.sourceEl.playsInline = true;
    this.sourceEl.srcObject = new MediaStream([track]);
    try{ await this.sourceEl.play(); }catch{}

    const settings = track.getSettings?.() || {};
    const w = (settings as any).width || 1280;
    const h = (settings as any).height || 720;
    this.canvas = document.createElement("canvas");
    this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext("2d");

    const draw = () => {
      if(this.ctx && this.sourceEl && this.sourceEl.readyState >= 2){
        this.ctx.save();
        this.ctx.scale(-1, 1);
        this.ctx.drawImage(this.sourceEl, -w, 0, w, h);
        this.ctx.restore();
      }
      this.rafId = requestAnimationFrame(draw);
    };
    draw();

    const stream = (this.canvas as any).captureStream(30);
    this.processedTrack = stream.getVideoTracks()[0];
  }

  async init(opts: {track: MediaStreamTrack; element?: HTMLMediaElement}){
    await this.setup(opts.track);
  }
  async restart(opts: {track: MediaStreamTrack; element?: HTMLMediaElement}){
    await this.destroy();
    await this.setup(opts.track);
  }
  async destroy(){
    if(this.rafId!=null){cancelAnimationFrame(this.rafId);this.rafId=null;}
    try{this.sourceEl?.pause();}catch{}
    try{this.processedTrack?.stop();}catch{}
    this.sourceEl=undefined;this.canvas=undefined;this.ctx=undefined;this.processedTrack=undefined;
  }
}

// Headless — attaches MirrorCorrectProcessor to the local camera track the
// moment it's published, and re-attaches on every republish (switch
// camera, mute/unmute cycle, reconnect). Covers every setCameraEnabled()
// call site in the app from this single place, so nothing else needs to
// change. A ref guards against double-processing the same MediaStreamTrack
// instance (setProcessor is otherwise idempotent-unsafe to call twice on
// the same track back-to-back).
export const CameraUnmirrorEngine = () => {
  const room = useRoomContext();
  const processedTrackId = useRef<string | null>(null);

  useEffect(() => {
    if (!room) return;

    const attach = async (track: any) => {
      if (!track || track.source !== Track.Source.Camera) return;
      const mst: MediaStreamTrack | undefined = track.mediaStreamTrack;
      if (!mst || processedTrackId.current === mst.id) return;
      processedTrackId.current = mst.id;
      try {
        await track.setProcessor(new MirrorCorrectProcessor());
      } catch (e) {
        console.warn("[CameraUnmirrorEngine] failed to attach processor:", e);
      }
    };

    const onPublished = (publication: any) => {
      if (publication?.source === Track.Source.Camera && publication.track) {
        attach(publication.track);
      }
    };

    // Cover a camera that was already on before this component mounted
    // (e.g. lobby → live transition).
    const existing = room.localParticipant?.getTrackPublication?.(Track.Source.Camera);
    if (existing?.track) attach(existing.track);

    room.on(RoomEvent.LocalTrackPublished, onPublished);
    return () => { room.off(RoomEvent.LocalTrackPublished, onPublished); };
  }, [room]);

  return null;
};

export const AdminMuteListener = ({ isPrivileged }: { isPrivileged: boolean }) => {
  const room = useRoomContext();
  useEffect(() => {
    if (isPrivileged) return;
    const h = (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        const myIdentity = room.localParticipant.identity;
        if (msg.type === "admin_mute_all") {
          queueMediaOp(room, () => room.localParticipant.setMicrophoneEnabled(false)).catch(() => {});
          toast({ title: "🔇 Muted by teacher" });
        }
        if (msg.type === "force_mute" && (!msg.target || msg.target === myIdentity)) {
          queueMediaOp(room, () => room.localParticipant.setMicrophoneEnabled(false)).catch(() => {});
          toast({ title: "🔇 Your mic was muted by the teacher" });
        }
        if (msg.type === "force_unmute" && (!msg.target || msg.target === myIdentity)) {
          queueMediaOp(room, () => room.localParticipant.setMicrophoneEnabled(true)).catch(() => {});
          toast({ title: "🎤 Your mic was unmuted by the teacher" });
        }
        if (msg.type === "force_cam_off" && (!msg.target || msg.target === myIdentity)) {
          queueMediaOp(room, () => room.localParticipant.setCameraEnabled(false)).catch(() => {});
          toast({ title: "📷 Your camera was turned off by the teacher" });
        }
      } catch {}
    };
    room.on(RoomEvent.DataReceived, h);
    return () => { room.off(RoomEvent.DataReceived, h); };
  }, [room, isPrivileged]);
  return null;
};

// ── Waiting-room banner (host side) ──────────────────────────────────────
// A blocked student trying to rejoin no longer gets a flat rejection —
// livekit-token now flags their class_participants row (join_request_status
// ='pending') instead. This banner realtime-subscribes to that same table
// for THIS session, and shows a prompt for every pending request so the
// host doesn't have to go digging in the Participants panel to notice
// someone is trying to get back in.
export const JoinRequestBanner=({sessionId,isPrivileged}:{sessionId:string|null;isPrivileged:boolean})=>{
  const[requests,setRequests]=useState<any[]>([]);
  const[busyId,setBusyId]=useState<string|null>(null);

  useEffect(()=>{
    if(!sessionId||!isPrivileged)return;
    let cancelled=false;
    const load=async()=>{
      const{data}=await supabase.from("class_participants")
        .select("id, student_id, join_requested_at, profiles!inner(full_name)")
        .eq("session_id",sessionId).eq("join_request_status","pending")
        .order("join_requested_at",{ascending:false});
      if(!cancelled)setRequests(data||[]);
    };
    load();
    const ch=supabase.channel(`join-requests-${sessionId}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"class_participants",filter:`session_id=eq.${sessionId}`},load)
      .subscribe();
    return()=>{cancelled=true;supabase.removeChannel(ch);};
  },[sessionId,isPrivileged]);

  if(!isPrivileged||requests.length===0)return null;

  const respond=async(row:any,action:"admit"|"deny")=>{
    setBusyId(row.id);
    try{
      const{data,error}=await supabase.functions.invoke("moderate-participant",{
        body:{session_id:sessionId,student_id:row.student_id,action},
      });
      if(error||data?.error)throw new Error(data?.error||error?.message);
      setRequests(prev=>prev.filter(r=>r.id!==row.id));
      toast({title:action==="admit"?`✅ Admitted ${row.profiles?.full_name||"student"}`:`Denied ${row.profiles?.full_name||"student"}'s request`});
    }catch(e:any){
      toast({title:"Action failed",description:e?.message,variant:"destructive"});
    }finally{
      setBusyId(null);
    }
  };

  return(
    <div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",zIndex:9600,display:"flex",flexDirection:"column",gap:6,maxWidth:"92vw"}}>
      {requests.map(row=>(
        <div key={row.id} style={{
          display:"flex",alignItems:"center",gap:12,
          background:"rgba(20,20,22,.92)",backdropFilter:"blur(10px)",
          border:"1px solid rgba(255,255,255,.12)",borderRadius:12,
          padding:"10px 14px",boxShadow:"0 8px 24px rgba(0,0,0,.4)",
        }}>
          <UserCheck style={{width:16,height:16,color:"#facc15",flexShrink:0}}/>
          <span style={{color:"#fff",fontSize:13,fontFamily:"system-ui,sans-serif",whiteSpace:"nowrap"}}>
            <b>{row.profiles?.full_name||"A student"}</b> wants to rejoin the call
          </span>
          <Button size="sm" disabled={busyId===row.id} onClick={()=>respond(row,"admit")} style={{height:28,padding:"0 10px"}}>Admit</Button>
          <Button size="sm" variant="outline" disabled={busyId===row.id} onClick={()=>respond(row,"deny")} style={{height:28,padding:"0 10px"}}>Deny</Button>
        </div>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// VolumeBooster — routes every remote audio track through a Web Audio pipeline:
//   MediaStreamSource(s) → GainNode (2.2×) → DynamicsCompressor → ONE real <audio> element
//
// Why this exists:
//   1. LiveKit publishes at 64 kbps; a GainNode amplifies every remote voice
//      without clipping (2.2× is the sweet spot — louder without distortion).
//   2. DynamicsCompressor (4:1, wide knee) auto-levels loud and soft voices so
//      everyone is consistently audible without the "pumping" crackle that
//      aggressive ratios (12:1) produce on poor networks.
//   3. We deliberately SKIP the local participant so you never hear yourself.
//   4. Every remote track gets its own source node feeding the SAME gain node,
//      so 2-3 people can speak at once with zero interference — Web Audio
//      mixes them natively into one signal.
//
//   5. FIX — "I hear myself" echo + "2-3 people talking causes noise/garble":
//      The pipeline used to end at `ac.destination`, and — separately — every
//      remote track also got its own individual <audio> element (muted once
//      Web Audio took over, unmuted as a fallback otherwise). Two problems
//      followed from that:
//        a) `ac.destination` sends audio straight to the OS output WITHOUT
//           going through a real HTML media element. Chrome/Android's
//           built-in echo canceller (echoCancellation: true on the mic
//           constraints) reliably picks up its playback reference from real
//           <audio>/<video> elements — routing straight to ac.destination is
//           a known way to make the browser's AEC blind to what's actually
//           being played, which is exactly what caused mic self-echo,
//           especially over a phone's built-in speaker (no headphones).
//        b) Running N separate <audio> elements (or a mix of muted-element +
//           web-audio-node per remote participant) plays overlapping copies
//           of the mixed signal through slightly different output paths /
//           latencies at once → comb-filtering ("metallic"/garbled sound)
//           exactly when 2-3 people spoke simultaneously.
//      Fix: mix every remote source into ONE MediaStreamAudioDestinationNode,
//      and play THAT through exactly one real, unmuted <audio> element. There
//      is now only one thing ever hitting the speaker, so the browser's AEC
//      has a single clean reference to cancel against, and there's no
//      possibility of two overlapping playback paths causing comb-filtering.
// ═══════════════════════════════════════════════════════════════════════════════
// Base amplification factor for VolumeBooster before the user's adjustable
// audioBoost multiplier (Settings → Audio → Volume Boost) is applied.
export const BASE_GAIN = 2.2;

export const VolumeBooster = () => {
  const room = useRoomContext();
  const { audioBoost } = useLiveClass(); // 1×–3× user-adjustable multiplier, see Settings → Audio
  const tracks = useTracks([Track.Source.Microphone, Track.Source.ScreenShareAudio], { onlySubscribed: true });

  const acRef        = useRef<AudioContext | null>(null);
  const gainRef      = useRef<GainNode | null>(null);
  const compRef      = useRef<DynamicsCompressorNode | null>(null);
  const destRef      = useRef<MediaStreamAudioDestinationNode | null>(null);
  const outElRef     = useRef<HTMLAudioElement | null>(null);
  // Map trackSid → source node — one per remote participant, all feeding the same gain node.
  const sourcesRef   = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  // Only used in the rare case Web Audio is entirely unavailable (very old browsers).
  const fallbackElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const webAudioOkRef  = useRef<boolean>(true);

  const tryResumeAC = useCallback(() => {
    const ac = acRef.current;
    if (!ac || ac.state !== "suspended") return;
    ac.resume().catch(() => { webAudioOkRef.current = false; });
  }, []);

  // ── 1. Build the Web Audio pipeline once: gain → compressor → single
  //    MediaStreamDestination → single real <audio> element ──────────────────
  useEffect(() => {
    try {
      // Use native sample rate — avoids resampling artifacts on device DAC.
      // Forcing 48000 when the OS DAC is 44100 causes subtle pitch artifacts.
      const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
      acRef.current = ac;

      // Base amplify: 2.2× — loud and clear without clipping distortion.
      // 3.5× was too hot; voices near 0 dBFS would clip audibly.
      // The user-adjustable audioBoost (1×–3×, see Settings → Audio → Volume
      // Boost) multiplies on top of this for classes where remote mics are
      // just naturally quiet — the compressor below still catches any peaks.
      const gain = ac.createGain();
      gain.gain.value = BASE_GAIN * audioBoost;
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

      // Single mix-down destination — every remote participant's source node
      // connects to `gain` above, so this destination always carries the
      // FULL mix of everyone currently talking, correctly summed by Web Audio.
      const dest = ac.createMediaStreamDestination();
      destRef.current = dest;

      // Pipeline: source(s) → gain → compressor → single destination
      gain.connect(comp);
      comp.connect(dest);

      // The ONE real <audio> element for the whole call. This is what the
      // browser's echo canceller uses as its playback reference — a single
      // unmuted media element is the reliable pattern across Chrome/Android/
      // iOS, unlike routing straight to ac.destination or running several
      // elements in parallel (see the comment block above this component).
      const el = document.createElement("audio");
      el.srcObject = dest.stream;
      el.autoplay  = true;
      el.muted     = false;
      el.volume    = 1.0;
      try { (el as any).audioPlaybackHint = "playback"; } catch {}
      el.style.display = "none";
      document.body.appendChild(el);
      el.play().catch(() => {});
      outElRef.current = el;
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
      try { outElRef.current?.pause(); outElRef.current?.remove(); } catch {}
      acRef.current?.close().catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Live-update gain when the user changes the boost slider mid-call ────────
  // Deliberately separate from the pipeline-creation effect above (which only
  // runs once) so adjusting Settings → Audio → Volume Boost takes effect
  // immediately without tearing down/rebuilding the whole Web Audio graph.
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = BASE_GAIN * audioBoost;
  }, [audioBoost]);

  // ── 2. Connect / disconnect per-participant source nodes as people join or
  //    leave / start or stop talking — all feed into the SAME gain node, so
  //    Web Audio mixes concurrent speakers natively with zero interference. ──
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

      if (ac && gain && webAudioOkRef.current) {
        if (!sourcesRef.current.has(sid)) {
          try {
            const ms = new MediaStream([pub.track.mediaStreamTrack]);
            const source = ac.createMediaStreamSource(ms);
            source.connect(gain);
            sourcesRef.current.set(sid, source);
          } catch {}
        }
      } else if (!fallbackElsRef.current.has(sid)) {
        // Extremely rare: Web Audio unavailable entirely. Fall back to a
        // single element per track — not ideal (no shared AEC reference,
        // no gain boost) but keeps audio audible rather than silent.
        const ms = new MediaStream([pub.track.mediaStreamTrack]);
        const el = document.createElement("audio");
        el.srcObject = ms;
        el.autoplay  = true;
        el.muted     = false;
        el.volume    = 1.0;
        try { (el as any).audioPlaybackHint = "playback"; } catch {}
        el.style.display = "none";
        document.body.appendChild(el);
        el.play().catch(() => {});
        fallbackElsRef.current.set(sid, el);
      }
    }

    // Disconnect/remove tracks that are no longer subscribed
    for (const [sid, source] of sourcesRef.current) {
      if (!activeIds.has(sid)) {
        try { source.disconnect(); } catch {}
        sourcesRef.current.delete(sid);
      }
    }
    for (const [sid, el] of fallbackElsRef.current) {
      if (!activeIds.has(sid)) {
        try { el.pause(); el.srcObject = null; el.remove(); } catch {}
        fallbackElsRef.current.delete(sid);
      }
    }
  }, [tracks]);

  // ── 3. Full cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      for (const source of sourcesRef.current.values()) {
        try { source.disconnect(); } catch {}
      }
      sourcesRef.current.clear();
      for (const el of fallbackElsRef.current.values()) {
        try { el.pause(); el.srcObject = null; el.remove(); } catch {}
      }
      fallbackElsRef.current.clear();
    };
  }, []);

  return null; // pure audio processing — no visible UI
};

export const MediaAutoPublish = ({ lobbyMic = false, lobbyCam = false, isFirstJoin = true }: { lobbyMic?: boolean; lobbyCam?: boolean; isFirstJoin?: boolean }) => {
  const room = useRoomContext();
  // FIX BUG 5: Capture the latest lobby values in a ref so the async effect always
  // reads the current state even if React batches the prop update after mount.
  // The empty dependency array is intentional — we only want this to run once on
  // join, but we read from the ref (not the closure) to get fresh values.
  const optsRef = useRef({ lobbyMic, lobbyCam });
  optsRef.current = { lobbyMic, lobbyCam }; // keep ref fresh every render

  // BUG FIX — "my camera/mic turns itself back on/off with no interaction":
  // <LiveKitRoom key={roomKey}> is remounted on every reconnect (network
  // blip → new token → fresh room), which remounts THIS component too. Its
  // effect used to unconditionally re-apply the LOBBY choice on every mount
  // — including reconnects that happen minutes into a class, long after the
  // student manually toggled mic/camera. Net effect: any silent reconnect
  // reverted mic/cam to whatever they were in the pre-join lobby, undoing
  // whatever the student changed since joining.
  //
  // FIX ("lobby mic/cam choice doesn't reflect in class" — students, teachers,
  // and admins alike): this used to read `hasConnected` straight from
  // LiveClassContext to tell first-join apart from reconnect. But the caller
  // (ClassroomView.connect()) sets that context flag true in the very same
  // synchronous batch that mounts this component for the first time, so by
  // the time this ever rendered, hasConnected already read true — every
  // first join looked like a reconnect and the lobby's mic/cam choice was
  // silently discarded in favor of the (still-default, OFF) last-known
  // state. `isFirstJoin` is now passed down explicitly from a ref that
  // ClassroomView freezes BEFORE that state batch fires, so it reflects the
  // truth at connect-time instead of the post-batch value.
  //   - first-ever mount (isFirstJoin === true): apply the lobby choice.
  //   - any later remount (isFirstJoin === false, i.e. a reconnect):
  //     re-apply the user's LAST KNOWN toggle state (camEnabled/micEnabled
  //     from context, kept fresh by RoomToContextBridge) instead of the
  //     stale lobby snapshot — a reconnect restores what the student
  //     actually had a moment ago, not what they had before ever joining.
  const { micEnabled, camEnabled } = useLiveClass();
  const lastKnownRef = useRef({ micEnabled, camEnabled });
  lastKnownRef.current = { micEnabled, camEnabled };

  useEffect(() => {
    let cancelled = false;
    const isReconnect = !isFirstJoin; // true only on remounts after the first join
    const init = async () => {
      // Slightly longer delay so LiveKit finishes its own track setup first
      await new Promise(r => setTimeout(r, 450));
      if (cancelled) return;
      try {
        const lp = room.localParticipant;
        const { mic, cam } = isReconnect
          ? { mic: lastKnownRef.current.micEnabled, cam: lastKnownRef.current.camEnabled }
          : { mic: optsRef.current.lobbyMic,        cam: optsRef.current.lobbyCam };
        if (lp.isMicrophoneEnabled !== mic) await queueMediaOp(room, () => lp.setMicrophoneEnabled(mic));
        if (lp.isCameraEnabled     !== cam) await queueMediaOp(room, () => lp.setCameraEnabled(cam));
      } catch {}
    };
    init();
    return () => { cancelled = true; };
    // Deliberately runs once per mount (i.e. once per reconnect remount too) —
    // `hasConnected` at mount time is what decides lobby-vs-last-known, so it
    // must NOT be a reactive dependency here (that would re-run mid-session).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

/* ══ ROOM DATA LISTENER ══ */
export const RoomDataListener = ({ onWbOpen,onWbClose,strokesBuffer,onMatOpen,onMatClose,onWbAllowWrite,onRecAllowed,onEmojiReact,onGroupRecite,onHandRaise,onAdminMuteAll,onClassEnded,onForceAudioOnly,roomRef }:any) => {
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
        // BUG FIX: Whiteboard broadcasts every live update as "wb_elements"
        // (see broadcast() calls throughout the Whiteboard component) — the
        // "wb_strokes" type it also listens for is explicitly legacy/"compat"
        // and is never actually sent by the current whiteboard. This buffer
        // only ever caught the dead legacy type, so it was permanently
        // stale — it's the fallback seed used when a student's own Supabase
        // fetch fails right as their whiteboard first opens, and that
        // fallback silently never worked.
        if(msg.type==="wb_elements")      strokesBuffer.current=msg.elements;
        if(msg.type==="wb_strokes")       strokesBuffer.current=msg.strokes; // legacy compat
        if(msg.type==="wb_clear")         strokesBuffer.current=[];
        if(msg.type==="mat_open")         onMatOpen?.(msg.material);
        if(msg.type==="mat_close")        onMatClose?.();
        if(msg.type==="wb_allow_write")   onWbAllowWrite?.(msg.allow);
        if(msg.type==="rec_allowed")      onRecAllowed?.(msg.allow);
        if(msg.type==="emoji_react")      onEmojiReact?.(msg.emoji, msg.sender);
        if(msg.type==="group_recite")     onGroupRecite?.(msg.active);
        if(msg.type==="hand_raise")       onHandRaise?.(msg.identity||participant?.identity, msg.name, msg.raised);
        if(msg.type==="admin_mute_all")   onAdminMuteAll?.();
        if(msg.type==="force_audio_only") onForceAudioOnly?.(msg.active);
        if(msg.type==="class_ended")      onClassEnded?.();
      } catch {}
    };
    room.on(RoomEvent.DataReceived,h);
    return ()=>{ room.off(RoomEvent.DataReceived,h); if(roomRef) roomRef.current=null; };
  },[room]);
  return null;
};

/* ══ FLOATING EMOJI LAYER ══ */
export const FloatingEmojiLayer=({emojis}:{emojis:FloatingEmoji[]})=>(
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
export const RaisedHandsOverlay=({hands}:{hands:RaisedHand[]})=>{
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
export const GroupRecitePermDialog=({onAccept,onDecline}:{onAccept:()=>void;onDecline:()=>void})=>createPortal(
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
export const LAYOUT_OPTIONS:{mode:LayoutMode;icon:any;label:string}[]=[
  {mode:"grid",      icon:LayoutGrid,    label:"Grid"},
  {mode:"spotlight", icon:Maximize2,     label:"Spotlight"},
  {mode:"horizontal",icon:AlignJustify,  label:"Side by side"},
  {mode:"vertical",  icon:Columns,       label:"Stacked"},
  {mode:"focus",     icon:Rows,          label:"Focus"},
];
export const LayoutSwitcher=({layout,onChange}:{layout:LayoutMode;onChange:(m:LayoutMode)=>void})=>{
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
export const MicKeepAlive = ({ micWasEnabled }: { micWasEnabled: boolean }) => {
  const room = useRoomContext();
  const micWasEnabledRef = useRef(micWasEnabled);
  micWasEnabledRef.current = micWasEnabled;

  // Guard against overlapping republish attempts (heartbeat + track event
  // both firing close together).
  const repairingRef = useRef(false);

  useEffect(() => {
    const lp = () => room?.localParticipant;

    // The actual repair routine — republishes the mic track if it's the
    // wrong state. Runs from BOTH the heartbeat and the visibility/track
    // event listeners, and does NOT gate on document.visibilityState —
    // that was the bug: a mic that dies while backgrounded needs fixing
    // while still backgrounded, not only when the user returns.
    const repairMic = async () => {
      if (!micWasEnabledRef.current) return; // user had mic off — nothing to keep alive
      if (repairingRef.current) return;
      const p = lp();
      if (!p) return;

      const micPub = p.getTrackPublication(Track.Source.Microphone);
      const track  = micPub?.track?.mediaStreamTrack;
      const dead   = !p.isMicrophoneEnabled
        || !track
        || track.readyState === "ended"
        || track.muted === true;

      if (!dead) return;

      repairingRef.current = true;
      try {
        // Full cycle (off → on) forces LiveKit to grab a fresh getUserMedia
        // track rather than trying to resume a dead one, which is what
        // actually recovers audio after Android suspends/kills the capture.
        // Queued as a single op so this whole off→wait→on cycle can't be
        // interleaved with some other component's mic/cam call mid-cycle.
        await queueMediaOp(room, async () => {
          await p.setMicrophoneEnabled(false);
          await new Promise(r => setTimeout(r, 150));
          await p.setMicrophoneEnabled(true);
        });
      } catch {
        // getUserMedia can legitimately fail while the tab is fully
        // suspended (screen truly locked, no JS running at all) — the
        // heartbeat below will retry on the next tick or on resume.
      } finally {
        repairingRef.current = false;
      }
    };

    // Heartbeat — runs continuously regardless of visibility, so a mic that
    // dies mid-background gets caught within ~8s instead of only on return.
    // Browsers do throttle background timers, but this is still far better
    // than "do nothing until visible" — it fires whenever the JS thread does
    // get a tick (which the audio-element/WakeLock keep-alive is there to
    // maximize the odds of).
    const heartbeat = setInterval(repairMic, 8_000);

    // Immediate repair attempts on any signal that we might be waking up.
    const onWake = () => { repairMic(); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("pageshow", onWake);
    document.addEventListener("resume", onWake as EventListener); // Capacitor, harmless no-op on web

    // Track-level events fire the instant the browser/OS kills the mic
    // capture, which is faster than waiting for the next heartbeat tick.
    let unbindTrackEvents: (() => void) | null = null;
    const bindTrackEvents = () => {
      const p = lp();
      const track = p?.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
      if (!track) return;
      const onEnded = () => repairMic();
      const onMute  = () => repairMic();
      track.addEventListener("ended", onEnded);
      track.addEventListener("mute",  onMute);
      unbindTrackEvents = () => {
        track.removeEventListener("ended", onEnded);
        track.removeEventListener("mute",  onMute);
      };
    };
    bindTrackEvents();
    // Re-bind whenever the published track changes (e.g. after a repair cycle
    // swaps in a new MediaStreamTrack).
    const onLocalTrackPublished = () => { unbindTrackEvents?.(); bindTrackEvents(); };
    room?.on(RoomEvent.LocalTrackPublished, onLocalTrackPublished);

    return () => {
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("pageshow", onWake);
      document.removeEventListener("resume", onWake as EventListener);
      unbindTrackEvents?.();
      room?.off(RoomEvent.LocalTrackPublished, onLocalTrackPublished);
    };
  }, [room]);

  return null;
};


/* ══ MIC KEEP-ALIVE — CONTEXT-AWARE WRAPPER ══
   MicKeepAlive takes a static boolean snapshot (micWasEnabled) but the mic
   state changes during the call. This wrapper reads the live micEnabled value
   from LiveClassContext on every render so the keep-alive always has current state.
   Usage: <MicKeepAliveFromContext /> — replaces <MicKeepAlive micWasEnabled={lobbyMic}/> */
export const MicKeepAliveFromContext = () => {
  const { micEnabled } = useLiveClass();
  return <MicKeepAlive micWasEnabled={micEnabled} />;
};

export const GroupReciteAutoMic=({active,isPrivileged}:{active:boolean;isPrivileged:boolean})=>{
  const room=useRoomContext();
  // BUG FIX ("no one can hear anyone in the classroom", GuestClassroom has no
  // equivalent of this component at all — which is exactly why it "works well"
  // there): the !active branch used to fire unconditionally, including on this
  // component's very FIRST mount. `active` (groupRecite) starts false by
  // default, so the instant ANY non-privileged participant joined class, this
  // effect ran once with active=false and immediately force-disabled their
  // microphone — silently undoing whatever MediaAutoPublish had just enabled
  // from their lobby choice. Every student's mic was being killed within
  // ~450ms of joining, every single class, every single time (and again on
  // every reconnect, since a new <LiveKitRoom> remounts this component too).
  // wasActiveRef only becomes true once group recite has genuinely been
  // switched ON for this component instance, so the mute branch below can now
  // only fire on a real ON→OFF transition — never on mount/reconnect.
  const wasActiveRef=useRef(false);
  useEffect(()=>{
    if(!room?.localParticipant)return;
    if(active){
      wasActiveRef.current=true;
      queueMediaOp(room, () => room.localParticipant.setMicrophoneEnabled(true)).catch(()=>{});
      return;
    }
    if(!isPrivileged&&wasActiveRef.current){
      wasActiveRef.current=false;
      queueMediaOp(room, () => room.localParticipant.setMicrophoneEnabled(false)).catch(()=>{});
    }
  },[active,isPrivileged,room]);
  return null;
};


/* ══════════════════════════════════════════════════════════════════════
   WHITEBOARD — full-featured: pen · highlighter · shapes · text · image
   undo/redo · zoom/pan · grid · export · colour picker · line thickness
   Real-time broadcast via LiveKit DataChannel + Supabase persistence
   ══════════════════════════════════════════════════════════════════════ */
export type WBTool = "pen"|"highlighter"|"eraser"|"line"|"rect"|"circle"|"arrow"|"text"|"pan";
export interface WBStroke {
  type:"stroke"; color:string; lineWidth:number; points:{x:number;y:number}[];
  dash?:number[]; opacity?:number;
}
export interface WBShape {
  type:"rect"|"circle"|"line"|"arrow";
  color:string; lineWidth:number; fill?:string;
  x1:number; y1:number; x2:number; y2:number;
}
export interface WBText {
  type:"text"; color:string; fontSize:number; fontFamily:string;
  x:number; y:number; text:string;
}
export interface WBImage {
  type:"image"; dataUrl:string; x:number; y:number; w:number; h:number;
}
export type WBElement = WBStroke|WBShape|WBText|WBImage;

export function drawElement(ctx:CanvasRenderingContext2D, el:WBElement){
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
export const canvasCache=new Map<string,HTMLCanvasElement>();

export const Whiteboard = ({room,onClose,isTeacher,initialStrokes,subjectId,canStudentWrite}:any) => {
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
export const WhiteboardBridge=({onClose,isTeacher,initialStrokes,subjectId,canStudentWrite}:any)=>{const room=useRoomContext();return<Whiteboard room={room} onClose={onClose} isTeacher={isTeacher} initialStrokes={initialStrokes} subjectId={subjectId} canStudentWrite={canStudentWrite}/>;};

/* ══ MATERIAL VIEWER ══ */
/* ══ MATERIAL PICKER ══ */
export const MaterialPicker=({subjectId,onShare,onClose}:any)=>{
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
export const MAT_TYPE_ICON: Record<string, string> = {
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
export function toMaterialEmbedUrl(url: string): {
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
export const RESUME_KEY=(id:string)=>`mat-resume-${id}`;
export function saveResume(id:string,data:{time?:number;page?:number}){
  try{localStorage.setItem(RESUME_KEY(id),JSON.stringify({...data,at:Date.now()}));}catch{}
}
export function loadResume(id:string):{time?:number;page?:number}|null{
  try{const raw=localStorage.getItem(RESUME_KEY(id));if(!raw)return null;return JSON.parse(raw);}
  catch{return null;}
}

/* ══ IN-CLASS MATERIAL VIEWER ══
   Renders INSIDE the content area (position:absolute) so the footer and top bar
   always remain visible. Has an opt-in fullscreen button that expands to the full
   viewport when needed. Saves / restores video time and PDF page automatically.   */
export const InClassMaterialViewer=({material,onClose,isTeacher=false,onMinimize,fromPanel=false}:any)=>{
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
    <div style={{...overlayStyle,background:"#0f1117",display:"flex",flexDirection:"column"}}>
      {/* Viewer header */}
      <div style={{height:46,background:"#2d2e30",display:"flex",alignItems:"center",padding:"0 10px",gap:8,flexShrink:0,borderBottom:"1px solid rgba(255,255,255,.08)"}}>
        {/* Minimize to pip */}
        {onMinimize&&<button onClick={onMinimize} title="Minimize"
          style={{width:30,height:30,borderRadius:8,background:"rgba(255,255,255,.1)",border:"none",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <ChevronDown style={{width:13,height:13}}/>
        </button>}
        <span style={{fontSize:15,flexShrink:0}}>{MAT_TYPE_ICON[material.material_type||"document"]||"📄"}</span>
        <span style={{flex:1,fontSize:13,fontWeight:600,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{material.title||"Material"}</span>
        {resumeBadge&&(
          <span style={{fontSize:10,color:"rgba(255,255,255,.5)",background:"rgba(255,255,255,.1)",borderRadius:8,padding:"2px 7px",flexShrink:0}}>
            {resume?.time?`▶ ${Math.floor((resume.time||0)/60)}m${Math.floor((resume.time||0)%60)}s`:`p.${resume?.page}`} resumed
          </span>
        )}
        {!isTeacher&&!fromPanel&&<span style={{fontSize:10,color:"rgba(255,255,255,.4)",flexShrink:0}}>Shared by teacher</span>}
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
export const SURAH_PAGE:Record<number,number>={
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
export const PAGE_SURAH:Record<number,number>=(()=>{
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

export type QuranMode="quran"|"translation"|"tafseer";

/* ══ FULL QURAN READER — Page-by-page · Translation · Tafseer Ibn Katheer ══ */
export const SURAHS_LIST = [
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

export const QURAN_PAGE_KEY="inclass_quran_page_v1";
export const InClassQuranReader=({onClose}:any)=>{
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

export const MAT_UPLOAD_BUCKET="subject-materials";
export const detectMaterialType=(file:File):string=>{
  const mime=file.type.toLowerCase();const ext=file.name.split(".").pop()?.toLowerCase()||"";
  if(mime.includes("pdf")||ext==="pdf")return"PDF";
  if(mime.startsWith("video/")||["mp4","webm","mov","avi","m4v","mkv"].includes(ext))return"Video";
  if(mime.startsWith("audio/")||["mp3","wav","ogg","m4a","aac","flac","opus"].includes(ext))return"Audio";
  if(mime.startsWith("image/")||["jpg","jpeg","png","gif","webp","svg","heic"].includes(ext))return"Image";
  return"Document";
};

export const SubjectMaterialsPanel=({subjectId,subject,sessionId,onClose,canStudentRec,isPrivileged,stuRec,onToggleStuRecord,onOpenMatsChange,panelRef}:any)=>{
  const{user}=useAuth();
  const[mats,setMats]=useState<any[]>([]);
  const[busy,setBusy]=useState(true);
  // ── Multiple materials can be open at once; each can be minimized
  //    independently. openMats = every material currently open (incl.
  //    minimized ones so their position/state is preserved).
  //    activeMatId = the one currently shown full-screen (null = all minimized).
  const[openMats,setOpenMats]=useState<any[]>([]);
  const[activeMatId,setActiveMatId]=useState<string|null>(null);
  const[quranOpen,setQuranOpen]=useState(false);
  // listVisible: whether the sliding list panel is shown
  // (panel stays mounted even when list is hidden, so PiP survives)
  const[listVisible,setListVisible]=useState(true);
  // forceList: when true, show the material list even if openMats.length>0
  // This lets the user browse while a PiP is floating
  const[forceList,setForceList]=useState(false);

  // Expose showList() so parent can imperatively bring list back into view
  useEffect(()=>{
    if(panelRef)panelRef.current={showList:()=>{setListVisible(true);setForceList(true);}};
  },[panelRef]);

  // Notify parent whenever open materials change so it can keep us mounted
  useEffect(()=>{
    onOpenMatsChange?.(openMats.length>0);
    // When all materials are closed, bring the list back into view automatically
    if(openMats.length===0)setListVisible(true);
  },[openMats.length]);
  const[pipListOpen,setPipListOpen]=useState(false);
  // ── Share-with-class composer (teacher/admin only) ──────────────────────
  const[composerOpen,setComposerOpen]=useState(false);
  const[composerMode,setComposerMode]=useState<"text"|"file">("text");
  const[cTitle,setCTitle]=useState("");
  const[cBody,setCBody]=useState("");
  const[cFile,setCFile]=useState<File|null>(null);
  const[cPosting,setCPosting]=useState(false);
  const[cVisibility,setCVisibility]=useState<"all"|"staff">("all");
  // ── Assignments section (teacher/admin manage, students view/submit) ────
  const[assignmentsOpen,setAssignmentsOpen]=useState(false);
  const[cError,setCError]=useState("");
  const fileInputRef=useRef<HTMLInputElement>(null);
  const editFileRef=useRef<HTMLInputElement>(null);
  // Draggable pip position
  const[pipPos,setPipPos]=useState({x:20,y:120});
  const dragging=useRef(false);
  const dragStart=useRef({px:0,py:0,ox:0,oy:0});
  // ── Edit / delete state ─────────────────────────────────────────────────
  const[editingId,setEditingId]=useState<string|null>(null);
  const[editTitle,setEditTitle]=useState("");
  const[editBody,setEditBody]=useState("");
  const[editSaving,setEditSaving]=useState(false);
  const[editError,setEditError]=useState("");
  const[editReplaceFile,setEditReplaceFile]=useState<File|null>(null);
  const[deletingId,setDeletingId]=useState<string|null>(null);
  const[confirmDeleteId,setConfirmDeleteId]=useState<string|null>(null);

  const reloadMats=()=>{
    supabase.from("subject_materials" as any).select("*").eq("subject_id",subjectId).order("created_at",{ascending:false})
      .then(({data})=>{
        setMats(data||[]);setBusy(false);
        // Prewarm any PDFs not already cached — covers materials added/edited
        // after the initial eager prewarm effect (in the parent) already ran.
        const pdfs=(data||[]).filter((m:any)=>m.file_url&&(m.material_type==="PDF"||m.material_type==="document"||(m.file_url||"").toLowerCase().split("?")[0].endsWith(".pdf")));
        pdfs.forEach((m:any,i:number)=>setTimeout(()=>prewarmPDF(m.file_url),i*400));
      });
  };

  useEffect(()=>{reloadMats();},[subjectId]);

  // ── Realtime — without this, a new/edited/deleted material only ever
  //    reflected for the person who made the change (their own reloadMats()
  //    call); everyone else had to leave and rejoin the class to see it.
  //    Subscribing here means every open panel refreshes live instead. ──
  useEffect(()=>{
    if(!subjectId)return;
    const ch=supabase.channel(`subject-materials-${subjectId}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"subject_materials",filter:`subject_id=eq.${subjectId}`},
        (payload:any)=>{
          reloadMats();
          // If the material someone currently has open was just removed,
          // don't leave them staring at a broken/stale viewer — close it
          // and tell them plainly what happened instead of a silent failure.
          if(payload.eventType==="DELETE"){
            const deletedId=payload.old?.id;
            if(deletedId){
              setOpenMats(prev=>prev.filter(e=>e.id!==deletedId));
              setActiveMatId(prev=>{
                if(prev===deletedId){
                  toast({title:"This material was removed",description:"The teacher/admin deleted it.",variant:"destructive"});
                  return null;
                }
                return prev;
              });
            }
          }
        }
      ).subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[subjectId]);

  // ── Open edit drawer ────────────────────────────────────────────────────
  const openEdit=(m:any)=>{
    setEditingId(m.id);setEditTitle(m.title||"");setEditBody(m.content||"");
    setEditError("");setEditReplaceFile(null);
    if(editFileRef.current)editFileRef.current.value="";
  };

  // ── Save edited material ────────────────────────────────────────────────
  const handleEditSave=async()=>{
    if(!editingId)return;
    setEditSaving(true);setEditError("");
    try{
      const mat=mats.find(m=>m.id===editingId);
      let updates:any={title:editTitle.trim()||mat?.title,content:editBody.trim()||null};
      if(editReplaceFile){
        const ext=editReplaceFile.name.split(".").pop()||"bin";
        const path=`materials/${subjectId}/${Date.now()}-edit.${ext}`;
        const{error:upErr}=await supabase.storage.from(MAT_UPLOAD_BUCKET).upload(path,editReplaceFile,{cacheControl:"3600",upsert:false,contentType:editReplaceFile.type||"application/octet-stream"});
        if(upErr)throw new Error(upErr.message);
        const{data:pub}=supabase.storage.from(MAT_UPLOAD_BUCKET).getPublicUrl(path);
        updates.file_url=pub.publicUrl;updates.file_type=editReplaceFile.type||null;
        updates.file_size=editReplaceFile.size;updates.material_type=detectMaterialType(editReplaceFile);
        if(!editTitle.trim())updates.title=editReplaceFile.name.replace(/\.[^.]+$/,"");
      }
      const{error:dbErr}=await supabase.from("subject_materials" as any).update(updates).eq("id",editingId);
      if(dbErr)throw dbErr;
      toast({title:"✅ Material updated"});
      setEditingId(null);reloadMats();
    }catch(e:any){setEditError(e?.message||"Failed to save changes");}
    finally{setEditSaving(false);}
  };

  // ── Delete a material ───────────────────────────────────────────────────
  const handleDelete=async(m:any)=>{
    setDeletingId(m.id);setConfirmDeleteId(null);
    try{
      await supabase.from("subject_materials" as any).delete().eq("id",m.id);
      if(m.file_url){
        const match=m.file_url.match(/\/storage\/v1\/object\/(?:public\/)?([^/?]+)\/(.+?)(\?.*)?$/);
        if(match){const[,bucket,path]=match;supabase.storage.from(bucket).remove([path]).catch(()=>{});}
      }
      setOpenMats(prev=>prev.filter(e=>e.id!==m.id));
      setActiveMatId(prev=>prev===m.id?null:prev);
      toast({title:"🗑️ Material deleted"});reloadMats();
    }catch(e:any){toast({title:"Failed to delete",description:e?.message,variant:"destructive"});}
    finally{setDeletingId(null);}
  };

  const resetComposer=()=>{
    setCTitle("");setCBody("");setCFile(null);setCError("");setCVisibility("all");
    if(fileInputRef.current)fileInputRef.current.value="";
  };

  const handleSharePost=async()=>{
    if(!user)return;
    setCError("");
    if(composerMode==="text"&&!cBody.trim()){setCError("Write something before sharing.");return;}
    if(composerMode==="file"&&!cFile){setCError("Choose a file to upload.");return;}
    if(!cTitle.trim()&&composerMode==="text"){setCError("Give it a short title.");return;}
    setCPosting(true);
    try{
      let fileUrl:string|null=null,fileType:string|null=null,fileSize:number|null=null,materialType="Text",finalTitle=cTitle.trim();
      if(composerMode==="file"&&cFile){
        materialType=detectMaterialType(cFile);
        const ext=cFile.name.split(".").pop()||"bin";
        const path=`materials/${subjectId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
        const{error:upErr}=await supabase.storage.from(MAT_UPLOAD_BUCKET).upload(path,cFile,{cacheControl:"3600",upsert:false,contentType:cFile.type||"application/octet-stream"});
        if(upErr)throw new Error(upErr.message);
        const{data:pub}=supabase.storage.from(MAT_UPLOAD_BUCKET).getPublicUrl(path);
        fileUrl=pub.publicUrl;fileType=cFile.type||null;fileSize=cFile.size;
        if(!finalTitle)finalTitle=cFile.name.replace(/\.[^.]+$/,"");
      }
      const{error:matErr}=await supabase.from("subject_materials" as any).insert({
        subject_id:subjectId,title:finalTitle||"Shared in class",material_type:materialType,
        content:composerMode==="text"?cBody.trim():null,file_url:fileUrl,file_type:fileType,file_size:fileSize,
        uploaded_by:user.id,session_id:sessionId||null,visibility:isPrivileged?cVisibility:"all",
      });
      if(matErr)throw matErr;

      toast({title:cVisibility==="staff"?"✅ Saved to staff notes":"✅ Shared with the class"});
      resetComposer();setComposerOpen(false);reloadMats();
    }catch(e:any){
      setCError(e?.message||"Failed to share. Please try again.");
    }finally{
      setCPosting(false);
    }
  };

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

  // When user closes the list panel while in forceList mode (PiP exists),
  // just hide the list rather than fully unmounting — PiP stays alive
  const handleClose=()=>{
    if(forceList&&openMats.length>0){setListVisible(false);setForceList(false);}
    else onClose();
  };

  // ── Open / restore / close a material (multi-material aware) ──────────────
  const openMaterial=(m:any)=>{
    setOpenMats(prev=>prev.find(e=>e.id===m.id)?prev:[...prev,m]);
    setActiveMatId(m.id);
    setQuranOpen(false);
    setListVisible(true);
    setForceList(false);
  };
  const minimizeActive=()=>{setActiveMatId(null);setListVisible(false);};
  const restoreMaterial=(id:string)=>{setActiveMatId(id);setPipListOpen(false);setListVisible(true);setForceList(false);};
  const closeMaterial=(id:string)=>{
    setOpenMats(prev=>prev.filter(e=>e.id!==id));
    setActiveMatId(prev=>prev===id?null:prev);
  };

  const minimizedMats=openMats.filter(m=>m.id!==activeMatId);
  const showPip=minimizedMats.length>0;

  /* ── Single PiP bubble representing ALL minimized materials ──
     Tap it to expand a compact list; tap an item to restore it.   */
  const renderPip=()=>{
    if(!showPip)return null;
    const topMat=minimizedMats[minimizedMats.length-1];
    const topIcon=MAT_TYPE_ICON[topMat.material_type||"document"]||"📄";
    return(
      <div style={{position:"absolute",left:pipPos.x,top:pipPos.y,zIndex:60,display:"flex",flexDirection:"column",alignItems:"flex-start",gap:8}}>
        {pipListOpen&&(
          <div style={{width:240,maxHeight:300,background:"#202124",borderRadius:14,border:"1px solid rgba(255,255,255,.12)",boxShadow:"0 10px 36px rgba(0,0,0,.5)",overflow:"hidden",display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",borderBottom:"1px solid rgba(255,255,255,.08)",flexShrink:0}}>
              <Layers style={{width:13,height:13,color:"#c9a84c"}}/>
              <span style={{flex:1,fontSize:11,fontWeight:700,color:"#e8eaf0"}}>Minimized ({minimizedMats.length})</span>
              <button onClick={()=>setPipListOpen(false)} style={{background:"rgba(255,255,255,.08)",border:"none",borderRadius:6,width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
                <ChevronDown style={{width:11,height:11,color:"#9ca3af"}}/>
              </button>
            </div>
            <div style={{overflowY:"auto",padding:6,display:"flex",flexDirection:"column",gap:5}}>
              {minimizedMats.map(m=>{
                const ic=MAT_TYPE_ICON[m.material_type||"document"]||"📄";
                return(
                  <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.07)",borderRadius:9,padding:"6px 7px"}}>
                    <button onClick={()=>restoreMaterial(m.id)} style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0,background:"none",border:"none",cursor:"pointer",textAlign:"left" as const,padding:0}}>
                      <span style={{fontSize:15,flexShrink:0}}>{ic}</span>
                      <span style={{fontSize:12,fontWeight:600,color:"#e8eaf0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{m.title||m.name||"Material"}</span>
                    </button>
                    <button onClick={()=>closeMaterial(m.id)} title="Close" style={{background:"rgba(255,255,255,.08)",border:"none",borderRadius:6,width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
                      <X style={{width:10,height:10,color:"#9ca3af"}}/>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div
          onPointerDown={onPipPointerDown}
          onPointerMove={onPipPointerMove}
          onPointerUp={onPipPointerUp}
          onClick={()=>setPipListOpen(o=>!o)}
          style={{
            position:"relative",width:54,height:54,borderRadius:"50%",
            background:"linear-gradient(135deg,#0a7a5e,#1a73e8)",
            boxShadow:"0 4px 20px rgba(0,0,0,.5)",
            display:"flex",alignItems:"center",justifyContent:"center",
            cursor:"grab",userSelect:"none",touchAction:"none",
            border:"2px solid rgba(255,255,255,.2)",
          }}
          title={`${minimizedMats.length} minimized — tap to view`}
        >
          <span style={{fontSize:20}}>{topIcon}</span>
          {minimizedMats.length>1&&(
            <span style={{position:"absolute",top:-4,right:-4,minWidth:18,height:18,borderRadius:9,background:"#C9A84C",color:"#1a1408",fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px",border:"2px solid #202124"}}>
              {minimizedMats.length}
            </span>
          )}
        </div>
      </div>
    );
  };

  /* ── VIEWING THE FULL QURAN ── */
  if(quranOpen){
    return(
      <>
        {renderPip()}
        {listVisible&&<div style={{position:"absolute",inset:0,zIndex:55,background:"#202124",display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"#2d2e30",borderBottom:"1px solid rgba(255,255,255,.08)",flexShrink:0,height:46}}>
            <button onClick={()=>setQuranOpen(false)} style={{background:"rgba(255,255,255,.08)",border:"none",color:"rgba(255,255,255,.7)",borderRadius:8,padding:"4px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontSize:12,fontFamily:"'Google Sans',sans-serif"}}>
              <ChevronLeft style={{width:13,height:13}}/> Back
            </button>
            <span style={{flex:1,fontSize:13,fontWeight:500,color:"#e8eaed",fontFamily:"'Google Sans',sans-serif"}}>Full Quran</span>
            <button onClick={onClose} style={{background:"rgba(255,255,255,.08)",border:"none",color:"rgba(255,255,255,.5)",borderRadius:8,width:30,height:30,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <X style={{width:13,height:13}}/>
            </button>
          </div>
          <div style={{flex:1,overflow:"hidden"}}><InClassQuranReader onClose={()=>setQuranOpen(false)}/></div>
        </div>}
      </>
    );
  }

  /* ── ONE OR MORE MATERIALS OPEN ── */
  if(openMats.length>0 && !forceList){
    return(
      <>
        {renderPip()}
        {/* All open materials stay mounted (so video/audio keep playing);
            only the active one is visible. */}
        {listVisible&&openMats.map(m=>(
          <div key={m.id} style={{position:"absolute",inset:0,zIndex:55,background:"#202124",display:m.id===activeMatId?"flex":"none",flexDirection:"column"}}>
            <InClassMaterialViewer
              material={m}
              onMinimize={minimizeActive}
              onClose={()=>closeMaterial(m.id)}
              fromPanel={true}
            />
          </div>
        ))}
      </>
    );
  }

  /* ── MATERIAL LIST — slides from right, does NOT cover full height ── */
  if(!listVisible){
    // List is hidden but PiP may still be floating — just render PiP
    return <>{renderPip()}</>;
  }
  return(
    <>
    {/* PiP floats above list when user is browsing while materials are minimized */}
    {forceList&&renderPip()}
    <div style={{position:"absolute",inset:0,zIndex:55,background:"rgba(0,0,0,.4)"}} onClick={handleClose}>
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
          <button onClick={handleClose} style={{background:"rgba(255,255,255,.08)",border:"none",color:"rgba(255,255,255,.5)",borderRadius:8,width:30,height:30,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
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

        {/* Share with class / jot a staff-only note — teacher/admin only */}
        {isPrivileged&&(
          <div style={{margin:"10px 10px 0",borderRadius:10,border:"1px solid rgba(201,168,76,.3)",background:"rgba(201,168,76,.06)",overflow:"hidden",flexShrink:0}}>
            <button onClick={()=>setComposerOpen(v=>!v)} style={{width:"100%",padding:"12px 14px",background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:10,textAlign:"left" as const}}>
              <div style={{fontSize:18,flexShrink:0}}>{cVisibility==="staff"?"🔒":"📤"}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:"#f2dfa8",fontFamily:"'Google Sans',sans-serif"}}>{cVisibility==="staff"?"Staff note / material":"Share with class"}</div>
                <div style={{fontSize:10,color:"rgba(255,255,255,.4)"}}>Post a note or upload a file — choose who can see it below</div>
              </div>
              <ChevronDown style={{width:14,height:14,color:"rgba(255,255,255,.4)",transform:composerOpen?"rotate(180deg)":"none",transition:"transform .15s",flexShrink:0}}/>
            </button>
            {composerOpen&&(
              <div style={{padding:"0 14px 14px"}}>
                {/* Visibility toggle */}
                <div style={{display:"flex",gap:6,marginBottom:10}}>
                  {([["all","👥 Students"],["staff","🔒 Staff only"]] as const).map(([v,lb])=>(
                    <button key={v} onClick={()=>setCVisibility(v as "all"|"staff")} style={{
                      flex:1,padding:"7px 0",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",
                      border:`1px solid ${cVisibility===v?"#93c5fd":"rgba(255,255,255,.12)"}`,
                      background:cVisibility===v?"rgba(59,130,246,.18)":"transparent",
                      color:cVisibility===v?"#dbeafe":"rgba(255,255,255,.5)",
                    }}>{lb}</button>
                  ))}
                </div>
                {/* Mode toggle */}
                <div style={{display:"flex",gap:6,marginBottom:10}}>
                  {(["text","file"] as const).map(m=>(
                    <button key={m} onClick={()=>{setComposerMode(m);setCError("");}} style={{
                      flex:1,padding:"7px 0",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",
                      border:`1px solid ${composerMode===m?"#c9a84c":"rgba(255,255,255,.12)"}`,
                      background:composerMode===m?"rgba(201,168,76,.18)":"transparent",
                      color:composerMode===m?"#f2dfa8":"rgba(255,255,255,.5)",
                    }}>{m==="text"?"✏️ Write a note":"📎 Upload a file"}</button>
                  ))}
                </div>
                <input value={cTitle} onChange={e=>setCTitle(e.target.value)} placeholder="Title (e.g. Today's homework)" style={{
                  width:"100%",boxSizing:"border-box" as const,padding:"9px 11px",borderRadius:8,border:"1px solid rgba(255,255,255,.12)",
                  background:"rgba(255,255,255,.05)",color:"#fff",fontSize:12,marginBottom:8,fontFamily:"inherit",
                }}/>
                {composerMode==="text"?(
                  <textarea value={cBody} onChange={e=>setCBody(e.target.value)} rows={4} placeholder="Type the note or instructions here…" style={{
                    width:"100%",boxSizing:"border-box" as const,padding:"9px 11px",borderRadius:8,border:"1px solid rgba(255,255,255,.12)",
                    background:"rgba(255,255,255,.05)",color:"#fff",fontSize:12,marginBottom:8,fontFamily:"inherit",resize:"vertical" as const,
                  }}/>
                ):(
                  <div style={{marginBottom:8}}>
                    <input ref={fileInputRef} type="file" onChange={e=>setCFile(e.target.files?.[0]||null)} style={{
                      width:"100%",fontSize:11,color:"rgba(255,255,255,.6)",
                    }}/>
                    {cFile&&<div style={{fontSize:10,color:"#34d399",marginTop:4}}>Ready: {cFile.name} ({(cFile.size/1024/1024).toFixed(1)}MB)</div>}
                  </div>
                )}
                {cError&&<div style={{fontSize:11,color:"#ef4444",marginBottom:8}}>{cError}</div>}
                <button onClick={handleSharePost} disabled={cPosting} style={{
                  width:"100%",padding:"10px",borderRadius:8,border:"none",cursor:cPosting?"default":"pointer",
                  background:cPosting?"rgba(201,168,76,.3)":"linear-gradient(135deg,#c9a84c,#a8893a)",
                  color:"#1a1408",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                }}>{cPosting?"Saving…":cVisibility==="staff"?"Save (staff only)":"Share with class"}</button>
              </div>
            )}
          </div>
        )}

        {/* Assignments — teacher/admin can create/grade, students view/submit,
            all without leaving the live class. Homework no longer lives inside
            the material composer above; this is the single place for it. */}
        <button onClick={()=>setAssignmentsOpen(true)} style={{
          margin:"10px 10px 0",padding:"12px 14px",borderRadius:10,
          border:"1px solid rgba(59,130,246,.35)",
          background:"rgba(59,130,246,.08)",
          cursor:"pointer",textAlign:"left" as const,display:"flex",alignItems:"center",gap:10,flexShrink:0,
        }}>
          <ClipboardList style={{width:18,height:18,color:"#93c5fd",flexShrink:0}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,color:"#dbeafe",fontFamily:"'Google Sans',sans-serif"}}>Assignments</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,.4)"}}>
              {isPrivileged?"Create, review and grade homework":"View and submit your homework"}
            </div>
          </div>
          <ChevronRight style={{width:13,height:13,color:"#93c5fd",flexShrink:0}}/>
        </button>

        {/* List */}
        <div style={{flex:1,overflowY:"auto",padding:"8px 10px"}}>
          {mats.filter(m=>m.visibility!=="staff").length>0&&<div style={{fontSize:10,color:"rgba(255,255,255,.3)",fontWeight:600,letterSpacing:.6,padding:"8px 2px 6px",fontFamily:"'Google Sans',sans-serif"}}>UPLOADED MATERIALS</div>}
          {busy&&<div style={{display:"flex",justifyContent:"center",padding:32}}><div style={{width:22,height:22,border:`2px solid ${TEAL}`,borderTopColor:"transparent",borderRadius:"50%",animation:"cv-spin .7s linear infinite"}}/></div>}
          {!busy&&mats.length===0&&<div style={{textAlign:"center" as const,padding:"24px 16px",color:"rgba(255,255,255,.3)"}}>
            <div style={{fontSize:30,marginBottom:6}}>📭</div>
            <p style={{fontSize:12,margin:0,fontFamily:"'Google Sans',sans-serif"}}>No materials yet</p>
          </div>}
          {[...mats].sort((a,b)=>(a.visibility==="staff"?1:0)-(b.visibility==="staff"?1:0)).map((m,idx,arr)=>{
            const icon=MAT_TYPE_ICON[m.material_type||"document"]||"📄";
            const resume=loadResume(m.id||"");
            const isDeleting=deletingId===m.id;
            const isEditing=editingId===m.id;
            // Staff-only rows are grouped last — drop a section divider right
            // before the first one. Non-staff users never receive these rows
            // at all (enforced at the database level), so this only ever
            // shows for admin/teacher.
            const showStaffHeader=m.visibility==="staff"&&(idx===0||arr[idx-1].visibility!=="staff");

            return(
              <div key={m.id} style={{marginBottom:6}}>
                {showStaffHeader&&(
                  <div style={{fontSize:10,color:"#93c5fd",fontWeight:700,letterSpacing:.6,padding:"14px 2px 6px",fontFamily:"'Google Sans',sans-serif",display:"flex",alignItems:"center",gap:5}}>
                    🔒 STAFF NOTES — not visible to students
                  </div>
                )}
                {/* ── Edit drawer (slides in inline) ── */}
                {isEditing&&isPrivileged&&(
                  <div style={{background:"rgba(201,168,76,.08)",border:"1px solid rgba(201,168,76,.3)",borderRadius:10,padding:"12px 12px 10px",marginBottom:4}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                      <span style={{fontSize:11,fontWeight:700,color:"#f2dfa8",letterSpacing:.4}}>✏️ EDITING</span>
                      <button onClick={()=>setEditingId(null)} style={{background:"none",border:"none",color:"rgba(255,255,255,.4)",cursor:"pointer",fontSize:15,padding:"0 2px"}}>✕</button>
                    </div>
                    <input
                      value={editTitle} onChange={e=>setEditTitle(e.target.value)}
                      placeholder="Title"
                      style={{width:"100%",boxSizing:"border-box" as const,padding:"8px 10px",borderRadius:7,border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.05)",color:"#fff",fontSize:12,marginBottom:8,fontFamily:"inherit"}}
                    />
                    {/* Show text body editor only for text-type materials */}
                    {(m.material_type==="Text"||m.material_type==="text"||!m.file_url)&&(
                      <textarea
                        value={editBody} onChange={e=>setEditBody(e.target.value)}
                        rows={4} placeholder="Content / note text…"
                        style={{width:"100%",boxSizing:"border-box" as const,padding:"8px 10px",borderRadius:7,border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.05)",color:"#fff",fontSize:12,marginBottom:8,fontFamily:"inherit",resize:"vertical" as const}}
                      />
                    )}
                    {/* File replacement for file-type materials */}
                    {m.file_url&&(
                      <div style={{marginBottom:8}}>
                        <div style={{fontSize:10,color:"rgba(255,255,255,.4)",marginBottom:4}}>Replace file (optional):</div>
                        <input ref={editFileRef} type="file" onChange={e=>setEditReplaceFile(e.target.files?.[0]||null)}
                          style={{fontSize:11,color:"rgba(255,255,255,.5)",width:"100%"}}/>
                        {editReplaceFile&&<div style={{fontSize:10,color:"#34d399",marginTop:3}}>Ready: {editReplaceFile.name}</div>}
                        <div style={{fontSize:10,color:"rgba(255,255,255,.3)",marginTop:3}}>Current: {m.file_url?.split("/").pop()?.split("?")[0]||"file"}</div>
                      </div>
                    )}
                    {editError&&<div style={{fontSize:11,color:"#ef4444",marginBottom:7}}>{editError}</div>}
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={handleEditSave} disabled={editSaving}
                        style={{flex:1,padding:"8px 0",borderRadius:7,border:"none",background:editSaving?"rgba(201,168,76,.3)":"linear-gradient(135deg,#c9a84c,#a8893a)",color:"#1a1408",fontWeight:700,fontSize:12,cursor:editSaving?"default":"pointer"}}>
                        {editSaving?"Saving…":"💾 Save Changes"}
                      </button>
                      <button onClick={()=>setEditingId(null)}
                        style={{padding:"8px 12px",borderRadius:7,border:"1px solid rgba(255,255,255,.12)",background:"transparent",color:"rgba(255,255,255,.5)",fontSize:12,cursor:"pointer"}}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Confirm-delete bar ── */}
                {confirmDeleteId===m.id&&isPrivileged&&(
                  <div style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.35)",borderRadius:10,padding:"10px 12px",marginBottom:4,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" as const}}>
                    <span style={{fontSize:12,color:"#fca5a5",flex:1,minWidth:120}}>Delete "<strong>{m.title||"Untitled"}</strong>"? This cannot be undone.</span>
                    <button onClick={()=>handleDelete(m)}
                      style={{padding:"6px 14px",borderRadius:7,border:"none",background:"#ef4444",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                      {isDeleting?"Deleting…":"Yes, Delete"}
                    </button>
                    <button onClick={()=>setConfirmDeleteId(null)}
                      style={{padding:"6px 10px",borderRadius:7,border:"1px solid rgba(255,255,255,.15)",background:"transparent",color:"rgba(255,255,255,.5)",fontSize:12,cursor:"pointer"}}>
                      Cancel
                    </button>
                  </div>
                )}

                {/* ── Material card row ── */}
                <div style={{
                  display:"flex",alignItems:"center",gap:10,
                  padding:"10px 10px 10px 12px",background:isEditing?"rgba(201,168,76,.06)":"rgba(255,255,255,.04)",
                  border:`1px solid ${isEditing?"rgba(201,168,76,.25)":"rgba(255,255,255,.07)"}`,borderRadius:10,
                }}>
                  <button onClick={()=>openMaterial(m)} style={{display:"flex",alignItems:"center",gap:10,flex:1,background:"none",border:"none",cursor:"pointer",textAlign:"left" as const,minWidth:0}}>
                    <div style={{width:36,height:36,borderRadius:8,background:"rgba(10,124,104,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <p style={{margin:0,fontSize:12,fontWeight:600,color:"#e8eaf0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:"'Google Sans',sans-serif"}}>{m.visibility==="staff"&&"🔒 "}{m.title||m.name||"Untitled"}</p>
                      <p style={{margin:"2px 0 0",fontSize:10,color:"rgba(255,255,255,.35)",textTransform:"capitalize" as const}}>
                        {m.material_type||"file"}
                        {resume?.time&&<span style={{marginLeft:5,color:TEAL}}>▶ {Math.floor((resume.time||0)/60)}m</span>}
                        {resume?.page&&!resume?.time&&<span style={{marginLeft:5,color:TEAL}}>p.{resume.page}</span>}
                      </p>
                    </div>
                    <ChevronRight style={{width:13,height:13,color:"rgba(255,255,255,.25)",flexShrink:0}}/>
                  </button>
                  {/* Edit / delete buttons — teacher/admin only */}
                  {isPrivileged&&(
                    <div style={{display:"flex",gap:3,flexShrink:0}}>
                      <button
                        onClick={()=>isEditing?setEditingId(null):openEdit(m)}
                        title="Edit title / content"
                        style={{width:28,height:28,borderRadius:7,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
                          background:isEditing?"rgba(201,168,76,.3)":"rgba(255,255,255,.07)",
                          color:isEditing?"#f2dfa8":"rgba(255,255,255,.45)",fontSize:13,transition:"all .12s"}}
                      >✏️</button>
                      <button
                        onClick={()=>confirmDeleteId===m.id?setConfirmDeleteId(null):setConfirmDeleteId(m.id)}
                        title="Delete material"
                        disabled={isDeleting}
                        style={{width:28,height:28,borderRadius:7,border:"none",cursor:isDeleting?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",
                          background:confirmDeleteId===m.id?"rgba(239,68,68,.25)":"rgba(255,255,255,.07)",
                          color:confirmDeleteId===m.id?"#ef4444":"rgba(255,255,255,.4)",fontSize:13,transition:"all .12s"}}
                      >{isDeleting?"⌛":"🗑️"}</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
    {/* Assignments overlay — full screen so its own modals (create/grade/submit)
        have room, regardless of how narrow the materials drawer is. Reuses the
        exact same Assignments component used on the subject's profile page, so
        an assignment created here — or a student's submission made here —
        shows up there instantly too, and vice versa. */}
    {assignmentsOpen && (
      <div style={{position:"fixed",inset:0,zIndex:80,background:"#f5f2ea",display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderBottom:"1px solid rgba(15,45,31,.1)",flexShrink:0,background:"#fff"}}>
          <ClipboardList style={{width:16,height:16,color:"#0f2d1f",flexShrink:0}}/>
          <span style={{flex:1,fontSize:15,fontWeight:800,color:"#0f2d1f"}}>Assignments</span>
          <button onClick={()=>setAssignmentsOpen(false)} style={{background:"#f4f4f4",border:"none",color:"#555",borderRadius:8,width:32,height:32,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <X style={{width:15,height:15}}/>
          </button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:16}}>
          <SubjectAssignments subjectId={subjectId}/>
        </div>
      </div>
    )}
    </>
  );
};

/* ══ MATERIAL VIEWER (teacher-shared) ══
   Renders as position:absolute inside content area so footer stays visible.     */
export const MaterialViewer=({material,isTeacher,onClose}:any)=>{
  return <InClassMaterialViewer material={material} isTeacher={isTeacher} onClose={onClose}/>;
};

/* ══ RECORDING CONTROLLER — server-side (LiveKit Egress) ══
   The recording now happens on LiveKit's servers, not in this browser tab.
   That means:
   • It survives the teacher's tab closing, the device sleeping, the app
     crashing, or the network dropping — the class keeps recording until
     LiveKit itself confirms it's done (via the livekit-egress-webhook
     function), independent of anything happening here.
   • There's no in-memory blob, no upload-at-the-end step, and nothing to
     lose if this component unmounts mid-class.
   • Pause/resume isn't offered — LiveKit Egress records continuously once
     started; if a real pause is ever needed, stop and start again (it'll
     save as a second clip under the same subject).
   ════════════════════════════════════════════════════════════════════════ */
export const RecController=({sessionId,subjectId,onSavingChange,stopRecRef,isRecordingRef}:any)=>{
  const{t}=useLanguage();
  const[recording,setRecording]=useState(false);
  const[busy,setBusy]=useState(false);
  const[displayTime,setDisplayTime]=useState(0);
  const timerRef=useRef<any>(null);

  useEffect(()=>{
    if(isRecordingRef)isRecordingRef.current=recording;
    return()=>{ if(isRecordingRef)isRecordingRef.current=false; };
  },[recording,isRecordingRef]);

  // If this component mounts on a session that's already being recorded
  // (e.g. the teacher reloaded the page mid-class), reflect that in the UI
  // instead of showing "not recording" while a job is actually running.
  useEffect(()=>{
    let cancelled=false;
    if(!sessionId){setRecording(false);return;}
    supabase.from("session_recordings").select("status,created_at")
      .eq("session_id",sessionId).eq("status","recording").maybeSingle()
      .then(({data}:any)=>{
        if(cancelled)return;
        if(data){
          setRecording(true);
          const elapsed=Math.max(0,Math.floor((Date.now()-new Date(data.created_at).getTime())/1000));
          setDisplayTime(elapsed);
        }else{
          setRecording(false);
        }
       },()=>{});
    return()=>{cancelled=true;};
  },[sessionId]);

  useEffect(()=>{
    if(recording){
      timerRef.current=setInterval(()=>setDisplayTime(d=>d+1),1000);
    }else{
      clearInterval(timerRef.current);
    }
    return()=>clearInterval(timerRef.current);
  },[recording]);

  const startRec=useCallback(async()=>{
    if(busy)return;
    if(!sessionId||!subjectId){
      // Previously this just returned silently — clicking Record appeared to
      // do absolutely nothing, with no error and no indicator, right when
      // the session row hasn't finished being created yet (a few seconds
      // after joining/starting class). Now it says so instead of no-op'ing.
      toast({title:"Still setting up the class session…",description:"Give it a couple of seconds, then press Record again.",variant:"destructive"});
      return;
    }
    setBusy(true);
    try{
      const{data,error}=await supabase.functions.invoke("start-recording",{body:{session_id:sessionId,subject_id:subjectId}});
      if(error||data?.error)throw new Error(data?.error||error?.message||"Failed to start recording");
      setRecording(true);setDisplayTime(0);
      toast({title:t("Recording started ⏺","بدأ التسجيل ⏺")});
    }catch(err:any){
      console.error("[RecController] startRec error:",err);
      toast({title:"Recording failed to start",description:err?.message||"Unknown error",variant:"destructive"});
    }finally{
      setBusy(false);
    }
  },[busy,sessionId,subjectId,t]);

  const stopRec=useCallback(async()=>{
    if(!sessionId)return;
    setBusy(true);
    onSavingChange?.(true);
    try{
      const{error}=await supabase.functions.invoke("stop-recording",{body:{session_id:sessionId}});
      if(error)throw error;
      setRecording(false);
      toast({
        title:t("Recording saved ✅","تم حفظ التسجيل ✅"),
        description:"Finishing up on the server — it'll appear in Recordings shortly.",
      });
    }catch(err:any){
      console.error("[RecController] stopRec error:",err);
      toast({title:"Couldn't stop recording",description:err?.message||"Unknown error",variant:"destructive"});
    }finally{
      setBusy(false);
      onSavingChange?.(false);
    }
  },[sessionId,onSavingChange,t]);

  // Expose stable stopRec ref so the parent can call it from endSession()
  // when the teacher ends class — this is now the main way a recording gets
  // stopped promptly; the room_finished webhook is the safety net for when
  // that never happens (crash, force-quit, etc).
  useEffect(()=>{
    if(stopRecRef)stopRecRef.current=stopRec;
  },[stopRec,stopRecRef]);

  const fmt=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  return(
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      {recording&&<>
        <span style={{fontSize:12,color:RED,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>
          ⏺ {fmt(displayTime)}
        </span>
        <button onClick={stopRec} disabled={busy} style={{background:"rgba(239,68,68,.25)",border:"none",borderRadius:8,padding:"4px 10px",color:RED,fontSize:12,fontWeight:700,cursor:busy?"default":"pointer",opacity:busy?.6:1}}>
          {busy?"…":"Stop"}
        </button>
      </>}
      {!recording&&(
        <button onClick={startRec} disabled={busy} title="Start Recording" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,background:"rgba(239,68,68,.14)",border:"1px solid rgba(239,68,68,.35)",borderRadius:20,padding:"5px 10px",color:"#fca5a5",fontSize:11,fontWeight:700,cursor:busy?"default":"pointer",flexShrink:0,opacity:busy?.6:1}}>
          <Circle style={{width:8,height:8,fill:RED,color:RED,flexShrink:0}}/>
          <span>{busy?"Starting…":"REC"}</span>
        </button>
      )}

    </div>
  );
};

/* ══ ROOM SETTINGS MODAL ══
   Device picker: mic, speaker, camera (front/back), video quality.
   Adapted from ClassControls SettingsModal — unified UX across both views. */
export const RoomSettingsModal = ({ onClose, room }: { onClose: () => void; room: any }) => {
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

  const switchDevice = async (kind: MediaDeviceKind, deviceId: string) => {    try {
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

/* ══ PARTICIPANT TILE — WhatsApp call style ══ */
/* ══ NETWORK QUALITY INDICATOR ══
   Uses LiveKit's ConnectionQuality events on the local participant to drive
   a signal-bar badge only. This NO LONGER forces any video/audio downgrade,
   camera-off, or "poor connection" toast — quality adaptation is handled
   entirely by LiveKit's own simulcast/dynacast on the server side (see
   publishDefaults in ClassroomView.tsx). Removed per request: the previous
   behaviour of auto-shrinking the camera to 320x240/10fps (or turning it off
   entirely) whenever the network dipped was itself a common cause of visible
   freezes, since every step involved disabling and re-enabling the camera
   track (a renegotiation, not a cheap operation). */

export const QUALITY_LABELS: Record<string,string> = {
  excellent: "Excellent",
  good:      "Good",
  poor:      "Poor",
  lost:      "Very Poor",
  unknown:   "Checking…",
};

/* Signal bars icon — 4 bars, filled based on quality */
export const SignalBars=({quality}:{quality:string})=>{
  const bars = quality==="excellent"?4:quality==="good"?3:quality==="poor"?2:quality==="lost"?1:0;
  const color = quality==="excellent"||quality==="good" ? "#34d399"
              : quality==="poor"                         ? "#fbbf24"
              : quality==="lost"                         ? "#ef4444"
              :                                            "rgba(255,255,255,.3)";
  return(
    <svg width="16" height="14" viewBox="0 0 16 14" fill="none" style={{flexShrink:0}}>
      {[0,1,2,3].map(i=>(
        <rect
          key={i}
          x={i*4}
          y={14-(i+1)*3-i}
          width={3}
          height={(i+1)*3+i}
          rx={1}
          fill={i<bars ? color : "rgba(255,255,255,.18)"}
        />
      ))}
    </svg>
  );
};

/* The hook: listens to LiveKit quality changes on the local participant and
   exposes a label for display only. Deliberately does NOT touch camera,
   microphone, or encoder settings in response to network conditions — no
   auto-degrade, no auto camera-off, no "poor connection" toast. */
export const useNetworkQuality=()=>{
  const room=useRoomContext();
  const[quality,setQuality]=useState<string>("unknown");

  useEffect(()=>{
    if(!room)return;
    const lp=room.localParticipant;

    // Read current quality immediately — avoids stuck "Checking…" on rejoin
    const readCurrent=()=>{
      const q=(lp as any)?.connectionQuality;
      if(q!=null&&q!==ConnectionQuality.Unknown){
        const label=q===ConnectionQuality.Excellent?"excellent"
                   :q===ConnectionQuality.Good?"good"
                   :q===ConnectionQuality.Poor?"poor"
                   :q===ConnectionQuality.Lost?"lost":"unknown";
        setQuality(label);
      }
    };
    readCurrent();
    const initTimer=setTimeout(readCurrent,2000);

    // BUG FIX — "network bar doesn't function at all":
    // RoomEvent.ConnectionQualityChanged fires as (quality, participant) —
    // quality FIRST, participant SECOND. An earlier version had these
    // swapped, so the identity guard below always failed silently.
    const onQualityChanged=(q:ConnectionQuality,_participant:any)=>{
      if(_participant?.identity!==lp?.identity)return;
      const label=q===ConnectionQuality.Excellent?"excellent"
                 :q===ConnectionQuality.Good?"good"
                 :q===ConnectionQuality.Poor?"poor"
                 :q===ConnectionQuality.Lost?"lost":"unknown";
      setQuality(label);
    };

    room.on(RoomEvent.ConnectionQualityChanged,onQualityChanged);
    return()=>{clearTimeout(initTimer);room.off(RoomEvent.ConnectionQualityChanged,onQualityChanged);};
  },[room]);

  return quality;
};

/* Badge shown in the top bar — icon only, compact.
   NOTE: NO LONGER RENDERED — network indicator moved to per-participant
   name pills per request. Kept here (unused) in case it's wanted back. */
export const NetworkQualityBadge=()=>{
  const quality=useNetworkQuality();
  // Only show badge when network is degraded OR still checking
  // When excellent/good: no badge — don't clutter the header
  const showBadge = quality!=="excellent"&&quality!=="good";
  if(!showBadge) return null;
  const bg  = quality==="poor" ?"rgba(251,191,36,.15)"
             :quality==="lost" ?"rgba(239,68,68,.18)"
             :"rgba(255,255,255,.07)";
  const bdr = quality==="poor" ?"rgba(251,191,36,.4)"
             :quality==="lost" ?"rgba(239,68,68,.45)"
             :"rgba(255,255,255,.12)";
  return(
    <div title={`Network: ${QUALITY_LABELS[quality]||"Unknown"}`} style={{
      display:"flex",alignItems:"center",
      background:bg,border:`1px solid ${bdr}`,
      borderRadius:20,padding:"4px 6px",flexShrink:0,cursor:"default",
    }}>
      <SignalBars quality={quality}/>
    </div>
  );
};

/* BUG-PREVENTION NOTE: useNetworkQuality() doesn't just feed the visual
   badge above — it's also what actually RUNS the adaptive video/bitrate
   degradation logic (see onQualityChanged inside it). It was previously
   only ever invoked from inside NetworkQualityBadge, so removing that
   badge's render call would have silently killed adaptive video entirely.
   This headless component keeps the hook (and therefore adaptive video)
   running regardless of whether anything visual is shown for it. */
export const NetworkAdaptiveEngine=()=>{ useNetworkQuality(); return null; };

/* Per-participant signal icon — shown next to every name pill, always visible,
   color-coded green (good/excellent) / yellow (poor) / red (lost) so you can
   see at a glance whose connection is struggling, not just your own. */
export const ParticipantSignalIcon=({participant}:{participant:any})=>{
  const room=useRoomContext();
  // Read the participant's CURRENT quality immediately at mount instead of
  // starting blank/"unknown" and waiting for the next ConnectionQualityChanged
  // event to fire (which could be a while) — LiveKit already exposes this as
  // a live property on the participant object.
  const readQuality=useCallback(()=>{
    const q=participant?.connectionQuality;
    if(q===ConnectionQuality.Excellent)return"excellent";
    if(q===ConnectionQuality.Good)return"good";
    if(q===ConnectionQuality.Poor)return"poor";
    if(q===ConnectionQuality.Lost)return"lost";
    return"unknown";
  },[participant]);
  const[quality,setQuality]=useState<string>(readQuality);
  useEffect(()=>{
    if(!room)return;
    // BUG FIX — same swapped-parameter issue as useNetworkQuality above:
    // event fires (quality, participant), not (participant, quality).
    const handler=(q:ConnectionQuality,_p:any)=>{
      if(_p?.identity!==participant?.identity)return;
      const label=q===ConnectionQuality.Excellent?"excellent"
                 :q===ConnectionQuality.Good?"good"
                 :q===ConnectionQuality.Poor?"poor"
                 :q===ConnectionQuality.Lost?"lost":"unknown";
      setQuality(label);
    };
    room.on(RoomEvent.ConnectionQualityChanged,handler);
    // BUG FIX — "icon shows for some participants and not others, and the
    // signal it shows isn't accurate":
    // ConnectionQualityChanged doesn't reliably fire for every participant
    // (e.g. ones with no published tracks, or ones the SFU only reports on
    // periodically) — so some tiles were stuck on "unknown" forever and
    // never got a single event. Poll the live property directly as a
    // fallback so every participant's badge stays in sync with LiveKit's
    // actual current value even if we missed (or never got) the event.
    //
    // BUG FIX ("network icon takes a while to show up"): right after a
    // tile mounts, connectionQuality is genuinely still "unknown" at the
    // LiveKit SDK level for a moment — the SFU hasn't measured/reported it
    // yet, so there's nothing to poll for early on. Polling fast for the
    // first few seconds (instead of only every 2.5s from the start) means
    // we pick up the real value the moment LiveKit has one, rather than
    // waiting for the next 2.5s tick.
    const fastIv=setInterval(()=>setQuality(readQuality()),300);
    const toStable=setTimeout(()=>clearInterval(fastIv),4000);
    const iv=setInterval(()=>setQuality(readQuality()),2500);
    return()=>{room.off(RoomEvent.ConnectionQualityChanged,handler);clearInterval(iv);clearInterval(fastIv);clearTimeout(toStable);};
  },[room,participant,readQuality]);
  // BUG FIX ("network bar is loading too late"): this used to `return null`
  // for "unknown", so the icon was fully invisible for that first stretch
  // after a tile mounts (before the SFU has reported anything) — it felt
  // like the indicator was slow/broken rather than genuinely having
  // nothing to show yet. SignalBars already renders "unknown" as four dim
  // outline bars, so rendering it immediately gives instant visual
  // feedback (an icon is there right away) that then fills in with real
  // color the moment the fast-polling effect above picks up a value —
  // typically within one 300ms tick.
  return <SignalBars quality={quality}/>;
};

// ── Admin context for video tiles ──────────────────────────────────────
// ParticipantTile is rendered deep inside several nested layout components
// (VideoGrid → PagedGrid/DuoPipLayout → tile), so instead of threading
// isPrivileged/sessionId through every one of those layout components'
// props, ClassroomView wraps its <VideoGrid/> in this Provider once and
// every tile underneath just reads it directly. Defaults are safe no-ops
// (mic/kick controls simply don't render) for any tree that doesn't wrap
// with a Provider — e.g. if ParticipantTile is ever reused somewhere else.
export const ClassroomAdminContext = createContext<{isPrivileged:boolean;sessionId:string|null}>({isPrivileged:false,sessionId:null});

export const ParticipantTile=({participant,isLocal,size="normal",pip=false}:{participant:any;isLocal:boolean;size?:"normal"|"large"|"small";pip?:boolean})=>{
  const videoRef=useRef<HTMLVideoElement>(null);
  const[hasVideo,setHasVideo]=useState(false);
  const[isSpeaking,setIsSpeaking]=useState(false);
  const[micEnabled,setMicEnabled]=useState(true);
  const room=useRoomContext();

  // ── Admin tile controls: tap mic to mute/unmute, long-press to remove/block ──
  // Reads from ClassroomAdminContext instead of props so every call site of
  // ParticipantTile (grid, spotlight, screenshare rail, PiP bubble) gets this
  // for free without threading isPrivileged/sessionId through each layout.
  const{isPrivileged:adminIsPrivileged,sessionId:adminSessionId}=useContext(ClassroomAdminContext);
  const canModerate=adminIsPrivileged&&!isLocal;
  const[tileMenuOpen,setTileMenuOpen]=useState(false);
  const[tileActionBusy,setTileActionBusy]=useState(false);
  const longPressTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const longPressFired=useRef(false);

  const sendModeration=(type:string)=>{
    try{
      room?.localParticipant?.publishData(
        new TextEncoder().encode(JSON.stringify({type,target:participant.identity})),
        {reliable:true}
      );
    }catch{}
  };

  // Tap the mic icon on the tile itself — same force_mute/force_unmute data
  // channel signal the Participants side-panel already sends (AdminMuteListener
  // on the receiving end reacts to both identically), just reachable directly
  // from the video tile instead of only from the panel list.
  const toggleTileMic=(e:any)=>{
    e.stopPropagation();
    if(!canModerate)return;
    sendModeration(micEnabled?"force_mute":"force_unmute");
    toast({title:micEnabled?`🔇 ${name} muted`:`🎤 ${name} unmuted`});
  };

  const startLongPress=()=>{
    if(!canModerate)return;
    longPressFired.current=false;
    longPressTimer.current=setTimeout(()=>{
      longPressFired.current=true;
      setTileMenuOpen(true);
    },500);
  };
  const cancelLongPress=()=>{
    if(longPressTimer.current){clearTimeout(longPressTimer.current);longPressTimer.current=null;}
  };

  const removeFromTile=async()=>{
    if(!adminSessionId)return;
    setTileActionBusy(true);
    try{
      const{data,error}=await supabase.functions.invoke("moderate-participant",{
        body:{session_id:adminSessionId,student_id:participant.identity,action:"remove",identity:participant.identity},
      });
      if(error||data?.error)throw new Error(data?.error||error?.message);
      toast({title:`👋 ${name} removed from the class`});
    }catch(e:any){
      toast({title:"Failed to remove",description:e?.message,variant:"destructive"});
    }finally{
      setTileActionBusy(false);setTileMenuOpen(false);
    }
  };

  const blockFromTile=async()=>{
    if(!adminSessionId)return;
    if(!window.confirm(`Remove and block ${name} from rejoining this class until you unblock them?`))return;
    setTileActionBusy(true);
    try{
      const{data,error}=await supabase.functions.invoke("moderate-participant",{
        body:{session_id:adminSessionId,student_id:participant.identity,action:"ban",identity:participant.identity},
      });
      if(error||data?.error)throw new Error(data?.error||error?.message);
      toast({title:`🚫 ${name} removed and blocked from rejoining`});
    }catch(e:any){
      toast({title:"Failed to block",description:e?.message,variant:"destructive"});
    }finally{
      setTileActionBusy(false);setTileMenuOpen(false);
    }
  };
  // BUG FIX ("pic only shows for the user, others don't see it" / "takes a
  // while to show a user's details"): name and avatar_url both come from
  // `participant.metadata`, read fresh on every render below — but nothing
  // was ever forcing a re-render when that metadata actually arrived or
  // changed. In practice the tile only ever picked it up by accident, when
  // some unrelated state (mic, speaking) happened to re-render it a moment
  // later — which is exactly the "shows up eventually, sometimes never for
  // other people" symptom. This tick forces an immediate re-render the
  // instant LiveKit delivers or updates this participant's metadata/name.
  const[,forceMetaTick]=useReducer((n:number)=>n+1,0);

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
    participant.on?.("participantMetadataChanged",forceMetaTick);
    participant.on?.("participantNameChanged",forceMetaTick);
    if(isLocal){room.on(RoomEvent.LocalTrackPublished,attachVideo);room.on(RoomEvent.LocalTrackUnpublished,attachVideo);room.on(RoomEvent.TrackMuted,attachVideo);room.on(RoomEvent.TrackUnmuted,attachVideo);}
    const poll=setInterval(attachVideo,1500);
    // Catch-up poll: metadata can arrive a beat after the participant object
    // itself is first constructed (e.g. right as someone joins). A few quick
    // re-renders just after mount make sure it's picked up the moment it's
    // actually there, instead of waiting on the 1500ms track poll or a lucky
    // unrelated event — this is what makes a newly-joined user's name/photo
    // appear immediately rather than "after a while".
    const metaCatchUp=[200,600,1200].map(ms=>window.setTimeout(forceMetaTick,ms));
    return()=>{
      clearInterval(poll);
      metaCatchUp.forEach(clearTimeout);
      participant.off?.("trackSubscribed",attachVideo);participant.off?.("trackUnsubscribed",attachVideo);
      participant.off?.("trackMuted",attachVideo);participant.off?.("trackUnmuted",attachVideo);
      participant.off?.("trackPublished",attachVideo);participant.off?.("trackUnpublished",attachVideo);
      participant.off?.("isSpeakingChanged",onSpeak);
      participant.off?.("participantMetadataChanged",forceMetaTick);
      participant.off?.("participantNameChanged",forceMetaTick);
      if(isLocal){room.off(RoomEvent.LocalTrackPublished,attachVideo);room.off(RoomEvent.LocalTrackUnpublished,attachVideo);room.off(RoomEvent.TrackMuted,attachVideo);room.off(RoomEvent.TrackUnmuted,attachVideo);}
    };
  },[participant,attachVideo,room,isLocal]);

  // BUG FIX ("takes a while before it shows my name"): participant.name only
  // arrives once the LiveKit connection handshake finishes and the server
  // relays participant metadata back — a real network round-trip, not
  // instant. But for the LOCAL participant we already know who they are
  // (they're logged in) before we ever connect to LiveKit at all, so use
  // that as the fallback instead of the generic "User" — it's available on
  // the very first render, not a few seconds later.
  const {user,profile}=useAuth();
  const localKnownName=user?.user_metadata?.full_name||(profile as any)?.full_name;
  const name=participant.name||(isLocal?localKnownName:undefined)||participant.identity||"User";

  // FIX ("show my profile pic in the live class"): camera-off used to always
  // show a generic grey silhouette, even though every user already has a
  // profile photo on file. For the LOCAL participant we already have it via
  // useAuth() (no round trip needed). For REMOTE participants, the
  // livekit-token function now embeds avatar_url in the participant's
  // metadata JSON (alongside role/name), so we parse that here — same
  // source, same network-handshake timing, as participant.name above.
  const remoteMeta=!isLocal&&participant.metadata?(()=>{try{return JSON.parse(participant.metadata);}catch{return null;}})():null;
  const avatarUrl=isLocal?(profile as any)?.avatar_url:remoteMeta?.avatar_url;
  const[avatarImgError,setAvatarImgError]=useState(false);
  useEffect(()=>{setAvatarImgError(false);},[avatarUrl]);

  // WhatsApp-style avatar sizes
  const avatarW = pip ? "55%" : size==="small" ? "60%" : "52%";

  return(
    <div
      className={`gm-tile${isSpeaking?" speaking":""}`}
      style={{
        width:"100%",height:"100%",
        borderRadius: pip ? 16 : 0,
        // Border is fixed (no green speaking ring) — only the in-tile waveform
        // should move/change when a participant is speaking.
        border: "3px solid transparent",
        overflow:"hidden",
        background: "#111",
        position:"relative",
        cursor: canModerate ? "pointer" : undefined,
      }}
      // Long-press (touch or mouse) opens the Remove/Block menu for admins on
      // any REMOTE tile. A plain tap/click that fires before the 500ms hold
      // completes is left alone (longPressFired stays false) so this never
      // interferes with anything else the tile does on a normal click.
      onPointerDown={canModerate?startLongPress:undefined}
      onPointerUp={canModerate?cancelLongPress:undefined}
      onPointerLeave={canModerate?cancelLongPress:undefined}
      onPointerCancel={canModerate?cancelLongPress:undefined}
      onContextMenu={canModerate?(e:any)=>{e.preventDefault();setTileMenuOpen(true);}:undefined}
    >
      {/* BUG FIX ("video showing flipped — text is backwards"): mirror ONLY
          the LOCAL participant's own preview via CSS (scaleX(-1)) — the
          standard convention every video-call app uses so your own camera
          feels like looking in a mirror (raise your right hand, it goes up
          on the right side of your own screen). This is a purely local
          rendering flip; it does not touch the actual published video
          frame in any way, so it has zero effect on what remote viewers
          receive. Remote tiles get NO transform, so every other viewer
          always sees a participant's video exactly as their camera
          published it — real orientation, text readable. Previously this
          tile applied no transform in either case, which made your own
          camera preview feel mirror-reversed compared to what every other
          call app trains people to expect. */}
      <video ref={videoRef} autoPlay playsInline muted={isLocal}
        style={{width:"100%",height:"100%",objectFit:"cover",display:hasVideo?"block":"none",transform:isLocal?"scaleX(-1)":"none"}}
      />

      {/* Camera-off avatar — WhatsApp dark grey background + large silhouette */}
      {!hasVideo&&(
        <div style={{
          position:"absolute",inset:0,
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
          background: pip ? "#1a1a2e" : "#131313",
          gap: pip ? 4 : 8,
        }}>
          {/* Avatar circle — WhatsApp style solid circle */}
          <div style={{
            width: pip ? 52 : size==="small" ? 64 : 96,
            height: pip ? 52 : size==="small" ? 64 : 96,
            borderRadius:"50%",
            background:"#2a3942",
            display:"flex",alignItems:"center",justifyContent:"center",
            border: "3px solid #3a4a52",
            flexShrink:0,
            overflow:"hidden",
          }}>
            {avatarUrl&&!avatarImgError ? (
              <img src={avatarUrl} alt="" onError={()=>setAvatarImgError(true)}
                style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            ) : (
              <svg viewBox="0 0 200 220" style={{width:avatarW,height:avatarW}} fill="none">
                <circle cx="100" cy="72" r="52" fill="#8696a0"/>
                <path d="M0 220 C0 148 36 128 100 128 C164 128 200 148 200 220Z" fill="#8696a0"/>
              </svg>
            )}
          </div>
          {/* Name shown in the bottom pill (below) — no duplicate here */}
        </div>
      )}

      {/* Speaking waveform — overlaid inside the participant's square (works over
          both live video and the camera-off avatar), so it reads as audio activity
          coming from that tile rather than a small badge in the corner. */}
      {isSpeaking&&!pip&&(
        <div className="gm-wave-tile">
          {[0,1,2,3,4].map(i=>(
            <div key={i} className="gm-wave-tile-bar" style={{animationDelay:`${i*.12}s`}}/>
          ))}
        </div>
      )}

      {/* Name pill — bottom-left, only on non-pip tiles */}
      {!pip&&(
        <div style={{
          position:"absolute",bottom:10,left:10,
          display:"inline-flex",alignItems:"center",gap:5,
          background:"rgba(0,0,0,.55)",backdropFilter:"blur(8px)",
          borderRadius:20,padding:"4px 10px",
          maxWidth:"calc(100% - 20px)",pointerEvents:canModerate?"auto":"none",
        }}>
          {/* BUG FIX ("admin click on user mic — turn off/on"): for a
              privileged viewer looking at someone else's tile, this icon is
              now a real tappable control (pointerEvents re-enabled + stops
              propagation so it doesn't also trigger the tile's own
              long-press) instead of a purely decorative status dot. Tapping
              it sends the same force_mute/force_unmute data-channel signal
              the Participants side-panel already used, just reachable
              directly from the video tile. Non-admins and the local tile
              keep the old read-only indicator. */}
          {canModerate ? (
            <button onClick={toggleTileMic} onPointerDown={(e:any)=>e.stopPropagation()} title={micEnabled?"Mute":"Unmute"}
              style={{background:"none",border:"none",padding:0,margin:0,pointerEvents:"auto",cursor:"pointer",display:"flex",alignItems:"center",flexShrink:0}}>
              {micEnabled
                ? <Mic style={{width:12,height:12,color:"rgba(255,255,255,.9)"}}/>
                : <MicOff style={{width:12,height:12,color:"#ef4444"}}/>
              }
            </button>
          ) : isSpeaking&&micEnabled ? (
            // Pulsing dot — the full waveform now lives in the center of the tile,
            // so this just confirms it's this participant's mic that's live.
            <span style={{width:7,height:7,borderRadius:"50%",background:"#25D366",animation:"pip-pulse 1s ease-in-out infinite",flexShrink:0}}/>
          ) : micEnabled
            ? <Mic style={{width:12,height:12,color:"rgba(255,255,255,.75)",flexShrink:0}}/>
            : <MicOff style={{width:12,height:12,color:"#ef4444",flexShrink:0}}/>
          }
          <span style={{fontSize:12,fontWeight:500,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:"system-ui,sans-serif"}}>
            {name}{isLocal?" (You)":""}
          </span>
          <ParticipantSignalIcon participant={participant}/>
        </div>
      )}

      {/* BUG FIX ("hold to show option to remove/block user"): long-press
          (or right-click on desktop) anywhere on a REMOTE tile while
          privileged opens this small menu. Backdrop click-away closes it
          without acting — only the two explicit buttons below take action. */}
      {canModerate&&tileMenuOpen&&(
        <div onClick={(e:any)=>{e.stopPropagation();setTileMenuOpen(false);}} style={{
          position:"absolute",inset:0,zIndex:20,
          background:"rgba(0,0,0,.55)",backdropFilter:"blur(2px)",
          display:"flex",alignItems:"center",justifyContent:"center",
        }}>
          <div onClick={(e:any)=>e.stopPropagation()} style={{
            background:"#26272b",borderRadius:12,padding:10,minWidth:190,
            border:"1px solid rgba(255,255,255,.1)",boxShadow:"0 8px 28px rgba(0,0,0,.5)",
          }}>
            <p style={{margin:"2px 8px 8px",fontSize:12,fontWeight:600,color:"rgba(255,255,255,.55)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</p>
            <button onClick={removeFromTile} disabled={tileActionBusy} style={{
              width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 8px",
              background:"none",border:"none",borderRadius:8,color:"#fca5a5",fontSize:13,
              cursor:"pointer",opacity:tileActionBusy?0.5:1,
            }} onMouseEnter={(e:any)=>(e.currentTarget.style.background="rgba(239,68,68,.12)")} onMouseLeave={(e:any)=>(e.currentTarget.style.background="none")}>
              <UserMinus style={{width:15,height:15}}/> Remove from call
            </button>
            <button onClick={blockFromTile} disabled={tileActionBusy} style={{
              width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 8px",
              background:"none",border:"none",borderRadius:8,color:"#f87171",fontSize:13,
              cursor:"pointer",opacity:tileActionBusy?0.5:1,
            }} onMouseEnter={(e:any)=>(e.currentTarget.style.background="rgba(239,68,68,.12)")} onMouseLeave={(e:any)=>(e.currentTarget.style.background="none")}>
              <UserX style={{width:15,height:15}}/> Remove &amp; block from rejoining
            </button>
            <button onClick={()=>setTileMenuOpen(false)} style={{
              width:"100%",padding:"7px 8px",marginTop:2,background:"none",border:"none",
              borderRadius:8,color:"rgba(255,255,255,.4)",fontSize:12,cursor:"pointer",textAlign:"center" as const,
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* PiP: mic indicator only */}
      {pip&&(
        <div style={{position:"absolute",bottom:6,left:6,background:"rgba(0,0,0,.5)",borderRadius:10,padding:"3px 6px",display:"flex",alignItems:"center",gap:3}}>
          {isSpeaking&&micEnabled ? (
            <span style={{width:6,height:6,borderRadius:"50%",background:"#25D366",animation:"pip-pulse 1s ease-in-out infinite"}}/>
          ) : micEnabled
            ? <Mic style={{width:10,height:10,color:"rgba(255,255,255,.8)"}}/>
            : <MicOff style={{width:10,height:10,color:"#ef4444"}}/>
          }
        </div>
      )}
    </div>
  );
};

/* ══ VIDEO GRID — uniform grid, everyone the same size ══
   No self PiP bubble — the local participant is just another tile.
   Column count is capped at 3 and grows in rows as people join:
     1 → 1×1     2 → 2×1     3 → 3×1
     4 → 2×2     6 → 3×2     9 → 3×3     etc.
   ══════════════════════════════════════════════════════════════════════════ */
export const VideoGrid=({layout="grid",isMobile=false,spotlightId=null}:{layout?:LayoutMode;isMobile?:boolean;spotlightId?:string|null})=>{
  const{localParticipant}=useLocalParticipant();
  const allParticipants=useParticipants();
  const remotes=allParticipants.filter(p=>p.identity!==localParticipant?.identity);
  // If spotlight is set, move that participant to front
  const all=localParticipant?[localParticipant,...remotes]:remotes;
  const orderedAll = spotlightId
    ? [...all.filter(p=>p.identity===spotlightId), ...all.filter(p=>p.identity!==spotlightId)]
    : all;
  const n=orderedAll.length;

  // Screen share always takes main slot
  const screensharer=all.find(p=>{
    const pub=p.getTrackPublication?.(Track.Source.ScreenShare)||p.trackPublications?.get(Track.Source.ScreenShare);
    return pub?.track&&!pub.isMuted;
  });
  if(screensharer){
    const others=orderedAll.filter(p=>p.identity!==screensharer.identity);
    return(
      <div style={{width:"100%",height:"100%",position:"relative"}}>
        <ParticipantTile participant={screensharer} isLocal={screensharer.identity===localParticipant?.identity} size="large"/>
        {/* Strip of other participants at bottom */}
        {others.length>0&&(
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:100,display:"flex",gap:4,padding:"4px 8px",background:"rgba(0,0,0,.4)",overflowX:"auto"}}>
            {others.map(p=>(<div key={p.identity} style={{width:72,flexShrink:0,height:92,borderRadius:10,overflow:"hidden"}}><ParticipantTile participant={p} isLocal={p.identity===localParticipant?.identity} size="small"/></div>))}
          </div>
        )}
      </div>
    );
  }

  // Spotlight layout: spotlighted participant fills screen, others in strip.
  // (Explicit teacher/admin action — separate from the default equal grid.)
  if(spotlightId && layout==="spotlight"){
    const spotParticipant=orderedAll.find(p=>p.identity===spotlightId)||orderedAll[0];
    const stripParticipants=orderedAll.filter(p=>p.identity!==spotParticipant?.identity);
    return(
      <div style={{width:"100%",height:"100%",position:"relative",background:"#0a0a0a"}}>
        <div style={{position:"absolute",inset:0,bottom:stripParticipants.length>0?100:0}}>
          <div style={{width:"100%",height:"100%",outline:"3px solid #1a73e8",outlineOffset:-3,borderRadius:4,animation:"spotlight-ring 2s ease-in-out infinite"}}>
            <ParticipantTile participant={spotParticipant} isLocal={spotParticipant?.identity===localParticipant?.identity} size="large"/>
          </div>
        </div>
        {stripParticipants.length>0&&(
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:96,display:"flex",gap:4,padding:"4px 8px",background:"rgba(0,0,0,.5)",overflowX:"auto"}}>
            {stripParticipants.map(p=>(<div key={p.identity} style={{width:68,flexShrink:0,height:88,borderRadius:10,overflow:"hidden"}}><ParticipantTile participant={p} isLocal={p.identity===localParticipant?.identity} size="small"/></div>))}
          </div>
        )}
      </div>
    );
  }

  // Solo — just show yourself, full screen
  if(n===1){
    return(
      <div style={{width:"100%",height:"100%"}}>
        <ParticipantTile participant={orderedAll[0]} isLocal size="large"/>
      </div>
    );
  }

  // Two people — one full-screen background, one small PiP bubble on top.
  // Owner (the local participant) starts as the PiP; tap either tile to swap
  // who's in front and who's in the bubble.
  if(n===2){
    return <DuoPipLayout participants={orderedAll} localIdentity={localParticipant?.identity}/>;
  }

  // Three or more — capped-3-column grid, paginated once it would exceed 3×3 (9) tiles.
  return <PagedGrid participants={orderedAll} localIdentity={localParticipant?.identity} isMobile={isMobile}/>;
};

/* ══ DUO PiP — two-person calls ══
   One participant fills the screen, the other floats in a small draggable-feeling
   corner bubble. Tap either tile to swap which one is in front. The "owner" (the
   local participant) starts in the bubble; the other person is the background. */
export const DuoPipLayout=({participants,localIdentity}:{participants:any[];localIdentity?:string})=>{
  const owner=participants.find(p=>p.identity===localIdentity)||participants[0];
  const other=participants.find(p=>p.identity!==owner?.identity)||participants[1];
  const[ownerIsPip,setOwnerIsPip]=useState(true); // default: owner in the bubble, other person in the background
  const bg=ownerIsPip?other:owner;
  const bubble=ownerIsPip?owner:other;
  const swap=()=>setOwnerIsPip(v=>!v);
  if(!bg||!bubble)return null;
  return(
    <div style={{width:"100%",height:"100%",position:"relative",background:"#0a0a0a",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,cursor:"pointer"}} onClick={swap}>
        <ParticipantTile participant={bg} isLocal={bg.identity===localIdentity} size="large"/>
      </div>
      <div
        onClick={(e)=>{e.stopPropagation();swap();}}
        style={{
          position:"absolute",top:14,right:14,
          width:"32%",maxWidth:150,minWidth:96,aspectRatio:"3/4",
          borderRadius:16,overflow:"hidden",cursor:"pointer",zIndex:5,
          boxShadow:"0 6px 20px rgba(0,0,0,.55)",
          border:"2px solid rgba(255,255,255,.18)",
        }}
      >
        <ParticipantTile participant={bubble} isLocal={bubble.identity===localIdentity} size="normal" pip/>
      </div>
    </div>
  );
};

// 3×3 = 9 tiles is the largest a single page will hold before spilling to the next page.
export const GRID_PAGE_SIZE=9;

/* ══ PAGED GRID — 3+ participants ══
   3 → 2 up / 1 down (centered)     4 → 2×2
   5..9 → capped at 3 columns, growing rows (shrinking tiles) up to 3×3
   >9 → split into pages of 9, swipeable left/right with a page-dot indicator */
export const PagedGrid=({participants,localIdentity,isMobile}:{participants:any[];localIdentity?:string;isMobile:boolean})=>{
  const n=participants.length;
  const pageCount=Math.max(1,Math.ceil(n/GRID_PAGE_SIZE));
  const[page,setPage]=useState(0);
  useEffect(()=>{ if(page>pageCount-1)setPage(0); },[pageCount,page]);

  const touchStartX=useRef<number|null>(null);
  const onTouchStart=(e:React.TouchEvent)=>{touchStartX.current=e.touches[0].clientX;};
  const onTouchEnd=(e:React.TouchEvent)=>{
    if(touchStartX.current==null)return;
    const dx=e.changedTouches[0].clientX-touchStartX.current;
    touchStartX.current=null;
    if(Math.abs(dx)<50)return; // ignore taps/small jitters
    if(dx<0&&page<pageCount-1)setPage(p=>p+1); // swiped left → next page
    if(dx>0&&page>0)setPage(p=>p-1);           // swiped right → previous page
  };

  const pageParticipants=participants.slice(page*GRID_PAGE_SIZE,(page+1)*GRID_PAGE_SIZE);
  const pn=pageParticipants.length;
  const isFirstPage=page===0;

  // Special asymmetric layout only applies to the true 3-person call (first/only page)
  if(isFirstPage&&n===3){
    return(
      <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",gap:2,padding:2,background:"#0a0a0a"}}>
        <div style={{display:"flex",gap:2,flex:1,minHeight:0}}>
          {pageParticipants.slice(0,2).map(p=>(
            <div key={p.identity} style={{flex:1,minWidth:0,borderRadius:isMobile?8:10,overflow:"hidden"}}>
              <ParticipantTile participant={p} isLocal={p.identity===localIdentity} size="normal"/>
            </div>
          ))}
        </div>
        <div style={{display:"flex",flex:1,minHeight:0,justifyContent:"center"}}>
          <div style={{width:"50%",minWidth:0,borderRadius:isMobile?8:10,overflow:"hidden"}}>
            <ParticipantTile participant={pageParticipants[2]} isLocal={pageParticipants[2].identity===localIdentity} size="normal"/>
          </div>
        </div>
      </div>
    );
  }

  const cols = (isFirstPage&&n===4) ? 2 : Math.min(3,pn);
  const rows = Math.ceil(pn/cols);

  return(
    <div style={{width:"100%",height:"100%",position:"relative",overflow:"hidden"}} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div style={{width:"100%",height:"100%",display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gridTemplateRows:`repeat(${rows},1fr)`,gap:2,padding:2,background:"#0a0a0a"}}>
        {pageParticipants.map(p=>(
          <div key={p.identity} style={{width:"100%",height:"100%",minWidth:0,minHeight:0,borderRadius:isMobile?8:10,overflow:"hidden"}}>
            <ParticipantTile participant={p} isLocal={p.identity===localIdentity} size="normal"/>
          </div>
        ))}
      </div>
      {pageCount>1&&(
        <div style={{position:"absolute",bottom:6,left:"50%",transform:"translateX(-50%)",display:"flex",gap:6,zIndex:5,padding:"4px 8px",background:"rgba(0,0,0,.4)",borderRadius:12}}>
          {Array.from({length:pageCount}).map((_,i)=>(
            <div key={i} onClick={()=>setPage(i)} style={{width:i===page?18:6,height:6,borderRadius:3,background:i===page?"#fff":"rgba(255,255,255,.4)",cursor:"pointer",transition:"width .2s"}}/>
          ))}
        </div>
      )}
    </div>
  );
};

/* ══ BOTTOM BAR — Google Meet premium ══ */
export const BottomBar=({sessionId,onToggleChat,onToggleParticipants,onEndClass,onLeaveClass,chatUnread,onToggleWhiteboard,whiteboardOpen,onGroupRecite,groupReciteMode,onShareMaterial,isPrivileged,canStudentWriteProp,canStudentRecProp,onPermChange,onMinimize,room,isMobile,onToggleMaterials,matPanelOpen,onSendEmoji,layout,onLayoutChange,onLaunchQuiz,onScreenShare,screenSharing,onToggleTimer,timerRunning,timerDisplay,onToggleLiveFiles,liveFilesOpen,onToggleHandQueue,onToggleAttendance,onSpotlight,onGenerateSummary,onTogglePartPanel,partPanelOpen,audioOnly,onToggleAudioOnly}:any)=>{
  const{user}=useAuth();
  const[micOn,setMicOn]=useState(false);
  const[camOn,setCamOn]=useState(false);
  const[handUp,setHandUp]=useState(false);
  const[moreOpen,setMoreOpen]=useState(false);
  const[emojisOpen,setEmojisOpen]=useState(false);
  const[audioPicker,setAudioPicker]=useState(false);
  const[videoPicker,setVideoPicker]=useState(false);
  const[camFacing,setCamFacing]=useState<"user"|"environment">("user");
  const[audioDevices,setAudioDevices]=useState<MediaDeviceInfo[]>([]);
  const[audioOutDevices,setAudioOutDevices]=useState<MediaDeviceInfo[]>([]); // speaker/headset/bluetooth output
  const[videoDevices,setVideoDevices]=useState<MediaDeviceInfo[]>([]);
  const[selAudio,setSelAudio]=useState("");
  const[selAudioOut,setSelAudioOut]=useState(""); // active speaker/output device
  const[selVideo,setSelVideo]=useState("");
  const[liveCount,setLiveCount]=useState(0);
  const micBusy=useRef(false);
  const camBusy=useRef(false);
  // Long-press support: holding the main mic/cam button (not just the small
  // chevron) opens the same device-options sheet — mic → mic/speaker/
  // headset/bluetooth picker, cam → camera list + front/back flip. A quick
  // tap still toggles mic/cam as normal; only a sustained press (450ms)
  // opens the sheet, and we suppress the click that follows a long-press so
  // it doesn't also toggle the mic/cam right after opening the menu.
  const lpTimer=useRef<any>(null);
  const lpFired=useRef(false);
  const startLongPress=(cb:()=>void)=>{
    lpFired.current=false;
    clearTimeout(lpTimer.current);
    lpTimer.current=setTimeout(()=>{lpFired.current=true;cb();},450);
  };
  const cancelLongPress=()=>{clearTimeout(lpTimer.current);};
  const clickAfterLongPress=(action:()=>void)=>{
    if(lpFired.current){lpFired.current=false;return;} // sheet already opened — swallow the click
    action();
  };
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
    const onJoin=()=>{update();try{playJoinSound();}catch{}};
    const onLeave=()=>{update();try{playLeaveSound();}catch{}};
    room.on(RoomEvent.ParticipantConnected,onJoin);room.on(RoomEvent.ParticipantDisconnected,onLeave);
    return()=>{room.off(RoomEvent.ParticipantConnected,onJoin);room.off(RoomEvent.ParticipantDisconnected,onLeave);};
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
    // Speaker/headset/Bluetooth output — browser labels whatever the OS
    // reports (e.g. "Bluetooth Headset", "AirPods", device's own name).
    setAudioOutDevices(all.filter(d=>d.kind==="audiooutput"));
    try{const cur=await room.getActiveDevice("audioinput");if(cur)setSelAudio(cur);}catch{}
    try{const cur=await room.getActiveDevice("audiooutput");if(cur)setSelAudioOut(cur);}catch{}
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
  const switchAudioOut=async(id:string)=>{
    try{
      await room.switchActiveDevice("audiooutput",id);
      setSelAudioOut(id);
      toast({title:"Speaker switched ✓"});
    }catch(e:any){
      // setSinkId isn't supported in every browser (notably iOS Safari) —
      // fail gracefully rather than leaving the user with a stuck spinner.
      toast({title:"Could not switch speaker",description:e?.message||"Not supported on this browser",variant:"destructive"});
    }
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
      await queueMediaOp(room, async () => {
        await room.localParticipant.setCameraEnabled(false);
        await new Promise(r=>setTimeout(r,200));
        await room.localParticipant.setCameraEnabled(true,{facingMode:next}as any);
      });
      setCamFacing(next);toast({title:next==="environment"?"🔄 Back camera":"🔄 Front camera"});
    }catch{toast({title:"Could not flip camera",variant:"destructive"});}
    setVideoPicker(false);
  };
  const toggleMic=async()=>{
    if(!room?.localParticipant||micBusy.current)return;
    micBusy.current=true;
    try{await queueMediaOp(room, () => room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled));}
    catch(e){console.error("toggleMic:",e);}finally{micBusy.current=false;}
  };
  const toggleCam=async()=>{
    if(!room?.localParticipant||camBusy.current)return;
    camBusy.current=true;
    try{await queueMediaOp(room, () => room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled));}
    catch(e){console.error("toggleCam:",e);}finally{camBusy.current=false;}
  };
  const toggleHand=async()=>{
    if(!user||!sessionId)return;
    const n=!handUp;setHandUp(n);
    await supabase.from("class_participants").update({hand_raised:n,hand_raised_at:n?new Date().toISOString():null}).eq("session_id",sessionId).eq("student_id",user.id);
    try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"hand_raise",identity:room.localParticipant.identity,name:room.localParticipant.name||user?.user_metadata?.full_name||"Student",raised:n})),{reliable:true});}catch{}
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

    {/* Audio picker — microphone AND speaker/headset/Bluetooth output */}
    {audioPicker&&portal&&createPortal(
      <div className="gm-sheet" style={{bottom:audioPickerPos.bottom,left:(audioPickerPos as any).left,maxHeight:"70vh",overflowY:"auto"}}>
        <div style={{padding:"13px 16px",borderBottom:"1px solid rgba(255,255,255,.07)",fontSize:12,fontWeight:600,color:"rgba(255,255,255,.6)",fontFamily:"'Google Sans',sans-serif",letterSpacing:.3}}>🎤 Microphone</div>
        {audioDevices.map(d=>(<DeviceRow key={d.deviceId} label={d.label||"Microphone "+d.deviceId.slice(0,6)} selected={selAudio===d.deviceId} onClick={()=>switchAudio(d.deviceId)}/>))}
        {audioDevices.length===0&&<p style={{fontSize:12,color:"rgba(255,255,255,.3)",padding:14,textAlign:"center"}}>No microphones found</p>}

        <div style={{padding:"13px 16px",borderTop:"1px solid rgba(255,255,255,.07)",borderBottom:"1px solid rgba(255,255,255,.07)",fontSize:12,fontWeight:600,color:"rgba(255,255,255,.6)",fontFamily:"'Google Sans',sans-serif",letterSpacing:.3}}>🔊 Speaker / Headset / Bluetooth</div>
        {audioOutDevices.map(d=>(<DeviceRow key={d.deviceId} label={d.label||"Speaker "+d.deviceId.slice(0,6)} selected={selAudioOut===d.deviceId} onClick={()=>switchAudioOut(d.deviceId)}/>))}
        {audioOutDevices.length===0&&<p style={{fontSize:12,color:"rgba(255,255,255,.3)",padding:14,textAlign:"center"}}>No output devices found (or not supported on this browser)</p>}
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
        {/* Minimize — keeps the class alive as a floating overlay so audio
            survives Android backgrounding/tab-killing, instead of relying on
            the OS back/home button (which some devices fully suspend). */}
        {onMinimize&&(
          <button className="gm-more-item" onClick={()=>{onMinimize();setMoreOpen(false);}}>
            <Minimize2 style={{width:16,height:16,opacity:.7}}/> Minimize
          </button>
        )}
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
          {/* Screen share — mobile more menu */}
          <button className="gm-more-item" onClick={()=>{onScreenShare();setMoreOpen(false);}} style={{color:screenSharing?"#34d399":"#e8eaed"}}>
            <Monitor style={{width:16,height:16}}/> {screenSharing?"Stop Screen Share":"Share Screen"}
          </button>
        </>}
        <button className="gm-more-item" onClick={()=>{setEmojisOpen(true);setMoreOpen(false);}}>
          <Smile style={{width:16,height:16,opacity:.7}}/> Send a Reaction
        </button>
        <button className="gm-more-item" onClick={()=>{onToggleMaterials();setMoreOpen(false);}}>
          <Eye style={{width:16,height:16,opacity:.7}}/> Subject Materials
        </button>
        {isPrivileged&&<>
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
          {/* Hand queue */}
          <button className="gm-more-item" onClick={()=>{onToggleHandQueue();setMoreOpen(false);}}>
            <Hand style={{width:16,height:16,color:"#fbbf24"}}/> Hand Queue
          </button>
          {/* Live attendance */}
          <button className="gm-more-item" onClick={()=>{onToggleAttendance();setMoreOpen(false);}}>
            <UserCheck style={{width:16,height:16,color:"#34d399"}}/> Live Attendance
          </button>
          {/* Session summary */}
          <button className="gm-more-item" onClick={()=>{onGenerateSummary();setMoreOpen(false);}}>
            <ClipboardList style={{width:16,height:16,color:"#60a5fa"}}/> Session Summary
          </button>
          {/* Feature 2: Audio-only mode — saves ~270kbps, best for weak connections */}
          <button className="gm-more-item" onClick={()=>{onToggleAudioOnly?.();setMoreOpen(false);}} style={{color:audioOnly?"#fbbf24":undefined}}>
            <Zap style={{width:14,height:14,color:audioOnly?"#fbbf24":"#a3e635"}}/> {audioOnly?"Exit Audio-Only Mode":"⚡ Audio-Only Mode"}
          </button>
        </>}
      </div>,portal
    )}

    {/* Student "Record" control moved to the top header bar, beside the
        participant-count badge — see ClassroomView's header row. It needs
        the lifted stuRec/toggleStuRecordTop state (shared with
        SubjectMaterialsPanel) rather than a second, separate local copy of
        the same feature living down here in the bottom bar. */}

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
          {/* Mic pill — long-press for mic & speaker options */}
          <div ref={micBtnRef} style={{display:"flex",alignItems:"center",background:"#e2e5e9",borderRadius:12,overflow:"hidden",height:44,flexShrink:0}}>
            <button
              onClick={()=>clickAfterLongPress(toggleMic)}
              onMouseDown={()=>startLongPress(openAudioPicker)} onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress}
              onTouchStart={()=>startLongPress(openAudioPicker)} onTouchEnd={cancelLongPress} onTouchCancel={cancelLongPress}
              title="Tap to mute/unmute · Hold for mic & speaker options"
              style={{width:56,height:44,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:"transparent",color:"#202124"}}>
              {micOn?<Mic style={{width:20,height:20,color:"#202124"}}/>:<MicOff style={{width:20,height:20,color:"#202124"}}/>}
            </button>
          </div>

          {/* Cam pill — long-press for camera options / flip */}
          <div ref={camBtnRef} style={{display:"flex",alignItems:"center",background:"#e2e5e9",borderRadius:12,overflow:"hidden",height:44,flexShrink:0}}>
            <button
              onClick={()=>clickAfterLongPress(toggleCam)}
              onMouseDown={()=>startLongPress(openVideoPicker)} onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress}
              onTouchStart={()=>startLongPress(openVideoPicker)} onTouchEnd={cancelLongPress} onTouchCancel={cancelLongPress}
              title="Tap to turn camera on/off · Hold for camera options"
              style={{width:56,height:44,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:"transparent"}}>
              {camOn?<Video style={{width:20,height:20,color:"#202124"}}/>:<VideoOff style={{width:20,height:20,color:"#202124"}}/>}
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
              <button className={`gm-av-main${micOn?"":" off"}`}
                onClick={()=>clickAfterLongPress(toggleMic)}
                onMouseDown={()=>startLongPress(openAudioPicker)} onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress}
                onTouchStart={()=>startLongPress(openAudioPicker)} onTouchEnd={cancelLongPress} onTouchCancel={cancelLongPress}
                title={(micOn?"Mute microphone":"Unmute microphone")+" · Hold for mic & speaker options"}>
                {micOn?<Mic style={IS}/>:<MicOff style={IS}/>}
              </button>
            </div>
            <div ref={camBtnRef} className="gm-av-group">
              <button className={`gm-av-main${camOn?"":" off"}`}
                onClick={()=>clickAfterLongPress(toggleCam)}
                onMouseDown={()=>startLongPress(openVideoPicker)} onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress}
                onTouchStart={()=>startLongPress(openVideoPicker)} onTouchEnd={cancelLongPress} onTouchCancel={cancelLongPress}
                title={(camOn?"Turn off camera":"Turn on camera")+" · Hold for camera options"}>
                {camOn?<Video style={IS}/>:<VideoOff style={IS}/>}
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
            {/* Screen share — all users */}
            <Ctrl icon={screenSharing?<MonitorOff style={{...IS,color:"#34d399"}}/>:<Monitor style={{...IS,color:"#e8eaed"}}/>} label={screenSharing?"Stop Share":"Share"} onClick={onScreenShare} active={screenSharing} tooltip={screenSharing?"Stop screen share":"Share screen"}/>
            <Ctrl icon={<MessageCircle style={{...IS,color:"#e8eaed"}}/>} label="Chat" onClick={onToggleChat} badge={chatUnread} tooltip="Open chat"/>
            {/* Participants — desktop */}
            <Ctrl icon={<Users style={{...IS,color:partPanelOpen?"#8ab4f8":"#e8eaed"}}/>} label="People" onClick={onTogglePartPanel} active={partPanelOpen} tooltip="Participants"/>
            <Ctrl icon={<Smile style={{...IS,color:emojisOpen?"#fbbf24":"#e8eaed"}}/>} label="React" onClick={()=>{setEmojisOpen(v=>!v);setMoreOpen(false);setAudioPicker(false);setVideoPicker(false);}} active={emojisOpen} tooltip="Send a reaction"/>
            {/* Timer indicator */}
            {timerRunning&&<div style={{display:"flex",alignItems:"center",gap:4,background:"rgba(251,191,36,.15)",border:"1px solid rgba(251,191,36,.3)",borderRadius:20,padding:"4px 10px",animation:"timer-pulse 1s ease-in-out infinite",cursor:"pointer"}} onClick={onToggleTimer}><Timer style={{width:13,height:13,color:"#fbbf24"}}/><span style={{fontSize:12,fontWeight:700,color:"#fbbf24",fontVariantNumeric:"tabular-nums"}}>{timerDisplay}</span></div>}
            <Ctrl icon={<MoreVertical style={{...IS,color:"#e8eaed"}}/>} label="More" bRef={moreBtnRef} onClick={openMore} active={moreOpen} tooltip="More options"/>
          </div>
          {/* RIGHT */}
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            <button className="gm-leave" onClick={isPrivileged?onEndClass:onLeaveClass}>
              <Phone style={{width:16,height:16,transform:"rotate(135deg)"}}/>
              {isPrivileged?"End":"Leave"}
            </button>
          </div>
        </>
      )}
    </div>
  </>);
};
export const BottomBarBridge=(props:any)=>{const room=useRoomContext();const isMobile=useIsMobile();return<BottomBar {...props} room={room} isMobile={isMobile}/>;};
/* ══ MAIN ══ */
/* ══ ROOM - CONTEXT BRIDGE ══
   Lives INSIDE LiveKitRoom. Always mounted regardless of phase.
   Registers reliable mic/cam toggle functions into LiveClassContext
   so the GlobalClassroomOverlay pill can call them even when minimized.
   This replaces the fragile ClassControls-based ref registration.      */
export const RoomToContextBridge = () => {
  const room = useRoomContext();
  const { setMicEnabled, setCamEnabled, setHasConnected, toggleMicFnRef, toggleCamFnRef, restoreMicFnRef, getLocalCameraTrackRef } = useLiveClass();

  // Re-register on every render so closures are always fresh
  useEffect(() => {
    toggleMicFnRef.current = async () => {
      try {
        const next = !room.localParticipant.isMicrophoneEnabled;
        await queueMediaOp(room, () => room.localParticipant.setMicrophoneEnabled(next));
        setMicEnabled(next);
      } catch {}
    };
    toggleCamFnRef.current = async () => {
      try {
        const next = !room.localParticipant.isCameraEnabled;
        // Student is deliberately choosing the camera state now — this is
        // never a network auto-disable, so clear the flag. Otherwise a
        // later network-quality-recovery event could still force the
        // camera back on/off based on a stale reason.
        cameraAutoDisabledByNetwork.current = false;
        await queueMediaOp(room, () => room.localParticipant.setCameraEnabled(next));
        setCamEnabled(next);
      } catch {}
    };
    // Background Picture-in-Picture keep-alive reads the live camera track
    // through this getter — it's called on demand, not stored, so it always
    // reflects whatever LiveKit is currently publishing.
    getLocalCameraTrackRef.current = () => {
      try {
        const pub = room.localParticipant.getTrackPublication?.(Track.Source.Camera);
        const mst = pub?.videoTrack?.mediaStreamTrack;
        if (mst && mst.readyState === "live" && !pub?.isMuted) return mst;
        return null;
      } catch { return null; }
    };
    // FIX: dedicated "ensure mic ON" fn used by GlobalClassroomOverlay when
    // returning from background — never accidentally toggles mic OFF.
    restoreMicFnRef.current = async () => {
      try {
        const lp = room.localParticipant;
        if (!lp.isMicrophoneEnabled) {
          await queueMediaOp(room, () => lp.setMicrophoneEnabled(true));
          setMicEnabled(true);
        }
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

/* ══ AUTO-ATTENDANCE SYNC ══
   Runs once when the host ends a class. Pulls the real join data from
   class_participants (who actually connected to this LiveKit session) and
   the subject's full enrolled roster (same lookup TeacherAttendance.tsx
   uses: courses→enrollments, private students, level-based), then upserts
   manual_attendance so the Attendance pages are pre-filled with everyone
   who joined marked present and everyone who didn't marked absent —
   instead of starting from "everyone absent" and requiring a manual pass. */
export const syncManualAttendanceFromSession=async(sessionId:string,subject:any,hostUserId:string)=>{
  if(!sessionId||!subject?.id)return;
  const subjectId=subject.id;
  const teacherId=subject.teacher_id||hostUserId;
  const todayStr=new Date().toISOString().split("T")[0];

  // ── Who actually joined this session (ground truth from the live room) ──
  const{data:participants}=await supabase.from("class_participants").select("student_id").eq("session_id",sessionId);
  const joinedIds=new Set((participants||[]).map((p:any)=>p.student_id));
  if(joinedIds.size===0)return; // nobody joined — nothing meaningful to sync

  // ── Full enrolled roster for this subject (mirrors TeacherAttendance.tsx) ──
  const{data:courses}=await supabase.from("courses").select("id").eq("subject_id",subjectId);
  const courseIds=(courses||[]).map((c:any)=>c.id);
  let enrolledIds:string[]=[];
  if(courseIds.length>0){
    const{data:enrollments}=await supabase.from("enrollments").select("user_id").in("course_id",courseIds);
    enrolledIds=[...new Set((enrollments||[]).map((e:any)=>e.user_id))];
  }
  const{data:privateStudents}=await supabase.from("profiles").select("user_id").eq("assigned_teacher_id",teacherId).eq("student_type","private");
  const privateIds=(privateStudents||[]).map((p:any)=>p.user_id);
  const subjectLevels:string[]=subject.levels||(subject.level?[subject.level]:[]);
  let levelIds:string[]=[];
  if(subjectLevels.length>0){
    const{data:lvlStudents}=await supabase.from("profiles").select("user_id").in("level",subjectLevels);
    levelIds=(lvlStudents||[]).map((p:any)=>p.user_id);
  }
  const roster=new Set<string>([...enrolledIds,...privateIds,...levelIds,...joinedIds]); // include joiners even if roster lookup missed them

  const rows=[...roster].map(studentId=>({
    session_id:sessionId,subject_id:subjectId,teacher_id:teacherId,student_id:studentId,
    date:todayStr,status:joinedIds.has(studentId)?"present":"absent",
  }));
  if(rows.length===0)return;
  try{
    await supabase.from("manual_attendance").upsert(rows,{onConflict:"session_id,student_id"});
    // Nudge the teacher to review/confirm rather than leaving this silent —
    // deep-links straight into the pre-filled mark screen for this session.
    const subjectLabel=subject.title||"Class";
    const summary=`${subjectLabel}: ${joinedIds.size}/${rows.length} students detected present. Tap to confirm.`;
    const teacherLink=`/teacher/attendance?subjectId=${subjectId}&date=${todayStr}&sessionId=${sessionId}`;
    await supabase.from("notifications").insert({
      user_id:teacherId, title:"Attendance ready to review",
      message:summary, type:"info", link:teacherLink, is_read:false,
    });
    // Also let admins know — they review from /admin/attendance, not the teacher's page.
    const{data:admins}=await supabase.from("user_roles").select("user_id").eq("role","admin");
    const adminIds=[...new Set((admins||[]).map((a:any)=>a.user_id))].filter(id=>id!==teacherId);
    if(adminIds.length>0){
      await supabase.from("notifications").insert(adminIds.map(id=>({
        user_id:id, title:"Attendance ready to review",
        message:summary, type:"info", link:"/admin/attendance", is_read:false,
      })));
    }
  }catch(e){console.warn("[syncManualAttendanceFromSession] upsert failed:",e);}
};

