/*
ClassroomView.tsx — Tahleem Academy Live Classroom
Google Meet-style UI · iOS-safe · Persistent call context
*/
import {
LiveKitRoom, RoomAudioRenderer, useRoomContext,
useParticipants, useLocalParticipant,
} from "@livekit/components-react";
// @ts-ignore
import "@livekit/components-styles";
import { Track, RoomEvent, ConnectionState } from "livekit-client";
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
Volume2, ChevronDown, Users, Eye,
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
const GLASSB= "rgba(255,255,255,0.08)";const GREEN = "#22c55e";
const RED   = "#ef4444";
const BAR_H = 76;

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
animation: tile-in .22s cubic-bezier(.34,1.56,.64,1) both;transition: box-shadow .2s ease;
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
}@media (hover:hover) and (pointer:fine) {
.gm-ctrl:hover .gm-tooltip { opacity:1; }
}
/* Meet-style name badge */
.gm-name {
position:absolute; bottom:0; left:0; right:0;
padding:24px 12px 8px;
background:linear-gradient(transparent,rgba(0,0,0,.7));
display:flex; align-items:center; gap:6px;
}
.gm-name-text {
font-size:13px; font-weight:500; color:#fff;
overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;
font-family:'Google Sans',sans-serif;
text-shadow:0 1px 3px rgba(0,0,0,.5);
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
width:48px; height:48px; display:flex; align-items:center; justify-content:center;background:rgba(255,255,255,.1); border:none; cursor:pointer; color:#fff;
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
.gm-more-item {width:100%; display:flex; align-items:center; gap:12px;
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

/* ══ RECONNECT MONITOR ══ */
const ReconnectMonitor = ({ onReconnecting, onReconnected, onDisconnected }: {
onReconnecting: () => void;
onReconnected:  () => void;
onDisconnected: () => void;
}) => {
const room = useRoomContext();
const graceTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
const hiddenAt     = useRef<number | null>(null);const wsDropped    = useRef(false);

useEffect(() => {
const clearGrace = () => {
if (graceTimer.current) { clearTimeout(graceTimer.current); graceTimer.current = null; }
hiddenAt.current = null;
wsDropped.current = false;
};

const handleDisconnect = () => {
  wsDropped.current = true;
  if (graceTimer.current) return;
  onDisconnected();
};

room.on(RoomEvent.Reconnecting, onReconnecting);
room.on(RoomEvent.Reconnected,  onReconnected);
room.on(RoomEvent.Disconnected, handleDisconnect);

const onVis = async () => {
  if (document.visibilityState === "hidden") {
    hiddenAt.current = Date.now();
    graceTimer.current = setTimeout(() => {
      graceTimer.current = null;
      if (wsDropped.current || room.state === ConnectionState.Disconnected) {
        onDisconnected();
      }
    }, 5 * 60 * 1000);
    return;
  }

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
  room.off(RoomEvent.Reconnecting, onReconnecting);  room.off(RoomEvent.Reconnected,  onReconnected);
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

/* ══ ADMIN MUTE LISTENER ══ */
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
return () => { room.off(RoomEvent.DataReceived, h); };}, [room, isPrivileged]);
return null;
};

const MediaAutoPublish = ({ lobbyMic = false, lobbyCam = false }: { lobbyMic?: boolean; lobbyCam?: boolean }) => {
const room = useRoomContext();
const optsRef = useRef({ lobbyMic, lobbyCam });
optsRef.current = { lobbyMic, lobbyCam };
useEffect(() => {
let cancelled = false;
const init = async () => {
await new Promise(r => setTimeout(r, 450));
if (cancelled) return;
try {
const lp = room.localParticipant;
const { lobbyMic: mic, lobbyCam: cam } = optsRef.current;
if (lp.isMicrophoneEnabled !== mic) await lp.setMicrophoneEnabled(mic);
if (lp.isCameraEnabled     !== cam) await lp.setCameraEnabled(cam);
} catch {}
};
init();
return () => { cancelled = true; };
}, []);
return null;
};

/* ══ ROOM DATA LISTENER ══ */
const RoomDataListener = ({ onWbOpen,onWbClose,strokesBuffer,onMatOpen,onMatClose,onWbAllowWrite,onRecAllowed,onEmojiReact,onGroupRecite,onHandRaise, onAdminMuteAll,onClassEnded,roomRef }:any) => {
const room = useRoomContext();
useEffect(() => {
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
room.on(RoomEvent.DataReceived,h);return ()=>{ room.off(RoomEvent.DataReceived,h); if(roomRef) roomRef.current=null; };
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
{fe.sender && <span style={{fontSize:10,fontWeight:700,color:"#fff",background:"rgba(0,0,0,.55)",borderRadius:8,padding:"1px 6px",whiteSpace:"nowrap",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis"}}>{fe.sender}</span>}
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
The teacher has started Group Recitation. <br/>Allow your microphone so everyone can recite together?
 </p>
 <div style={{display:"flex",gap:10}}>
 <button onClick={onDecline} style={{flex:1,padding:"11px",borderRadius:12,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.07)",color:"rgba(255,255,255,.7)",fontSize:13,fontWeight:600,cursor:"pointer"}}>Not Now</button>
 <button onClick={onAccept} style={{flex:1,padding:"11px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${TEAL2},${TEAL})`,color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer"}}>Allow Mic ✓</button>
 </div> </div>
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

const LayoutSwitcher=({layout,onChange,isMobile}:{layout:LayoutMode;onChange:(m:LayoutMode)=>void;isMobile:boolean})=>{
const[open,setOpen]=useState(false);
const cur=LAYOUT_OPTIONS.find(o=>o.mode===layout)||LAYOUT_OPTIONS[0];
// Filter out "horizontal" (Side by side) on mobile
const mobileOptions = isMobile ? LAYOUT_OPTIONS.filter(o => o.mode !== "horizontal") : LAYOUT_OPTIONS;

return(
 <div style={{position:"relative"}}>
 <button className="gm-layout-btn" onClick={()=>setOpen(v=>!v)} title="Change layout">
 <cur.icon style={{width:13,height:13,opacity:.8}}/>{cur.label}
 <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor" style={{opacity:.5,marginLeft:2}}><path d="M4 5L0 0h8z"/></svg>
 </button>
{open && createPortal(
 <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:9200}}>
 <div onClick={e=>e.stopPropagation()} style={{
position:"fixed",top:60,right:14,
background:"#2D2E30",border:"1px solid rgba(255,255,255,.08)",
borderRadius:12,overflow:"hidden",minWidth:180,
boxShadow:"0 8px 36px rgba(0,0,0,.65)",animation:"fade-in .15s ease",
}}>
{mobileOptions.map(o=>(
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
{layout===o.mode && <span style={{marginLeft:"auto",fontSize:11,color:"#8ab4f8"}}>✓</span>}
 </button>
))} </div>
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

/* ══ PARTICIPANT TILE — Google Meet premium style ══ */
const ParticipantTile=({participant,isLocal,size="normal"}:{participant:any;isLocal:boolean;size?: "normal"|"large"|"small"})=>{
const videoRef=useRef<HTMLVideoElement>(null);
const[hasVideo,setHasVideo]=useState(false);
const[isSpeaking,setIsSpeaking]=useState(false);
const[micEnabled,setMicEnabled]=useState(true);
const room=useRoomContext();

const attachVideo=useCallback(()=>{
let pub=participant.getTrackPublication?.(Track.Source.Camera);
if(!pub){participant.trackPublications?.forEach?.((p:any)=>{if(p.source===Track.Source.Camera||p.kind==="video")pub=pub||p;});}
const track=pub?.videoTrack||pub?.track;
const mst=track?.mediaStreamTrack;
if(mst && mst.readyState==="live" && !pub?.isMuted && videoRef.current){
if(!(videoRef.current.srcObject instanceof MediaStream)||(videoRef.current.srcObject as MediaStream).getTracks()[0]?.id!==mst.id){
videoRef.current.srcObject=new MediaStream([mst]);
}
if(isLocal)videoRef.current.muted=true;
videoRef.current.play().catch(()=>{});
setHasVideo(true);
}else{
if(videoRef.current && videoRef.current.srcObject)videoRef.current.srcObject=null;
setHasVideo(false);
}
let micPub=participant.getTrackPublication?.(Track.Source.Microphone);
if(!micPub)participant.trackPublications?.forEach?.((p:any)=>{if(p.source===Track.Source.Microphone)micPub=micPub||p;});
setMicEnabled(!(micPub?.isMuted??false));
},[participant,isLocal]);
useEffect(()=>{
attachVideo();
const onSpeak=(v:boolean)=>setIsSpeaking(v);
participant.on?.("trackSubscribed",attachVideo);
participant.on?.("trackUnsubscribed",attachVideo);
participant.on?.("trackMuted",attachVideo);
participant.on?.("trackUnmuted",attachVideo);
participant.on?.("trackPublished",attachVideo);
participant.on?.("trackUnpublished",attachVideo);
participant.on?.("isSpeakingChanged",onSpeak);
if(isLocal){
room.on(RoomEvent.LocalTrackPublished,attachVideo);
room.on(RoomEvent.LocalTrackUnpublished,attachVideo);
room.on(RoomEvent.TrackMuted,attachVideo);
room.on(RoomEvent.TrackUnmuted,attachVideo);
}
const poll=setInterval(attachVideo,1500);
return()=>{
clearInterval(poll);
participant.off?.("trackSubscribed",attachVideo);
participant.off?.("trackUnsubscribed",attachVideo);
participant.off?.("trackMuted",attachVideo);
participant.off?.("trackUnmuted",attachVideo);
participant.off?.("trackPublished",attachVideo);
participant.off?.("trackUnpublished",attachVideo);
participant.off?.("isSpeakingChanged",onSpeak);
if(isLocal){
room.off(RoomEvent.LocalTrackPublished,attachVideo);
room.off(RoomEvent.LocalTrackUnpublished,attachVideo);
room.off(RoomEvent.TrackMuted,attachVideo);
room.off(RoomEvent.TrackUnmuted,attachVideo);
}
};
},[participant,attachVideo,room,isLocal]);

const name=participant.name||participant.identity||"User";
const initials=name.split(" ").map((w:string)=>w[0]||"").join("").slice(0,2).toUpperCase()||"?";
const avatarSz = size==="large" ? 80 : size==="small" ? 40 : 56;
const avatarFs = size==="large" ? 30 : size==="small" ? 16 : 20;
const speakBorder = isSpeaking ? "2px solid #1a73e8" : "2px solid transparent";

return(
 <div className={`gm-tile${isSpeaking?" speaking":""}`} style={{width:"100%",height:"100%",border:speakBorder,transition:"border-color .2s"}}>
 <video ref={videoRef} autoPlay playsInline muted={isLocal}
style={{width:"100%",height:"100%",objectFit:"cover",display:hasVideo?"block":"none",transform:isLocal?"scaleX(-1)":"none",background:"#202124"}}/>
 {!hasVideo && (
   <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"#2D2E30",flexDirection:"column",gap:12}}>
    <div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(circle at center,rgba(255,255,255,.03) 1px,transparent 1px)",backgroundSize:"28px 28px",pointerEvents:"none"}}/>
    <div className="gm-avatar" style={{width:avatarSz,height:avatarSz,fontSize:avatarFs,boxShadow:isSpeaking?"0 0 0 3px #1a73e8,0 0 24px rgba(26,115,232,.3)":"0 4px 20px rgba(0,0,0,.4)",transition:"box-shadow .2s"}}>      {initials}
    </div>
    {isSpeaking && (
     <div className="gm-wave">
      {[0,1,2,3].map(i=>(<div key={i} className="gm-wave-bar" style={{height:14,animationDelay:`${i*.1}s`,animationDuration:".6s"}}/>))}
     </div>
    )}
   </div>
 )}
 {isSpeaking && hasVideo && (<div style={{position:"absolute",inset:0,border:"3px solid #1a73e8",borderRadius:"inherit",pointerEvents:"none",transition:"opacity .2s"}}/>)}
 <div className="gm-name">
  {isSpeaking && hasVideo && (<div className="gm-wave" style={{marginRight:4}}>{[0,1,2].map(i=>(<div key={i} className="gm-wave-bar" style={{height:11,animationDelay:`${i*.12}s`}}/>))}</div>)}
  <span className="gm-name-text">{name}{isLocal?" (You)":""}</span>
  <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,background:micEnabled?"rgba(0,0,0,.4)":"rgba(234,67,53,.85)",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>
   {micEnabled ? <Mic style={{width:12,height:12,color:"#fff"}}/> : <MicOff style={{width:12,height:12,color:"#fff"}}/>}
  </div>
 </div>
 </div>
);
};

/* ══ VIDEO GRID ══ */
const VideoGrid=({layout="grid"}:{layout?:LayoutMode})=>{
const{localParticipant}=useLocalParticipant();
const allParticipants=useParticipants();
const remotes=allParticipants.filter(p=>p.identity!==localParticipant?.identity);
const all=localParticipant?[localParticipant,...remotes]:remotes;
const n=all.length;

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
{n>1 && <div style={{width:130,display:"flex",flexDirection:"column",gap:6,overflowY:"auto"}}>
{all.slice(1).map(p=>(<div key={p.identity} style={{height:88,flexShrink:0}}><ParticipantTile participant={p} isLocal={p.identity===localParticipant?.identity} size="small"/></div>))}
 </div>}
 </div>);

if(layout==="horizontal")return(
 <div style={{width:"100%",height:"100%",display:"flex",gap:6,padding:6,boxSizing:"border-box"}}>
{all.map(p=>(<div key={p.identity} style={{flex:1,minWidth:0,height:"100%"}}><ParticipantTile participant={p} isLocal={p.identity===localParticipant?.identity} size={n===1?"large":"normal"}/></div>))}
 </div>
);

if(layout==="vertical")return(
 <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",gap:6,padding:6,boxSizing:"border-box"}}>
{all.map(p=>(<div key={p.identity} style={{flex:1,minHeight:0,width:"100%"}}><ParticipantTile participant={p} isLocal={p.identity===localParticipant?.identity} size={n===1?"large":"normal"}/></div>))}
 </div>
);

if(layout==="focus"){
const local=all.find(p=>p.identity===localParticipant?.identity)||all[0];
const others=all.filter(p=>p.identity!==local?.identity);
return(
 <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",gap:6,padding:6,boxSizing:"border-box"}}>
 <div style={{flex:1,minHeight:0}}>{local && <ParticipantTile participant={local} isLocal size="large"/>}</div>
{others.length>0 && <div style={{height:96,display:"flex",gap:6,flexShrink:0,overflowX:"auto"}}>
{others.map(p=>(<div key={p.identity} style={{width:128,flexShrink:0}}><ParticipantTile participant={p} isLocal={false} size="small"/></div>))}
 </div>}
 </div>
);
}

if(n===1)return(<div style={{width:"100%",height:"100%",padding:6,boxSizing:"border-box"}}><ParticipantTile participant={all[0]} isLocal={all[0]?.identity===localParticipant?.identity} size="large"/></div>);

const COLS = n<=2?2:n<=4?2:n<=6?3:n<=9?3:4;
const ROWS = Math.ceil(n/COLS);
const isOdd = n%COLS!==0;

return(
 <div style={{width:"100%",height:"100%",display:"grid",gridTemplateColumns:`repeat(${COLS},1fr)`,gridTemplateRows:`repeat(${ROWS},1fr)`,gap:6,padding:6,boxSizing:"border-box"}}>
{all.map((p,i)=>{
const isLastLone=isOdd && i===n-1;
return(
 <div key={p.identity} style={isLastLone?{gridColumn:"1 / -1",display:"flex",justifyContent:"center"}:{}}>
 <div style={isLastLone?{width:`${100/COLS}%`,height:"100%"}:{width:"100%",height:"100%"}}>
 <ParticipantTile participant={p} isLocal={p.identity===localParticipant?.identity} size={n<=4?"normal":"small"}/>
 </div>
 </div>
);
})}
 </div>
);
};

/* ══ BOTTOM BAR — Google Meet premium ══ */const BottomBar=({sessionId,onToggleChat,onToggleParticipants,onEndClass,onLeaveClass,chatUnread,onToggleWhiteboard,whiteboardOpen,onGroupRecite,groupReciteMode,onShareMaterial,isPrivileged,canStudentWriteProp,canStudentRecProp,onPermChange,onMinimize,room,isMobile,onToggleMaterials,matPanelOpen,onSendEmoji,layout,onLayoutChange,onLaunchQuiz}:any)=>{
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
room.on(RoomEvent.LocalTrackPublished,sync);
room.on(RoomEvent.LocalTrackUnpublished,sync);
room.on(RoomEvent.TrackMuted,sync);
room.on(RoomEvent.TrackUnmuted,sync);
return()=>{
room.off(RoomEvent.LocalTrackPublished,sync);
room.off(RoomEvent.LocalTrackUnpublished,sync);
room.off(RoomEvent.TrackMuted,sync);
room.off(RoomEvent.TrackUnmuted,sync);
};
},[room]);

useEffect(()=>{
if(!room)return;
const update=()=>setLiveCount(room.numParticipants||0);
update();
room.on(RoomEvent.ParticipantConnected,update);
room.on(RoomEvent.ParticipantDisconnected,update);
return()=>{room.off(RoomEvent.ParticipantConnected,update);
room.off(RoomEvent.ParticipantDisconnected,update);
};
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
const pos=computePos(micBtnRef,"left");
if(pos)setAudioPickerPos(pos as any);
setAudioPicker(true);
setVideoPicker(false);
setMoreOpen(false);
setEmojisOpen(false);
};

const openVideoPicker=async()=>{
try{await navigator.mediaDevices.getUserMedia({video:true}).catch(()=>{});}catch{}
const all=await navigator.mediaDevices.enumerateDevices();
setVideoDevices(all.filter(d=>d.kind==="videoinput"));
try{const cur=await room.getActiveDevice("videoinput");if(cur)setSelVideo(cur);}catch{}
const pos=computePos(camBtnRef,"left");
if(pos)setVideoPickerPos(pos as any);
setVideoPicker(true);
setAudioPicker(false);
setMoreOpen(false);
setEmojisOpen(false);
};

const openMore=()=>{
const pos=computePos(moreBtnRef,"right");
if(pos)setMorePos(pos as any);
setMoreOpen(v=>!v);
setAudioPicker(false);
setVideoPicker(false);
setEmojisOpen(false);
};

const closeAll=()=>{
setAudioPicker(false);setVideoPicker(false);
setMoreOpen(false);
setEmojisOpen(false);
};

const switchAudio=async(id:string)=>{
try{
await room.switchActiveDevice("audioinput",id);
setSelAudio(id);
toast({title:"Microphone switched ✓"});
}catch(e:any){
toast({title:"Could not switch",description:e?.message,variant:"destructive"});
}
setAudioPicker(false);
};

const switchVideo=async(id:string)=>{
try{
await room.switchActiveDevice("videoinput",id);
setSelVideo(id);
toast({title:"Camera switched ✓"});
}catch(e:any){
toast({title:"Could not switch",description:e?.message,variant:"destructive"});
}
setVideoPicker(false);
};

const flipCamera=async()=>{
if(!room?.localParticipant||!camOn)return;
try{
const next=camFacing==="user"?"environment":"user";
await room.localParticipant.setCameraEnabled(false);
await new Promise(r=>setTimeout(r,200));
await room.localParticipant.setCameraEnabled(true,{facingMode:next}as any);
setCamFacing(next);
toast({title:next==="environment"?"🔄 Back camera":"🔄 Front camera"});
}catch{
toast({title:"Could not flip camera",variant:"destructive"});
}
setVideoPicker(false);
};

const toggleMic=async()=>{
if(!room?.localParticipant||micBusy.current)return;
micBusy.current=true;
try{
await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);
}catch(e){
console.error("toggleMic:",e);
}finally{micBusy.current=false;
}
};

const toggleCam=async()=>{
if(!room?.localParticipant||camBusy.current)return;
camBusy.current=true;
try{
await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled);
}catch(e){
console.error("toggleCam:",e);
}finally{
camBusy.current=false;
}
};

const toggleHand=async()=>{
if(!user||!sessionId)return;
const n=!handUp;
setHandUp(n);
await supabase.from("class_participants").update({hand_raised:n,hand_raised_at:n?new Date().toISOString():null}).eq("session_id",sessionId).eq("student_id",user.id);
try{
room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"hand_raise",identity:room.localParticipant.identity,name:room.localParticipant.name||user?.user_metadata?.full_name||"Student",raised:n})),{reliable:true});
}catch{}
};

const toggleStuRecord=async()=>{
if(stuRec){
stuMrRef.current?.stop();
stuMrRef.current!.onstop=()=>{
const mt=stuMrRef.current?.mimeType||"audio/webm";
const blob=new Blob(stuChunks.current,{type:mt});
const url=URL.createObjectURL(blob);
const a=document.createElement("a");
a.href=url;
a.download=`class-${Date.now()}.webm`;
a.click();
URL.revokeObjectURL(url);
stuChunks.current=[];
};
setStuRec(false);
}else{
try{
const s=await navigator.mediaDevices.getUserMedia({audio:true});
const mime=["audio/webm","audio/mp4","audio/ogg"].find(t=>{try{return MediaRecorder.isTypeSupported(t);}catch{return false;}})||"";
const mr=new MediaRecorder(s,mime?{mimeType:mime}:undefined);
stuChunks.current=[];
mr.ondataavailable=e=>{if(e.data.size>0)stuChunks.current.push(e.data);};
mr.start(1000);
stuMrRef.current=mr;setStuRec(true);
}catch{
toast({title:"Microphone access denied"});
}
}
};

const sendEmoji=(e:string)=>{
setEmojisOpen(false);
try{
room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"emoji_react",emoji:e,sender:user?.user_metadata?.full_name||""})),{reliable:false});
}catch{}
onSendEmoji?.(e);
if(user&&sessionId)supabase.from("class_chat_messages").insert({session_id:sessionId,sender_id:user.id,message:e,type:"reaction"});
};

