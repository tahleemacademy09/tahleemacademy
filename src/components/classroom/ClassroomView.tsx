import { useState, useEffect, useRef } from "react";
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from "@livekit/components-react";
// @ts-ignore
import "@livekit/components-styles";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { LogOut, MessageCircle, Circle, Send, X, Pause, Play, Square } from "lucide-react";

interface ClassroomViewProps {
  subject: any;
  onLeave: () => void;
}

const ClassroomView = ({ subject, onLeave }: ClassroomViewProps) => {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [attendanceId, setAttendanceId] = useState<string | null>(null);
  const [joinedAt] = useState(Date.now());
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatProfiles, setChatProfiles] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingStartedAt, setRecordingStartedAt] = useState<Date | null>(null);
  const timerRef = useRef<any>(null);
  const isPrivileged = hasRole("admin") || hasRole("teacher");

  // Connect to LiveKit
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

        // Get or create session
        const { data: sessions } = await supabase.from("live_sessions")
          .select("id").eq("subject_id", subject.id).eq("status", "live").limit(1);
        if (sessions?.length) {
          setSessionId(sessions[0].id);
          const { data: att } = await supabase.from("attendance_logs").insert({
            session_id: sessions[0].id,
            user_id: user!.id,
            device_info: navigator.userAgent,
          }).select("id").single();
          if (att) setAttendanceId(att.id);
        }
      } catch (err: any) {
        setError(err.message || "Failed to connect");
      } finally {
        setLoading(false);
      }
    };
    getToken();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Update attendance on unmount
  useEffect(() => {
    return () => {
      if (attendanceId) {
        const duration = Math.floor((Date.now() - joinedAt) / 1000);
        supabase.from("attendance_logs").update({
          left_at: new Date().toISOString(),
          duration_seconds: duration,
        }).eq("id", attendanceId).then(() => {});
      }
    };
  }, [attendanceId, joinedAt]);

  // Chat
  useEffect(() => {
    if (!sessionId) return;
    const loadChat = async () => {
      const { data } = await supabase.from("session_chat")
        .select("*").eq("session_id", sessionId).order("created_at");
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

  // Recording controls
  const startRecording = () => {
    setRecording(true);
    setRecordingPaused(false);
    setRecordingStartedAt(new Date());
    setRecordingTime(0);
    timerRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
    toast({ title: t("Recording started", "بدأ التسجيل") });
  };

  const pauseRecording = () => {
    setRecordingPaused(true);
    clearInterval(timerRef.current);
    toast({ title: t("Recording paused", "تم إيقاف التسجيل مؤقتاً") });
  };

  const resumeRecording = () => {
    setRecordingPaused(false);
    timerRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
    toast({ title: t("Recording resumed", "تم استئناف التسجيل") });
  };

  const stopRecording = async () => {
    setRecording(false);
    setRecordingPaused(false);
    clearInterval(timerRef.current);
    const duration = recordingTime;
    if (sessionId) {
      await supabase.from("session_recordings").insert({
        session_id: sessionId,
        subject_id: subject.id,
        teacher_name: user?.email || "Teacher",
        duration_seconds: duration,
        file_url: "",
      });
      toast({ title: t("Recording saved", "تم حفظ التسجيل"), description: `${Math.floor(duration / 60)}m ${duration % 60}s` });
    }
    setRecordingTime(0);
    setRecordingStartedAt(null);
  };

  const endSession = async () => {
    if (recording) await stopRecording();
    if (sessionId) {
      await supabase.from("live_sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", sessionId);
    }
    onLeave();
  };

  const leaveClass = () => {
    // Student leaves but session stays active
    onLeave();
  };

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

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
          <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <X className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold">{t("Connection Failed", "فشل الاتصال")}</h2>
          <p className="text-muted-foreground">{error === "LiveKit not configured" ? t("Live System Not Configured", "نظام البث غير مُهيأ") : error}</p>
          <Button onClick={onLeave}>{t("Go Back", "رجوع")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-foreground relative">
      {/* Top bar */}
      <div className="h-12 bg-background/90 backdrop-blur border-b flex items-center justify-between px-4 z-10">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1">
            <Circle className="h-2 w-2 fill-primary text-primary" />
            {subject.title}
          </Badge>
          {recording && (
            <Badge variant="destructive" className="gap-1 animate-pulse">
              <Circle className="h-2 w-2 fill-destructive-foreground" />
              REC {formatTime(recordingTime)}
              {recordingPaused && <span className="ms-1 text-[10px]">(PAUSED)</span>}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Recording controls (admin/teacher) */}
          {isPrivileged && !recording && (
            <Button size="sm" variant="outline" onClick={startRecording} className="gap-1 text-xs">
              <Circle className="h-2 w-2 fill-red-500" />
              {t("Record", "تسجيل")}
            </Button>
          )}
          {isPrivileged && recording && (
            <>
              {recordingPaused ? (
                <Button size="sm" variant="outline" onClick={resumeRecording} className="gap-1 text-xs">
                  <Play className="h-3 w-3" />
                  {t("Resume", "استئناف")}
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={pauseRecording} className="gap-1 text-xs">
                  <Pause className="h-3 w-3" />
                  {t("Pause", "إيقاف مؤقت")}
                </Button>
              )}
              <Button size="sm" variant="destructive" onClick={stopRecording} className="gap-1 text-xs">
                <Square className="h-3 w-3" />
                {t("Stop", "إيقاف")}
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => setChatOpen(!chatOpen)}>
            <MessageCircle className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="destructive" onClick={isPrivileged ? endSession : leaveClass} className="gap-1">
            <LogOut className="h-3 w-3" />
            {isPrivileged ? t("End", "إنهاء") : t("Leave", "مغادرة")}
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1">
          {token && wsUrl && (
            <LiveKitRoom serverUrl={wsUrl} token={token} connect={true}
              options={{ adaptiveStream: true, dynacast: true, videoCaptureDefaults: { resolution: { width: 1280, height: 720 } } }}
              style={{ height: "100%" }}
              data-lk-theme="default"
            >
              <VideoConference />
              <RoomAudioRenderer />
            </LiveKitRoom>
          )}
        </div>

        {/* Chat sidebar */}
        {chatOpen && (
          <div className="w-72 sm:w-80 bg-background border-s flex flex-col">
            <div className="p-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-sm">{t("Chat", "المحادثة")}</h3>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setChatOpen(false)}>
                <X className="h-3 w-3" />
              </Button>
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
    </div>
  );
};

export default ClassroomView;
