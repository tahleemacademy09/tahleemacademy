/*
  GuestClassroom.tsx — Tahleem Academy Public Live Class
  ──────────────────────────────────────────────────────
  WhatsApp-call-style background behaviour:
  • Canvas PiP (Picture-in-Picture) fires automatically when:
      - user presses the Minimize button
      - user presses the Android Back button
      - screen turns off / browser is sent to background
  • Audio keeps playing via silent AudioContext keep-alive
  • MediaSession exposes lock-screen controls (return / leave)
  • Wake-lock prevents screen sleeping mid-class
  • Auto-reconnect: up to 5 attempts, progressive back-off
  • Top bar: compact mobile layout — no overflow/overlap
*/

import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import {
  LiveKitRoom, VideoConference, RoomAudioRenderer, useRoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track, ConnectionState, RoomEvent } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import {
  UserPlus, Radio, Circle, Loader2,
  Mic, Pause, Play, Square, X, Phone,
  Minimize2, RefreshCw,
} from "lucide-react";
import ClassChatPanel    from "@/components/classroom/ClassChatPanel";
import ClassPolls        from "@/components/classroom/ClassPolls";
import ClassParticipants from "@/components/classroom/ClassParticipants";
import ClassControls     from "@/components/classroom/ClassControls";
import LiveQuizOverlay   from "@/components/classroom/LiveQuizOverlay";
import { useIsMobile }   from "@/hooks/use-mobile";

/* ════════════════════════════════════════════════════════
   STYLES
   ════════════════════════════════════════════════════════ */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap');

  @keyframes gc-spin      { to { transform:rotate(360deg); } }
  @keyframes gc-pulse     { 0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.82)} }
  @keyframes gc-rec-pulse { 0%,100%{opacity:1}50%{opacity:.25} }
  @keyframes gc-fade-up   { from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)} }
  @keyframes gc-slide-up  { from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1} }
  @keyframes gc-bounce-in { 0%{transform:scale(.82);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1} }

  [data-gc-root] {
    font-family:'Google Sans','Roboto',sans-serif;
    -webkit-font-smoothing:antialiased;
    overscroll-behavior:none;
    -webkit-overflow-scrolling:touch;
    touch-action:pan-y;
    padding-bottom:env(safe-area-inset-bottom,0px);
  }
  [data-gc-root] * { box-sizing:border-box; }
  [data-gc-root] button {
    -webkit-tap-highlight-color:transparent;
    touch-action:manipulation;
    font-family:'Google Sans','Roboto',sans-serif;
  }

  /* Badge pill */
  .gc-pill {
    display:inline-flex; align-items:center; gap:4px;
    padding:4px 8px; border-radius:20px;
    font-size:11px; font-weight:600; white-space:nowrap; flex-shrink:0;
    font-family:'Google Sans',sans-serif;
  }

  /* Sidebar */
  .gc-sidebar {
    width:280px; display:flex; flex-direction:column;
    background:rgba(32,33,36,.97);
    border-left:1px solid rgba(255,255,255,.07);
    flex-shrink:0; animation:gc-slide-up .22s ease;
  }

  /* Reconnect overlay */
  .gc-reconnect-overlay {
    position:absolute; inset:0; z-index:200;
    background:rgba(32,33,36,.92); backdrop-filter:blur(12px);
    display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:16px;
    animation:gc-fade-up .2s ease;
  }

  /* LK theme override */
  [data-lk-theme] { height:100%!important; display:flex!important; flex-direction:column!important; }
  .lk-video-conference { height:100%!important; }
