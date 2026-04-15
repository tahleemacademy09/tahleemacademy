/*
  ClassroomView.tsx — Tahleem Academy Live Classroom  [ENHANCED]
  ─────────────────────────────────────────────────────────────────
  ✅ Emoji floats up screen for ALL participants (animated overlay)
  ✅ Student record button shown when admin grants permission
  ✅ Student write/board button shown when admin grants write access
  ✅ Group Recitation unmutes everyone simultaneously, no interference
  ✅ Footer scrolls horizontally on mobile (all icons reachable)
  ✅ Material scroll sync — teacher scrolls → students scroll with it
  ✅ Video layout: 2 participants stacked vertically (not side-by-side)
  ✅ High-quality audio (96kbps, 48kHz stereo, acoustic echo cancel)
  ✅ High-quality video (1280x720, 1.5Mbps)
  ✅ Background keep-alive: disconnectOnPageLeave=false, wake lock,
     Service Worker hint, MediaSession API, visibility reconnect
  ✅ Rapid re-sync: 500ms reconnect polling, prefetch tokens
*/

import {
  LiveKitRoom, RoomAudioRenderer, useRoomContext,
  useParticipants, useLocalParticipant,
} from "@livekit/components-react";
// @ts-ignore
import "@livekit/components-styles";
import { Track, RoomEvent, ConnectionState, AudioPresets } from "livekit-client";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { playJoinSound, playLeaveSound } from "@/lib/soundUtils";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Mic, MicOff, Video, VideoOff, Phone, Hand,
  PenTool, MessageCircle, MoreVertical, BookOpen,
  Circle, Loader2, X, Smile, Play, Pause,
  Volume2, ChevronDown, Users, Eye, MonitorPlay,
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

const TEAL  = "#0a7c68";const TEAL2 = "#064E3B";
const DARK  = "#0f1117";
const GLASS = "rgba(15,17,23,0.88)";
const GLASSB= "rgba(255,255,255,0.08)";
const GREEN = "#22c55e";
const RED   = "#ef4444";
const BAR_H = 76;

// ── CSS animations ────────────────────────────────────────────────────────────
const CSS = `
  @keyframes cv-spin   { to { transform:rotate(360deg); } }
  @keyframes wb-spin   { to { transform:rotate(360deg); } }
  @keyframes speaking  { 0%,100%{opacity:1}50%{opacity:.35} }
  @keyframes pip-pulse { 0%,100%{opacity:1}50%{opacity:.3} }
  @keyframes slide-up  { from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1} }
  @keyframes fade-in   { from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)} }
  @keyframes emoji-float {
    0%   { transform:translateY(0) scale(1);   opacity:1; }
    60%  { transform:translateY(-55vh) scale(1.3); opacity:1; }
    100% { transform:translateY(-90vh) scale(.8);  opacity:0; }
  }
  [data-lk-theme]{ height:100%!important;display:flex!important;flex-direction:column!important; }
  [data-classroom-root]{
    overscroll-behavior:none;-webkit-overflow-scrolling:touch;
    touch-action:pan-y;padding-bottom:env(safe-area-inset-bottom,0px);
  }
  [data-classroom-root] button{-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
  [data-classroom-root] canvas{-webkit-user-select:none;user-select:none;}
  .bottom-bar-scroll::-webkit-scrollbar{display:none;}
  .bottom-bar-scroll{-ms-overflow-style:none;scrollbar-width:none;}
  .cv-bar{will-change:transform;transform:translateZ(0);contain:layout;scrollbar-width:none;-ms-overflow-style:none;}
  .cv-bar::-webkit-scrollbar{display:none;}
  @supports not (height:100dvh){[data-classroom-root]{height:-webkit-fill-available!important;}}
`;

// ── Publish helpers ────────────────────────────────────────────────────────────
function publishData(room: any, msg: object) {
  try {
    room?.localParticipant?.publishData(
      new TextEncoder().encode(JSON.stringify(msg)),
      { reliable: true }
    );
  } catch {}
}

/* ══ RECONNECT MONITOR ══ */
const ReconnectMonitor = ({ onReconnecting, onReconnected }: { onReconnecting:()=>void;onReconnected:()=>void }) => {
  const room = useRoomContext();
  useEffect(() => {
    room.on(RoomEvent.Reconnecting, onReconnecting);    room.on(RoomEvent.Reconnected,  onReconnected);
    const onVis = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        if (room.state === ConnectionState.Connected) {
          const lp = room.localParticipant;
          // Cycle mic to re-establish audio after backgrounding
          if (lp.isMicrophoneEnabled) {
            await lp.setMicrophoneEnabled(false);
            await new Promise(r => setTimeout(r, 120));
            await lp.setMicrophoneEnabled(true);
          }
          onReconnected();
        } else if (room.state === ConnectionState.Disconnected) {
          onReconnecting();
          await room.reconnect();
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

/* ══ WB SYNC BRIDGE ══ */
const WbSyncBridge = ({ wbOpen, isTeacher }: { wbOpen: boolean; isTeacher: boolean }) => {
  const room = useRoomContext();
  const prevRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!isTeacher) return;
    if (prevRef.current === null) { prevRef.current = wbOpen; return; }
    if (prevRef.current === wbOpen) return;
    prevRef.current = wbOpen;
    publishData(room, { type: wbOpen ? "wb_open" : "wb_close" });
  }, [wbOpen, isTeacher, room]);
  return null;
};

/* ══ MEDIA AUTO-PUBLISH — always starts OFF ══ */
const MediaAutoPublish = (_props: { lobbyMic?: boolean; lobbyCam?: boolean }) => {
  const room = useRoomContext();
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      await new Promise(r => setTimeout(r, 300));      if (cancelled) return;
      try {
        const lp = room.localParticipant;
        if (lp.isMicrophoneEnabled) await lp.setMicrophoneEnabled(false);
        if (lp.isCameraEnabled)     await lp.setCameraEnabled(false);
      } catch {}
    };
    init();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

/* ══ GROUP RECITATION BRIDGE — unmutes / mutes all participants ══ */
const GroupReciteBridge = ({ active, isTeacher }: { active: boolean; isTeacher: boolean }) => {
  const room = useRoomContext();
  const prevRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!isTeacher) return;
    if (prevRef.current === null) { prevRef.current = active; return; }
    if (prevRef.current === active) return;
    prevRef.current = active;
    // Broadcast to all students
    publishData(room, { type: "group_recite", active });
    // Also unmute local mic immediately
    try {
      room.localParticipant.setMicrophoneEnabled(active ? true : true);
    } catch {}
  }, [active, isTeacher, room]);
  return null;
};

/* ══ ROOM DATA LISTENER ══ */
const RoomDataListener = ({
  onWbOpen, onWbClose, strokesBuffer, onMatOpen, onMatClose,
  onWbAllowWrite, onRecAllowed, onEmojiReaction, onGroupRecite, onMatScroll,
}: any) => {
  const room = useRoomContext();
  useEffect(() => {
    const h = (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type === "wb_open")         onWbOpen?.();
        if (msg.type === "wb_close")        onWbClose?.();
        if (msg.type === "wb_strokes")      strokesBuffer.current = msg.strokes;
        if (msg.type === "wb_clear")        strokesBuffer.current = [];
        if (msg.type === "mat_open")        onMatOpen?.(msg.material);
        if (msg.type === "mat_close")       onMatClose?.();
        if (msg.type === "wb_allow_write")  onWbAllowWrite?.(msg.allow);
        if (msg.type === "rec_allowed")     onRecAllowed?.(msg.allow);        if (msg.type === "emoji_reaction")  onEmojiReaction?.(msg.emoji, msg.senderName);
        if (msg.type === "group_recite")    onGroupRecite?.(msg.active);
        if (msg.type === "mat_scroll")      onMatScroll?.(msg.scrollTop, msg.scrollLeft);
      } catch {}
    };
    room.on(RoomEvent.DataReceived, h);
    return () => { room.off(RoomEvent.DataReceived, h); };
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

/* ══ FLOATING EMOJI OVERLAY — shows emojis scrolling up the screen ══ */
interface FloatingEmoji { id: number; emoji: string; x: number; }
const EmojiOverlay = ({ emojis }: { emojis: FloatingEmoji[] }) => {
  if (!emojis.length) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9100, overflow: "hidden" }}>
      {emojis.map(fe => (
        <div key={fe.id} style={{
          position: "absolute",
          bottom: BAR_H + 20,
          left: `${fe.x}%`,
          fontSize: 52,
          lineHeight: 1,
          animation: "emoji-float 2.8s ease-out forwards",
          userSelect: "none",
          filter: "drop-shadow(0 2px 8px rgba(0,0,0,.5))",
        }}>
          {fe.emoji}
        </div>
      ))}
    </div>,
    document.body
  );
};