const portal=typeof document!=="undefined"?document.body:null;
const SZ=isMobile?18:20;
const IS={width:SZ,height:SZ};

const Ctrl=({icon,label,onClick,active=false,danger=false,badge=0,bRef,tooltip}:{icon:React.ReactNode;label:string;onClick:()=>void;active?:boolean;danger?:boolean;badge?:number;bRef?:any;tooltip?:string})=>(
 <div ref={bRef} style={{position:"relative",flexShrink:0}}>
 <button className={`gm-ctrl${danger?" danger":active?" active":""}`} onClick={onClick} title={tooltip||label} style={{background:"none",border:"none",cursor:"pointer",padding:0,outline:"none"}}>
 <div className="gm-ctrl-icon">{icon}{badge>0 && <span style={{position:"absolute",top:2,right:2,background:"#ea4335",color:"#fff",borderRadius:"50%",width:16,height:16,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,border:"2px solid #202124"}}>{badge>9?"9+":badge}</span>}</div>
{!isMobile && <span className="gm-ctrl-label">{label}</span>}
 <div className="gm-tooltip">{tooltip||label}</div>
 </button>
 </div>
);

const DeviceRow=({label,selected,onClick}:{label:string;selected:boolean;onClick:()=>void})=>(
 <button onClick={onClick} className="gm-sheet-item" style={{color:selected?"#8ab4f8":"rgba(255,255,255,.75)"}}>
 <div style={{width:16,height:16,borderRadius:"50%",border:`2px solid ${selected?"#8ab4f8":"rgba(255,255,255,.3)"}`,background:selected?"#8ab4f8":"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
{selected && <div style={{width:5,height:5,borderRadius:"50%",background:"#202124"}}/>}
 </div>
 <span style={{fontSize:13,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:"'Google Sans',sans-serif"}}>{label}</span>
 </button>
);

return(<>
{(audioPicker||videoPicker||moreOpen||emojisOpen)&&portal&&createPortal(<div onClick={closeAll} style={{position:"fixed",inset:0,zIndex:9100}}/>,portal)}

{audioPicker && portal && createPortal(
 <div className="gm-sheet" style={{bottom:audioPickerPos.bottom,left:(audioPickerPos as any).left}}>
 <div style={{padding:"13px 16px",borderBottom:"1px solid rgba(255,255,255,.07)",fontSize:12,fontWeight:600,color:"rgba(255,255,255,.6)",fontFamily:"'Google Sans',sans-serif",letterSpacing:.3}}>🎤 Microphone</div>
{audioDevices.map(d=>(<DeviceRow key={d.deviceId} label={d.label||"Microphone "+d.deviceId.slice(0,6)} selected={selAudio===d.deviceId} onClick={()=>switchAudio(d.deviceId)}/>))}
{audioDevices.length===0 && <p style={{fontSize:12,color:"rgba(255,255,255,.3)",padding:14,textAlign:"center"}}>No microphones found</p>}
 </div>,portal
)}
{videoPicker && portal && createPortal(
 <div className="gm-sheet" style={{bottom:videoPickerPos.bottom,left:(videoPickerPos as any).left}}>
 <div style={{padding:"13px 16px",borderBottom:"1px solid rgba(255,255,255,.07)",fontSize:12,fontWeight:600,color:"rgba(255,255,255,.6)",fontFamily:"'Google Sans',sans-serif",letterSpacing:.3}}>📷 Camera</div>
{videoDevices.map(d=>(<DeviceRow key={d.deviceId} label={d.label||"Camera "+d.deviceId.slice(0,6)} selected={selVideo===d.deviceId} onClick={()=>switchVideo(d.deviceId)}/>))}
{videoDevices.length>1 && (<button onClick={flipCamera} className="gm-sheet-item" style={{color:"rgba(255,255,255,.7)",borderTop:"1px solid rgba(255,255,255,.07)",marginTop:0}}><SwitchCamera style={{width:14,height:14,opacity:.6,flexShrink:0}}/><span style={{fontSize:13,fontFamily:"'Google Sans',sans-serif"}}>Flip (Front / Back)</span></button>)}
{videoDevices.length===0 && <p style={{fontSize:12,color:"rgba(255,255,255,.3)",padding:14,textAlign:"center"}}>No cameras found</p>}
 </div>,portal
)}

{emojisOpen && portal && createPortal(
 <div className="gm-emoji-tray" style={{bottom:84+(isMobile?4:12)}}>
{["👏","🤲","❤️","😂","🌟","👍","🙏","🔥"].map(e=>(<button key={e} className="gm-emoji-btn" onClick={()=>sendEmoji(e)}>{e}</button>))}
 </div>,portal
)}

{moreOpen && portal && createPortal(
 <div className="gm-more-menu" style={{bottom:morePos.bottom,right:(morePos as any).right}}>
 <div style={{padding:"10px 16px 8px",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
 <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,.35)",letterSpacing:.8,textTransform:"uppercase",marginBottom:8,fontFamily:"'Google Sans',sans-serif"}}>View</div>
 <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
{(["grid","spotlight","focus"] as const).map(m=>(<button key={m} onClick={()=>{onLayoutChange(m);setMoreOpen(false);}} style={{padding:"5px 11px",borderRadius:20,border:"1px solid",fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"'Google Sans',sans-serif",textTransform:"capitalize",borderColor:layout===m?"#8ab4f8":"rgba(255,255,255,.12)",background:layout===m?"rgba(138,180,248,.15)":"rgba(255,255,255,.04)",color:layout===m?"#8ab4f8":"rgba(255,255,255,.5)"}}>{m}</button>))}
 </div>
 </div>
 <button className="gm-more-item" onClick={()=>{onToggleParticipants();setMoreOpen(false);}}><Users style={{width:16,height:16,opacity:.7}}/> Participants{liveCount>0 && <span style={{marginLeft:"auto",background:"rgba(138,180,248,.2)",color:"#8ab4f8",borderRadius:12,padding:"1px 8px",fontSize:11,fontWeight:600}}>{liveCount}</span>}</button>
 <button className="gm-more-item" onClick={()=>{setEmojisOpen(true);setMoreOpen(false);}}><Smile style={{width:16,height:16,opacity:.7}}/> Reactions</button>
 <button className="gm-more-item" onClick={()=>{onToggleMaterials();setMoreOpen(false);}}><Eye style={{width:16,height:16,opacity:.7}}/> Materials</button>
{isPrivileged && (
 <>
 <button className="gm-more-item" onClick={()=>{onGroupRecite(room);setMoreOpen(false);}} style={{color:groupReciteMode?"#34d399":"#e8eaed"}}><Volume2 style={{width:16,height:16}}/> {groupReciteMode?"End Group Recitation":"Group Recitation"}</button>
{onLaunchQuiz && <button className="gm-more-item" onClick={()=>{onLaunchQuiz();setMoreOpen(false);}} style={{color:"#fbbf24"}}><span style={{fontSize:16}}>📝</span> Live Quiz</button>}
 <button className="gm-more-item" onClick={()=>{onPermChange?.("write",!canStudentWriteProp,room);setMoreOpen(false);}} style={{color:canStudentWriteProp?"#34d399":"#e8eaed"}}><PenTool style={{width:16,height:16}}/> {canStudentWriteProp?"Revoke Board Access":"Allow Students to Write"}</button>
 <button className="gm-more-item" onClick={async()=>{await supabase.from("class_participants").update({is_muted:true}).eq("session_id",sessionId);try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"admin_mute_all"})),{reliable:true});}catch{}toast({title:"🔇 All students muted"});setMoreOpen(false);}} style={{color:"#fb923c"}}><MicOff style={{width:16,height:16}}/> Mute All Students</button>
 </>
)}
{!isPrivileged && canStudentRecProp && (<button className="gm-more-item" onClick={()=>{toggleStuRecord();setMoreOpen(false);}} style={{color:stuRec?"#ef4444":"#e8eaed"}}><Circle style={{width:13,height:13,fill:stuRec?"#ef4444":"none"}}/> {stuRec?"Stop Recording":"Record Audio"}</button>)}
{isPrivileged ? (
 <button className="gm-more-item" onClick={()=>{onToggleWhiteboard();setMoreOpen(false);}} style={{color:whiteboardOpen?"#34d399":"#e8eaed"}}><PenTool style={{width:16,height:16}}/> {whiteboardOpen?"Close Whiteboard":"Whiteboard"}</button>
) : (
 <>
 <button className="gm-more-item" onClick={()=>{toggleHand();setMoreOpen(false);}} style={{color:handUp?"#fbbf24":"#e8eaed"}}><Hand style={{width:16,height:16}}/> {handUp?"Lower Hand":"Raise Hand"}</button>
{canStudentWriteProp && (<button className="gm-more-item" onClick={()=>{onToggleWhiteboard();setMoreOpen(false);}} style={{color:whiteboardOpen?"#34d399":"#e8eaed"}}><PenTool style={{width:16,height:16}}/> {whiteboardOpen?"Close Board":"Whiteboard"}</button>)}
 </>
)}
{onMinimize && <button className="gm-more-item" onClick={()=>{onMinimize();setMoreOpen(false);}}><ChevronDown style={{width:16,height:16,opacity:.7}}/> Minimize</button>}
 <button className="gm-more-item" onClick={isPrivileged?onEndClass:onLeaveClass} style={{color:"#f87171"}}><Phone style={{width:16,height:16,transform:"rotate(135deg)"}}/> {isPrivileged?"End Class for All":"Leave Class"}</button>
 </div>,portal
)}