`;

/* ════════════════════════════════════════════════════════
   CANVAS PiP  — same engine as GlobalClassroomOverlay
   ════════════════════════════════════════════════════════ */
const GOLD = "#c9a84c";
const DARK_BG = "#0c1f12";
const PIP_W = 320, PIP_H = 180;

interface PipHandle {
  video:       HTMLVideoElement;
  setMicMuted: (v: boolean) => void;
  setInitial:  (v: string)  => void;
  pip:         () => Promise<void>;
  stop:        () => void;
}

function buildCanvasPip(
  initialChar: string,
  subjectName: string,
  onTap: () => void,
): PipHandle | null {
  if (!("requestPictureInPicture" in HTMLVideoElement.prototype)) return null;

  const cv = document.createElement("canvas");
  cv.width = PIP_W; cv.height = PIP_H;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;

  let micMuted = true;
  let letter   = initialChar;
  let raf      = 0;

  const drawMic = (mx: number, my: number, r: number) => {
    ctx.fillStyle = micMuted ? "rgba(239,68,68,.95)" : "rgba(34,120,60,.95)";
    ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
    const cs = r * 0.28;
    if (micMuted) {
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(mx, my - cs, cs, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = r * 0.18;
      ctx.beginPath();
      ctx.moveTo(mx - r * 0.52, my + r * 0.48);
      ctx.lineTo(mx + r * 0.52, my - r * 0.48);
      ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(mx, my - cs, cs, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(mx - cs * 1.2, my - cs * 0.3);
      ctx.quadraticCurveTo(mx - cs * 1.2, my + cs * 1.4, mx, my + cs * 1.7);
      ctx.quadraticCurveTo(mx + cs * 1.2, my + cs * 1.4, mx + cs * 1.2, my - cs * 0.3);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx, my + cs * 1.7); ctx.lineTo(mx, my + cs * 2.5); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx - cs * 0.9, my + cs * 2.5); ctx.lineTo(mx + cs * 0.9, my + cs * 2.5); ctx.stroke();
    }
  };

  const draw = () => {
    ctx.clearRect(0, 0, PIP_W, PIP_H);
    ctx.fillStyle = DARK_BG; ctx.fillRect(0, 0, PIP_W, PIP_H);
    ctx.fillStyle = "rgba(201,168,76,0.35)"; ctx.fillRect(0, PIP_H - 2, PIP_W, 2);

    // LIVE strip
    const STRIP = 52;
    ctx.fillStyle = "rgba(255,255,255,0.04)"; ctx.fillRect(0, 0, STRIP, PIP_H);
    const p = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() / 700));
    ctx.fillStyle = `rgba(239,68,68,${p})`;
    ctx.beginPath(); ctx.arc(STRIP / 2, PIP_H / 2 - 10, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(239,68,68,${p * 0.4})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(STRIP / 2, PIP_H / 2 - 10, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "bold 10px system-ui,sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("LIVE", STRIP / 2, PIP_H / 2 + 8);
    ctx.fillStyle = "rgba(201,168,76,0.2)"; ctx.fillRect(STRIP, 20, 1, PIP_H - 40);

    // Avatar
    const avX = STRIP + 52, avY = PIP_H / 2, avR = 36;
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = DARK_BG;
    ctx.font = `bold ${avR * 0.75}px system-ui,-apple-system,sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(letter.toUpperCase().slice(0, 1), avX, avY);

    // Subject name
    const nameX = avX + avR + 12;
    const nameW = PIP_W - nameX - 52;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "600 13px system-ui,-apple-system,sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    let name = subjectName;
    while (name.length > 1 && ctx.measureText(name).width > nameW) name = name.slice(0, -1);
    if (name !== subjectName) name = name.trimEnd() + "…";
    ctx.fillText(name, nameX, PIP_H / 2 - 8);
    ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "10px system-ui,sans-serif";
    ctx.fillText("Tap to return", nameX, PIP_H / 2 + 12);

    drawMic(PIP_W - 30, PIP_H / 2, 20);
    raf = requestAnimationFrame(draw);
  };
  draw();

  const vid = document.createElement("video");
  vid.srcObject = cv.captureStream(12);
  vid.muted = true; vid.playsInline = true;
  (vid as any).autopictureinpicture = true;
  vid.setAttribute("autopictureinpicture", "");
  vid.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;pointer-events:none;opacity:.01;z-index:-999;";
  document.body.appendChild(vid);
  vid.addEventListener("leavepictureinpicture", onTap);

  const keepPlaying = () => { if (document.body.contains(vid)) vid.play().catch(() => {}); };
  vid.addEventListener("pause", keepPlaying);
  vid.addEventListener("ended", keepPlaying);
  keepPlaying();

  const ensurePlaying = async () => {
    if (vid.paused || vid.readyState < 2) {
      try { await vid.play(); } catch {}
      await new Promise(r => setTimeout(r, 80));
    }
  };

  const pip = async () => {
    if (document.pictureInPictureElement === vid) return;
    await ensurePlaying();
    try { await vid.requestPictureInPicture(); } catch {}
  };

  const stop = () => {
    cancelAnimationFrame(raf);
    vid.removeEventListener("pause", keepPlaying);
    vid.removeEventListener("ended", keepPlaying);
    (vid.srcObject as MediaStream | null)?.getTracks().forEach(t => t.stop());
    if (document.pictureInPictureElement === vid) document.exitPictureInPicture().catch(() => {});
    vid.remove();
  };

  return { video: vid, setMicMuted: v => { micMuted = v; }, setInitial: v => { letter = v; }, pip, stop };
}

/* ════════════════════════════════════════════════════════
   HOOKS
   ════════════════════════════════════════════════════════ */
function useSilentAudio(active: boolean) {
  const acRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  useEffect(() => {
    if (!active) {
      srcRef.current?.stop(); srcRef.current = null;
      acRef.current?.close(); acRef.current  = null;
      return;
    }
    const start = () => {
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AC();
        const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        src.connect(ctx.destination); src.start();
        acRef.current = ctx; srcRef.current = src;
      } catch {}
    };
    start();
    const resume = () => {
      if (document.visibilityState !== "visible") return;
      const ctx = acRef.current;
      if (!ctx)                      { start(); return; }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      if (ctx.state === "closed")    start();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      srcRef.current?.stop(); srcRef.current = null;
      acRef.current?.close(); acRef.current  = null;
    };
  }, [active]);
}

function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);
  const request = useCallback(async () => {
    if (!active || !("wakeLock" in navigator)) return;
    try { lockRef.current = await navigator.wakeLock.request("screen"); } catch {}
  }, [active]);
  useEffect(() => {
    if (!active) { lockRef.current?.release(); lockRef.current = null; return; }
    request();
    const fn = () => { if (document.visibilityState === "visible") request(); };
    document.addEventListener("visibilitychange", fn);
    return () => { document.removeEventListener("visibilitychange", fn); lockRef.current?.release(); };
  }, [active, request]);
}