/* ══ WHITEBOARD ══ */
const Whiteboard = ({ room, onClose, isTeacher, initialStrokes, subjectId, canStudentWrite }: any) => {
  const canDraw = isTeacher || canStudentWrite;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokesRef = useRef<any[]>([]);
  const saveTimer = useRef<any>(null);
  const [color, setColor] = useState("#1a1a1a");
  const [lineWidth, setLineWidth] = useState(4);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [busy, setBusy] = useState(true);
  const redraw = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
    for (const s of strokesRef.current) {
      if (!s.points || s.points.length < 2) continue;
      ctx.beginPath(); ctx.strokeStyle = s.color; ctx.lineWidth = s.lineWidth;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.stroke();
    }
  }, []);
  useEffect(() => { (async () => {
    try {
      const { data } = await supabase.from("subject_whiteboard" as any).select("strokes").eq("subject_id", subjectId).maybeSingle();
      if ((data as any)?.strokes?.length) strokesRef.current = (data as any).strokes;
      else if (initialStrokes?.length) strokesRef.current = initialStrokes;
    } catch { if (initialStrokes?.length) strokesRef.current = initialStrokes; }
    setBusy(false); setTimeout(redraw, 40);
  })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useCallback(() => {
    if (!canDraw) return; clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { await supabase.from("subject_whiteboard" as any).upsert({ subject_id: subjectId, strokes: strokesRef.current, updated_at: new Date().toISOString() }, { onConflict: "subject_id" }); } catch {}
    }, 1200);
  }, [canDraw, subjectId]);
  useEffect(() => {
    if (!room) return;
    const h = (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type === "wb_strokes") { strokesRef.current = msg.strokes; redraw(); }
        if (msg.type === "wb_clear")   { strokesRef.current = []; redraw(); }
      } catch {}
    };
    room.on(RoomEvent.DataReceived, h); return () => room.off(RoomEvent.DataReceived, h);
  }, [room, redraw]);
  const broadcast = useCallback((msg: object) => { publishData(room, msg); }, [room]);
  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvasRef.current!.width / r.width), y: (e.clientY - r.top) * (canvasRef.current!.height / r.height) };
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw) return; drawing.current = true; (e.target as any).setPointerCapture(e.pointerId);
    strokesRef.current.push({ color: tool === "eraser" ? "#fff" : color, lineWidth: tool === "eraser" ? 28 : lineWidth, points: [getPos(e)] });
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !canDraw) return; const s = strokesRef.current[strokesRef.current.length - 1];
    if (s) { s.points.push(getPos(e)); redraw(); }
  };
  const onUp = () => { if (!canDraw || !drawing.current) return; drawing.current = false; broadcast({ type: "wb_strokes", strokes: strokesRef.current }); save(); };
  const clearBoard = () => { if (!canDraw) return; strokesRef.current = []; redraw(); broadcast({ type: "wb_clear" }); save(); };  const COLORS = ["#1a1a1a","#EF4444","#3B82F6","#22C55E","#F59E0B","#8B5CF6","#EC4899","#ffffff"];
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#f8f8f8", display: "flex", flexDirection: "column" }}>
      <div style={{ background: `linear-gradient(135deg,${TEAL2},${TEAL})`, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", flexShrink: 0, boxShadow: "0 2px 16px rgba(0,0,0,.4)", overflowX: "auto" as const }}>
        <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}><X style={{ width: 15, height: 15 }} /></button>
        <PenTool style={{ width: 14, height: 14, color: "rgba(255,255,255,.55)", flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0, marginRight: 4 }}>Whiteboard{!canDraw && <span style={{ fontSize: 10, opacity: .4, marginLeft: 4 }}>View only</span>}</span>
        {canDraw && <>
          {[{ id: "pen", icon: "✏️" }, { id: "eraser", icon: "⬜" }].map(t => (
            <button key={t.id} onClick={() => setTool(t.id as any)} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: tool === t.id ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.1)", fontSize: 14, cursor: "pointer", flexShrink: 0 }}>{t.icon}</button>
          ))}
          {COLORS.map(col => (
            <button key={col} onClick={() => { setColor(col); setTool("pen"); }} style={{ width: 20, height: 20, borderRadius: "50%", background: col, border: color === col && tool === "pen" ? "3px solid #fff" : "2px solid rgba(255,255,255,.2)", cursor: "pointer", flexShrink: 0 }} />
          ))}
          <input type="range" min={1} max={24} value={lineWidth} onChange={e => setLineWidth(+e.target.value)} style={{ width: 52, accentColor: "#fff", flexShrink: 0 }} />
          {isTeacher && <button onClick={clearBoard} style={{ height: 28, padding: "0 10px", borderRadius: 8, border: "none", background: "#EF4444", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>✕ Clear</button>}
        </>}
      </div>
      <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#fff" }}>
        {busy && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", zIndex: 5 }}><Loader2 style={{ width: 32, height: 32, color: TEAL, animation: "wb-spin .8s linear infinite" }} /></div>}
        <canvas ref={canvasRef} width={1600} height={1000} style={{ width: "100%", height: "100%", display: "block", cursor: canDraw ? (tool === "eraser" ? "cell" : "crosshair") : "default", touchAction: "none" }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onPointerCancel={onUp} />
      </div>
    </div>,
    document.body
  );
};
const WhiteboardBridge = ({ onClose, isTeacher, initialStrokes, subjectId, canStudentWrite }: any) => {
  const room = useRoomContext();
  return <Whiteboard room={room} onClose={onClose} isTeacher={isTeacher} initialStrokes={initialStrokes} subjectId={subjectId} canStudentWrite={canStudentWrite} />;
};

/* ══ MATERIAL VIEWER — with scroll sync ══ */
const MaterialViewer = ({ material, isTeacher, onClose, onScroll }: any) => {
  const url = material.file_url || material.url || "";
  const title = material.title || material.name || "Material";
  const isYT  = url.includes("youtube.com") || url.includes("youtu.be");
  const isPdf = url.toLowerCase().includes(".pdf") || (material.material_type || "").includes("pdf");
  const isImg = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
  const isVid = /\.(mp4|webm|ogg|mov)$/i.test(url);
  const ytId  = (u: string) => { const m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/); return m ? m[1] : ""; };
  const scrollRef = useRef<HTMLDivElement>(null);

  // Teacher: broadcast scroll position on scroll
  const handleScroll = useCallback(() => {
    if (!isTeacher || !scrollRef.current) return;
    onScroll?.(scrollRef.current.scrollTop, scrollRef.current.scrollLeft);
  }, [isTeacher, onScroll]);

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "#000", display: "flex", flexDirection: "column" }}>      <div style={{ height: 52, background: `rgba(6,78,59,.97)`, display: "flex", alignItems: "center", padding: "0 14px", gap: 10 }}>
        <BookOpen style={{ width: 18, height: 18, color: "#fff" }} />
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 15, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        {!isTeacher && <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)", display: "flex", alignItems: "center", gap: 4 }}><MonitorPlay style={{ width: 12, height: 12 }} /> Synced with teacher</span>}
        <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(255,255,255,.12)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}><X style={{ width: 15, height: 15 }} /></button>
      </div>
      <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflow: "auto" }}>
        {isYT  && <iframe src={`https://www.youtube.com/embed/${ytId(url)}?autoplay=1`} style={{ width: "100%", height: "100%", border: "none" }} allow="autoplay;fullscreen" allowFullScreen />}
        {isPdf && !isYT && <iframe src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`} style={{ width: "100%", height: "100%", border: "none" }} />}
        {isImg && <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><img src={url} alt={title} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /></div>}
        {isVid && <video src={url} controls autoPlay playsInline style={{ width: "100%", height: "100%", background: "#000" }} />}
        {!isYT && !isPdf && !isImg && !isVid && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16 }}>
            <BookOpen style={{ width: 52, height: 52, color: "rgba(255,255,255,.25)" }} />
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>{title}</p>
            <a href={url} target="_blank" rel="noreferrer" style={{ background: TEAL, color: "#fff", padding: "12px 28px", borderRadius: 12, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>Open File ↗</a>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

/* ══ MATERIAL VIEWER BRIDGE — gives teacher room context for scroll broadcast ══ */
const MatViewerBridge = ({ material, isTeacher, onClose }: any) => {
  const room = useRoomContext();
  const handleScroll = useCallback((scrollTop: number, scrollLeft: number) => {
    publishData(room, { type: "mat_scroll", scrollTop, scrollLeft });
  }, [room]);
  return <MaterialViewer material={material} isTeacher={isTeacher} onClose={() => onClose(room)} onScroll={handleScroll} />;
};

/* ══ MATERIAL VIEWER STUDENT — receives scroll sync ══ */
const MatViewerStudent = ({ material, onClose, scrollPos }: any) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const url = material.file_url || material.url || "";
  const title = material.title || material.name || "Material";
  const isYT  = url.includes("youtube.com") || url.includes("youtu.be");
  const isPdf = url.toLowerCase().includes(".pdf") || (material.material_type || "").includes("pdf");
  const isImg = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
  const isVid = /\.(mp4|webm|ogg|mov)$/i.test(url);
  const ytId  = (u: string) => { const m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/); return m ? m[1] : ""; };

  // Apply incoming scroll position from teacher
  useEffect(() => {
    if (!scrollRef.current || !scrollPos) return;
    scrollRef.current.scrollTop  = scrollPos.top;
    scrollRef.current.scrollLeft = scrollPos.left;
  }, [scrollPos]);
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "#000", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 52, background: `rgba(6,78,59,.97)`, display: "flex", alignItems: "center", padding: "0 14px", gap: 10 }}>
        <BookOpen style={{ width: 18, height: 18, color: "#fff" }} />
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 15, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)", display: "flex", alignItems: "center", gap: 4 }}><MonitorPlay style={{ width: 12, height: 12 }} /> Synced</span>
        <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(255,255,255,.12)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}><X style={{ width: 15, height: 15 }} /></button>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflow: "auto" }}>
        {isYT  && <iframe src={`https://www.youtube.com/embed/${ytId(url)}?autoplay=1`} style={{ width: "100%", height: "100%", border: "none" }} allow="autoplay;fullscreen" allowFullScreen />}
        {isPdf && !isYT && <iframe src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`} style={{ width: "100%", height: "100%", border: "none" }} />}
        {isImg && <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><img src={url} alt={title} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /></div>}
        {isVid && <video src={url} controls autoPlay playsInline style={{ width: "100%", height: "100%", background: "#000" }} />}
        {!isYT && !isPdf && !isImg && !isVid && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16 }}>
            <BookOpen style={{ width: 52, height: 52, color: "rgba(255,255,255,.25)" }} />
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>{title}</p>
            <a href={url} target="_blank" rel="noreferrer" style={{ background: TEAL, color: "#fff", padding: "12px 28px", borderRadius: 12, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>Open File ↗</a>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

/* ══ MATERIAL PICKER ══ */
const MaterialPicker = ({ subjectId, onShare, onClose }: any) => {
  const [mats, setMats] = useState<any[]>([]); const [busy, setBusy] = useState(true);
  useEffect(() => { supabase.from("subject_materials").select("*").eq("subject_id", subjectId).order("created_at", { ascending: false }).then(({ data }) => { setMats(data || []); setBusy(false); }); }, [subjectId]);
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9997, background: "rgba(0,0,0,.72)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div style={{ width: "100%", background: "#17202a", borderRadius: "22px 22px 0 0", maxHeight: "70vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", gap: 10 }}>
          <BookOpen style={{ width: 17, height: 17, color: TEAL }} />
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 15, flex: 1 }}>Share Material with Class</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,.4)", cursor: "pointer" }}><X style={{ width: 17, height: 17 }} /></button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {busy && <div style={{ display: "flex", justifyContent: "center", padding: 28 }}><Loader2 style={{ width: 24, height: 24, color: TEAL, animation: "wb-spin .8s linear infinite" }} /></div>}
          {!busy && !mats.length && <p style={{ textAlign: "center", padding: "28px", color: "rgba(255,255,255,.35)", fontSize: 14 }}>No materials for this subject</p>}
          {mats.map(m => (
            <button key={m.id} onClick={() => onShare(m)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left" as const, borderBottom: "1px solid rgba(255,255,255,.06)" }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(10,124,104,.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><BookOpen style={{ width: 17, height: 17, color: "#4ade80" }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: "#fff", fontWeight: 600, fontSize: 14, margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{m.title || m.name || "Untitled"}</p>
                <p style={{ color: "rgba(255,255,255,.35)", fontSize: 11, margin: 0, textTransform: "capitalize" as const }}>{m.material_type || "file"}</p>
              </div>
              <span style={{ fontSize: 12, color: TEAL, fontWeight: 700 }}>Share →</span>            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};

/* ══ RECORDING CONTROLLER (teacher/admin only) ══ */
const RecController = ({ sessionId, subjectId, userEmail, onSavingChange }: any) => {
  const room = useRoomContext(); const { t } = useLanguage();
  const [recording, setRecording] = useState(false); const [paused, setPaused] = useState(false); const [time, setTime] = useState(0);
  const timerRef = useRef<any>(null); const mrRef = useRef<MediaRecorder | null>(null); const chunksRef = useRef<Blob[]>([]);
  const collectAudio = useCallback(() => {
    try {
      const ac = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
      ac.resume().catch(() => {});
      const dest = ac.createMediaStreamDestination(); let n = 0;
      [room.localParticipant, ...Array.from(room.remoteParticipants.values())].forEach((p: any) => {
        p.trackPublications?.forEach?.((pub: any) => {
          if (pub.kind === "audio" && pub.track?.mediaStreamTrack) {
            ac.createMediaStreamSource(new MediaStream([pub.track.mediaStreamTrack])).connect(dest); n++;
          }
        });
      });
      return n > 0 ? dest.stream : null;
    } catch { return null; }
  }, [room]);
  const startRec = async () => {
    try {
      let audio = collectAudio();
      if (!audio) {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        audio = s;
      }
      const mime = ["audio/webm;codecs=opus","audio/webm","audio/mp4"].find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) || "";
      const mr = new MediaRecorder(audio, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(1000); mrRef.current = mr; setRecording(true);
      timerRef.current = setInterval(() => setTime(t => t + 1), 1000);
    } catch { toast({ title: "Recording failed — check mic permissions" }); }
  };
  const stopRec = () => {
    mrRef.current?.stop();
    mrRef.current!.onstop = async () => {
      const bt = mrRef.current?.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: bt });
      const ext = bt.includes("mp4") ? "mp4" : bt.includes("ogg") ? "ogg" : "webm";      const path = `sessions/${subjectId}/rec-${Date.now()}.${ext}`;
      onSavingChange?.(true);
      try {
        const { error } = await storageSupabase.storage.from("recordings").upload(path, blob, { upsert: true });
        if (!error) {
          await supabase.from("session_recordings" as any).insert({ session_id: sessionId, subject_id: subjectId, file_path: path, recorded_by: userEmail, duration_seconds: time });
          toast({ title: "✅ Recording saved" });
        } else {
          const a = document.createElement("a"); const u = URL.createObjectURL(blob);
          a.href = u; a.download = `class-recording-${Date.now()}.${ext}`; a.click(); URL.revokeObjectURL(u);
        }
      } catch { const a = document.createElement("a"); const u = URL.createObjectURL(blob); a.href = u; a.download = `rec.${ext}`; a.click(); URL.revokeObjectURL(u); }
      finally { onSavingChange?.(false); }
    };
    clearInterval(timerRef.current); setTime(0); setRecording(false); setPaused(false);
  };
  const togglePause = () => {
    if (!mrRef.current) return;
    if (paused) { mrRef.current.resume(); setPaused(false); } else { mrRef.current.pause(); setPaused(true); }
  };
  const fmtT = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {recording && <>
        <span style={{ fontSize: 11, color: paused ? "#facc15" : RED, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtT(time)}</span>
        <button onClick={togglePause} style={{ background: GLASSB, border: "none", borderRadius: 8, padding: "4px 10px", color: "#fff", fontSize: 12, cursor: "pointer" }}>{paused ? <Play style={{ width: 12, height: 12 }} /> : <Pause style={{ width: 12, height: 12 }} />}</button>
        <button onClick={stopRec} style={{ background: "rgba(239,68,68,.25)", border: "none", borderRadius: 8, padding: "4px 10px", color: RED, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Stop</button>
      </>}
      {!recording && <button onClick={startRec} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(239,68,68,.14)", border: "1px solid rgba(239,68,68,.35)", borderRadius: 20, padding: "5px 14px", color: "#fca5a5", fontSize: 12, fontWeight: 700, cursor: "pointer" }}><Circle style={{ width: 7, height: 7, fill: RED, color: RED }} /> Record</button>}
    </div>
  );
};

/* ══ PARTICIPANT TILE ══ */
const ParticipantTile = ({ participant, isLocal, size = "normal" }: { participant: any; isLocal: boolean; size?: "normal" | "large" | "small" }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(false); const [isSpeaking, setIsSpeaking] = useState(false); const [micEnabled, setMicEnabled] = useState(true);
  const room = useRoomContext();
  useEffect(() => {
    const update = () => {
      const camPub = participant.getTrackPublication?.(Track.Source.Camera) || participant.trackPublications?.get(Track.Source.Camera);
      const track = camPub?.videoTrack || camPub?.track;
      if (track?.mediaStreamTrack?.readyState === "live" && videoRef.current) {
        const ms = new MediaStream([track.mediaStreamTrack]); videoRef.current.srcObject = ms;
        if (isLocal) videoRef.current.muted = true;
        const pp = videoRef.current.play(); if (pp !== undefined) pp.catch(() => {}); setHasVideo(true);
      } else { if (videoRef.current) videoRef.current.srcObject = null; setHasVideo(false); }
      const micPub = participant.getTrackPublication?.(Track.Source.Microphone) || participant.trackPublications?.get(Track.Source.Microphone);
      setMicEnabled(!(micPub?.isMuted ?? false));
    };    update(); const onSpeak = (v: boolean) => setIsSpeaking(v);
    participant.on?.("trackSubscribed", update); participant.on?.("trackUnsubscribed", update); participant.on?.("trackMuted", update); participant.on?.("trackUnmuted", update); participant.on?.("isSpeakingChanged", onSpeak);
    return () => { participant.off?.("trackSubscribed", update); participant.off?.("trackUnsubscribed", update); participant.off?.("trackMuted", update); participant.off?.("trackUnmuted", update); participant.off?.("isSpeakingChanged", onSpeak); };
  }, [participant]);
  const toggleMyMic = async () => { if (!isLocal) return; const next = !micEnabled; await room.localParticipant.setMicrophoneEnabled(next); setMicEnabled(next); };
  const name = participant.name || participant.identity || "User";
  const initials = name.split(" ").map((w: string) => w[0] || "").join("").slice(0, 2).toUpperCase() || "?";
  const avatarSz = size === "large" ? 72 : size === "small" ? 36 : 52;
  const fontSize = size === "large" ? 28 : size === "small" ? 14 : 20;
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "linear-gradient(145deg,#1a2035,#0e1420)", borderRadius: size === "small" ? 10 : 14, overflow: "hidden", border: isSpeaking ? `2px solid ${GREEN}` : "2px solid rgba(255,255,255,.06)", transition: "border-color .2s,box-shadow .2s", boxShadow: isSpeaking ? `0 0 0 2px ${GREEN}44,0 4px 24px rgba(34,197,94,.25)` : "0 2px 12px rgba(0,0,0,.4)" }}>
      <video ref={videoRef} autoPlay playsInline muted={isLocal} style={{ width: "100%", height: "100%", objectFit: "cover", display: hasVideo ? "block" : "none", transform: isLocal ? "scaleX(-1)" : "none" }} />
      {!hasVideo && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg,#0e1a14,#1a2e22)" }}>
        <div style={{ width: avatarSz, height: avatarSz, borderRadius: "50%", background: `linear-gradient(135deg,${TEAL},#064E3B)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize, fontWeight: 800, color: "#fff", border: isSpeaking ? `3px solid ${GREEN}` : "3px solid rgba(255,255,255,.1)", boxShadow: isSpeaking ? `0 0 16px ${GREEN}55` : "none", transition: "border-color .2s,box-shadow .2s" }}>{initials}</div>
      </div>}
      {isSpeaking && hasVideo && <div style={{ position: "absolute", inset: 0, border: `3px solid ${GREEN}`, borderRadius: "inherit", pointerEvents: "none" }} />}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "22px 10px 8px", background: "linear-gradient(transparent,rgba(0,0,0,.72))", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ flex: 1, fontSize: size === "small" ? 10 : 12, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}{isLocal ? " (You)" : ""}</span>
        {isSpeaking && <div style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: 14 }}>{[.4, .7, 1, .6].map((h, i) => (<div key={i} style={{ width: 3, borderRadius: 2, background: GREEN, height: `${h * 14}px`, animation: `speaking .6s ease-in-out infinite`, animationDelay: `${i * .12}s` }} />))}</div>}
        <button onClick={isLocal ? toggleMyMic : undefined} style={{ width: 24, height: 24, borderRadius: "50%", background: micEnabled ? "rgba(34,197,94,.2)" : "rgba(239,68,68,.3)", border: "none", cursor: isLocal ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, backdropFilter: "blur(4px)" }}>
          {micEnabled ? <Mic style={{ width: 11, height: 11, color: GREEN }} /> : <MicOff style={{ width: 11, height: 11, color: RED }} />}
        </button>
      </div>
    </div>
  );
};

