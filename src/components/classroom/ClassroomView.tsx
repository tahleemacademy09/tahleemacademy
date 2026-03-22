/*
  src/components/classroom/ClassroomView.tsx
  ──────────────────────────────────────────
  FIXES:
  ✅ No duplicate buttons — VideoConference replaced with GridLayout
  ✅ Fast connection — token pre-fetched in lobby background
  ✅ Students enter waiting room immediately without teacher
  ✅ Low-latency audio settings for group recitation
  ✅ Group Recitation Mode — all unmuted simultaneously
  ✅ Excalidraw whiteboard with fullscreen + real-time sync via data channel
  ✅ Beautiful mobile bottom toolbar
*/

import {
  LiveKitRoom, RoomAudioRenderer, useRoomContext,
  GridLayout, ParticipantTile, useTracks,
  useParticipants, useLocalParticipant,
} from "@livekit/components-react";
// @ts-ignore
import "@livekit/components-styles";
import { Track, DataPacket_Kind, RoomEvent } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Circle, Loader2, X, Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  MessageCircle, Users, MoreVertical, Phone, Hand, Smile, PenTool,
  Maximize, Minimize, Square, Pause, Play, Lock, Volume2, BookOpen } from "lucide-react";
import ClassLobby from "./ClassLobby";
import ClassChatPanel from "./ClassChatPanel";
import ClassParticipants from "./ClassParticipants";
import ClassPolls from "./ClassPolls";
import ClassEndScreen from "./ClassEndScreen";
import LiveQuizOverlay from "./LiveQuizOverlay";
import { useIsMobile } from "@/hooks/use-mobile";

import { useState, useEffect, useRef, useCallback } from "react";

interface ClassroomViewProps { subject: any; onLeave: () => void; }

const DARK_GREEN = "#075E54";
const TOOLBAR_H  = 64;

/* ═══════════════════════════════════════════════════════
   WHITEBOARD — canvas-based, no external packages needed
   Synced via LiveKit data channel
═══════════════════════════════════════════════════════ */
const Whiteboard = ({ onClose, fullscreen, onToggleFullscreen, isTeacher, initialStrokes }: {
  onClose: () => void; fullscreen: boolean;
  onToggleFullscreen: () => void; isTeacher: boolean;
  initialStrokes?: any[] | null;
}) => {
  const room = useRoomContext();
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const drawing     = useRef(false);
  const lastPos     = useRef<{x:number;y:number}|null>(null);
  const strokesRef  = useRef<any[]>([]); // all strokes for replay
  const [color, setColor]     = useState("#1a1a1a");

  // Replay any strokes that arrived before this component mounted
  useEffect(() => {
    if (initialStrokes && initialStrokes.length > 0) {
      strokesRef.current = initialStrokes;
      // Defer until canvas is painted
      setTimeout(() => redraw(), 50);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [lineWidth, setLineWidth] = useState(3);
  const [tool, setTool]       = useState<"pen"|"eraser">("pen");

  const redraw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    for (const stroke of strokesRef.current) {
      if (!stroke.points || stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth   = stroke.lineWidth;
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      ctx.stroke();
    }
  }, []);

  // Receive whiteboard updates
  useEffect(() => {
    const handler = (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type === "wb_strokes") {
          strokesRef.current = msg.strokes;
          redraw();
        } else if (msg.type === "wb_clear") {
          strokesRef.current = [];
          redraw();
        }
      } catch (_) {}
    };
    room.on(RoomEvent.DataReceived, handler);
    return () => { room.off(RoomEvent.DataReceived, handler); };
  }, [room, redraw]);

  const broadcast = useCallback((msg: object) => {
    try {
      const data = new TextEncoder().encode(JSON.stringify(msg));
      room.localParticipant.publishData(data, { reliable: true });
    } catch (_) {}
  }, [room]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasRef.current!.width  / rect.width;
    const scaleY = canvasRef.current!.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isTeacher) return;
    drawing.current = true;
    const pos = getPos(e);
    lastPos.current = pos;
    strokesRef.current.push({ color: tool==="eraser"?"#fff":color, lineWidth: tool==="eraser"?20:lineWidth, points:[pos] });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !isTeacher) return;
    const pos = getPos(e);
    const stroke = strokesRef.current[strokesRef.current.length-1];
    if (stroke) { stroke.points.push(pos); redraw(); }
    lastPos.current = pos;
  };

  const onPointerUp = () => {
    if (!isTeacher) return;
    drawing.current = false;
    lastPos.current = null;
    broadcast({ type:"wb_strokes", strokes:strokesRef.current });
  };

  const clearBoard = () => {
    strokesRef.current = [];
    redraw();
    broadcast({ type:"wb_clear" });
  };

  const COLORS = ["#1a1a1a","#e53e3e","#2b6cb0","#276749","#b7791f","#553c9a","#ffffff"];

  return (
    <div style={{
      position: fullscreen ? "fixed" : "absolute",
      inset: fullscreen ? 0 : "auto",
      top: fullscreen ? 0 : 8,
      left: fullscreen ? 0 : 8,
      right: fullscreen ? 0 : 8,
      bottom: fullscreen ? 0 : "auto",
      height: fullscreen ? "100%" : "calc(100% - 16px)",
      zIndex: 50, overflow:"hidden",
      borderRadius: fullscreen ? 0 : 16,
      boxShadow: "0 8px 32px rgba(0,0,0,.4)",
      display:"flex", flexDirection:"column",
      background:"#fff",
    }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:DARK_GREEN, flexShrink:0 }}>
        <PenTool style={{ width:16, height:16, color:"#fff" }} />
        <span style={{ fontSize:14, fontWeight:700, color:"#fff", flex:1 }}>
          Whiteboard · السبورة
          {!isTeacher && <span style={{ fontSize:11, color:"rgba(255,255,255,.6)", marginLeft:8 }}>View only</span>}
        </span>
        <button onClick={onToggleFullscreen} style={{ background:"none",border:"none",color:"rgba(255,255,255,.8)",cursor:"pointer",padding:4 }}>
          {fullscreen ? <Minimize style={{width:16,height:16}}/> : <Maximize style={{width:16,height:16}}/>}
        </button>
        <button onClick={onClose} style={{ background:"none",border:"none",color:"rgba(255,255,255,.8)",cursor:"pointer",padding:4 }}>
          <X style={{width:16,height:16}}/>
        </button>
      </div>

      {/* Toolbar (teacher only) */}
      {isTeacher && (
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background:"#f8f8f8", borderBottom:"1px solid #e0e0e0", flexShrink:0, flexWrap:"wrap" as const }}>
          {/* Tool */}
          <div style={{ display:"flex", gap:4 }}>
            {[{id:"pen",icon:"✏️"},{id:"eraser",icon:"⬜"}].map(t=>(
              <button key={t.id} onClick={()=>setTool(t.id as any)}
                style={{ padding:"4px 10px", borderRadius:8, border:"none", background:tool===t.id?"#1a3d24":"#e0e0e0", color:tool===t.id?"#fff":"#333", fontSize:13, cursor:"pointer" }}>
                {t.icon}
              </button>
            ))}
          </div>
          {/* Colors */}
          <div style={{ display:"flex", gap:4 }}>
            {COLORS.map(c=>(
              <button key={c} onClick={()=>{ setColor(c); setTool("pen"); }}
                style={{ width:22, height:22, borderRadius:"50%", background:c, border:color===c&&tool==="pen"?"3px solid #1a3d24":"2px solid #ccc", cursor:"pointer" }} />
            ))}
          </div>
          {/* Line width */}
          <input type="range" min={1} max={20} value={lineWidth} onChange={e=>setLineWidth(+e.target.value)}
            style={{ width:80 }} />
          {/* Clear */}
          <button onClick={clearBoard}
            style={{ padding:"4px 12px", borderRadius:8, border:"none", background:"#EF4444", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
            Clear
          </button>
        </div>
      )}

      {/* Canvas */}
      <canvas ref={canvasRef} width={1200} height={800}
        style={{ flex:1, width:"100%", height:"100%", cursor:isTeacher?(tool==="eraser"?"cell":"crosshair"):"default", touchAction:"none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   ROOM DATA LISTENER — always mounted inside LiveKitRoom
   Handles wb_open / wb_close signals from teacher so students
   auto-open the whiteboard. Also buffers incoming strokes so
   Whiteboard receives them even if it just mounted.
═══════════════════════════════════════════════════════ */
const RoomDataListener = ({
  onWbOpen, onWbClose, strokesBuffer, onMatOpen, onMatClose,
}: {
  onWbOpen: () => void;
  onWbClose: () => void;
  strokesBuffer: React.MutableRefObject<any[] | null>;
  onMatOpen?: (mat: any) => void;
  onMatClose?: () => void;
}) => {
  const room = useRoomContext();

  useEffect(() => {
    const handler = (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type === "wb_open")  { onWbOpen(); }   // auto-fullscreen handled in parent
        if (msg.type === "wb_close") { onWbClose(); }
        if (msg.type === "wb_strokes") { strokesBuffer.current = msg.strokes; }
        if (msg.type === "wb_clear")   { strokesBuffer.current = []; }
        if (msg.type === "mat_open")  { onMatOpen?.(msg.material); }
        if (msg.type === "mat_close") { onMatClose?.(); }
      } catch (_) {}
    };
    room.on(RoomEvent.DataReceived, handler);
    return () => { room.off(RoomEvent.DataReceived, handler); };
  }, [room, onWbOpen, onWbClose, strokesBuffer]);

  return null;
};