<div className="cv-bar gm-bar" style={{height:isMobile?64:80,background:"rgba(32,33,36,.97)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderTop:"1px solid rgba(255,255,255,.06)",display:"flex",alignItems:"center",justifyContent:"space-between",padding:`0 ${isMobile?10:24}px calc(${isMobile?4:8}px + env(safe-area-inset-bottom,0px)) ${isMobile?10:24}px`,flexShrink:0,gap:isMobile?6:12}}>
 <div style={{display:"flex",alignItems:"center",gap:isMobile?6:8,flexShrink:0}}> <div ref={micBtnRef} className="gm-av-group">
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

 <div style={{display:"flex",alignItems:"center",gap:isMobile?4:8,flex:1,justifyContent:"center"}}>
 <Ctrl icon={<MessageCircle style={{...IS,color:"#e8eaed"}}/>} label="Chat" onClick={onToggleChat} badge={chatUnread} tooltip="Open chat"/>
 <Ctrl icon={<MoreVertical style={{...IS,color:"#e8eaed"}}/>} label="More" bRef={moreBtnRef} onClick={openMore} active={moreOpen} tooltip="More options"/>
 </div>

 <button className="gm-leave" onClick={isPrivileged?onEndClass:onLeaveClass} style={{fontSize:isMobile?13:14,padding:isMobile?"0 14px":"0 22px",height:isMobile?44:48}}>
 <Phone style={{width:16,height:16,transform:"rotate(135deg)"}}/>
{isPrivileged?"End":"Leave"}
 </button>
</div>
</>);
};