/* ══ VIDEO GRID — vertical stacking for 2 participants ══ */
const VideoGrid = () => {
  const { localParticipant } = useLocalParticipant(); const allParticipants = useParticipants();
  const remotes = allParticipants.filter(p => p.identity !== localParticipant?.identity);
  const all = localParticipant ? [localParticipant, ...remotes] : remotes; const n = all.length;
  const screensharer = all.find(p => { const pub = p.getTrackPublication?.(Track.Source.ScreenShare) || p.trackPublications?.get(Track.Source.ScreenShare); return pub?.track && !pub.isMuted; });
  const gap = 6;

  // Screen share layout: big + strip
  if (screensharer) return (
    <div style={{ width: "100%", height: "100%", display: "flex", gap, padding: gap, boxSizing: "border-box" }}>
      <div style={{ flex: 1, borderRadius: 14, overflow: "hidden", minWidth: 0 }}><ParticipantTile participant={screensharer} isLocal={screensharer.identity === localParticipant?.identity} size="large" /></div>
      <div style={{ width: 110, display: "flex", flexDirection: "column", gap, overflowY: "auto" }}>
        {all.map(p => (<div key={p.identity} style={{ height: 82, flexShrink: 0 }}><ParticipantTile participant={p} isLocal={p.identity === localParticipant?.identity} size="small" /></div>))}
      </div>
    </div>
  );

  // ─ For 2 participants: VERTICAL STACK (full width each) ─
  if (n === 2) return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap, padding: gap, boxSizing: "border-box" }}>
      {all.map(p => (
        <div key={p.identity} style={{ flex: 1, minHeight: 0 }}>          <ParticipantTile participant={p} isLocal={p.identity === localParticipant?.identity} size="large" />
        </div>
      ))}
    </div>
  );

  // 1 participant: full screen
  if (n <= 1) return (
    <div style={{ width: "100%", height: "100%", padding: gap, boxSizing: "border-box" }}>
      {all.map(p => <ParticipantTile key={p.identity} participant={p} isLocal={p.identity === localParticipant?.identity} size="large" />)}
    </div>
  );

  // 3-4: 2 columns
  // 5+: 3 columns
  const cols = n <= 4 ? 2 : n <= 6 ? 3 : n <= 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  return (
    <div style={{ width: "100%", height: "100%", display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gridTemplateRows: `repeat(${rows},1fr)`, gap, padding: gap, boxSizing: "border-box" }}>
      {all.map(p => (<ParticipantTile key={p.identity} participant={p} isLocal={p.identity === localParticipant?.identity} size={n <= 4 ? "normal" : "small"} />))}
    </div>
  );
};

