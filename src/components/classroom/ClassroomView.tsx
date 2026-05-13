/*
  ClassroomView.tsx — Tahleem Academy Live Classroom
  Interface matches GuestClassroom · VideoConference + ClassControls
*/

import {
  LiveKitRoom, RoomAudioRenderer, useRoomContext,
  VideoConference,
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
import { Badge } from "@/components/ui/badge";
import {
  Mic, MicOff, Video, VideoOff, Phone,
  PenTool, MessageCircle,
  BookOpen,
  Circle, Loader2, X, Pause, Play,
  Eye, Radio,
  Users,
} from "lucide-react";
import ClassLobby        from "./ClassLobby";
import ClassChatPanel    from "./ClassChatPanel";
import ClassParticipants from "./ClassParticipants";
import ClassPolls        from "./ClassPolls";
import ClassEndScreen    from "./ClassEndScreen";
import LiveQuizOverlay   from "./LiveQuizOverlay";
import ClassControls     from "./ClassControls";
import PDFViewer         from "./PDFViewer";
import { useIsMobile }   from "@/hooks/use-mobile";
import { useState, useEffect, useRef, useCallback } from "react";

interface ClassroomViewProps { subject: any; onLeave: () => void; onMinimize?: () => void; autoJoin?: boolean; }
interface FloatingEmoji { id: number; emoji: string; x: number; sender: string; }
interface RaisedHand   { identity: string; name: string; raisedAt: number; }

const TEAL  = "#0a7c68";
const TEAL2 = "#064E3B";
const DARK  = "#111";
const GLASS = "rgba(10,40,25,0.92)";
const GLASSB= "rgba(255,255,255,0.08)";
const GREEN = "#22c55e";
const RED   = "#ef4444";

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
`;

/* ══ CONNECTION QUALITY INDICATOR ══ */
const ConnectionIndicator = () => {
  const room = useRoomContext();
  const [quality, setQuality] = useState<"excellent" | "good" | "fair" | "poor">("excellent");
  useEffect(() => {
    const interval = setInterval(() => {
      const stats = room.localParticipant.connectionQuality as unknown as number;
      if (stats >= 3) setQuality("excellent");
      else if (stats >= 2) setQuality("good");
      else if (stats >= 1) setQuality("fair");
      else setQuality("poor");
    }, 3000);
    return () => clearInterval(interval);
  }, [room]);
  const colors = { excellent: "text-green-500", good: "text-green-400", fair: "text-yellow-500", poor: "text-red-500" };
  const bars   = { excellent: 4, good: 3, fair: 2, poor: 1 };
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-end gap-px h-3.5">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className={`w-1 rounded-sm transition-colors ${i <= bars[quality] ? colors[quality] : "bg-muted-foreground/20"}`}
            style={{ height: `${i * 3 + 2}px` }}
          />
        ))}
      </div>
    </div>
  );
};

/* ══ RECONNECT MONITOR ══ */
const MINIMIZE_GRACE_MS = 5 * 60 * 1000;

const ReconnectMonitor = ({ onReconnecting, onReconnected, onDisconnected }: {
  onReconnecting: () => void;
  onReconnected:  () => void;
  onDisconnected: () => void;
}) => {
  const room = useRoomContext();
  const graceTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenAt     = useRef<number | null>(null);
  const wsDropped    = useRef(false);

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
          if (wsDropped.current || room.state === ConnectionState.Disconnected) onDisconnected();
        }, MINIMIZE_GRACE_MS);
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
    return () => { room.off(RoomEvent.DataReceived, h); };
  }, [room, isPrivileged]);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

/* ══ ROOM DATA LISTENER ══ */
const RoomDataListener = ({ onWbOpen,onWbClose,strokesBuffer,onMatOpen,onMatClose,onWbAllowWrite,onRecAllowed,onEmojiReact,onGroupRecite,onHandRaise,onAdminMuteAll,onClassEnded,roomRef }:any) => {
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
    <div style={{background:"#0c2518",borderRadius:20,padding:"28px 24px",maxWidth:340,width:"100%",boxShadow:"0 24px 60px rgba(0,0,0,.7)",border:"1px solid rgba(255,255,255,.1)",animation:"fade-in .18s ease",textAlign:"center"}}>
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

/* ══ GROUP RECITE BRIDGE ══ */
const GroupReciteAutoMic=({active,isPrivileged}:{active:boolean;isPrivileged:boolean})=>{
  const room=useRoomContext();
  useEffect(()=>{
    if(!room?.localParticipant)return;
    if(active){ room.localParticipant.setMicrophoneEnabled(true).catch(()=>{}); }
    if(!active&&!isPrivileged){ room.localParticipant.setMicrophoneEnabled(false).catch(()=>{}); }
  },[active,isPrivileged,room]);
  return null;
};

/* ══ WHITEBOARD ══ */
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
      <div style={{background:`linear-gradient(135deg,${TEAL2},${TEAL})`,display:"flex",alignItems:"center",gap:8,padding:"8px 12px",flexShrink:0,boxShadow:"0 2px 16px rgba(0,0,0,.4)",overflowX:"auto" as const}}>
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

/* ══ MATERIAL PICKER ══ */
const MaterialPicker=({subjectId,onShare,onClose}:any)=>{
  const[mats,setMats]=useState<any[]>([]);const[busy,setBusy]=useState(true);
  useEffect(()=>{supabase.from("subject_materials").select("*").eq("subject_id",subjectId).order("created_at",{ascending:false}).then(({data})=>{setMats(data||[]);setBusy(false);});},[subjectId]);
  return createPortal(<div style={{position:"fixed",inset:0,zIndex:9997,background:"rgba(0,0,0,.72)",backdropFilter:"blur(8px)",display:"flex",alignItems:"flex-end"}} onClick={onClose}>
    <div style={{width:"100%",background:"#0c2518",borderRadius:"22px 22px 0 0",maxHeight:"70vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
      <div style={{padding:"14px 18px",borderBottom:"1px solid rgba(255,255,255,.08)",display:"flex",alignItems:"center",gap:10}}>
        <BookOpen style={{width:17,height:17,color:TEAL}}/><span style={{color:"#fff",fontWeight:700,fontSize:15,flex:1}}>Share Material with Class</span>
        <button onClick={onClose} style={{background:"none",border:"none",color:"rgba(255,255,255,.4)",cursor:"pointer"}}><X style={{width:17,height:17}}/></button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"6px 0"}}>
        {busy&&<div style={{display:"flex",justifyContent:"center",padding:28}}><Loader2 style={{width:24,height:24,color:TEAL,animation:"wb-spin .8s linear infinite"}}/></div>}
        {!busy&&!mats.length&&<p style={{textAlign:"center",padding:"28px",color:"rgba(255,255,255,.35)",fontSize:14}}>No materials for this subject</p>}
        {mats.map(m=>(<button key={m.id} onClick={()=>onShare(m)} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"13px 18px",background:"none",border:"none",cursor:"pointer",textAlign:"left" as const,borderBottom:"1px solid rgba(255,255,255,.06)"}}>
          <div style={{width:40,height:40,borderRadius:10,background:"rgba(10,124,104,.3)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><BookOpen style={{width:17,height:17,color:"#4ade80"}}/></div>
          <div style={{flex:1,minWidth:0}}><p style={{color:"#fff",fontWeight:600,fontSize:14,margin:"0 0 3px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}}>{m.title||m.name||"Untitled"}</p><p style={{color:"rgba(255,255,255,.35)",fontSize:11,margin:0,textTransform:"capitalize" as const}}>{m.material_type||"file"}</p></div>
          <span style={{fontSize:12,color:TEAL,fontWeight:700}}>Share →</span>
        </button>))}
      </div>
    </div>
  </div>,document.body);
};

/* ══ MATERIAL TYPE ICONS ══ */
const MAT_TYPE_ICON: Record<string, string> = {
  pdf:"📄",PDF:"📄",video:"🎬",Video:"🎬",audio:"🎵",Audio:"🎵",
  image:"🖼️",Image:"🖼️",link:"🔗",Link:"🔗",text:"📝",Text:"📝",
  document:"📝",Document:"📝",
};

function toMaterialEmbedUrl(url: string): { embedUrl: string; kind: "youtube"|"gdrive"|"pdf"|"video"|"audio"|"image"|"doc"|"iframe" } {
  if (!url) return { embedUrl: "", kind: "iframe" };
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (ytMatch) return { embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0`, kind: "youtube" };
  const gdMatch = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if (gdMatch) return { embedUrl: `https://drive.google.com/file/d/${gdMatch[1]}/preview`, kind: "gdrive" };
  const gdMatch2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (gdMatch2) return { embedUrl: `https://drive.google.com/file/d/${gdMatch2[1]}/preview`, kind: "gdrive" };
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return { embedUrl: url, kind: "pdf" };
  if (["mp4","webm","mov","m4v","avi","mkv"].includes(ext)) return { embedUrl: url, kind: "video" };
  if (["mp3","wav","m4a","aac","ogg","flac","opus"].includes(ext)) return { embedUrl: url, kind: "audio" };
  if (["jpg","jpeg","png","gif","webp","svg","avif","bmp"].includes(ext)) return { embedUrl: url, kind: "image" };
  if (["doc","docx","xls","xlsx","ppt","pptx","odt","ods","odp","csv","rtf"].includes(ext))
    return { embedUrl: `https://docs.google.com/gviewer?url=${encodeURIComponent(url)}&embedded=true`, kind: "doc" };
  return { embedUrl: url, kind: "iframe" };
}

const RESUME_KEY=(id:string)=>`mat-resume-${id}`;
function saveResume(id:string,data:{time?:number;page?:number}){ try{localStorage.setItem(RESUME_KEY(id),JSON.stringify({...data,at:Date.now()}));}catch{} }
function loadResume(id:string):{time?:number;page?:number}|null{ try{const raw=localStorage.getItem(RESUME_KEY(id));if(!raw)return null;return JSON.parse(raw);}catch{return null;} }