const BottomBarBridge=(props:any)=>{
const room=useRoomContext();
const isMobile=useIsMobile();
return<BottomBar {...props} room={room} isMobile={isMobile}/>;
};

/* ══ ROOM - CONTEXT BRIDGE ══ */
const RoomToContextBridge = () => {
const room = useRoomContext();
const { setMicEnabled, setCamEnabled, toggleMicFnRef, toggleCamFnRef } = useLiveClass();

useEffect(() => {
toggleMicFnRef.current = async () => {
try {
const next = !room.localParticipant.isMicrophoneEnabled;
await room.localParticipant.setMicrophoneEnabled(next);
setMicEnabled(next);
} catch {}
};toggleCamFnRef.current = async () => {
try {
const next = !room.localParticipant.isCameraEnabled;
await room.localParticipant.setCameraEnabled(next);
setCamEnabled(next);
} catch {}
};
});

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
const{user,hasRole}=useAuth();
const{t}=useLanguage();
const isMobile=useIsMobile();
const isPrivileged=hasRole("admin")||hasRole("teacher");
const[phase,setPhase]=useState<"lobby"|"live"|"ended">("lobby");
const[token,setToken]=useState<string|null>(null);
const[wsUrl,setWsUrl]=useState<string|null>(null);
const[error,setError]=useState<string|null>(null);
const[loading,setLoading]=useState(false);
const[reconnecting,setReconnecting]=useState(false);
const[roomKey,setRoomKey]=useState(0);
const[autoReconnectCount,setAutoReconnectCount]=useState(0);
const intentionalLeaveRef=useRef(false);
const participantCountRef=useRef(0);
const[lobbyMic,setLobbyMic]=useState(false);
const[lobbyCam,setLobbyCam]=useState(false);
const wakeLockRef=useRef<any>(null);

useEffect(()=>{if(phase!=="live")return;
const acquire=async()=>{try{if("wakeLock"in navigator)wakeLockRef.current=await(navigator as any).wakeLock.request("screen");}catch{}};
acquire();
const onVis=()=>{if(document.visibilityState==="visible")acquire();};
document.addEventListener("visibilitychange",onVis);
return()=>{document.removeEventListener("visibilitychange",onVis);wakeLockRef.current?.release().catch(()=>{});};
},[phase]);

const[sessionId,setSessionId]=useState<string|null>(null);
const[sessionInfo,setSessionInfo]=useState<any>(null);
const[attendanceId,setAttendanceId]=useState<string|null>(null);
const[joinedAt]=useState(Date.now());
const[savingRec,setSavingRec]=useState(false);
const[isSessionLive,setIsSessionLive]=useState(false);
const[duration,setDuration]=useState(0);
const recStopRef=useRef<()=>Promise<void>>(async()=>{});

useEffect(()=>{
const onPageHide=()=>{recStopRef.current?.();};
window.addEventListener("pagehide",onPageHide);
return()=>window.removeEventListener("pagehide",onPageHide);
},[]);

const[chatOpen,setChatOpen]=useState(false);
const[partOpen,setPartOpen]=useState(false);
const[chatUnread,setChatUnread]=useState(0);

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
},[sessionId,phase,user?.id]);