/* ══ BOTTOM BAR ══ */
const BottomBar = ({ sessionId, onToggleChat, onToggleParticipants, onEndClass, onLeaveClass, chatUnread, onToggleWhiteboard, whiteboardOpen, onGroupRecite, groupReciteMode, onShareMaterial, isPrivileged, canStudentWriteProp, canStudentRecProp, onPermChange, onMinimize, room, isMobile, onToggleMaterials, matPanelOpen, onSendEmoji }: any) => {
  const { user } = useAuth();
  const [micOn,   setMicOn]   = useState(false);
  const [camOn,   setCamOn]   = useState(false);
  const [handUp,  setHandUp]  = useState(false);
  const [menu,    setMenu]    = useState(false);
  const [emojis,  setEmojis]  = useState(false);
  const [stuRec,  setStuRec]  = useState(false);
  const stuMrRef  = useRef<MediaRecorder | null>(null);
  const stuChunks = useRef<Blob[]>([]);

  // Sync mic/cam state from room events
  useEffect(() => {
    if (!room) return;
    const sync = () => { setMicOn(room.localParticipant.isMicrophoneEnabled); setCamOn(room.localParticipant.isCameraEnabled); };
    sync();
    room.localParticipant.on("trackMuted", sync); room.localParticipant.on("trackUnmuted", sync);
    room.localParticipant.on("trackPublished", sync); room.localParticipant.on("trackUnpublished", sync);
    const t1 = setTimeout(sync, 500); const t2 = setTimeout(sync, 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); room.localParticipant.off("trackMuted", sync); room.localParticipant.off("trackUnmuted", sync); room.localParticipant.off("trackPublished", sync); room.localParticipant.off("trackUnpublished", sync); };
  }, [room]);

  const toggleMic = async () => { const n = !micOn; await room?.localParticipant?.setMicrophoneEnabled(n); setMicOn(n); };
  const toggleCam = async () => { const n = !camOn; await room?.localParticipant?.setCameraEnabled(n); setCamOn(n); };
  const toggleHand = async () => {    if (!user || !sessionId) return; const n = !handUp; setHandUp(n);
    await supabase.from("class_participants").update({ hand_raised: n, hand_raised_at: n ? new Date().toISOString() : null }).eq("session_id", sessionId).eq("student_id", user.id);
  };
  const openWhiteboard = () => { onToggleWhiteboard(); };

  // Student recording
  const toggleStuRecord = async () => {
    if (stuRec) {
      stuMrRef.current?.stop();
      stuMrRef.current!.onstop = () => {
        const bt = stuMrRef.current?.mimeType || "audio/webm";
        const blob = new Blob(stuChunks.current, { type: bt });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const ext = bt.includes("mp4") ? "mp4" : bt.includes("ogg") ? "ogg" : "webm";
        a.href = url; a.download = `class-recording-${Date.now()}.${ext}`; a.click(); URL.revokeObjectURL(url);
        stuChunks.current = [];
      };
      setStuRec(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const stuMime = ["audio/webm", "audio/mp4", "audio/ogg"].find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) || "";
        const mr = new MediaRecorder(stream, stuMime ? { mimeType: stuMime } : undefined);
        stuChunks.current = []; mr.ondataavailable = e => { if (e.data.size > 0) stuChunks.current.push(e.data); };
        mr.start(1000); stuMrRef.current = mr; setStuRec(true);
      } catch { toast({ title: "Microphone access denied" }); }
    }
  };

  // Send emoji — broadcasts via data channel so all see it
  const sendEmoji = (e: string) => {
    setEmojis(false);
    onSendEmoji?.(e); // bubbles up to main component which broadcasts
  };

  const IS = { width: isMobile ? 16 : 20, height: isMobile ? 16 : 20 };
  const btnSize = isMobile ? 42 : 52;

  const Btn = ({ children, active = false, danger = false, onClick, badge = 0, title: ttl = "", highlight = "" }: any) => (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
      <button title={ttl} onClick={onClick} style={{ width: btnSize, height: btnSize, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: danger ? "rgba(239,68,68,.85)" : active ? "rgba(255,255,255,.18)" : highlight ? `rgba(${highlight},.22)` : "rgba(255,255,255,.09)", color: "#fff", transition: "background .15s,transform .1s", backdropFilter: "blur(4px)", boxShadow: active && !danger ? "inset 0 0 0 2px rgba(255,255,255,.2)" : "none", flexShrink: 0 }}
        onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.08)")} onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}>{children}</button>
      {badge > 0 && <span style={{ position: "absolute", top: 0, right: 0, background: RED, color: "#fff", borderRadius: "50%", width: 17, height: 17, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, border: `2px solid ${DARK}` }}>{badge}</span>}
    </div>
  );

  const menuPortal = typeof document !== "undefined" ? document.body : null;

  return (    <>
      {/* Emoji picker popup */}
      {emojis && menuPortal && createPortal(
        <div style={{ position: "fixed", bottom: BAR_H + 12, left: "50%", transform: "translateX(-50%)", background: "#1e2535", border: "1px solid rgba(255,255,255,.1)", borderRadius: 44, padding: "10px 16px", display: "flex", gap: 10, zIndex: 9000, boxShadow: "0 8px 32px rgba(0,0,0,.6)", animation: "slide-up .2s ease" }}>
          {["👏", "🤲", "❤️", "😂", "🌟", "👍", "🙏", "🕌"].map(e => (
            <button key={e} onClick={() => sendEmoji(e)} style={{ fontSize: 28, background: "none", border: "none", cursor: "pointer", padding: "2px 4px", transition: "transform .12s" }}
              onMouseEnter={ev => (ev.currentTarget.style.transform = "scale(1.28)")} onMouseLeave={ev => (ev.currentTarget.style.transform = "scale(1)")}>{e}</button>
          ))}
        </div>,
        menuPortal
      )}

      {/* More menu */}
      {menu && menuPortal && createPortal(
        <div onClick={() => setMenu(false)} style={{ position: "fixed", bottom: BAR_H + 10, right: 14, background: "#17202a", border: "1px solid rgba(255,255,255,.08)", borderRadius: 18, boxShadow: "0 8px 36px rgba(0,0,0,.65)", minWidth: 230, zIndex: 9000, overflow: "hidden", animation: "slide-up .18s ease" }}>
          {isPrivileged && [
            { icon: Volume2, label: groupReciteMode ? "End Group Recitation" : "Group Recitation", color: groupReciteMode ? GREEN : "#fff", fn: onGroupRecite },
            { icon: BookOpen, label: "Share Material", color: "#fff", fn: onShareMaterial },
            { icon: PenTool, label: canStudentWriteProp ? "Revoke Write Access" : "Allow Students to Write", color: canStudentWriteProp ? GREEN : "#fff", fn: () => onPermChange?.("write", !canStudentWriteProp, room) },
            { icon: Circle, label: canStudentRecProp ? "Revoke Record Permission" : "Allow Students to Record", color: canStudentRecProp ? GREEN : "#fff", fn: () => onPermChange?.("rec", !canStudentRecProp, room) },
          ].map((item, i) => (
            <button key={i} onClick={item.fn} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", background: "none", border: "none", cursor: "pointer", color: item.color, fontSize: 14, borderBottom: "1px solid rgba(255,255,255,.06)", textAlign: "left" as const }}>
              <item.icon style={{ width: 16, height: 16 }} /> {item.label}
            </button>
          ))}
          <button onClick={() => { setMenu(false); onToggleParticipants(); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", background: "none", border: "none", cursor: "pointer", color: "#fff", fontSize: 14, borderBottom: "1px solid rgba(255,255,255,.06)", textAlign: "left" as const }}><Users style={{ width: 16, height: 16 }} /> Participants</button>
          <button onClick={isPrivileged ? onEndClass : onLeaveClass} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", background: "none", border: "none", cursor: "pointer", color: RED, fontSize: 14, textAlign: "left" as const }}>📵 {isPrivileged ? "End Class for All" : "Leave Class"}</button>
        </div>,
        menuPortal
      )}

      {/* Main bar — horizontally scrollable on mobile */}
      <div
        className="cv-bar"
        style={{
          height: isMobile ? 60 : BAR_H,
          minHeight: isMobile ? 60 : BAR_H,
          background: GLASS, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(255,255,255,.07)",
          display: "flex", alignItems: "center",
          justifyContent: isMobile ? "flex-start" : "center",
          gap: isMobile ? 6 : 10,
          padding: `0 ${isMobile ? 8 : 16}px calc(${isMobile ? 4 : 8}px + env(safe-area-inset-bottom,0px)) ${isMobile ? 8 : 16}px`,
          flexShrink: 0,
          boxShadow: "0 -4px 24px rgba(0,0,0,.45)",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          minWidth: 0,
        }}
      >        {/* Always-visible core buttons */}
        <Btn active={micOn} danger={!micOn} title={micOn ? "Mute" : "Unmute"} onClick={toggleMic}>{micOn ? <Mic style={IS} /> : <MicOff style={IS} />}</Btn>
        <Btn active={camOn} danger={!camOn} title={camOn ? "Stop Video" : "Start Video"} onClick={toggleCam}>{camOn ? <Video style={IS} /> : <VideoOff style={IS} />}</Btn>

        {/* Whiteboard — teacher: always shown; student: shown only when write access granted */}
        {(isPrivileged || canStudentWriteProp) && (
          <Btn active={whiteboardOpen} title="Whiteboard" onClick={openWhiteboard} highlight={canStudentWriteProp && !isPrivileged ? "74,222,128" : ""}>
            <PenTool style={{ ...IS, color: whiteboardOpen ? "#4ade80" : (canStudentWriteProp && !isPrivileged ? "#4ade80" : "#fff") }} />
          </Btn>
        )}

        {/* Raise hand — students only */}
        {!isPrivileged && (
          <Btn active={handUp} title={handUp ? "Lower Hand" : "Raise Hand"} onClick={toggleHand}>
            <Hand style={{ ...IS, color: handUp ? "#fbbf24" : "#fff" }} />
          </Btn>
        )}

        {/* Student record — only shown when admin grants permission */}
        {!isPrivileged && canStudentRecProp && (
          <Btn active={stuRec} title={stuRec ? "Stop Recording" : "Record Class"} onClick={toggleStuRecord} highlight={stuRec ? "239,68,68" : "34,197,94"}>
            <Circle style={{ ...IS, fill: stuRec ? RED : GREEN, color: stuRec ? RED : GREEN }} />
          </Btn>
        )}

        <Btn onClick={onToggleChat} badge={chatUnread} title="Chat"><MessageCircle style={IS} /></Btn>
        <Btn active={matPanelOpen} onClick={onToggleMaterials} title="Materials"><Eye style={{ ...IS, color: matPanelOpen ? "#34d399" : "#fff" }} /></Btn>
        <Btn onClick={() => setEmojis(v => !v)} title="React"><Smile style={IS} /></Btn>
        <Btn onClick={() => setMenu(v => !v)} title="More"><MoreVertical style={IS} /></Btn>
        {onMinimize && <Btn onClick={onMinimize} title="Minimize"><ChevronDown style={IS} /></Btn>}

        {/* End / Leave button */}
        <button
          onClick={isPrivileged ? onEndClass : onLeaveClass}
          style={{ height: isMobile ? 42 : 52, padding: isMobile ? "0 12px" : "0 22px", borderRadius: 26, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#dc2626,#ef4444)", color: "#fff", display: "flex", alignItems: "center", gap: isMobile ? 4 : 7, fontWeight: 700, fontSize: isMobile ? 12 : 14, boxShadow: "0 4px 18px rgba(239,68,68,.5)", flexShrink: 0 }}>
          <Phone style={{ width: 17, height: 17, transform: "rotate(135deg)" }} /> {isPrivileged ? "End" : "Leave"}
        </button>
      </div>
    </>
  );
};
const BottomBarBridge = (props: any) => { const room = useRoomContext(); const isMobile = useIsMobile(); return <BottomBar {...props} room={room} isMobile={isMobile} />; };

/* ══ MAIN CLASSROOM VIEW ══ */
const ClassroomView = ({ subject, onLeave, onMinimize, autoJoin = false }: ClassroomViewProps) => {
  const { user, hasRole } = useAuth(); const { t } = useLanguage(); const isMobile = useIsMobile();
  const isPrivileged = hasRole("admin") || hasRole("teacher");

  const [phase,        setPhase]        = useState<"lobby" | "live" | "ended">("lobby");
  const [token,        setToken]        = useState<string | null>(null);  const [wsUrl,        setWsUrl]        = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [lobbyMic,     setLobbyMic]     = useState(true);
  const [lobbyCam,     setLobbyCam]     = useState(true);
  const wakeLockRef = useRef<any>(null);

  // Wake lock — prevent screen sleep during class
  useEffect(() => {
    if (phase !== "live") return;
    const acquire = async () => { try { if ("wakeLock" in navigator) wakeLockRef.current = await (navigator as any).wakeLock.request("screen"); } catch {} };
    acquire();
    const onVis = () => { if (document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); wakeLockRef.current?.release().catch(() => {}); };
  }, [phase]);

  const [sessionId,      setSessionId]      = useState<string | null>(null);
  const [sessionInfo,    setSessionInfo]    = useState<any>(null);
  const [attendanceId,   setAttendanceId]   = useState<string | null>(null);
  const [joinedAt]                          = useState(Date.now());
  const [savingRec,      setSavingRec]      = useState(false);
  const [isSessionLive,  setIsSessionLive]  = useState(false);
  const [duration,       setDuration]       = useState(0);
  const [chatOpen,       setChatOpen]       = useState(false);
  const [partOpen,       setPartOpen]       = useState(false);
  const [chatUnread,     setChatUnread]     = useState(0);
  const [sideTab,        setSideTab]        = useState<"chat" | "polls">("chat");
  const [showEnd,        setShowEnd]        = useState(false);
  const [wbOpen,         setWbOpen]         = useState(false);
  const [matOpen,        setMatOpen]        = useState<any>(null);
  const [matPicker,      setMatPicker]      = useState(false);
  const [matPanelOpen,   setMatPanelOpen]   = useState(false);
  const [groupRecite,    setGroupRecite]    = useState(false);
  const [canStudentWrite,setCanStudentWrite] = useState(false);
  const [canStudentRec,  setCanStudentRec]  = useState(false);
  const [matScrollPos,   setMatScrollPos]   = useState<{ top: number; left: number } | null>(null);

  // Floating emoji state
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const emojiIdRef = useRef(0);

  const wbBuffer = useRef<any[] | null>(null);
  const prefetch = useRef<{ token: string; url: string } | null>(null);

  // Prefetch token
  useEffect(() => {
    supabase.functions.invoke("livekit-token", { body: { subject_id: subject.id, action: isPrivileged ? "start_session" : "join" } })
      .then(({ data }) => { if (data?.token && data?.url) prefetch.current = { token: data.token, url: data.url }; })      .catch(() => {});
  }, [subject.id, isPrivileged]);

  // Auto-join (page restore)
  useEffect(() => {
    if (!autoJoin) return;
    const t = setTimeout(() => { if (phase === "lobby" && !loading && !error) connect(isPrivileged ? "start_session" : "join"); }, 120);
    return () => clearTimeout(t);
  }, [autoJoin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for live session
  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.from("live_sessions").select("*").eq("subject_id", subject.id).eq("status", "live").maybeSingle();
      if (data) { setSessionInfo(data); setSessionId(data.id); setIsSessionLive(true); } else setIsSessionLive(false);
    };
    check(); const iv = setInterval(check, 4000); return () => clearInterval(iv);
  }, [subject.id]);

  // Duration counter
  useEffect(() => { if (phase !== "live") return; const ti = setInterval(() => setDuration(d => d + 1), 1000); return () => clearInterval(ti); }, [phase]);

  // Chat unread
  useEffect(() => {
    if (!sessionId || phase !== "live") return;
    const ch = supabase.channel(`chat-unread-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "class_chat_messages", filter: `session_id=eq.${sessionId}` }, (payload: any) => {
        if (payload.new?.sender_id === user?.id) return;
        if (payload.new?.type === "system") return;
        setChatUnread(n => chatOpen ? 0 : n + 1);
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, phase, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Media Session API (Android notification shade)
  useEffect(() => {
    if (phase !== "live" || !("mediaSession" in navigator)) return;
    try {
      (navigator as any).mediaSession.metadata = new (window as any).MediaMetadata({ title: subject.title, artist: "Tahleem Academy — Live Class", album: "In Progress" });
      (navigator as any).mediaSession.playbackState = "playing";
      (navigator as any).mediaSession.setActionHandler("stop", () => leaveSession());
      (navigator as any).mediaSession.setActionHandler("pause", () => {});
    } catch {}
    return () => { try { (navigator as any).mediaSession.playbackState = "none"; } catch {} };
  }, [phase, subject.title]); // eslint-disable-line react-hooks/exhaustive-deps

  // Add floating emoji for everyone (local trigger or received from data channel)
  const spawnEmoji = useCallback((emoji: string) => {
    const id = ++emojiIdRef.current;
    const x = 10 + Math.random() * 80; // random horizontal position 10-90%    setFloatingEmojis(prev => [...prev, { id, emoji, x }]);
    setTimeout(() => setFloatingEmojis(prev => prev.filter(e => e.id !== id)), 3000);
  }, []);

  const handleEmojiReaction = useCallback((emoji: string) => { spawnEmoji(emoji); }, [spawnEmoji]);

  const handleGroupReciteReceived = useCallback(async (active: boolean) => {
    setGroupRecite(active);
    // Students: unmute mic when group recitation starts
    if (!isPrivileged) {
      toast({ title: active ? "🎙️ Group Recitation — your mic is now open" : "🔇 Group Recitation ended" });
    }
  }, [isPrivileged]);

  const connect = async (action: string, settings?: any, mediaSettings?: { micOn: boolean; cameraOn: boolean }) => {
    if (mediaSettings) { setLobbyMic(mediaSettings.micOn); setLobbyCam(mediaSettings.cameraOn); }
    setLoading(true); setError(null);
    try {
      let tk = prefetch.current?.token || null, url = prefetch.current?.url || null;
      if (!tk || !url) {
        const { data, error: e } = await supabase.functions.invoke("livekit-token", { body: { subject_id: subject.id, action } });
        if (e) throw e; if (data?.error) throw new Error(data.error); tk = data.token; url = data.url;
      }
      if (settings && sessionId) await supabase.from("live_sessions").update({ ...settings, actual_start_time: new Date().toISOString(), status: "live" }).eq("id", sessionId);
      setToken(tk!); setWsUrl(url!);
      const { data: sessions } = await supabase.from("live_sessions").select("*").eq("subject_id", subject.id).in("status", ["live", "active", "scheduled"]).order("scheduled_at", { ascending: false, nullsFirst: false }).limit(1);
      if (sessions?.length) {
        setSessionId(sessions[0].id); setSessionInfo(sessions[0]);
        const { data: att } = await supabase.from("attendance_logs").insert({ session_id: sessions[0].id, user_id: user!.id, device_info: navigator.userAgent }).select("id").single();
        if (att) setAttendanceId(att.id);
        await supabase.from("class_participants").upsert({ session_id: sessions[0].id, student_id: user!.id, joined_at: new Date().toISOString(), is_muted: !isPrivileged, camera_on: true, left_at: null, left_minutes: null }, { onConflict: "session_id,student_id" });
      }
      setPhase("live");
      try { playJoinSound(); } catch {}
    } catch (e: any) { setError(e?.message || "Failed to connect"); } finally { setLoading(false); }
  };

  // Cleanup on unmount
  useEffect(() => () => {
    if (attendanceId) { const d = Math.floor((Date.now() - joinedAt) / 1000); supabase.from("attendance_logs").update({ left_at: new Date().toISOString(), duration_seconds: d }).eq("id", attendanceId); }
    if (sessionId && user) supabase.from("class_participants").update({ left_at: new Date().toISOString(), duration_minutes: Math.floor((Date.now() - joinedAt) / 60000) }).eq("session_id", sessionId).eq("student_id", user.id);
  }, [attendanceId, joinedAt, sessionId, user]);

  const endSession = async () => {
    setShowEnd(false);
    try {
      if (sessionId) {
        await supabase.from("live_sessions").update({ status: "ended", ended_at: new Date().toISOString(), actual_end_time: new Date().toISOString() }).eq("id", sessionId);
        if (user) await supabase.from("class_chat_messages").insert({ session_id: sessionId, sender_id: user.id, message: t("Class has ended", "انتهت الحصة"), type: "system" });
      }    } catch (e: any) { console.error("[endSession]", e?.message); } finally { setPhase("ended"); }
  };

  const leaveSession = () => {
    try { playLeaveSound(); } catch {}
    if (attendanceId) { const d = Math.floor((Date.now() - joinedAt) / 1000); supabase.from("attendance_logs").update({ left_at: new Date().toISOString(), duration_seconds: d }).eq("id", attendanceId); }
    if (sessionId && user) supabase.from("class_participants").update({ left_at: new Date().toISOString(), duration_minutes: Math.floor((Date.now() - joinedAt) / 60000) }).eq("session_id", sessionId).eq("student_id", user.id);
    onLeave();
  };

  const handlePermChange = (type: "write" | "rec", allow: boolean, room?: any) => {
    if (type === "write") {
      setCanStudentWrite(allow);
      publishData(room, { type: "wb_allow_write", allow });
      toast({ title: allow ? "✅ Students can now write on the board" : "🔒 Write access revoked" });
    } else {
      setCanStudentRec(allow);
      publishData(room, { type: "rec_allowed", allow });
      toast({ title: allow ? "✅ Students can now record" : "🔒 Record permission revoked" });
    }
  };

  const handleGroupRecite = async (room?: any) => {
    const n = !groupRecite; setGroupRecite(n);
    toast({ title: n ? "🎙️ Group Recitation ON — all mics open" : "🔇 Group Recitation ended" });
    if (sessionId && user) await supabase.from("class_chat_messages").insert({ session_id: sessionId, sender_id: user.id, message: n ? "🎙️ Group Recitation Mode — everyone can recite" : "🔇 Recitation ended", type: "system" });
    // Broadcast to all students
    publishData(room, { type: "group_recite", active: n });
  };

  // Emit emoji — local + broadcast
  const handleSendEmoji = (emoji: string, room?: any) => {
    spawnEmoji(emoji); // show locally immediately
    publishData(room, { type: "emoji_reaction", emoji, senderName: user?.email || "User" });
    // Also insert to chat
    if (user && sessionId) supabase.from("class_chat_messages").insert({ session_id: sessionId, sender_id: user.id, message: emoji, type: "emoji" });
  };

  const fmtT = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // Participant count badge (must be inside LiveKitRoom)
  const ParticipantCountBadge = () => {
    const all = useParticipants();
    if (all.length === 0) return null;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,.07)", borderRadius: 16, padding: "3px 10px", border: "1px solid rgba(255,255,255,.1)" }}>
        <Users style={{ width: 10, height: 10, color: "rgba(255,255,255,.45)" }} />
        <span style={{ fontSize: 11, color: "#fff", fontWeight: 600 }}>{all.length}</span>
      </div>
    );  };

  // BottomBar with room context for emoji broadcast
  const BottomBarWithEmoji = (props: any) => {
    const room = useRoomContext(); const isMobile = useIsMobile();
    return <BottomBar {...props} room={room} isMobile={isMobile} onSendEmoji={(e: string) => handleSendEmoji(e, room)} onGroupRecite={() => handleGroupRecite(room)} />;
  };

  if (phase === "ended") return <ClassEndScreen subject={subject} session={sessionInfo} duration={duration} participantCount={0} onGoToDashboard={onLeave} onGoToRevision={() => { window.location.href = `/student/revision/${subject.id}`; }} />;
  if (phase === "lobby" && !loading && !error && !autoJoin) return <ClassLobby subject={subject} session={sessionInfo} onStartClass={(s: any, media?: any) => connect("start_session", s, media)} onJoinClass={(media?: any) => connect("join", undefined, media)} onBack={onLeave} isLive={isSessionLive} />;
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", background: DARK }}>
      <style>{CSS}</style>
      <div style={{ textAlign: "center" }}><div style={{ width: 52, height: 52, border: `3px solid ${TEAL}`, borderTopColor: "transparent", borderRadius: "50%", animation: "cv-spin .8s linear infinite", margin: "0 auto 16px" }} /><p style={{ color: "rgba(255,255,255,.5)", fontSize: 14 }}>{t("Connecting…", "جاري الاتصال…")}</p></div>
    </div>
  );
  if (error) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", background: DARK }}>
      <style>{CSS}</style>
      <div style={{ textAlign: "center", maxWidth: 320, padding: 28 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(239,68,68,.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><X style={{ width: 28, height: 28, color: RED }} /></div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Connection Failed</h2>
        <p style={{ color: "rgba(255,255,255,.45)", fontSize: 14, marginBottom: 22 }}>{error}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={() => { setError(null); setPhase("lobby"); }} style={{ padding: "10px 22px", borderRadius: 10, background: TEAL, border: "none", color: "#fff", fontSize: 14, cursor: "pointer", fontWeight: 600 }}>Try Again</button>
          <button onClick={onLeave} style={{ padding: "10px 22px", borderRadius: 10, background: GLASSB, border: "1px solid rgba(255,255,255,.12)", color: "#fff", fontSize: 14, cursor: "pointer" }}>Go Back</button>
        </div>
      </div>
    </div>
  );

  return (
    <div data-classroom-root style={{ height: "100dvh", display: "flex", flexDirection: "column", background: DARK, overflow: "hidden" }}>
      <style>{CSS}</style>

      {/* Global emoji overlay — visible to all */}
      <EmojiOverlay emojis={floatingEmojis} />

      {token && wsUrl && (
        <LiveKitRoom
          serverUrl={wsUrl}
          token={token}
          connect={phase === "live"}
          audio={false}
          video={false}
          options={{
            adaptiveStream: { pixelDensity: "screen" },
            dynacast: true,
            disconnectOnPageLeave: false, // CRITICAL: keep alive when minimized
            // ── High-quality audio ────────────────────────────────────            audioCaptureDefaults: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 48000,
              channelCount: 1,
            },
            publishDefaults: {
              audioPreset: { maxBitrate: 96_000 }, // 96kbps for clear audio
              dtx: !groupRecite,   // disable DTX during group recitation so everyone is heard
              red: true,           // redundancy for packet loss recovery
              stopMicTrackOnMute: false, // keep track alive so re-enabling is instant
              videoEncoding: { maxBitrate: 1_500_000, maxFramerate: 30 }, // 1.5Mbps 30fps
              backupCodec: true,
            },
            // ── High-quality video ────────────────────────────────────
            videoCaptureDefaults: {
              resolution: { width: 1280, height: 720, frameRate: 30 },
              facingMode: "user",
            },
          }}
          style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}
          data-lk-theme="default"
        >
          {/* ── Always-running background components ── */}
          <RoomAudioRenderer />
          <MediaAutoPublish lobbyMic={lobbyMic} lobbyCam={lobbyCam} />
          <WbSyncBridge wbOpen={wbOpen} isTeacher={isPrivileged} />
          <GroupReciteBridge active={groupRecite} isTeacher={isPrivileged} />
          <ReconnectMonitor onReconnecting={() => setReconnecting(true)} onReconnected={() => setReconnecting(false)} />
          <RoomDataListener
            onWbOpen={() => setWbOpen(true)}
            onWbClose={() => setWbOpen(false)}
            strokesBuffer={wbBuffer}
            onMatOpen={(mat: any) => setMatOpen(mat)}
            onMatClose={() => setMatOpen(null)}
            onWbAllowWrite={(allow: boolean) => setCanStudentWrite(allow)}
            onRecAllowed={(allow: boolean) => setCanStudentRec(allow)}
            onEmojiReaction={handleEmojiReaction}
            onGroupRecite={handleGroupReciteReceived}
            onMatScroll={(top: number, left: number) => setMatScrollPos({ top, left })}
          />

          {/* Reconnecting overlay */}
          {reconnecting && (
            <div style={{ position: "absolute", inset: 0, zIndex: 200, background: "rgba(0,0,0,.82)", backdropFilter: "blur(8px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
              <div style={{ width: 48, height: 48, border: `3px solid ${TEAL}`, borderTopColor: "transparent", borderRadius: "50%", animation: "cv-spin .8s linear infinite" }} />
              <p style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>Reconnecting…</p>
              <p style={{ color: "rgba(255,255,255,.4)", fontSize: 13 }}>Your audio continues in background</p>
            </div>          )}

          {/* Top bar */}
          <div style={{ height: 52, background: GLASS, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(34,197,94,.12)", borderRadius: 20, padding: "4px 12px", border: "1px solid rgba(34,197,94,.25)" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: GREEN, display: "inline-block", animation: "pip-pulse 1.8s ease-in-out infinite" }} />
                <span style={{ fontSize: 12, color: "#fff", fontWeight: 600, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subject.title}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(239,68,68,.12)", borderRadius: 16, padding: "3px 10px", border: "1px solid rgba(239,68,68,.25)" }}>
                <Circle style={{ width: 5, height: 5, fill: RED, color: RED }} />
                <span style={{ fontSize: 11, color: "#fca5a5", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtT(duration)}</span>
              </div>
              <ParticipantCountBadge />
              {groupRecite && <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(34,197,94,.15)", borderRadius: 16, padding: "3px 10px", border: "1px solid rgba(34,197,94,.35)" }}><Volume2 style={{ width: 11, height: 11, color: GREEN }} /><span style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>Group Recitation</span></div>}
            </div>
            {isPrivileged && <RecController sessionId={sessionId} subjectId={subject.id} userEmail={user?.email || ""} onSavingChange={setSavingRec} />}
          </div>

          {/* Content */}
          <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
            <div style={{ flex: 1, position: "relative", minWidth: 0 }}><VideoGrid /></div>
            {/* Desktop chat side panel */}
            {chatOpen && !isMobile && (
              <div style={{ width: 320, background: "#13181f", borderLeft: "1px solid rgba(255,255,255,.06)", display: "flex", flexDirection: "column", flexShrink: 0, animation: "slide-up .2s ease" }}>
                <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,.07)", flexShrink: 0 }}>
                  {[["chat", "💬", "Chat"], ["polls", "📊", "Polls"]].map(([k, ic, lb]) => (
                    <button key={k} onClick={() => { setSideTab(k as any); if (k === "chat") setChatUnread(0); }} style={{ flex: 1, padding: "12px 4px", background: "none", border: "none", color: sideTab === k ? "#fff" : "rgba(255,255,255,.35)", fontSize: 13, fontWeight: sideTab === k ? 700 : 400, borderBottom: sideTab === k ? `2px solid ${TEAL}` : "2px solid transparent", cursor: "pointer" }}>{ic} {lb}</button>
                  ))}
                  <button onClick={() => setChatOpen(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,.3)", cursor: "pointer", padding: "0 12px" }}><X style={{ width: 16, height: 16 }} /></button>
                </div>
                <div style={{ flex: 1, overflow: "hidden" }}>{sideTab === "chat" ? <ClassChatPanel sessionId={sessionId || ""} /> : <ClassPolls sessionId={sessionId || ""} />}</div>
              </div>
            )}
          </div>

          {/* Whiteboard */}
          {wbOpen && <WhiteboardBridge onClose={() => setWbOpen(false)} isTeacher={isPrivileged} initialStrokes={wbBuffer.current} subjectId={subject.id} canStudentWrite={canStudentWrite} />}

          {/* Bottom bar */}
          <BottomBarWithEmoji
            sessionId={sessionId || ""}
            onToggleChat={() => { setChatOpen(v => !v); if (!chatOpen) setChatUnread(0); }}
            onToggleParticipants={() => setPartOpen(v => !v)}
            onEndClass={() => setShowEnd(true)}
            onLeaveClass={leaveSession}
            chatUnread={chatUnread}
            onToggleWhiteboard={() => setWbOpen(v => !v)}
            whiteboardOpen={wbOpen}
            groupReciteMode={groupRecite}            onShareMaterial={() => setMatPicker(true)}
            isPrivileged={isPrivileged}
            canStudentWriteProp={canStudentWrite}
            canStudentRecProp={canStudentRec}
            onPermChange={(type: any, allow: any, room: any) => handlePermChange(type, allow, room)}
            onMinimize={onMinimize}
            onToggleMaterials={() => setMatPanelOpen(v => !v)}
            matPanelOpen={matPanelOpen}
          />

          {/* Mobile overlays */}
          {isMobile && chatOpen && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 50 }} onClick={() => setChatOpen(false)}>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#13181f", borderRadius: "22px 22px 0 0", maxHeight: "82vh", display: "flex", flexDirection: "column", animation: "slide-up .22s ease", paddingBottom: "env(safe-area-inset-bottom,0px)" }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", alignItems: "center", padding: "12px 16px 0", flexShrink: 0 }}>
                  <div style={{ flex: 1, display: "flex" }}>{[["chat", "💬", "Chat"], ["polls", "📊", "Polls"]].map(([k, ic, lb]) => (<button key={k} onClick={() => setSideTab(k as any)} style={{ flex: 1, padding: "10px 6px", background: "none", border: "none", color: sideTab === k ? "#fff" : "rgba(255,255,255,.35)", fontSize: 13, fontWeight: sideTab === k ? 700 : 400, borderBottom: sideTab === k ? `2px solid ${TEAL}` : "2px solid transparent", cursor: "pointer" }}>{ic} {lb}</button>))}</div>
                  <button onClick={() => setChatOpen(false)} style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,.1)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X style={{ width: 14, height: 14 }} /></button>
                </div>
                <div style={{ flex: 1, overflow: "hidden", minHeight: 340 }}>{sideTab === "chat" ? <ClassChatPanel sessionId={sessionId || ""} /> : <ClassPolls sessionId={sessionId || ""} />}</div>
              </div>
            </div>
          )}
          {isMobile && partOpen && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 50 }} onClick={() => setPartOpen(false)}>
              <div style={{ position: "absolute", bottom: BAR_H, left: 0, right: 0, background: "#13181f", borderRadius: "22px 22px 0 0", maxHeight: "65vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,.18)", margin: "12px auto 6px" }} />
                <ClassParticipants sessionId={sessionId || ""} />
              </div>
            </div>
          )}

          <LiveQuizOverlay sessionId={sessionId || ""} isOpen={false} onClose={() => {}} />
        </LiveKitRoom>
      )}

      {/* Material viewer — teacher: with scroll broadcast; student: with scroll sync */}
      {matOpen && isPrivileged && <MatViewerBridge material={matOpen} isTeacher={true} onClose={(room?: any) => { setMatOpen(null); publishData(room, { type: "mat_close" }); }} />}
      {matOpen && !isPrivileged && <MatViewerStudent material={matOpen} onClose={() => setMatOpen(null)} scrollPos={matScrollPos} />}

      {/* Material picker */}
      {matPicker && (
        <MatPickerBridge
          subjectId={subject.id}
          onShare={(mat: any, room: any) => {
            setMatOpen(mat); setMatPicker(false);
            publishData(room, { type: "mat_open", material: mat });
          }}
          onClose={() => setMatPicker(false)}
        />
      )}
      {/* End class confirm */}
      {showEnd && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.72)", backdropFilter: "blur(6px)" }} onClick={() => setShowEnd(false)}>
          <div style={{ background: "#17202a", borderRadius: 20, padding: "28px 28px 24px", width: "100%", maxWidth: 380, margin: "0 16px", boxShadow: "0 24px 64px rgba(0,0,0,.7)", border: "1px solid rgba(255,255,255,.1)", animation: "fade-in .18s ease" }} onClick={e => e.stopPropagation()}>
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

const MatPickerBridge = ({ subjectId, onShare, onClose }: any) => { const room = useRoomContext(); return <MaterialPicker subjectId={subjectId} onShare={(mat: any) => onShare(mat, room)} onClose={onClose} />; };

export default ClassroomView;