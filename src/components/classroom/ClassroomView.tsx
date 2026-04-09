/*
  ClassroomView.tsx — Tahleem Academy Live Classroom
  ✅ Video uses LiveKit GridLayout (reliable, no black screens)
  ✅ Mic/cam read actual state on mount (no double-tap bug)
  ✅ Clean 6-button toolbar — beautiful and minimal
  ✅ Whiteboard via createPortal at document.body (escapes transforms)
  ✅ Whiteboard persists per subject in Supabase
  ✅ Teacher opens whiteboard → students see fullscreen instantly
*/

import {
  LiveKitRoom, RoomAudioRenderer, useRoomContext,
  GridLayout, ParticipantTile, useTracks, useParticipants, useLocalParticipant,
} from "@livekit/components-react";
// @ts-ignore
import "@livekit/components-styles";
import { Track, RoomEvent } from "livekit-client";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Circle, Loader2, X, Mic, MicOff, Video, VideoOff, Phone,
  Hand, PenTool, MessageCircle, MoreVertical, Volume2,
  BookOpen, ArrowLeft, Smile, Play, Pause,
} from "lucide-react";
import ClassLobby       from "./ClassLobby";
import ClassChatPanel   from "./ClassChatPanel";
import ClassParticipants from "./ClassParticipants";
import ClassPolls       from "./ClassPolls";
import ClassEndScreen   from "./ClassEndScreen";
import LiveQuizOverlay  from "./LiveQuizOverlay";
import { useIsMobile }  from "@/hooks/use-mobile";
import { useState, useEffect, useRef, useCallback } from "react";

interface ClassroomViewProps { subject: any; onLeave: () => void; onMinimize?: () => void; }

const G     = "#075E54";
const G2    = "#064E3B";
const BAR_H = 72;
const CSS   = `
  @keyframes cv-spin { to { transform: rotate(360deg); } }
  @keyframes wb-spin  { to { transform: rotate(360deg); } }
  [data-lk-theme] { height: 100% !important; display: flex !important; flex-direction: column !important; }
`;

