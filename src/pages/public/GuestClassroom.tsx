import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  useRoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  LogOut, UserPlus, Radio, Users, Circle, Loader2,
  Mic, Pause, Play, Square, X, MessageSquare, BarChart3,
} from "lucide-react";
import ClassChatPanel from "@/components/classroom/ClassChatPanel";
import ClassPolls from "@/components/classroom/ClassPolls";
import ClassParticipants from "@/components/classroom/ClassParticipants";
import ClassControls from "@/components/classroom/ClassControls";
import LiveQuizOverlay from "@/components/classroom/LiveQuizOverlay";
import { useIsMobile } from "@/hooks/use-mobile";

/* ─── Connection Quality Indicator ─── */
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
  const bars = { excellent: 4, good: 3, fair: 2, poor: 1 };

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
        stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: 1280, height: 720 }, audio: true });
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
    if (mediaRecorderRef.current?.state === "recording") { mediaRecorderRef.current.pause(); setRecordingPaused(true); clearInterval(timerRef.current); }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") { mediaRecorderRef.current.resume(); setRecordingPaused(false); timerRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000); }
  }, []);

  const stopRecording = useCallback(async () => {
    clearInterval(timerRef.current);
    const duration = recordingTime;
    const mode = recordingMode;
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") { setRecording(false); setRecordingPaused(false); setRecordingTime(0); return; }
    setSavingRecording(true);
    onSavingChange(true);
    await new Promise<void>((resolve) => { mediaRecorderRef.current!.onstop = () => resolve(); mediaRecorderRef.current!.stop(); });
    streamsRef.current.forEach(s => s.getTracks().forEach(t => t.stop()));
    streamsRef.current = [];
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
    setRecording(false);
    setRecordingPaused(false);
    setRecordingTime(0);
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
    <div className="flex items-center gap-1.5">
      {recording && (
        <Badge variant="destructive" className="gap-1 animate-pulse">
          {recordingMode === "audio" ? <Mic className="h-2 w-2" /> : <Circle className="h-2 w-2 fill-destructive-foreground" />}
          {recordingMode === "audio" ? "REC (Audio)" : "REC"} {formatTime(recordingTime)}
          {recordingPaused && <span className="ms-1 text-[10px]">(PAUSED)</span>}
        </Badge>
      )}
      {savingRecording && <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Saving...</Badge>}
      {!recording && !savingRecording && (
        <Button
          size="sm"
          onClick={startRecording}
          className="gap-1.5 text-xs shrink-0 rounded-full font-semibold"
          style={{ background: "#ef4444", color: "#fff", border: "none", minWidth: "76px" }}
        >
          <Circle className="h-2.5 w-2.5 fill-white text-white" />
          Record
        </Button>
      )}
      {recording && (
        <>
          {recordingPaused ? (
            <Button size="sm" variant="outline" onClick={resumeRecording} className="gap-1 text-xs"><Play className="h-3 w-3" />Resume</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={pauseRecording} className="gap-1 text-xs"><Pause className="h-3 w-3" />Pause</Button>
          )}
          <Button size="sm" variant="destructive" onClick={stopRecording} className="gap-1 text-xs"><Square className="h-3 w-3" />Stop</Button>
        </>
      )}
    </div>
  );
};

