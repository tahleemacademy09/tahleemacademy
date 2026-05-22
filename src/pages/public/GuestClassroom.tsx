import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  useRoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track, ConnectionState, RoomEvent } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  LogOut, UserPlus, Radio, Users, Circle, Loader2,
  Mic, Pause, Play, Square, X, MessageSquare, BarChart3,
  Minimize2, Maximize2, Wifi, WifiOff, RefreshCw, Phone,
  AlertTriangle,
} from "lucide-react";
import ClassChatPanel from "@/components/classroom/ClassChatPanel";
import ClassPolls from "@/components/classroom/ClassPolls";
import ClassParticipants from "@/components/classroom/ClassParticipants";
import ClassControls from "@/components/classroom/ClassControls";
import LiveQuizOverlay from "@/components/classroom/LiveQuizOverlay";
import { useIsMobile } from "@/hooks/use-mobile";

/* ══════════════════════════════════════════════════════
   INLINE CSS — Google Meet–quality animations & layout
   ══════════════════════════════════════════════════════ */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap');

  @keyframes gc-spin       { to { transform:rotate(360deg); } }
  @keyframes gc-pulse      { 0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)} }
  @keyframes gc-rec-pulse  { 0%,100%{opacity:1}50%{opacity:.3} }
  @keyframes gc-fade-up    { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
  @keyframes gc-slide-up   { from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1} }
  @keyframes gc-bounce-in  { 0%{transform:scale(.85);opacity:0}60%{transform:scale(1.04)}100%{transform:scale(1);opacity:1} }
  @keyframes gc-bar-appear { from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1} }
  @keyframes gc-speak-bar  { 0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)} }
  @keyframes gc-connect-glow {
    0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
    50%     { box-shadow: 0 0 0 6px rgba(34,197,94,.18); }
  }
  @keyframes gc-reconnect-spin {
    to { transform: rotate(360deg); }
  }

  [data-gc-root] {
    font-family: 'Google Sans', 'Roboto', sans-serif;
    -webkit-font-smoothing: antialiased;
    overscroll-behavior: none;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  [data-gc-root] * { box-sizing: border-box; }
  [data-gc-root] button {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    font-family: 'Google Sans', 'Roboto', sans-serif;
  }

  .gc-badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 10px; border-radius: 20px;
    font-size: 12px; font-weight: 500;
    font-family: 'Google Sans', sans-serif;
  }

  /* Side panel */
  .gc-sidebar {
    width: 288px; display: flex; flex-direction: column;
    background: rgba(32,33,36,.97);
    border-left: 1px solid rgba(255,255,255,.07);
    flex-shrink: 0;
    animation: gc-slide-up .22s ease;
  }

  /* Connection quality bars */
  .gc-quality-bar {
    transition: background .3s ease, transform .2s ease;
  }

  /* Minimize pill */
  .gc-min-pill {
    position: fixed; bottom: 24px; right: 20px;
    z-index: 9000;
    display: flex; align-items: center; gap: 10px;
    background: rgba(32,33,36,.96); backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 50px; padding: 8px 14px;
    box-shadow: 0 8px 32px rgba(0,0,0,.6);
    cursor: pointer;
    animation: gc-bounce-in .3s cubic-bezier(.34,1.56,.64,1) both;
    transition: box-shadow .2s ease, transform .15s ease;
  }
  .gc-min-pill:hover {
    box-shadow: 0 12px 40px rgba(0,0,0,.75);
    transform: translateY(-2px);
  }

  /* Reconnecting overlay */
  .gc-reconnect-overlay {
    position: absolute; inset: 0; z-index: 200;
    background: rgba(32,33,36,.9); backdrop-filter: blur(12px);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 16px;
    animation: gc-fade-up .2s ease;
  }

  /* LK overrides */
  [data-lk-theme] { height: 100% !important; display: flex !important; flex-direction: column !important; }
  .lk-video-conference { height: 100% !important; }