function useMediaSession(active: boolean, title: string, onReturn: () => void, onLeave: () => void) {
  useEffect(() => {
    if (!active || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: "Tahleem Academy", album: "🟢 Live Class" });
    navigator.mediaSession.playbackState = "playing";
    const sa = (a: MediaSessionAction, h: () => void) => { try { navigator.mediaSession.setActionHandler(a, h); } catch {} };
    sa("play", onReturn); sa("pause", onReturn); sa("stop", onLeave);
    sa("previoustrack", onReturn); sa("nexttrack", onReturn);
    return () => {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      (["play","pause","stop","previoustrack","nexttrack"] as MediaSessionAction[])
        .forEach(a => { try { navigator.mediaSession.setActionHandler(a, null); } catch {} });
    };
  }, [active, title, onReturn, onLeave]);
}

/* ════════════════════════════════════════════════════════
   CONNECTION QUALITY INDICATOR (inside LiveKitRoom)
   ════════════════════════════════════════════════════════ */
const ConnectionIndicator = () => {
  const room = useRoomContext();
  const [quality, setQuality] = useState<"excellent"|"good"|"fair"|"poor">("excellent");
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    const syncQ = () => {
      const q = room.localParticipant.connectionQuality as unknown as number;
      setQuality(q >= 3 ? "excellent" : q >= 2 ? "good" : q >= 1 ? "fair" : "poor");
    };
    const syncS = (s: ConnectionState) => setReconnecting(s === ConnectionState.Reconnecting);
    room.on(RoomEvent.ConnectionQualityChanged, syncQ);
    room.on(RoomEvent.ConnectionStateChanged, syncS);
    const iv = setInterval(syncQ, 2500);
    syncQ();
    return () => { room.off(RoomEvent.ConnectionQualityChanged, syncQ); room.off(RoomEvent.ConnectionStateChanged, syncS); clearInterval(iv); };
  }, [room]);

  if (reconnecting) return (
    <div style={{ display:"flex", alignItems:"center", gap:3 }}>
      <RefreshCw style={{ width:10, height:10, color:"#facc15", animation:"gc-spin .8s linear infinite" }} />
      <span style={{ fontSize:9, color:"#facc15", fontWeight:600 }}>SYNC</span>
    </div>
  );

  const col = { excellent:"#22c55e", good:"#86efac", fair:"#facc15", poor:"#ef4444" }[quality];
  const bars = { excellent:4, good:3, fair:2, poor:1 }[quality];
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:13 }}>
      {[1,2,3,4].map(i => (
        <div key={i} style={{ width:3, borderRadius:2, height:`${i*3+2}px`, background: i<=bars ? col : "rgba(255,255,255,.18)", transition:"background .3s" }} />
      ))}
    </div>
  );
};

/* ════════════════════════════════════════════════════════
   RECONNECT MONITOR (inside LiveKitRoom)
   ════════════════════════════════════════════════════════ */
const ReconnectMonitor = ({ onReconnecting, onReconnected, onDisconnected }: {
  onReconnecting: () => void; onReconnected: () => void; onDisconnected: () => void;
}) => {
  const room = useRoomContext();
  useEffect(() => {
    const h = (s: ConnectionState) => {
      if (s === ConnectionState.Reconnecting)  onReconnecting();
      else if (s === ConnectionState.Connected) onReconnected();
      else if (s === ConnectionState.Disconnected) onDisconnected();
    };
    room.on(RoomEvent.ConnectionStateChanged, h);
    return () => { room.off(RoomEvent.ConnectionStateChanged, h); };
  }, [room, onReconnecting, onReconnected, onDisconnected]);
  return null;
};

/* ════════════════════════════════════════════════════════
   RECORDING CONTROLLER (host only)
   ════════════════════════════════════════════════════════ */