/* ─── Main GuestClassroom ─── */
const GuestClassroom = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [connected, setConnected] = useState(false);
  const [ended, setEnded] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [classDuration, setClassDuration] = useState(0);
  const [savingRecording, setSavingRecording] = useState(false);

  // Side panels
  const [chatOpen, setChatOpen] = useState(!isMobile);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [activeSideTab, setActiveSideTab] = useState<"chat" | "polls">("chat");
  const [chatUnread, setChatUnread] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);

  const { token, url, room, guestName, classTitle, classTitleAr, isHost, classId, sessionId } = (location.state || {}) as {
    token?: string;
    url?: string;
    room?: string;
    guestName?: string;
    classTitle?: string;
    classTitleAr?: string;
    isHost?: boolean;
    classId?: string;
    sessionId?: string;
  };

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

  const handleEndClass = async () => {
    setShowEndConfirm(false);
    if (classId) {
      await supabase.from("public_classes").update({
        status: "ended",
        actual_end_time: new Date().toISOString(),
      }).eq("id", classId);
    }
    setEnded(true);
  };

  const handleLeave = () => {
    setEnded(true);
  };

  if (!token || !url) return null;

  // ─── Ended screen ───
  if (ended) {
    return (
      <div className="h-screen flex items-center justify-center p-4" style={{ background: "#0f3122", color: "white", fontFamily: "'Cairo', sans-serif" }}>
        <div className="max-w-md w-full text-center">
          <p className="text-3xl mb-2" style={{ fontFamily: "'Amiri', serif", color: "#c9973a" }}>الدرس انتهى</p>
          <h2 className="text-2xl font-bold text-white mb-2">Class Has Ended</h2>
          <p className="mb-1" style={{ color: "#c9973a", fontFamily: "'Amiri', serif" }}>جزاكم الله خيراً</p>
          <p className="text-white/60 text-sm mb-8">JazakAllahu Khayran for joining!</p>

          {!isHost && (
            <div className="rounded-xl p-6 mb-6" style={{ background: "rgba(201,151,58,0.1)", border: "1px solid rgba(201,151,58,0.3)" }}>
              <p className="text-white font-semibold mb-3">Enjoyed the class?</p>
              <p className="text-sm text-white/60 mb-4">Join Tahleem Academy for FREE and get:</p>
              <ul className="text-sm text-white/70 text-left space-y-1.5 mb-4">
                <li>✅ Access to all course recordings</li>
                <li>✅ Live classes every week</li>
                <li>✅ Personal progress tracking</li>
                <li>✅ Quran Hifdh programme</li>
                <li>✅ Revision centre</li>
                <li>✅ Chat with teachers and students</li>
              </ul>
              <Link to="/register">
                <Button className="w-full text-lg py-5" style={{ background: "#c9973a" }}>
                  <UserPlus className="h-5 w-5 mr-2" />Register Free — It's Free!
                </Button>
              </Link>
            </div>
          )}

          {isHost ? (
            <Link to="/admin/public-classes" className="text-sm text-white/40 hover:text-white/60 underline">Back to Dashboard</Link>
          ) : (
            <Link to="/live" className="text-sm text-white/40 hover:text-white/60 underline">Maybe Later — Browse Classes</Link>
          )}
        </div>
      </div>
    );
  }

  // ─── Live classroom (fullscreen, no scroll) ───
  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "#111" }}>
      <LiveKitRoom
        serverUrl={url}
        token={token}
        connect={true}
        onConnected={() => setConnected(true)}
        onDisconnected={() => setEnded(true)}
        options={{
          adaptiveStream: true,
          dynacast: true,
          videoCaptureDefaults: { resolution: { width: 1280, height: 720 } },
        }}
        style={{ height: "100%", display: "flex", flexDirection: "column" }}
        data-lk-theme="default"
      >
        {/* ─── Top bar ─── */}
        <div className="h-11 shrink-0 bg-background/95 backdrop-blur border-b flex items-center justify-between px-3 z-10">
          <div className="flex items-center gap-2 min-w-0">
            {isHost ? (
              <Badge variant="destructive" className="gap-1 shrink-0 animate-pulse">
                <Radio className="h-3 w-3" /> LIVE
              </Badge>
            ) : (
              <Badge variant="outline" className="shrink-0 text-[#c9973a] border-[#c9973a]">Guest</Badge>
            )}
            <Badge variant="outline" className="gap-1 shrink-0">
              <Circle className="h-2 w-2 fill-primary text-primary" />
              <span className="truncate max-w-[120px]">{classTitle || "Public Class"}</span>
            </Badge>
            {classTitleAr && (
              <span className="text-xs text-muted-foreground truncate hidden sm:block" style={{ fontFamily: "'Amiri', serif" }}>
                {classTitleAr}
              </span>
            )}
            <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
              <Circle className="h-1.5 w-1.5 fill-destructive text-destructive animate-pulse" />
              {formatTime(classDuration)}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <ConnectionIndicator />
            <RecordingController
              sessionId={sessionId || null}
              classId={classId || ""}
              userName={guestName || "Host"}
              isHost={!!isHost}
              onSavingChange={setSavingRecording}
            />
            {!isHost && (
              <span className="text-xs text-muted-foreground hidden sm:block">
                Joining as: <span className="text-foreground font-medium">{guestName}</span>
              </span>
            )}
            {!isHost && (
              <Link to="/register">
                <Button size="sm" variant="outline" className="border-[#c9973a] text-[#c9973a] hover:bg-[#c9973a] hover:text-white text-xs hidden sm:flex">
                  <UserPlus className="h-3 w-3 mr-1" /> Create Account
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* ─── Main content area ─── */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Participants panel (desktop) */}
          {participantsOpen && !isMobile && sessionId && (
            <div className="w-56 bg-background border-e flex flex-col shrink-0">
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
          <div className="flex-1 relative min-w-0">
            <VideoConference />
            <RoomAudioRenderer />
          </div>

          {/* Right panel: Chat/Polls (desktop) */}
          {chatOpen && !isMobile && sessionId && (
            <div className="w-72 bg-background border-s flex flex-col shrink-0">
              <div className="flex border-b">
                <button
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${activeSideTab === "chat" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
                  onClick={() => { setActiveSideTab("chat"); setChatUnread(0); }}
                >
                  💬 Chat
                </button>
                <button
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${activeSideTab === "polls" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
                  onClick={() => setActiveSideTab("polls")}
                >
                  📊 Polls
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                {activeSideTab === "chat" ? (
                  <ClassChatPanel sessionId={sessionId} />
                ) : (
                  <ClassPolls sessionId={sessionId} />
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── Bottom control bar ─── */}
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
          /* Fallback footer — just a safe-area divider line */
          <div className="shrink-0 border-t" style={{ height: "1px", background: "rgba(255,255,255,0.08)" }} />
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

      {/* ─── Mobile side panels (bottom sheets) ─── */}
      {isMobile && participantsOpen && sessionId && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setParticipantsOpen(false)}>
          <div className="absolute bottom-16 left-0 right-0 bg-background rounded-t-xl max-h-[60vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mt-2 mb-1" />
            <ClassParticipants sessionId={sessionId} />
          </div>
        </div>
      )}

      {isMobile && chatOpen && sessionId && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setChatOpen(false)}>
          <div className="absolute bottom-16 left-0 right-0 bg-background rounded-t-xl max-h-[60vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mt-2 mb-1" />
            <div className="flex border-b">
              <button
                className={`flex-1 py-2 text-xs font-medium ${activeSideTab === "chat" ? "border-b-2 border-primary" : "text-muted-foreground"}`}
                onClick={() => setActiveSideTab("chat")}
              >
                💬 Chat
              </button>
              <button
                className={`flex-1 py-2 text-xs font-medium ${activeSideTab === "polls" ? "border-b-2 border-primary" : "text-muted-foreground"}`}
                onClick={() => setActiveSideTab("polls")}
              >
                📊 Polls
              </button>
            </div>
            <div className="flex-1 overflow-hidden min-h-[300px]">
              {activeSideTab === "chat" ? (
                <ClassChatPanel sessionId={sessionId} />
              ) : (
                <ClassPolls sessionId={sessionId} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* End class confirmation */}
      <Dialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End class for everyone?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will disconnect all participants and end the recording.
          </p>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowEndConfirm(false)}>Cancel</Button>
            <Button variant="outline" onClick={() => { setShowEndConfirm(false); handleLeave(); }}>
              Leave but Keep Open
            </Button>
            <Button variant="destructive" onClick={handleEndClass}>
              End for All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GuestClassroom;