const[sideTab,setSideTab]=useState<"chat"|"polls">("chat");
const[showEnd,setShowEnd]=useState(false);
const[quizOpen,setQuizOpen]=useState(false);
const[wbOpen,setWbOpen]=useState(false);
const[matOpen,setMatOpen]=useState<any>(null);
const[matPicker,setMatPicker]=useState(false);
const[matPanelOpen,setMatPanelOpen]=useState(false);
const[groupRecite,setGroupRecite]=useState(false);
const[canStudentWrite,setCanStudentWrite]=useState(false);
const[canStudentRec,setCanStudentRec]=useState(false);const[floatingEmojis,setFloatingEmojis]=useState<FloatingEmoji[]>([]);
const[raisedHands,setRaisedHands]=useState<RaisedHand[]>([]);
const[layout,setLayout]=useState<LayoutMode>("horizontal");
const[groupReciteDialog,setGroupReciteDialog]=useState(false);
const emojiIdRef=useRef(0);
const wbBuffer=useRef<any[]|null>(null);
const roomRef=useRef<any>(null);
const sessionEndChannelRef=useRef<any>(null);
const prefetch=useRef<{token:string;url:string;fetchedAt:number}|null>(null);

useEffect(()=>{
supabase.functions.invoke("livekit-token",{body:{subject_id:subject.id,action:isPrivileged?"start_session":"join"}})
.then(({data})=>{if(data?.token&&data?.url)prefetch.current={token:data.token,url:data.url,fetchedAt:Date.now()};})
.catch(()=>{});
},[subject.id,isPrivileged]);

useEffect(()=>{
if(!autoJoin)return;
const t=setTimeout(()=>{
if(phase==="lobby"&&!loading&&!error){
connect(isPrivileged?"start_session":"join");
}
},120);
return()=>clearTimeout(t);
},[autoJoin]);

useEffect(()=>{
const check=async()=>{
const{data}=await supabase.from("live_sessions").select("*").eq("subject_id",subject.id).eq("status","live").maybeSingle();
if(data){setSessionInfo(data);setSessionId(data.id);setIsSessionLive(true);}
else setIsSessionLive(false);
};
check();
const iv=setInterval(check,4000);
return()=>clearInterval(iv);
},[subject.id]);

useEffect(()=>{
if(!sessionId||isPrivileged||phase!=="live")return;
if(sessionEndChannelRef.current)return;
const ch=supabase.channel(`session-end-${sessionId}`)
.on("postgres_changes",{event:"UPDATE",schema:"public",table:"live_sessions",filter:`id=eq.${sessionId}`},
(payload:any)=>{
if(payload.new?.status==="ended"&&!intentionalLeaveRef.current){
setPhase("ended");
}
})
.subscribe();
sessionEndChannelRef.current=ch;
return()=>{if(sessionEndChannelRef.current){
supabase.removeChannel(sessionEndChannelRef.current);
sessionEndChannelRef.current=null;
}
};
},[sessionId,isPrivileged,phase]);

useEffect(()=>{
if(phase!=="live")return;
const ti=setInterval(()=>setDuration(d=>d+1),1000);
return()=>clearInterval(ti);
},[phase]);

useEffect(()=>{
if(phase!=="live"||!("mediaSession"in navigator))return;
try{
(navigator as any).mediaSession.metadata=new(window as any).MediaMetadata({title:subject.title,artist:"Tahleem Academy — Live Class",album:"In Progress"});
(navigator as any).mediaSession.playbackState="playing";
(navigator as any).mediaSession.setActionHandler("stop",()=>leaveSession());
(navigator as any).mediaSession.setActionHandler("pause",()=>leaveSession());
}catch{}
return()=>{try{(navigator as any).mediaSession.playbackState="none";}catch{}};
},[phase,subject.title]);

