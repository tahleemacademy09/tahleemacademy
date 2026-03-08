import { useState, useEffect, useRef, useCallback } from "react";
import { LiveKitRoom, VideoConference, RoomAudioRenderer, useRoomContext } from "@livekit/components-react";
// @ts-ignore
import "@livekit/components-styles";
import { Track } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Circle, Loader2, Mic, Pause, Play, Square, X, Wifi, WifiOff } from "lucide-react";
import ClassLobby from "./ClassLobby";
import ClassParticipants from "./ClassParticipants";
import ClassChatPanel from "./ClassChatPanel";
import ClassControls from "./ClassControls";
import ClassPolls from "./ClassPolls";
import ClassEndScreen from "./ClassEndScreen";
import LiveQuizOverlay from "./LiveQuizOverlay";
import { useIsMobile } from "@/hooks/use-mobile";

interface ClassroomViewProps {
  subject: any;
  onLeave: () => void;
}

/* ─── Inner recording controller (lives inside LiveKitRoom context) ─── */
interface RecordingControllerProps {
  sessionId: string | null;
  subjectId: string;
  userEmail: string;
  isPrivileged: boolean;
  onSavingChange: (saving: boolean) => void;
}

const RecordingController = ({ sessionId, subjectId, userEmail, isPrivileged, onSavingChange }: RecordingControllerProps) => {
  const room = useRoomContext();
  const { t } = useLanguage();
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
        catch { toast({ title: t("Recording failed", "فشل التسجيل"), variant: "destructive" }); return; }
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
    toast({ title: t("Recording started", "بدأ التسجيل"), description: mode === "screen" ? t("Screen + audio", "شاشة + صوت") : t("Audio recording", "تسجيل صوتي") });
  }, [collectRoomAudioStream, t]);

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
    if (blob.size < 500) { setSavingRecording(false); onSavingChange(false); toast({ title: t("Recording too short", "التسجيل قصير جداً"), variant: "destructive" }); return; }
    try {
      const timestamp = Date.now();
      const storagePath = `recordings/${sessionId || subjectId}/${timestamp}.webm`;
      const { error: uploadErr } = await supabase.storage.from("subject-files").upload(storagePath, blob, { contentType, upsert: false });
      if (uploadErr) throw uploadErr;
      await supabase.from("session_recordings").insert({ session_id: sessionId || subjectId, subject_id: subjectId, teacher_name: userEmail || "Teacher", duration_seconds: duration, file_url: storagePath, file_size: blob.size });
      toast({ title: t("Recording saved!", "تم حفظ التسجيل!"), description: `${Math.floor(duration / 60)}m ${duration % 60}s` });
    } catch (err: unknown) {
      toast({ title: t("Failed to save", "فشل الحفظ"), description: err instanceof Error ? err.message : "Upload failed", variant: "destructive" });
    } finally { setSavingRecording(false); onSavingChange(false); }
  }, [recordingTime, recordingMode, sessionId, subjectId, userEmail, t, onSavingChange]);

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  if (!isPrivileged) return null;

  return (
    <div className="flex items-center gap-1.5">
      {recording && (
        <Badge variant="destructive" className="gap-1 animate-pulse">
          {recordingMode === "audio" ? <Mic className="h-2 w-2" /> : <Circle className="h-2 w-2 fill-destructive-foreground" />}
          {recordingMode === "audio" ? "REC (Audio)" : "REC"} {formatTime(recordingTime)}
          {recordingPaused && <span className="ms-1 text-[10px]">(PAUSED)</span>}
        </Badge>
      )}
      {savingRecording && <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />{t("Saving...", "جاري الحفظ...")}</Badge>}
      {!recording && !savingRecording && (
        <Button size="sm" variant="outline" onClick={startRecording} className="gap-1 text-xs"><Circle className="h-2 w-2 fill-red-500 text-red-500" />{t("Record", "تسجيل")}</Button>
      )}
      {recording && (
        <>
          {recordingPaused ? (
            <Button size="sm" variant="outline" onClick={resumeRecording} className="gap-1 text-xs"><Play className="h-3 w-3" />{t("Resume", "استئناف")}</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={pauseRecording} className="gap-1 text-xs"><Pause className="h-3 w-3" />{t("Pause", "إيقاف مؤقت")}</Button>
          )}
          <Button size="sm" variant="destructive" onClick={stopRecording} className="gap-1 text-xs"><Square className="h-3 w-3" />{t("Stop", "إيقاف")}</Button>
        </>
      )}
    </div>
  );
};

