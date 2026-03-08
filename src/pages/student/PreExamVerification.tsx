import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Camera, Mic, Monitor, Wifi, Shield, AlertTriangle, CheckCircle2,
  XCircle, Eye, Volume2, Smartphone, Globe, Lock, Play
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type CheckStatus = "pending" | "running" | "passed" | "failed";

interface SystemCheck {
  id: string;
  label: string;
  labelAr: string;
  icon: React.ReactNode;
  status: CheckStatus;
  detail?: string;
}

const PreExamVerification = () => {
  const { examId } = useParams<{ examId: string }>();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [exam, setExam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [faceSnapshot, setFaceSnapshot] = useState<string | null>(null);
  const [faceCaptured, setFaceCaptured] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micTested, setMicTested] = useState(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [checklist, setChecklist] = useState({
    quietEnvironment: false,
    faceVisible: false,
    noDevices: false,
    noTabSwitch: false,
  });
  const allChecked = Object.values(checklist).every(Boolean);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micAnimRef = useRef<number>();

  const [checks, setChecks] = useState<SystemCheck[]>([
    { id: "camera", label: "Webcam", labelAr: "الكاميرا", icon: <Camera className="h-4 w-4" />, status: "pending" },
    { id: "mic", label: "Microphone", labelAr: "الميكروفون", icon: <Mic className="h-4 w-4" />, status: "pending" },
    { id: "device", label: "Device Type", labelAr: "نوع الجهاز", icon: <Smartphone className="h-4 w-4" />, status: "pending" },
    { id: "browser", label: "Browser Compatibility", labelAr: "توافق المتصفح", icon: <Globe className="h-4 w-4" />, status: "pending" },
    { id: "internet", label: "Internet Stability", labelAr: "استقرار الإنترنت", icon: <Wifi className="h-4 w-4" />, status: "pending" },
    { id: "fullscreen", label: "Fullscreen Support", labelAr: "دعم ملء الشاشة", icon: <Monitor className="h-4 w-4" />, status: "pending" },
  ]);

  const updateCheck = useCallback((id: string, status: CheckStatus, detail?: string) => {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, status, detail } : c));
  }, []);

  // Load exam
  useEffect(() => {
    if (!examId || !user) return;
    const load = async () => {
      const { data: examData } = await supabase
        .from("exams")
        .select("*")
        .eq("id", examId)
        .single();

      if (!examData) {
        navigate("/student/exams");
        return;
      }

      // Check if there's already an in-progress attempt
      const { data: existing } = await supabase
        .from("exam_attempts")
        .select("id")
        .eq("exam_id", examId)
        .eq("user_id", user.id)
        .eq("status", "in_progress")
        .maybeSingle();

      if (existing) {
        navigate(`/student/exam/${existing.id}`);
        return;
      }

      setExam(examData);
      setLoading(false);
    };
    load();
  }, [examId, user]);

  // Run system checks after exam loads
  useEffect(() => {
    if (!exam || loading) return;
    runSystemChecks();
  }, [exam, loading]);

  const runSystemChecks = async () => {
    // Device check
    updateCheck("device", "running");
    const ua = navigator.userAgent;
    const isMobile = /mobile|android|iphone/i.test(ua);
    const isTablet = /tablet|ipad/i.test(ua);
    const deviceType = isMobile ? "Mobile" : isTablet ? "Tablet" : "Desktop";
    updateCheck("device", "passed", deviceType);

    // Browser check
    updateCheck("browser", "running");
    const isChrome = /chrome/i.test(ua) && !/edge/i.test(ua);
    const isFirefox = /firefox/i.test(ua);
    const isEdge = /edg/i.test(ua);
    const isSafari = /safari/i.test(ua) && !isChrome;
    const browserName = isChrome ? "Chrome" : isFirefox ? "Firefox" : isEdge ? "Edge" : isSafari ? "Safari" : "Other";
    const supported = isChrome || isFirefox || isEdge;
    updateCheck("browser", supported ? "passed" : "failed", browserName + (supported ? "" : " - Not recommended"));

    // Internet check
    updateCheck("internet", "running");
    try {
      const start = Date.now();
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
        method: "HEAD",
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      });
      const latency = Date.now() - start;
      updateCheck("internet", latency < 3000 ? "passed" : "failed", `${latency}ms latency`);
    } catch {
      updateCheck("internet", "failed", "Connection failed");
    }

    // Fullscreen check
    updateCheck("fullscreen", "running");
    const fsSupported = document.documentElement.requestFullscreen !== undefined;
    updateCheck("fullscreen", fsSupported ? "passed" : "failed", fsSupported ? "Supported" : "Not supported");

    // Camera check
    updateCheck("camera", "running");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setWebcamStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      updateCheck("camera", "passed", "Camera active");
    } catch {
      updateCheck("camera", "failed", "Camera access denied");
    }

    // Mic check
    updateCheck("mic", "running");
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(micStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      // Start mic level monitoring
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const monitorMic = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalized = Math.min(100, (avg / 128) * 100);
        setMicLevel(normalized);
        if (normalized > 15) setMicTested(true);
        micAnimRef.current = requestAnimationFrame(monitorMic);
      };
      monitorMic();
      updateCheck("mic", "passed", "Microphone active");
    } catch {
      updateCheck("mic", "failed", "Microphone access denied");
    }
  };

  // Cleanup streams on unmount
  useEffect(() => {
    return () => {
      webcamStream?.getTracks().forEach(t => t.stop());
      if (micAnimRef.current) cancelAnimationFrame(micAnimRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [webcamStream]);

  // Capture face snapshot
  const captureSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    setFaceSnapshot(dataUrl);
    setFaceCaptured(true);
    toast({ title: t("✅ Face captured successfully", "✅ تم التقاط الوجه بنجاح") });
  };

  const retakeSnapshot = () => {
    setFaceSnapshot(null);
    setFaceCaptured(false);
  };

  // Calculate readiness
  const passedChecks = checks.filter(c => c.status === "passed").length;
  const allChecksPassed = checks.every(c => c.status === "passed");
  const allReady = allChecksPassed && agreed && faceCaptured && micTested && allChecked;
  const progressValue = (passedChecks / checks.length) * 100;

  // Start exam
  const handleStartExam = async () => {
    if (!allReady || !user || !examId || starting) return;
    setStarting(true);

    try {
      // Create the exam attempt FIRST so we have an attempt_id
      const { data: attemptData, error } = await supabase
        .from("exam_attempts")
        .insert({ exam_id: examId, user_id: user.id })
        .select("id")
        .single();

      if (error || !attemptData) {
        toast({ title: t("Error starting exam", "خطأ في بدء الامتحان"), description: error?.message, variant: "destructive" });
        setStarting(false);
        return;
      }

      // Upload face snapshot to storage AND link to proctoring_media table
      if (faceSnapshot) {
        try {
          const blob = await fetch(faceSnapshot).then(r => r.blob());
          const timestamp = Date.now();
          const path = `${user.id}/${attemptData.id}/verification_${timestamp}.jpg`;

          const { error: uploadErr } = await supabase.storage
            .from("proctoring-media")
            .upload(path, blob, { contentType: "image/jpeg", upsert: true });

          if (!uploadErr) {
            // Insert into proctoring_media table so admin can see it
            await supabase.from("proctoring_media").insert({
              attempt_id: attemptData.id,
              file_type: "verification_snapshot",
              file_url: path,
              file_name: `verification_${timestamp}.jpg`,
              file_size: blob.size,
              metadata: {
                timestamp: new Date(timestamp).toISOString(),
                type: "pre_exam_verification",
                user_id: user.id,
                exam_id: examId,
              },
            });
            console.log("[PreExam] ✅ Verification snapshot saved:", path);
          } else {
            console.warn("[PreExam] Verification snapshot upload failed:", uploadErr.message);
          }
        } catch (snapErr) {
          console.warn("[PreExam] Snapshot save error:", snapErr);
          // Non-blocking — continue to exam
        }
      }

      // Log device info
      const ua = navigator.userAgent;
      const deviceType = /mobile/i.test(ua) ? "mobile" : /tablet/i.test(ua) ? "tablet" : "desktop";
      const browser = /chrome/i.test(ua) ? "Chrome" : /firefox/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : /edg/i.test(ua) ? "Edge" : "Other";
      await supabase.from("device_logs").insert({
        attempt_id: attemptData.id,
        device_type: deviceType,
        browser,
        user_agent: ua,
        screen_resolution: `${screen.width}x${screen.height}`,
      });

      // Stop local streams (they'll be re-created in the exam page by proctoring hook)
      webcamStream?.getTracks().forEach(t => t.stop());
      if (micAnimRef.current) cancelAnimationFrame(micAnimRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }

      // Navigate to exam
      navigate(`/student/exam/${attemptData.id}`);
    } catch (e: any) {
      toast({ title: t("Error", "خطأ"), description: e.message, variant: "destructive" });
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">{t("Preparing verification...", "جارٍ تحضير التحقق...")}</p>
        </div>
      </div>
    );
  }

  const rules = [
    { icon: <Camera className="h-4 w-4" />, text: t("Camera must remain ON throughout the exam", "يجب أن تبقى الكاميرا مفتوحة طوال الامتحان") },
    { icon: <Mic className="h-4 w-4" />, text: t("Microphone must remain ON — no background voices allowed", "يجب أن يبقى الميكروفون مفتوحاً — لا يُسمح بأصوات خلفية") },
    { icon: <Monitor className="h-4 w-4" />, text: t("Fullscreen mode is required — do not exit", "مطلوب وضع ملء الشاشة — لا تخرج منه") },
    { icon: <Eye className="h-4 w-4" />, text: t("Only ONE face must be visible — no other persons", "يجب أن يظهر وجه واحد فقط — لا أشخاص آخرين") },
    { icon: <Lock className="h-4 w-4" />, text: t("No tab switching — violations will be recorded", "لا تبديل بين النوافذ — سيتم تسجيل المخالفات") },
    { icon: <AlertTriangle className="h-4 w-4" />, text: t("Excessive violations may trigger automatic submission", "المخالفات المتكررة قد تؤدي إلى تقديم تلقائي للامتحان") },
  ];

  const [checklist, setChecklist] = useState({
    quietEnvironment: false,
    faceVisible: false,
    noDevices: false,
    noTabSwitch: false,
  });

  const allChecked = Object.values(checklist).every(Boolean);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-6">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 mb-3">
            <Shield className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold text-primary">{t("Pre-Exam Verification", "التحقق قبل الامتحان")}</span>
          </div>
          <h1 className="text-2xl font-bold mb-1">
            {language === "ar" ? exam?.title_ar || exam?.title : exam?.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("Complete all checks below before starting your exam", "أكمل جميع الفحوصات أدناه قبل بدء الامتحان")}
          </p>
          <Progress value={progressValue} className="h-2 mt-4 max-w-xs mx-auto" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: Camera & Mic */}
          <div className="space-y-4">
            {/* Webcam Preview */}
            <Card className="overflow-hidden border-2">
              <CardContent className="p-0">
                <div className="relative aspect-video bg-black">
                  {faceSnapshot ? (
                    <img src={faceSnapshot} alt="Face snapshot" className="w-full h-full object-cover" />
                  ) : (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover mirror"
                      style={{ transform: "scaleX(-1)" }}
                    />
                  )}
                  <canvas ref={canvasRef} className="hidden" />
                  {checks.find(c => c.id === "camera")?.status === "failed" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                      <div className="text-center text-white">
                        <XCircle className="h-12 w-12 mx-auto mb-2 text-destructive" />
                        <p className="text-sm">{t("Camera access denied", "تم رفض الوصول إلى الكاميرا")}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t("Please allow camera access in browser settings", "يرجى السماح بالوصول إلى الكاميرا في إعدادات المتصفح")}</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {faceCaptured ? (
                      <Badge className="bg-emerald/10 text-emerald border-emerald/30">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> {t("Face Captured", "تم التقاط الوجه")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        {t("Face snapshot required", "مطلوب صورة للوجه")}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {faceCaptured ? (
                      <Button size="sm" variant="outline" onClick={retakeSnapshot}>
                        {t("Retake", "إعادة")}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={captureSnapshot}
                        disabled={checks.find(c => c.id === "camera")?.status !== "passed"}
                      >
                        <Camera className="h-3 w-3 mr-1" />
                        {t("Capture Face", "التقاط الوجه")}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Microphone Test */}
            <Card className="border-2">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Mic className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm">{t("Microphone Test", "اختبار الميكروفون")}</span>
                  </div>
                  {micTested ? (
                    <Badge className="bg-emerald/10 text-emerald border-emerald/30">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> {t("Tested", "تم الاختبار")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      {t("Speak to test", "تحدث للاختبار")}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {t("Speak aloud to verify your microphone is working", "تحدث بصوت عالٍ للتحقق من عمل الميكروفون")}
                </p>
                <div className="flex items-center gap-3">
                  <Volume2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden relative">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        width: `${micLevel}%`,
                        background: micLevel > 50
                          ? "hsl(var(--primary))"
                          : micLevel > 15
                          ? "hsl(142, 71%, 45%)"
                          : "hsl(var(--muted-foreground))",
                      }}
                      transition={{ duration: 0.1 }}
                    />
                  </div>
                  <span className="text-xs font-mono w-8 text-right">{Math.round(micLevel)}%</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: Rules & Checks */}
          <div className="space-y-4">
            {/* System Checks */}
            <Card className="border-2">
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-primary" />
                  {t("System Checks", "فحوصات النظام")}
                </h3>
                <div className="space-y-2">
                  {checks.map(check => (
                    <div key={check.id} className="flex items-center justify-between rounded-lg border p-2.5">
                      <div className="flex items-center gap-2">
                        {check.icon}
                        <span className="text-sm">{language === "ar" ? check.labelAr : check.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {check.detail && (
                          <span className="text-xs text-muted-foreground">{check.detail}</span>
                        )}
                        {check.status === "pending" && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />}
                        {check.status === "running" && <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />}
                        {check.status === "passed" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        {check.status === "failed" && <XCircle className="h-4 w-4 text-destructive" />}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Rules */}
            <Card className="border-2 border-destructive/20">
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  {t("Exam Rules", "قوانين الامتحان")}
                </h3>
                <div className="space-y-2 mb-4">
                  {rules.map((rule, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <div className="shrink-0 mt-0.5 text-muted-foreground">{rule.icon}</div>
                      <span>{rule.text}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t pt-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={agreed}
                      onCheckedChange={(v) => setAgreed(!!v)}
                      className="mt-0.5"
                    />
                    <span className="text-xs leading-relaxed">
                      {t(
                        "I have read and agree to all the exam rules. I understand that any violation may result in automatic submission or disqualification.",
                        "لقد قرأت ووافقت على جميع قوانين الامتحان. أفهم أن أي مخالفة قد تؤدي إلى تقديم تلقائي أو استبعاد."
                      )}
                    </span>
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Start Button */}
            <Button
              size="lg"
              className="w-full h-12 text-base gap-2"
              disabled={!allReady || starting}
              onClick={handleStartExam}
            >
              {starting ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                  {t("Starting...", "جارٍ البدء...")}
                </>
              ) : (
                <>
                  <Play className="h-5 w-5" />
                  {t("Start Exam", "بدء الامتحان")}
                </>
              )}
            </Button>
            {!allReady && (
              <p className="text-xs text-center text-muted-foreground">
                {!allChecksPassed && t("Complete all system checks", "أكمل جميع فحوصات النظام")}
                {allChecksPassed && !faceCaptured && t("Capture your face snapshot", "التقط صورة لوجهك")}
                {allChecksPassed && faceCaptured && !micTested && t("Test your microphone by speaking", "اختبر الميكروفون بالتحدث")}
                {allChecksPassed && faceCaptured && micTested && !agreed && t("Accept the exam rules", "وافق على قوانين الامتحان")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreExamVerification;
