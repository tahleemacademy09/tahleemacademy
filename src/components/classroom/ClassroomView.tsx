import { useState, useEffect, useRef, useCallback } from "react";
import { LiveKitRoom, VideoConference, RoomAudioRenderer, useRoomContext } from "@livekit/components-react";
// @ts-ignore
import "@livekit/components-styles";
import { Track } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { LogOut, MessageCircle, Circle, Send, X, Pause, Play, Square, Loader2, Mic } from "lucide-react";

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

/* ─── Main ClassroomView ─── */
const ClassroomView = ({ subject, onLeave }: ClassroomViewProps) => {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [attendanceId, setAttendanceId] = useState<string | null>(null);
  const [joinedAt] = useState(Date.now());
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatProfiles, setChatProfiles] = useState<Record<string, string>>({});
  const [savingRecording, setSavingRecording] = useState(false);
  const isPrivileged = hasRole("admin") || hasRole("teacher");

  useEffect(() => {
    const getToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("livekit-token", {
          body: { subject_id: subject.id, action: isPrivileged ? "start_session" : "join" },
        });
        if (error) throw error;
        if (data.error) throw new Error(data.error);
        setToken(data.token);
        setWsUrl(data.url);

        const { data: sessions } = await supabase.from("live_sessions")
          .select("*").eq("subject_id", subject.id).in("status", ["live", "active", "scheduled"]).order("scheduled_at", { ascending: false, nullsFirst: false }).limit(1);
        if (sessions?.length) {
          setSessionId(sessions[0].id);
          setSessionInfo(sessions[0]);
          const { data: att } = await supabase.from("attendance_logs").insert({
            session_id: sessions[0].id, user_id: user!.id, device_info: navigator.userAgent,
          }).select("id").single();
          if (att) setAttendanceId(att.id);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to connect");
      } finally { setLoading(false); }
    };
    getToken();
  }, []);

  useEffect(() => {
    return () => {
      if (attendanceId) {
        const duration = Math.floor((Date.now() - joinedAt) / 1000);
        supabase.from("attendance_logs").update({ left_at: new Date().toISOString(), duration_seconds: duration }).eq("id", attendanceId).then(() => {});
      }
    };
  }, [attendanceId, joinedAt]);

  // Chat
  useEffect(() => {
    if (!sessionId) return;
    const loadChat = async () => {
      const { data } = await supabase.from("session_chat").select("*").eq("session_id", sessionId).order("created_at");
      setChatMessages(data || []);
      const userIds = [...new Set((data || []).map((m: any) => m.user_id))];
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
        const map: Record<string, string> = {};
        (profs || []).forEach((p: any) => { map[p.user_id] = p.full_name || "Student"; });
        setChatProfiles(prev => ({ ...prev, ...map }));
      }
    };
    loadChat();
    const channel = supabase.channel(`session-chat-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "session_chat", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setChatMessages(prev => [...prev, payload.new]);
          if (!chatProfiles[payload.new.user_id]) {
            supabase.from("profiles").select("user_id, full_name").eq("user_id", payload.new.user_id).maybeSingle()
              .then(({ data }) => { if (data) setChatProfiles(prev => ({ ...prev, [data.user_id]: data.full_name || "Student" })); });
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  const sendChat = async () => {
    if (!chatInput.trim() || !sessionId || !user) return;
    await supabase.from("session_chat").insert({ session_id: sessionId, user_id: user.id, message: chatInput.trim() });
    setChatInput("");
  };

  const endSession = async () => {
    if (sessionId) {
      await supabase.from("live_sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", sessionId);
    }
    onLeave();
  };

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

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4 max-w-md p-6">
          <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto"><X className="h-8 w-8 text-destructive" /></div>
          <h2 className="text-xl font-bold">{t("Connection Failed", "فشل الاتصال")}</h2>
          <p className="text-muted-foreground">{error}</p>
          <Button onClick={onLeave}>{t("Go Back", "رجوع")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-foreground relative">
      {token && wsUrl && (
        <LiveKitRoom serverUrl={wsUrl} token={token} connect={true}
          options={{ adaptiveStream: true, dynacast: true, videoCaptureDefaults: { resolution: { width: 1280, height: 720 } } }}
          style={{ height: "100%" }} data-lk-theme="default"
        >
          {/* Top bar */}
          <div className="h-12 bg-background/90 backdrop-blur border-b flex items-center justify-between px-4 z-10">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="gap-1">
                <Circle className="h-2 w-2 fill-primary text-primary" />
                {subject.title}
              </Badge>
              {sessionInfo && (sessionInfo as any).topic && (
                <span className="text-xs text-muted-foreground">
                  #{(sessionInfo as any).session_number} — {(sessionInfo as any).topic}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <RecordingController sessionId={sessionId} subjectId={subject.id} userEmail={user?.email || ""} isPrivileged={isPrivileged} onSavingChange={setSavingRecording} />
              <Button size="sm" variant="ghost" onClick={() => setChatOpen(!chatOpen)}><MessageCircle className="h-4 w-4" /></Button>
              <Button size="sm" variant="destructive" onClick={isPrivileged ? endSession : onLeave} className="gap-1">
                <LogOut className="h-3 w-3" />{isPrivileged ? t("End", "إنهاء") : t("Leave", "مغادرة")}
              </Button>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1"><VideoConference /><RoomAudioRenderer /></div>
            {chatOpen && (
              <div className="w-72 sm:w-80 bg-background border-s flex flex-col">
                <div className="p-3 border-b flex items-center justify-between">
                  <h3 className="font-semibold text-sm">{t("Chat", "المحادثة")}</h3>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setChatOpen(false)}><X className="h-3 w-3" /></Button>
                </div>
                <ScrollArea className="flex-1 p-3">
                  <div className="space-y-2">
                    {chatMessages.map((m) => {
                      const isMe = m.user_id === user?.id;
                      const name = chatProfiles[m.user_id] || (isMe ? "You" : m.user_id.slice(0, 8));
                      return (
                        <div key={m.id} className={`text-sm p-2 rounded-lg ${isMe ? "bg-primary/10 ms-4" : "bg-muted me-4"}`}>
                          <p className="text-xs text-muted-foreground mb-0.5 font-medium">{isMe ? t("You", "أنت") : name}</p>
                          <p>{m.message}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
                <div className="p-2 border-t flex gap-2">
                  <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder={t("Type message...", "اكتب رسالة...")}
                    className="text-sm" onKeyDown={(e) => e.key === "Enter" && sendChat()} />
                  <Button size="icon" onClick={sendChat} disabled={!chatInput.trim()}><Send className="h-3 w-3" /></Button>
                </div>
              </div>
            )}
          </div>
        </LiveKitRoom>
      )}
    </div>
  );
};

export default ClassroomView;
