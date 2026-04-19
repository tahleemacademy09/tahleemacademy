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
import { playJoinSound, playLeaveSound } from "@/lib/soundUtils";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Mic, MicOff, Video, VideoOff, Phone, Hand,
  PenTool, MessageCircle, MoreVertical, BookOpen,
  Circle, Loader2, X, Smile, Play, Pause,
  Volume2, ChevronDown, Users, Eye,
  LayoutGrid, AlignJustify, Columns, Rows, Maximize2, Minimize2,
} from "lucide-react";
import ClassLobby        from "./ClassLobby";
import ClassChatPanel    from "./ClassChatPanel";
import ClassParticipants from "./ClassParticipants";
import ClassPolls        from "./ClassPolls";
import ClassEndScreen    from "./ClassEndScreen";
import LiveQuizOverlay   from "./LiveQuizOverlay";
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

const CSS = `
  @keyframes cv-spin    { to { transform:rotate(360deg); } }
  @keyframes wb-spin    { to { transform:rotate(360deg); } }
  @keyframes speaking   { 0%,100%{opacity:1}50%{opacity:.35} }
  @keyframes pip-pulse  { 0%,100%{opacity:1}50%{opacity:.3} }
  @keyframes slide-up   { from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1} }
  @keyframes fade-in    { from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)} }
  @keyframes emoji-float{ 0%{transform:translateY(0) scale(1);opacity:1}70%{opacity:.9}100%{transform:translateY(-300px) scale(1.35);opacity:0} }
  @keyframes rec-pulse  { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.5)}70%{box-shadow:0 0 0 8px rgba(239,68,68,0)} }
  @keyframes hand-bounce{ 0%,100%{transform:translateY(0)}45%{transform:translateY(-7px)} }
  [data-lk-theme]{ height:100%!important;display:flex!important;flex-direction:column!important; }
  [data-classroom-root]{
    overscroll-behavior:none;-webkit-overflow-scrolling:touch;
    touch-action:pan-y;padding-bottom:env(safe-area-inset-bottom,0px);
  }
  [data-classroom-root] button{-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
  [data-classroom-root] canvas{-webkit-user-select:none;user-select:none;}
  @supports not (height:100dvh){[data-classroom-root]{height:-webkit-fill-available!important;}}
  .cv-bar{scrollbar-width:none;-ms-overflow-style:none;}
  .cv-bar::-webkit-scrollbar{display:none;}
  .cv-bar{will-change:transform;transform:translateZ(0);contain:layout style;}
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
   Students only. When teacher broadcasts admin_mute_all, immediately mutes
   the local microphone track via LiveKit — no Supabase round-trip needed.  */
const AdminMuteListener = ({ isPrivileged }: { isPrivileged: boolean }) => {
  const room = useRoomContext();
  useEffect(() => {
    if (isPrivileged) return; // teachers never get muted by this
    const h = (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type === "admin_mute_all") {
          room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
          toast({ title: "🔇 Muted by teacher" });
        }
      } catch {}
    };
    room.on(RoomEvent.DataReceived, h);
    return () => { room.off(RoomEvent.DataReceived, h); };
  }, [room, isPrivileged]);
  return null;
};

const MediaAutoPublish = ({ lobbyMic = false, lobbyCam = false }: { lobbyMic?: boolean; lobbyCam?: boolean }) => {
  const room = useRoomContext();
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      // Slightly longer delay so LiveKit finishes its own track setup first
      await new Promise(r => setTimeout(r, 450));
      if (cancelled) return;
      try {
        const lp = room.localParticipant;
        // Apply the exact lobby choices — not a blanket disable
        if (lp.isMicrophoneEnabled !== lobbyMic) await lp.setMicrophoneEnabled(lobbyMic);
        if (lp.isCameraEnabled     !== lobbyCam) await lp.setCameraEnabled(lobbyCam);
      } catch {}
    };
    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

/* ══ ROOM DATA LISTENER ══ */
const RoomDataListener = ({ onWbOpen,onWbClose,strokesBuffer,onMatOpen,onMatClose,onWbAllowWrite,onRecAllowed,onEmojiReact,onGroupRecite,onHandRaise,onAdminMuteAll }:any) => {
  const room = useRoomContext();
  useEffect(() => {
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
      } catch {}
    };
    room.on(RoomEvent.DataReceived,h);
    return ()=>{ room.off(RoomEvent.DataReceived,h); };
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

/* ══ LAYOUT SWITCHER ══ */
const LAYOUT_OPTIONS:{mode:LayoutMode;icon:any;label:string}[]=[
  {mode:"grid",      icon:LayoutGrid,    label:"Grid"},
  {mode:"spotlight", icon:Maximize2,     label:"Spotlight"},
  {mode:"horizontal",icon:AlignJustify,  label:"Horizontal"},
  {mode:"vertical",  icon:Columns,       label:"Vertical"},
  {mode:"focus",     icon:Rows,          label:"Focus"},
];
const LayoutSwitcher=({layout,onChange}:{layout:LayoutMode;onChange:(m:LayoutMode)=>void})=>{
  const[open,setOpen]=useState(false);
  const cur=LAYOUT_OPTIONS.find(o=>o.mode===layout)||LAYOUT_OPTIONS[0];
  return(
    <div style={{position:"relative"}}>
      <button onClick={()=>setOpen(v=>!v)} title="Change Layout"
        style={{height:30,padding:"0 10px",borderRadius:20,background:open?"rgba(10,124,104,.6)":"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.15)",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5,backdropFilter:"blur(4px)"}}>
        <cur.icon style={{width:12,height:12}}/>{cur.label}
      </button>
      {open&&createPortal(
        <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:9200}}>
          <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:58,right:14,background:"#17202a",border:"1px solid rgba(255,255,255,.1)",borderRadius:16,overflow:"hidden",minWidth:170,boxShadow:"0 8px 36px rgba(0,0,0,.65)",animation:"fade-in .15s ease"}}>
            {LAYOUT_OPTIONS.map(o=>(
              <button key={o.mode} onClick={()=>{onChange(o.mode);setOpen(false);}}
                style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"11px 16px",background:layout===o.mode?`rgba(10,124,104,.35)`:"none",border:"none",cursor:"pointer",color:layout===o.mode?"#4ade80":"#fff",fontSize:13,fontWeight:layout===o.mode?700:400,borderBottom:"1px solid rgba(255,255,255,.05)"}}>
                <o.icon style={{width:14,height:14}}/>{o.label}
                {layout===o.mode&&<span style={{marginLeft:"auto",fontSize:10}}>✓</span>}
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

  if (ext === "pdf")
    return { embedUrl: url, kind: "pdf" };
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
  const url=material.file_url||material.url||"";
  const {embedUrl,kind}=toMaterialEmbedUrl(url);
  const matId=material.id||url;

  // ── resume position ──────────────────────────────────────────────────────
  const resume=loadResume(matId);
  const videoRef=useRef<HTMLVideoElement>(null);
  const iframeRef=useRef<HTMLIFrameElement>(null);
  // For direct PDF: append #page=N so the browser PDF viewer opens at saved page
  const pdfSrc=kind==="pdf"&&resume?.page
    ? `${embedUrl}#page=${resume.page}`
    : embedUrl;

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
  const[fullscreen,setFullscreen]=useState(false);
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

  // ── positioning: absolute inside content area, or fixed for fullscreen ───
  const overlayStyle:React.CSSProperties=fullscreen
    ?{position:"fixed",inset:0,zIndex:9990}
    :{position:"absolute",inset:0,zIndex:60};

  const renderContent=()=>{
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
    // PDF with page controls
    if(isPdfDirect)return(
      <div style={{flex:1,display:"flex",flexDirection:"column",background:"#fff",minHeight:0}}>
        <div style={{flex:1,position:"relative",minHeight:0}}>
          {!loaded&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"#f8f8f8",zIndex:1}}>
            <div style={{width:32,height:32,border:`3px solid rgba(0,0,0,.15)`,borderTopColor:TEAL,borderRadius:"50%",animation:"cv-spin .7s linear infinite"}}/>
          </div>}
          <iframe ref={iframeRef} src={pdfSrc} title={material.title}
            style={{width:"100%",height:"100%",border:"none",display:"block"}}
            allow="fullscreen" onLoad={()=>setLoaded(true)}/>
        </div>
        {/* PDF page navigation strip */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,padding:"6px 12px",background:"rgba(15,17,23,.92)",borderTop:"1px solid rgba(255,255,255,.08)",flexShrink:0}}>
          <button onClick={()=>navigatePdfPage(Math.max(1,pdfPage-1))}
            style={{width:28,height:28,borderRadius:8,background:"rgba(255,255,255,.1)",border:"none",color:"#fff",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
          <span style={{fontSize:12,color:"rgba(255,255,255,.7)",fontVariantNumeric:"tabular-nums"}}>
            Page <strong style={{color:"#fff"}}>{pdfPage}</strong>
          </span>
          <button onClick={()=>navigatePdfPage(pdfPage+1)}
            style={{width:28,height:28,borderRadius:8,background:"rgba(255,255,255,.1)",border:"none",color:"#fff",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
          <span style={{fontSize:11,color:"rgba(255,255,255,.35)",marginLeft:4}}>↙ resumed</span>
        </div>
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
      <div style={{height:46,background:"rgba(6,78,59,.97)",display:"flex",alignItems:"center",padding:"0 10px",gap:8,flexShrink:0,borderBottom:"1px solid rgba(255,255,255,.08)"}}>
        <span style={{fontSize:15}}>{MAT_TYPE_ICON[material.material_type||"document"]||"📄"}</span>
        <span style={{flex:1,fontSize:13,fontWeight:700,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{material.title||"Material"}</span>
        {resumeBadge&&(
          <span style={{fontSize:10,color:"rgba(255,255,255,.5)",background:"rgba(255,255,255,.1)",borderRadius:8,padding:"2px 7px",flexShrink:0}}>
            {resume?.time?`▶ ${Math.floor((resume.time||0)/60)}m${Math.floor((resume.time||0)%60)}s`:`p.${resume?.page}`} resumed
          </span>
        )}
        {!isTeacher&&<span style={{fontSize:10,color:"rgba(255,255,255,.4)",flexShrink:0}}>Shared by teacher</span>}
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{fontSize:11,color:"#d1d5db",background:"rgba(255,255,255,.1)",borderRadius:8,padding:"4px 10px",textDecoration:"none",fontWeight:600,flexShrink:0}}>↗</a>
        {/* Fullscreen toggle */}
        <button onClick={()=>setFullscreen(v=>!v)} title={fullscreen?"Exit fullscreen":"Fullscreen"}
          style={{width:30,height:30,borderRadius:8,background:"rgba(255,255,255,.1)",border:"none",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          {fullscreen?<Minimize2 style={{width:13,height:13}}/>:<Maximize2 style={{width:13,height:13}}/>}
        </button>
        <button onClick={onClose}
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
const SubjectMaterialsPanel=({subjectId,onClose}:any)=>{
  const[mats,setMats]=useState<any[]>([]);
  const[busy,setBusy]=useState(true);
  const[viewing,setViewing]=useState<any>(null);
  useEffect(()=>{
    supabase.from("subject_materials" as any).select("*").eq("subject_id",subjectId).order("created_at",{ascending:false})
      .then(({data})=>{setMats(data||[]);setBusy(false);});
  },[subjectId]);
  return(
    // Outer backdrop — covers content area but NOT top bar or footer
    <div style={{position:"absolute",inset:0,zIndex:55,background:"rgba(0,0,0,.55)"}} onClick={onClose}>
      {/* Panel slides in from right */}
      <div onClick={e=>e.stopPropagation()}
        style={{position:"absolute",top:0,right:0,bottom:0,width:"min(340px,100%)",background:"#13181f",borderLeft:"1px solid rgba(255,255,255,.08)",display:"flex",flexDirection:"column",animation:"slide-up .2s ease",boxShadow:"-8px 0 32px rgba(0,0,0,.5)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"14px 16px",borderBottom:"1px solid rgba(255,255,255,.08)",flexShrink:0}}>
          <Eye style={{width:16,height:16,color:TEAL}}/>
          <span style={{flex:1,fontSize:14,fontWeight:700,color:"#fff"}}>Subject Materials</span>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"none",color:"#fff",borderRadius:8,width:30,height:30,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <X style={{width:14,height:14}}/>
          </button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:10}}>
          {busy&&<div style={{display:"flex",justifyContent:"center",padding:40}}><div style={{width:24,height:24,border:`3px solid ${TEAL}`,borderTopColor:"transparent",borderRadius:"50%",animation:"cv-spin .7s linear infinite"}}/></div>}
          {!busy&&mats.length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:"rgba(255,255,255,.35)"}}>
            <div style={{fontSize:36,marginBottom:8}}>📭</div>
            <p style={{fontSize:13,margin:0}}>No materials for this subject</p>
          </div>}
          {mats.map(m=>{
            const icon=MAT_TYPE_ICON[m.material_type||"document"]||"📄";
            const resume=loadResume(m.id||"");
            return(
              <button key={m.id} onClick={()=>setViewing(m)}
                style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.07)",borderRadius:12,cursor:"pointer",textAlign:"left",marginBottom:8,transition:"background .12s"}}
                onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,.09)")}
                onMouseLeave={e=>(e.currentTarget.style.background="rgba(255,255,255,.04)")}>
                <div style={{width:40,height:40,borderRadius:10,background:"rgba(10,124,104,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{margin:0,fontSize:13,fontWeight:600,color:"#e8eaf0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.title||m.name||"Untitled"}</p>
                  <p style={{margin:"3px 0 0",fontSize:11,color:"rgba(255,255,255,.35)",textTransform:"capitalize"}}>
                    {m.material_type||"file"}
                    {resume?.time&&<span style={{marginLeft:6,color:TEAL}}>▶ {Math.floor((resume.time||0)/60)}m</span>}
                    {resume?.page&&!resume?.time&&<span style={{marginLeft:6,color:TEAL}}>p.{resume.page}</span>}
                  </p>
                </div>
                <span style={{fontSize:11,color:TEAL,fontWeight:700,flexShrink:0}}>👁 View</span>
              </button>
            );
          })}
        </div>
      </div>
      {/* Viewer renders on top of panel, still inside content area */}
      {viewing&&<InClassMaterialViewer material={viewing} onClose={()=>setViewing(null)}/>}
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
    try{const ac=new((window as any).AudioContext||(window as any).webkitAudioContext)();acRef.current=ac;ac.resume().catch(()=>{});
      const dest=ac.createMediaStreamDestination();let n=0;
      [room.localParticipant,...Array.from(room.remoteParticipants.values())].forEach((p:any)=>{p.trackPublications?.forEach?.((pub:any)=>{if(pub.kind==="audio"&&pub.track?.mediaStreamTrack){ac.createMediaStreamSource(new MediaStream([pub.track.mediaStreamTrack])).connect(dest);n++;}});});
      return n>0?dest.stream:null;
    }catch{return null;}
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
        const recPath=`sessions/${sessionId||subjectId}/${Date.now()}.${recExt}`;
        console.log("[RecController] uploading",blob.size,"bytes to recordings/",recPath);
        const{error:upErr}=await storageSupabase.storage
          .from("recordings")
          .upload(recPath,blob,{cacheControl:"3600",upsert:false,contentType:recMime});
        if(upErr){
          console.error("[RecController] upload error:",upErr);
          throw new Error(upErr.message);
        }
        console.log("[RecController] upload OK, inserting session_recordings row");
        await supabase.from("session_recordings").insert({
          session_id:  sessionId||null,
          subject_id:  subjectId,
          file_url:    recPath,
          teacher_name:userEmail,
          duration_seconds:finalTime,
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

/* ══ PARTICIPANT TILE ══ */
const ParticipantTile=({participant,isLocal,size="normal"}:{participant:any;isLocal:boolean;size?:"normal"|"large"|"small"})=>{
  const videoRef=useRef<HTMLVideoElement>(null);
  const[hasVideo,setHasVideo]=useState(false);const[isSpeaking,setIsSpeaking]=useState(false);const[micEnabled,setMicEnabled]=useState(true);
  const room=useRoomContext();
  useEffect(()=>{
    const update=()=>{
      const camPub=participant.getTrackPublication?.(Track.Source.Camera)||participant.trackPublications?.get(Track.Source.Camera);
      const track=camPub?.videoTrack||camPub?.track;
      if(track?.mediaStreamTrack?.readyState==="live"&&videoRef.current){
        const ms=new MediaStream([track.mediaStreamTrack]);videoRef.current.srcObject=ms;
        if(isLocal)videoRef.current.muted=true;
        const pp=videoRef.current.play();if(pp!==undefined)pp.catch(()=>{});setHasVideo(true);
      }else{if(videoRef.current)videoRef.current.srcObject=null;setHasVideo(false);}
      const micPub=participant.getTrackPublication?.(Track.Source.Microphone)||participant.trackPublications?.get(Track.Source.Microphone);
      setMicEnabled(!(micPub?.isMuted??false));
    };
    update();const onSpeak=(v:boolean)=>setIsSpeaking(v);
    participant.on?.("trackSubscribed",update);participant.on?.("trackUnsubscribed",update);participant.on?.("trackMuted",update);participant.on?.("trackUnmuted",update);participant.on?.("isSpeakingChanged",onSpeak);
    return()=>{participant.off?.("trackSubscribed",update);participant.off?.("trackUnsubscribed",update);participant.off?.("trackMuted",update);participant.off?.("trackUnmuted",update);participant.off?.("isSpeakingChanged",onSpeak);};
  },[participant]);
  const toggleMyMic=async()=>{if(!isLocal)return;const next=!micEnabled;await room.localParticipant.setMicrophoneEnabled(next);setMicEnabled(next);};
  const name=participant.name||participant.identity||"User";
  const initials=name.split(" ").map((w:string)=>w[0]||"").join("").slice(0,2).toUpperCase()||"?";
  const avatarSz=size==="large"?72:size==="small"?36:52;
  const fontSize=size==="large"?28:size==="small"?14:20;
  return(
    <div style={{position:"relative",width:"100%",height:"100%",background:"linear-gradient(145deg,#1a2035,#0e1420)",borderRadius:size==="small"?10:14,overflow:"hidden",border:isSpeaking?`2px solid ${GREEN}`:"2px solid rgba(255,255,255,.06)",transition:"border-color .2s,box-shadow .2s",boxShadow:isSpeaking?`0 0 0 2px ${GREEN}44,0 4px 24px rgba(34,197,94,.25)`:"0 2px 12px rgba(0,0,0,.4)"}}>
      <video ref={videoRef} autoPlay playsInline muted={isLocal} style={{width:"100%",height:"100%",objectFit:"cover",display:hasVideo?"block":"none",transform:isLocal?"scaleX(-1)":"none"}}/>
      {!hasVideo&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(145deg,#0e1a14,#1a2e22)"}}>
        <div style={{width:avatarSz,height:avatarSz,borderRadius:"50%",background:`linear-gradient(135deg,${TEAL},#064E3B)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize,fontWeight:800,color:"#fff",border:isSpeaking?`3px solid ${GREEN}`:"3px solid rgba(255,255,255,.1)",boxShadow:isSpeaking?`0 0 16px ${GREEN}55`:"none",transition:"border-color .2s,box-shadow .2s"}}>{initials}</div>
      </div>}
      {isSpeaking&&hasVideo&&<div style={{position:"absolute",inset:0,border:`3px solid ${GREEN}`,borderRadius:"inherit",pointerEvents:"none"}}/>}
      <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"22px 10px 8px",background:"linear-gradient(transparent,rgba(0,0,0,.72))",display:"flex",alignItems:"center",gap:6}}>
        <span style={{flex:1,fontSize:size==="small"?10:12,fontWeight:600,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}{isLocal?" (You)":""}</span>
        {isSpeaking&&<div style={{display:"flex",alignItems:"flex-end",gap:1.5,height:14}}>{[.4,.7,1,.6].map((h,i)=>(<div key={i} style={{width:3,borderRadius:2,background:GREEN,height:`${h*14}px`,animation:`speaking .6s ease-in-out infinite`,animationDelay:`${i*.12}s`}}/>))}</div>}
        <button onClick={isLocal?toggleMyMic:undefined} style={{width:24,height:24,borderRadius:"50%",background:micEnabled?"rgba(34,197,94,.2)":"rgba(239,68,68,.3)",border:"none",cursor:isLocal?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,backdropFilter:"blur(4px)"}}>
          {micEnabled?<Mic style={{width:11,height:11,color:GREEN}}/>:<MicOff style={{width:11,height:11,color:RED}}/>}
        </button>
      </div>
    </div>
  );
};

/* ══ VIDEO GRID — Google Meet style ══ */
const VideoGrid=({layout="grid"}:{layout?:LayoutMode})=>{
  const{localParticipant}=useLocalParticipant();
  const allParticipants=useParticipants();
  const remotes=allParticipants.filter(p=>p.identity!==localParticipant?.identity);
  const all=localParticipant?[localParticipant,...remotes]:remotes;
  const n=all.length;
  const GAP=8;
  const P=8;

  const screensharer=all.find(p=>{
    const pub=p.getTrackPublication?.(Track.Source.ScreenShare)||p.trackPublications?.get(Track.Source.ScreenShare);
    return pub?.track&&!pub.isMuted;
  });
  if(screensharer)return(
    <div style={{width:"100%",height:"100%",display:"flex",gap:GAP,padding:P,boxSizing:"border-box"}}>
      <div style={{flex:1,borderRadius:14,overflow:"hidden",minWidth:0}}>
        <ParticipantTile participant={screensharer} isLocal={screensharer.identity===localParticipant?.identity} size="large"/>
      </div>
      <div style={{width:110,display:"flex",flexDirection:"column",gap:GAP,overflowY:"auto"}}>
        {all.map(p=>(<div key={p.identity} style={{height:82,flexShrink:0}}>
          <ParticipantTile participant={p} isLocal={p.identity===localParticipant?.identity} size="small"/>
        </div>))}
      </div>
    </div>
  );

  if(layout==="spotlight")return(
    <div style={{width:"100%",height:"100%",display:"flex",gap:GAP,padding:P,boxSizing:"border-box"}}>
      <div style={{flex:1,borderRadius:14,overflow:"hidden",minWidth:0}}>
        <ParticipantTile participant={all[0]} isLocal={all[0]?.identity===localParticipant?.identity} size="large"/>
      </div>
      {n>1&&<div style={{width:100,display:"flex",flexDirection:"column",gap:GAP,overflowY:"auto"}}>
        {all.slice(1).map(p=>(<div key={p.identity} style={{height:76,flexShrink:0}}>
          <ParticipantTile participant={p} isLocal={p.identity===localParticipant?.identity} size="small"/>
        </div>))}
      </div>}
    </div>
  );

  if(layout==="horizontal")return(
    <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"row",gap:GAP,padding:P,boxSizing:"border-box"}}>
      {all.map(p=>(<div key={p.identity} style={{flex:1,minWidth:0,height:"100%"}}>
        <ParticipantTile participant={p} isLocal={p.identity===localParticipant?.identity} size={n===1?"large":"normal"}/>
      </div>))}
    </div>
  );

  if(layout==="vertical")return(
    <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",gap:GAP,padding:P,boxSizing:"border-box"}}>
      {all.map(p=>(<div key={p.identity} style={{flex:1,minHeight:0,width:"100%"}}>
        <ParticipantTile participant={p} isLocal={p.identity===localParticipant?.identity} size={n===1?"large":"normal"}/>
      </div>))}
    </div>
  );

  if(layout==="focus"){
    const local=all.find(p=>p.identity===localParticipant?.identity)||all[0];
    const others=all.filter(p=>p.identity!==local?.identity);
    return(
      <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",gap:GAP,padding:P,boxSizing:"border-box"}}>
        <div style={{flex:1,borderRadius:14,overflow:"hidden",minHeight:0}}>
          {local&&<ParticipantTile participant={local} isLocal size="large"/>}
        </div>
        {others.length>0&&<div style={{height:90,display:"flex",flexDirection:"row",gap:GAP,flexShrink:0,overflowX:"auto"}}>
          {others.map(p=>(<div key={p.identity} style={{width:120,flexShrink:0}}>
            <ParticipantTile participant={p} isLocal={false} size="small"/>
          </div>))}
        </div>}
      </div>
    );
  }

  if(n===1)return(
    <div style={{width:"100%",height:"100%",padding:P,boxSizing:"border-box"}}>
      <ParticipantTile participant={all[0]} isLocal={all[0]?.identity===localParticipant?.identity} size="large"/>
    </div>
  );

  const COLS=2;
  const ROWS=Math.ceil(n/COLS);
  const isOdd=n%COLS!==0;
  return(
    <div style={{width:"100%",height:"100%",display:"grid",gridTemplateColumns:`repeat(${COLS},1fr)`,gridTemplateRows:`repeat(${ROWS},1fr)`,gap:GAP,padding:P,boxSizing:"border-box"}}>
      {all.map((p,i)=>{
        const isLastLone=isOdd&&i===n-1;
        return(
          <div key={p.identity} style={isLastLone?{gridColumn:"1 / -1",display:"flex",justifyContent:"center"}:{}}>
            <div style={isLastLone?{width:"50%",height:"100%"}:{width:"100%",height:"100%"}}>
              <ParticipantTile participant={p} isLocal={p.identity===localParticipant?.identity} size={n<=2?"large":n<=4?"normal":"small"}/>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ══ BOTTOM BAR ══ */
const BottomBar=({sessionId,onToggleChat,onToggleParticipants,onEndClass,onLeaveClass,chatUnread,onToggleWhiteboard,whiteboardOpen,onGroupRecite,groupReciteMode,onShareMaterial,isPrivileged,canStudentWriteProp,canStudentRecProp,onPermChange,onMinimize,room,isMobile,onToggleMaterials,matPanelOpen,onSendEmoji,layout,onLayoutChange}:any)=>{
  const{user}=useAuth();
  const[micOn,setMicOn]=useState(false);
  const[camOn,setCamOn]=useState(false);
  const[handUp,setHandUp]=useState(false);const[menu,setMenu]=useState(false);const[emojis,setEmojis]=useState(false);
  const[stuRec,setStuRec]=useState(false);const stuMrRef=useRef<MediaRecorder|null>(null);const stuChunks=useRef<Blob[]>([]);
  // Busy guards — prevent rapid-tap race conditions (triple-press bug)
  const micBusy=useRef(false);
  const camBusy=useRef(false);
  useEffect(()=>{
    if(!room)return;
    // Read state from LiveKit directly — no fragile setTimeout hacks
    const sync=()=>{
      setMicOn(room.localParticipant.isMicrophoneEnabled);
      setCamOn(room.localParticipant.isCameraEnabled);
    };
    sync();
    // Use room-level RoomEvents so we catch all state changes reliably
    room.on(RoomEvent.LocalTrackPublished,   sync);
    room.on(RoomEvent.LocalTrackUnpublished, sync);
    room.on(RoomEvent.TrackMuted,            sync);
    room.on(RoomEvent.TrackUnmuted,          sync);
    return()=>{
      room.off(RoomEvent.LocalTrackPublished,   sync);
      room.off(RoomEvent.LocalTrackUnpublished, sync);
      room.off(RoomEvent.TrackMuted,            sync);
      room.off(RoomEvent.TrackUnmuted,          sync);
    };
  },[room]);
  const toggleMic=async()=>{
    if(!room?.localParticipant||micBusy.current)return;
    micBusy.current=true;
    try{await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);}
    catch(e){console.error("toggleMic:",e);}
    finally{micBusy.current=false;}
  };
  const toggleCam=async()=>{
    if(!room?.localParticipant||camBusy.current)return;
    camBusy.current=true;
    try{await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled);}
    catch(e){console.error("toggleCam:",e);}
    finally{camBusy.current=false;}
  };
  const toggleHand=async()=>{
    if(!user||!sessionId)return;
    const n=!handUp;
    setHandUp(n);
    await supabase.from("class_participants").update({hand_raised:n,hand_raised_at:n?new Date().toISOString():null}).eq("session_id",sessionId).eq("student_id",user.id);
    try{
      room?.localParticipant?.publishData(
        new TextEncoder().encode(JSON.stringify({type:"hand_raise",identity:room.localParticipant.identity,name:room.localParticipant.name||user?.user_metadata?.full_name||"Student",raised:n})),
        {reliable:true}
      );
    }catch{}
  };
  const toggleStuRecord=async()=>{
    if(stuRec){stuMrRef.current?.stop();stuMrRef.current!.onstop=()=>{const blobType=stuMrRef.current?.mimeType||"audio/webm";const blob=new Blob(stuChunks.current,{type:blobType});const url=URL.createObjectURL(blob);const a=document.createElement("a");const ext=blobType.includes("mp4")?"mp4":blobType.includes("ogg")?"ogg":"webm";a.href=url;a.download=`class-recording-${Date.now()}.${ext}`;a.click();URL.revokeObjectURL(url);stuChunks.current=[];};setStuRec(false);}
    else{try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});const stuMime=["audio/webm","audio/mp4","audio/ogg"].find(t=>{try{return MediaRecorder.isTypeSupported(t);}catch{return false;}})||"";const mr=new MediaRecorder(stream,stuMime?{mimeType:stuMime}:undefined);stuChunks.current=[];mr.ondataavailable=e=>{if(e.data.size>0)stuChunks.current.push(e.data);};mr.start(1000);stuMrRef.current=mr;setStuRec(true);}catch{toast({title:"Microphone access denied"});}}
  };
  const sendEmoji=(e:string)=>{
    setEmojis(false);
    try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"emoji_react",emoji:e,sender:user?.user_metadata?.full_name||""})),{reliable:false});}catch{}
    onSendEmoji?.(e);
    if(user&&sessionId)supabase.from("class_chat_messages").insert({session_id:sessionId,sender_id:user.id,message:e,type:"reaction"});
  };
  const IS={width:isMobile?16:20,height:isMobile?16:20};
  const Btn=({children,active=false,danger=false,onClick,badge=0,title:ttl=""}:any)=>(
    <div style={{position:"relative",display:"flex",flexDirection:"column",alignItems:"center"}}>
      <button title={ttl} onClick={onClick} style={{width:isMobile?42:52,height:isMobile?42:52,borderRadius:"50%",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:danger?"rgba(239,68,68,.85)":active?"rgba(255,255,255,.18)":"rgba(255,255,255,.09)",color:"#fff",transition:"background .15s,transform .1s",backdropFilter:"blur(4px)",boxShadow:active&&!danger?"inset 0 0 0 2px rgba(255,255,255,.2)":"none"}}
        onMouseEnter={e=>(e.currentTarget.style.transform="scale(1.08)")} onMouseLeave={e=>(e.currentTarget.style.transform="scale(1)")}>{children}</button>
      {badge>0&&<span style={{position:"absolute",top:0,right:0,background:RED,color:"#fff",borderRadius:"50%",width:17,height:17,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,border:`2px solid ${DARK}`}}>{badge}</span>}
    </div>
  );
  const menuPortal = typeof document !== "undefined" ? document.body : null;
  return(<>
    {emojis&&menuPortal&&createPortal(
      <div style={{position:"fixed",bottom:BAR_H+12,left:"50%",transform:"translateX(-50%)",background:"#1e2535",border:"1px solid rgba(255,255,255,.1)",borderRadius:44,padding:"10px 16px",display:"flex",gap:10,zIndex:9000,boxShadow:"0 8px 32px rgba(0,0,0,.6)",animation:"slide-up .2s ease"}}>
        {["👏","🤲","❤️","😂","🌟","👍","🙏","🕌"].map(e=>(<button key={e} onClick={()=>sendEmoji(e)} style={{fontSize:28,background:"none",border:"none",cursor:"pointer",padding:"2px 4px",transition:"transform .12s"}} onMouseEnter={ev=>(ev.currentTarget.style.transform="scale(1.28)")} onMouseLeave={ev=>(ev.currentTarget.style.transform="scale(1)")}>{e}</button>))}
      </div>,menuPortal)}
    {menu&&menuPortal&&createPortal(<div onClick={()=>setMenu(false)} style={{position:"fixed",bottom:BAR_H+10,right:14,background:"#17202a",border:"1px solid rgba(255,255,255,.08)",borderRadius:18,boxShadow:"0 8px 36px rgba(0,0,0,.65)",minWidth:230,zIndex:9000,overflow:"hidden",animation:"slide-up .18s ease"}}>
      {isPrivileged&&[
        {icon:Volume2,label:groupReciteMode?"End Group Recitation":"Group Recitation",color:groupReciteMode?GREEN:"#fff",fn:()=>onGroupRecite(room)},
        {icon:BookOpen,label:"Share Material",color:"#fff",fn:onShareMaterial},
        {icon:PenTool,label:canStudentWriteProp?"Revoke Write Access":"Allow Students to Write",color:canStudentWriteProp?GREEN:"#fff",fn:()=>onPermChange?.("write",!canStudentWriteProp,room)},
        {icon:Circle,label:canStudentRecProp?"Revoke Record Permission":"Allow Students to Record",color:canStudentRecProp?GREEN:"#fff",fn:()=>onPermChange?.("rec",!canStudentRecProp,room)},
        {icon:MicOff,label:"Mute All Students",color:"#fb923c",fn:async()=>{
          // 1. DB — so new joiners also enter muted
          await supabase.from("class_participants").update({is_muted:true}).eq("session_id",sessionId);
          // 2. DataChannel — mutes existing participants immediately
          try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"admin_mute_all"})),{reliable:true});}catch{}
          toast({title:"🔇 All students muted"});
          setMenu(false);
        }},
      ].map((item,i)=>(<button key={i} onClick={item.fn} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"13px 18px",background:"none",border:"none",cursor:"pointer",color:item.color,fontSize:14,borderBottom:"1px solid rgba(255,255,255,.06)",textAlign:"left"as const}}><item.icon style={{width:16,height:16}}/> {item.label}</button>))}
      <button onClick={()=>{setMenu(false);onToggleParticipants();}} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"13px 18px",background:"none",border:"none",cursor:"pointer",color:"#fff",fontSize:14,borderBottom:"1px solid rgba(255,255,255,.06)",textAlign:"left"as const}}><Users style={{width:16,height:16}}/> Participants</button>
      <button onClick={isPrivileged?onEndClass:onLeaveClass} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"13px 18px",background:"none",border:"none",cursor:"pointer",color:RED,fontSize:14,textAlign:"left"as const}}>📵 {isPrivileged?"End Class for All":"Leave Class"}</button>
    </div>,menuPortal)}
    <div className="cv-bar" style={{
      height:isMobile?60:BAR_H,minHeight:isMobile?60:BAR_H,
      background:GLASS,backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
      borderTop:"1px solid rgba(255,255,255,.07)",
      display:"flex",alignItems:"center",
      justifyContent:"flex-start",
      gap:isMobile?5:10,
      padding:`0 ${isMobile?8:16}px calc(${isMobile?4:8}px + env(safe-area-inset-bottom,0px)) ${isMobile?8:16}px`,
      flexShrink:0,
      boxShadow:"0 -4px 24px rgba(0,0,0,.45)",
      overflowX:"auto" as const,
      WebkitOverflowScrolling:"touch" as const,
    }}>
      <Btn active={micOn} danger={!micOn} title={micOn?"Mute":"Unmute"} onClick={toggleMic}>{micOn?<Mic style={IS}/>:<MicOff style={IS}/>}</Btn>
      <Btn active={camOn} danger={!camOn} title={camOn?"Stop Video":"Start Video"} onClick={toggleCam}>{camOn?<Video style={IS}/>:<VideoOff style={IS}/>}</Btn>
      {isPrivileged
        ?<Btn active={whiteboardOpen} title="Whiteboard" onClick={onToggleWhiteboard}><PenTool style={{...IS,color:whiteboardOpen?"#4ade80":"#fff"}}/></Btn>
        :<Btn active={handUp} title={handUp?"Lower Hand":"Raise Hand"} onClick={toggleHand}><Hand style={{...IS,color:handUp?"#fbbf24":"#fff"}}/></Btn>
      }
      {!isPrivileged&&canStudentWriteProp&&(
        <Btn active={whiteboardOpen} title="Open Board" onClick={onToggleWhiteboard}>
          <PenTool style={{...IS,color:"#34d399"}}/>
        </Btn>
      )}
      <Btn onClick={onToggleChat} badge={chatUnread} title="Chat"><MessageCircle style={IS}/></Btn>
      <Btn active={matPanelOpen} onClick={onToggleMaterials} title="View Materials"><Eye style={{...IS,color:matPanelOpen?"#34d399":"#fff"}}/></Btn>
      <Btn onClick={()=>setEmojis(v=>!v)} title="React"><Smile style={IS}/></Btn>
      {!isPrivileged&&canStudentRecProp&&(
        <Btn active={stuRec} title={stuRec?"Stop Recording":"Record"} onClick={toggleStuRecord}>
          <Circle style={{...IS,fill:stuRec?RED:"none",color:stuRec?RED:"#fff",animation:stuRec?"rec-pulse 1.2s ease-in-out infinite":"none"}}/>
        </Btn>
      )}
      <Btn onClick={()=>setMenu(v=>!v)} title="More"><MoreVertical style={IS}/></Btn>
      {onMinimize&&<Btn onClick={onMinimize} title="Minimize"><ChevronDown style={IS}/></Btn>}
      <button onClick={isPrivileged?onEndClass:onLeaveClass} style={{height:isMobile?42:52,padding:isMobile?"0 12px":"0 22px",borderRadius:26,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#dc2626,#ef4444)",color:"#fff",display:"flex",alignItems:"center",gap:isMobile?4:7,fontWeight:700,fontSize:isMobile?12:14,boxShadow:"0 4px 18px rgba(239,68,68,.5)",flexShrink:0}}>
        <Phone style={{width:17,height:17,transform:"rotate(135deg)"}}/> {isPrivileged?"End":"Leave"}
      </button>
    </div>
  </>);
};
const BottomBarBridge=(props:any)=>{const room=useRoomContext();const isMobile=useIsMobile();return<BottomBar {...props} room={room} isMobile={isMobile}/>;};

/* ══ MAIN ══ */
const ClassroomView=({subject,onLeave,onMinimize,autoJoin=false}:ClassroomViewProps)=>{
  const{user,hasRole}=useAuth();const{t}=useLanguage();const isMobile=useIsMobile();const isPrivileged=hasRole("admin")||hasRole("teacher");
  const[phase,setPhase]=useState<"lobby"|"live"|"ended">("lobby");
  const[token,setToken]=useState<string|null>(null);const[wsUrl,setWsUrl]=useState<string|null>(null);
  const[error,setError]=useState<string|null>(null);const[loading,setLoading]=useState(false);
  const[reconnecting,setReconnecting]=useState(false);
  /* ── reconnect state ── */
  const[roomKey,setRoomKey]=useState(0);          // bump to remount <LiveKitRoom> with fresh token
  const[autoReconnectCount,setAutoReconnectCount]=useState(0);
  const intentionalLeaveRef=useRef(false);         // true on manual leave → skip auto-reconnect
  /* ── lobby media choices ── */
  const[lobbyMic,setLobbyMic]=useState(false); // OFF by default — user must explicitly enable
  const[lobbyCam,setLobbyCam]=useState(false); // OFF by default — user must explicitly enable
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
  const[wbOpen,setWbOpen]=useState(false);const[matOpen,setMatOpen]=useState<any>(null);const[matPicker,setMatPicker]=useState(false);const[matPanelOpen,setMatPanelOpen]=useState(false);
  const[groupRecite,setGroupRecite]=useState(false);const[canStudentWrite,setCanStudentWrite]=useState(false);const[canStudentRec,setCanStudentRec]=useState(false);
  const[floatingEmojis,setFloatingEmojis]=useState<FloatingEmoji[]>([]);
  const[raisedHands,setRaisedHands]=useState<RaisedHand[]>([]);
  const[layout,setLayout]=useState<LayoutMode>("grid");
  const[groupReciteDialog,setGroupReciteDialog]=useState(false);
  const emojiIdRef=useRef(0);
  const wbBuffer=useRef<any[]|null>(null);const prefetch=useRef<{token:string;url:string}|null>(null);
  useEffect(()=>{supabase.functions.invoke("livekit-token",{body:{subject_id:subject.id,action:isPrivileged?"start_session":"join"}}).then(({data})=>{if(data?.token&&data?.url)prefetch.current={token:data.token,url:data.url};}).catch(()=>{});},[subject.id,isPrivileged]);
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
      let tk=prefetch.current?.token||null,url=prefetch.current?.url||null;
      if(!tk||!url){const{data,error:e}=await supabase.functions.invoke("livekit-token",{body:{subject_id:subject.id,action}});if(e)throw e;if(data?.error)throw new Error(data.error);tk=data.token;url=data.url;}
      if(settings&&sessionId)await supabase.from("live_sessions").update({...settings,actual_start_time:new Date().toISOString(),status:"live"}).eq("id",sessionId);
      setToken(tk!);setWsUrl(url!);
      const{data:sessions}=await supabase.from("live_sessions").select("*").eq("subject_id",subject.id).in("status",["live","active","scheduled"]).order("scheduled_at",{ascending:false,nullsFirst:false}).limit(1);
      if(sessions?.length){setSessionId(sessions[0].id);setSessionInfo(sessions[0]);const{data:att}=await supabase.from("attendance_logs").insert({session_id:sessions[0].id,user_id:user.id,device_info:navigator.userAgent}).select("id").single();if(att)setAttendanceId(att.id);await supabase.from("class_participants").upsert({session_id:sessions[0].id,student_id:user.id,joined_at:new Date().toISOString(),is_muted:!isPrivileged,camera_on:true,left_at:null,left_minutes:null},{onConflict:"session_id,student_id"});}
      setPhase("live");
      try { playJoinSound(); } catch {}
    }catch(e:any){setError(e?.message||"Failed to connect");}finally{setLoading(false);}
  };

  /* ══ AUTO-RECONNECT ══
     Fires when LiveKit emits Disconnected unexpectedly (e.g. Android tab suspension).
     Fetches a fresh token, bumps roomKey to force <LiveKitRoom> remount, up to 5 tries.
     intentionalLeaveRef guards against triggering this on a manual leave/end.           */
  const autoReconnect=useCallback(async()=>{
    if(intentionalLeaveRef.current)return;
    if(autoReconnectCount>=5){
      setReconnecting(false);
      setError("Connection lost after several attempts. Please try again.");
      setPhase("lobby");
      return;
    }
    setReconnecting(true);
    try{
      const{data}=await supabase.functions.invoke("livekit-token",{body:{subject_id:subject.id,action:isPrivileged?"start_session":"join"}});
      if(data?.token&&data?.url){
        prefetch.current={token:data.token,url:data.url};
        setToken(data.token);
        setWsUrl(data.url);
        setRoomKey(k=>k+1); // remount LiveKitRoom with the fresh token
        setAutoReconnectCount(c=>c+1);
      }
    }catch{
      setError("Reconnection failed. Please try again.");
      setPhase("lobby");
    }finally{
      setReconnecting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[subject.id,isPrivileged,autoReconnectCount]);

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
        await supabase.from("live_sessions").update({status:"ended",ended_at:new Date().toISOString(),actual_end_time:new Date().toISOString()}).eq("id",sessionId);
        if(user)await supabase.from("class_chat_messages").insert({session_id:sessionId,sender_id:user.id,message:t("Class has ended","انتهت الحصة"),type:"system"});
        // Clear all chat messages for this session after a short delay so
        // the "class has ended" system message is visible, then wiped clean.
        setTimeout(async()=>{
          try{
            await supabase.from("class_chat_messages").delete().eq("session_id",sessionId);
          }catch(e){console.warn("[endSession] chat clear failed:",e);}
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
    if(all.length===0)return null;
    return(
      <div style={{display:"flex",alignItems:"center",gap:4,background:"rgba(255,255,255,.07)",borderRadius:16,padding:"3px 10px",border:"1px solid rgba(255,255,255,.1)"}}>
        <Users style={{width:10,height:10,color:"rgba(255,255,255,.45)"}}/>
        <span style={{fontSize:11,color:"#fff",fontWeight:600}}>{all.length}</span>
      </div>
    );
  };
  const fmtT=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  if(phase==="ended")return<ClassEndScreen subject={subject} session={sessionInfo} duration={duration} participantCount={0} onGoToDashboard={onLeave} onGoToRevision={()=>{window.location.href=`/student/revision/${subject.id}`;}} />;
  if(phase==="lobby"&&!loading&&!error&&!autoJoin)return<ClassLobby subject={subject} session={sessionInfo} onStartClass={(s:any,media?:any)=>connect("start_session",s,media)} onJoinClass={(media?:any)=>connect("join",undefined,media)} onBack={onLeave} isLive={isSessionLive}/>;
  if(loading)return(<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",background:DARK}}><style>{CSS}</style><div style={{textAlign:"center"}}><div style={{width:52,height:52,border:`3px solid ${TEAL}`,borderTopColor:"transparent",borderRadius:"50%",animation:"cv-spin .8s linear infinite",margin:"0 auto 16px"}}/><p style={{color:"rgba(255,255,255,.5)",fontSize:14}}>{t("Connecting…","جاري الاتصال…")}</p></div></div>);
  if(error)return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",background:DARK}}>
      <style>{CSS}</style>
      <div style={{textAlign:"center",maxWidth:320,padding:28}}>
        <div style={{width:64,height:64,borderRadius:"50%",background:"rgba(239,68,68,.12)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}><X style={{width:28,height:28,color:RED}}/></div>
        <h2 style={{fontSize:20,fontWeight:700,color:"#fff",marginBottom:8}}>Connection Failed</h2>
        <p style={{color:"rgba(255,255,255,.45)",fontSize:14,marginBottom:22}}>{error}</p>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          {/* Try Again: reset guard + counter, clear stale tokens, reconnect directly */}
          <button onClick={()=>{
            intentionalLeaveRef.current=false;
            setAutoReconnectCount(0);
            setError(null);
            setToken(null);
            setWsUrl(null);
            connect(isPrivileged?"start_session":"join");
          }} style={{padding:"10px 22px",borderRadius:10,background:TEAL,border:"none",color:"#fff",fontSize:14,cursor:"pointer",fontWeight:600}}>Try Again</button>
          <button onClick={onLeave} style={{padding:"10px 22px",borderRadius:10,background:GLASSB,border:"1px solid rgba(255,255,255,.12)",color:"#fff",fontSize:14,cursor:"pointer"}}>Go Back</button>
        </div>
      </div>
    </div>
  );
  return(
    <div data-classroom-root style={{height:"100dvh",display:"flex",flexDirection:"column",background:DARK,overflow:"hidden"}}>
      <style>{CSS}</style>
      {token&&wsUrl&&(
        // key={roomKey} forces a full remount whenever autoReconnect bumps the key,
        // ensuring LiveKit starts with a fresh connection and token.
        <LiveKitRoom key={roomKey} serverUrl={wsUrl} token={token} connect={phase==="live"} audio={false} video={false} options={{adaptiveStream:{pixelDensity:"screen"},dynacast:true,disconnectOnPageLeave:false,audioCaptureDefaults:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,sampleRate:48000,channelCount:1},publishDefaults:{audioPreset:{maxBitrate:32000},dtx:true,red:false,stopMicTrackOnMute:false,videoEncoding:{maxBitrate:700_000,maxFramerate:20},backupCodec:true},videoCaptureDefaults:{resolution:{width:640,height:480,frameRate:20},facingMode:"user"}}} style={{flex:1,display:"flex",flexDirection:"column",minHeight:0,position:"relative"}} data-lk-theme="default">
          <RoomAudioRenderer/>
          <MediaAutoPublish lobbyMic={lobbyMic} lobbyCam={lobbyCam}/>
          <WbSyncBridge wbOpen={wbOpen} isTeacher={isPrivileged}/>
          <AdminMuteListener isPrivileged={isPrivileged}/>
          <GroupReciteAutoMic active={groupRecite} isPrivileged={isPrivileged}/>
          {/* onDisconnected wired to autoReconnect — handles Android tab suspension */}
          <ReconnectMonitor
            onReconnecting={()=>setReconnecting(true)}
            onReconnected={()=>setReconnecting(false)}
            onDisconnected={autoReconnect}
          />
          <RoomDataListener onWbOpen={()=>setWbOpen(true)} onWbClose={()=>setWbOpen(false)} strokesBuffer={wbBuffer} onMatOpen={mat=>setMatOpen(mat)} onMatClose={()=>setMatOpen(null)} onWbAllowWrite={allow=>setCanStudentWrite(allow)} onRecAllowed={allow=>setCanStudentRec(allow)} onEmojiReact={(emoji:string,sender:string)=>addFloatingEmoji(emoji,sender)} onGroupRecite={handleGroupReciteFromTeacher} onHandRaise={handleHandRaise} onAdminMuteAll={()=>{}}/>
          {reconnecting&&<div style={{position:"absolute",inset:0,zIndex:200,background:"rgba(0,0,0,.82)",backdropFilter:"blur(8px)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14}}><div style={{width:48,height:48,border:`3px solid ${TEAL}`,borderTopColor:"transparent",borderRadius:"50%",animation:"cv-spin .8s linear infinite"}}/><p style={{color:"#fff",fontSize:15,fontWeight:700}}>Reconnecting…</p><p style={{color:"rgba(255,255,255,.4)",fontSize:13}}>Please stay on the page</p></div>}
          {/* Top bar */}
          <div style={{height:52,background:GLASS,backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 10px 0 12px",flexShrink:0,borderBottom:"1px solid rgba(255,255,255,.05)",gap:6}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(34,197,94,.12)",borderRadius:20,padding:"4px 10px",border:"1px solid rgba(34,197,94,.25)",flexShrink:0}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:GREEN,display:"inline-block",animation:"pip-pulse 1.8s ease-in-out infinite"}}/>
                <span style={{fontSize:12,color:"#fff",fontWeight:600,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{subject.title}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:5,background:"rgba(239,68,68,.12)",borderRadius:16,padding:"3px 8px",border:"1px solid rgba(239,68,68,.25)",flexShrink:0}}>
                <Circle style={{width:5,height:5,fill:RED,color:RED}}/><span style={{fontSize:11,color:"#fca5a5",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{fmtT(duration)}</span>
              </div>
              <ParticipantCountBadge />
              {!isPrivileged&&canStudentWrite&&(
                <div title="You can write on the board" style={{display:"flex",alignItems:"center",gap:4,background:"rgba(52,211,153,.15)",borderRadius:14,padding:"3px 8px",border:"1px solid rgba(52,211,153,.3)",flexShrink:0,cursor:"pointer"}} onClick={()=>setWbOpen(v=>!v)}>
                  <PenTool style={{width:11,height:11,color:"#34d399"}}/>
                  <span style={{fontSize:10,color:"#34d399",fontWeight:700}}>{isMobile?"Board":"Write"}</span>
                </div>
              )}
              {!isPrivileged&&canStudentRec&&(
                <div title="You can record" style={{display:"flex",alignItems:"center",gap:4,background:"rgba(239,68,68,.15)",borderRadius:14,padding:"3px 8px",border:"1px solid rgba(239,68,68,.3)",flexShrink:0}}>
                  <Circle style={{width:9,height:9,fill:RED,color:RED,animation:"rec-pulse 1.4s ease-in-out infinite"}}/>
                  <span style={{fontSize:10,color:"#fca5a5",fontWeight:700}}>Record</span>
                </div>
              )}
              {isPrivileged&&raisedHands.length>0&&(
                <div style={{display:"flex",alignItems:"center",gap:4,background:"rgba(251,191,36,.18)",borderRadius:14,padding:"3px 8px",border:"1px solid rgba(251,191,36,.4)",flexShrink:0}}>
                  <span style={{fontSize:13,animation:"hand-bounce 1.2s ease-in-out infinite"}}>✋</span>
                  <span style={{fontSize:11,color:"#fbbf24",fontWeight:700}}>{raisedHands.length}</span>
                </div>
              )}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
              <LayoutSwitcher layout={layout} onChange={setLayout}/>
              {isPrivileged&&<RecController sessionId={sessionId} subjectId={subject.id} userEmail={user?.email||""} onSavingChange={setSavingRec} stopRecRef={recStopRef}/>}
            </div>
          </div>
          {/* Content — material panels render here so footer always stays visible */}
          <div style={{flex:1,display:"flex",minHeight:0,overflow:"hidden"}}>
            <div style={{flex:1,position:"relative",minWidth:0}}>
              <VideoGrid layout={layout}/>
              <FloatingEmojiLayer emojis={floatingEmojis}/>
              <RaisedHandsOverlay hands={raisedHands}/>
              {/* Materials panel — absolute inside content, footer always visible */}
              {matPanelOpen&&<SubjectMaterialsPanel subjectId={subject.id} onClose={()=>setMatPanelOpen(false)}/>}
              {/* Teacher-shared material viewer — absolute inside content */}
              {matOpen&&<MatViewerInlineBridge material={matOpen} isPrivileged={isPrivileged} onClose={()=>setMatOpen(null)}/>}
            </div>
            {chatOpen&&!isMobile&&(
              <div style={{width:320,background:"#13181f",borderLeft:"1px solid rgba(255,255,255,.06)",display:"flex",flexDirection:"column",flexShrink:0,animation:"slide-up .2s ease"}}>
                <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,.07)",flexShrink:0}}>
                  {[["chat","💬","Chat"],["polls","📊","Polls"]].map(([k,ic,lb])=>(<button key={k} onClick={()=>{setSideTab(k as any);if(k==="chat")setChatUnread(0);}} style={{flex:1,padding:"12px 4px",background:"none",border:"none",color:sideTab===k?"#fff":"rgba(255,255,255,.35)",fontSize:13,fontWeight:sideTab===k?700:400,borderBottom:sideTab===k?`2px solid ${TEAL}`:"2px solid transparent",cursor:"pointer"}}>{ic} {lb}</button>))}
                  <button onClick={()=>setChatOpen(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,.3)",cursor:"pointer",padding:"0 12px"}}><X style={{width:16,height:16}}/></button>
                </div>
                <div style={{flex:1,overflow:"hidden"}}>{sideTab==="chat"?<ClassChatPanel sessionId={sessionId||""}/>:<ClassPolls sessionId={sessionId||""}/>}</div>
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
          <BottomBarBridge sessionId={sessionId||""} onToggleChat={()=>{setChatOpen(v=>!v);if(!chatOpen)setChatUnread(0);}} onToggleParticipants={()=>setPartOpen(v=>!v)} onEndClass={()=>setShowEnd(true)} onLeaveClass={leaveSession} chatUnread={chatUnread} onToggleWhiteboard={()=>setWbOpen(v=>!v)} whiteboardOpen={wbOpen} onGroupRecite={handleGroupRecite} groupReciteMode={groupRecite} onShareMaterial={()=>setMatPicker(true)} isPrivileged={isPrivileged} canStudentWriteProp={canStudentWrite} canStudentRecProp={canStudentRec} onPermChange={(type:any,allow:any,room:any)=>handlePermChange(type,allow,room)} onMinimize={onMinimize} onToggleMaterials={()=>setMatPanelOpen(v=>!v)} matPanelOpen={matPanelOpen} onSendEmoji={addFloatingEmoji} layout={layout} onLayoutChange={setLayout}/>
          {isMobile&&chatOpen&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:50}} onClick={()=>setChatOpen(false)}><div style={{position:"absolute",bottom:0,left:0,right:0,background:"#13181f",borderRadius:"22px 22px 0 0",maxHeight:"82vh",display:"flex",flexDirection:"column",animation:"slide-up .22s ease",paddingBottom:"env(safe-area-inset-bottom,0px)"}} onClick={e=>e.stopPropagation()}><div style={{display:"flex",alignItems:"center",padding:"12px 16px 0",flexShrink:0}}><div style={{flex:1,display:"flex"}}>{[["chat","💬","Chat"],["polls","📊","Polls"]].map(([k,ic,lb])=>(<button key={k} onClick={()=>setSideTab(k as any)} style={{flex:1,padding:"10px 6px",background:"none",border:"none",color:sideTab===k?"#fff":"rgba(255,255,255,.35)",fontSize:13,fontWeight:sideTab===k?700:400,borderBottom:sideTab===k?`2px solid ${TEAL}`:"2px solid transparent",cursor:"pointer"}}>{ic} {lb}</button>))}</div><button onClick={()=>setChatOpen(false)} style={{width:32,height:32,borderRadius:"50%",background:"rgba(255,255,255,.1)",border:"none",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><X style={{width:14,height:14}}/></button></div><div style={{flex:1,overflow:"hidden",minHeight:340}}>{sideTab==="chat"?<ClassChatPanel sessionId={sessionId||""}/>:<ClassPolls sessionId={sessionId||""}/>}</div></div></div>)}
          {isMobile&&partOpen&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:50}} onClick={()=>setPartOpen(false)}><div style={{position:"absolute",bottom:BAR_H,left:0,right:0,background:"#13181f",borderRadius:"22px 22px 0 0",maxHeight:"65vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}><div style={{width:40,height:4,borderRadius:2,background:"rgba(255,255,255,.18)",margin:"12px auto 6px"}}/><ClassParticipants sessionId={sessionId||""}/></div></div>)}
          <LiveQuizOverlay sessionId={sessionId||""} isOpen={false} onClose={()=>{}}/>
        </LiveKitRoom>
      )}
      {matPicker&&<MatPickerBridge subjectId={subject.id} onShare={(mat:any,room:any)=>{setMatOpen(mat);setMatPicker(false);try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"mat_open",material:mat})),{reliable:true});}catch{}}} onClose={()=>setMatPicker(false)}/>}
      {showEnd&&createPortal(
        <div style={{position:"fixed",inset:0,zIndex:9500,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.72)",backdropFilter:"blur(6px)"}} onClick={()=>setShowEnd(false)}>
          <div style={{background:"#17202a",borderRadius:20,padding:"28px 28px 24px",width:"100%",maxWidth:380,margin:"0 16px",boxShadow:"0 24px 64px rgba(0,0,0,.7)",border:"1px solid rgba(255,255,255,.1)",animation:"fade-in .18s ease"}} onClick={e=>e.stopPropagation()}>
            <div style={{width:52,height:52,borderRadius:16,background:"rgba(239,68,68,.15)",border:"1.5px solid rgba(239,68,68,.35)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
              <Phone style={{width:22,height:22,color:"#ef4444",transform:"rotate(135deg)"}}/>
            </div>
            <h2 style={{textAlign:"center",fontSize:17,fontWeight:800,color:"#fff",marginBottom:8}}>{t("End class for everyone?","إنهاء الحصة للجميع؟")}</h2>
            <p style={{textAlign:"center",fontSize:13,color:"rgba(255,255,255,.45)",marginBottom:24}}>{t("This will disconnect all participants.","سيتم قطع الاتصال عن جميع المشاركين.")}</p>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <button onClick={endSession} style={{width:"100%",padding:"13px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#dc2626,#ef4444)",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 16px rgba(239,68,68,.45)"}}>{t("End for All","إنهاء للجميع")}</button>
              <button onClick={()=>{setShowEnd(false);leaveSession();}} style={{width:"100%",padding:"12px",borderRadius:12,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.07)",color:"rgba(255,255,255,.7)",fontSize:13,fontWeight:600,cursor:"pointer"}}>{t("Leave but Keep Open","غادر لكن أبقِ الحصة")}</button>
              <button onClick={()=>setShowEnd(false)} style={{width:"100%",padding:"12px",borderRadius:12,border:"1px solid rgba(255,255,255,.08)",background:"transparent",color:"rgba(255,255,255,.4)",fontSize:13,cursor:"pointer"}}>{t("Cancel","إلغاء")}</button>
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