`;

/* ─── Connection Quality Indicator ─── */
const ConnectionIndicator = () => {
  const room = useRoomContext();
  const [quality, setQuality] = useState<"excellent" | "good" | "fair" | "poor">("excellent");
  const [connState, setConnState] = useState<ConnectionState>(ConnectionState.Connected);

  useEffect(() => {
    const syncQuality = () => {
      const stats = room.localParticipant.connectionQuality as unknown as number;
      if (stats >= 3) setQuality("excellent");
      else if (stats >= 2) setQuality("good");
      else if (stats >= 1) setQuality("fair");
      else setQuality("poor");
    };
    const syncState = () => setConnState(room.state);

    room.on(RoomEvent.ConnectionStateChanged, syncState);
    room.on(RoomEvent.ConnectionQualityChanged, syncQuality);
    const iv = setInterval(syncQuality, 2500);
    syncQuality();
    return () => {
      room.off(RoomEvent.ConnectionStateChanged, syncState);
      room.off(RoomEvent.ConnectionQualityChanged, syncQuality);
      clearInterval(iv);
    };
  }, [room]);

  const colors = {
    excellent: "#22c55e",
    good:      "#86efac",
    fair:      "#facc15",
    poor:      "#ef4444",
  };
  const bars = { excellent: 4, good: 3, fair: 2, poor: 1 };
  const col = colors[quality];

  if (connState === ConnectionState.Reconnecting) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <RefreshCw style={{ width: 12, height: 12, color: "#facc15", animation: "gc-reconnect-spin .8s linear infinite" }} />
        <span style={{ fontSize: 11, color: "#facc15", fontWeight: 500 }}>Reconnecting</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 14 }}>
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="gc-quality-bar"
            style={{
              width: 3, borderRadius: 2,
              height: `${i * 3 + 2}px`,
              background: i <= bars[quality] ? col : "rgba(255,255,255,.2)",
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 10, color: col, fontWeight: 600, letterSpacing: ".3px" }}>
        {quality.toUpperCase()}
      </span>
    </div>
  );
};

/* ─── High-Quality Auto-Reconnect Monitor ─── */
interface ReconnectMonitorProps {
  onReconnecting: () => void;
  onReconnected: () => void;
  onDisconnected: () => void;
}
const ReconnectMonitor = ({ onReconnecting, onReconnected, onDisconnected }: ReconnectMonitorProps) => {
  const room = useRoomContext();
  useEffect(() => {
    const onStateChange = (state: ConnectionState) => {
      if (state === ConnectionState.Reconnecting) onReconnecting();
      else if (state === ConnectionState.Connected)  onReconnected();
      else if (state === ConnectionState.Disconnected) onDisconnected();
    };
    room.on(RoomEvent.ConnectionStateChanged, onStateChange);
    return () => { room.off(RoomEvent.ConnectionStateChanged, onStateChange); };
  }, [room, onReconnecting, onReconnected, onDisconnected]);
  return null;
};

/* ─── Silent Audio Keep-Alive (prevents Android tab suspension) ─── */
function useSilentAudio(active: boolean) {
  const acRef  = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  useEffect(() => {
    if (!active) {
      srcRef.current?.stop(); srcRef.current = null;
      acRef.current?.close(); acRef.current  = null;
      return;
    }
    const start = () => {
      try {
        const AC  = window.AudioContext || (window as any).webkitAudioContext;
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

/* ─── Wake Lock (keeps screen on during class) ─── */
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

/* ─── Recording Controller (host only) ─── */
interface RecordingControllerProps {
  sessionId: string | null;
  classId: string;
  userName: string;
  isHost: boolean;
  onSavingChange: (saving: boolean) => void;
}

const RecordingController = ({ sessionId, classId, userName, isHost, onSavingChange }: RecordingControllerProps) => {
  const room = useRoomContext();
  const [recording, setRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [savingRecording, setSavingRecording] = useState(false);
  const [recordingMode, setRecordingMode] = useState<"screen" | "audio" | null>(null);
  const timerRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamsRef.current.forEach(s => s.getTracks().forEach(t => t.stop()));
    };
  }, []);

  const collectRoomAudioStream = useCallback((): MediaStream | null => {
    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const destination = audioContext.createMediaStreamDestination();
      let trackCount = 0;
      const participants = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
      for (const participant of participants) {
        const pubs = [...participant.trackPublications.values()];
        for (const pub of pubs) {
          if (pub.track && (pub.source === Track.Source.Microphone || pub.source === Track.Source.ScreenShareAudio)) {
            const mst = pub.track.mediaStreamTrack;
            if (mst && mst.readyState === "live") {
              const source = audioContext.createMediaStreamSource(new MediaStream([mst]));
              source.connect(destination);
              trackCount++;
            }
          }
        }
      }
      if (trackCount === 0) return null;
      return destination.stream;
    } catch { return null; }
  }, [room]);

  const startRecording = useCallback(async () => {
    let stream: MediaStream | null = null;
    let mode: "screen" | "audio" = "audio";
    if (typeof navigator.mediaDevices.getDisplayMedia === "function") {
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: 1280, height: 720 } as any, audio: true });
        mode = "screen";
        const roomAudio = collectRoomAudioStream();
        if (roomAudio && audioContextRef.current) {
          const ctx = audioContextRef.current;
          const dest = ctx.createMediaStreamDestination();
          stream.getAudioTracks().forEach(t => { const src = ctx.createMediaStreamSource(new MediaStream([t])); src.connect(dest); });
          roomAudio.getAudioTracks().forEach(t => { const src = ctx.createMediaStreamSource(new MediaStream([t])); src.connect(dest); });
          stream = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
        }
      } catch { stream = null; }
    }
    if (!stream) {
      mode = "audio";
      stream = collectRoomAudioStream();
      if (!stream) {
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
        catch { return; }
      }
    }
    streamsRef.current.push(stream);
    const isVideo = stream.getVideoTracks().length > 0;
    const mimeType = isVideo
      ? (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm")
      : (MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm");
    const recorder = new MediaRecorder(stream, { mimeType });
    recordedChunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    if (isVideo) { stream.getVideoTracks()[0]?.addEventListener("ended", () => { if (mediaRecorderRef.current?.state !== "inactive") stopRecording(); }); }
    recorder.start(1000);
    mediaRecorderRef.current = recorder;
    setRecordingMode(mode);
    setRecording(true);
    setRecordingPaused(false);
    setRecordingTime(0);
    timerRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
  }, [collectRoomAudioStream]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause(); setRecordingPaused(true); clearInterval(timerRef.current);
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume(); setRecordingPaused(false);
      timerRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    clearInterval(timerRef.current);
    const duration = recordingTime;
    const mode = recordingMode;
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      setRecording(false); setRecordingPaused(false); setRecordingTime(0); return;
    }
    setSavingRecording(true); onSavingChange(true);
    await new Promise<void>((resolve) => { mediaRecorderRef.current!.onstop = () => resolve(); mediaRecorderRef.current!.stop(); });
    streamsRef.current.forEach(s => s.getTracks().forEach(t => t.stop()));
    streamsRef.current = [];
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
    setRecording(false); setRecordingPaused(false); setRecordingTime(0);
    const isVideo = mode === "screen";
    const contentType = isVideo ? "video/webm" : "audio/webm";
    const blob = new Blob(recordedChunksRef.current, { type: contentType });
    recordedChunksRef.current = [];
    if (blob.size < 500) { setSavingRecording(false); onSavingChange(false); return; }
    try {
      const timestamp = Date.now();
      const storagePath = `recordings/public-class/${classId}/${timestamp}.webm`;
      const { error: uploadErr } = await storageSupabase.storage.from("subject-files").upload(storagePath, blob, { contentType, upsert: false });
      if (uploadErr) throw uploadErr;
    } catch (err) {
      console.error("Recording save failed", err);
    } finally { setSavingRecording(false); onSavingChange(false); }
  }, [recordingTime, recordingMode, classId, onSavingChange]);

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  if (!isHost) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {recording && (
        <div className="gc-badge" style={{
          background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.4)",
          color: "#fca5a5", animation: "gc-rec-pulse 1.4s ease-in-out infinite",
        }}>
          <Circle style={{ width: 7, height: 7, fill: "#ef4444", color: "#ef4444" }} />
          {recordingMode === "audio" ? "REC (Audio)" : "REC"} {formatTime(recordingTime)}
          {recordingPaused && <span style={{ fontSize: 10, opacity: .7 }}>(PAUSED)</span>}
        </div>
      )}
      {savingRecording && (
        <div className="gc-badge" style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)", color: "rgba(255,255,255,.6)" }}>
          <Loader2 style={{ width: 12, height: 12, animation: "gc-spin .8s linear infinite" }} />
          Saving…
        </div>
      )}
      {!recording && !savingRecording && (
        <button onClick={startRecording} style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "5px 12px", borderRadius: 20, border: "none",
          background: "#ef4444", color: "#fff", fontSize: 12, fontWeight: 600,
          cursor: "pointer", fontFamily: "'Google Sans', sans-serif",
        }}>
          <Circle style={{ width: 8, height: 8, fill: "#fff", color: "#fff" }} />
          Record
        </button>
      )}
      {recording && (
        <>
          {recordingPaused ? (
            <button onClick={resumeRecording} style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "5px 10px", borderRadius: 20,
              border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.08)",
              color: "#fff", fontSize: 12, cursor: "pointer",
            }}><Play style={{ width: 11, height: 11 }} />Resume</button>
          ) : (
            <button onClick={pauseRecording} style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "5px 10px", borderRadius: 20,
              border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.08)",
              color: "#fff", fontSize: 12, cursor: "pointer",
            }}><Pause style={{ width: 11, height: 11 }} />Pause</button>
          )}
          <button onClick={stopRecording} style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "5px 10px", borderRadius: 20, border: "none",
            background: "#ef4444", color: "#fff", fontSize: 12, cursor: "pointer",
          }}><Square style={{ width: 11, height: 11 }} />Stop</button>
        </>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════
   MAIN GuestClassroom
   ═══════════════════════════════════════════════ */
const GuestClassroom = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [connected, setConnected] = useState(false);
  const [ended, setEnded] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [classDuration, setClassDuration] = useState(0);
  const [savingRecording, setSavingRecording] = useState(false);

  // Minimize state
  const [minimized, setMinimized] = useState(false);

  // Reconnection state
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [roomKey, setRoomKey] = useState(0);
  const intentionalLeaveRef = useRef(false);

  // Side panels
  const [chatOpen, setChatOpen] = useState(!isMobile);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [activeSideTab, setActiveSideTab] = useState<"chat" | "polls">("chat");
  const [chatUnread, setChatUnread] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);

  const {
    token, url, room, guestName, classTitle, classTitleAr,
    isHost, classId, sessionId,
  } = (location.state || {}) as {
    token?: string; url?: string; room?: string;
    guestName?: string; classTitle?: string; classTitleAr?: string;
    isHost?: boolean; classId?: string; sessionId?: string;
  };

  // Keep-alive & wake-lock during live class
  useSilentAudio(connected && !ended);
  useWakeLock(connected && !ended);

  useEffect(() => {
    if (!token || !url) navigate("/live");
  }, [token, url, navigate]);

  // Duration timer
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => setClassDuration(prev => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [connected]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  // Auto-reconnect on unexpected disconnect (up to 5 attempts)
  const autoReconnect = useCallback(() => {
    if (intentionalLeaveRef.current) return;
    setReconnectCount(prev => {
      if (prev >= 5) { setEnded(true); return prev; }
      setTimeout(() => {
        setReconnecting(false);
        setRoomKey(k => k + 1);
      }, 2000 + prev * 1000);
      return prev + 1;
    });
  }, []);

  const handleEndClass = async () => {
    setShowEndConfirm(false);
    intentionalLeaveRef.current = true;
    if (classId) {
      await supabase.from("public_classes").update({
        status: "ended",
        actual_end_time: new Date().toISOString(),
      }).eq("id", classId);
    }
    setEnded(true);
  };

  const handleLeave = () => {
    intentionalLeaveRef.current = true;
    setEnded(true);
  };

  if (!token || !url) return null;

  /* ─── Ended Screen ─── */
  if (ended) {
    return (
      <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "#0f3122", color: "white", fontFamily: "'Google Sans', sans-serif" }}>
        <style>{CSS}</style>
        <div style={{ maxWidth: 420, width: "100%", textAlign: "center", animation: "gc-fade-up .3s ease" }}>
          <p style={{ fontSize: 32, marginBottom: 4, fontFamily: "'Amiri', serif", color: "#c9973a" }}>الدرس انتهى</p>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: "#fff", marginBottom: 6 }}>Class Has Ended</h2>
          <p style={{ color: "#c9973a", fontFamily: "'Amiri', serif", marginBottom: 4 }}>جزاكم الله خيراً</p>
          <p style={{ color: "rgba(255,255,255,.5)", fontSize: 13, marginBottom: 28 }}>JazakAllahu Khayran for joining!</p>
          {!isHost && (
            <div style={{ borderRadius: 16, padding: "20px 22px", marginBottom: 20, background: "rgba(201,151,58,.09)", border: "1px solid rgba(201,151,58,.28)" }}>
              <p style={{ color: "#fff", fontWeight: 600, marginBottom: 10 }}>Enjoyed the class?</p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,.55)", marginBottom: 12 }}>Join Tahleem Academy for FREE and get:</p>
              <ul style={{ fontSize: 13, color: "rgba(255,255,255,.7)", textAlign: "left", listStyle: "none", padding: 0, marginBottom: 14 }}>
                {["Access to all course recordings","Live classes every week","Personal progress tracking","Quran Hifdh programme","Revision centre","Chat with teachers and students"].map((item, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>✅ {item}</li>
                ))}
              </ul>
              <Link to="/register">
                <button style={{ width: "100%", padding: "13px", borderRadius: 24, border: "none", background: "#c9973a", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <UserPlus style={{ width: 18, height: 18 }} /> Register Free — It's Free!
                </button>
              </Link>
            </div>
          )}
          {isHost ? (
            <Link to="/admin/public-classes" style={{ fontSize: 13, color: "rgba(255,255,255,.35)", textDecoration: "underline" }}>Back to Dashboard</Link>
          ) : (
            <Link to="/live" style={{ fontSize: 13, color: "rgba(255,255,255,.35)", textDecoration: "underline" }}>Maybe Later — Browse Classes</Link>
          )}
        </div>
      </div>
    );
  }

  /* ─── Minimized Pill ─── */
  if (minimized) {
    return (
      <div data-gc-root>
        <style>{CSS}</style>
        <div className="gc-min-pill" onClick={() => setMinimized(false)}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", animation: "gc-pulse 1.8s ease-in-out infinite", flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: "#fff", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {classTitle || "Live Class"}
          </span>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)", fontVariantNumeric: "tabular-nums" }}>
            {formatTime(classDuration)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, borderLeft: "1px solid rgba(255,255,255,.12)", paddingLeft: 10, marginLeft: 2 }}>
            <Maximize2 style={{ width: 14, height: 14, color: "rgba(255,255,255,.6)" }} />
            <button
              onClick={e => { e.stopPropagation(); intentionalLeaveRef.current = true; setEnded(true); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(239,68,68,.3)", color: "#fca5a5", cursor: "pointer" }}
            >
              <Phone style={{ width: 11, height: 11, transform: "rotate(135deg)" }} />
            </button>
          </div>
        </div>
        {/* LiveKit still running in background (hidden, connection maintained) */}
        <div style={{ position: "fixed", width: 1, height: 1, opacity: 0, pointerEvents: "none", overflow: "hidden" }}>
          <LiveKitRoom
            key={roomKey}
            serverUrl={url}
            token={token}
            connect={true}
            options={{
              adaptiveStream: true, dynacast: true,
              audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
              disconnectOnPageLeave: false,
            }}
            data-lk-theme="default"
          >
            <RoomAudioRenderer />
            <ReconnectMonitor
              onReconnecting={() => setReconnecting(true)}
              onReconnected={() => { setReconnecting(false); setReconnectCount(0); }}
              onDisconnected={autoReconnect}
            />
          </LiveKitRoom>
        </div>
      </div>
    );
  }

  /* ─── Full Live Classroom ─── */
  return (
    <div
      data-gc-root
      style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#202124", overflow: "hidden" }}
    >
      <style>{CSS}</style>
      <LiveKitRoom
        key={roomKey}
        serverUrl={url}
        token={token}
        connect={true}
        onConnected={() => { setConnected(true); setReconnecting(false); setReconnectCount(0); }}
        onDisconnected={() => { if (!intentionalLeaveRef.current) autoReconnect(); }}
        options={{
          adaptiveStream: { pixelDensity: "screen" },
          dynacast: true,
          disconnectOnPageLeave: false,
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
            channelCount: 1,
          },
          publishDefaults: {
            audioPreset: { maxBitrate: 64000 },
            dtx: false,
            red: true,
            stopMicTrackOnMute: false,
            videoEncoding: { maxBitrate: 700_000, maxFramerate: 20 },
            backupCodec: true,
          },
          videoCaptureDefaults: {
            resolution: { width: 1280, height: 720 },
          },
        }}
        style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}
        data-lk-theme="default"
      >
        {/* Reconnect Monitor */}
        <ReconnectMonitor
          onReconnecting={() => setReconnecting(true)}
          onReconnected={() => { setReconnecting(false); setReconnectCount(0); }}
          onDisconnected={autoReconnect}
        />

        {/* ── Reconnecting overlay ── */}
        {reconnecting && (
          <div className="gc-reconnect-overlay">
            <div style={{ width: 52, height: 52, border: "3px solid rgba(138,180,248,.2)", borderTopColor: "#8ab4f8", borderRadius: "50%", animation: "gc-reconnect-spin .8s linear infinite" }} />
            <p style={{ color: "#e8eaed", fontSize: 16, fontWeight: 500 }}>Reconnecting…</p>
            <p style={{ color: "rgba(255,255,255,.4)", fontSize: 13 }}>
              {reconnectCount > 0 ? `Attempt ${reconnectCount}/5 — Please stay on the page` : "Please stay on the page"}
            </p>
          </div>
        )}

        {/* ═══ TOP BAR ═══ */}
        <div style={{
          height: 56, flexShrink: 0,
          background: "rgba(32,33,36,.97)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 14px 0 16px",
          borderBottom: "1px solid rgba(255,255,255,.06)", gap: 8,
        }}>
          {/* LEFT */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
            {isHost ? (
              <div className="gc-badge" style={{ background: "rgba(239,68,68,.13)", border: "1px solid rgba(239,68,68,.3)", color: "#fca5a5", flexShrink: 0 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "gc-pulse 1.8s ease-in-out infinite" }} />
                <Radio style={{ width: 10, height: 10 }} /> LIVE
              </div>
            ) : (
              <div className="gc-badge" style={{ background: "rgba(201,151,58,.12)", border: "1px solid rgba(201,151,58,.3)", color: "#c9973a", flexShrink: 0 }}>
                Guest
              </div>
            )}

            <div className="gc-badge" style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)", color: "rgba(255,255,255,.85)", flexShrink: 0, maxWidth: 180 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{classTitle || "Public Class"}</span>
            </div>

            {classTitleAr && (
              <span style={{ fontSize: 12, color: "rgba(255,255,255,.4)", fontFamily: "'Amiri', serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }} className="hidden sm:block">
                {classTitleAr}
              </span>
            )}

            <div className="gc-badge" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", color: "rgba(255,255,255,.7)", flexShrink: 0 }}>
              <Circle style={{ width: 6, height: 6, fill: "#ef4444", color: "#ef4444", animation: "gc-rec-pulse 1.4s ease-in-out infinite" }} />
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatTime(classDuration)}</span>
            </div>
          </div>

          {/* RIGHT */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <ConnectionIndicator />

            <RecordingController
              sessionId={sessionId || null}
              classId={classId || ""}
              userName={guestName || "Host"}
              isHost={!!isHost}
              onSavingChange={setSavingRecording}
            />

            {!isHost && (
              <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)", whiteSpace: "nowrap" }} className="hidden sm:block">
                as <span style={{ color: "#fff", fontWeight: 500 }}>{guestName}</span>
              </span>
            )}

            {!isHost && (
              <Link to="/register" className="hidden sm:block">
                <button style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "5px 12px",
                  borderRadius: 20, border: "1px solid rgba(201,151,58,.5)",
                  background: "transparent", color: "#c9973a", fontSize: 12, cursor: "pointer",
                  fontFamily: "'Google Sans', sans-serif",
                }}>
                  <UserPlus style={{ width: 12, height: 12 }} /> Create Account
                </button>
              </Link>
            )}

            {/* Minimize button */}
            <button
              onClick={() => setMinimized(true)}
              title="Minimize — audio stays connected"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 32, height: 32, borderRadius: "50%", border: "none",
                background: "rgba(255,255,255,.1)", color: "rgba(255,255,255,.7)",
                cursor: "pointer", transition: "background .15s",
              }}
            >
              <Minimize2 style={{ width: 15, height: 15 }} />
            </button>
          </div>
        </div>

        {/* ═══ MAIN CONTENT ═══ */}
        <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
          {/* Participants panel (desktop) */}
          {participantsOpen && !isMobile && sessionId && (
            <div style={{ width: 224, background: "rgba(32,33,36,.97)", borderRight: "1px solid rgba(255,255,255,.07)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
              <ClassParticipants
                sessionId={sessionId}
                onMuteStudent={isHost ? (studentId) => {
                  supabase.from("class_participants").update({ is_muted: true }).eq("session_id", sessionId).eq("student_id", studentId);
                } : undefined}
                onRemoveStudent={isHost ? (studentId) => {
                  supabase.from("class_participants").update({ left_at: new Date().toISOString() }).eq("session_id", sessionId).eq("student_id", studentId);
                } : undefined}
              />
            </div>
          )}

          {/* Video area */}
          <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
            <VideoConference />
            <RoomAudioRenderer />
          </div>

          {/* Right panel: Chat/Polls (desktop) */}
          {chatOpen && !isMobile && sessionId && (
            <div className="gc-sidebar">
              <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,.07)", flexShrink: 0, background: "rgba(32,33,36,.97)" }}>
                {(["chat", "polls"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => { setActiveSideTab(tab); if (tab === "chat") setChatUnread(0); }}
                    style={{
                      flex: 1, padding: "14px 4px", background: "none", border: "none",
                      color: activeSideTab === tab ? "#8ab4f8" : "rgba(255,255,255,.4)",
                      fontSize: 13, fontWeight: activeSideTab === tab ? 600 : 400,
                      borderBottom: activeSideTab === tab ? "2px solid #8ab4f8" : "2px solid transparent",
                      cursor: "pointer", fontFamily: "'Google Sans', sans-serif", transition: "color .15s",
                    }}
                  >
                    {tab === "chat" ? "💬 Chat" : "📊 Polls"}
                    {tab === "chat" && chatUnread > 0 && (
                      <span style={{ marginLeft: 4, background: "#ef4444", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 5px" }}>
                        {chatUnread}
                      </span>
                    )}
                  </button>
                ))}
                <button
                  onClick={() => setChatOpen(false)}
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,.3)", cursor: "pointer", padding: "0 14px", flexShrink: 0 }}
                >
                  <X style={{ width: 15, height: 15 }} />
                </button>
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                {activeSideTab === "chat" ? (
                  <ClassChatPanel sessionId={sessionId} />
                ) : (
                  <ClassPolls sessionId={sessionId} />
                )}
              </div>
            </div>
          )}
        </div>

        {/* ═══ BOTTOM CONTROL BAR ═══ */}
        {sessionId ? (
          <ClassControls
            sessionId={sessionId}
            onToggleChat={() => { setChatOpen(!chatOpen); if (!chatOpen) setChatUnread(0); }}
            onToggleParticipants={() => setParticipantsOpen(!participantsOpen)}
            onEndClass={isHost ? () => setShowEndConfirm(true) : undefined}
            onLeaveClass={handleLeave}
            chatUnread={chatUnread}
            onLaunchPoll={isHost ? () => { setChatOpen(true); setActiveSideTab("polls"); } : undefined}
            onLaunchQuiz={isHost ? () => setShowQuiz(true) : undefined}
          />
        ) : (
          <div style={{ height: 1, background: "rgba(255,255,255,.06)", flexShrink: 0 }} />
        )}

        {/* Live Quiz Overlay */}
        {sessionId && (
          <LiveQuizOverlay
            sessionId={sessionId}
            isOpen={showQuiz}
            onClose={() => setShowQuiz(false)}
          />
        )}
      </LiveKitRoom>

      {/* ═══ MOBILE BOTTOM SHEETS ═══ */}
      {isMobile && participantsOpen && sessionId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 50 }} onClick={() => setParticipantsOpen(false)}>
          <div
            style={{ position: "absolute", bottom: 64, left: 0, right: 0, background: "#13181f", borderRadius: "22px 22px 0 0", maxHeight: "65vh", overflow: "auto", animation: "gc-slide-up .22s ease" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,.2)", margin: "12px auto 6px" }} />
            <ClassParticipants sessionId={sessionId} />
          </div>
        </div>
      )}

      {isMobile && chatOpen && sessionId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 50 }} onClick={() => setChatOpen(false)}>
          <div
            style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#13181f", borderRadius: "22px 22px 0 0", maxHeight: "82vh", display: "flex", flexDirection: "column", animation: "gc-slide-up .22s ease", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", padding: "12px 16px 0", flexShrink: 0 }}>
              <div style={{ flex: 1, display: "flex" }}>
                {(["chat", "polls"] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveSideTab(tab)} style={{
                    flex: 1, padding: "10px 6px", background: "none", border: "none",
                    color: activeSideTab === tab ? "#fff" : "rgba(255,255,255,.35)",
                    fontSize: 13, fontWeight: activeSideTab === tab ? 700 : 400,
                    borderBottom: activeSideTab === tab ? "2px solid #0a7c68" : "2px solid transparent",
                    cursor: "pointer",
                  }}>
                    {tab === "chat" ? "💬 Chat" : "📊 Polls"}
                  </button>
                ))}
              </div>
              <button onClick={() => setChatOpen(false)} style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,.1)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: "hidden", minHeight: 320 }}>
              {activeSideTab === "chat" ? <ClassChatPanel sessionId={sessionId} /> : <ClassPolls sessionId={sessionId} />}
            </div>
          </div>
        </div>
      )}

      {/* ═══ END CLASS CONFIRMATION ═══ */}
      {showEndConfirm && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9500, background: "rgba(0,0,0,.65)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowEndConfirm(false)}
        >
          <div
            style={{ background: "#2D2E30", borderRadius: 20, padding: "32px 28px 24px", width: "100%", maxWidth: 380, margin: "0 16px", boxShadow: "0 24px 64px rgba(0,0,0,.7)", border: "1px solid rgba(255,255,255,.08)", animation: "gc-fade-up .18s ease" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
              <Phone style={{ width: 22, height: 22, color: "#ef4444", transform: "rotate(135deg)" }} />
            </div>
            <h2 style={{ textAlign: "center", fontSize: 18, fontWeight: 500, color: "#e8eaed", marginBottom: 8, fontFamily: "'Google Sans', sans-serif" }}>
              End class for everyone?
            </h2>
            <p style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,.45)", marginBottom: 24, lineHeight: 1.6 }}>
              This will disconnect all participants and end the recording.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={handleEndClass} style={{ width: "100%", padding: 13, borderRadius: 24, border: "none", background: "#ea4335", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Google Sans', sans-serif" }}>
                End for All
              </button>
              <button onClick={() => { setShowEndConfirm(false); handleLeave(); }} style={{ width: "100%", padding: 12, borderRadius: 24, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.8)", fontSize: 14, cursor: "pointer", fontFamily: "'Google Sans', sans-serif" }}>
                Leave but Keep Open
              </button>
              <button onClick={() => setShowEndConfirm(false)} style={{ width: "100%", padding: 12, borderRadius: 24, border: "none", background: "transparent", color: "rgba(255,255,255,.4)", fontSize: 14, cursor: "pointer", fontFamily: "'Google Sans', sans-serif" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GuestClassroom;
