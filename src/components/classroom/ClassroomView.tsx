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
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Mic, MicOff, Video, VideoOff, Phone, Hand,
  PenTool, MessageCircle, MoreVertical, BookOpen,
  Circle, Loader2, X, Smile, Play, Pause,
  Volume2, ChevronDown, Users,
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

const TEAL  = "#0a7c68";
const TEAL2 = "#064E3B";
const DARK  = "#0f1117";
const GLASS = "rgba(15,17,23,0.88)";
const GLASSB= "rgba(255,255,255,0.08)";
const GREEN = "#22c55e";
const RED   = "#ef4444";
const BAR_H = 76;

const CSS = `
  @keyframes cv-spin  { to { transform:rotate(360deg); } }
  @keyframes wb-spin  { to { transform:rotate(360deg); } }
  @keyframes speaking { 0%,100%{opacity:1}50%{opacity:.35} }
  @keyframes pip-pulse{ 0%,100%{opacity:1}50%{opacity:.3} }
  @keyframes slide-up { from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1} }
  @keyframes fade-in  { from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)} }
  [data-lk-theme]{ height:100%!important;display:flex!important;flex-direction:column!important; }
  [data-classroom-root]{
    overscroll-behavior:none;-webkit-overflow-scrolling:touch;
    touch-action:pan-y;padding-bottom:env(safe-area-inset-bottom,0px);
  }
  [data-classroom-root] button{-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
  [data-classroom-root] canvas{-webkit-user-select:none;user-select:none;}
  @supports not (height:100dvh){[data-classroom-root]{height:-webkit-fill-available!important;}}
`;

/* ══ RECONNECT MONITOR ══ */
const ReconnectMonitor = ({ onReconnecting, onReconnected }: { onReconnecting:()=>void;onReconnected:()=>void }) => {
  const room = useRoomContext();
  useEffect(() => {
    room.on(RoomEvent.Reconnecting, onReconnecting);
    room.on(RoomEvent.Reconnected,  onReconnected);
    const onVis = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        if (room.state === ConnectionState.Connected) {
          const lp = room.localParticipant;
          if (lp.isMicrophoneEnabled) {
            await lp.setMicrophoneEnabled(false);
            await new Promise(r => setTimeout(r,150));
            await lp.setMicrophoneEnabled(true);
          }
          onReconnected();
        }
      } catch {}
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      room.off(RoomEvent.Reconnecting, onReconnecting);
      room.off(RoomEvent.Reconnected,  onReconnected);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [room, onReconnecting, onReconnected]);
  return null;
};