const connect=async(action:string,settings?:any,mediaSettings?:{micOn:boolean;cameraOn:boolean})=>{
if(mediaSettings){setLobbyMic(mediaSettings.micOn);setLobbyCam(mediaSettings.cameraOn);}
if(!user){setError("Session expired. Please refresh the page.");return;}
setLoading(true);
setError(null);
try{
const isFresh=prefetch.current&&(Date.now()-prefetch.current.fetchedAt)<5*60_000;
let tk=isFresh?prefetch.current!.token:null;
let url=isFresh?prefetch.current!.url:null;
prefetch.current=null;
if(!tk||!url){
const{data,error:e}=await supabase.functions.invoke("livekit-token",{body:{subject_id:subject.id,action}});
if(e)throw e;
if(data?.error)throw new Error(data.error);
tk=data.token;
url=data.url;
}
setToken(tk!);
setWsUrl(url!);
const{data:sessions}=await supabase.from("live_sessions").select("*").eq("subject_id",subject.id).in("status",["live","active","scheduled"]).order("scheduled_at",{ascending:false,nullsFirst:false}).limit(1);
if(sessions?.length){
const freshSessionId=sessions[0].id;
if(settings){
await supabase.from("live_sessions").update({...settings,actual_start_time:new Date().toISOString(),status:"live"}).eq("id",freshSessionId);
}
setSessionId(freshSessionId);setSessionInfo(sessions[0]);
const{data:att}=await supabase.from("attendance_logs").insert({session_id:freshSessionId,user_id:user.id,device_info:navigator.userAgent}).select("id").single();
if(att)setAttendanceId(att.id);
await supabase.from("class_participants").upsert({session_id:freshSessionId,student_id:user.id,joined_at:new Date().toISOString(),is_muted:!isPrivileged,camera_on:true,left_at:null,left_minutes:null},{onConflict:"session_id,student_id"});
if(!isPrivileged&&!sessionEndChannelRef.current){
const endCh=supabase.channel(`session-end-${freshSessionId}`)
.on("postgres_changes",{event:"UPDATE",schema:"public",table:"live_sessions",filter:`id=eq.${freshSessionId}`},
(payload:any)=>{if(payload.new?.status==="ended"&&!intentionalLeaveRef.current)setPhase("ended");})
.subscribe();
sessionEndChannelRef.current=endCh;
}
}
setPhase("live");
try{playJoinSound();}catch{}
}catch(e:any){
setError(e?.message||"Failed to connect");
}finally{
setLoading(false);
}
};

const autoReconnect=useCallback(async()=>{
if(intentionalLeaveRef.current)return;
if(autoReconnectCount>=5){
setReconnecting(false);
setError("Connection lost after several attempts. Please try again.");
setPhase("lobby");
return;
}
setReconnecting(true);
const backoffMs=Math.min(1000*Math.pow(2,autoReconnectCount),15000);
await new Promise(r=>setTimeout(r,backoffMs));
try{
const{data}=await supabase.functions.invoke("livekit-token",{body:{subject_id:subject.id,action:isPrivileged?"start_session":"join"}});
if(data?.token&&data?.url){
prefetch.current={token:data.token,url:data.url,fetchedAt:Date.now()};
setToken(data.token);
setWsUrl(data.url);
setRoomKey(k=>k+1);
setAutoReconnectCount(c=>c+1);
}
}catch{
setError("Reconnection failed. Please try again.");
setPhase("lobby");
}finally{
setReconnecting(false);
}
},[subject.id,isPrivileged,autoReconnectCount]);

useEffect(()=>()=>{if(attendanceId){
const d=Math.floor((Date.now()-joinedAt)/1000);
supabase.from("attendance_logs").update({left_at:new Date().toISOString(),duration_seconds:d}).eq("id",attendanceId);
}
if(sessionId&&user){
supabase.from("class_participants").update({left_at:new Date().toISOString(),duration_minutes:Math.floor((Date.now()-joinedAt)/60000)}).eq("session_id",sessionId).eq("student_id",user.id);
}
},[attendanceId,joinedAt,sessionId,user]);

const endSession=async()=>{
intentionalLeaveRef.current=true;
setShowEnd(false);
await recStopRef.current?.();
try{
if(sessionId){
await supabase.from("live_sessions").update({status:"ended",ended_at:new Date().toISOString(),actual_end_time:new Date().toISOString()}).eq("id",sessionId);
if(user)await supabase.from("class_chat_messages").insert({session_id:sessionId,sender_id:user.id,message:t("Class has ended","انتهت الحصة"),type:"system"});
try{
const room=roomRef.current;
if(room?.localParticipant){
room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({type:"class_ended"})),{reliable:true});
await new Promise(r=>setTimeout(r,400));
room.disconnect();
}
}catch(err){
console.warn("[endSession] LiveKit broadcast failed:",err);
}
setTimeout(async()=>{
try{await supabase.from("class_chat_messages").delete().eq("session_id",sessionId);}
catch(e){console.warn("[endSession] chat clear failed:",e);}
},4000);
}
}catch(e:any){
console.error("[endSession] DB error (continuing anyway):",e?.message);
}finally{
setPhase("ended");
}
};

const leaveSession=async()=>{
intentionalLeaveRef.current=true;
try{playLeaveSound();}catch{}
if(attendanceId){
const d=Math.floor((Date.now()-joinedAt)/1000);
supabase.from("attendance_logs").update({left_at:new Date().toISOString(),duration_seconds:d}).eq("id",attendanceId);
}
if(sessionId&&user){
supabase.from("class_participants").update({left_at:new Date().toISOString(),duration_minutes:Math.floor((Date.now()-joinedAt)/60000)}).eq("session_id",sessionId).eq("student_id",user.id);
}
onLeave();};

const handlePermChange=(type:"write"|"rec",allow:boolean,room?:any)=>{
if(type==="write"){
setCanStudentWrite(allow);
try{
room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"wb_allow_write",allow})),{reliable:true});
}catch{}
toast({title:allow?"✅ Students can now write on the board":"🔒 Write access revoked"});
}else{
setCanStudentRec(allow);
try{
room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"rec_allowed",allow})),{reliable:true});
}catch{}
toast({title:allow?"✅ Students can now record":"🔒 Record permission revoked"});
}
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
try{
room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"group_recite",active:n})),{reliable:true});
}catch{}
if(sessionId&&user)await supabase.from("class_chat_messages").insert({session_id:sessionId,sender_id:user.id,message:n?"🎙️ Group Recitation Mode — all mics ON":"🔇 Recitation ended",type:"system"});
};

const handleGroupReciteFromTeacher=(active:boolean)=>{
setGroupRecite(active);
if(active&&!isPrivileged){setGroupReciteDialog(true);}
else if(!active&&!isPrivileged){setGroupReciteDialog(false);}
};

const ParticipantCountBadge=()=>{
const all=useParticipants();useEffect(()=>{if(all.length>participantCountRef.current)participantCountRef.current=all.length;},[all.length]);
if(all.length===0)return null;
return(<div className="gm-badge" style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.8)",flexShrink:0,cursor:"pointer"}} onClick={()=>setPartOpen(v=>!v)}><Users style={{width:12,height:12,opacity:.7}}/><span style={{fontSize:12,fontWeight:500,fontFamily:"'Google Sans',sans-serif"}}>{all.length}</span></div>);
};

const fmtT=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

if(phase==="ended")return <ClassEndScreen subject={subject} session={sessionInfo} duration={duration} participantCount={participantCountRef.current} onGoToDashboard={onLeave} onGoToRevision={()=>{window.location.href=`/student/revision/${subject.id}`;}}/>;

if(phase==="lobby"&&!loading&&!error&&!autoJoin)return <ClassLobby subject={subject} session={sessionInfo} onStartClass={(s:any,media?:any)=>connect("start_session",s,media)} onJoinClass={(media?:any)=>connect("join",undefined,media)} onBack={onLeave} isLive={isSessionLive}/>;