const RecordingController = ({ classId, isHost, onSavingChange }: {
  classId: string; isHost: boolean; onSavingChange:(v:boolean)=>void;
}) => {
  const room = useRoomContext();
  const [recording, setRecording]         = useState(false);
  const [paused, setPaused]               = useState(false);
  const [recTime, setRecTime]             = useState(0);
  const [saving, setSaving]               = useState(false);
  const [mode, setMode]                   = useState<"screen"|"audio"|null>(null);
  const timerRef     = useRef<any>(null);
  const recRef       = useRef<MediaRecorder|null>(null);
  const chunksRef    = useRef<Blob[]>([]);
  const streamsRef   = useRef<MediaStream[]>([]);
  const acRef        = useRef<AudioContext|null>(null);

  useEffect(() => () => { clearInterval(timerRef.current); streamsRef.current.forEach(s=>s.getTracks().forEach(t=>t.stop())); }, []);

  const collectAudio = useCallback((): MediaStream|null => {
    try {
      const ac = new AudioContext(); acRef.current = ac;
      const dest = ac.createMediaStreamDestination();
      let n = 0;
      for (const p of [room.localParticipant, ...Array.from(room.remoteParticipants.values())]) {
        for (const pub of p.trackPublications.values()) {
          if (pub.track && (pub.source===Track.Source.Microphone||pub.source===Track.Source.ScreenShareAudio)) {
            const mst = pub.track.mediaStreamTrack;
            if (mst?.readyState==="live") { ac.createMediaStreamSource(new MediaStream([mst])).connect(dest); n++; }
          }
        }
      }
      return n > 0 ? dest.stream : null;
    } catch { return null; }
  }, [room]);

  const start = useCallback(async () => {
    let stream: MediaStream|null = null; let m: "screen"|"audio" = "audio";
    if (typeof navigator.mediaDevices.getDisplayMedia === "function") {
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video:{ width:1280, height:720 } as any, audio:true });
        m = "screen";
        const ra = collectAudio();
        if (ra && acRef.current) {
          const ctx=acRef.current; const dest=ctx.createMediaStreamDestination();
          stream.getAudioTracks().forEach(t=>{ ctx.createMediaStreamSource(new MediaStream([t])).connect(dest); });
          ra.getAudioTracks().forEach(t=>{ ctx.createMediaStreamSource(new MediaStream([t])).connect(dest); });
          stream = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
        }
      } catch { stream=null; }
    }
    if (!stream) { m="audio"; stream=collectAudio(); if (!stream) { try { stream=await navigator.mediaDevices.getUserMedia({audio:true}); } catch { return; } } }
    streamsRef.current.push(stream);
    const isVid = stream.getVideoTracks().length > 0;
    const mime = isVid
      ? (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")?"video/webm;codecs=vp9,opus":"video/webm")
      : (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"audio/webm");
    const rec = new MediaRecorder(stream, { mimeType:mime });
    chunksRef.current = [];
    rec.ondataavailable = e => { if (e.data.size>0) chunksRef.current.push(e.data); };
    if (isVid) stream.getVideoTracks()[0]?.addEventListener("ended", ()=>{ if (recRef.current?.state!=="inactive") stop(); });
    rec.start(1000); recRef.current=rec; setMode(m); setRecording(true); setPaused(false); setRecTime(0);
    timerRef.current = setInterval(()=>setRecTime(p=>p+1), 1000);
  }, [collectAudio]);

  const stop = useCallback(async () => {
    clearInterval(timerRef.current);
    const m=mode;
    if (!recRef.current||recRef.current.state==="inactive") { setRecording(false); setPaused(false); setRecTime(0); return; }
    setSaving(true); onSavingChange(true);
    await new Promise<void>(res=>{ recRef.current!.onstop=()=>res(); recRef.current!.stop(); });
    streamsRef.current.forEach(s=>s.getTracks().forEach(t=>t.stop())); streamsRef.current=[];
    if (acRef.current) { acRef.current.close().catch(()=>{}); acRef.current=null; }
    setRecording(false); setPaused(false); setRecTime(0);
    const isVid=m==="screen";
    const blob=new Blob(chunksRef.current, { type:isVid?"video/webm":"audio/webm" });
    chunksRef.current=[];
    if (blob.size<500) { setSaving(false); onSavingChange(false); return; }
    try {
      const { error } = await storageSupabase.storage.from("subject-files")
        .upload(`recordings/public-class/${classId}/${Date.now()}.webm`, blob, { contentType:isVid?"video/webm":"audio/webm", upsert:false });
      if (error) throw error;
    } catch (e) { console.error("Recording save failed", e); }
    finally { setSaving(false); onSavingChange(false); }
  }, [mode, classId, onSavingChange]);

  const fmtT=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  if (!isHost) return null;

  return (
    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
      {recording && (
        <div className="gc-pill" style={{ background:"rgba(239,68,68,.15)", border:"1px solid rgba(239,68,68,.35)", color:"#fca5a5", animation:"gc-rec-pulse 1.4s ease-in-out infinite" }}>
          <Circle style={{ width:6, height:6, fill:"#ef4444", color:"#ef4444" }} />
          {fmtT(recTime)}{paused?" ⏸":""}
        </div>
      )}
      {saving && (
        <div className="gc-pill" style={{ background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.1)", color:"rgba(255,255,255,.5)" }}>
          <Loader2 style={{ width:10, height:10, animation:"gc-spin .8s linear infinite" }} /> Saving
        </div>
      )}
      {!recording && !saving && (
        <button onClick={start} style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 10px", borderRadius:20, border:"none", background:"#ef4444", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer" }}>
          <Circle style={{ width:6, height:6, fill:"#fff", color:"#fff" }} /> REC
        </button>
      )}
      {recording && (
        <>
          {paused
            ? <button onClick={()=>{ recRef.current?.resume(); setPaused(false); timerRef.current=setInterval(()=>setRecTime(p=>p+1),1000); }} style={{ display:"flex", alignItems:"center", gap:3, padding:"4px 9px", borderRadius:20, border:"1px solid rgba(255,255,255,.2)", background:"rgba(255,255,255,.08)", color:"#fff", fontSize:10, cursor:"pointer" }}><Play style={{width:9,height:9}}/>Resume</button>
            : <button onClick={()=>{ recRef.current?.pause(); setPaused(true); clearInterval(timerRef.current); }} style={{ display:"flex", alignItems:"center", gap:3, padding:"4px 9px", borderRadius:20, border:"1px solid rgba(255,255,255,.2)", background:"rgba(255,255,255,.08)", color:"#fff", fontSize:10, cursor:"pointer" }}><Pause style={{width:9,height:9}}/>Pause</button>
          }
          <button onClick={stop} style={{ display:"flex", alignItems:"center", gap:3, padding:"4px 9px", borderRadius:20, border:"none", background:"#ef4444", color:"#fff", fontSize:10, cursor:"pointer" }}><Square style={{width:9,height:9}}/>Stop</button>
        </>
      )}
    </div>
  );
};