/* ─── Connection Quality Indicator ─── */
const ConnectionIndicator = () => {
  const room = useRoomContext();
  const [quality, setQuality] = useState<"excellent" | "good" | "fair" | "poor">("excellent");

  useEffect(() => {
    const interval = setInterval(() => {
      const stats = room.localParticipant.connectionQuality;
      // ConnectionQuality enum: 0=unknown,1=poor,2=good,3=excellent
      if (stats >= 3) setQuality("excellent");
      else if (stats >= 2) setQuality("good");
      else if (stats >= 1) setQuality("fair");
      else setQuality("poor");
    }, 3000);
    return () => clearInterval(interval);
  }, [room]);

  const colors = {
    excellent: "text-green-500",
    good: "text-green-400",
    fair: "text-yellow-500",
    poor: "text-destructive",
  };

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

/* ─── Main ClassroomView ─── */
const ClassroomView = ({ subject, onLeave }: ClassroomViewProps) => {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [phase, setPhase] = useState<"lobby" | "live" | "ended">("lobby");
  const [token, setToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [attendanceId, setAttendanceId] = useState<string | null>(null);
  const [joinedAt] = useState(Date.now());
  const [savingRecording, setSavingRecording] = useState(false);
  const isPrivileged = hasRole("admin") || hasRole("teacher");

  // UI state
  const [chatOpen, setChatOpen] = useState(!isMobile);
  const [participantsOpen, setParticipantsOpen] = useState(!isMobile);
  const [activeSideTab, setActiveSideTab] = useState<"chat" | "polls">("chat");
  const [chatUnread, setChatUnread] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [classDuration, setClassDuration] = useState(0);

  // Check if session is already live
  const [isSessionLive, setIsSessionLive] = useState(false);
  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.from("live_sessions")
        .select("*").eq("subject_id", subject.id).eq("status", "live").maybeSingle();
      if (data) {
        setSessionInfo(data);
        setSessionId(data.id);
        setIsSessionLive(true);
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [subject.id]);

  // Auto-join for students when class goes live
  useEffect(() => {
    if (!isPrivileged && isSessionLive && phase === "lobby") {
      // Session is live, student can join
    }
  }, [isSessionLive, isPrivileged, phase]);

  // Duration timer
  useEffect(() => {
    if (phase !== "live") return;
    const timer = setInterval(() => setClassDuration(prev => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const connectToLiveKit = async (action: string, settings?: any) => {
    setLoading(true);
    try {
      // If teacher starting, update session settings
      if (settings && sessionId) {
        await supabase.from("live_sessions").update({
          ...settings,
          actual_start_time: new Date().toISOString(),
          status: "live",
        }).eq("id", sessionId);
      }

      const { data, error } = await supabase.functions.invoke("livekit-token", {
        body: { subject_id: subject.id, action },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setToken(data.token);
      setWsUrl(data.url);

      // Get/create session
      const { data: sessions } = await supabase.from("live_sessions")
        .select("*").eq("subject_id", subject.id).in("status", ["live", "active", "scheduled"]).order("scheduled_at", { ascending: false, nullsFirst: false }).limit(1);
      if (sessions?.length) {
        setSessionId(sessions[0].id);
        setSessionInfo(sessions[0]);
        // Log attendance
        const { data: att } = await supabase.from("attendance_logs").insert({
          session_id: sessions[0].id, user_id: user!.id, device_info: navigator.userAgent,
        }).select("id").single();
        if (att) setAttendanceId(att.id);
        // Add to class_participants
        await supabase.from("class_participants").upsert({
          session_id: sessions[0].id,
          student_id: user!.id,
          joined_at: new Date().toISOString(),
          is_muted: !isPrivileged,
          camera_on: true,
        }, { onConflict: "session_id,student_id" });
      }

      setPhase("live");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally { setLoading(false); }
  };

  const handleStartClass = (settings: any) => {
    connectToLiveKit("start_session", settings);
  };

  const handleJoinClass = () => {
    connectToLiveKit("join");
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (attendanceId) {
        const duration = Math.floor((Date.now() - joinedAt) / 1000);
        supabase.from("attendance_logs").update({ left_at: new Date().toISOString(), duration_seconds: duration }).eq("id", attendanceId).then(() => {});
      }
      if (sessionId && user) {
        supabase.from("class_participants").update({
          left_at: new Date().toISOString(),
          duration_minutes: Math.floor((Date.now() - joinedAt) / 60000),
        }).eq("session_id", sessionId).eq("student_id", user.id).then(() => {});
      }
    };
  }, [attendanceId, joinedAt, sessionId, user]);

  const endSession = async () => {
    setShowEndConfirm(false);
    if (sessionId) {
      await supabase.from("live_sessions").update({
        status: "ended",
        ended_at: new Date().toISOString(),
        actual_end_time: new Date().toISOString(),
      }).eq("id", sessionId);

      // Send system message
      if (user) {
        await supabase.from("class_chat_messages").insert({
          session_id: sessionId,
          sender_id: user.id,
          message: t("Class has ended", "انتهت الحصة"),
          type: "system",
        });
      }
    }
    setPhase("ended");
  };

  const leaveSession = () => {
    if (attendanceId) {
      const duration = Math.floor((Date.now() - joinedAt) / 1000);
      supabase.from("attendance_logs").update({ left_at: new Date().toISOString(), duration_seconds: duration }).eq("id", attendanceId);
    }
    if (sessionId && user) {
      supabase.from("class_participants").update({
        left_at: new Date().toISOString(),
        duration_minutes: Math.floor((Date.now() - joinedAt) / 60000),
      }).eq("session_id", sessionId).eq("student_id", user.id);
    }
    onLeave();
  };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  // PHASE: Ended
  if (phase === "ended") {
    return (
      <ClassEndScreen
        subject={subject}
        session={sessionInfo}
        duration={classDuration}
        participantCount={participantCount}
        onGoToDashboard={onLeave}
        onGoToRevision={() => {
          window.location.href = `/student/revision/${subject.id}`;
        }}
      />
    );
  }

  // PHASE: Lobby
  if (phase === "lobby" && !loading && !error) {
    return (
      <ClassLobby
        subject={subject}
        session={sessionInfo}
        onStartClass={handleStartClass}
        onJoinClass={handleJoinClass}
        onBack={onLeave}
        isLive={isSessionLive}
      />
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-3">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">{t("Connecting to classroom...", "جاري الاتصال بالفصل...")}</p>
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4 max-w-md p-6">
          <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto"><X className="h-8 w-8 text-destructive" /></div>
          <h2 className="text-xl font-bold">{t("Connection Failed", "فشل الاتصال")}</h2>
          <p className="text-muted-foreground">{error}</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => { setError(null); setPhase("lobby"); }}>{t("Try Again", "حاول مرة أخرى")}</Button>
            <Button variant="outline" onClick={onLeave}>{t("Go Back", "رجوع")}</Button>
          </div>
        </div>
      </div>
    );
  }

  // PHASE: Live classroom
  return (
    <div className="h-screen flex flex-col bg-foreground relative">
      {token && wsUrl && (
        <LiveKitRoom serverUrl={wsUrl} token={token} connect={true}
          options={{ adaptiveStream: true, dynacast: true, videoCaptureDefaults: { resolution: { width: 1280, height: 720 } } }}
          style={{ height: "100%" }} data-lk-theme="default"
        >
          {/* Top bar */}
          <div className="h-11 bg-background/95 backdrop-blur border-b flex items-center justify-between px-3 z-10">
            <div className="flex items-center gap-2 min-w-0">
              <Badge variant="outline" className="gap-1 shrink-0">
                <Circle className="h-2 w-2 fill-primary text-primary" />
                <span className="truncate max-w-[120px]">{subject.title}</span>
              </Badge>
              {sessionInfo && (sessionInfo as any).topic && (
                <span className="text-xs text-muted-foreground truncate hidden sm:block">
                  #{(sessionInfo as any).session_number} — {(sessionInfo as any).topic}
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
                sessionId={sessionId}
                subjectId={subject.id}
                userEmail={user?.email || ""}
                isPrivileged={isPrivileged}
                onSavingChange={setSavingRecording}
              />
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Participants panel */}
            {participantsOpen && !isMobile && (
              <div className="w-56 bg-background border-e flex flex-col shrink-0">
                <ClassParticipants
                  sessionId={sessionId || ""}
                  onMuteStudent={(studentId) => {
                    supabase.from("class_participants").update({ is_muted: true }).eq("session_id", sessionId!).eq("student_id", studentId);
                  }}
                  onRemoveStudent={(studentId) => {
                    supabase.from("class_participants").update({ left_at: new Date().toISOString() }).eq("session_id", sessionId!).eq("student_id", studentId);
                    toast({ title: t("Student removed", "تمت إزالة الطالب") });
                  }}
                />
              </div>
            )}

            {/* Video area */}
            <div className="flex-1 relative">
              <VideoConference />
              <RoomAudioRenderer />
            </div>

            {/* Right panel: Chat/Polls */}
            {chatOpen && !isMobile && (
              <div className="w-72 bg-background border-s flex flex-col shrink-0">
                {/* Tabs */}
                <div className="flex border-b">
                  <button
                    className={`flex-1 py-2 text-xs font-medium transition-colors ${activeSideTab === "chat" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
                    onClick={() => { setActiveSideTab("chat"); setChatUnread(0); }}
                  >
                    💬 {t("Chat", "محادثة")}
                  </button>
                  <button
                    className={`flex-1 py-2 text-xs font-medium transition-colors ${activeSideTab === "polls" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
                    onClick={() => setActiveSideTab("polls")}
                  >
                    📊 {t("Polls", "تصويت")}
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  {activeSideTab === "chat" ? (
                    <ClassChatPanel sessionId={sessionId || ""} />
                  ) : (
                    <ClassPolls sessionId={sessionId || ""} />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom control bar */}
          <ClassControls
            sessionId={sessionId || ""}
            onToggleChat={() => { setChatOpen(!chatOpen); if (!chatOpen) setChatUnread(0); }}
            onToggleParticipants={() => setParticipantsOpen(!participantsOpen)}
            onEndClass={() => setShowEndConfirm(true)}
            onLeaveClass={leaveSession}
            chatUnread={chatUnread}
            onLaunchPoll={() => { setChatOpen(true); setActiveSideTab("polls"); }}
            onLaunchQuiz={() => setShowQuiz(true)}
          />

          {/* Live Quiz Overlay */}
          <LiveQuizOverlay
            sessionId={sessionId || ""}
            isOpen={showQuiz}
            onClose={() => setShowQuiz(false)}
          />
        </LiveKitRoom>
      )}

      {/* Mobile side panels as bottom sheets */}
      {isMobile && participantsOpen && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setParticipantsOpen(false)}>
          <div className="absolute bottom-16 left-0 right-0 bg-background rounded-t-xl max-h-[60vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mt-2 mb-1" />
            <ClassParticipants sessionId={sessionId || ""} />
          </div>
        </div>
      )}

      {isMobile && chatOpen && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setChatOpen(false)}>
          <div className="absolute bottom-16 left-0 right-0 bg-background rounded-t-xl max-h-[60vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mt-2 mb-1" />
            <div className="flex border-b">
              <button
                className={`flex-1 py-2 text-xs font-medium ${activeSideTab === "chat" ? "border-b-2 border-primary" : "text-muted-foreground"}`}
                onClick={() => setActiveSideTab("chat")}
              >
                💬 {t("Chat", "محادثة")}
              </button>
              <button
                className={`flex-1 py-2 text-xs font-medium ${activeSideTab === "polls" ? "border-b-2 border-primary" : "text-muted-foreground"}`}
                onClick={() => setActiveSideTab("polls")}
              >
                📊 {t("Polls", "تصويت")}
              </button>
            </div>
            <div className="flex-1 overflow-hidden min-h-[300px]">
              {activeSideTab === "chat" ? (
                <ClassChatPanel sessionId={sessionId || ""} />
              ) : (
                <ClassPolls sessionId={sessionId || ""} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* End class confirmation dialog */}
      <Dialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("End class for everyone?", "إنهاء الحصة للجميع؟")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("This will disconnect all participants and end the recording.", "سيتم قطع الاتصال عن جميع المشاركين وإيقاف التسجيل.")}
          </p>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowEndConfirm(false)}>{t("Cancel", "إلغاء")}</Button>
            <Button variant="outline" onClick={() => { setShowEndConfirm(false); leaveSession(); }}>
              {t("Leave but Keep Open", "غادر لكن أبقِ الحصة")}
            </Button>
            <Button variant="destructive" onClick={endSession}>
              {t("End for All", "إنهاء للجميع")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClassroomView;