if(loading)return(<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",background:"#202124"}}><style>{CSS}</style><div style={{textAlign:"center"}}><div style={{width:56,height:56,border:"3px solid rgba(138,180,248,.2)",borderTopColor:"#8ab4f8",borderRadius:"50%",animation:"cv-spin .8s linear infinite",margin:"0 auto 20px"}}/><p style={{color:"rgba(255,255,255,.55)",fontSize:15,fontFamily:"'Google Sans',sans-serif",fontWeight:500}}>{t("Connecting…","جاري الاتصال…")}</p></div></div>);

if(error)return(<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",background:"#202124"}}><style>{CSS}</style><div style={{textAlign:"center",maxWidth:340,padding:32}}><div style={{width:68,height:68,borderRadius:"50%",background:"rgba(234,67,53,.1)",border:"1px solid rgba(234,67,53,.2)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px"}}><X style={{width:28,height:28,color:"#ea4335"}}/></div><h2 style={{fontSize:22,fontWeight:500,color:"#e8eaed",marginBottom:10,fontFamily:"'Google Sans Display',sans-serif"}}>Connection failed</h2><p style={{color:"rgba(255,255,255,.45)",fontSize:14,marginBottom:28,lineHeight:1.6,fontFamily:"'Google Sans',sans-serif"}}>{error}</p><div style={{display:"flex",gap:12,justifyContent:"center"}}><button onClick={()=>{intentionalLeaveRef.current=false;setAutoReconnectCount(0);setError(null);setToken(null);setWsUrl(null);connect(isPrivileged?"start_session":"join");}} style={{padding:"10px 24px",borderRadius:24,background:"#8ab4f8",border:"none",color:"#202124",fontSize:14,cursor:"pointer",fontWeight:600,fontFamily:"'Google Sans',sans-serif"}}>Try again</button><button onClick={onLeave} style={{padding:"10px 24px",borderRadius:24,background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",color:"#e8eaed",fontSize:14,cursor:"pointer",fontFamily:"'Google Sans',sans-serif"}}>Go back</button></div></div></div>);

return(<div data-classroom-root style={{height:"100dvh",display:"flex",flexDirection:"column",background:"#202124",overflow:"hidden"}}><style>{CSS}</style>
{token&&wsUrl&&(
<LiveKitRoom key={roomKey} serverUrl={wsUrl} token={token} connect={phase==="live"} audio={false} video={false} options={{adaptiveStream:{pixelDensity:"screen"},dynacast:true,disconnectOnPageLeave:false,audioCaptureDefaults:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,sampleRate:48000,channelCount:1},publishDefaults:{audioPreset:{maxBitrate:32000},dtx:true,red:false,stopMicTrackOnMute:false,videoEncoding:{maxBitrate:700_000,maxFramerate:20},backupCodec:true},videoCaptureDefaults:{resolution:{width:640,height:480,frameRate:20},facingMode:"user"}}} style={{flex:1,display:"flex",flexDirection:"column",minHeight:0,position:"relative"}} data-lk-theme="default">
<RoomAudioRenderer/>
<RoomToContextBridge/>
<MediaAutoPublish lobbyMic={lobbyMic} lobbyCam={lobbyCam}/>
<WbSyncBridge wbOpen={wbOpen} isTeacher={isPrivileged}/>
<AdminMuteListener isPrivileged={isPrivileged}/>
<GroupReciteAutoMic active={groupRecite} isPrivileged={isPrivileged}/>
<ReconnectMonitor onReconnecting={()=>setReconnecting(true)} onReconnected={()=>{setReconnecting(false);setAutoReconnectCount(0);}} onDisconnected={autoReconnect}/>
<RoomDataListener onWbOpen={()=>setWbOpen(true)} onWbClose={()=>setWbOpen(false)} strokesBuffer={wbBuffer} onMatOpen={mat=>setMatOpen(mat)} onMatClose={()=>setMatOpen(null)} onWbAllowWrite={allow=>setCanStudentWrite(allow)} onRecAllowed={allow=>setCanStudentRec(allow)} onEmojiReact={(emoji:string,sender:string)=>addFloatingEmoji(emoji,sender)} onGroupRecite={handleGroupReciteFromTeacher} onHandRaise={handleHandRaise} onAdminMuteAll={()=>{}} onClassEnded={!isPrivileged?()=>setPhase("ended"):undefined} roomRef={roomRef}/>
{reconnecting && <div style={{position:"absolute",inset:0,zIndex:200,background:"rgba(32,33,36,.92)",backdropFilter:"blur(12px)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}><div style={{width:52,height:52,border:"3px solid rgba(138,180,248,.2)",borderTopColor:"#8ab4f8",borderRadius:"50%",animation:"cv-spin .8s linear infinite"}}/><p style={{color:"#e8eaed",fontSize:16,fontWeight:500,fontFamily:"'Google Sans',sans-serif"}}>Reconnecting…</p><p style={{color:"rgba(255,255,255,.4)",fontSize:13,fontFamily:"'Google Sans',sans-serif"}}>Please stay on the page</p></div>}

<div style={{height:56,background:"rgba(32,33,36,.97)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px 0 16px",flexShrink:0,borderBottom:"1px solid rgba(255,255,255,.05)",gap:8}}>
 <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
 <div className="gm-badge" style={{background:"rgba(234,67,53,.12)",border:"1px solid rgba(234,67,53,.25)",color:"#fff",flexShrink:0}}>
 <span style={{width:7,height:7,borderRadius:"50%",background:"#ea4335",display:"inline-block",animation:"pip-pulse 1.8s ease-in-out infinite"}}/>
 <span style={{fontSize:13,fontWeight:500,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:"'Google Sans',sans-serif"}}>{subject.title}</span>
 </div>
 <div className="gm-badge" style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.8)",flexShrink:0}}>
 <Circle style={{width:6,height:6,fill:"#ea4335",color:"#ea4335",animation:"rec-pulse 1.4s ease-in-out infinite"}}/>
 <span style={{fontSize:12,fontWeight:500,fontVariantNumeric:"tabular-nums",fontFamily:"'Google Sans',sans-serif"}}>{fmtT(duration)}</span>
 </div>
 <ParticipantCountBadge/>
{!isPrivileged&&canStudentWrite&&(
 <div className="gm-badge" title="You can write on the board" style={{background:"rgba(52,211,153,.1)",border:"1px solid rgba(52,211,153,.25)",color:"#34d399",cursor:"pointer",flexShrink:0}} onClick={()=>setWbOpen(v=>!v)}>
 <PenTool style={{width:11,height:11}}/><span style={{fontSize:11,fontWeight:500,fontFamily:"'Google Sans',sans-serif"}}>{isMobile?"Board":"Write"}</span>
 </div>
)}
{!isPrivileged&&canStudentRec&&(
 <div className="gm-badge" style={{background:"rgba(234,67,53,.1)",border:"1px solid rgba(234,67,53,.25)",color:"#fca5a5",flexShrink:0}}>
 <Circle style={{width:8,height:8,fill:"#ea4335",color:"#ea4335",animation:"rec-pulse 1.4s ease-in-out infinite"}}/>
 <span style={{fontSize:11,fontWeight:500,fontFamily:"'Google Sans',sans-serif"}}>Record</span>
 </div>
)}{isPrivileged&&raisedHands.length>0&&(
 <div className="gm-badge" style={{background:"rgba(251,191,36,.12)",border:"1px solid rgba(251,191,36,.3)",color:"#fbbf24",flexShrink:0}}>
 <span style={{fontSize:13,animation:"hand-bounce 1.2s ease-in-out infinite"}}>✋</span>
 <span style={{fontSize:12,fontWeight:600,fontFamily:"'Google Sans',sans-serif"}}>{raisedHands.length}</span>
 </div>
)}
 </div>
 <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
 <LayoutSwitcher layout={layout} onChange={setLayout} isMobile={isMobile}/>
{isPrivileged && <RecController sessionId={sessionId} subjectId={subject.id} userEmail={user?.email||""} onSavingChange={setSavingRec} stopRecRef={recStopRef}/>}
 </div>
</div>

<div style={{flex:1,display:"flex",minHeight:0,overflow:"hidden"}}>
 <div style={{flex:1,position:"relative",minWidth:0}}>
 <VideoGrid layout={layout}/>
 <FloatingEmojiLayer emojis={floatingEmojis}/>
 <RaisedHandsOverlay hands={raisedHands}/>
{matPanelOpen && <SubjectMaterialsPanel subjectId={subject.id} subject={subject} onClose={()=>setMatPanelOpen(false)}/>}
{matOpen && <MatViewerInlineBridge material={matOpen} isPrivileged={isPrivileged} onClose={()=>setMatOpen(null)}/>}
 </div>
{chatOpen&&!isMobile&&(
 <div className="gm-sidebar">
 <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,.07)",flexShrink:0,background:"rgba(32,33,36,.97)"}}>
{[["chat","💬","Chat"],["polls","📊","Polls"]].map(([k,ic,lb])=>(
 <button key={k} onClick={()=>{setSideTab(k as any);if(k==="chat")setChatUnread(0);}} style={{flex:1,padding:"14px 4px",background:"none",border:"none",color:sideTab===k?"#8ab4f8":"rgba(255,255,255,.45)",fontSize:13,fontWeight:sideTab===k?600:400,borderBottom:sideTab===k?"2px solid #8ab4f8":"2px solid transparent",cursor:"pointer",fontFamily:"'Google Sans',sans-serif",transition:"color .15s"}}>{ic} {lb}</button>
))}
 <button onClick={()=>setChatOpen(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,.3)",cursor:"pointer",padding:"0 14px",flexShrink:0}}><X style={{width:16,height:16}}/></button>
 </div>
 <div style={{flex:1,overflow:"hidden"}}>{sideTab==="chat"?<ClassChatPanel sessionId={sessionId||""} sessionStartedAt={sessionInfo?.started_at??sessionInfo?.actual_start_time}/>:<ClassPolls sessionId={sessionId||""}/>}</div>
 </div>
)}
</div>

{wbOpen && <WhiteboardBridge onClose={()=>setWbOpen(false)} isTeacher={isPrivileged} initialStrokes={wbBuffer.current} subjectId={subject.id} canStudentWrite={canStudentWrite}/>}
{groupReciteDialog&&!isPrivileged&&(<GroupRecitePermDialog onAccept={()=>{setGroupReciteDialog(false);}} onDecline={()=>{setGroupReciteDialog(false);setGroupRecite(false);}}/>)}
<BottomBarBridge sessionId={sessionId||""} onToggleChat={()=>{setChatOpen(v=>!v);if(!chatOpen)setChatUnread(0);}} onToggleParticipants={()=>setPartOpen(v=>!v)} onEndClass={()=>setShowEnd(true)} onLeaveClass={leaveSession} chatUnread={chatUnread} onToggleWhiteboard={()=>setWbOpen(v=>!v)} whiteboardOpen={wbOpen} onGroupRecite={handleGroupRecite} groupReciteMode={groupRecite} onShareMaterial={()=>setMatPicker(true)} isPrivileged={isPrivileged} canStudentWriteProp={canStudentWrite} canStudentRecProp={canStudentRec} onPermChange={(type:any,allow:any,room:any)=>handlePermChange(type,allow,room)} onMinimize={onMinimize} onToggleMaterials={()=>setMatPanelOpen(v=>!v)} matPanelOpen={matPanelOpen} onSendEmoji={addFloatingEmoji} layout={layout} onLayoutChange={setLayout} onLaunchQuiz={()=>setQuizOpen(true)}/>
{isMobile&&chatOpen&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:50}} onClick={()=>setChatOpen(false)}><div style={{position:"absolute",bottom:0,left:0,right:0,background:"#13181f",borderRadius:"22px 22px 0 0",maxHeight:"82vh",display:"flex",flexDirection:"column",animation:"slide-up .22s ease",paddingBottom:"env(safe-area-inset-bottom,0px)"}} onClick={e=>e.stopPropagation()}><div style={{display:"flex",alignItems:"center",padding:"12px 16px 0",flexShrink:0}}><div style={{flex:1,display:"flex"}}>{[["chat","💬","Chat"],["polls","📊","Polls"]].map(([k,ic,lb])=>(<button key={k} onClick={()=>setSideTab(k as any)} style={{flex:1,padding:"10px 6px",background:"none",border:"none",color:sideTab===k?"#fff":"rgba(255,255,255,.35)",fontSize:13,fontWeight:sideTab===k?700:400,borderBottom:sideTab===k?`2px solid ${TEAL}`:"2px solid transparent",cursor:"pointer"}}>{ic} {lb}</button>))}</div><button onClick={()=>setChatOpen(false)} style={{width:32,height:32,borderRadius:"50%",background:"rgba(255,255,255,.1)",border:"none",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><X style={{width:14,height:14}}/></button></div><div style={{flex:1,overflow:"hidden",minHeight:340}}>{sideTab==="chat"?<ClassChatPanel sessionId={sessionId||""} sessionStartedAt={sessionInfo?.started_at??sessionInfo?.actual_start_time}/>:<ClassPolls sessionId={sessionId||""}/>}</div></div></div>)}
{isMobile&&partOpen&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:50}} onClick={()=>setPartOpen(false)}><div style={{position:"absolute",bottom:BAR_H,left:0,right:0,background:"#13181f",borderRadius:"22px 22px 0 0",maxHeight:"65vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}><div style={{width:40,height:4,borderRadius:2,background:"rgba(255,255,255,.18)",margin:"12px auto 6px"}}/><ClassParticipants sessionId={sessionId||""}/></div></div>)}
<LiveQuizOverlay sessionId={sessionId||""} isOpen={quizOpen} onClose={()=>setQuizOpen(false)}/>
</LiveKitRoom>
)}
{matPicker && <MatPickerBridge subjectId={subject.id} onShare={(mat:any,room:any)=>{setMatOpen(mat);setMatPicker(false);try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"mat_open",material:mat})),{reliable:true});}catch{}}} onClose={()=>setMatPicker(false)}/>}
{showEnd&&createPortal(<div style={{position:"fixed",inset:0,zIndex:9500,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.6)",backdropFilter:"blur(8px)"}} onClick={()=>setShowEnd(false)}><div style={{background:"#2D2E30",borderRadius:20,padding:"32px 28px 24px",width:"100%",maxWidth:380,margin:"0 16px",boxShadow:"0 24px 64px rgba(0,0,0,.7)",border:"1px solid rgba(255,255,255,.08)",animation:"fade-in .18s ease"}} onClick={e=>e.stopPropagation()}><div style={{width:56,height:56,borderRadius:"50%",background:"rgba(234,67,53,.12)",border:"1px solid rgba(234,67,53,.2)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 18px"}}><Phone style={{width:22,height:22,color:"#ea4335",transform:"rotate(135deg)"}}/></div><h2 style={{textAlign:"center",fontSize:18,fontWeight:500,color:"#e8eaed",marginBottom:8,fontFamily:"'Google Sans Display',sans-serif"}}>{t("End class for everyone?","إنهاء الحصة للجميع؟")}</h2><p style={{textAlign:"center",fontSize:14,color:"rgba(255,255,255,.45)",marginBottom:28,lineHeight:1.6,fontFamily:"'Google Sans',sans-serif"}}>{t("This will disconnect all participants.","سيتم قطع الاتصال عن جميع المشاركين.")}</p><div style={{display:"flex",flexDirection:"column",gap:10}}><button onClick={endSession} style={{width:"100%",padding:"13px",borderRadius:24,border:"none",background:"#ea4335",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"'Google Sans',sans-serif",boxShadow:"0 2px 12px rgba(234,67,53,.4)"}}>{t("End for all","إنهاء للجميع")}</button><button onClick={()=>{setShowEnd(false);leaveSession();}} style={{width:"100%",padding:"12px",borderRadius:24,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.06)",color:"rgba(255,255,255,.8)",fontSize:14,fontWeight:400,cursor:"pointer",fontFamily:"'Google Sans',sans-serif"}}>{t("Leave but keep open","غادر لكن أبقِ الحصة")}</button><button onClick={()=>setShowEnd(false)} style={{width:"100%",padding:"12px",borderRadius:24,border:"none",background:"transparent",color:"rgba(255,255,255,.4)",fontSize:14,cursor:"pointer",fontFamily:"'Google Sans',sans-serif"}}>{t("Cancel","إلغاء")}</button></div></div></div>,document.body)}
</div>);
};

const MatPickerBridge=({subjectId,onShare,onClose}:any)=>{
const room=useRoomContext();
return<MaterialPicker subjectId={subjectId} onShare={(mat:any)=>onShare(mat,room)} onClose={onClose}/>;};

const MatViewerBridge=({material,isTeacher,onClose}:any)=>{
const room=useRoomContext();
return<InClassMaterialViewer material={material} isTeacher={isTeacher} onClose={()=>onClose(room)}/>;
};

const MatViewerInlineBridge=({material,isPrivileged,onClose}:any)=>{
const room=useRoomContext();
return<InClassMaterialViewer material={material} isTeacher={isPrivileged} onClose={()=>{
onClose();
if(isPrivileged){
try{
room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"mat_close"})),{reliable:true});
}catch{}
}
}}/>;
};

export default ClassroomView;