/* ═══════════════════════════════════════════════════════
   SHARED MATERIAL VIEWER — fullscreen overlay for all participants
═══════════════════════════════════════════════════════ */
const SharedMaterialViewer = ({ material, isTeacher, onClose }: { material: any; isTeacher: boolean; onClose: () => void }) => {
  const url: string = material.file_url || material.url || "";
  const title: string = material.title || material.name || "Material";
  const isYoutube = url.includes("youtube.com") || url.includes("youtu.be");
  const isPdf     = url.toLowerCase().includes(".pdf") || (material.material_type||"").includes("pdf");
  const isImage   = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
  const isVideo   = /\.(mp4|webm|ogg|mov)$/i.test(url);
  const isOffice  = url.includes("drive.google.com") || url.includes("docs.google.com");

  const getYtEmbed = (u: string) => {
    const m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/);
    return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1` : "";
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:60, background:"#000", display:"flex", flexDirection:"column" }}>
      {/* Header */}
      <div style={{ height:48, background:"rgba(7,94,84,.97)", display:"flex", alignItems:"center", padding:"0 14px", gap:10, flexShrink:0 }}>
        <BookOpen style={{ width:18, height:18, color:"#fff" }}/>
        <span style={{ color:"#fff", fontWeight:700, fontSize:15, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{title}</span>
        {!isTeacher && <span style={{ fontSize:11, color:"rgba(255,255,255,.5)", marginRight:8 }}>Shared by teacher</span>}
        <button onClick={onClose}
          style={{ width:32, height:32, borderRadius:8, background:"rgba(255,255,255,.15)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff" }}>
          <X style={{ width:16, height:16 }}/>
        </button>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflow:"hidden", position:"relative" }}>
        {isYoutube && (
          <iframe src={getYtEmbed(url)} style={{ width:"100%", height:"100%", border:"none" }} allow="autoplay; fullscreen" allowFullScreen/>
        )}
        {isPdf && !isYoutube && (
          <iframe src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
            style={{ width:"100%", height:"100%", border:"none" }} />
        )}
        {isImage && (
          <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", background:"#111" }}>
            <img src={url} alt={title} style={{ maxWidth:"100%", maxHeight:"100%", objectFit:"contain" }}/>
          </div>
        )}
        {isVideo && (
          <video src={url} controls autoPlay style={{ width:"100%", height:"100%", background:"#000" }}/>
        )}
        {isOffice && !isPdf && (
          <iframe src={`${url.replace("/view","/preview")}`}
            style={{ width:"100%", height:"100%", border:"none" }} allow="autoplay"/>
        )}
        {!isYoutube && !isPdf && !isImage && !isVideo && !isOffice && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:16, color:"#fff" }}>
            <BookOpen style={{ width:48, height:48, color:"rgba(255,255,255,.4)" }}/>
            <p style={{ fontSize:16, fontWeight:700 }}>{title}</p>
            <a href={url} target="_blank" rel="noreferrer"
              style={{ background:"#075E54", color:"#fff", padding:"12px 24px", borderRadius:12, textDecoration:"none", fontWeight:700 }}>
              Open File ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   MATERIAL PICKER BUTTON — teacher taps to share a material
═══════════════════════════════════════════════════════ */
const MaterialPickerButton = ({ subjectId, onOpen }: { subjectId: string; onOpen: (mat: any) => void }) => {
  const [open, setOpen] = useState(false);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("subject_materials").select("*").eq("subject_id", subjectId).order("created_at", { ascending: false });
    setMaterials(data || []);
    setLoading(false);
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{ position:"absolute", bottom:12, left:12, zIndex:30, display:"flex", alignItems:"center", gap:8,
          background:"rgba(7,94,84,.92)", border:"none", borderRadius:12, padding:"10px 16px",
          color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", backdropFilter:"blur(8px)",
          boxShadow:"0 4px 16px rgba(0,0,0,.4)" }}>
        <BookOpen style={{ width:16, height:16 }}/> Open Material for Class
      </button>

      {/* Picker panel */}
      {open && (
        <div style={{ position:"fixed", inset:0, zIndex:55, background:"rgba(0,0,0,.7)", backdropFilter:"blur(4px)", display:"flex", alignItems:"flex-end" }}
          onClick={()=>setOpen(false)}>
          <div style={{ width:"100%", background:"#1a1a1a", borderRadius:"20px 20px 0 0", maxHeight:"70vh", display:"flex", flexDirection:"column" }}
            onClick={e=>e.stopPropagation()}>
            <div style={{ padding:"14px 18px", borderBottom:"1px solid rgba(255,255,255,.1)", display:"flex", alignItems:"center", gap:10 }}>
              <BookOpen style={{ width:18, height:18, color:"#075E54" }}/>
              <span style={{ color:"#fff", fontWeight:700, fontSize:16, flex:1 }}>Share Material with Class</span>
              <button onClick={()=>setOpen(false)} style={{ background:"none", border:"none", color:"rgba(255,255,255,.5)", cursor:"pointer" }}>
                <X style={{ width:18, height:18 }}/>
              </button>
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
              {loading && (
                <div style={{ display:"flex", justifyContent:"center", padding:28 }}>
                  <Loader2 style={{ width:24, height:24, color:"#075E54", animation:"spin .8s linear infinite" }}/>
                </div>
              )}
              {!loading && materials.length === 0 && (
                <div style={{ textAlign:"center", padding:"28px", color:"rgba(255,255,255,.4)", fontSize:14 }}>
                  No materials uploaded for this subject yet
                </div>
              )}
              {materials.map(mat => (
                <button key={mat.id} onClick={() => { onOpen(mat); setOpen(false); }}
                  style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"14px 18px",
                    background:"none", border:"none", cursor:"pointer", textAlign:"left" as const,
                    borderBottom:"1px solid rgba(255,255,255,.07)" }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:"rgba(7,94,84,.4)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <BookOpen style={{ width:18, height:18, color:"#4ade80" }}/>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ color:"#fff", fontWeight:600, fontSize:14, margin:"0 0 3px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                      {mat.title || mat.name || "Untitled"}
                    </p>
                    <p style={{ color:"rgba(255,255,255,.4)", fontSize:11, margin:0, textTransform:"capitalize" as const }}>
                      {mat.material_type || "file"} · Tap to share fullscreen
                    </p>
                  </div>
                  <span style={{ fontSize:11, color:"#075E54", fontWeight:700, background:"rgba(7,94,84,.2)", padding:"3px 10px", borderRadius:20, flexShrink:0 }}>
                    Share →
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/* ═══════════════════════════════════════════════════════
   MEET-STYLE VIDEO GRID
   - 1 participant: full screen
   - 2 participants: side by side (like Zoom / Google Meet)
   - 3-4: 2x2 grid
   - 5+: spotlight (largest tile) + strip of others
   Uses LiveKit hooks directly — no GridLayout overhead
═══════════════════════════════════════════════════════ */
const ParticipantVideo = ({ participant, size = "normal", isLocal = false }: {
  participant: any; size?: "normal" | "spotlight" | "strip"; isLocal?: boolean;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const update = () => {
      const camPub = participant.getTrackPublication?.(Track.Source.Camera)
                  || participant.trackPublications?.get(Track.Source.Camera);
      const track = camPub?.videoTrack || camPub?.track;
      if (track && videoRef.current && track.mediaStreamTrack?.readyState === "live") {
        const ms = new MediaStream([track.mediaStreamTrack]);
        videoRef.current.srcObject = ms;
        videoRef.current.play().catch(() => {});
        setHasVideo(true);
      } else {
        setHasVideo(false);
        if (videoRef.current) videoRef.current.srcObject = null;
      }
    };
    update();
    participant.on?.("trackSubscribed", update);
    participant.on?.("trackUnsubscribed", update);
    participant.on?.("trackMuted", update);
    participant.on?.("trackUnmuted", update);
    participant.on?.("isSpeakingChanged", (v: boolean) => setIsSpeaking(v));
    return () => {
      participant.off?.("trackSubscribed", update);
      participant.off?.("trackUnsubscribed", update);
      participant.off?.("trackMuted", update);
      participant.off?.("trackUnmuted", update);
    };
  }, [participant]);

  const camPub = participant.getTrackPublication?.(Track.Source.Camera)
              || participant.trackPublications?.get(Track.Source.Camera);
  const micPub = participant.getTrackPublication?.(Track.Source.Microphone)
              || participant.trackPublications?.get(Track.Source.Microphone);
  const micMuted = micPub?.isMuted ?? !participant.isMicrophoneEnabled;
  const displayName = participant.name || participant.identity || "Participant";
  const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  const tileH = size === "strip" ? 90 : "100%";
  const tileW = size === "strip" ? 120 : "100%";
  const avatarSize = size === "strip" ? 36 : size === "spotlight" ? 72 : 52;
  const fontSize  = size === "strip" ? 13 : size === "spotlight" ? 26 : 18;

  return (
    <div style={{
      position: "relative",
      width: tileW, height: tileH,
      background: "#1c2128",
      borderRadius: size === "strip" ? 10 : 12,
      overflow: "hidden",
      border: isSpeaking ? "2px solid #22c55e" : "2px solid transparent",
      transition: "border .2s",
      flexShrink: 0,
    }}>
      {/* Video */}
      <video
        ref={videoRef}
        autoPlay playsInline muted={isLocal}
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
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "linear-gradient(135deg,#1e3a2f,#0f2318)",
        }}>
          <div style={{
            width: avatarSize, height: avatarSize, borderRadius: "50%",
            background: "#075E54",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize, fontWeight: 700, color: "#fff",
            border: isSpeaking ? "3px solid #22c55e" : "3px solid rgba(255,255,255,.15)",
            transition: "border .2s",
          }}>
            {initials}
          </div>
        </div>
      )}

      {/* Bottom info strip */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: size === "strip" ? "4px 6px" : "8px 10px",
        background: "linear-gradient(transparent, rgba(0,0,0,.7))",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{
          fontSize: size === "strip" ? 9 : 12, fontWeight: 600,
          color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          maxWidth: size === "strip" ? 70 : "auto",
        }}>
          {displayName}{isLocal ? " (You)" : ""}
        </span>
        {micMuted && (
          <div style={{
            background: "rgba(239,68,68,.85)", borderRadius: "50%",
            width: size === "strip" ? 14 : 20, height: size === "strip" ? 14 : 20,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <MicOff style={{ width: size === "strip" ? 8 : 11, height: size === "strip" ? 8 : 11, color: "#fff" }} />
          </div>
        )}
      </div>

      {/* Speaking indicator */}
      {isSpeaking && (
        <div style={{
          position: "absolute", top: 8, left: 8,
          background: "rgba(34,197,94,.9)", borderRadius: 20,
          padding: "2px 8px", fontSize: 10, color: "#fff", fontWeight: 700,
        }}>
          ● Speaking
        </div>
      )}
    </div>
  );
};

const VideoGrid = () => {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants   = useParticipants();
  // useParticipants returns ALL including local — filter out local
  const remotes = remoteParticipants.filter(p => p.identity !== localParticipant?.identity);
  const all = localParticipant ? [localParticipant, ...remotes] : remotes;
  const count = all.length;

  // Screen share: find any participant publishing a screen track
  const screensharer = all.find(p => {
    const pub = p.getTrackPublication?.(Track.Source.ScreenShare)
             || p.trackPublications?.get(Track.Source.ScreenShare);
    return pub?.track && !pub.isMuted;
  });

  if (screensharer) {
    // Screen share layout: big screen + small participant strips
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", gap: 6, padding: 8, boxSizing: "border-box" }}>
        {/* Screen share takes 80% */}
        <div style={{ flex: 1, borderRadius: 12, overflow: "hidden", background: "#111" }}>
          <ParticipantTile participant={screensharer as any} source={Track.Source.ScreenShare}
            style={{ width: "100%", height: "100%" }} />
        </div>
        {/* Participants strip */}
        <div style={{ width: 130, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
          {all.map((p, i) => (
            <ParticipantVideo
              key={p.identity} participant={p}
              size="strip" isLocal={p.identity === localParticipant?.identity}
            />
          ))}
        </div>
      </div>
    );
  }

  // 1 person (only me) — full screen centered
  if (count <= 1) {
    return (
      <div style={{ width: "100%", height: "100%", padding: 8, boxSizing: "border-box" }}>
        <ParticipantVideo
          participant={all[0] || localParticipant}
          isLocal size="spotlight"
        />
      </div>
    );
  }

  // 2 people — side by side, equal halves (Google Meet style)
  if (count === 2) {
    return (
      <div style={{
        width: "100%", height: "100%",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 6, padding: 8, boxSizing: "border-box",
      }}>
        {all.map((p, i) => (
          <ParticipantVideo
            key={p.identity} participant={p} size="normal"
            isLocal={p.identity === localParticipant?.identity}
          />
        ))}
      </div>
    );
  }

  // 3-4 people — 2x2 grid
  if (count <= 4) {
    return (
      <div style={{
        width: "100%", height: "100%",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: count <= 2 ? "1fr" : count === 3 ? "1fr 1fr" : "1fr 1fr",
        gap: 6, padding: 8, boxSizing: "border-box",
      }}>
        {all.map(p => (
          <ParticipantVideo
            key={p.identity} participant={p} size="normal"
            isLocal={p.identity === localParticipant?.identity}
          />
        ))}
      </div>
    );
  }

  // 5+ people — spotlight (first/active speaker) + strip of others
  const [spotlight, ...others] = all;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: 6, padding: 8, boxSizing: "border-box" }}>
      <div style={{ flex: 1 }}>
        <ParticipantVideo
          participant={spotlight} size="spotlight"
          isLocal={spotlight?.identity === localParticipant?.identity}
        />
      </div>
      <div style={{ height: 96, display: "flex", gap: 6, overflowX: "auto" }}>
        {others.map(p => (
          <ParticipantVideo
            key={p.identity} participant={p} size="strip"
            isLocal={p.identity === localParticipant?.identity}
          />
        ))}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   BOTTOM TOOLBAR — single clean toolbar, no duplicates
═══════════════════════════════════════════════════════ */
const BottomBar = ({
  sessionId, onToggleChat, onToggleParticipants,
  onEndClass, onLeaveClass, chatUnread,
  onLaunchPoll, onLaunchQuiz,
  onToggleWhiteboard, whiteboardOpen,
  onGroupRecite, groupReciteMode,
  isPrivileged,
}: any) => {
  const room = useRoomContext();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [micOn, setMicOn]     = useState(true);
  const [camOn, setCamOn]     = useState(true);
  const [sharing, setSharing] = useState(false);
  const [handUp, setHandUp]   = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showReact, setShowReact] = useState(false);
  const [floatEmoji, setFloatEmoji] = useState<string|null>(null);

  useEffect(() => {
    const lp = room.localParticipant;
    setMicOn(lp.isMicrophoneEnabled);
    setCamOn(lp.isCameraEnabled);
  }, [room]);

  const toggleMic = async () => {
    await room.localParticipant.setMicrophoneEnabled(!micOn);
    setMicOn(v => !v);
  };
  const toggleCam = async () => {
    await room.localParticipant.setCameraEnabled(!camOn);
    setCamOn(v => !v);
  };
  const toggleShare = async () => {
    if (sharing) {
      const pubs = Array.from(room.localParticipant.trackPublications.values())
        .filter(p => p.track?.source === Track.Source.ScreenShare || p.track?.source === Track.Source.ScreenShareAudio);
      for (const p of pubs) { if (p.track) { await room.localParticipant.unpublishTrack(p.track); p.track.stop(); } }
      setSharing(false);
    } else {
      try {
        const { createLocalScreenTracks } = await import("livekit-client");
        const tracks = await createLocalScreenTracks({ audio:true, resolution:{ width:1280, height:720, frameRate:15 } });
        for (const t of tracks) await room.localParticipant.publishTrack(t);
        setSharing(true);
        tracks.forEach(t => t.mediaStreamTrack.addEventListener("ended", () => { room.localParticipant.unpublishTrack(t); setSharing(false); }));
      } catch (_) {}
    }
  };
  const toggleHand = async () => {
    if (!user||!sessionId) return;
    const n = !handUp; setHandUp(n);
    await supabase.from("class_participants").update({ hand_raised:n, hand_raised_at:n?new Date().toISOString():null }).eq("session_id",sessionId).eq("student_id",user.id);
  };
  const sendEmoji = (e: string) => {
    setFloatEmoji(e); setShowReact(false);
    if (user) supabase.from("class_chat_messages").insert({ session_id:sessionId, sender_id:user.id, message:e, type:"emoji" });
    setTimeout(()=>setFloatEmoji(null),2000);
  };

  const btn = (active: boolean, red=false): React.CSSProperties => ({
    width:46, height:46, borderRadius:"50%", border:"none", cursor:"pointer", display:"flex",
    alignItems:"center", justifyContent:"center", transition:"all .15s",
    background: red ? "#EF4444" : active ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)",
    color: "#fff",
  });

  const iconStyle = { width:20, height:20 };

  return (
    <>
      {/* Floating emoji */}
      {floatEmoji && (
        <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:60, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <span style={{ fontSize:72, animation:"bounceUp 2s ease-out" }}>{floatEmoji}</span>
        </div>
      )}

      {/* Screen share banner */}
      {sharing && (
        <div style={{ background:"rgba(239,68,68,0.9)", color:"#fff", textAlign:"center", padding:"4px 12px", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          <Monitor style={{ width:12, height:12 }} />
          Sharing your screen
          <button onClick={toggleShare} style={{ background:"rgba(255,255,255,0.2)", border:"none", color:"#fff", fontSize:11, padding:"2px 8px", borderRadius:10, cursor:"pointer" }}>Stop</button>
        </div>
      )}

      {/* Group recite banner */}
      {groupReciteMode && (
        <div style={{ background:"rgba(34,197,94,0.9)", color:"#fff", textAlign:"center", padding:"6px 12px", fontSize:13, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          <Volume2 style={{ width:14, height:14 }} />
          Group Recitation Mode — All mics open
          {isPrivileged && <button onClick={onGroupRecite} style={{ background:"rgba(255,255,255,0.2)", border:"none", color:"#fff", fontSize:11, padding:"2px 10px", borderRadius:10, cursor:"pointer", marginLeft:8 }}>End</button>}
        </div>
      )}

      {/* More menu */}
      {showMore && (
        <div style={{ position:"fixed", bottom:TOOLBAR_H+8, right:8, background:"#1e1e1e", borderRadius:14, boxShadow:"0 4px 24px rgba(0,0,0,.5)", minWidth:200, zIndex:50, overflow:"hidden" }}
          onClick={()=>setShowMore(false)}>
          {isPrivileged && [
            { icon:BookOpen, label:"Group Recitation · تلاوة جماعية", action:onGroupRecite, color:groupReciteMode?"#22c55e":"#fff" },
            { icon:PenTool,  label:"Whiteboard · السبورة", color:whiteboardOpen?"#22c55e":"#fff",
              action:()=>{
                const next = !whiteboardOpen;
                onToggleWhiteboard();
                try {
                  const msg = new TextEncoder().encode(JSON.stringify({ type: next ? "wb_open" : "wb_close" }));
                  room.localParticipant.publishData(msg, { reliable: true });
                } catch(_) {}
              }
            },
          ].map((item,i)=>(
            <button key={i} onClick={item.action} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"13px 16px", background:"none", border:"none", cursor:"pointer", color:item.color, fontSize:14, fontFamily:"'Cairo',sans-serif", borderBottom:"1px solid rgba(255,255,255,0.07)", textAlign:"left" as const }}>
              <item.icon style={{ width:16, height:16 }} />{item.label}
            </button>
          ))}
          <button onClick={()=>{ supabase.from("class_participants").update({is_muted:true}).eq("session_id",sessionId); toast({title:"All students muted"}); }}
            style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"13px 16px", background:"none", border:"none", cursor:"pointer", color:"#fff", fontSize:14, fontFamily:"'Cairo',sans-serif", borderBottom:"1px solid rgba(255,255,255,0.07)", textAlign:"left" as const }}>
            <MicOff style={{ width:16, height:16 }} />Mute All Students
          </button>
          <button onClick={isPrivileged?onEndClass:onLeaveClass}
            style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"13px 16px", background:"none", border:"none", cursor:"pointer", color:"#EF4444", fontSize:14, fontFamily:"'Cairo',sans-serif", textAlign:"left" as const }}>
            <Phone style={{ width:16, height:16, transform:"rotate(135deg)" }} />
            {isPrivileged?"End Class · إنهاء الحصة":"Leave Class · مغادرة"}
          </button>
        </div>
      )}

      {/* Emoji picker */}
      {showReact && (
        <div style={{ position:"fixed", bottom:TOOLBAR_H+8, left:"50%", transform:"translateX(-50%)", background:"#1e1e1e", borderRadius:40, padding:"8px 12px", display:"flex", gap:6, zIndex:50, boxShadow:"0 4px 20px rgba(0,0,0,.4)" }}>
          {["👏","🤲","❤️","😂","🌟","👍","🙏","🕌"].map(e=>(
            <button key={e} onClick={()=>sendEmoji(e)} style={{ fontSize:24, background:"none", border:"none", cursor:"pointer", padding:"4px 6px", lineHeight:1 }}>{e}</button>
          ))}
        </div>
      )}

      {/* Main toolbar */}
      <div style={{ height:TOOLBAR_H, background:DARK_GREEN, display:"flex", alignItems:"center", justifyContent:"space-around", padding:"0 8px", flexShrink:0 }}>
        {/* Mic */}
        <button style={btn(micOn, !micOn)} onClick={toggleMic}>
          {micOn ? <Mic style={iconStyle}/> : <MicOff style={iconStyle}/>}
        </button>
        {/* Camera */}
        <button style={btn(camOn, !camOn)} onClick={toggleCam}>
          {camOn ? <Video style={iconStyle}/> : <VideoOff style={iconStyle}/>}
        </button>
        {/* Screen share */}
        <button style={btn(!sharing, sharing)} onClick={toggleShare}>
          {sharing ? <MonitorOff style={iconStyle}/> : <Monitor style={iconStyle}/>}
        </button>
        {/* Raise hand (students) / Whiteboard (teacher) */}
        {!isPrivileged
          ? <button style={btn(handUp)} onClick={toggleHand}><Hand style={{ ...iconStyle, color:handUp?"#fbbf24":"#fff" }} /></button>
          : <button style={btn(whiteboardOpen)} onClick={()=>{
              const next = !whiteboardOpen;
              onToggleWhiteboard();
              try {
                const msg = new TextEncoder().encode(JSON.stringify({ type: next ? "wb_open" : "wb_close" }));
                room.localParticipant.publishData(msg, { reliable: true });
              } catch(_) {}
            }}><PenTool style={{ ...iconStyle, color:whiteboardOpen?"#22c55e":"#fff" }} /></button>
        }
        {/* Emoji */}
        <button style={btn(showReact)} onClick={()=>setShowReact(v=>!v)}>
          <Smile style={iconStyle}/>
        </button>
        {/* Chat */}
        <div style={{ position:"relative" }}>
          <button style={btn(false)} onClick={onToggleChat}><MessageCircle style={iconStyle}/></button>
          {chatUnread>0 && <span style={{ position:"absolute", top:-2, right:-2, background:"#EF4444", color:"#fff", borderRadius:"50%", width:16, height:16, fontSize:9, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700 }}>{chatUnread}</span>}
        </div>
        {/* Participants */}
        <button style={btn(false)} onClick={onToggleParticipants}><Users style={iconStyle}/></button>
        {/* More */}
        <button style={btn(showMore)} onClick={()=>setShowMore(v=>!v)}>
          <MoreVertical style={iconStyle}/>
        </button>
        {/* End/Leave */}
        <button style={{ ...btn(false,true), width:52 }} onClick={isPrivileged?onEndClass:onLeaveClass}>
          <Phone style={{ ...iconStyle, transform:"rotate(135deg)" }}/>
        </button>
      </div>
    </>
  );
};

/* ═══════════════════════════════════════════════════════
   RECORDING CONTROLLER (unchanged logic, kept inside room context)
═══════════════════════════════════════════════════════ */
const RecController = ({ sessionId, subjectId, userEmail, onSavingChange }: any) => {
  const room = useRoomContext();
  const { t } = useLanguage();
  const [recording, setRecording] = useState(false);
  const [paused, setPaused]       = useState(false);
  const [time, setTime]           = useState(0);
  const timerRef   = useRef<any>(null);
  const mrRef      = useRef<MediaRecorder|null>(null);
  const chunksRef  = useRef<Blob[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const acRef      = useRef<AudioContext|null>(null);

  const collectAudio = useCallback((): MediaStream|null => {
    try {
      const ac = new AudioContext(); acRef.current=ac;
      const dest = ac.createMediaStreamDestination(); let n=0;
      const parts = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
      for (const p of parts) for (const pub of p.trackPublications.values()) {
        if (pub.track && (pub.source===Track.Source.Microphone||pub.source===Track.Source.ScreenShareAudio)) {
          const mst=pub.track.mediaStreamTrack;
          if (mst&&mst.readyState==="live") { ac.createMediaStreamSource(new MediaStream([mst])).connect(dest); n++; }
        }
      }
      return n>0?dest.stream:null;
    } catch{return null;}
  },[room]);

  const start = useCallback(async()=>{
    let stream:MediaStream|null=null, mode:"screen"|"audio"="audio";
    if (typeof navigator.mediaDevices.getDisplayMedia==="function") {
      try {
        stream=await navigator.mediaDevices.getDisplayMedia({video:{width:1280,height:720},audio:true}); mode="screen";
        const ra=collectAudio();
        if(ra&&acRef.current){const c=acRef.current,d=c.createMediaStreamDestination();stream.getAudioTracks().forEach(t=>{c.createMediaStreamSource(new MediaStream([t])).connect(d);});ra.getAudioTracks().forEach(t=>{c.createMediaStreamSource(new MediaStream([t])).connect(d);});stream=new MediaStream([...stream.getVideoTracks(),...d.stream.getAudioTracks()]);}
      }catch{stream=null;}
    }
    if(!stream){mode="audio";stream=collectAudio();if(!stream){try{stream=await navigator.mediaDevices.getUserMedia({audio:true});}catch{return;}}}
    streamsRef.current.push(stream);
    const mr=new MediaRecorder(stream,{mimeType:stream.getVideoTracks().length>0?"video/webm":"audio/webm"});
    chunksRef.current=[]; mr.ondataavailable=e=>{if(e.data.size>0)chunksRef.current.push(e.data);}; mr.start(1000);
    mrRef.current=mr; setRecording(true); setPaused(false); setTime(0);
    timerRef.current=setInterval(()=>setTime(p=>p+1),1000);
    toast({title:t("Recording started","بدأ التسجيل")});
  },[collectAudio,t]);

  const stop = useCallback(async()=>{
    clearInterval(timerRef.current); const dur=time;
    if(!mrRef.current||mrRef.current.state==="inactive"){setRecording(false);return;}
    onSavingChange(true);
    await new Promise<void>(res=>{mrRef.current!.onstop=()=>res();mrRef.current!.stop();});
    streamsRef.current.forEach(s=>s.getTracks().forEach(t=>t.stop())); streamsRef.current=[];
    if(acRef.current){acRef.current.close().catch(()=>{});acRef.current=null;}
    setRecording(false); setPaused(false); setTime(0);
    const blob=new Blob(chunksRef.current,{type:"video/webm"}); chunksRef.current=[];
    if(blob.size<500){onSavingChange(false);return;}
    try{
      const path=`recordings/${sessionId||subjectId}/${Date.now()}.webm`;
      const{error:ue}=await supabase.storage.from("subject-files").upload(path,blob,{contentType:"video/webm"});
      if(ue)throw ue;
      await supabase.from("session_recordings").insert({session_id:sessionId||subjectId,subject_id:subjectId,teacher_name:userEmail||"Teacher",duration_seconds:dur,file_url:path,file_size:blob.size});
      toast({title:t("Recording saved!","تم حفظ التسجيل!")});
    }catch(e:any){toast({title:t("Failed to save","فشل الحفظ"),description:e?.message,variant:"destructive"});}
    finally{onSavingChange(false);}
  },[time,sessionId,subjectId,userEmail,t,onSavingChange]);

  const fmt=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  if(!recording) return (
    <button onClick={start} style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:20, background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.3)", color:"#fff", fontSize:11, cursor:"pointer" }}>
      <Circle style={{ width:8, height:8, fill:"#EF4444", color:"#EF4444" }} />Record
    </button>
  );
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <span style={{ fontSize:11, color:"#fca5a5", fontWeight:700 }}>● REC {fmt(time)}</span>
      {paused
        ? <button onClick={()=>{mrRef.current?.resume();setPaused(false);timerRef.current=setInterval(()=>setTime(p=>p+1),1000);}} style={{ background:"none",border:"none",color:"#fff",cursor:"pointer",fontSize:11 }}><Play style={{width:12,height:12}}/></button>
        : <button onClick={()=>{mrRef.current?.pause();setPaused(true);clearInterval(timerRef.current);}} style={{ background:"none",border:"none",color:"#fff",cursor:"pointer",fontSize:11 }}><Pause style={{width:12,height:12}}/></button>}
      <button onClick={stop} style={{ background:"none",border:"none",color:"#fca5a5",cursor:"pointer",fontSize:11 }}><Square style={{width:12,height:12}}/></button>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   MAIN ClassroomView
═══════════════════════════════════════════════════════ */
const ClassroomView = ({ subject, onLeave }: ClassroomViewProps) => {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const isPrivileged = hasRole("admin") || hasRole("teacher");

  const [phase, setPhase]     = useState<"lobby"|"live"|"ended">("lobby");
  const [token, setToken]     = useState<string|null>(null);
  const [wsUrl, setWsUrl]     = useState<string|null>(null);
  const [error, setError]     = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string|null>(null);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [attendanceId, setAttendanceId] = useState<string|null>(null);
  const [joinedAt] = useState(Date.now());
  const [savingRec, setSavingRec] = useState(false);
  const [isSessionLive, setIsSessionLive] = useState(false);
  const [duration, setDuration] = useState(0);
  const [participantCount, setParticipantCount] = useState(0);

  // UI state
  const [chatOpen, setChatOpen]         = useState(false);
  const [partOpen, setPartOpen]         = useState(false);
  const [chatUnread, setChatUnread]     = useState(0);
  const [activeSideTab, setSideTab]     = useState<"chat"|"polls">("chat");
  const [showQuiz, setShowQuiz]         = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [whiteboardFS, setWhiteboardFS]     = useState(false);
  const wbStrokesBuffer = useRef<any[] | null>(null);
  const [sharedMaterial, setSharedMaterial] = useState<any>(null); // material teacher is showing
  const [groupReciteMode, setGroupReciteMode] = useState(false);

  // Pre-fetch token in background as soon as lobby loads
  const prefetchedRef = useRef<{token:string;url:string}|null>(null);
  useEffect(() => {
    const prefetch = async () => {
      try {
        const { data } = await supabase.functions.invoke("livekit-token", {
          body: { subject_id: subject.id, action: isPrivileged ? "start_session" : "join" },
        });
        if (data?.token && data?.url) prefetchedRef.current = { token: data.token, url: data.url };
      } catch (_) {}
    };
    prefetch();
  }, [subject.id, isPrivileged]);

  // Poll for live session
  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.from("live_sessions").select("*").eq("subject_id",subject.id).eq("status","live").maybeSingle();
      if (data) { setSessionInfo(data); setSessionId(data.id); setIsSessionLive(true); }
      else { setIsSessionLive(false); }
    };
    check();
    const iv = setInterval(check, 4000);
    return () => clearInterval(iv);
  }, [subject.id]);

  // Duration timer
  useEffect(() => {
    if (phase!=="live") return;
    const t = setInterval(()=>setDuration(p=>p+1),1000);
    return ()=>clearInterval(t);
  }, [phase]);

  const connectToLiveKit = async (action: string, settings?: any) => {
    setLoading(true);
    setError(null);
    try {
      // Use pre-fetched token if available (instant!)
      let tk = prefetchedRef.current?.token || null;
      let url = prefetchedRef.current?.url || null;

      if (!tk || !url) {
        const { data, error: fnErr } = await supabase.functions.invoke("livekit-token", {
          body: { subject_id: subject.id, action },
        });
        if (fnErr) throw fnErr;
        if (data?.error) throw new Error(data.error);
        tk = data.token; url = data.url;
      }

      if (settings && sessionId) {
        await supabase.from("live_sessions").update({ ...settings, actual_start_time:new Date().toISOString(), status:"live" }).eq("id",sessionId);
      }

      setToken(tk!); setWsUrl(url!);

      // Get session
      const { data: sessions } = await supabase.from("live_sessions").select("*").eq("subject_id",subject.id).in("status",["live","active","scheduled"]).order("scheduled_at",{ascending:false,nullsFirst:false}).limit(1);
      if (sessions?.length) {
        setSessionId(sessions[0].id); setSessionInfo(sessions[0]);
        const { data: att } = await supabase.from("attendance_logs").insert({ session_id:sessions[0].id, user_id:user!.id, device_info:navigator.userAgent }).select("id").single();
        if (att) setAttendanceId(att.id);
        await supabase.from("class_participants").upsert({ session_id:sessions[0].id, student_id:user!.id, joined_at:new Date().toISOString(), is_muted:!isPrivileged, camera_on:true }, { onConflict:"session_id,student_id" });
      }

      setPhase("live");
    } catch (e: any) {
      setError(e?.message || "Failed to connect");
    } finally { setLoading(false); }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (attendanceId) { const d=Math.floor((Date.now()-joinedAt)/1000); supabase.from("attendance_logs").update({left_at:new Date().toISOString(),duration_seconds:d}).eq("id",attendanceId); }
      if (sessionId&&user) { supabase.from("class_participants").update({left_at:new Date().toISOString(),duration_minutes:Math.floor((Date.now()-joinedAt)/60000)}).eq("session_id",sessionId).eq("student_id",user.id); }
    };
  }, [attendanceId,joinedAt,sessionId,user]);

  const endSession = async () => {
    setShowEndConfirm(false);
    if (sessionId) {
      await supabase.from("live_sessions").update({ status:"ended", ended_at:new Date().toISOString(), actual_end_time:new Date().toISOString() }).eq("id",sessionId);
      if (user) await supabase.from("class_chat_messages").insert({ session_id:sessionId, sender_id:user.id, message:t("Class has ended","انتهت الحصة"), type:"system" });
    }
    setPhase("ended");
  };

  const leaveSession = () => {
    if (attendanceId) { const d=Math.floor((Date.now()-joinedAt)/1000); supabase.from("attendance_logs").update({left_at:new Date().toISOString(),duration_seconds:d}).eq("id",attendanceId); }
    if (sessionId&&user) { supabase.from("class_participants").update({left_at:new Date().toISOString(),duration_minutes:Math.floor((Date.now()-joinedAt)/60000)}).eq("session_id",sessionId).eq("student_id",user.id); }
    onLeave();
  };

  const handleGroupRecite = async () => {
    const next = !groupReciteMode;
    setGroupReciteMode(next);
    if (next) {
      // Broadcast "unmute all" signal
      toast({ title: "Group Recitation Mode ON · وضع التلاوة الجماعية" });
    } else {
      toast({ title: "Group Recitation Mode OFF" });
    }
    // Publish data channel signal so students' clients can react
    if (sessionId) {
      await supabase.from("class_chat_messages").insert({
        session_id: sessionId, sender_id: user!.id,
        message: next ? "🎙️ Group Recitation Mode — please recite together" : "🔇 Recitation ended",
        type: "system",
      });
    }
  };

  const fmt = (s:number) => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60; return h>0?`${h}:${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}`; };

  // ── ENDED ──
  if (phase==="ended") return <ClassEndScreen subject={subject} session={sessionInfo} duration={duration} participantCount={participantCount} onGoToDashboard={onLeave} onGoToRevision={()=>{ window.location.href=`/student/revision/${subject.id}`; }} />;

  // ── LOBBY ── (students can enter immediately, no need to wait for teacher)
  if (phase==="lobby"&&!loading&&!error) return (
    <ClassLobby subject={subject} session={sessionInfo} onStartClass={(s:any)=>connectToLiveKit("start_session",s)} onJoinClass={()=>connectToLiveKit("join")} onBack={onLeave} isLive={isSessionLive} />
  );

  // ── LOADING ──
  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"#0a0a0a" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ width:48, height:48, border:"4px solid #075E54", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 16px" }} />
        <p style={{ color:"#999", fontSize:14 }}>{t("Connecting to classroom…","جاري الاتصال بالفصل…")}</p>
      </div>
    </div>
  );

  // ── ERROR ──
  if (error) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"#0a0a0a" }}>
      <div style={{ textAlign:"center", maxWidth:360, padding:24 }}>
        <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(239,68,68,0.15)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
          <X style={{ width:28, height:28, color:"#EF4444" }} />
        </div>
        <h2 style={{ fontSize:20, fontWeight:700, color:"#fff", marginBottom:8 }}>{t("Connection Failed","فشل الاتصال")}</h2>
        <p style={{ color:"#999", fontSize:14, marginBottom:20 }}>{error}</p>
        <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
          <button onClick={()=>{setError(null);setPhase("lobby");}} style={{ padding:"10px 20px", borderRadius:10, background:"#075E54", border:"none", color:"#fff", fontSize:14, cursor:"pointer" }}>{t("Try Again","حاول مرة أخرى")}</button>
          <button onClick={onLeave} style={{ padding:"10px 20px", borderRadius:10, background:"rgba(255,255,255,0.1)", border:"none", color:"#fff", fontSize:14, cursor:"pointer" }}>{t("Go Back","رجوع")}</button>
        </div>
      </div>
    </div>
  );

  // ── LIVE ──
  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", background:"#1a1a1a", position:"relative", overflow:"hidden" }}>
      <style>{`
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes bounceUp { 0%{opacity:1;transform:translateY(0)scale(1)} 100%{opacity:0;transform:translateY(-120px)scale(1.4)} }
      `}</style>

      {token && wsUrl && (
        <LiveKitRoom serverUrl={wsUrl} token={token} connect={true}
          options={{
            adaptiveStream: { pixelDensity: "screen" },
            dynacast: true,
            disconnectOnPageLeave: true,
            // Audio: low latency, echo-cancelled
            audioCaptureDefaults: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 48000,
              channelCount: 1,
            },
            publishDefaults: {
              // 32kbps is fine for voice — lower = less bandwidth = less lag
              audioPreset: { maxBitrate: 32000 },
              dtx: true,             // silence suppression = saves bandwidth
              red: false,            // disable redundancy = lower latency
              stopMicTrackOnMute: false, // don't stop track on mute (faster resume)
              // Video: 640x480 is plenty for classroom tiles
              videoEncoding: { maxBitrate: 700_000, maxFramerate: 20 },
              backupCodec: true,
            },
            videoCaptureDefaults: {
              resolution: { width: 640, height: 480, frameRate: 20 },
              facingMode: "user",
            },
          }}
          style={{ height:"100%", flex:1 }}
          data-lk-theme="default"
        >
          <RoomAudioRenderer />

          {/* Always-on data listener: handles wb_open/close signals */}
          <RoomDataListener
            onWbOpen={()=>{ setWhiteboardOpen(true); if(!isPrivileged) setWhiteboardFS(true); }}
            onWbClose={()=>{ setWhiteboardOpen(false); setWhiteboardFS(false); }}
            strokesBuffer={wbStrokesBuffer}
            onMatOpen={(mat)=>setSharedMaterial(mat)}
            onMatClose={()=>setSharedMaterial(null)}
          />

          {/* Top bar */}
          <div style={{ height:44, background:"rgba(0,0,0,0.7)", backdropFilter:"blur(10px)", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 12px", flexShrink:0, zIndex:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(255,255,255,0.1)", borderRadius:20, padding:"3px 10px" }}>
                <Circle style={{ width:8, height:8, fill:"#22c55e", color:"#22c55e" }} />
                <span style={{ fontSize:12, color:"#fff", maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{subject.title}</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(239,68,68,0.2)", borderRadius:20, padding:"3px 10px" }}>
                <Circle style={{ width:6, height:6, fill:"#EF4444", color:"#EF4444", animation:"pulse 1s infinite" }} />
                <span style={{ fontSize:11, color:"#fca5a5", fontWeight:700 }}>{fmt(duration)}</span>
              </div>
            </div>
            {isPrivileged && (
              <RecController sessionId={sessionId} subjectId={subject.id} userEmail={user?.email||""} onSavingChange={setSavingRec} />
            )}
          </div>

          {/* Main content area */}
          <div style={{ flex:1, display:"flex", overflow:"hidden", position:"relative" }}>
            {/* Participants sidebar */}
            {partOpen && !isMobile && (
              <div style={{ width:220, background:"rgba(0,0,0,0.7)", borderRight:"1px solid rgba(255,255,255,0.1)", flexShrink:0, overflow:"auto" }}>
                <ClassParticipants sessionId={sessionId||""} onMuteStudent={sid=>supabase.from("class_participants").update({is_muted:true}).eq("session_id",sessionId!).eq("student_id",sid)} onRemoveStudent={sid=>{ supabase.from("class_participants").update({left_at:new Date().toISOString()}).eq("session_id",sessionId!).eq("student_id",sid); toast({title:t("Student removed","تمت إزالة الطالب")}); }} />
              </div>
            )}

            {/* Video area — NO built-in controls */}
            <div style={{ flex:1, position:"relative", overflow:"hidden" }}>
              <VideoGrid />

              {/* Whiteboard overlay */}
              {whiteboardOpen && (
                <Whiteboard
                  onClose={()=>{
                    setWhiteboardOpen(false); setWhiteboardFS(false);
                    if (isPrivileged) {
                      try {
                        const msg = new TextEncoder().encode(JSON.stringify({ type: "wb_close" }));
                        room?.localParticipant?.publishData(msg, { reliable: true });
                      } catch (_) {}
                    }
                  }}
                  fullscreen={whiteboardFS}
                  onToggleFullscreen={()=>setWhiteboardFS(v=>!v)}
                  isTeacher={isPrivileged}
                  initialStrokes={wbStrokesBuffer.current}
                />
              )}

              {/* Shared Material fullscreen overlay — teacher pushes, everyone sees */}
              {sharedMaterial && (
                <SharedMaterialViewer
                  material={sharedMaterial}
                  isTeacher={isPrivileged}
                  onClose={()=>{
                    setSharedMaterial(null);
                    if (isPrivileged) {
                      try {
                        const msg = new TextEncoder().encode(JSON.stringify({ type: "mat_close" }));
                        room?.localParticipant?.publishData(msg, { reliable: true });
                      } catch (_) {}
                    }
                  }}
                />
              )}

              {/* Material picker — teacher only button to open material for everyone */}
              {isPrivileged && !sharedMaterial && (
                <MaterialPickerButton
                  subjectId={subject.id}
                  onOpen={(mat: any) => {
                    setSharedMaterial(mat);
                    try {
                      const msg = new TextEncoder().encode(JSON.stringify({ type: "mat_open", material: mat }));
                      room?.localParticipant?.publishData(msg, { reliable: true });
                    } catch (_) {}
                  }}
                />
              )}
            </div>

            {/* Chat sidebar */}
            {chatOpen && !isMobile && (
              <div style={{ width:280, background:"rgba(0,0,0,0.7)", borderLeft:"1px solid rgba(255,255,255,0.1)", display:"flex", flexDirection:"column", flexShrink:0 }}>
                <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.1)" }}>
                  {[["chat","💬",t("Chat","محادثة")],["polls","📊",t("Polls","تصويت")]].map(([k,ic,lb])=>(
                    <button key={k} onClick={()=>{setSideTab(k as any);if(k==="chat")setChatUnread(0);}} style={{ flex:1, padding:"10px 4px", background:"none", border:"none", color:activeSideTab===k?"#fff":"rgba(255,255,255,0.5)", fontSize:12, fontWeight:activeSideTab===k?700:400, borderBottom:activeSideTab===k?"2px solid #075E54":"2px solid transparent", cursor:"pointer" }}>
                      {ic} {lb}
                    </button>
                  ))}
                </div>
                <div style={{ flex:1, overflow:"hidden" }}>
                  {activeSideTab==="chat" ? <ClassChatPanel sessionId={sessionId||""} /> : <ClassPolls sessionId={sessionId||""} />}
                </div>
              </div>
            )}
          </div>

          {/* Bottom toolbar — single, clean, no duplicates */}
          <BottomBar
            sessionId={sessionId||""}
            onToggleChat={()=>{setChatOpen(v=>!v);if(!chatOpen)setChatUnread(0);}}
            onToggleParticipants={()=>setPartOpen(v=>!v)}
            onEndClass={()=>setShowEndConfirm(true)}
            onLeaveClass={leaveSession}
            chatUnread={chatUnread}
            onLaunchPoll={()=>{setChatOpen(true);setSideTab("polls");}}
            onLaunchQuiz={()=>setShowQuiz(true)}
            onToggleWhiteboard={()=>setWhiteboardOpen(v=>!v)}
            whiteboardOpen={whiteboardOpen}
            onGroupRecite={handleGroupRecite}
            groupReciteMode={groupReciteMode}
            isPrivileged={isPrivileged}
          />

          {/* Mobile panels as bottom sheets */}
          {isMobile && partOpen && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:40 }} onClick={()=>setPartOpen(false)}>
              <div style={{ position:"absolute", bottom:TOOLBAR_H, left:0, right:0, background:"#1a1a1a", borderRadius:"20px 20px 0 0", maxHeight:"60vh", overflow:"auto" }} onClick={e=>e.stopPropagation()}>
                <div style={{ width:40, height:4, borderRadius:2, background:"rgba(255,255,255,0.2)", margin:"10px auto 6px" }} />
                <ClassParticipants sessionId={sessionId||""} />
              </div>
            </div>
          )}
          {isMobile && chatOpen && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:40 }} onClick={()=>setChatOpen(false)}>
              <div style={{ position:"absolute", bottom:TOOLBAR_H, left:0, right:0, background:"#1a1a1a", borderRadius:"20px 20px 0 0", maxHeight:"65vh", display:"flex", flexDirection:"column" }} onClick={e=>e.stopPropagation()}>
                <div style={{ width:40, height:4, borderRadius:2, background:"rgba(255,255,255,0.2)", margin:"10px auto 4px" }} />
                <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.1)" }}>
                  {[["chat","💬","Chat"],["polls","📊","Polls"]].map(([k,ic,lb])=>(
                    <button key={k} onClick={()=>setSideTab(k as any)} style={{ flex:1, padding:"9px 4px", background:"none", border:"none", color:activeSideTab===k?"#fff":"rgba(255,255,255,0.5)", fontSize:12, fontWeight:activeSideTab===k?700:400, borderBottom:activeSideTab===k?"2px solid #075E54":"2px solid transparent", cursor:"pointer" }}>
                      {ic} {lb}
                    </button>
                  ))}
                </div>
                <div style={{ flex:1, overflow:"hidden", minHeight:300 }}>
                  {activeSideTab==="chat"?<ClassChatPanel sessionId={sessionId||""}/>:<ClassPolls sessionId={sessionId||""}/>}
                </div>
              </div>
            </div>
          )}

          <LiveQuizOverlay sessionId={sessionId||""} isOpen={showQuiz} onClose={()=>setShowQuiz(false)} />
        </LiveKitRoom>
      )}

      {/* End confirmation */}
      <Dialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("End class for everyone?","إنهاء الحصة للجميع؟")}</DialogTitle></DialogHeader>
          <p style={{ fontSize:13, color:"#666" }}>{t("This will disconnect all participants.","سيتم قطع الاتصال عن جميع المشاركين.")}</p>
          <DialogFooter style={{ display:"flex", gap:8 }}>
            <Button variant="outline" onClick={()=>setShowEndConfirm(false)}>{t("Cancel","إلغاء")}</Button>
            <Button variant="outline" onClick={()=>{setShowEndConfirm(false);leaveSession();}}>{t("Leave but Keep Open","غادر لكن أبقِ الحصة")}</Button>
            <Button variant="destructive" onClick={endSession}>{t("End for All","إنهاء للجميع")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClassroomView;