/* ══ ROOM DATA LISTENER ══ */
const RoomDataListener = ({ onWbOpen,onWbClose,strokesBuffer,onMatOpen,onMatClose,onWbAllowWrite,onRecAllowed }:any) => {
  const room = useRoomContext();
  useEffect(() => {
    const h = (payload:Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if(msg.type==="wb_open")        onWbOpen();
        if(msg.type==="wb_close")       onWbClose();
        if(msg.type==="wb_strokes")     strokesBuffer.current=msg.strokes;
        if(msg.type==="wb_clear")       strokesBuffer.current=[];
        if(msg.type==="mat_open")       onMatOpen?.(msg.material);
        if(msg.type==="mat_close")      onMatClose?.();
        if(msg.type==="wb_allow_write") onWbAllowWrite?.(msg.allow);
        if(msg.type==="rec_allowed")    onRecAllowed?.(msg.allow);
      } catch {}
    };
    room.on(RoomEvent.DataReceived,h);
    return ()=>{ room.off(RoomEvent.DataReceived,h); };
  },[room]);
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
const MaterialViewer=({material,isTeacher,onClose}:any)=>{
  const url=material.file_url||material.url||"";const title=material.title||material.name||"Material";
  const isYT=url.includes("youtube.com")||url.includes("youtu.be");
  const isPdf=url.toLowerCase().includes(".pdf")||(material.material_type||"").includes("pdf");
  const isImg=/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);const isVid=/\.(mp4|webm|ogg|mov)$/i.test(url);
  const ytId=(u:string)=>{const m=u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/);return m?m[1]:"";};
  return createPortal(<div style={{position:"fixed",inset:0,zIndex:9998,background:"#000",display:"flex",flexDirection:"column"}}>
    <div style={{height:52,background:`rgba(6,78,59,.97)`,display:"flex",alignItems:"center",padding:"0 14px",gap:10}}>
      <BookOpen style={{width:18,height:18,color:"#fff"}}/><span style={{color:"#fff",fontWeight:700,fontSize:15,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</span>
      {!isTeacher&&<span style={{fontSize:11,color:"rgba(255,255,255,.4)"}}>Shared by teacher</span>}
      <button onClick={onClose} style={{width:34,height:34,borderRadius:8,background:"rgba(255,255,255,.12)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff"}}><X style={{width:15,height:15}}/></button>
    </div>
    <div style={{flex:1,overflow:"hidden"}}>
      {isYT&&<iframe src={`https://www.youtube.com/embed/${ytId(url)}?autoplay=1`} style={{width:"100%",height:"100%",border:"none"}} allow="autoplay;fullscreen" allowFullScreen/>}
      {isPdf&&!isYT&&<iframe src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`} style={{width:"100%",height:"100%",border:"none"}}/>}
      {isImg&&<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}><img src={url} alt={title} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"}}/></div>}
      {isVid&&<video src={url} controls autoPlay playsInline style={{width:"100%",height:"100%",background:"#000"}}/>}
      {!isYT&&!isPdf&&!isImg&&!isVid&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:16}}><BookOpen style={{width:52,height:52,color:"rgba(255,255,255,.25)"}}/><p style={{color:"#fff",fontWeight:700,fontSize:18}}>{title}</p><a href={url} target="_blank" rel="noreferrer" style={{background:TEAL,color:"#fff",padding:"12px 28px",borderRadius:12,textDecoration:"none",fontWeight:700,fontSize:14}}>Open File ↗</a></div>}
    </div>
  </div>,document.body);
};

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

/* ══ RECORDING CONTROLLER ══ */
const RecController=({sessionId,subjectId,userEmail,onSavingChange}:any)=>{
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
    const audio=collectAudio();if(!audio){toast({title:"No audio tracks"});return;}
    chunksRef.current=[];
    const mimeType=["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg"].find(t=>{try{return MediaRecorder.isTypeSupported(t);}catch{return false;}})||"";
    const mr=new MediaRecorder(audio,mimeType?{mimeType}:undefined);
    mr.ondataavailable=e=>{if(e.data.size>0)chunksRef.current.push(e.data);};mr.start(1000);mrRef.current=mr;setRecording(true);setPaused(false);setTime(0);
    timerRef.current=setInterval(()=>setTime(t=>t+1),1000);
    if(sessionId)await supabase.from("live_sessions").update({is_recording:true}as any).eq("id",sessionId);
  };
  const stopRec=async()=>{
    clearInterval(timerRef.current);const mr=mrRef.current;if(!mr)return;onSavingChange?.(true);mr.stop();
    mr.onstop=async()=>{try{
      const recMime=mr.mimeType||"audio/webm";const recExt=recMime.includes("mp4")?"mp4":recMime.includes("ogg")?"ogg":"webm";
      const blob=new Blob(chunksRef.current,{type:recMime});
      const path=`recordings/${sessionId||subjectId}/${Date.now()}.${recExt}`;
      const{error:upErr}=await supabase.storage.from("subject-files").upload(path,blob);
      if(upErr)throw upErr;
      if(sessionId)await supabase.from("live_sessions").update({is_recording:false}as any).eq("id",sessionId);
      await supabase.from("session_recordings").insert({session_id:sessionId||null,subject_id:subjectId,file_url:path,teacher_name:userEmail,duration_seconds:time}as any);
      toast({title:t("Recording saved ✅","تم حفظ التسجيل ✅")});
    }catch(e:any){toast({title:"Save failed",description:e?.message,variant:"destructive"});}onSavingChange?.(false);};
    acRef.current?.close();setRecording(false);setPaused(false);
    if(sessionId)await supabase.from("live_sessions").update({is_recording:false}as any).eq("id",sessionId);
  };
  const togglePause=()=>{const mr=mrRef.current;if(!mr)return;if(paused){mr.resume();timerRef.current=setInterval(()=>setTime(t=>t+1),1000);setPaused(false);}else{mr.pause();clearInterval(timerRef.current);setPaused(true);}};
  const fmt=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  return(<div style={{display:"flex",alignItems:"center",gap:8}}>
    {recording&&<><span style={{fontSize:12,color:paused?"#fbbf24":RED,fontWeight:700}}>{paused?"⏸":"⏺"} {fmt(time)}</span>
      <button onClick={togglePause} style={{background:GLASSB,border:"none",borderRadius:8,padding:"4px 10px",color:"#fff",fontSize:12,cursor:"pointer"}}>{paused?<Play style={{width:12,height:12}}/>:<Pause style={{width:12,height:12}}/>}</button>
      <button onClick={stopRec} style={{background:"rgba(239,68,68,.25)",border:"none",borderRadius:8,padding:"4px 10px",color:RED,fontSize:12,fontWeight:700,cursor:"pointer"}}>Stop</button></>}
    {!recording&&<button onClick={startRec} style={{display:"flex",alignItems:"center",gap:6,background:"rgba(239,68,68,.14)",border:"1px solid rgba(239,68,68,.35)",borderRadius:20,padding:"5px 14px",color:"#fca5a5",fontSize:12,fontWeight:700,cursor:"pointer"}}><Circle style={{width:7,height:7,fill:RED,color:RED}}/> Record</button>}
  </div>);
};

/* ══ GOOGLE MEET-STYLE PARTICIPANT TILE ══ */
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

/* ══ VIDEO GRID ══ */
const VideoGrid=()=>{
  const{localParticipant}=useLocalParticipant();const allParticipants=useParticipants();
  const remotes=allParticipants.filter(p=>p.identity!==localParticipant?.identity);
  const all=localParticipant?[localParticipant,...remotes]:remotes;const n=all.length;
  const screensharer=all.find(p=>{const pub=p.getTrackPublication?.(Track.Source.ScreenShare)||p.trackPublications?.get(Track.Source.ScreenShare);return pub?.track&&!pub.isMuted;});
  const gap=6;
  if(screensharer)return(<div style={{width:"100%",height:"100%",display:"flex",gap,padding:gap,boxSizing:"border-box"}}>
    <div style={{flex:1,borderRadius:14,overflow:"hidden",minWidth:0}}><ParticipantTile participant={screensharer} isLocal={screensharer.identity===localParticipant?.identity} size="large"/></div>
    <div style={{width:110,display:"flex",flexDirection:"column",gap,overflowY:"auto"}}>{all.map(p=>(<div key={p.identity} style={{height:82,flexShrink:0}}><ParticipantTile participant={p} isLocal={p.identity===localParticipant?.identity} size="small"/></div>))}</div>
  </div>);
  let cols=n<=1?1:n===2?2:n<=4?2:n<=6?3:n<=9?3:4;const rows=Math.ceil(n/cols);
  return(<div style={{width:"100%",height:"100%",display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gridTemplateRows:`repeat(${rows},1fr)`,gap,padding:gap,boxSizing:"border-box"}}>
    {all.map(p=>(<ParticipantTile key={p.identity} participant={p} isLocal={p.identity===localParticipant?.identity} size={n===1?"large":n<=4?"normal":"small"}/>))}
  </div>);
};

/* ══ BOTTOM BAR — Google Meet floating glass style ══ */
const BottomBar=({sessionId,onToggleChat,onToggleParticipants,onEndClass,onLeaveClass,chatUnread,onToggleWhiteboard,whiteboardOpen,onGroupRecite,groupReciteMode,onShareMaterial,isPrivileged,canStudentWriteProp,canStudentRecProp,onPermChange,onMinimize,room,isMobile}:any)=>{
  const{user}=useAuth();
  const[micOn,setMicOn]=useState(()=>room?.localParticipant?.isMicrophoneEnabled??true);
  const[camOn,setCamOn]=useState(()=>room?.localParticipant?.isCameraEnabled??true);
  const[handUp,setHandUp]=useState(false);const[menu,setMenu]=useState(false);const[emojis,setEmojis]=useState(false);
  const[stuRec,setStuRec]=useState(false);const stuMrRef=useRef<MediaRecorder|null>(null);const stuChunks=useRef<Blob[]>([]);
  useEffect(()=>{
    if(!room)return;const sync=()=>{setMicOn(room.localParticipant.isMicrophoneEnabled);setCamOn(room.localParticipant.isCameraEnabled);};
    room.localParticipant.on("trackMuted",sync);room.localParticipant.on("trackUnmuted",sync);room.localParticipant.on("trackPublished",sync);room.localParticipant.on("trackUnpublished",sync);
    return()=>{room.localParticipant.off("trackMuted",sync);room.localParticipant.off("trackUnmuted",sync);room.localParticipant.off("trackPublished",sync);room.localParticipant.off("trackUnpublished",sync);};
  },[room]);
  const toggleMic=async()=>{const n=!micOn;await room?.localParticipant?.setMicrophoneEnabled(n);setMicOn(n);};
  const toggleCam=async()=>{const n=!camOn;await room?.localParticipant?.setCameraEnabled(n);setCamOn(n);};
  const toggleHand=async()=>{if(!user||!sessionId)return;const n=!handUp;setHandUp(n);await supabase.from("class_participants").update({hand_raised:n,hand_raised_at:n?new Date().toISOString():null}).eq("session_id",sessionId).eq("student_id",user.id);};
  const toggleStuRecord=async()=>{
    if(stuRec){stuMrRef.current?.stop();stuMrRef.current!.onstop=()=>{const blobType=stuMrRef.current?.mimeType||"audio/webm";const blob=new Blob(stuChunks.current,{type:blobType});const url=URL.createObjectURL(blob);const a=document.createElement("a");const ext=blobType.includes("mp4")?"mp4":blobType.includes("ogg")?"ogg":"webm";a.href=url;a.download=`class-recording-${Date.now()}.${ext}`;a.click();URL.revokeObjectURL(url);stuChunks.current=[];};setStuRec(false);}
    else{try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});const stuMime=["audio/webm","audio/mp4","audio/ogg"].find(t=>{try{return MediaRecorder.isTypeSupported(t);}catch{return false;}})||"";const mr=new MediaRecorder(stream,stuMime?{mimeType:stuMime}:undefined);stuChunks.current=[];mr.ondataavailable=e=>{if(e.data.size>0)stuChunks.current.push(e.data);};mr.start(1000);stuMrRef.current=mr;setStuRec(true);}catch{toast({title:"Microphone access denied"});}}
  };
  const sendEmoji=(e:string)=>{setEmojis(false);if(user&&sessionId)supabase.from("class_chat_messages").insert({session_id:sessionId,sender_id:user.id,message:e,type:"emoji"});};
  const IS={width:isMobile?16:20,height:isMobile?16:20};
  const Btn=({children,active=false,danger=false,onClick,badge=0,title:ttl=""}:any)=>(
    <div style={{position:"relative",display:"flex",flexDirection:"column",alignItems:"center"}}>
      <button title={ttl} onClick={onClick} style={{width:isMobile?42:52,height:isMobile?42:52,borderRadius:"50%",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:danger?"rgba(239,68,68,.85)":active?"rgba(255,255,255,.18)":"rgba(255,255,255,.09)",color:"#fff",transition:"background .15s,transform .1s",backdropFilter:"blur(4px)",boxShadow:active&&!danger?"inset 0 0 0 2px rgba(255,255,255,.2)":"none"}}
        onMouseEnter={e=>(e.currentTarget.style.transform="scale(1.08)")} onMouseLeave={e=>(e.currentTarget.style.transform="scale(1)")}>{children}</button>
      {badge>0&&<span style={{position:"absolute",top:0,right:0,background:RED,color:"#fff",borderRadius:"50%",width:17,height:17,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,border:`2px solid ${DARK}`}}>{badge}</span>}
    </div>
  );
  return(<>
    {emojis&&<div style={{position:"fixed",bottom:BAR_H+12,left:"50%",transform:"translateX(-50%)",background:"#1e2535",border:"1px solid rgba(255,255,255,.1)",borderRadius:44,padding:"10px 16px",display:"flex",gap:10,zIndex:100,boxShadow:"0 8px 32px rgba(0,0,0,.6)",animation:"slide-up .2s ease"}}>
      {["👏","🤲","❤️","😂","🌟","👍","🙏","🕌"].map(e=>(<button key={e} onClick={()=>sendEmoji(e)} style={{fontSize:28,background:"none",border:"none",cursor:"pointer",padding:"2px 4px",transition:"transform .12s"}} onMouseEnter={ev=>(ev.currentTarget.style.transform="scale(1.28)")} onMouseLeave={ev=>(ev.currentTarget.style.transform="scale(1)")}>{e}</button>))}
    </div>}
    {menu&&<div onClick={()=>setMenu(false)} style={{position:"fixed",bottom:BAR_H+10,right:14,background:"#17202a",border:"1px solid rgba(255,255,255,.08)",borderRadius:18,boxShadow:"0 8px 36px rgba(0,0,0,.65)",minWidth:230,zIndex:100,overflow:"hidden",animation:"slide-up .18s ease"}}>
      {isPrivileged&&[
        {icon:Volume2,label:groupReciteMode?"End Group Recitation":"Group Recitation",color:groupReciteMode?GREEN:"#fff",fn:onGroupRecite},
        {icon:BookOpen,label:"Share Material",color:"#fff",fn:onShareMaterial},
        {icon:PenTool,label:canStudentWriteProp?"Revoke Write Access":"Allow Students to Write",color:canStudentWriteProp?GREEN:"#fff",fn:()=>onPermChange?.("write",!canStudentWriteProp)},
        {icon:Circle,label:canStudentRecProp?"Revoke Record Permission":"Allow Students to Record",color:canStudentRecProp?GREEN:"#fff",fn:()=>onPermChange?.("rec",!canStudentRecProp)},
      ].map((item,i)=>(<button key={i} onClick={item.fn} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"13px 18px",background:"none",border:"none",cursor:"pointer",color:item.color,fontSize:14,borderBottom:"1px solid rgba(255,255,255,.06)",textAlign:"left"as const}}><item.icon style={{width:16,height:16}}/> {item.label}</button>))}
      <button onClick={()=>{setMenu(false);onToggleParticipants();}} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"13px 18px",background:"none",border:"none",cursor:"pointer",color:"#fff",fontSize:14,borderBottom:"1px solid rgba(255,255,255,.06)",textAlign:"left"as const}}><Users style={{width:16,height:16}}/> Participants</button>
      <button onClick={isPrivileged?onEndClass:onLeaveClass} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"13px 18px",background:"none",border:"none",cursor:"pointer",color:RED,fontSize:14,textAlign:"left"as const}}>📵 {isPrivileged?"End Class for All":"Leave Class"}</button>
    </div>}
    <div style={{height:isMobile?60:BAR_H,background:GLASS,backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderTop:"1px solid rgba(255,255,255,.07)",display:"flex",alignItems:"center",justifyContent:"center",gap:isMobile?5:10,padding:`0 ${isMobile?6:16}px calc(${isMobile?4:8}px + env(safe-area-inset-bottom,0px)) ${isMobile?6:16}px`,flexShrink:0,boxShadow:"0 -4px 24px rgba(0,0,0,.45)",overflowX:"auto" as const,WebkitOverflowScrolling:"touch" as const}}>
      <Btn active={micOn} danger={!micOn} title={micOn?"Mute":"Unmute"} onClick={toggleMic}>{micOn?<Mic style={IS}/>:<MicOff style={IS}/>}</Btn>
      <Btn active={camOn} danger={!camOn} title={camOn?"Stop Video":"Start Video"} onClick={toggleCam}>{camOn?<Video style={IS}/>:<VideoOff style={IS}/>}</Btn>
      {isPrivileged?(<Btn active={whiteboardOpen} title="Whiteboard" onClick={onToggleWhiteboard}><PenTool style={{...IS,color:whiteboardOpen?"#4ade80":"#fff"}}/></Btn>):(<Btn active={handUp} title={handUp?"Lower Hand":"Raise Hand"} onClick={toggleHand}><Hand style={{...IS,color:handUp?"#fbbf24":"#fff"}}/></Btn>)}
      <Btn onClick={onToggleChat} badge={chatUnread} title="Chat"><MessageCircle style={IS}/></Btn>
      <Btn onClick={()=>setEmojis(v=>!v)} title="React"><Smile style={IS}/></Btn>
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
  const[chatOpen,setChatOpen]=useState(false);const[partOpen,setPartOpen]=useState(false);const[chatUnread,setChatUnread]=useState(0);
  const[sideTab,setSideTab]=useState<"chat"|"polls">("chat");const[showEnd,setShowEnd]=useState(false);
  const[wbOpen,setWbOpen]=useState(false);const[matOpen,setMatOpen]=useState<any>(null);const[matPicker,setMatPicker]=useState(false);
  const[groupRecite,setGroupRecite]=useState(false);const[canStudentWrite,setCanStudentWrite]=useState(false);const[canStudentRec,setCanStudentRec]=useState(false);
  const wbBuffer=useRef<any[]|null>(null);const prefetch=useRef<{token:string;url:string}|null>(null);
  useEffect(()=>{supabase.functions.invoke("livekit-token",{body:{subject_id:subject.id,action:isPrivileged?"start_session":"join"}}).then(({data})=>{if(data?.token&&data?.url)prefetch.current={token:data.token,url:data.url};}).catch(()=>{});},[subject.id,isPrivileged]);
  // Auto-connect when restored from sessionStorage (page refresh / browser minimize)
  // Fires immediately on mount when autoJoin=true, skipping lobby entirely
  useEffect(()=>{
    if(!autoJoin)return;
    const t=setTimeout(()=>{
      if(phase==="lobby"&&!loading&&!error){
        connect(isPrivileged?"start_session":"join");
      }
    },120); // small delay to let prefetch complete
    return()=>clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[autoJoin]);
  useEffect(()=>{const check=async()=>{const{data}=await supabase.from("live_sessions").select("*").eq("subject_id",subject.id).eq("status","live").maybeSingle();if(data){setSessionInfo(data);setSessionId(data.id);setIsSessionLive(true);}else setIsSessionLive(false);};check();const iv=setInterval(check,4000);return()=>clearInterval(iv);},[subject.id]);
  useEffect(()=>{if(phase!=="live")return;const ti=setInterval(()=>setDuration(d=>d+1),1000);return()=>clearInterval(ti);},[phase]);
  // Media Session API — shows call info in Android notification shade & lock screen
  useEffect(()=>{
    if(phase!=="live"||!("mediaSession"in navigator))return;
    try{
      (navigator as any).mediaSession.metadata=new(window as any).MediaMetadata({
        title:subject.title,artist:"Tahleem Academy — Live Class",album:"In Progress",
      });
      (navigator as any).mediaSession.playbackState="playing";
      (navigator as any).mediaSession.setActionHandler("stop",()=>leaveSession());
      (navigator as any).mediaSession.setActionHandler("pause",()=>leaveSession());
    }catch{}
    return()=>{
      try{(navigator as any).mediaSession.playbackState="none";}catch{}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[phase,subject.title]);
  const connect=async(action:string,settings?:any)=>{
    setLoading(true);setError(null);
    try{
      let tk=prefetch.current?.token||null,url=prefetch.current?.url||null;
      if(!tk||!url){const{data,error:e}=await supabase.functions.invoke("livekit-token",{body:{subject_id:subject.id,action}});if(e)throw e;if(data?.error)throw new Error(data.error);tk=data.token;url=data.url;}
      if(settings&&sessionId)await supabase.from("live_sessions").update({...settings,actual_start_time:new Date().toISOString(),status:"live"}).eq("id",sessionId);
      setToken(tk!);setWsUrl(url!);
      const{data:sessions}=await supabase.from("live_sessions").select("*").eq("subject_id",subject.id).in("status",["live","active","scheduled"]).order("scheduled_at",{ascending:false,nullsFirst:false}).limit(1);
      if(sessions?.length){setSessionId(sessions[0].id);setSessionInfo(sessions[0]);const{data:att}=await supabase.from("attendance_logs").insert({session_id:sessions[0].id,user_id:user!.id,device_info:navigator.userAgent}).select("id").single();if(att)setAttendanceId(att.id);await supabase.from("class_participants").upsert({session_id:sessions[0].id,student_id:user!.id,joined_at:new Date().toISOString(),is_muted:!isPrivileged,camera_on:true,left_at:null,left_minutes:null},{onConflict:"session_id,student_id"});}
      setPhase("live");
    }catch(e:any){setError(e?.message||"Failed to connect");}finally{setLoading(false);}
  };
  useEffect(()=>()=>{
    if(attendanceId){const d=Math.floor((Date.now()-joinedAt)/1000);supabase.from("attendance_logs").update({left_at:new Date().toISOString(),duration_seconds:d}).eq("id",attendanceId);}
    if(sessionId&&user)supabase.from("class_participants").update({left_at:new Date().toISOString(),duration_minutes:Math.floor((Date.now()-joinedAt)/60000)}).eq("session_id",sessionId).eq("student_id",user.id);
  },[attendanceId,joinedAt,sessionId,user]);
  const endSession=async()=>{setShowEnd(false);if(sessionId){await supabase.from("live_sessions").update({status:"ended",ended_at:new Date().toISOString(),actual_end_time:new Date().toISOString()}).eq("id",sessionId);if(user)await supabase.from("class_chat_messages").insert({session_id:sessionId,sender_id:user.id,message:t("Class has ended","انتهت الحصة"),type:"system"});}setPhase("ended");};
  const leaveSession=()=>{if(attendanceId){const d=Math.floor((Date.now()-joinedAt)/1000);supabase.from("attendance_logs").update({left_at:new Date().toISOString(),duration_seconds:d}).eq("id",attendanceId);}if(sessionId&&user)supabase.from("class_participants").update({left_at:new Date().toISOString(),duration_minutes:Math.floor((Date.now()-joinedAt)/60000)}).eq("session_id",sessionId).eq("student_id",user.id);onLeave();};
  const handlePermChange=(type:"write"|"rec",allow:boolean,room?:any)=>{
    if(type==="write"){setCanStudentWrite(allow);try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"wb_allow_write",allow})),{reliable:true});}catch{}toast({title:allow?"✅ Students can now write on the board":"🔒 Write access revoked"});}
    else{setCanStudentRec(allow);try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"rec_allowed",allow})),{reliable:true});}catch{}toast({title:allow?"✅ Students can now record":"🔒 Record permission revoked"});}
  };
  const handleGroupRecite=async()=>{const n=!groupRecite;setGroupRecite(n);toast({title:n?"Group Recitation ON":"Group Recitation OFF"});if(sessionId&&user)await supabase.from("class_chat_messages").insert({session_id:sessionId,sender_id:user.id,message:n?"🎙️ Group Recitation Mode":"🔇 Recitation ended",type:"system"});};
  const fmtT=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  if(phase==="ended")return<ClassEndScreen subject={subject} session={sessionInfo} duration={duration} participantCount={0} onGoToDashboard={onLeave} onGoToRevision={()=>{window.location.href=`/student/revision/${subject.id}`;}} />;
  if(phase==="lobby"&&!loading&&!error&&!autoJoin)return<ClassLobby subject={subject} session={sessionInfo} onStartClass={(s:any)=>connect("start_session",s)} onJoinClass={()=>connect("join")} onBack={onLeave} isLive={isSessionLive}/>;
  if(loading)return(<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",background:DARK}}><style>{CSS}</style><div style={{textAlign:"center"}}><div style={{width:52,height:52,border:`3px solid ${TEAL}`,borderTopColor:"transparent",borderRadius:"50%",animation:"cv-spin .8s linear infinite",margin:"0 auto 16px"}}/><p style={{color:"rgba(255,255,255,.5)",fontSize:14}}>{t("Connecting…","جاري الاتصال…")}</p></div></div>);
  if(error)return(<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",background:DARK}}><style>{CSS}</style><div style={{textAlign:"center",maxWidth:320,padding:28}}><div style={{width:64,height:64,borderRadius:"50%",background:"rgba(239,68,68,.12)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}><X style={{width:28,height:28,color:RED}}/></div><h2 style={{fontSize:20,fontWeight:700,color:"#fff",marginBottom:8}}>Connection Failed</h2><p style={{color:"rgba(255,255,255,.45)",fontSize:14,marginBottom:22}}>{error}</p><div style={{display:"flex",gap:10,justifyContent:"center"}}><button onClick={()=>{setError(null);setPhase("lobby");}} style={{padding:"10px 22px",borderRadius:10,background:TEAL,border:"none",color:"#fff",fontSize:14,cursor:"pointer",fontWeight:600}}>Try Again</button><button onClick={onLeave} style={{padding:"10px 22px",borderRadius:10,background:GLASSB,border:"1px solid rgba(255,255,255,.12)",color:"#fff",fontSize:14,cursor:"pointer"}}>Go Back</button></div></div></div>);
  return(
    <div data-classroom-root style={{height:"100dvh",display:"flex",flexDirection:"column",background:DARK,overflow:"hidden"}}>
      <style>{CSS}</style>
      {token&&wsUrl&&(
        <LiveKitRoom serverUrl={wsUrl} token={token} connect={phase==="live"} options={{adaptiveStream:{pixelDensity:"screen"},dynacast:true,disconnectOnPageLeave:false,audioCaptureDefaults:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,sampleRate:48000,channelCount:1},publishDefaults:{audioPreset:{maxBitrate:32000},dtx:true,red:false,stopMicTrackOnMute:false,videoEncoding:{maxBitrate:700_000,maxFramerate:20},backupCodec:true},videoCaptureDefaults:{resolution:{width:640,height:480,frameRate:20},facingMode:"user"}}} style={{flex:1,display:"flex",flexDirection:"column",minHeight:0,position:"relative"}} data-lk-theme="default">
          <RoomAudioRenderer/>
          <ReconnectMonitor onReconnecting={()=>setReconnecting(true)} onReconnected={()=>setReconnecting(false)}/>
          <RoomDataListener onWbOpen={()=>setWbOpen(true)} onWbClose={()=>setWbOpen(false)} strokesBuffer={wbBuffer} onMatOpen={mat=>setMatOpen(mat)} onMatClose={()=>setMatOpen(null)} onWbAllowWrite={allow=>setCanStudentWrite(allow)} onRecAllowed={allow=>setCanStudentRec(allow)}/>
          {reconnecting&&<div style={{position:"absolute",inset:0,zIndex:200,background:"rgba(0,0,0,.82)",backdropFilter:"blur(8px)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14}}><div style={{width:48,height:48,border:`3px solid ${TEAL}`,borderTopColor:"transparent",borderRadius:"50%",animation:"cv-spin .8s linear infinite"}}/><p style={{color:"#fff",fontSize:15,fontWeight:700}}>Reconnecting…</p><p style={{color:"rgba(255,255,255,.4)",fontSize:13}}>Please stay on the page</p></div>}
          {/* Top bar */}
          <div style={{height:52,background:GLASS,backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",flexShrink:0,borderBottom:"1px solid rgba(255,255,255,.05)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(34,197,94,.12)",borderRadius:20,padding:"4px 12px",border:"1px solid rgba(34,197,94,.25)"}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:GREEN,display:"inline-block",animation:"pip-pulse 1.8s ease-in-out infinite"}}/>
                <span style={{fontSize:12,color:"#fff",fontWeight:600,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{subject.title}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:5,background:"rgba(239,68,68,.12)",borderRadius:16,padding:"3px 10px",border:"1px solid rgba(239,68,68,.25)"}}>
                <Circle style={{width:5,height:5,fill:RED,color:RED}}/><span style={{fontSize:11,color:"#fca5a5",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{fmtT(duration)}</span>
              </div>
            </div>
            {isPrivileged&&<RecController sessionId={sessionId} subjectId={subject.id} userEmail={user?.email||""} onSavingChange={setSavingRec}/>}
          </div>
          {/* Content */}
          <div style={{flex:1,display:"flex",minHeight:0,overflow:"hidden"}}>
            <div style={{flex:1,position:"relative",minWidth:0}}><VideoGrid/></div>
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
          <BottomBarBridge sessionId={sessionId||""} onToggleChat={()=>{setChatOpen(v=>!v);if(!chatOpen)setChatUnread(0);}} onToggleParticipants={()=>setPartOpen(v=>!v)} onEndClass={()=>setShowEnd(true)} onLeaveClass={leaveSession} chatUnread={chatUnread} onToggleWhiteboard={()=>setWbOpen(v=>!v)} whiteboardOpen={wbOpen} onGroupRecite={handleGroupRecite} groupReciteMode={groupRecite} onShareMaterial={()=>setMatPicker(true)} isPrivileged={isPrivileged} canStudentWriteProp={canStudentWrite} canStudentRecProp={canStudentRec} onPermChange={(type:any,allow:any,room:any)=>handlePermChange(type,allow,room)} onMinimize={onMinimize}/>
          {isMobile&&chatOpen&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:50}} onClick={()=>setChatOpen(false)}><div style={{position:"absolute",bottom:0,left:0,right:0,background:"#13181f",borderRadius:"22px 22px 0 0",maxHeight:"82vh",display:"flex",flexDirection:"column",animation:"slide-up .22s ease",paddingBottom:"env(safe-area-inset-bottom,0px)"}} onClick={e=>e.stopPropagation()}><div style={{display:"flex",alignItems:"center",padding:"12px 16px 0",flexShrink:0}}><div style={{flex:1,display:"flex"}}>{[["chat","💬","Chat"],["polls","📊","Polls"]].map(([k,ic,lb])=>(<button key={k} onClick={()=>setSideTab(k as any)} style={{flex:1,padding:"10px 6px",background:"none",border:"none",color:sideTab===k?"#fff":"rgba(255,255,255,.35)",fontSize:13,fontWeight:sideTab===k?700:400,borderBottom:sideTab===k?`2px solid ${TEAL}`:"2px solid transparent",cursor:"pointer"}}>{ic} {lb}</button>))}</div><button onClick={()=>setChatOpen(false)} style={{width:32,height:32,borderRadius:"50%",background:"rgba(255,255,255,.1)",border:"none",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><X style={{width:14,height:14}}/></button></div><div style={{flex:1,overflow:"hidden",minHeight:340}}>{sideTab==="chat"?<ClassChatPanel sessionId={sessionId||""}/>:<ClassPolls sessionId={sessionId||""}/>}</div></div></div>)}
          {isMobile&&partOpen&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:50}} onClick={()=>setPartOpen(false)}><div style={{position:"absolute",bottom:BAR_H,left:0,right:0,background:"#13181f",borderRadius:"22px 22px 0 0",maxHeight:"65vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}><div style={{width:40,height:4,borderRadius:2,background:"rgba(255,255,255,.18)",margin:"12px auto 6px"}}/><ClassParticipants sessionId={sessionId||""}/></div></div>)}
          <LiveQuizOverlay sessionId={sessionId||""} isOpen={false} onClose={()=>{}}/>
        </LiveKitRoom>
      )}
      {matPicker&&<MatPickerBridge subjectId={subject.id} onShare={(mat:any,room:any)=>{setMatOpen(mat);setMatPicker(false);try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"mat_open",material:mat})),{reliable:true});}catch{}}} onClose={()=>setMatPicker(false)}/>}
      {matOpen&&<MatViewerBridge material={matOpen} isTeacher={isPrivileged} onClose={(room?:any)=>{setMatOpen(null);if(isPrivileged){try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"mat_close"})),{reliable:true});}catch{}}}}/>}
      <Dialog open={showEnd} onOpenChange={setShowEnd}>
        <DialogContent><DialogHeader><DialogTitle>{t("End class for everyone?","إنهاء الحصة للجميع؟")}</DialogTitle></DialogHeader>
          <p style={{fontSize:13,color:"#666"}}>{t("This will disconnect all participants.","سيتم قطع الاتصال عن جميع المشاركين.")}</p>
          <DialogFooter style={{display:"flex",gap:8}}><Button variant="outline" onClick={()=>setShowEnd(false)}>{t("Cancel","إلغاء")}</Button><Button variant="outline" onClick={()=>{setShowEnd(false);leaveSession();}}>{t("Leave but Keep Open","غادر لكن أبقِ الحصة")}</Button><Button variant="destructive" onClick={endSession}>{t("End for All","إنهاء للجميع")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const MatPickerBridge=({subjectId,onShare,onClose}:any)=>{const room=useRoomContext();return<MaterialPicker subjectId={subjectId} onShare={(mat:any)=>onShare(mat,room)} onClose={onClose}/>;};
const MatViewerBridge=({material,isTeacher,onClose}:any)=>{const room=useRoomContext();return<MaterialViewer material={material} isTeacher={isTeacher} onClose={()=>onClose(room)}/>;};

export default ClassroomView;