/* ══════════════════════════════════════════
   WHITEBOARD — portal at document.body
   Completely outside LiveKit transforms
══════════════════════════════════════════ */
const Whiteboard = ({ room, onClose, isTeacher, initialStrokes, subjectId, canStudentWrite }: {
  room: any; onClose: () => void; isTeacher: boolean;
  initialStrokes?: any[] | null; subjectId: string; canStudentWrite?: boolean;
}) => {
  const canDraw = isTeacher || canStudentWrite;
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const drawing    = useRef(false);
  const strokesRef = useRef<any[]>([]);
  const saveTimer  = useRef<any>(null);
  const [color, setColor]         = useState("#1a1a1a");
  const [lineWidth, setLineWidth] = useState(4);
  const [tool, setTool]           = useState<"pen"|"eraser">("pen");
  const [busy, setBusy]           = useState(true);

  const redraw = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    for (const s of strokesRef.current) {
      if (!s.points || s.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = s.color; ctx.lineWidth = s.lineWidth;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("subject_whiteboard" as any).select("strokes").eq("subject_id", subjectId).maybeSingle();
        if ((data as any)?.strokes?.length) strokesRef.current = (data as any).strokes;
        else if (initialStrokes?.length) strokesRef.current = initialStrokes;
      } catch { if (initialStrokes?.length) strokesRef.current = initialStrokes; }
      setBusy(false); setTimeout(redraw, 40);
    })();
  }, []); // eslint-disable-line

  const save = useCallback(() => {
    if (!canDraw) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { await supabase.from("subject_whiteboard" as any).upsert({ subject_id: subjectId, strokes: strokesRef.current, updated_at: new Date().toISOString() }, { onConflict: "subject_id" }); } catch {}
    }, 1200);
  }, [isTeacher, subjectId]);

  useEffect(() => {
    if (!room) return;
    const h = (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type === "wb_strokes") { strokesRef.current = msg.strokes; redraw(); }
        if (msg.type === "wb_clear")   { strokesRef.current = []; redraw(); }
      } catch {}
    };
    room.on(RoomEvent.DataReceived, h);
    return () => room.off(RoomEvent.DataReceived, h);
  }, [room, redraw]);

  const broadcast = useCallback((msg: object) => {
    try { room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify(msg)), { reliable: true }); } catch {}
  }, [room]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvasRef.current!.width / r.width), y: (e.clientY - r.top) * (canvasRef.current!.height / r.height) };
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw) return; drawing.current = true;
    (e.target as any).setPointerCapture(e.pointerId);
    strokesRef.current.push({ color: tool === "eraser" ? "#fff" : color, lineWidth: tool === "eraser" ? 28 : lineWidth, points: [getPos(e)] });
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !canDraw) return;
    const s = strokesRef.current[strokesRef.current.length - 1];
    if (s) { s.points.push(getPos(e)); redraw(); }
  };
  const onUp = () => {
    if (!canDraw || !drawing.current) return;
    drawing.current = false; broadcast({ type: "wb_strokes", strokes: strokesRef.current }); save();
  };
  const clearBoard = () => { if(!canDraw) return; strokesRef.current = []; redraw(); broadcast({ type: "wb_clear" }); save(); };

  const COLORS = ["#1a1a1a","#EF4444","#3B82F6","#22C55E","#F59E0B","#8B5CF6","#EC4899","#ffffff"];

  return createPortal(
    <div style={{ position:"fixed", inset:0, zIndex:9999, background:"#f8f8f8", display:"flex", flexDirection:"column" }}>
      <style>{`@keyframes wb-spin { to { transform:rotate(360deg); } }`}</style>

      {/* Header — single row: X | title | tools (if can draw) */}
      <div style={{ background:`linear-gradient(135deg,${G2},${G})`, display:"flex", alignItems:"center", gap:8, padding:"8px 10px", flexShrink:0, boxShadow:"0 2px 12px rgba(0,0,0,.35)", overflowX:"auto" as const }}>
        {/* X close button */}
        <button onClick={onClose} style={{ width:34, height:34, borderRadius:10, background:"rgba(255,255,255,.18)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", flexShrink:0 }}>
          <X style={{ width:16, height:16 }}/>
        </button>
        {/* Title */}
        <PenTool style={{ width:14, height:14, color:"rgba(255,255,255,.6)", flexShrink:0 }}/>
        <span style={{ fontSize:13, fontWeight:700, color:"#fff", flexShrink:0, marginRight:4 }}>
          Whiteboard{!canDraw && <span style={{ fontSize:10, opacity:.5, marginLeft:6 }}>View only</span>}
        </span>
        {/* Drawing tools — only if allowed to draw */}
        {canDraw && (
          <>
            {/* Pen / Eraser */}
            {[{id:"pen",icon:"✏️"},{id:"eraser",icon:"⬜"}].map(t=>(
              <button key={t.id} onClick={()=>setTool(t.id as any)} style={{ width:30, height:30, borderRadius:8, border:"none", background:tool===t.id?"rgba(255,255,255,.3)":"rgba(255,255,255,.1)", fontSize:14, cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>{t.icon}</button>
            ))}
            {/* Color dots */}
            {COLORS.map(col=>(
              <button key={col} onClick={()=>{setColor(col);setTool("pen");}} style={{ width:20, height:20, borderRadius:"50%", background:col, border:color===col&&tool==="pen"?"3px solid #fff":"2px solid rgba(255,255,255,.25)", cursor:"pointer", flexShrink:0 }}/>
            ))}
            {/* Thickness */}
            <input type="range" min={1} max={24} value={lineWidth} onChange={e=>setLineWidth(+e.target.value)} style={{ width:52, accentColor:"#fff", flexShrink:0 }}/>
            {/* Clear — teacher only */}
            {isTeacher && (
              <button onClick={clearBoard} style={{ height:28, padding:"0 10px", borderRadius:8, border:"none", background:"#EF4444", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer", flexShrink:0 }}>✕</button>
            )}
          </>
        )}
      </div>

      {/* Canvas */}
      <div style={{ flex:1, position:"relative", overflow:"hidden", background:"#fff" }}>
        {busy && <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"#fff", zIndex:5 }}><Loader2 style={{ width:32, height:32, color:G, animation:"wb-spin .8s linear infinite" }}/></div>}
        <canvas ref={canvasRef} width={1600} height={1000}
          style={{ width:"100%", height:"100%", display:"block", cursor:canDraw?(tool==="eraser"?"cell":"crosshair"):"default", touchAction:"none" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onPointerCancel={onUp}
        />
      </div>
    </div>,
    document.body
  );
};

/* ══════════════════════════════════════════
   WHITEBOARD BRIDGE — reads room context then renders portal
══════════════════════════════════════════ */
const WhiteboardBridge = ({ onClose, isTeacher, initialStrokes, subjectId, canStudentWrite }: {
  onClose: ()=>void; isTeacher: boolean; initialStrokes: any[]|null; subjectId: string; canStudentWrite?: boolean;
}) => {
  const room = useRoomContext();
  return <Whiteboard room={room} onClose={onClose} isTeacher={isTeacher} initialStrokes={initialStrokes} subjectId={subjectId} canStudentWrite={canStudentWrite}/>;
};

/* ══════════════════════════════════════════
   ROOM DATA LISTENER
══════════════════════════════════════════ */
const RoomDataListener = ({ onWbOpen, onWbClose, strokesBuffer, onMatOpen, onMatClose, onWbAllowWrite, onRecAllowed }: {
  onWbOpen:()=>void; onWbClose:()=>void; strokesBuffer: React.MutableRefObject<any[]|null>;
  onMatOpen?:(mat:any)=>void; onMatClose?:()=>void;
  onWbAllowWrite?:(allow:boolean)=>void; onRecAllowed?:(allow:boolean)=>void;
}) => {
  const room = useRoomContext();
  useEffect(() => {
    const h = (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type==="wb_open")         onWbOpen();
        if (msg.type==="wb_close")        onWbClose();
        if (msg.type==="wb_strokes")      strokesBuffer.current = msg.strokes;
        if (msg.type==="wb_clear")        strokesBuffer.current = [];
        if (msg.type==="mat_open")        onMatOpen?.(msg.material);
        if (msg.type==="mat_close")       onMatClose?.();
        if (msg.type==="wb_allow_write")  onWbAllowWrite?.(msg.allow);
        if (msg.type==="rec_allowed")     onRecAllowed?.(msg.allow);
      } catch {}
    };
    room.on(RoomEvent.DataReceived, h);
    return () => { room.off(RoomEvent.DataReceived, h); };
  }, [room, onWbOpen, onWbClose, strokesBuffer, onMatOpen, onMatClose]);
  return null;
};

/* ══════════════════════════════════════════
   MATERIAL VIEWER — portal
══════════════════════════════════════════ */
const MaterialViewer = ({ material, isTeacher, onClose }: { material:any; isTeacher:boolean; onClose:()=>void }) => {
  const url   = material.file_url || material.url || "";
  const title = material.title || material.name || "Material";
  const isYT  = url.includes("youtube.com") || url.includes("youtu.be");
  const isPdf = url.toLowerCase().includes(".pdf") || (material.material_type||"").includes("pdf");
  const isImg = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
  const isVid = /\.(mp4|webm|ogg|mov)$/i.test(url);
  const ytId  = (u:string) => { const m=u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/); return m?m[1]:""; };

  return createPortal(
    <div style={{ position:"fixed", inset:0, zIndex:9998, background:"#000", display:"flex", flexDirection:"column" }}>
      <div style={{ height:50, background:`rgba(6,78,59,.97)`, display:"flex", alignItems:"center", padding:"0 14px", gap:10 }}>
        <BookOpen style={{ width:18, height:18, color:"#fff" }}/>
        <span style={{ color:"#fff", fontWeight:700, fontSize:15, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{title}</span>
        {!isTeacher && <span style={{ fontSize:11, color:"rgba(255,255,255,.45)" }}>Shared by teacher</span>}
        <button onClick={onClose} style={{ width:34, height:34, borderRadius:8, background:"rgba(255,255,255,.15)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff" }}><X style={{ width:16, height:16 }}/></button>
      </div>
      <div style={{ flex:1, overflow:"hidden" }}>
        {isYT  && <iframe src={`https://www.youtube.com/embed/${ytId(url)}?autoplay=1`} style={{ width:"100%", height:"100%", border:"none" }} allow="autoplay; fullscreen" allowFullScreen/>}
        {isPdf && !isYT && <iframe src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`} style={{ width:"100%", height:"100%", border:"none" }}/>}
        {isImg && <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}><img src={url} alt={title} style={{ maxWidth:"100%", maxHeight:"100%", objectFit:"contain" }}/></div>}
        {isVid && <video src={url} controls autoPlay style={{ width:"100%", height:"100%", background:"#000" }}/>}
        {!isYT&&!isPdf&&!isImg&&!isVid && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:16 }}>
            <BookOpen style={{ width:52, height:52, color:"rgba(255,255,255,.3)" }}/>
            <p style={{ color:"#fff", fontWeight:700, fontSize:18 }}>{title}</p>
            <a href={url} target="_blank" rel="noreferrer" style={{ background:G, color:"#fff", padding:"12px 28px", borderRadius:12, textDecoration:"none", fontWeight:700, fontSize:14 }}>Open File ↗</a>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

/* ══════════════════════════════════════════
   MATERIAL PICKER — teacher selects file to share
══════════════════════════════════════════ */
const MaterialPicker = ({ subjectId, onShare, onClose }: { subjectId:string; onShare:(mat:any)=>void; onClose:()=>void }) => {
  const [mats, setMats]     = useState<any[]>([]);
  const [busy, setBusy]     = useState(true);
  useEffect(() => {
    supabase.from("subject_materials").select("*").eq("subject_id", subjectId).order("created_at",{ascending:false})
      .then(({data}) => { setMats(data||[]); setBusy(false); });
  }, [subjectId]);

  return createPortal(
    <div style={{ position:"fixed", inset:0, zIndex:9997, background:"rgba(0,0,0,.78)", backdropFilter:"blur(4px)", display:"flex", alignItems:"flex-end" }} onClick={onClose}>
      <div style={{ width:"100%", background:"#1a1a1a", borderRadius:"20px 20px 0 0", maxHeight:"70vh", display:"flex", flexDirection:"column" }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:"14px 18px", borderBottom:"1px solid rgba(255,255,255,.1)", display:"flex", alignItems:"center", gap:10 }}>
          <BookOpen style={{ width:18, height:18, color:G }}/>
          <span style={{ color:"#fff", fontWeight:700, fontSize:16, flex:1 }}>Share Material with Class</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"rgba(255,255,255,.5)", cursor:"pointer" }}><X style={{ width:18, height:18 }}/></button>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
          {busy && <div style={{ display:"flex", justifyContent:"center", padding:28 }}><Loader2 style={{ width:24, height:24, color:G, animation:"wb-spin .8s linear infinite" }}/></div>}
          {!busy && mats.length===0 && <p style={{ textAlign:"center", padding:"28px", color:"rgba(255,255,255,.4)", fontSize:14 }}>No materials uploaded for this subject</p>}
          {mats.map(m=>(
            <button key={m.id} onClick={()=>onShare(m)} style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"14px 18px", background:"none", border:"none", cursor:"pointer", textAlign:"left" as const, borderBottom:"1px solid rgba(255,255,255,.07)" }}>
              <div style={{ width:40, height:40, borderRadius:10, background:"rgba(7,94,84,.4)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <BookOpen style={{ width:18, height:18, color:"#4ade80" }}/>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ color:"#fff", fontWeight:600, fontSize:14, margin:"0 0 3px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{m.title||m.name||"Untitled"}</p>
                <p style={{ color:"rgba(255,255,255,.4)", fontSize:11, margin:0, textTransform:"capitalize" as const }}>{m.material_type||"file"}</p>
              </div>
              <span style={{ fontSize:12, color:G, fontWeight:700 }}>Share →</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};

/* ══════════════════════════════════════════
   RECORDING CONTROLLER
══════════════════════════════════════════ */
const RecController = ({ sessionId, subjectId, userEmail, onSavingChange }: any) => {
  const room = useRoomContext();
  const { t } = useLanguage();
  const [recording, setRecording] = useState(false);
  const [paused, setPaused]       = useState(false);
  const [time, setTime]           = useState(0);
  const timerRef  = useRef<any>(null);
  const mrRef     = useRef<MediaRecorder|null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const acRef     = useRef<AudioContext|null>(null);

  const collectAudio = useCallback(() => {
    try {
      const ac = new AudioContext(); acRef.current = ac;
      const dest = ac.createMediaStreamDestination(); let n = 0;
      [room.localParticipant, ...Array.from(room.remoteParticipants.values())].forEach((p:any) => {
        p.trackPublications?.forEach?.((pub:any) => {
          if (pub.kind==="audio" && pub.track?.mediaStreamTrack) {
            ac.createMediaStreamSource(new MediaStream([pub.track.mediaStreamTrack])).connect(dest); n++;
          }
        });
      });
      return n > 0 ? dest.stream : null;
    } catch { return null; }
  }, [room]);

  const startRec = async () => {
    const audio = collectAudio(); if (!audio) { toast({ title:"No audio tracks" }); return; }
    chunksRef.current = [];
    const mr = new MediaRecorder(audio, { mimeType:"audio/webm;codecs=opus" });
    mr.ondataavailable = e => { if (e.data.size>0) chunksRef.current.push(e.data); };
    mr.start(1000); mrRef.current = mr; setRecording(true); setPaused(false); setTime(0);
    timerRef.current = setInterval(()=>setTime(t=>t+1), 1000);
    if (sessionId) await supabase.from("live_sessions").update({ is_recording:true } as any).eq("id", sessionId);
  };

  const stopRec = async () => {
    clearInterval(timerRef.current); const mr = mrRef.current; if (!mr) return;
    onSavingChange?.(true); mr.stop();
    mr.onstop = async () => {
      try {
        const blob = new Blob(chunksRef.current, { type:"audio/webm" });
        const path = `recordings/${sessionId||subjectId}/${Date.now()}.webm`;
        await supabase.storage.from("recordings").upload(path, blob);
        const { data:{ publicUrl } } = supabase.storage.from("recordings").getPublicUrl(path);
        if (sessionId) {
          await supabase.from("live_sessions").update({ recording_url:publicUrl, is_recording:false } as any).eq("id", sessionId);
          await supabase.from("recordings" as any).insert({ session_id:sessionId, subject_id:subjectId, url:publicUrl, recorded_by:userEmail, duration_seconds:time });
        }
        toast({ title:t("Recording saved ✅","تم حفظ التسجيل ✅") });
      } catch (e:any) { toast({ title:"Save failed", description:e?.message, variant:"destructive" }); }
      onSavingChange?.(false);
    };
    acRef.current?.close();
    setRecording(false); setPaused(false);
    if (sessionId) await supabase.from("live_sessions").update({ is_recording:false } as any).eq("id", sessionId);
  };

  const togglePause = () => {
    const mr = mrRef.current; if (!mr) return;
    if (paused) { mr.resume(); timerRef.current=setInterval(()=>setTime(t=>t+1),1000); setPaused(false); }
    else { mr.pause(); clearInterval(timerRef.current); setPaused(true); }
  };

  const fmt = (s:number) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      {recording && <>
        <span style={{ fontSize:12, color:paused?"#fbbf24":"#EF4444", fontWeight:700 }}>{paused?"⏸":"⏺"} {fmt(time)}</span>
        <button onClick={togglePause} style={{ background:"rgba(255,255,255,.15)", border:"none", borderRadius:8, padding:"4px 10px", color:"#fff", fontSize:12, cursor:"pointer" }}>
          {paused?<Play style={{ width:12, height:12 }}/>:<Pause style={{ width:12, height:12 }}/>}
        </button>
        <button onClick={stopRec} style={{ background:"rgba(239,68,68,.3)", border:"none", borderRadius:8, padding:"4px 10px", color:"#EF4444", fontSize:12, fontWeight:700, cursor:"pointer" }}>Stop</button>
      </>}
      {!recording && (
        <button onClick={startRec} style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(239,68,68,.18)", border:"1px solid rgba(239,68,68,.4)", borderRadius:20, padding:"5px 14px", color:"#fca5a5", fontSize:12, fontWeight:700, cursor:"pointer" }}>
          <Circle style={{ width:8, height:8, fill:"#EF4444", color:"#EF4444" }}/> Record
        </button>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════
   BOTTOM BAR — 6 clean buttons + overflow
══════════════════════════════════════════ */
const BottomBar = ({
  sessionId, onToggleChat, onToggleParticipants,
  onEndClass, onLeaveClass, chatUnread,
  onToggleWhiteboard, whiteboardOpen,
  onGroupRecite, groupReciteMode,
  onShareMaterial, isPrivileged,
  canStudentRec, canStudentWriteProp, canStudentRecProp, onPermChange,
  onMinimize,
}: any) => {
  const room = useRoomContext();
  const { user } = useAuth();

  // Read ACTUAL LiveKit state — avoids the double-tap bug
  const [micOn,  setMicOn]  = useState(() => room.localParticipant.isMicrophoneEnabled);
  const [camOn,  setCamOn]  = useState(() => room.localParticipant.isCameraEnabled);
  const [handUp,  setHandUp]  = useState(false);
  const [menu,    setMenu]    = useState(false);
  const [emojis,  setEmojis]  = useState(false);
  const [stuRec,  setStuRec]  = useState(false);
  const stuMrRef  = useRef<MediaRecorder|null>(null);
  const stuChunks = useRef<Blob[]>([]);

  useEffect(() => {
    const sync = () => { setMicOn(room.localParticipant.isMicrophoneEnabled); setCamOn(room.localParticipant.isCameraEnabled); };
    room.localParticipant.on("trackMuted", sync); room.localParticipant.on("trackUnmuted", sync);
    room.localParticipant.on("trackPublished", sync); room.localParticipant.on("trackUnpublished", sync);
    return () => { room.localParticipant.off("trackMuted",sync); room.localParticipant.off("trackUnmuted",sync); room.localParticipant.off("trackPublished",sync); room.localParticipant.off("trackUnpublished",sync); };
  }, [room]);

  const toggleMic = async () => { const n=!micOn; await room.localParticipant.setMicrophoneEnabled(n); setMicOn(n); };
  const toggleCam = async () => { const n=!camOn; await room.localParticipant.setCameraEnabled(n); setCamOn(n); };
  const toggleHand = async () => {
    if (!user||!sessionId) return; const n=!handUp; setHandUp(n);
    await supabase.from("class_participants").update({ hand_raised:n, hand_raised_at:n?new Date().toISOString():null }).eq("session_id",sessionId).eq("student_id",user.id);
  };
  const toggleStuRecord = async () => {
    if (stuRec) {
      // Stop and save locally
      stuMrRef.current?.stop();
      stuMrRef.current!.onstop = () => {
        const blob = new Blob(stuChunks.current, { type:"audio/webm" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url; a.download = `class-recording-${Date.now()}.webm`; a.click();
        URL.revokeObjectURL(url);
        stuChunks.current = [];
      };
      setStuRec(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
        const mr = new MediaRecorder(stream, { mimeType:"audio/webm" });
        stuChunks.current = [];
        mr.ondataavailable = e => { if(e.data.size>0) stuChunks.current.push(e.data); };
        mr.start(1000); stuMrRef.current = mr; setStuRec(true);
      } catch { toast({ title:"Microphone access denied" }); }
    }
  };
  const sendEmoji = (e:string) => {
    setEmojis(false);
    if (user&&sessionId) supabase.from("class_chat_messages").insert({ session_id:sessionId, sender_id:user.id, message:e, type:"emoji" });
  };
  const openBoard = () => {
    const next = !whiteboardOpen; onToggleWhiteboard();
    try { room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ type:next?"wb_open":"wb_close" })), { reliable:true }); } catch {}
  };

  const Btn = ({ children, active=false, danger=false, onClick }: any) => (
    <button onClick={onClick} style={{ width:50, height:52, borderRadius:14, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", background:danger?"rgba(239,68,68,.18)":active?"rgba(255,255,255,.2)":"rgba(255,255,255,.07)", color:danger?"#EF4444":"#fff", transition:"all .15s" }}>
      {children}
    </button>
  );
  const IS = { width:20, height:20 };

  return (
    <>
      {/* Emoji picker */}
      {emojis && (
        <div style={{ position:"fixed", bottom:BAR_H+10, left:"50%", transform:"translateX(-50%)", background:"#1e1e1e", borderRadius:40, padding:"10px 14px", display:"flex", gap:8, zIndex:100, boxShadow:"0 4px 20px rgba(0,0,0,.5)" }}>
          {["👏","🤲","❤️","😂","🌟","👍","🙏","🕌"].map(e=>(
            <button key={e} onClick={()=>sendEmoji(e)} style={{ fontSize:26, background:"none", border:"none", cursor:"pointer", padding:"2px 4px" }}>{e}</button>
          ))}
        </div>
      )}

      {/* Overflow menu */}
      {menu && (
        <div onClick={()=>setMenu(false)} style={{ position:"fixed", bottom:BAR_H+8, right:12, background:"#1e1e1e", borderRadius:16, boxShadow:"0 4px 28px rgba(0,0,0,.6)", minWidth:220, zIndex:100, overflow:"hidden" }}>
          {isPrivileged && [
            { icon:Volume2, label:groupReciteMode?"End Group Recitation":"Group Recitation", color:groupReciteMode?"#22c55e":"#fff", fn:onGroupRecite },
            { icon:BookOpen, label:"Share Material", color:"#fff", fn:onShareMaterial },
            { icon:PenTool,  label:canStudentWriteProp?"Revoke Write Access":"Allow Students to Write", color:canStudentWriteProp?"#22c55e":"#fff",
              fn:()=>{ const n=!canStudentWriteProp; onPermChange?.("write",n); }
            },
            { icon:Circle,   label:canStudentRecProp?"Revoke Record Permission":"Allow Students to Record", color:canStudentRecProp?"#22c55e":"#fff",
              fn:()=>{ const n=!canStudentRecProp; onPermChange?.("rec",n); }
            },
          ].map((item,i)=>(
            <button key={i} onClick={item.fn} style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"14px 18px", background:"none", border:"none", cursor:"pointer", color:item.color, fontSize:14, borderBottom:"1px solid rgba(255,255,255,.07)", textAlign:"left" as const }}>
              <item.icon style={{ width:17, height:17 }}/> {item.label}
            </button>
          ))}
          <button onClick={()=>{setMenu(false);onToggleParticipants();}} style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"14px 18px", background:"none", border:"none", cursor:"pointer", color:"#fff", fontSize:14, borderBottom:"1px solid rgba(255,255,255,.07)", textAlign:"left" as const }}>
            👥 Participants
          </button>
          <button onClick={isPrivileged?onEndClass:onLeaveClass} style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"14px 18px", background:"none", border:"none", cursor:"pointer", color:"#EF4444", fontSize:14, textAlign:"left" as const }}>
            📵 {isPrivileged?"End Class for All":"Leave Class"}
          </button>
        </div>
      )}

      {/* Main bar */}
      <div style={{ height:BAR_H, background:`linear-gradient(135deg,${G2},${G})`, display:"flex", alignItems:"center", justifyContent:"space-around", padding:"0 8px", flexShrink:0, boxShadow:"0 -2px 16px rgba(0,0,0,.4)" }}>

        <Btn active={micOn} danger={!micOn} label={micOn?"Mic Off":"Mic On"} onClick={toggleMic}>
          {micOn ? <Mic style={IS}/> : <MicOff style={IS}/>}
        </Btn>

        <Btn active={camOn} danger={!camOn} label={camOn?"Cam Off":"Cam On"} onClick={toggleCam}>
          {camOn ? <Video style={IS}/> : <Video style={{ ...IS, opacity:.4 }}/>}
        </Btn>

        {isPrivileged ? (
          <Btn active={whiteboardOpen} onClick={openBoard}>
            <PenTool style={{ ...IS, color:whiteboardOpen?"#22c55e":"#fff" }}/>
          </Btn>
        ) : (
          <Btn active={handUp} label={handUp?"Lower":"Hand"} onClick={toggleHand}>
            <Hand style={{ ...IS, color:handUp?"#fbbf24":"#fff" }}/>
          </Btn>
        )}

        <div style={{ position:"relative" }}>
          <Btn onClick={onToggleChat}><span style={{ fontSize:20 }}>💬</span></Btn>
          {chatUnread>0 && <span style={{ position:"absolute", top:4, right:4, background:"#EF4444", color:"#fff", borderRadius:"50%", width:16, height:16, fontSize:9, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700 }}>{chatUnread}</span>}
        </div>

        <Btn onClick={()=>setEmojis(v=>!v)}><Smile style={IS}/></Btn>

        <Btn onClick={()=>setMenu(v=>!v)}><MoreVertical style={IS}/></Btn>

        {/* Minimize (PiP) button */}
        {onMinimize && (
          <Btn onClick={onMinimize}>
            <span style={{ fontSize:16 }}>⤵</span>
          </Btn>
        )}

        {/* Red leave button */}
        <button onClick={isPrivileged?onEndClass:onLeaveClass}
          style={{ height:44, padding:"0 18px", borderRadius:22, border:"none", cursor:"pointer", background:"#EF4444", color:"#fff", display:"flex", alignItems:"center", gap:6, fontWeight:700, fontSize:13, boxShadow:"0 2px 12px rgba(239,68,68,.55)", flexShrink:0 }}>
          📵 {isPrivileged?"End":"Leave"}
        </button>
      </div>
    </>
  );
};

/* ══════════════════════════════════════════
   WHATSAPP-STYLE VIDEO GRID
   - All participants always visible on screen (no scrolling)
   - Dynamic layout: 1 full, 2 side-by-side, 3-4 2×2, 5-6 3+3, 7+ 3 cols
   - Mic toggle button on each tile
   - Speaking highlight ring
══════════════════════════════════════════ */
const ParticipantTileCustom = ({ participant, isLocal }: { participant: any; isLocal: boolean }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo]     = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const room = useRoomContext();

  useEffect(() => {
    const update = () => {
      // Check camera track
      const camPub = participant.getTrackPublication?.(Track.Source.Camera)
                  || participant.trackPublications?.get(Track.Source.Camera);
      const track = camPub?.videoTrack || camPub?.track;
      if (track?.mediaStreamTrack?.readyState === "live" && videoRef.current) {
        videoRef.current.srcObject = new MediaStream([track.mediaStreamTrack]);
        videoRef.current.play().catch(() => {});
        setHasVideo(true);
      } else {
        if (videoRef.current) videoRef.current.srcObject = null;
        setHasVideo(false);
      }
      // Mic state
      const micPub = participant.getTrackPublication?.(Track.Source.Microphone)
                  || participant.trackPublications?.get(Track.Source.Microphone);
      setMicEnabled(!(micPub?.isMuted ?? false));
    };
    update();
    const onSpeak = (v: boolean) => setIsSpeaking(v);
    participant.on?.("trackSubscribed",   update);
    participant.on?.("trackUnsubscribed", update);
    participant.on?.("trackMuted",        update);
    participant.on?.("trackUnmuted",      update);
    participant.on?.("isSpeakingChanged", onSpeak);
    return () => {
      participant.off?.("trackSubscribed",   update);
      participant.off?.("trackUnsubscribed", update);
      participant.off?.("trackMuted",        update);
      participant.off?.("trackUnmuted",      update);
      participant.off?.("isSpeakingChanged", onSpeak);
    };
  }, [participant]);

  const toggleMyMic = async () => {
    if (!isLocal) return;
    const next = !micEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicEnabled(next);
  };

  const name = participant.name || participant.identity || "User";
  const initials = name.split(" ").map((w: string) => w[0] || "").join("").slice(0, 2).toUpperCase() || "?";

  return (
    <div style={{
      position: "relative",
      width: "100%", height: "100%",
      background: "#161b22",
      borderRadius: 12,
      overflow: "hidden",
      border: isSpeaking ? "2px solid #22c55e" : "2px solid transparent",
      transition: "border-color .2s",
      boxShadow: isSpeaking ? "0 0 12px rgba(34,197,94,.5)" : "none",
    }}>
      {/* Video */}
      <video
        ref={videoRef} autoPlay playsInline
        muted={isLocal}
        style={{
          width: "100%", height: "100%",
          objectFit: "cover",
          display: hasVideo ? "block" : "none",
          transform: isLocal ? "scaleX(-1)" : "none",
        }}
      />

      {/* Avatar fallback */}
      {!hasVideo && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(135deg,#0f2318,#1e3a2f)",
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: "50%",
            background: G,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, fontWeight: 800, color: "#fff",
            border: isSpeaking ? "3px solid #22c55e" : "3px solid rgba(255,255,255,.15)",
          }}>
            {initials}
          </div>
        </div>
      )}

      {/* Bottom bar: name + mic */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "20px 8px 6px",
        background: "linear-gradient(transparent, rgba(0,0,0,.75))",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 4,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 600, color: "#fff",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          flex: 1,
        }}>
          {name}{isLocal ? " (You)" : ""}
        </span>
        {/* Mic icon — tappable only for local participant */}
        <button
          onClick={isLocal ? toggleMyMic : undefined}
          style={{
            width: 26, height: 26,
            borderRadius: "50%",
            background: micEnabled ? "rgba(34,197,94,.25)" : "rgba(239,68,68,.3)",
            border: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: isLocal ? "pointer" : "default",
            flexShrink: 0,
            backdropFilter: "blur(4px)",
          }}
        >
          {micEnabled
            ? <Mic    style={{ width: 13, height: 13, color: "#22c55e" }}/>
            : <MicOff style={{ width: 13, height: 13, color: "#ef4444" }}/>}
        </button>
      </div>

      {/* Speaking indicator */}
      {isSpeaking && (
        <div style={{
          position: "absolute", top: 6, left: 6,
          background: "rgba(34,197,94,.9)", borderRadius: 10,
          padding: "2px 7px", fontSize: 9, color: "#fff", fontWeight: 700,
        }}>
          ● Speaking
        </div>
      )}
    </div>
  );
};

const VideoGrid = () => {
  const { localParticipant } = useLocalParticipant();
  const allParticipants = useParticipants();
  // Put local first, then remotes
  const remotes = allParticipants.filter(p => p.identity !== localParticipant?.identity);
  const all = localParticipant ? [localParticipant, ...remotes] : remotes;
  const n = all.length;

  // Check for screenshare
  const screensharer = all.find(p => {
    const pub = p.getTrackPublication?.(Track.Source.ScreenShare)
             || p.trackPublications?.get(Track.Source.ScreenShare);
    return pub?.track && !pub.isMuted;
  });

  // ── Layout calculation ──────────────────────────────
  // Always fit ALL tiles on screen with no scroll
  let cols = 1, rows = 1;
  if (n === 1) { cols = 1; rows = 1; }
  else if (n === 2) { cols = 2; rows = 1; }
  else if (n <= 4) { cols = 2; rows = 2; }
  else if (n <= 6) { cols = 3; rows = 2; }
  else if (n <= 9) { cols = 3; rows = 3; }
  else { cols = 4; rows = Math.ceil(n / 4); }

  const gap = 4;

  // Screenshare layout
  if (screensharer) {
    const tracks = [{source:Track.Source.ScreenShare,withPlaceholder:false}];
    return (
      <div style={{ width:"100%", height:"100%", display:"flex", gap, padding:gap, boxSizing:"border-box" }}>
        {/* Main screen */}
        <div style={{ flex:1, borderRadius:12, overflow:"hidden", background:"#111", minWidth:0 }}>
          <ParticipantTileCustom participant={screensharer} isLocal={screensharer.identity === localParticipant?.identity}/>
        </div>
        {/* Side strip */}
        <div style={{ width:120, display:"flex", flexDirection:"column", gap, overflowY:"auto" }}>
          {all.map(p => (
            <div key={p.identity} style={{ height:90, flexShrink:0 }}>
              <ParticipantTileCustom participant={p} isLocal={p.identity === localParticipant?.identity}/>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: "100%", height: "100%",
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
      gap,
      padding: gap,
      boxSizing: "border-box",
    }}>
      {all.map(p => (
        <ParticipantTileCustom
          key={p.identity}
          participant={p}
          isLocal={p.identity === localParticipant?.identity}
        />
      ))}
    </div>
  );
};

/* ══════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════ */
const ClassroomView = ({ subject, onLeave, onMinimize }: ClassroomViewProps) => {
  const { user, hasRole } = useAuth();
  const { t }             = useLanguage();
  const isMobile          = useIsMobile();
  const isPrivileged      = hasRole("admin") || hasRole("teacher");

  const [phase,    setPhase]    = useState<"lobby"|"live"|"ended">("lobby");
  const [token,    setToken]    = useState<string|null>(null);
  const [wsUrl,    setWsUrl]    = useState<string|null>(null);
  const [error,    setError]    = useState<string|null>(null);
  const [loading,  setLoading]  = useState(false);
  const [sessionId,setSessionId]= useState<string|null>(null);
  const [sessionInfo,setSessionInfo] = useState<any>(null);
  const [attendanceId,setAttendanceId] = useState<string|null>(null);
  const [joinedAt] = useState(Date.now());
  const [savingRec,setSavingRec] = useState(false);
  const [isSessionLive,setIsSessionLive] = useState(false);
  const [duration, setDuration] = useState(0);

  const [chatOpen,  setChatOpen]  = useState(false);
  const [partOpen,  setPartOpen]  = useState(false);
  const [chatUnread,setChatUnread]= useState(0);
  const [sideTab,   setSideTab]   = useState<"chat"|"polls">("chat");
  const [showQuiz,  setShowQuiz]  = useState(false);
  const [showEnd,   setShowEnd]   = useState(false);
  const [wbOpen,    setWbOpen]    = useState(false);
  const [matOpen,   setMatOpen]   = useState<any>(null); // shared material
  const [matPicker, setMatPicker] = useState(false);
  const [groupRecite,    setGroupRecite]     = useState(false);
  const [canStudentWrite, setCanStudentWrite] = useState(false); // admin toggles
  const [canStudentRec,   setCanStudentRec]   = useState(false); // admin toggles
  const wbBuffer = useRef<any[]|null>(null);
  const prefetch = useRef<{token:string;url:string}|null>(null);

  useEffect(() => {
    supabase.functions.invoke("livekit-token",{ body:{ subject_id:subject.id, action:isPrivileged?"start_session":"join" } })
      .then(({data})=>{ if(data?.token&&data?.url) prefetch.current={token:data.token,url:data.url}; }).catch(()=>{});
  }, [subject.id, isPrivileged]);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.from("live_sessions").select("*").eq("subject_id",subject.id).eq("status","live").maybeSingle();
      if (data) { setSessionInfo(data); setSessionId(data.id); setIsSessionLive(true); } else setIsSessionLive(false);
    };
    check(); const iv=setInterval(check,4000); return ()=>clearInterval(iv);
  }, [subject.id]);

  useEffect(() => { if(phase!=="live") return; const t=setInterval(()=>setDuration(d=>d+1),1000); return()=>clearInterval(t); }, [phase]);

  // Resume camera/mic when user returns to the tab/app after minimizing
  useEffect(() => {
    if (phase !== "live") return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        // Small delay lets WebRTC renegotiate after backgrounding
        setTimeout(() => {
          try {
            const lp = (window as any).__livekitRoom?.localParticipant;
            if (lp && lp.isCameraEnabled !== undefined) {
              lp.setCameraEnabled(lp.isCameraEnabled);
              lp.setMicrophoneEnabled(lp.isMicrophoneEnabled);
            }
          } catch { /* silent */ }
        }, 400);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [phase]);

  const connect = async (action:string, settings?:any) => {
    setLoading(true); setError(null);
    try {
      let tk=prefetch.current?.token||null, url=prefetch.current?.url||null;
      if (!tk||!url) {
        const { data,error:e } = await supabase.functions.invoke("livekit-token",{ body:{ subject_id:subject.id, action } });
        if (e) throw e; if (data?.error) throw new Error(data.error);
        tk=data.token; url=data.url;
      }
      if (settings&&sessionId) await supabase.from("live_sessions").update({ ...settings, actual_start_time:new Date().toISOString(), status:"live" }).eq("id",sessionId);
      setToken(tk!); setWsUrl(url!);
      const { data:sessions } = await supabase.from("live_sessions").select("*").eq("subject_id",subject.id).in("status",["live","active","scheduled"]).order("scheduled_at",{ascending:false,nullsFirst:false}).limit(1);
      if (sessions?.length) {
        setSessionId(sessions[0].id); setSessionInfo(sessions[0]);
        const { data:att } = await supabase.from("attendance_logs").insert({ session_id:sessions[0].id, user_id:user!.id, device_info:navigator.userAgent }).select("id").single();
        if (att) setAttendanceId(att.id);
        await supabase.from("class_participants").upsert(
          { session_id:sessions[0].id, student_id:user!.id, joined_at:new Date().toISOString(),
            is_muted:!isPrivileged, camera_on:true, left_at:null, left_minutes:null },
          { onConflict:"session_id,student_id" }
        );
      }
      setPhase("live");
    } catch(e:any) { setError(e?.message||"Failed to connect"); } finally { setLoading(false); }
  };

  useEffect(()=>()=>{ if(attendanceId){const d=Math.floor((Date.now()-joinedAt)/1000);supabase.from("attendance_logs").update({left_at:new Date().toISOString(),duration_seconds:d}).eq("id",attendanceId);} if(sessionId&&user)supabase.from("class_participants").update({left_at:new Date().toISOString(),duration_minutes:Math.floor((Date.now()-joinedAt)/60000)}).eq("session_id",sessionId).eq("student_id",user.id); },[attendanceId,joinedAt,sessionId,user]);

  const endSession = async () => {
    setShowEnd(false);
    if (sessionId) { await supabase.from("live_sessions").update({ status:"ended", ended_at:new Date().toISOString(), actual_end_time:new Date().toISOString() }).eq("id",sessionId); if(user) await supabase.from("class_chat_messages").insert({ session_id:sessionId, sender_id:user.id, message:t("Class has ended","انتهت الحصة"), type:"system" }); }
    setPhase("ended");
  };

  const leaveSession = () => {
    if(attendanceId){const d=Math.floor((Date.now()-joinedAt)/1000);supabase.from("attendance_logs").update({left_at:new Date().toISOString(),duration_seconds:d}).eq("id",attendanceId);}
    if(sessionId&&user)supabase.from("class_participants").update({left_at:new Date().toISOString(),duration_minutes:Math.floor((Date.now()-joinedAt)/60000)}).eq("session_id",sessionId).eq("student_id",user.id);
    onLeave();
  };

  const handlePermChange = (type:"write"|"rec", allow:boolean, room:any) => {
    if (type === "write") {
      setCanStudentWrite(allow);
      try { room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({ type:"wb_allow_write", allow })), { reliable:true }); } catch {}
      toast({ title: allow ? "✅ Students can now write on the board" : "🔒 Student write access revoked" });
    } else {
      setCanStudentRec(allow);
      try { room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({ type:"rec_allowed", allow })), { reliable:true }); } catch {}
      toast({ title: allow ? "✅ Students can now record" : "🔒 Student record permission revoked" });
    }
  };

  const handleGroupRecite = async () => {
    const n=!groupRecite; setGroupRecite(n);
    toast({ title:n?"Group Recitation ON":"Group Recitation OFF" });
    if(sessionId&&user) await supabase.from("class_chat_messages").insert({ session_id:sessionId, sender_id:user.id, message:n?"🎙️ Group Recitation Mode":"🔇 Recitation ended", type:"system" });
  };

  const shareMaterial = (mat:any, room?:any) => {
    setMatOpen(mat);
    try { room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({ type:"mat_open", material:mat })),{ reliable:true }); } catch {}
  };
  const closeMaterial = (room?:any) => {
    setMatOpen(null);
    if (isPrivileged) { try { room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({ type:"mat_close" })),{ reliable:true }); } catch {} }
  };

  const fmtT = (s:number) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  if (phase==="ended") return <ClassEndScreen subject={subject} session={sessionInfo} duration={duration} participantCount={0} onGoToDashboard={onLeave} onGoToRevision={()=>{ window.location.href=`/student/revision/${subject.id}`; }}/>;
  if (phase==="lobby"&&!loading&&!error) return <ClassLobby subject={subject} session={sessionInfo} onStartClass={(s:any)=>connect("start_session",s)} onJoinClass={()=>connect("join")} onBack={onLeave} isLive={isSessionLive}/>;
  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"#0d1117" }}>
      <style>{CSS}</style>
      <div style={{ textAlign:"center" }}>
        <div style={{ width:52, height:52, border:`4px solid ${G}`, borderTopColor:"transparent", borderRadius:"50%", animation:"cv-spin .8s linear infinite", margin:"0 auto 16px" }}/>
        <p style={{ color:"#666", fontSize:14 }}>{t("Connecting…","جاري الاتصال…")}</p>
      </div>
    </div>
  );
  if (error) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"#0d1117" }}>
      <style>{CSS}</style>
      <div style={{ textAlign:"center", maxWidth:340, padding:24 }}>
        <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(239,68,68,.15)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}><X style={{ width:28, height:28, color:"#EF4444" }}/></div>
        <h2 style={{ fontSize:20, fontWeight:700, color:"#fff", marginBottom:8 }}>Connection Failed</h2>
        <p style={{ color:"#666", fontSize:14, marginBottom:20 }}>{error}</p>
        <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
          <button onClick={()=>{setError(null);setPhase("lobby");}} style={{ padding:"10px 20px", borderRadius:10, background:G, border:"none", color:"#fff", fontSize:14, cursor:"pointer" }}>Try Again</button>
          <button onClick={onLeave} style={{ padding:"10px 20px", borderRadius:10, background:"rgba(255,255,255,.1)", border:"none", color:"#fff", fontSize:14, cursor:"pointer" }}>Go Back</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", background:"#0d1117", overflow:"hidden" }}>
      <style>{CSS}</style>

      {token && wsUrl && (
        <LiveKitRoom
          serverUrl={wsUrl} token={token} connect={true}
          options={{ adaptiveStream:{pixelDensity:"screen"}, dynacast:true, disconnectOnPageLeave:true, audioCaptureDefaults:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,sampleRate:48000,channelCount:1}, publishDefaults:{audioPreset:{maxBitrate:32000},dtx:true,red:false,stopMicTrackOnMute:false,videoEncoding:{maxBitrate:700_000,maxFramerate:20},backupCodec:true}, videoCaptureDefaults:{resolution:{width:640,height:480,frameRate:20},facingMode:"user"} }}
          style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0 }}
          data-lk-theme="default"
        >
          <RoomAudioRenderer/>
          <RoomDataListener
            onWbOpen={()=>setWbOpen(true)}
            onWbClose={()=>setWbOpen(false)}
            strokesBuffer={wbBuffer}
            onMatOpen={(mat)=>setMatOpen(mat)}
            onMatClose={()=>setMatOpen(null)}
            onWbAllowWrite={(allow)=>setCanStudentWrite(allow)}
            onRecAllowed={(allow)=>setCanStudentRec(allow)}
          />

          {/* Top bar */}
          <div style={{ height:46, background:"rgba(0,0,0,.75)", backdropFilter:"blur(12px)", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 14px", flexShrink:0, borderBottom:"1px solid rgba(255,255,255,.06)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(34,197,94,.15)", borderRadius:20, padding:"4px 12px", border:"1px solid rgba(34,197,94,.3)" }}>
                <Circle style={{ width:7, height:7, fill:"#22c55e", color:"#22c55e" }}/>
                <span style={{ fontSize:12, color:"#fff", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight:600 }}>{subject.title}</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(239,68,68,.15)", borderRadius:20, padding:"4px 10px", border:"1px solid rgba(239,68,68,.3)" }}>
                <Circle style={{ width:6, height:6, fill:"#EF4444", color:"#EF4444" }}/>
                <span style={{ fontSize:11, color:"#fca5a5", fontWeight:700 }}>{fmtT(duration)}</span>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              {isPrivileged && <RecController sessionId={sessionId} subjectId={subject.id} userEmail={user?.email||""} onSavingChange={setSavingRec}/>}
              {/* Minimize — Google Meet style */}
              {onMinimize && (
                <button
                  onClick={onMinimize}
                  title="Minimize"
                  style={{ width:30, height:30, borderRadius:8, background:"rgba(255,255,255,.1)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"rgba(255,255,255,.7)" }}>
                  <ArrowLeft style={{ width:14, height:14, transform:"rotate(-90deg)" }}/>
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div style={{ flex:1, display:"flex", minHeight:0, overflow:"hidden" }}>
            <div style={{ flex:1, position:"relative", minWidth:0 }}>
              <VideoGrid/>
            </div>
            {chatOpen && !isMobile && (
              <div style={{ width:300, background:"rgba(0,0,0,.8)", borderLeft:"1px solid rgba(255,255,255,.08)", display:"flex", flexDirection:"column", flexShrink:0 }}>
                <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,.08)" }}>
                  {[["chat","💬","Chat"],["polls","📊","Polls"]].map(([k,ic,lb])=>(
                    <button key={k} onClick={()=>{setSideTab(k as any);if(k==="chat")setChatUnread(0);}} style={{ flex:1, padding:"10px 4px", background:"none", border:"none", color:sideTab===k?"#fff":"rgba(255,255,255,.4)", fontSize:12, fontWeight:sideTab===k?700:400, borderBottom:sideTab===k?`2px solid ${G}`:"2px solid transparent", cursor:"pointer" }}>
                      {ic} {lb}
                    </button>
                  ))}
                </div>
                <div style={{ flex:1, overflow:"hidden" }}>{sideTab==="chat"?<ClassChatPanel sessionId={sessionId||""}/>:<ClassPolls sessionId={sessionId||""}/>}</div>
              </div>
            )}
          </div>

          {/* Whiteboard — rendered inside LiveKit context so it can use useRoomContext() */}
          {wbOpen && (
            <WhiteboardBridge
              onClose={()=>{ setWbOpen(false); }}
              isTeacher={isPrivileged}
              initialStrokes={wbBuffer.current}
              subjectId={subject.id}
              canStudentWrite={canStudentWrite}
            />
          )}

          <BottomBarBridge
            sessionId={sessionId||""}
            onToggleChat={()=>{setChatOpen(v=>!v);if(!chatOpen)setChatUnread(0);}}
            onToggleParticipants={()=>setPartOpen(v=>!v)}
            onEndClass={()=>setShowEnd(true)}
            onLeaveClass={leaveSession}
            chatUnread={chatUnread}
            onToggleWhiteboard={()=>setWbOpen(v=>!v)}
            whiteboardOpen={wbOpen}
            onGroupRecite={handleGroupRecite}
            groupReciteMode={groupRecite}
            onShareMaterial={()=>setMatPicker(true)}
            isPrivileged={isPrivileged}
            canStudentRec={canStudentRec}
            canStudentWriteProp={canStudentWrite}
            canStudentRecProp={canStudentRec}
            onPermChange={handlePermChange}
            onMinimize={onMinimize}
          />

          {isMobile && chatOpen && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:40 }} onClick={()=>setChatOpen(false)}>
              <div style={{ position:"absolute", bottom:BAR_H, left:0, right:0, background:"#111", borderRadius:"20px 20px 0 0", maxHeight:"65vh", display:"flex", flexDirection:"column" }} onClick={e=>e.stopPropagation()}>
                <div style={{ width:40, height:4, borderRadius:2, background:"rgba(255,255,255,.2)", margin:"10px auto 4px" }}/>
                <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,.1)" }}>
                  {[["chat","💬","Chat"],["polls","📊","Polls"]].map(([k,ic,lb])=>(
                    <button key={k} onClick={()=>setSideTab(k as any)} style={{ flex:1, padding:"9px", background:"none", border:"none", color:sideTab===k?"#fff":"rgba(255,255,255,.4)", fontSize:12, fontWeight:sideTab===k?700:400, borderBottom:sideTab===k?`2px solid ${G}`:"2px solid transparent", cursor:"pointer" }}>
                      {ic} {lb}
                    </button>
                  ))}
                </div>
                <div style={{ flex:1, overflow:"hidden", minHeight:300 }}>{sideTab==="chat"?<ClassChatPanel sessionId={sessionId||""}/>:<ClassPolls sessionId={sessionId||""}/>}</div>
              </div>
            </div>
          )}
          {isMobile && partOpen && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:40 }} onClick={()=>setPartOpen(false)}>
              <div style={{ position:"absolute", bottom:BAR_H, left:0, right:0, background:"#111", borderRadius:"20px 20px 0 0", maxHeight:"60vh", overflow:"auto" }} onClick={e=>e.stopPropagation()}>
                <div style={{ width:40, height:4, borderRadius:2, background:"rgba(255,255,255,.2)", margin:"10px auto 6px" }}/>
                <ClassParticipants sessionId={sessionId||""}/>
              </div>
            </div>
          )}

          <LiveQuizOverlay sessionId={sessionId||""} isOpen={showQuiz} onClose={()=>setShowQuiz(false)}/>
        </LiveKitRoom>
      )}

      {/* Material picker portal */}
      {matPicker && (
        <MaterialShareBridge
          subjectId={subject.id}
          onShare={(mat,room)=>{ setMatOpen(mat); setMatPicker(false); try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"mat_open",material:mat})),{reliable:true});}catch{} }}
          onClose={()=>setMatPicker(false)}
        />
      )}

      {/* Shared material viewer portal */}
      {matOpen && (
        <MaterialViewerBridge
          material={matOpen}
          isTeacher={isPrivileged}
          onClose={(room?:any)=>{ setMatOpen(null); if(isPrivileged){try{room?.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({type:"mat_close"})),{reliable:true});}catch{}} }}
        />
      )}

      <Dialog open={showEnd} onOpenChange={setShowEnd}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("End class for everyone?","إنهاء الحصة للجميع؟")}</DialogTitle></DialogHeader>
          <p style={{ fontSize:13, color:"#666" }}>{t("This will disconnect all participants.","سيتم قطع الاتصال عن جميع المشاركين.")}</p>
          <DialogFooter style={{ display:"flex", gap:8 }}>
            <Button variant="outline" onClick={()=>setShowEnd(false)}>{t("Cancel","إلغاء")}</Button>
            <Button variant="outline" onClick={()=>{setShowEnd(false);leaveSession();}}>{t("Leave but Keep Open","غادر لكن أبقِ الحصة")}</Button>
            <Button variant="destructive" onClick={endSession}>{t("End for All","إنهاء للجميع")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ── Bridge components that use room context ── */
const BottomBarBridge = (props:any) => {
  const room = useRoomContext();
  const handlePermChange = (type:"write"|"rec", allow:boolean) => {
    props.onPermChange?.(type, allow, room);
  };
  return <BottomBar {...props} room={room} onPermChange={handlePermChange} onMinimize={props.onMinimize}/>;
};

const MaterialShareBridge = ({ subjectId, onShare, onClose }:any) => {
  const room = useRoomContext();
  return <MaterialPicker subjectId={subjectId} onShare={(mat:any)=>onShare(mat,room)} onClose={onClose}/>;
};

const MaterialViewerBridge = ({ material, isTeacher, onClose }:any) => {
  const room = useRoomContext();
  return <MaterialViewer material={material} isTeacher={isTeacher} onClose={()=>onClose(room)}/>;
};

export default ClassroomView;
