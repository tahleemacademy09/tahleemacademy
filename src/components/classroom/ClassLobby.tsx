import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Video, VideoOff, Mic, MicOff, Monitor, Users, Settings } from "lucide-react";

interface ClassLobbyProps {
  subject: any;
  session: any;
  onStartClass: (settings: any) => void;
  onJoinClass: () => void;
  onBack: () => void;
  isLive: boolean;
}

const ClassLobby = ({ subject, session, onStartClass, onJoinClass, onBack, isLive }: ClassLobbyProps) => {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const isPrivileged = hasRole("admin") || hasRole("teacher");

  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [devices, setDevices] = useState<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] }>({ cameras: [], mics: [], speakers: [] });

  // Settings
  const [waitingRoom, setWaitingRoom] = useState(true);
  const [muteOnEntry, setMuteOnEntry] = useState(true);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [handRaiseEnabled, setHandRaiseEnabled] = useState(true);
  const [recordClass, setRecordClass] = useState(true);
  const [screenShareEnabled, setScreenShareEnabled] = useState(true);

  // Waiting participants
  const [waitingStudents, setWaitingStudents] = useState<any[]>([]);

  useEffect(() => {
    const initMedia = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;

        const devs = await navigator.mediaDevices.enumerateDevices();
        setDevices({
          cameras: devs.filter(d => d.kind === "videoinput"),
          mics: devs.filter(d => d.kind === "audioinput"),
          speakers: devs.filter(d => d.kind === "audiooutput"),
        });

        // Mic level
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        const source = ctx.createMediaStreamSource(s);
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const check = () => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          setMicLevel(avg / 128);
          requestAnimationFrame(check);
        };
        check();
      } catch {
        // Permission denied
      }
    };
    initMedia();

    return () => {
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!stream) return;
    stream.getVideoTracks().forEach(t => { t.enabled = cameraOn; });
  }, [cameraOn, stream]);

  useEffect(() => {
    if (!stream) return;
    stream.getAudioTracks().forEach(t => { t.enabled = micOn; });
  }, [micOn, stream]);

  // Load waiting participants
  useEffect(() => {
    if (!session?.id) return;
    const loadParticipants = async () => {
      const { data } = await supabase
        .from("class_participants")
        .select("*, profiles:student_id(full_name, avatar_url)")
        .eq("session_id", session.id)
        .is("left_at", null);
      setWaitingStudents(data || []);
    };
    loadParticipants();

    const channel = supabase.channel(`lobby-${session.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "class_participants", filter: `session_id=eq.${session.id}` },
        () => loadParticipants())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.id]);

  const handleStart = () => {
    stream?.getTracks().forEach(t => t.stop());
    onStartClass({
      waiting_room_enabled: waitingRoom,
      chat_enabled: chatEnabled,
      hand_raise_enabled: handRaiseEnabled,
      recording_enabled: recordClass,
      class_settings: { mute_on_entry: muteOnEntry, screen_share_enabled: screenShareEnabled },
    });
  };

  const handleJoin = () => {
    stream?.getTracks().forEach(t => t.stop());
    onJoinClass();
  };

  return (
    <div className="min-h-screen bg-primary flex flex-col">
      {/* Header */}
      <div className="text-center py-6 px-4">
        <p className="text-secondary font-arabic text-xl mb-2" dir="rtl" style={{ fontFamily: "Amiri" }}>
          بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
        </p>
        <h1 className="text-primary-foreground text-2xl font-bold">{subject.title}</h1>
        {subject.title_ar && (
          <p className="text-primary-foreground/70 font-arabic mt-1" dir="rtl">{subject.title_ar}</p>
        )}
        {session && (
          <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
            {(session as any).topic && (
              <Badge className="bg-secondary/20 text-secondary border-secondary/30">
                #{(session as any).session_number} — {(session as any).topic}
              </Badge>
            )}
            {(session as any).scheduled_at && (
              <Badge variant="outline" className="text-primary-foreground/60 border-primary-foreground/20">
                {new Date((session as any).scheduled_at).toLocaleString()}
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 px-4 pb-6 max-w-5xl mx-auto w-full grid md:grid-cols-2 gap-6">
        {/* Camera Preview */}
        <div className="space-y-4">
          <Card className="bg-foreground/95 border-none overflow-hidden">
            <CardContent className="p-0">
              <div className="relative aspect-video bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${!cameraOn ? "hidden" : ""}`}
                />
                {!cameraOn && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
                      <VideoOff className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </div>
                )}
                {/* Mic level indicator */}
                {micOn && (
                  <div className="absolute bottom-3 left-3 flex items-end gap-0.5 h-4">
                    {[0.2, 0.4, 0.6, 0.8, 1.0].map((threshold, i) => (
                      <div
                        key={i}
                        className={`w-1 rounded-full transition-all duration-75 ${
                          micLevel >= threshold ? "bg-green-500" : "bg-muted-foreground/30"
                        }`}
                        style={{ height: `${(i + 1) * 4}px` }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            <Button
              size="lg"
              variant={micOn ? "secondary" : "destructive"}
              className="rounded-full h-14 w-14"
              onClick={() => setMicOn(!micOn)}
            >
              {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </Button>
            <Button
              size="lg"
              variant={cameraOn ? "secondary" : "destructive"}
              className="rounded-full h-14 w-14"
              onClick={() => setCameraOn(!cameraOn)}
            >
              {cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </Button>
          </div>

          <div className="text-center">
            {cameraOn && micOn ? (
              <p className="text-green-400 text-sm flex items-center justify-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-400" />
                {isPrivileged ? t("Ready to teach!", "جاهز للتدريس!") : t("Ready to join!", "جاهز للانضمام!")}
              </p>
            ) : (
              <p className="text-primary-foreground/50 text-sm">
                {t("Turn on camera and mic for best experience", "شغّل الكاميرا والميكروفون لأفضل تجربة")}
              </p>
            )}
          </div>

          {/* Devices info */}
          <div className="text-primary-foreground/40 text-xs space-y-1">
            <p>📷 {devices.cameras.length} {t("camera(s)", "كاميرا")} | 🎤 {devices.mics.length} {t("mic(s)", "ميكروفون")}</p>
          </div>
        </div>

        {/* Right side: Settings + Participants */}
        <div className="space-y-4">
          {isPrivileged ? (
            <>
              {/* Class Settings */}
              <Card className="bg-primary-foreground/5 border-primary-foreground/10">
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-semibold text-primary-foreground flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    {t("Class Settings", "إعدادات الفصل")}
                  </h3>
                  <div className="space-y-3">
                    {[
                      { label: t("Enable Waiting Room", "تفعيل غرفة الانتظار"), checked: waitingRoom, onChange: setWaitingRoom },
                      { label: t("Mute students on entry", "كتم الطلاب عند الدخول"), checked: muteOnEntry, onChange: setMuteOnEntry },
                      { label: t("Enable in-class chat", "تفعيل المحادثة"), checked: chatEnabled, onChange: setChatEnabled },
                      { label: t("Enable hand raising", "تفعيل رفع اليد"), checked: handRaiseEnabled, onChange: setHandRaiseEnabled },
                      { label: t("Record this class", "تسجيل الحصة"), checked: recordClass, onChange: setRecordClass },
                      { label: t("Enable screen sharing", "تفعيل مشاركة الشاشة"), checked: screenShareEnabled, onChange: setScreenShareEnabled },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <Label className="text-primary-foreground/80 text-sm">{item.label}</Label>
                        <Switch checked={item.checked} onCheckedChange={item.onChange} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Waiting students */}
              <Card className="bg-primary-foreground/5 border-primary-foreground/10">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-primary-foreground flex items-center gap-2 mb-3">
                    <Users className="h-4 w-4" />
                    {t("Waiting Room", "غرفة الانتظار")} ({waitingStudents.length})
                  </h3>
                  {waitingStudents.length === 0 ? (
                    <p className="text-primary-foreground/40 text-sm">{t("No students waiting yet", "لا يوجد طلاب في الانتظار")}</p>
                  ) : (
                    <ScrollArea className="max-h-40">
                      <div className="space-y-2">
                        {waitingStudents.map(s => (
                          <div key={s.id} className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-xs bg-secondary/20 text-secondary">
                                {((s as any).profiles?.full_name || "S")[0]}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-primary-foreground/80 text-sm">{(s as any).profiles?.full_name || "Student"}</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            /* Student pre-class view — can join early */
            <Card className="bg-primary-foreground/5 border-primary-foreground/10">
              <CardContent className="p-6 text-center space-y-4">
                {isLive ? (
                  <>
                    <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                      <Video className="h-8 w-8 text-green-400" />
                    </div>
                    <div>
                      <p className="text-primary-foreground font-semibold">
                        {t("Class is live! Join now", "الحصة مباشرة! انضم الآن")}
                      </p>
                      <p className="text-primary-foreground/50 text-sm font-arabic" dir="rtl">
                        الحصة بدأت — انضم الآن
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="h-16 w-16 rounded-full bg-secondary/20 flex items-center justify-center mx-auto">
                      <Monitor className="h-8 w-8 text-secondary" />
                    </div>
                    <div>
                      <p className="text-primary-foreground font-semibold">
                        {t("You can join early!", "يمكنك الانضمام مبكراً!")}
                      </p>
                      <p className="text-primary-foreground/50 text-sm mt-1">
                        {t("Enter the classroom and wait — teacher will start soon.", "ادخل الفصل وانتظر — سيبدأ المعلم قريباً.")}
                      </p>
                    </div>
                    {waitingStudents.length > 0 && (
                      <div className="text-primary-foreground/40 text-sm">
                        {waitingStudents.length} {t("students already inside", "طلاب داخل الفصل")}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Button variant="ghost" onClick={onBack} className="text-primary-foreground/60 w-full">
            ← {t("Back to subjects", "العودة للمواد")}
          </Button>
        </div>
      </div>

          {/* Bottom: Start/Join Button */}
      <div className="p-4 bg-primary border-t border-primary-foreground/10">
        <div className="max-w-md mx-auto">
          {isPrivileged ? (
            <Button
              size="lg"
              className="w-full h-14 bg-secondary text-secondary-foreground hover:bg-secondary/90 text-lg font-bold gap-3"
              onClick={handleStart}
            >
              <Video className="h-5 w-5" />
              <span>
                {t("START LIVE CLASS NOW", "ابدأ الدرس المباشر")}
              </span>
            </Button>
          ) : (
            /* Students can always join — no waiting gate */
            <Button
              size="lg"
              className="w-full h-14 bg-secondary text-secondary-foreground hover:bg-secondary/90 text-lg font-bold gap-3"
              onClick={handleJoin}
            >
              <Video className="h-5 w-5" />
              {t("JOIN CLASS", "انضم للفصل")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClassLobby;