/* ════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════ */
const GuestClassroom = () => {
  const location  = useLocation();
  const navigate  = useNavigate();
  const isMobile  = useIsMobile();

  const [connected, setConnected]         = useState(false);
  const [ended, setEnded]                 = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [classDuration, setClassDuration] = useState(0);
  const [savingRec, setSavingRec]         = useState(false);
  const [minimized, setMinimized]         = useState(false);
  const [reconnecting, setReconnecting]   = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [roomKey, setRoomKey]             = useState(0);
  const intentionalRef = useRef(false);

  // Side panels
  const [chatOpen, setChatOpen]           = useState(!isMobile);
  const [partOpen, setPartOpen]           = useState(false);
  const [sideTab, setSideTab]             = useState<"chat"|"polls">("chat");
  const [chatUnread, setChatUnread]       = useState(0);
  const [showQuiz, setShowQuiz]           = useState(false);

  const pipHandle    = useRef<PipHandle|null>(null);
  const handleRetRef = useRef<()=>void>(()=>{});

  const {
    token, url, room: roomName, guestName, classTitle, classTitleAr,
    isHost, classId, sessionId,
  } = (location.state||{}) as {
    token?:string; url?:string; room?:string; guestName?:string;
    classTitle?:string; classTitleAr?:string;
    isHost?:boolean; classId?:string; sessionId?:string;
  };

  const title   = classTitle || "Public Class";
  const initial = title.charAt(0).toUpperCase();

  // Keep-alive / wake-lock
  useSilentAudio(connected && !ended);
  useWakeLock(connected && !ended);

  const handleReturn = useCallback(() => setMinimized(false), []);
  const handleLeave  = useCallback(() => { intentionalRef.current=true; setEnded(true); }, []);
  handleRetRef.current = handleReturn;

  useMediaSession(connected && !ended, title, handleReturn, handleLeave);

  useEffect(() => { if (!token||!url) navigate("/live"); }, [token, url, navigate]);

  // Duration timer
  useEffect(() => {
    if (!connected) return;
    const t = setInterval(()=>setClassDuration(p=>p+1), 1000);
    return () => clearInterval(t);
  }, [connected]);

  // Build PiP once connected
  useEffect(() => {
    if (!connected) { pipHandle.current?.stop(); pipHandle.current=null; return; }
    const h = buildCanvasPip(initial, title, ()=>handleRetRef.current());
    if (h) { h.video.play().catch(()=>{}); pipHandle.current=h; }
    return () => { pipHandle.current?.stop(); pipHandle.current=null; };
  }, [connected, initial, title]);

  // Auto-reconnect (up to 5 attempts)
  const autoReconnect = useCallback(() => {
    if (intentionalRef.current) return;
    setReconnecting(true);
    setReconnectCount(prev => {
      if (prev >= 5) { setEnded(true); return prev; }
      setTimeout(() => { setReconnecting(false); setRoomKey(k=>k+1); }, 2000 + prev*1000);
      return prev+1;
    });
  }, []);

  /* ── Minimize → PiP ── */
  const doMinimize = useCallback(async () => {
    setMinimized(true);
    const h = pipHandle.current;
    if (!h) return;
    if (document.pictureInPictureElement) return;
    // Try a live video element first (camera on)
    const vids = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
    const live = vids.find(v => v.readyState>=2 && v.videoWidth>0 && v!==h.video);
    if (live) { try { await live.requestPictureInPicture(); return; } catch {} }
    h.pip().catch(()=>{});
  }, []);

  /* ── Navigate away while connected → minimize + PiP first ── */
  const navigateAway = useCallback(async (to: string) => {
    if (connected && !ended) {
      await doMinimize();
      // Small delay so PiP window has time to appear before page changes
      setTimeout(() => navigate(to), 80);
    } else {
      navigate(to);
    }
  }, [connected, ended, doMinimize, navigate]);

  /* ── Back button → minimize + PiP ── */
  useEffect(() => {
    if (!connected) return;
    const onPop = () => {
      setMinimized(true);
      setTimeout(()=>pipHandle.current?.pip().catch(()=>{}), 60);
    };
    window.history.pushState({ gc: true }, "");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [connected]);

  /* ── Browser backgrounded (home button / app switch) → minimize + PiP ── */
  useEffect(() => {
    if (!connected) return;
    let pipTimer: ReturnType<typeof setTimeout>|null = null;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        setMinimized(true);
        if (!document.pictureInPictureElement) {
          pipTimer = setTimeout(()=>pipHandle.current?.pip().catch(()=>{}), 150);
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); if (pipTimer) clearTimeout(pipTimer); };
  }, [connected]);

  /* ── Return from minimized → exit PiP ── */
  useEffect(() => {
    if (!minimized && document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(()=>{});
    }
  }, [minimized]);

  const fmtT = (s:number) => {
    const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
    return h>0 ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };

  const handleEndClass = () => {
    // Set intentional + ended FIRST so any disconnect that fires during the
    // Supabase write doesn't trigger auto-reconnect.
    setShowEndConfirm(false);
    intentionalRef.current = true;
    setEnded(true);
    if (classId) {
      supabase.from("public_classes")
        .update({ status: "ended", actual_end_time: new Date().toISOString() })
        .eq("id", classId)
        .then(() => {}).catch(() => {});
    }
  };

  if (!token||!url) return null;

  /* ── Ended screen ── */
  if (ended) {
    return (
      <div style={{ height:"100dvh", display:"flex", alignItems:"center", justifyContent:"center", padding:16, background:"#0f3122", color:"#fff", fontFamily:"'Google Sans',sans-serif" }}>
        <style>{CSS}</style>
        <div style={{ maxWidth:420, width:"100%", textAlign:"center", animation:"gc-fade-up .3s ease" }}>
          <p style={{ fontSize:30, marginBottom:4, fontFamily:"'Amiri',serif", color:"#c9973a" }}>الدرس انتهى</p>
          <h2 style={{ fontSize:22, fontWeight:600, color:"#fff", marginBottom:6 }}>Class Has Ended</h2>
          <p style={{ color:"#c9973a", fontFamily:"'Amiri',serif", marginBottom:4 }}>جزاكم الله خيراً</p>
          <p style={{ color:"rgba(255,255,255,.5)", fontSize:13, marginBottom:28 }}>JazakAllahu Khayran for joining!</p>
          {isHost
            ? <button onClick={()=>navigateAway("/admin/public-classes")} style={{ fontSize:13, color:"rgba(255,255,255,.35)", background:"none", border:"none", cursor:"pointer", textDecoration:"underline" }}>Back to Dashboard</button>
            : <button onClick={()=>navigateAway("/live")} style={{ fontSize:13, color:"rgba(255,255,255,.35)", background:"none", border:"none", cursor:"pointer", textDecoration:"underline" }}>Browse Other Classes</button>
          }
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════
     LIVE CLASSROOM
     The div is always present. When minimized it's translated
     off-screen (zero visual footprint) while PiP shows the
     canvas overlay — identical to GlobalClassroomOverlay.
     A solid black backdrop covers the page body so the white
     background never bleeds through when minimized.
     ════════════════════════════════════════════════════════ */
  return (
    <>
    {/* Black backdrop — visible only when minimized, hides white body behind PiP */}
    {minimized && (
      <div style={{ position:"fixed", inset:0, zIndex:7999, background:"#000" }} />
    )}
    <div
      data-gc-root
      style={{
        position:"fixed", inset:0, zIndex:8000,
        display:"flex", flexDirection:"column",
        background:"#202124",
        // Move off-screen when minimized — keeps LiveKit/audio alive
        transform: minimized ? "translateX(-200%)" : "translateX(0)",
        pointerEvents: minimized ? "none" : "all",
        transition: minimized ? "none" : "transform .12s ease",
      }}
    >
      <style>{CSS}</style>

      <LiveKitRoom
        key={roomKey}
        serverUrl={url}
        token={token}
        connect={true}
        onConnected={()=>{ setConnected(true); setReconnecting(false); setReconnectCount(0); }}
        onDisconnected={()=>{ if (!intentionalRef.current) autoReconnect(); }}
        options={{
          adaptiveStream:{ pixelDensity:"screen" },
          dynacast:true,
          disconnectOnPageLeave:false,
          audioCaptureDefaults:{
            echoCancellation:true, noiseSuppression:true,
            autoGainControl:true, sampleRate:48000, channelCount:1,
          },
          publishDefaults:{
            audioPreset:{ maxBitrate:64000 },
            dtx:false, red:true, stopMicTrackOnMute:false,
            videoEncoding:{ maxBitrate:700_000, maxFramerate:20 },
            backupCodec:true,
          },
          videoCaptureDefaults:{ resolution:{ width:1280, height:720 } },
        }}
        style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0, position:"relative" }}
        data-lk-theme="default"
      >
        <ReconnectMonitor
          onReconnecting={()=>setReconnecting(true)}
          onReconnected={()=>{ setReconnecting(false); setReconnectCount(0); }}
          onDisconnected={autoReconnect}
        />

        {/* Reconnecting overlay */}
        {reconnecting && (
          <div className="gc-reconnect-overlay">
            <div style={{ width:52, height:52, border:"3px solid rgba(138,180,248,.2)", borderTopColor:"#8ab4f8", borderRadius:"50%", animation:"gc-spin .8s linear infinite" }} />
            <p style={{ color:"#e8eaed", fontSize:16, fontWeight:500, fontFamily:"'Google Sans',sans-serif" }}>Reconnecting…</p>
            <p style={{ color:"rgba(255,255,255,.4)", fontSize:13, fontFamily:"'Google Sans',sans-serif" }}>
              {reconnectCount>0 ? `Attempt ${reconnectCount} of 5` : "Please stay on the page"}
            </p>
          </div>
        )}

        {/* ════ TOP BAR — compact, no overflow ════ */}
        <div style={{
          height:48, flexShrink:0,
          background:"rgba(32,33,36,.97)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
          display:"flex", alignItems:"center",
          padding:"0 10px", gap:6,
          borderBottom:"1px solid rgba(255,255,255,.06)",
          overflow:"hidden",
        }}>
          {/* LEFT GROUP */}
          <div style={{ display:"flex", alignItems:"center", gap:5, flex:1, minWidth:0, overflow:"hidden" }}>
            {/* LIVE / Guest badge */}
            {isHost
              ? <div className="gc-pill" style={{ background:"rgba(239,68,68,.13)", border:"1px solid rgba(239,68,68,.3)", color:"#fca5a5" }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:"#ef4444", display:"inline-block", animation:"gc-pulse 1.8s ease-in-out infinite" }} />
                  LIVE
                </div>
              : <div className="gc-pill" style={{ background:"rgba(201,151,58,.12)", border:"1px solid rgba(201,151,58,.3)", color:"#c9973a" }}>
                  Guest
                </div>
            }

            {/* Class title — truncated */}
            <span style={{ fontSize:12, fontWeight:600, color:"rgba(255,255,255,.85)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1, minWidth:0 }}>
              {title}
            </span>

            {/* Timer */}
            <div className="gc-pill" style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", color:"rgba(255,255,255,.65)", fontVariantNumeric:"tabular-nums" }}>
              <Circle style={{ width:5, height:5, fill:"#ef4444", color:"#ef4444", animation:"gc-rec-pulse 1.4s ease-in-out infinite", flexShrink:0 }} />
              {fmtT(classDuration)}
            </div>
          </div>

          {/* RIGHT GROUP */}
          <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
            {/* Connection quality */}
            <ConnectionIndicator />

            {/* Record (host only — compact) */}
            <RecordingController classId={classId||""} isHost={!!isHost} onSavingChange={setSavingRec} />

            {/* Register CTA — desktop only — minimizes first so audio keeps running */}
            {!isHost && (
              <button
                onClick={async ()=>{ await doMinimize(); navigate("/register"); }}
                className="sm:block"
                style={{ display:"none", alignItems:"center", gap:4, padding:"4px 10px", borderRadius:16, border:"1px solid rgba(201,151,58,.4)", background:"transparent", color:"#c9973a", fontSize:11, cursor:"pointer" }}
              >
                <UserPlus style={{ width:11, height:11 }} /> Register
              </button>
            )}

            {/* Minimize */}
            <button
              onClick={doMinimize}
              title="Minimize — audio stays on"
              style={{ display:"flex", alignItems:"center", justifyContent:"center", width:30, height:30, borderRadius:"50%", border:"none", background:"rgba(255,255,255,.1)", color:"rgba(255,255,255,.7)", cursor:"pointer" }}
            >
              <Minimize2 style={{ width:14, height:14 }} />
            </button>
          </div>
        </div>

        {/* ════ MAIN CONTENT ════ */}
        <div style={{ flex:1, display:"flex", minHeight:0, overflow:"hidden" }}>
          {/* Participants (desktop) */}
          {partOpen && !isMobile && sessionId && (
            <div style={{ width:216, background:"rgba(32,33,36,.97)", borderRight:"1px solid rgba(255,255,255,.07)", display:"flex", flexDirection:"column", flexShrink:0 }}>
              <ClassParticipants
                sessionId={sessionId}
                onMuteStudent={isHost?(id)=>{ supabase.from("class_participants").update({is_muted:true}).eq("session_id",sessionId).eq("student_id",id); }:undefined}
                onRemoveStudent={isHost?(id)=>{ supabase.from("class_participants").update({left_at:new Date().toISOString()}).eq("session_id",sessionId).eq("student_id",id); }:undefined}
              />
            </div>
          )}

          {/* Video */}
          <div style={{ flex:1, position:"relative", minWidth:0 }}>
            <VideoConference />
            <RoomAudioRenderer />
          </div>

          {/* Chat / Polls (desktop) */}
          {chatOpen && !isMobile && sessionId && (
            <div className="gc-sidebar">
              <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,.07)", flexShrink:0, background:"rgba(32,33,36,.97)" }}>
                {(["chat","polls"] as const).map(tab=>(
                  <button key={tab} onClick={()=>{ setSideTab(tab); if(tab==="chat") setChatUnread(0); }} style={{
                    flex:1, padding:"13px 4px", background:"none", border:"none",
                    color:sideTab===tab?"#8ab4f8":"rgba(255,255,255,.4)",
                    fontSize:13, fontWeight:sideTab===tab?600:400,
                    borderBottom:sideTab===tab?"2px solid #8ab4f8":"2px solid transparent",
                    cursor:"pointer", fontFamily:"'Google Sans',sans-serif", transition:"color .15s",
                  }}>
                    {tab==="chat"?"💬 Chat":"📊 Polls"}
                    {tab==="chat" && chatUnread>0 && (
                      <span style={{ marginLeft:4, background:"#ef4444", color:"#fff", borderRadius:10, fontSize:10, padding:"1px 5px" }}>{chatUnread}</span>
                    )}
                  </button>
                ))}
                <button onClick={()=>setChatOpen(false)} style={{ background:"none", border:"none", color:"rgba(255,255,255,.3)", cursor:"pointer", padding:"0 12px", flexShrink:0 }}>
                  <X style={{ width:14, height:14 }} />
                </button>
              </div>
              <div style={{ flex:1, overflow:"hidden" }}>
                {sideTab==="chat" ? <ClassChatPanel sessionId={sessionId} /> : <ClassPolls sessionId={sessionId} />}
              </div>
            </div>
          )}
        </div>

        {/* ════ CONTROLS ════ */}
        {sessionId ? (
          <ClassControls
            sessionId={sessionId}
            isHostOverride={!!isHost}
            onToggleChat={()=>{ setChatOpen(v=>!v); if(!chatOpen) setChatUnread(0); }}
            onToggleParticipants={()=>setPartOpen(v=>!v)}
            onEndClass={isHost?()=>setShowEndConfirm(true):undefined}
            onLeaveClass={handleLeave}
            chatUnread={chatUnread}
            onLaunchPoll={isHost?()=>{ setChatOpen(true); setSideTab("polls"); }:undefined}
            onLaunchQuiz={isHost?()=>setShowQuiz(true):undefined}
          />
        ) : (
          <div style={{ height:1, background:"rgba(255,255,255,.06)", flexShrink:0 }} />
        )}

        {sessionId && <LiveQuizOverlay sessionId={sessionId} isOpen={showQuiz} onClose={()=>setShowQuiz(false)} />}
      </LiveKitRoom>

      {/* ════ MOBILE BOTTOM SHEETS ════ */}
      {isMobile && partOpen && sessionId && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.65)", zIndex:50 }} onClick={()=>setPartOpen(false)}>
          <div style={{ position:"absolute", bottom:64, left:0, right:0, background:"#13181f", borderRadius:"22px 22px 0 0", maxHeight:"65vh", overflow:"auto", animation:"gc-slide-up .22s ease" }} onClick={e=>e.stopPropagation()}>
            <div style={{ width:40, height:4, borderRadius:2, background:"rgba(255,255,255,.2)", margin:"12px auto 6px" }} />
            <ClassParticipants sessionId={sessionId} />
          </div>
        </div>
      )}

      {isMobile && chatOpen && sessionId && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.65)", zIndex:50 }} onClick={()=>setChatOpen(false)}>
          <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"#13181f", borderRadius:"22px 22px 0 0", maxHeight:"82vh", display:"flex", flexDirection:"column", animation:"gc-slide-up .22s ease", paddingBottom:"env(safe-area-inset-bottom,0px)" }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", padding:"12px 16px 0", flexShrink:0 }}>
              <div style={{ flex:1, display:"flex" }}>
                {(["chat","polls"] as const).map(tab=>(
                  <button key={tab} onClick={()=>setSideTab(tab)} style={{ flex:1, padding:"10px 6px", background:"none", border:"none", color:sideTab===tab?"#fff":"rgba(255,255,255,.35)", fontSize:13, fontWeight:sideTab===tab?700:400, borderBottom:sideTab===tab?"2px solid #0a7c68":"2px solid transparent", cursor:"pointer" }}>
                    {tab==="chat"?"💬 Chat":"📊 Polls"}
                  </button>
                ))}
              </div>
              <button onClick={()=>setChatOpen(false)} style={{ width:32, height:32, borderRadius:"50%", background:"rgba(255,255,255,.1)", border:"none", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <X style={{ width:14, height:14 }} />
              </button>
            </div>
            <div style={{ flex:1, overflow:"hidden", minHeight:320 }}>
              {sideTab==="chat" ? <ClassChatPanel sessionId={sessionId} /> : <ClassPolls sessionId={sessionId} />}
            </div>
          </div>
        </div>
      )}

      {/* ════ END CLASS CONFIRM ════ */}
      {showEndConfirm && (
        <div style={{ position:"fixed", inset:0, zIndex:9500, background:"rgba(0,0,0,.65)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setShowEndConfirm(false)}>
          <div style={{ background:"#2D2E30", borderRadius:20, padding:"32px 28px 24px", width:"100%", maxWidth:380, margin:"0 16px", boxShadow:"0 24px 64px rgba(0,0,0,.7)", border:"1px solid rgba(255,255,255,.08)", animation:"gc-fade-up .18s ease" }} onClick={e=>e.stopPropagation()}>
            <div style={{ width:56, height:56, borderRadius:"50%", background:"rgba(239,68,68,.12)", border:"1px solid rgba(239,68,68,.2)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 18px" }}>
              <Phone style={{ width:22, height:22, color:"#ef4444", transform:"rotate(135deg)" }} />
            </div>
            <h2 style={{ textAlign:"center", fontSize:18, fontWeight:500, color:"#e8eaed", marginBottom:8, fontFamily:"'Google Sans',sans-serif" }}>End class for everyone?</h2>
            <p style={{ textAlign:"center", fontSize:13, color:"rgba(255,255,255,.45)", marginBottom:24, lineHeight:1.6, fontFamily:"'Google Sans',sans-serif" }}>This will disconnect all participants.</p>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <button onClick={handleEndClass} style={{ width:"100%", padding:13, borderRadius:24, border:"none", background:"#ea4335", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"'Google Sans',sans-serif" }}>End for All</button>
              <button onClick={()=>{ setShowEndConfirm(false); handleLeave(); }} style={{ width:"100%", padding:12, borderRadius:24, border:"1px solid rgba(255,255,255,.15)", background:"rgba(255,255,255,.06)", color:"rgba(255,255,255,.8)", fontSize:14, cursor:"pointer", fontFamily:"'Google Sans',sans-serif" }}>Leave but Keep Open</button>
              <button onClick={()=>setShowEndConfirm(false)} style={{ width:"100%", padding:12, borderRadius:24, border:"none", background:"transparent", color:"rgba(255,255,255,.4)", fontSize:14, cursor:"pointer", fontFamily:"'Google Sans',sans-serif" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};

export default GuestClassroom;