/* ══ IN-CLASS MATERIAL VIEWER ══ */
const InClassMaterialViewer=({material,onClose,isTeacher=false}:any)=>{
  const rawUrl=material.file_url||material.url||"";
  const matId=material.id||rawUrl;
  const [resolvedUrl, setResolvedUrl] = useState<string>(rawUrl.startsWith("http") ? rawUrl : "");
  const [urlLoading, setUrlLoading] = useState(!rawUrl.startsWith("http"));
  useEffect(()=>{
    if(rawUrl.startsWith("http")){ setResolvedUrl(rawUrl); setUrlLoading(false); return; }
    setUrlLoading(true);
    getSignedUrl(rawUrl).then(signed=>{ setResolvedUrl(signed||rawUrl); setUrlLoading(false); }).catch(()=>{ setResolvedUrl(rawUrl); setUrlLoading(false); });
  },[rawUrl]);
  const url=resolvedUrl;
  const {embedUrl,kind}=toMaterialEmbedUrl(url);
  const resume=loadResume(matId);
  const videoRef=useRef<HTMLVideoElement>(null);
  const iframeRef=useRef<HTMLIFrameElement>(null);
  useEffect(()=>{ if(kind!=="video"||!videoRef.current)return; const el=videoRef.current; const onLoaded=()=>{if(resume?.time&&isFinite(resume.time))el.currentTime=resume.time;}; el.addEventListener("loadedmetadata",onLoaded); return()=>el.removeEventListener("loadedmetadata",onLoaded); },[]);
  useEffect(()=>{ if(kind!=="video")return; const iv=setInterval(()=>{ if(videoRef.current&&isFinite(videoRef.current.currentTime)&&videoRef.current.currentTime>0) saveResume(matId,{time:videoRef.current.currentTime}); },3000); return()=>{ clearInterval(iv); if(videoRef.current&&videoRef.current.currentTime>0) saveResume(matId,{time:videoRef.current.currentTime}); }; },[matId,kind]);
  const[loaded,setLoaded]=useState(false);
  const overlayStyle: React.CSSProperties = { position:"fixed",inset:0,zIndex:10000 };
  const renderContent=()=>{
    if(urlLoading||!url) return(<div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#0f1117",gap:14}}><div style={{width:40,height:40,borderRadius:"50%",border:"3px solid rgba(255,255,255,.1)",borderTopColor:TEAL,animation:"cv-spin .7s linear infinite"}}/><p style={{color:"#9ca3af",fontSize:13,margin:0}}>Preparing material...</p></div>);
    if(kind==="image") return(<div style={{flex:1,background:"#000",display:"flex",alignItems:"center",justifyContent:"center",overflow:"auto"}}><img src={embedUrl} alt={material.title} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",display:"block"}}/></div>);
    if(kind==="audio") return(<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",background:"#0f1a14",flexDirection:"column",gap:16,padding:20}}><div style={{fontSize:56}}>🎵</div><p style={{color:"#fff",fontWeight:700,fontSize:16,margin:0,textAlign:"center"}}>{material.title}</p><audio src={embedUrl} controls autoPlay style={{maxWidth:380,width:"100%"}} onLoadedMetadata={e=>{if(resume?.time)(e.target as HTMLAudioElement).currentTime=resume.time;}} onTimeUpdate={e=>{const el=e.target as HTMLAudioElement;if(el.currentTime>0)saveResume(matId,{time:el.currentTime});}}/></div>);
    if(kind==="video") return(<div style={{flex:1,background:"#000",display:"flex",alignItems:"center",justifyContent:"center"}}><video ref={videoRef} src={embedUrl} controls autoPlay playsInline style={{maxWidth:"100%",maxHeight:"100%",display:"block"}}/></div>);
    if(kind==="pdf") return(<div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}><PDFViewer url={embedUrl} bg="#0f1117" materialId={matId}/></div>);
    return(<div style={{flex:1,position:"relative",minHeight:0}}>{!loaded&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"#0f1a14",zIndex:1}}><div style={{width:32,height:32,border:"3px solid rgba(255,255,255,.2)",borderTopColor:TEAL,borderRadius:"50%",animation:"cv-spin .7s linear infinite"}}/></div>}<iframe ref={iframeRef} src={embedUrl} title={material.title} style={{width:"100%",height:"100%",border:"none",display:"block"}} allow="autoplay;fullscreen;accelerometer;encrypted-media;picture-in-picture" allowFullScreen onLoad={()=>setLoaded(true)}/></div>);
  };
  const resumeBadge=resume?.time||resume?.page;
  return(
    <div style={{...overlayStyle,background:"#0f1117",display:"flex",flexDirection:"column",animation:"fade-in .18s ease"}}>
      <div style={{height:46,background:"rgba(6,78,59,.97)",display:"flex",alignItems:"center",padding:"0 10px",gap:8,flexShrink:0,borderBottom:"1px solid rgba(255,255,255,.08)"}}>
        <span style={{fontSize:15}}>{MAT_TYPE_ICON[material.material_type||"document"]||"📄"}</span>
        <span style={{flex:1,fontSize:13,fontWeight:700,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{material.title||"Material"}</span>
        {resumeBadge&&(<span style={{fontSize:10,color:"rgba(255,255,255,.5)",background:"rgba(255,255,255,.1)",borderRadius:8,padding:"2px 7px",flexShrink:0}}>{resume?.time?`▶ ${Math.floor((resume.time||0)/60)}m${Math.floor((resume.time||0)%60)}s`:`p.${resume?.page}`} resumed</span>)}
        {!isTeacher&&<span style={{fontSize:10,color:"rgba(255,255,255,.4)",flexShrink:0}}>Shared by teacher</span>}
        <a href={url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#d1d5db",background:"rgba(255,255,255,.1)",borderRadius:8,padding:"4px 10px",textDecoration:"none",fontWeight:600,flexShrink:0}}>↗</a>
        <button onClick={onClose} title="Close material" style={{width:30,height:30,borderRadius:8,background:"rgba(255,255,255,.12)",border:"none",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><X style={{width:13,height:13}}/></button>
      </div>
      {renderContent()}
    </div>
  );
};

/* ══ SURAH PAGE MAPPING ══ */
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

type QuranMode="quran"|"translation"|"tafseer";
const SURAHS_LIST=[
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
  const[mushafAyahs,setMushafAyahs]=useState<any[]>([]);
  const[mushafLoading,setMushafLoading]=useState(false);
  const[transAyahs,setTransAyahs]=useState<any[]>([]);
  const[transLoading,setTransLoading]=useState(false);
  const[surahNum,setSurahNum]=useState(1);
  const[surahAyahs,setSurahAyahs]=useState<any[]>([]);
  const[surahLoading,setSurahLoading]=useState(false);
  const[expandedTafseer,setExpandedTafseer]=useState<Record<string,string>>({});
  const[loadingTafseer,setLoadingTafseer]=useState<Record<string,boolean>>({});
  const[showPicker,setShowPicker]=useState(false);
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const[playingVerse,setPlayingVerse]=useState<string|null>(null);
  const[reciter,setReciter]=useState("Alafasy_128kbps");
  const RECITERS=[
    {id:"Alafasy_128kbps",name:"Alafasy",ar:"العفاسي"},
    {id:"Abdul_Basit_Murattal_192kbps",name:"Abdul Basit",ar:"عبد الباسط"},
    {id:"Husary_128kbps",name:"Husary",ar:"الحصري"},
    {id:"Hudhaify_128kbps",name:"Hudhaify",ar:"الحذيفي"},
    {id:"Minshawy_Murattal_128kbps",name:"Minshawi",ar:"المنشاوي"},
    {id:"Mohammad_al_Tablaway_128kbps",name:"Tablaway",ar:"الطبلاوي"},
  ];
  const toAr=(n:number)=>String(n).replace(/[0-9]/g,d=>"٠١٢٣٤٥٦٧٨٩"[+d]);
  const fetchMushafPage=async(p:number)=>{
    setMushafLoading(true);setMushafAyahs([]);
    try{for(const ed of["ar.uthmani","quran-uthmani","quran-simple"]){const j=await fetch(`https://api.alquran.cloud/v1/page/${p}/${ed}`).then(r=>r.json());if(j.code===200&&j.data?.ayahs?.length>0){setMushafAyahs(j.data.ayahs);break;}}}catch{}
    setMushafLoading(false);
  };
  const fetchTranslation=async(p:number)=>{
    setTransLoading(true);setTransAyahs([]);
    try{const enRes=await fetch(`https://api.alquran.cloud/v1/page/${p}/en.sahih`).then(r=>r.json());const enAyahs=enRes?.data?.ayahs||[];if(enAyahs.length>0){let arAyahs:any[]=[];try{const arRes=await fetch(`https://api.alquran.cloud/v1/page/${p}/ar.uthmani`).then(r=>r.json());arAyahs=arRes?.data?.ayahs||[];if(!arAyahs.length){const ar2=await fetch(`https://api.alquran.cloud/v1/page/${p}/quran-uthmani`).then(r=>r.json());arAyahs=ar2?.data?.ayahs||[];}}catch{}setTransAyahs(enAyahs.map((e:any,i:number)=>({...e,arabicText:arAyahs[i]?.text||""})));}}catch{}
    setTransLoading(false);
  };
  const fetchSurahArabic=async(num:number)=>{
    setSurahLoading(true);setSurahAyahs([]);setExpandedTafseer({});
    try{const j=await fetch(`https://api.alquran.cloud/v1/surah/${num}/ar.uthmani`).then(r=>r.json());if(j.code===200)setSurahAyahs(j.data.ayahs||[]);}catch{}
    setSurahLoading(false);
  };
  const toggleTafseer=async(surah:number,ayah:number)=>{
    const key=`${surah}:${ayah}`;
    if(expandedTafseer[key]!==undefined){setExpandedTafseer(p=>{const n={...p};delete n[key];return n;});return;}
    setLoadingTafseer(p=>({...p,[key]:true}));
    try{const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),8000);const r=await fetch(`https://api.quran.com/api/v4/tafsirs/16/by_ayah?verse_key=${surah}:${ayah}`,{signal:ctrl.signal});clearTimeout(t);const j=await r.json();const raw=j?.tafsir?.text||"";if(raw){setExpandedTafseer(p=>({...p,[key]:raw.replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim()}));}else throw new Error("empty");}
    catch{try{const r2=await fetch(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/ar.muyassar`);const j2=await r2.json();const txt=(j2?.data?.text||"").replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();if(txt)setExpandedTafseer(p=>({...p,[key]:txt}));else throw new Error("empty");}catch{setExpandedTafseer(p=>({...p,[key]:"تعذّر تحميل التفسير. تحقق من الاتصال بالإنترنت."}));}}
    setLoadingTafseer(p=>({...p,[key]:false}));
  };
  const playVerse=(surah:number,verse:number)=>{
    const key=`${surah}:${verse}`;
    if(playingVerse===key){audioRef.current?.pause();setPlayingVerse(null);return;}
    audioRef.current?.pause();
    const s3=String(surah).padStart(3,"0"),v3=String(verse).padStart(3,"0");
    const au=new Audio(`https://everyayah.com/data/${reciter}/${s3}${v3}.mp3`);
    audioRef.current=au;setPlayingVerse(key);
    au.play().catch(()=>{const fb=new Audio(`https://everyayah.com/data/Alafasy_128kbps/${s3}${v3}.mp3`);audioRef.current=fb;fb.play().catch(()=>setPlayingVerse(null));fb.onended=()=>setPlayingVerse(null);});
    au.onended=()=>setPlayingVerse(null);
  };
  const jumpToSurah=(num:number)=>{setSurahNum(num);setShowPicker(false);if(mode!=="tafseer"){setPage(SURAH_PAGE[num]||1);}};
  const changePage=(delta:number)=>{const np=Math.max(1,Math.min(604,page+delta));setPage(np);};
  const commitPageInput=()=>{const n=parseInt(pageInput,10);if(n>=1&&n<=604){setPage(n);}setPageInputOpen(false);setPageInput("");};
  useEffect(()=>{if(mode==="quran")fetchMushafPage(page);if(mode==="translation")fetchTranslation(page);},[page,mode]);
  useEffect(()=>{try{localStorage.setItem(QURAN_PAGE_KEY,String(page));}catch{}},[page]);
  useEffect(()=>{if(mode==="tafseer")fetchSurahArabic(surahNum);},[surahNum,mode]);
  useEffect(()=>{if(mode==="quran")fetchMushafPage(page);if(mode==="translation")fetchTranslation(page);if(mode==="tafseer"&&surahAyahs.length===0)fetchSurahArabic(surahNum);},[mode]);
  useEffect(()=>{return()=>{audioRef.current?.pause();};},[]);
  const MODES=[{key:"quran" as QuranMode,icon:"📖",label:"Mushaf"},{key:"translation" as QuranMode,icon:"🌐",label:"Trans."},{key:"tafseer" as QuranMode,icon:"📚",label:"Tafseer"}];
  const PageNav=()=>(<div style={{display:"flex",alignItems:"center",gap:4,padding:"5px 8px",borderBottom:"1px solid #e8dfc8",background:"#fff",flexShrink:0}}><button onClick={()=>changePage(-1)} disabled={page<=1} style={{padding:"4px 11px",borderRadius:6,border:"1px solid #d4c9a0",background:"#f5f0e4",color:"#1a3d24",cursor:page<=1?"not-allowed":"pointer",fontSize:15,fontWeight:700,opacity:page<=1?0.35:1,flexShrink:0}}>←</button>{pageInputOpen?(<div style={{flex:1,display:"flex",alignItems:"center",gap:4,justifyContent:"center"}}><input autoFocus type="number" min={1} max={604} value={pageInput} onChange={e=>setPageInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")commitPageInput();if(e.key==="Escape"){setPageInputOpen(false);setPageInput("");}}} onBlur={commitPageInput} style={{width:56,textAlign:"center",padding:"3px 6px",border:"2px solid #b7791f",borderRadius:6,fontSize:14,fontWeight:700,color:"#1a3d24",outline:"none"}} placeholder={String(page)}/><span style={{fontSize:10,color:"#b7791f",fontWeight:600}}>/ 604</span></div>):(<button onClick={()=>{setPageInput(String(page));setPageInputOpen(true);}} style={{flex:1,background:"none",border:"1px solid transparent",borderRadius:6,cursor:"pointer",padding:"3px 0",textAlign:"center"}} title="Tap to jump to page"><span style={{fontSize:12,fontWeight:700,color:"#1a3d24"}}>P </span><span style={{fontSize:15,fontWeight:800,color:"#1a3d24"}}>{page}</span><span style={{fontSize:10,color:"#b7791f"}}> / 604</span></button>)}<button onClick={()=>changePage(1)} disabled={page>=604} style={{padding:"4px 11px",borderRadius:6,border:"1px solid #d4c9a0",background:"#f5f0e4",color:"#1a3d24",cursor:page>=604?"not-allowed":"pointer",fontSize:15,fontWeight:700,opacity:page>=604?0.35:1,flexShrink:0}}>→</button><button onClick={()=>setShowPicker(true)} style={{padding:"4px 8px",borderRadius:6,border:"1px solid #b7791f",background:"#fffbf0",color:"#b7791f",cursor:"pointer",fontSize:10,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>☰ Surah</button></div>);
  const ReciterStrip=()=>(<div style={{display:"flex",gap:4,overflowX:"auto",padding:"5px 8px",background:"#f9f5ec",borderBottom:"1px solid #e8dfc8",flexShrink:0,WebkitOverflowScrolling:"touch" as any}}>{RECITERS.map(r=>(<button key={r.id} onClick={()=>{setReciter(r.id);if(playingVerse){const[s,v]=playingVerse.split(":").map(Number);audioRef.current?.pause();setPlayingVerse(null);setTimeout(()=>playVerse(s,v),80);}}} style={{flexShrink:0,padding:"3px 9px",borderRadius:12,border:`1.5px solid ${reciter===r.id?"#b7791f":"rgba(183,121,31,.3)"}`,background:reciter===r.id?"#b7791f":"#fff",color:reciter===r.id?"#fff":"#7a5c1e",fontSize:10,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",transition:"all .15s"}}>{r.ar}</button>))}</div>);
  const SurahPicker=()=>showPicker?(<div style={{position:"absolute",inset:0,zIndex:30,background:"rgba(0,0,0,.5)"}} onClick={()=>setShowPicker(false)}><div onClick={e=>e.stopPropagation()} style={{position:"absolute",inset:0,background:"#faf6ec",display:"flex",flexDirection:"column"}}><div style={{padding:"10px 14px",background:"linear-gradient(135deg,#1a3d24,#276749)",display:"flex",alignItems:"center",gap:8,flexShrink:0}}><div style={{flex:1,fontSize:13,fontWeight:800,color:"#fff"}}>Jump to Surah</div><button onClick={()=>setShowPicker(false)} style={{background:"rgba(255,255,255,.2)",border:"none",color:"#fff",borderRadius:6,width:26,height:26,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><X style={{width:12,height:12}}/></button></div><div style={{flex:1,overflowY:"auto"}}>{SURAHS_LIST.map(s=>(<button key={s.n} onClick={()=>jumpToSurah(s.n)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 14px",background:surahNum===s.n?"#f0fff4":"none",border:"none",borderBottom:"1px solid #f0e8d4",cursor:"pointer",textAlign:"left"}}><span style={{width:24,height:24,borderRadius:"50%",background:"#1a3d24",color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{s.n}</span><span style={{flex:1,fontSize:13,fontWeight:600,color:"#1a3d24"}}>{s.name}</span><span style={{fontFamily:"'Amiri',serif",fontSize:16,color:"#b7791f",fontWeight:700}}>{s.ar}</span></button>))}</div></div></div>):null;
  const outerStyle:React.CSSProperties=fullscreen?{position:"fixed",inset:0,zIndex:9999,background:"#000",display:"flex",flexDirection:"column"}:{position:"absolute",inset:0,zIndex:55,background:"rgba(0,0,0,.6)"};
  const panelStyle:React.CSSProperties=fullscreen?{flex:1,display:"flex",flexDirection:"column",background:"#faf6ec",overflow:"hidden"}:{position:"absolute",top:0,right:0,bottom:0,width:"min(460px,100%)",background:"#faf6ec",display:"flex",flexDirection:"column",boxShadow:"-8px 0 40px rgba(0,0,0,.5)",borderLeft:"1px solid rgba(183,121,31,.2)"};
  return(
    <div style={outerStyle} onClick={fullscreen?undefined:onClose}>
      <div onClick={e=>e.stopPropagation()} style={panelStyle}>
        <div style={{background:"linear-gradient(135deg,#1a3d24,#276749)",padding:"7px 10px",flexShrink:0,display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontFamily:"'Amiri',serif",fontSize:14,fontWeight:800,color:"#fff",whiteSpace:"nowrap"}}>📖 القرآن</span>
          <div style={{flex:1,display:"flex",gap:2,background:"rgba(0,0,0,.25)",borderRadius:6,padding:2}}>{MODES.map(m=>(<button key={m.key} onClick={()=>setMode(m.key)} style={{flex:1,padding:"4px 2px",borderRadius:4,border:"none",fontSize:10,fontWeight:700,cursor:"pointer",background:mode===m.key?"rgba(255,255,255,.22)":"transparent",color:mode===m.key?"#fff":"rgba(255,255,255,.45)",transition:"all .15s",whiteSpace:"nowrap"}}>{m.icon} {m.label}</button>))}</div>
          <button onClick={()=>setFullscreen(f=>!f)} style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:6,width:28,height:28,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}} title={fullscreen?"Exit fullscreen":"Fullscreen"}>{fullscreen?"⊡":"⛶"}</button>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:6,width:28,height:28,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><X style={{width:13,height:13}}/></button>
        </div>
        {mode==="quran"&&(<><PageNav/><ReciterStrip/><div style={{flex:1,overflowY:"auto",background:"linear-gradient(180deg,#f5f0e8 0%,#ede8da 100%)"}}>{mushafLoading&&(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:40,gap:10}}><div style={{width:28,height:28,border:"3px solid #1a3d24",borderTopColor:"transparent",borderRadius:"50%",animation:"cv-spin .7s linear infinite"}}/><span style={{fontSize:11,color:"#7a9e88",fontFamily:"'Amiri',serif"}}>جارٍ تحميل الصفحة…</span></div>)}{!mushafLoading&&mushafAyahs.length>0&&(<div style={{padding:"10px 8px 20px",maxWidth:460,margin:"0 auto"}}><div style={{background:"#fdf6e3",border:"2px solid rgba(201,168,76,.5)",borderRadius:4,boxShadow:"0 4px 20px rgba(26,61,36,0.15)",position:"relative"}}><div style={{position:"absolute",inset:7,border:"1px solid rgba(201,168,76,.25)",borderRadius:1,pointerEvents:"none",zIndex:1}}/><div style={{padding:"7px 16px",borderBottom:"1px solid rgba(201,168,76,.4)",display:"flex",justifyContent:"center",background:"linear-gradient(to bottom,rgba(201,168,76,.1),transparent)"}}><span style={{fontSize:11,fontWeight:700,color:"#b7791f",fontFamily:"'Amiri',serif"}}>صفحة {toAr(page)}</span></div>{(()=>{const groups:any[]=[];mushafAyahs.forEach((a:any)=>{const sn=a.surah?.number;if(!groups.length||groups[groups.length-1].surah!==sn)groups.push({surah:sn,surahData:a.surah,ayahs:[]});groups[groups.length-1].ayahs.push(a);});return groups.map((g:any,gi:number)=>(<div key={g.surah}><div style={{margin:`${gi===0?8:14}px 12px 6px`,padding:"5px 12px",background:"linear-gradient(135deg,#1a3d24,#276749)",borderRadius:4,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontFamily:"'Amiri',serif",fontSize:10,color:"rgba(255,255,255,.65)"}}>{g.surahData?.englishName}</span><span style={{fontFamily:"'Amiri',serif",fontSize:15,color:"#c9a84c",fontWeight:700}}>{g.surahData?.name}</span></div>{g.surah!==1&&g.surah!==9&&g.ayahs[0]?.numberInSurah===1&&(<div style={{fontFamily:"'Amiri Quran','Amiri',serif",fontSize:19,color:"#1c1208",textAlign:"center",direction:"rtl",padding:"6px 16px 2px",lineHeight:2}}>بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</div>)}<p style={{fontFamily:"'Amiri Quran','Scheherazade New','Amiri',serif",direction:"rtl",textAlign:"justify",lineHeight:2.8,color:"#1c1208",fontSize:23,margin:0,padding:"6px 18px 12px",wordBreak:"break-word"}}>{g.ayahs.map((a:any)=>{const vk=`${g.surah}:${a.numberInSurah}`;const isPlaying=playingVerse===vk;return(<span key={a.numberInSurah}><span style={{background:isPlaying?"rgba(201,168,76,.18)":"transparent",borderRadius:3,transition:"background .2s"}}>{a.text}</span>{"\u00a0"}<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,borderRadius:"50%",background:isPlaying?"#1a3d24":"rgba(183,121,31,.85)",fontSize:9,fontWeight:700,color:"#fff",verticalAlign:"middle",flexShrink:0,margin:"0 1px",cursor:"pointer",boxShadow:isPlaying?"0 0 0 2px #c9a84c":"none",transition:"all .2s"}} onClick={()=>playVerse(g.surah,a.numberInSurah)}>{isPlaying?"▶":toAr(a.numberInSurah)}</span>{"\u00a0"}</span>);})}</p></div>));})()} <div style={{padding:"5px 16px",borderTop:"1px solid rgba(201,168,76,.4)",display:"flex",justifyContent:"center"}}><span style={{fontSize:10,color:"#b7791f",fontFamily:"'Amiri',serif"}}>— {toAr(page)} —</span></div></div><div style={{display:"flex",gap:8,marginTop:10}}><button onClick={()=>changePage(-1)} disabled={page<=1} style={{flex:1,padding:"10px",borderRadius:8,border:"1px solid rgba(201,168,76,.5)",background:"#fdf6e3",color:"#1a3d24",fontSize:18,fontWeight:700,cursor:page<=1?"not-allowed":"pointer",opacity:page<=1?0.3:1}}>◀</button><button onClick={()=>changePage(1)} disabled={page>=604} style={{flex:1,padding:"10px",borderRadius:8,border:"1px solid rgba(201,168,76,.5)",background:"#fdf6e3",color:"#1a3d24",fontSize:18,fontWeight:700,cursor:page>=604?"not-allowed":"pointer",opacity:page>=604?0.3:1}}>▶</button></div></div>)}{!mushafLoading&&mushafAyahs.length===0&&(<div style={{padding:"40px 20px",textAlign:"center",fontFamily:"'Amiri',serif"}}><div style={{fontSize:36,marginBottom:12}}>📖</div><p style={{fontSize:13,color:"#7a9e88",margin:"0 0 16px"}}>تعذّر تحميل الصفحة</p><button onClick={()=>fetchMushafPage(page)} style={{padding:"8px 20px",borderRadius:8,border:"none",background:"#1a3d24",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>🔄 إعادة المحاولة</button></div>)}</div></>)}
        {mode==="translation"&&(<><PageNav/><div style={{flex:1,overflowY:"auto",background:"#fff"}}><div style={{padding:"6px 12px",background:"linear-gradient(90deg,rgba(26,61,36,.06),transparent)",borderBottom:"1px solid #f0e8d4",display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:10,fontWeight:800,color:"#1a3d24",letterSpacing:.5,textTransform:"uppercase"}}>🌐 Sahih International · Page {page}</span></div>{transLoading&&(<div style={{display:"flex",justifyContent:"center",padding:24}}><div style={{width:22,height:22,border:"3px solid #1a3d24",borderTopColor:"transparent",borderRadius:"50%",animation:"cv-spin .7s linear infinite"}}/></div>)}{!transLoading&&transAyahs.map((a:any,i:number)=>{const sn=a.surah?.number;const vKey=`${sn}:${a.numberInSurah}`;return(<div key={i} style={{padding:"12px 14px",borderBottom:"1px solid #f5f0e4"}}><div style={{fontFamily:"'Amiri Quran','Amiri',serif",fontSize:20,color:"#1a3d24",lineHeight:2.1,textAlign:"right",direction:"rtl",wordBreak:"break-word",marginBottom:8}}>{a.arabicText}<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,borderRadius:"50%",background:"#b7791f",marginRight:5,fontSize:9,fontWeight:700,color:"#fff",verticalAlign:"middle",flexShrink:0}}>{toAr(a.numberInSurah)}</span></div><p style={{margin:"0 0 6px",fontSize:12,color:"#2d3748",lineHeight:1.75}}>{a.text}</p><button onClick={()=>playVerse(sn,a.numberInSurah)} style={{padding:"2px 8px",borderRadius:5,border:"1px solid #d4e8d4",background:playingVerse===vKey?"#fee2e2":"#f0fff4",color:playingVerse===vKey?"#c0392b":"#1a3d24",fontSize:9,fontWeight:700,cursor:"pointer"}}>{playingVerse===vKey?"⏹ Stop":"▶ Listen"}</button></div>);})}</div></>)}
        {mode==="tafseer"&&(<><div style={{display:"flex",alignItems:"center",gap:6,padding:"7px 10px",borderBottom:"1px solid #e8dfc8",background:"#fff",flexShrink:0}}><div style={{flex:1,textAlign:"center"}}><span style={{fontFamily:"'Amiri',serif",fontSize:15,color:"#1a3d24",fontWeight:700}}>{SURAHS_LIST[surahNum-1]?.ar}</span><span style={{fontSize:11,color:"#666",marginLeft:6}}>{SURAHS_LIST[surahNum-1]?.name}</span></div><button onClick={()=>setShowPicker(true)} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #b7791f",background:"#fffbf0",color:"#b7791f",cursor:"pointer",fontSize:11,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>Surah ▾</button></div><div style={{flex:1,overflowY:"auto",background:"#fffbf0"}}><div style={{padding:"6px 12px",background:"linear-gradient(90deg,rgba(183,121,31,.08),transparent)",borderBottom:"1px solid #f0dda0",display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:10,fontWeight:800,color:"#b7791f",letterSpacing:.5,textTransform:"uppercase"}}>📚 تفسير ابن كثير — Tafseer Ibn Katheer</span></div>{surahLoading&&(<div style={{display:"flex",justifyContent:"center",padding:24}}><div style={{width:22,height:22,border:"3px solid #b7791f",borderTopColor:"transparent",borderRadius:"50%",animation:"cv-spin .7s linear infinite"}}/></div>)}{!surahLoading&&(<>{surahNum!==9&&(<div style={{fontFamily:"'Amiri',serif",fontSize:18,color:"#b7791f",textAlign:"center",direction:"rtl",padding:"10px 0 10px",borderBottom:"1px dashed #e8dfc8"}}>بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>)}{surahAyahs.map((a:any)=>{const key=`${surahNum}:${a.numberInSurah}`;const isExpanded=expandedTafseer[key]!==undefined;const isLoadingT=loadingTafseer[key];return(<div key={a.numberInSurah} style={{borderBottom:"1px solid #f0e8d4",background:isExpanded?"#fffbf0":"#fff"}}><div style={{padding:"10px 12px 6px"}}><div style={{fontFamily:"'Amiri Quran','Amiri',serif",fontSize:21,color:"#1a3d24",lineHeight:2.2,textAlign:"right",direction:"rtl",wordBreak:"break-word"}}>{a.text}<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,borderRadius:"50%",background:"#b7791f",marginRight:5,fontSize:9,fontWeight:700,color:"#fff",verticalAlign:"middle",flexShrink:0}}>{toAr(a.numberInSurah)}</span></div><div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:4}}><button onClick={()=>playVerse(surahNum,a.numberInSurah)} style={{padding:"3px 9px",borderRadius:5,border:"1px solid #d4e8d4",background:playingVerse===key?"#fee2e2":"#f0fff4",color:playingVerse===key?"#c0392b":"#1a3d24",fontSize:10,fontWeight:700,cursor:"pointer"}}>{playingVerse===key?"⏹ Stop":"▶ Listen"}</button><button onClick={()=>toggleTafseer(surahNum,a.numberInSurah)} style={{padding:"3px 9px",borderRadius:5,border:"1px solid rgba(183,121,31,.4)",background:isExpanded?"#fff3d4":"#fff",color:"#b7791f",fontSize:10,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>{isLoadingT?<span style={{display:"inline-block",width:9,height:9,border:"2px solid #b7791f",borderTopColor:"transparent",borderRadius:"50%",animation:"cv-spin .6s linear infinite"}}/>:(isExpanded?"▲ Hide":"📚")}{isLoadingT?"…":isExpanded?"":"Tafseer"}</button></div></div>{isExpanded&&(<div style={{padding:"8px 12px 10px",background:"#fffbf0",borderTop:"1px solid #f5edd8"}}><div style={{fontSize:9,fontWeight:800,color:"#b7791f",letterSpacing:.7,textTransform:"uppercase",marginBottom:5}}>تفسير ابن كثير</div><div style={{fontFamily:"'Amiri',serif",fontSize:14,color:"#3d3522",lineHeight:2,direction:"rtl",textAlign:"right",whiteSpace:"pre-wrap"}}>{expandedTafseer[key]}</div></div>)}</div>);})}</>)}</div></>)}
        {SurahPicker()}
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&display=swap');`}</style>
      </div>
    </div>
  );
};

const SubjectMaterialsPanel=({subjectId,subject,onClose}:any)=>{
  const[mats,setMats]=useState<any[]>([]);
  const[busy,setBusy]=useState(true);
  const[viewing,setViewing]=useState<any>(null);
  const[quranOpen,setQuranOpen]=useState(false);
  useEffect(()=>{ supabase.from("subject_materials" as any).select("*").eq("subject_id",subjectId).order("created_at",{ascending:false}).then(({data})=>{setMats(data||[]);setBusy(false);}); },[subjectId]);
  if(quranOpen) return <InClassQuranReader onClose={()=>setQuranOpen(false)}/>;
  return(
    <div style={{position:"absolute",inset:0,zIndex:55,background:"rgba(0,0,0,.55)"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:0,right:0,bottom:0,width:"min(360px,100%)",background:"#0c2216",borderLeft:"1px solid rgba(255,255,255,.08)",display:"flex",flexDirection:"column",animation:"slide-up .2s ease",boxShadow:"-8px 0 32px rgba(0,0,0,.5)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"14px 16px",borderBottom:"1px solid rgba(255,255,255,.08)",flexShrink:0}}>
          <Eye style={{width:16,height:16,color:TEAL}}/><span style={{flex:1,fontSize:14,fontWeight:700,color:"#fff"}}>Subject Materials</span>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"none",color:"#fff",borderRadius:8,width:30,height:30,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><X style={{width:14,height:14}}/></button>
        </div>
        <button onClick={()=>setQuranOpen(true)} style={{margin:"10px 10px 0",padding:"14px 16px",borderRadius:12,border:"1px solid rgba(183,121,31,.4)",background:"linear-gradient(135deg,rgba(26,61,36,.9),rgba(39,103,73,.9))",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{fontSize:28}}>📖</div>
          <div><div style={{fontFamily:"'Amiri',serif",fontSize:16,fontWeight:800,color:"#fef9ee"}}>Open Full Quran</div><div style={{fontFamily:"'Amiri',serif",fontSize:11,color:"rgba(255,255,255,.55)",direction:"rtl"}}>Arabic · Translation · Tafseer Ibn Katheer</div></div>
          <div style={{marginLeft:"auto",fontSize:11,color:"#34d399",fontWeight:700,flexShrink:0}}>604 Pages →</div>
        </button>
        <div style={{flex:1,overflowY:"auto",padding:10}}>
          {mats.length>0&&(<div style={{fontSize:11,color:"rgba(255,255,255,.35)",fontWeight:700,letterSpacing:.5,padding:"8px 4px 4px"}}>UPLOADED MATERIALS</div>)}
          {busy&&<div style={{display:"flex",justifyContent:"center",padding:40}}><div style={{width:24,height:24,border:`3px solid ${TEAL}`,borderTopColor:"transparent",borderRadius:"50%",animation:"cv-spin .7s linear infinite"}}/></div>}
          {!busy&&mats.length===0&&<div style={{textAlign:"center",padding:"30px 20px",color:"rgba(255,255,255,.35)"}}><div style={{fontSize:36,marginBottom:8}}>📭</div><p style={{fontSize:13,margin:0}}>No uploaded materials for this subject</p></div>}
          {mats.map(m=>{
            const icon=MAT_TYPE_ICON[m.material_type||"document"]||"📄";
            const resume=loadResume(m.id||"");
            return(<button key={m.id} onClick={()=>setViewing(m)} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.07)",borderRadius:12,cursor:"pointer",textAlign:"left",marginBottom:8,transition:"background .12s"}} onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,.09)")} onMouseLeave={e=>(e.currentTarget.style.background="rgba(255,255,255,.04)")}>
              <div style={{width:40,height:40,borderRadius:10,background:"rgba(10,124,104,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{icon}</div>
              <div style={{flex:1,minWidth:0}}><p style={{margin:0,fontSize:13,fontWeight:600,color:"#e8eaf0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.title||m.name||"Untitled"}</p><p style={{margin:"3px 0 0",fontSize:11,color:"rgba(255,255,255,.35)",textTransform:"capitalize"}}>{m.material_type||"file"}{resume?.time&&<span style={{marginLeft:6,color:TEAL}}>▶ {Math.floor((resume.time||0)/60)}m</span>}{resume?.page&&!resume?.time&&<span style={{marginLeft:6,color:TEAL}}>p.{resume.page}</span>}</p></div>
              <span style={{fontSize:11,color:TEAL,fontWeight:700,flexShrink:0}}>👁 View</span>
            </button>);
          })}
        </div>
      </div>
      {viewing&&<InClassMaterialViewer material={viewing} onClose={()=>setViewing(null)}/>}
    </div>
  );
};

/* ══ RECORDING CONTROLLER (teacher) ══ */
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
      if(!audio){try{audio=await navigator.mediaDevices.getUserMedia({audio:true,video:false});}catch(gumErr:any){toast({title:"Microphone access denied",description:gumErr?.message||"Check browser permissions",variant:"destructive"});return;}}
      chunksRef.current=[];
      const mimeType=["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg"].find(t=>{try{return MediaRecorder.isTypeSupported(t);}catch{return false;}})||"";
      const mr=new MediaRecorder(audio,mimeType?{mimeType}:undefined);
      mr.ondataavailable=e=>{if(e.data.size>0)chunksRef.current.push(e.data);};
      mr.start(1000);mrRef.current=mr;setRecording(true);setPaused(false);setTime(0);
      timerRef.current=setInterval(()=>setTime(t=>t+1),1000);
      if(sessionId)await supabase.from("live_sessions").update({is_recording:true}as any).eq("id",sessionId);
    }catch(err:any){toast({title:"Recording failed to start",description:err?.message||"Unknown error",variant:"destructive"});setRecording(false);}
  };
  const stopRec=async()=>{
    const mr=mrRef.current;if(!mr||mr.state==="inactive")return;
    clearInterval(timerRef.current);const finalTime=time;
    onSavingChange?.(true);setRecording(false);setPaused(false);
    if(sessionId)supabase.from("live_sessions").update({is_recording:false}as any).eq("id",sessionId).then(()=>{}).catch(()=>{});
    mr.onstop=async()=>{
      try{
        const recMime=mr.mimeType||"audio/webm";const recExt=recMime.includes("mp4")?"mp4":recMime.includes("ogg")?"ogg":"webm";
        const blob=new Blob(chunksRef.current,{type:recMime});
        if(blob.size===0){toast({title:"Recording empty",description:"No audio was captured.",variant:"destructive"});return;}
        const recPath=`sessions/${sessionId||subjectId}/${Date.now()}.${recExt}`;
        const{error:upErr}=await storageSupabase.storage.from("recordings").upload(recPath,blob,{cacheControl:"3600",upsert:false,contentType:recMime});
        if(upErr)throw new Error(upErr.message);
        await supabase.from("session_recordings").insert({session_id:sessionId||null,subject_id:subjectId,file_url:recPath,teacher_name:userEmail,duration_seconds:finalTime}as any);
        toast({title:t("Recording saved ✅","تم حفظ التسجيل ✅")});
      }catch(e:any){toast({title:"Recording save failed",description:e?.message||"Unknown error",variant:"destructive"});}
      finally{acRef.current?.close();acRef.current=null;chunksRef.current=[];onSavingChange?.(false);}
    };
    mr.stop();mrRef.current=null;
  };
  const togglePause=()=>{const mr=mrRef.current;if(!mr)return;if(paused){mr.resume();timerRef.current=setInterval(()=>setTime(t=>t+1),1000);setPaused(false);}else{mr.pause();clearInterval(timerRef.current);setPaused(true);}};
  useEffect(()=>{if(stopRecRef)stopRecRef.current=stopRec;},[stopRec,stopRecRef]);
  const fmt=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  return(
    <div className="flex items-center gap-1.5">
      {recording && (
        <Badge variant="destructive" className="gap-1 animate-pulse">
          <Circle className="h-2 w-2 fill-destructive-foreground" />
          REC {fmt(time)}
          {paused && <span className="ms-1 text-[10px]">(PAUSED)</span>}
        </Badge>
      )}
      {!recording && (
        <Button size="sm" onClick={startRec} className="gap-1.5 text-xs shrink-0 rounded-full font-semibold" style={{background:"#ef4444",color:"#fff",border:"none",minWidth:"76px"}}>
          <Circle className="h-2.5 w-2.5 fill-white text-white"/> Record
        </Button>
      )}
      {recording && (<>
        {paused
          ? <Button size="sm" variant="outline" onClick={togglePause} className="gap-1 text-xs"><Play className="h-3 w-3"/>Resume</Button>
          : <Button size="sm" variant="outline" onClick={togglePause} className="gap-1 text-xs"><Pause className="h-3 w-3"/>Pause</Button>
        }
        <Button size="sm" variant="destructive" onClick={stopRec} className="gap-1 text-xs">Stop</Button>
      </>)}
    </div>
  );
};

/* ══ ROOM → CONTEXT BRIDGE ══ */
const RoomToContextBridge = () => {
  const room = useRoomContext();
  const { setMicEnabled, setCamEnabled, toggleMicFnRef, toggleCamFnRef } = useLiveClass();
  useEffect(() => {
    toggleMicFnRef.current = async () => {
      try { const next = !room.localParticipant.isMicrophoneEnabled; await room.localParticipant.setMicrophoneEnabled(next); setMicEnabled(next); } catch {}
    };
    toggleCamFnRef.current = async () => {
      try { const next = !room.localParticipant.isCameraEnabled; await room.localParticipant.setCameraEnabled(next); setCamEnabled(next); } catch {}
    };
  });
  useEffect(() => {
    const sync = () => { setMicEnabled(room.localParticipant.isMicrophoneEnabled); setCamEnabled(room.localParticipant.isCameraEnabled); };
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

/* ══ MAIN ══ */
const ClassroomView=({subject,onLeave,onMinimize,autoJoin=false}:ClassroomViewProps)=>{
  const{user,hasRole}=useAuth();const{t}=useLanguage();const isMobile=useIsMobile();
  const isPrivileged=hasRole("admin")||hasRole("teacher");
  const[phase,setPhase]=useState<"lobby"|"live"|"ended">("lobby");
  const[token,setToken]=useState<string|null>(null);const[wsUrl,setWsUrl]=useState<string|null>(null);
  const[error,setError]=useState<string|null>(null);const[loading,setLoading]=useState(false);
  const[reconnecting,setReconnecting]=useState(false);
  const[roomKey,setRoomKey]=useState(0);
  const[autoReconnectCount,setAutoReconnectCount]=useState(0);
  const intentionalLeaveRef=useRef(false);
  const participantCountRef=useRef(0);
  const[lobbyMic,setLobbyMic]=useState(false);
  const[lobbyCam,setLobbyCam]=useState(false);
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
  useEffect(()=>{ const onPageHide=()=>{recStopRef.current?.();}; window.addEventListener("pagehide",onPageHide); return()=>window.removeEventListener("pagehide",onPageHide); },[]);
  const[chatOpen,setChatOpen]=useState(false);const[partOpen,setPartOpen]=useState(false);const[chatUnread,setChatUnread]=useState(0);
  useEffect(()=>{
    if(!sessionId||phase!=="live")return;
    const ch=supabase.channel(`chat-unread-${sessionId}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"class_chat_messages",filter:`session_id=eq.${sessionId}`},(payload:any)=>{
      if(payload.new?.sender_id===user?.id)return;if(payload.new?.type==="system")return;
      setChatUnread(n=>{const panelClosed=!chatOpen;return panelClosed?n+1:0;});
    }).subscribe();
    return()=>{supabase.removeChannel(ch);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[sessionId,phase,user?.id]);
  const[sideTab,setSideTab]=useState<"chat"|"polls">("chat");
  const[showEnd,setShowEnd]=useState(false);
  const[quizOpen,setQuizOpen]=useState(false);
  const[wbOpen,setWbOpen]=useState(false);const[matOpen,setMatOpen]=useState<any>(null);const[matPicker,setMatPicker]=useState(false);const[matPanelOpen,setMatPanelOpen]=useState(false);
  const[groupRecite,setGroupRecite]=useState(false);const[canStudentWrite,setCanStudentWrite]=useState(false);const[canStudentRec,setCanStudentRec]=useState(false);
  const[floatingEmojis,setFloatingEmojis]=useState<FloatingEmoji[]>([]);
  const[raisedHands,setRaisedHands]=useState<RaisedHand[]>([]);
  const[groupReciteDialog,setGroupReciteDialog]=useState(false);
  const emojiIdRef=useRef(0);
  const wbBuffer=useRef<any[]|null>(null);
  const roomRef=useRef<any>(null);
  const sessionEndChannelRef=useRef<any>(null);
  const prefetch=useRef<{token:string;url:string;fetchedAt:number}|null>(null);
  useEffect(()=>{supabase.functions.invoke("livekit-token",{body:{subject_id:subject.id,action:isPrivileged?"start_session":"join"}}).then(({data})=>{if(data?.token&&data?.url)prefetch.current={token:data.token,url:data.url,fetchedAt:Date.now()};}).catch(()=>{});},[subject.id,isPrivileged]);
  useEffect(()=>{
    if(!autoJoin)return;
    const t=setTimeout(()=>{if(phase==="lobby"&&!loading&&!error){connect(isPrivileged?"start_session":"join");}},120);
    return()=>clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[autoJoin]);
  useEffect(()=>{const check=async()=>{const{data}=await supabase.from("live_sessions").select("*").eq("subject_id",subject.id).eq("status","live").maybeSingle();if(data){setSessionInfo(data);setSessionId(data.id);setIsSessionLive(true);}else setIsSessionLive(false);};check();const iv=setInterval(check,4000);return()=>clearInterval(iv);},[subject.id]);
  useEffect(()=>{
    if(!sessionId||isPrivileged||phase!=="live")return;
    if(sessionEndChannelRef.current)return;
    const ch=supabase.channel(`session-end-${sessionId}`).on("postgres_changes",{event:"UPDATE",schema:"public",table:"live_sessions",filter:`id=eq.${sessionId}`},(payload:any)=>{if(payload.new?.status==="ended"&&!intentionalLeaveRef.current)setPhase("ended");}).subscribe();
    sessionEndChannelRef.current=ch;
    return()=>{if(sessionEndChannelRef.current){supabase.removeChannel(sessionEndChannelRef.current);sessionEndChannelRef.current=null;}};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[sessionId,isPrivileged,phase]);
  useEffect(()=>{if(phase!=="live")return;const ti=setInterval(()=>setDuration(d=>d+1),1000);return()=>clearInterval(ti);},[phase]);
  useEffect(()=>{
    if(phase!=="live"||!("mediaSession"in navigator))return;
    try{(navigator as any).mediaSession.metadata=new(window as any).MediaMetadata({title:subject.title,artist:"Tahleem Academy — Live Class",album:"In Progress"});(navigator as any).mediaSession.playbackState="playing";(navigator as any).mediaSession.setActionHandler("stop",()=>leaveSession());(navigator as any).mediaSession.setActionHandler("pause",()=>leaveSession());}catch{}
    return()=>{try{(navigator as any).mediaSession.playbackState="none";}catch{}};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[phase,subject.title]);

  const connect=async(action:string,settings?:any,mediaSettings?:{micOn:boolean;cameraOn:boolean})=>{
    if(mediaSettings){setLobbyMic(mediaSettings.micOn);setLobbyCam(mediaSettings.cameraOn);}
    if(!user){setError("Session expired. Please refresh the page.");return;}
    setLoading(true);setError(null);
    try{
      const isFresh=prefetch.current&&(Date.now()-prefetch.current.fetchedAt)<5*60_000;
      let tk=isFresh?prefetch.current!.token:null;let url=isFresh?prefetch.current!.url:null;
      prefetch.current=null;
      if(!tk||!url){const{data,error:e}=await supabase.functions.invoke("livekit-token",{body:{subject_id:subject.id,action}});if(e)throw e;if(data?.error)throw new Error(data.error);tk=data.token;url=data.url;}
      setToken(tk!);setWsUrl(url!);
      const{data:sessions}=await supabase.from("live_sessions").select("*").eq("subject_id",subject.id).in("status",["live","active","scheduled"]).order("scheduled_at",{ascending:false,nullsFirst:false}).limit(1);
      if(sessions?.length){
        const freshSessionId=sessions[0].id;
        if(settings){await supabase.from("live_sessions").update({...settings,actual_start_time:new Date().toISOString(),status:"live"}).eq("id",freshSessionId);}
        setSessionId(freshSessionId);setSessionInfo(sessions[0]);
        const{data:att}=await supabase.from("attendance_logs").insert({session_id:freshSessionId,user_id:user.id,device_info:navigator.userAgent}).select("id").single();
        if(att)setAttendanceId(att.id);
        await supabase.from("class_participants").upsert({session_id:freshSessionId,student_id:user.id,joined_at:new Date().toISOString(),is_muted:!isPrivileged,camera_on:true,left_at:null,left_minutes:null},{onConflict:"session_id,student_id"});
        if(!isPrivileged&&!sessionEndChannelRef.current){
          const endCh=supabase.channel(`session-end-${freshSessionId}`).on("postgres_changes",{event:"UPDATE",schema:"public",table:"live_sessions",filter:`id=eq.${freshSessionId}`},(payload:any)=>{if(payload.new?.status==="ended"&&!intentionalLeaveRef.current)setPhase("ended");}).subscribe();
          sessionEndChannelRef.current=endCh;
        }
      }
      setPhase("live");
      try { playJoinSound(); } catch {}
    }catch(e:any){setError(e?.message||"Failed to connect");}finally{setLoading(false);}
  };

  const autoReconnect=useCallback(async()=>{
    if(intentionalLeaveRef.current)return;
    if(autoReconnectCount>=5){setReconnecting(false);setError("Connection lost after several attempts. Please try again.");setPhase("lobby");return;}
    setReconnecting(true);
    const backoffMs=Math.min(1000*Math.pow(2,autoReconnectCount),15000);
    await new Promise(r=>setTimeout(r,backoffMs));
    try{
      const{data}=await supabase.functions.invoke("livekit-token",{body:{subject_id:subject.id,action:isPrivileged?"start_session":"join"}});
      if(data?.token&&data?.url){prefetch.current={token:data.token,url:data.url,fetchedAt:Date.now()};setToken(data.token);setWsUrl(data.url);setRoomKey(k=>k+1);setAutoReconnectCount(c=>c+1);}
    }catch{setError("Reconnection failed. Please try again.");setPhase("lobby");}
    finally{setReconnecting(false);}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[subject.id,isPrivileged,autoReconnectCount]);

  useEffect(()=>()=>{
    if(attendanceId){const d=Math.floor((Date.now()-joinedAt)/1000);supabase.from("attendance_logs").update({left_at:new Date().toISOString(),duration_seconds:d}).eq("id",attendanceId);}
    if(sessionId&&user)supabase.from("class_participants").update({left_at:new Date().toISOString(),duration_minutes:Math.floor((Date.now()-joinedAt)/60000)}).eq("session_id",sessionId).eq("student_id",user.id);
  },[attendanceId,joinedAt,sessionId,user]);

  const endSession=async()=>{
    intentionalLeaveRef.current=true;setShowEnd(false);
    await recStopRef.current?.();
    try{
      if(sessionId){
        await supabase.from("live_sessions").update({status:"ended",ended_at:new Date().toISOString(),actual_end_time:new Date().toISOString()}).eq("id",sessionId);
        if(user)await supabase.from("class_chat_messages").insert({session_id:sessionId,sender_id:user.id,message:t("Class has ended","انتهت الحصة"),type:"system"});
        try{
          const room=roomRef.current;
          if(room?.localParticipant){room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({type:"class_ended"})),{reliable:true});await new Promise(r=>setTimeout(r,400));room.disconnect();}
        }catch(err){console.warn("[endSession] LiveKit broadcast failed:",err);}
        setTimeout(async()=>{try{await supabase.from("class_chat_messages").delete().eq("session_id",sessionId);}catch(e){console.warn("[endSession] chat clear failed:",e);}},4000);
      }
    }catch(e:any){console.error("[endSession] DB error (continuing anyway):",e?.message);}
    finally{setPhase("ended");}
  };

  const leaveSession=async()=>{
    intentionalLeaveRef.current=true;
    await recStopRef.current?.();
    try{playLeaveSound();}catch{}
    if(attendanceId){const d=Math.floor((Date.now()-joinedAt)/1000);supabase.from("attendance_logs").update({left_at:new Date().toISOString(),duration_seconds:d}).eq("id",attendanceId);}
    if(sessionId&&user)supabase.from("class_participants").update({left_at:new Date().toISOString(),duration_minutes:Math.floor((Date.now()-joinedAt)/60000)}).eq("session_id",sessionId).eq("student_id",user.id);
    onLeave();
  };

  const addFloatingEmoji=(emoji:string,sender:string="")=>{
    const id=++emojiIdRef.current;const x=5+Math.random()*70;
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
    const n=!groupRecite;setGroupRecite(n);
    toast({title:n?"🎙️ Group Recitation ON — all mics enabled":"🔇 Group Recitation ended"});
    try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"group_recite",active:n})),{reliable:true});}catch{}
    if(sessionId&&user)await supabase.from("class_chat_messages").insert({session_id:sessionId,sender_id:user.id,message:n?"🎙️ Group Recitation Mode — all mics ON":"🔇 Recitation ended",type:"system"});
  };
  const handleGroupReciteFromTeacher=(active:boolean)=>{
    setGroupRecite(active);
    if(active&&!isPrivileged){setGroupReciteDialog(true);}
    else if(!active&&!isPrivileged){setGroupReciteDialog(false);}
  };
  const fmtT=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  if(phase==="ended") return <ClassEndScreen subject={subject} session={sessionInfo} duration={duration} participantCount={participantCountRef.current} onGoToDashboard={onLeave} onGoToRevision={()=>{window.location.href=`/student/revision/${subject.id}`;}} />;
  if(phase==="lobby"&&!loading&&!error&&!autoJoin) return <ClassLobby subject={subject} session={sessionInfo} onStartClass={(s:any,media?:any)=>connect("start_session",s,media)} onJoinClass={(media?:any)=>connect("join",undefined,media)} onBack={onLeave} isLive={isSessionLive}/>;
  if(loading) return(<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",background:DARK}}><style>{CSS}</style><div style={{textAlign:"center"}}><div style={{width:52,height:52,border:`3px solid ${TEAL}`,borderTopColor:"transparent",borderRadius:"50%",animation:"cv-spin .8s linear infinite",margin:"0 auto 16px"}}/><p style={{color:"rgba(255,255,255,.5)",fontSize:14}}>{t("Connecting…","جاري الاتصال…")}</p></div></div>);
  if(error) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",background:DARK}}>
      <style>{CSS}</style>
      <div style={{textAlign:"center",maxWidth:320,padding:28}}>
        <div style={{width:64,height:64,borderRadius:"50%",background:"rgba(239,68,68,.12)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}><X style={{width:28,height:28,color:RED}}/></div>
        <h2 style={{fontSize:20,fontWeight:700,color:"#fff",marginBottom:8}}>Connection Failed</h2>
        <p style={{color:"rgba(255,255,255,.45)",fontSize:14,marginBottom:22}}>{error}</p>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={()=>{intentionalLeaveRef.current=false;setAutoReconnectCount(0);setError(null);setToken(null);setWsUrl(null);connect(isPrivileged?"start_session":"join");}} style={{padding:"10px 22px",borderRadius:10,background:TEAL,border:"none",color:"#fff",fontSize:14,cursor:"pointer",fontWeight:600}}>Try Again</button>
          <button onClick={onLeave} style={{padding:"10px 22px",borderRadius:10,background:GLASSB,border:"1px solid rgba(255,255,255,.12)",color:"#fff",fontSize:14,cursor:"pointer"}}>Go Back</button>
        </div>
      </div>
    </div>
  );

  /* ── LIVE ── */
  return (
    <div data-classroom-root className="h-screen flex flex-col overflow-hidden" style={{ background: "#111" }}>
      <style>{CSS}</style>
      {token && wsUrl && (
        <LiveKitRoom
          key={roomKey}
          serverUrl={wsUrl}
          token={token}
          connect={phase === "live"}
          audio={false}
          video={false}
          options={{
            adaptiveStream: { pixelDensity: "screen" },
            dynacast: true,
            disconnectOnPageLeave: false,
            audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 1 },
            publishDefaults: { audioPreset: { maxBitrate: 32000 }, dtx: true, red: false, stopMicTrackOnMute: false, videoEncoding: { maxBitrate: 700_000, maxFramerate: 20 }, backupCodec: true },
            videoCaptureDefaults: { resolution: { width: 640, height: 480, frameRate: 20 }, facingMode: "user" },
          }}
          style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}
          data-lk-theme="default"
        >
          <RoomAudioRenderer />
          <RoomToContextBridge />
          <MediaAutoPublish lobbyMic={lobbyMic} lobbyCam={lobbyCam} />
          <WbSyncBridge wbOpen={wbOpen} isTeacher={isPrivileged} />
          <AdminMuteListener isPrivileged={isPrivileged} />
          <GroupReciteAutoMic active={groupRecite} isPrivileged={isPrivileged} />
          <ReconnectMonitor
            onReconnecting={() => setReconnecting(true)}
            onReconnected={() => { setReconnecting(false); setAutoReconnectCount(0); }}
            onDisconnected={autoReconnect}
          />
          <RoomDataListener
            onWbOpen={() => setWbOpen(true)}
            onWbClose={() => setWbOpen(false)}
            strokesBuffer={wbBuffer}
            onMatOpen={(mat: any) => setMatOpen(mat)}
            onMatClose={() => setMatOpen(null)}
            onWbAllowWrite={(allow: boolean) => setCanStudentWrite(allow)}
            onRecAllowed={(allow: boolean) => setCanStudentRec(allow)}
            onEmojiReact={(emoji: string, sender: string) => addFloatingEmoji(emoji, sender)}
            onGroupRecite={handleGroupReciteFromTeacher}
            onHandRaise={handleHandRaise}
            onAdminMuteAll={() => {}}
            onClassEnded={!isPrivileged ? () => setPhase("ended") : undefined}
            roomRef={roomRef}
          />

          {/* Reconnecting overlay */}
          {reconnecting && (
            <div style={{ position: "absolute", inset: 0, zIndex: 200, background: "rgba(0,0,0,.82)", backdropFilter: "blur(8px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
              <div style={{ width: 48, height: 48, border: `3px solid ${TEAL}`, borderTopColor: "transparent", borderRadius: "50%", animation: "cv-spin .8s linear infinite" }} />
              <p style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>Reconnecting…</p>
              <p style={{ color: "rgba(255,255,255,.4)", fontSize: 13 }}>Please stay on the page</p>
            </div>
          )}

          {/* ── Top bar ── */}
          <div className="h-11 shrink-0 bg-background/95 backdrop-blur border-b flex items-center justify-between px-3 z-10">
            <div className="flex items-center gap-2 min-w-0">
              {isPrivileged ? (
                <Badge variant="destructive" className="gap-1 shrink-0 animate-pulse">
                  <Radio className="h-3 w-3" /> LIVE
                </Badge>
              ) : (
                <Badge variant="outline" className="shrink-0">Student</Badge>
              )}
              <Badge variant="outline" className="gap-1 shrink-0">
                <Circle className="h-2 w-2 fill-primary text-primary" />
                <span className="truncate max-w-[140px]">{subject.title}</span>
              </Badge>
              {subject.title_ar && (
                <span className="text-xs text-muted-foreground truncate hidden sm:block" style={{ fontFamily: "'Amiri', serif" }}>
                  {subject.title_ar}
                </span>
              )}
              <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                <Circle className="h-1.5 w-1.5 fill-destructive text-destructive animate-pulse" />
                {fmtT(duration)}
              </Badge>
              {isPrivileged && raisedHands.length > 0 && (
                <Badge variant="outline" className="gap-1 shrink-0 border-yellow-500/40 text-yellow-400">
                  <span className="text-xs" style={{ animation: "hand-bounce 1.2s ease-in-out infinite" }}>✋</span>
                  {raisedHands.length}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <ConnectionIndicator />
              {isPrivileged && (
                <RecController
                  sessionId={sessionId}
                  subjectId={subject.id}
                  userEmail={user?.email || ""}
                  onSavingChange={setSavingRec}
                  stopRecRef={recStopRef}
                />
              )}
              {!isPrivileged && canStudentWrite && (
                <Badge
                  variant="outline"
                  className="gap-1 shrink-0 border-emerald-500/40 text-emerald-400 cursor-pointer hidden sm:flex"
                  onClick={() => setWbOpen(v => !v)}
                >
                  <PenTool className="h-3 w-3" /> Board
                </Badge>
              )}
            </div>
          </div>

          {/* ── Main content area ── */}
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Participants panel (desktop left) */}
            {partOpen && !isMobile && sessionId && (
              <div className="w-56 bg-background border-e flex flex-col shrink-0">
                <ClassParticipants
                  sessionId={sessionId}
                  onMuteStudent={isPrivileged ? (studentId: string) => {
                    supabase.from("class_participants").update({ is_muted: true }).eq("session_id", sessionId).eq("student_id", studentId);
                  } : undefined}
                  onRemoveStudent={isPrivileged ? (studentId: string) => {
                    supabase.from("class_participants").update({ left_at: new Date().toISOString() }).eq("session_id", sessionId).eq("student_id", studentId);
                  } : undefined}
                />
              </div>
            )}

            {/* Video area */}
            <div className="flex-1 relative min-w-0">
              <VideoConference />
              <FloatingEmojiLayer emojis={floatingEmojis} />
              <RaisedHandsOverlay hands={raisedHands} />
              {matPanelOpen && <SubjectMaterialsPanel subjectId={subject.id} subject={subject} onClose={() => setMatPanelOpen(false)} />}
              {matOpen && <MatViewerInlineBridge material={matOpen} isPrivileged={isPrivileged} onClose={() => setMatOpen(null)} />}
            </div>

            {/* Right panel: Chat / Polls (desktop) */}
            {chatOpen && !isMobile && sessionId && (
              <div className="w-72 bg-background border-s flex flex-col shrink-0">
                <div className="flex border-b">
                  <button
                    className={`flex-1 py-2 text-xs font-medium transition-colors ${sideTab === "chat" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
                    onClick={() => { setSideTab("chat"); setChatUnread(0); }}
                  >
                    💬 Chat
                  </button>
                  <button
                    className={`flex-1 py-2 text-xs font-medium transition-colors ${sideTab === "polls" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
                    onClick={() => setSideTab("polls")}
                  >
                    📊 Polls
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  {sideTab === "chat"
                    ? <ClassChatPanel sessionId={sessionId} sessionStartedAt={sessionInfo?.started_at ?? sessionInfo?.actual_start_time} />
                    : <ClassPolls sessionId={sessionId} />
                  }
                </div>
              </div>
            )}
          </div>

          {/* ── Bottom control bar ── */}
          {sessionId ? (
            <ClassControls
              sessionId={sessionId}
              onToggleChat={() => { setChatOpen(v => !v); if (!chatOpen) setChatUnread(0); }}
              onToggleParticipants={() => setPartOpen(v => !v)}
              onEndClass={() => setShowEnd(true)}
              onLeaveClass={leaveSession}
              chatUnread={chatUnread}
              onLaunchPoll={() => { setChatOpen(true); setSideTab("polls"); }}
              onLaunchQuiz={() => setQuizOpen(true)}
            />
          ) : (
            <div className="shrink-0 border-t" style={{ height: "1px" }} />
          )}

          {/* Whiteboard */}
          {wbOpen && (
            <WhiteboardBridge
              onClose={() => setWbOpen(false)}
              isTeacher={isPrivileged}
              initialStrokes={wbBuffer.current}
              subjectId={subject.id}
              canStudentWrite={canStudentWrite}
            />
          )}

          {/* Group recite dialog */}
          {groupReciteDialog && !isPrivileged && (
            <GroupRecitePermDialog
              onAccept={() => setGroupReciteDialog(false)}
              onDecline={() => { setGroupReciteDialog(false); setGroupRecite(false); }}
            />
          )}

          {/* Live Quiz Overlay */}
          <LiveQuizOverlay sessionId={sessionId || ""} isOpen={quizOpen} onClose={() => setQuizOpen(false)} />
        </LiveKitRoom>
      )}

      {/* Material picker (outside LiveKitRoom to access room context via bridge) */}
      {matPicker && <MatPickerBridge subjectId={subject.id} onShare={(mat: any, room: any) => { setMatOpen(mat); setMatPicker(false); try { room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({ type: "mat_open", material: mat })), { reliable: true }); } catch {} }} onClose={() => setMatPicker(false)} />}

      {/* Mobile: participants bottom sheet */}
      {isMobile && partOpen && sessionId && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setPartOpen(false)}>
          <div className="absolute bottom-16 left-0 right-0 bg-background rounded-t-xl max-h-[60vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mt-2 mb-1" />
            <ClassParticipants sessionId={sessionId} />
          </div>
        </div>
      )}

      {/* Mobile: chat/polls bottom sheet */}
      {isMobile && chatOpen && sessionId && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setChatOpen(false)}>
          <div className="absolute bottom-16 left-0 right-0 bg-background rounded-t-xl max-h-[60vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mt-2 mb-1" />
            <div className="flex border-b">
              <button
                className={`flex-1 py-2 text-xs font-medium ${sideTab === "chat" ? "border-b-2 border-primary" : "text-muted-foreground"}`}
                onClick={() => setSideTab("chat")}
              >
                💬 Chat
              </button>
              <button
                className={`flex-1 py-2 text-xs font-medium ${sideTab === "polls" ? "border-b-2 border-primary" : "text-muted-foreground"}`}
                onClick={() => setSideTab("polls")}
              >
                📊 Polls
              </button>
            </div>
            <div className="flex-1 overflow-hidden min-h-[300px]">
              {sideTab === "chat"
                ? <ClassChatPanel sessionId={sessionId} sessionStartedAt={sessionInfo?.started_at ?? sessionInfo?.actual_start_time} />
                : <ClassPolls sessionId={sessionId} />
              }
            </div>
          </div>
        </div>
      )}

      {/* End class confirmation */}
      {showEnd && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.72)", backdropFilter: "blur(6px)" }} onClick={() => setShowEnd(false)}>
          <div style={{ background: "#0c2518", borderRadius: 20, padding: "28px 28px 24px", width: "100%", maxWidth: 380, margin: "0 16px", boxShadow: "0 24px 64px rgba(0,0,0,.7)", border: "1px solid rgba(255,255,255,.1)", animation: "fade-in .18s ease" }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(239,68,68,.15)", border: "1.5px solid rgba(239,68,68,.35)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Phone style={{ width: 22, height: 22, color: "#ef4444", transform: "rotate(135deg)" }} />
            </div>
            <h2 style={{ textAlign: "center", fontSize: 17, fontWeight: 800, color: "#fff", marginBottom: 8 }}>{t("End class for everyone?", "إنهاء الحصة للجميع؟")}</h2>
            <p style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,.45)", marginBottom: 24 }}>{t("This will disconnect all participants.", "سيتم قطع الاتصال عن جميع المشاركين.")}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={endSession} style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#dc2626,#ef4444)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 16px rgba(239,68,68,.45)" }}>{t("End for All", "إنهاء للجميع")}</button>
              <button onClick={() => { setShowEnd(false); leaveSession(); }} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.7)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{t("Leave but Keep Open", "غادر لكن أبقِ الحصة")}</button>
              <button onClick={() => setShowEnd(false)} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,.08)", background: "transparent", color: "rgba(255,255,255,.4)", fontSize: 13, cursor: "pointer" }}>{t("Cancel", "إلغاء")}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const MatPickerBridge=({subjectId,onShare,onClose}:any)=>{const room=useRoomContext();return<MaterialPicker subjectId={subjectId} onShare={(mat:any)=>onShare(mat,room)} onClose={onClose}/>;};
const MatViewerInlineBridge=({material,isPrivileged,onClose}:any)=>{
  const room=useRoomContext();
  return<InClassMaterialViewer material={material} isTeacher={isPrivileged} onClose={()=>{
    onClose();
    if(isPrivileged){try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"mat_close"})),{reliable:true});}catch{}}
  }}/>;
};

export default ClassroomView;
