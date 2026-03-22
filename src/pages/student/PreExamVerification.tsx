/*  src/pages/student/PreExamVerification.tsx
    ENHANCED VERSION — Cleaner step flow, better camera preview,
    smoother animations, improved mobile experience
*/
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Camera, Mic, Monitor, Wifi, Shield, AlertTriangle, CheckCircle2,
  XCircle, Eye, Volume2, Smartphone, Globe, Lock, Play,
  Clock, BookOpen, ChevronRight, Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type CheckStatus = "pending" | "running" | "passed" | "failed" | "warning";
interface SystemCheck { id: string; label: string; labelAr: string; icon: React.ReactNode; status: CheckStatus; detail?: string; }

const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c";

const statusColors: Record<CheckStatus, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
  pending: { bg: "#f8fafb", border: "#e5e7eb", text: "#9ca3af", icon: <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #d1d5db" }} /> },
  running: { bg: "#f0f9ff", border: "#bae6fd", text: "#0284c7", icon: <Loader2 style={{ width: 16, height: 16, color: "#0284c7", animation: "spin .8s linear infinite" }} /> },
  passed: { bg: "#f0fff4", border: "#86efac", text: "#22c55e", icon: <CheckCircle2 style={{ width: 16, height: 16, color: "#22c55e" }} /> },
  failed: { bg: "#fff5f5", border: "#fca5a5", text: "#ef4444", icon: <XCircle style={{ width: 16, height: 16, color: "#ef4444" }} /> },
  warning: { bg: "#fffbeb", border: "#fde68a", text: "#f59e0b", icon: <AlertTriangle style={{ width: 16, height: 16, color: "#f59e0b" }} /> },
};

const PreExamVerification = () => {
  const { examId } = useParams<{ examId: string }>();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [exam, setExam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [questionCount, setQuestionCount] = useState<number | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [faceSnapshot, setFaceSnapshot] = useState<string | null>(null);
  const [faceCaptured, setFaceCaptured] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micTested, setMicTested] = useState(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [step, setStep] = useState<"info" | "checks" | "checklist" | "ready">("info");
  const [checksComplete, setChecksComplete] = useState(false);
  const [checklist, setChecklist] = useState({
    quietEnvironment: false,
    faceVisible: false,
    noDevices: false,
    noTabSwitch: false,
  });
  const allChecked = Object.values(checklist).every(Boolean);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Assign stream to video element whenever webcamStream changes
  // (fixes "camera preview not working" — element doesn't exist at stream creation time)
  useEffect(() => {
    if (!webcamStream || !videoRef.current) return;
    videoRef.current.srcObject = webcamStream;
    videoRef.current.play().catch(() => {});
  }, [webcamStream]);
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

  useEffect(() => {
    if (!examId || !user) return;
    const load = async () => {
      const { data: examData } = await supabase.from("exams").select("*").eq("id", examId).single();
      if (!examData) { navigate("/student/exams"); return; }
      const { data: existing } = await supabase.from("exam_attempts").select("id").eq("exam_id", examId).eq("user_id", user.id).eq("status", "in_progress").maybeSingle();
      if (existing) { navigate(`/student/exam/${existing.id}`); return; }
      setExam(examData);
      // Fetch actual question count from exam_questions table
      const { count } = await supabase
        .from('exam_questions')
        .select('id', { count: 'exact', head: true })
        .eq('exam_id', examId);
      setQuestionCount(count ?? examData.question_count ?? null);
      setLoading(false);
    };
    load();
  }, [examId, user]);

  const runSystemChecks = async () => {
    // Device
    updateCheck("device", "running");
    await new Promise(r => setTimeout(r, 300));
    const ua = navigator.userAgent;
    const isMobile = /mobile|android|iphone/i.test(ua);
    const deviceType = isMobile ? "Mobile" : /tablet|ipad/i.test(ua) ? "Tablet" : "Desktop";
    updateCheck("device", "passed", deviceType);

    // Browser
    updateCheck("browser", "running");
    await new Promise(r => setTimeout(r, 200));
    const isChrome = /chrome/i.test(ua) && !/edge/i.test(ua);
    const isFirefox = /firefox/i.test(ua);
    const isEdge = /edg/i.test(ua);
    const browserName = isChrome ? "Chrome" : isFirefox ? "Firefox" : isEdge ? "Edge" : /safari/i.test(ua) ? "Safari" : "Other";
    updateCheck("browser", (isChrome || isFirefox || isEdge) ? "passed" : "warning", `${browserName}${!(isChrome || isFirefox || isEdge) ? " — Not fully supported" : ""}`);

    // Internet
    updateCheck("internet", "running");
    try {
      const start = Date.now();
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, { method: "HEAD", headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
      const latency = Date.now() - start;
      updateCheck("internet", latency < 2000 ? "passed" : "warning", `${latency}ms latency`);
    } catch { updateCheck("internet", "failed", "Connection failed"); }

    // Fullscreen
    updateCheck("fullscreen", "running");
    await new Promise(r => setTimeout(r, 200));
    updateCheck("fullscreen", document.documentElement.requestFullscreen !== undefined ? "passed" : "warning", "Supported");

    // Camera
    updateCheck("camera", "running");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      setWebcamStream(stream);
      // srcObject is set by useEffect when videoRef.current is ready
      updateCheck("camera", "passed", "Ready");
    } catch (e: any) {
      updateCheck("camera", exam?.webcam_required ? "failed" : "warning", e.name === "NotAllowedError" ? "Permission denied" : "Not available");
    }

    // Mic
    updateCheck("mic", "running");
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = ctx;
      const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
      analyserRef.current = analyser;
      const src = ctx.createMediaStreamSource(micStream);
      src.connect(analyser);
      updateCheck("mic", "passed", "Ready");
      setMicTested(true);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setMicLevel(Math.min(100, (avg / 128) * 100));
        micAnimRef.current = requestAnimationFrame(tick);
      };
      micAnimRef.current = requestAnimationFrame(tick);
    } catch {
      updateCheck("mic", exam?.record_audio ? "failed" : "warning", "Not available");
    }

    setChecksComplete(true);
  };

  useEffect(() => {
    if (step === "checks" && exam) runSystemChecks();
  }, [step, exam]);

  useEffect(() => { return () => { if (micAnimRef.current) cancelAnimationFrame(micAnimRef.current); audioContextRef.current?.close(); }; }, []);

  const captureSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    if (!video.videoWidth || video.readyState < 2) {
      toast({ title: t("Camera not ready yet, please wait", "الكاميرا غير جاهزة، يرجى الانتظار"), variant: "destructive" });
      return;
    }
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror the image (selfie-style)
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0);
    ctx.restore();
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setFaceSnapshot(dataUrl);
    setFaceCaptured(false); // require user to confirm clarity
    toast({ title: t("📸 Preview ready — confirm it's clear", "📸 المعاينة جاهزة — تأكد من وضوحها") });
  };

  const handleStart = async () => {
    if (!user || !examId) return;
    setStarting(true);
    try {
      // Stop streams before starting
      webcamStream?.getTracks().forEach(t => t.stop());

      // Create exam attempt first (fast)
      const { data, error } = await supabase.from("exam_attempts").insert({
        exam_id: examId, user_id: user.id, status: "in_progress",
        started_at: new Date().toISOString(), tab_switches: 0,
      }).select().single();

      if (error || !data) throw error;

      // Upload verification snapshot in background — don't block navigation
      if (faceSnapshot) {
        fetch(faceSnapshot)
          .then(r => r.blob())
          .then(blob => {
            const path = `${user.id}/${examId}/verification_${Date.now()}.jpg`;
            return supabase.storage.from("proctoring-media").upload(path, blob, { contentType: "image/jpeg", upsert: true });
          })
          .catch(() => {}); // silent fail — don't block
      }

      // Try fullscreen
      if (exam?.fullscreen_required) {
        try { await document.documentElement.requestFullscreen(); } catch (_) {}
      }
      navigate(`/student/exam/${data.id}`);
    } catch (e: any) {
      toast({ title: t("Failed to start exam.", "فشل بدء الامتحان."), variant: "destructive" });
      setStarting(false);
    }
  };

  const hasCriticalFailure = checks.some(c => c.status === "failed");
  const passedChecks = checks.filter(c => c.status === "passed").length;
  const checksProgress = (passedChecks / checks.length) * 100;

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafb" }}>
      <div style={{ textAlign: "center", fontFamily: "'Cairo',sans-serif" }}>
        <div style={{ width: 48, height: 48, border: `4px solid ${G}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 14px" }} />
        <p style={{ color: "#7a9e88", fontSize: 14 }}>Loading exam…</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f0f4f8,#e8f0e8)", fontFamily: "'Cairo',sans-serif", padding: "20px 16px" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <div style={{ maxWidth: 560, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24, animation: "fadeUp .4s ease" }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: G, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", boxShadow: "0 8px 24px rgba(15,45,31,.3)" }}>
            <Shield style={{ width: 30, height: 30, color: GOLD }} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: G, marginBottom: 6 }}>
            {language === "ar" ? exam?.title_ar || exam?.title : exam?.title}
          </h1>
          <p style={{ fontSize: 14, color: "#7a9e88" }}>{t("Pre-Exam Verification", "التحقق قبل الامتحان")}</p>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 24 }}>
          {[{ id: "info", label: "Info" }, { id: "checks", label: "Checks" }, { id: "checklist", label: "Checklist" }, { id: "ready", label: "Start" }].map((s, i, arr) => {
            const steps = ["info", "checks", "checklist", "ready"];
            const idx = steps.indexOf(step);
            const sIdx = steps.indexOf(s.id);
            const isDone = sIdx < idx;
            const isCurrent = sIdx === idx;
            return (
              <>
                <div key={s.id} style={{ display: "flex", flex: isCurrent ? 1.4 : 1, flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: isDone ? "#22c55e" : isCurrent ? G : "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: (isDone || isCurrent) ? "#fff" : "#9ca3af", transition: "all .3s" }}>
                    {isDone ? "✓" : i + 1}
                  </div>
                  {isCurrent && <div style={{ fontSize: 9, fontWeight: 700, color: G, letterSpacing: 0.5 }}>{s.label}</div>}
                </div>
                {i < arr.length - 1 && <div style={{ height: 2, flex: 2, background: isDone ? "#22c55e" : "#e5e7eb", borderRadius: 1, marginBottom: 18, transition: "background .3s" }} />}
              </>
            );
          })}
        </div>

        {/* ── INFO STEP ── */}
        {step === "info" && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,.08)", marginBottom: 16 }}>
              <div style={{ background: G, padding: "20px 24px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.7)", marginBottom: 12, letterSpacing: 1 }}>EXAM DETAILS</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {[
                    { icon: <Clock style={{ width: 16, height: 16 }} />, label: t("Duration", "المدة"), value: `${exam?.time_limit_minutes} ${t("minutes", "دقيقة")}` },
                    { icon: <BookOpen style={{ width: 16, height: 16 }} />, label: t("Questions", "الأسئلة"), value: `${questionCount ?? exam?.question_count ?? "..."} ${t("questions", "سؤال")}` },
                    { icon: <Shield style={{ width: 16, height: 16 }} />, label: t("Pass Mark", "درجة النجاح"), value: `${exam?.passing_score}%` },
                    { icon: <Eye style={{ width: 16, height: 16 }} />, label: t("Attempts", "المحاولات"), value: `${exam?.max_attempts || 1}` },
                  ].map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ color: GOLD }}>{item.icon}</div>
                      <div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)" }}>{item.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{item.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Proctoring notice */}
              {exam?.proctoring_enabled && (
                <div style={{ padding: "16px 20px", background: "#fffbeb", borderBottom: "1px solid #fde68a" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <AlertTriangle style={{ width: 18, height: 18, color: "#f59e0b", flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>{t("This exam is proctored", "هذا الامتحان مراقَب")}</div>
                      <div style={{ fontSize: 12, color: "#78350f", lineHeight: 1.6 }}>
                        {t("Your webcam, microphone, and screen activity will be monitored. Any violations may result in point deductions.", "سيتم مراقبة كاميرا الويب والميكروفون ونشاطك على الشاشة. قد تؤدي أي مخالفات إلى خصم نقاط.")}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Guidelines */}
              {(exam?.guidelines || exam?.guidelines_ar) && (
                <div style={{ padding: "16px 20px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", marginBottom: 10, letterSpacing: 1 }}>GUIDELINES</div>
                  <div style={{ fontSize: 14, color: G, lineHeight: 1.8, fontFamily: "'Amiri',serif" }} dir="auto">
                    {language === "ar" ? exam.guidelines_ar || exam.guidelines : exam.guidelines}
                  </div>
                </div>
              )}

              {/* Standard rules */}
              <div style={{ padding: "0 20px 20px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", marginBottom: 10, letterSpacing: 1 }}>RULES</div>
                {[
                  t("Do not switch tabs or leave this page during the exam.", "لا تتبدل التبويبات أو تغادر هذه الصفحة."),
                  t("Keep your face visible in the camera at all times.", "احرص على أن يكون وجهك مرئياً في الكاميرا طوال الوقت."),
                  t("No phones, notes, or external materials are allowed.", "لا يُسمح بالهواتف أو الملاحظات أو المواد الخارجية."),
                  t("Exiting fullscreen may count as a violation.", "الخروج من وضع ملء الشاشة قد يُعدّ مخالفة."),
                ].map((rule, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: G, color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                    <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{rule}</div>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={() => setStep("checks")} style={{ width: "100%", padding: "16px", borderRadius: 16, background: G, border: "none", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 16px rgba(15,45,31,.3)" }}>
              {t("Run System Checks", "تشغيل فحوصات النظام")} <ChevronRight style={{ width: 18, height: 18 }} />
            </button>
          </div>
        )}

        {/* ── CHECKS STEP ── */}
        {step === "checks" && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,.08)", marginBottom: 16 }}>
              {/* Progress bar */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0f4f8" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12, color: "#9ca3af" }}>
                  <span style={{ fontWeight: 700, color: G }}>{t("System Checks", "فحوصات النظام")}</span>
                  <span>{passedChecks}/{checks.length} {t("passed", "اجتاز")}</span>
                </div>
                <div style={{ height: 6, background: "#f0f4f8", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${checksProgress}%`, background: `linear-gradient(90deg,${GM},${GOLD})`, borderRadius: 3, transition: "width .5s" }} />
                </div>
              </div>

              {/* Checks list */}
              <div style={{ padding: "8px 0" }}>
                {checks.map(check => {
                  const s = statusColors[check.status];
                  return (
                    <div key={check.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderBottom: "1px solid #f0f4f8", background: check.status !== "pending" ? s.bg : "#fff", transition: "background .3s" }}>
                      <div style={{ color: s.text }}>{check.icon}</div>
                      <div style={{ color: "#374151" }}>{check.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: G }}>{language === "ar" ? check.labelAr : check.label}</div>
                        {check.detail && <div style={{ fontSize: 11, color: s.text, marginTop: 1 }}>{check.detail}</div>}
                      </div>
                      {s.icon}
                    </div>
                  );
                })}
              </div>

              {/* Camera preview */}
              {webcamStream && (
                <div style={{ padding: "16px 20px", borderTop: "1px solid #f0f4f8" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", marginBottom: 10, letterSpacing: 1 }}>CAMERA PREVIEW</div>
                  <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: "#000", aspectRatio: "4/3" }}>
                    <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    {faceCaptured && (
                      <div style={{ position: "absolute", top: 10, right: 10, background: "#22c55e", borderRadius: 20, padding: "4px 10px", fontSize: 11, color: "#fff", fontWeight: 700 }}>✓ Photo captured</div>
                    )}
                  </div>
                  <button onClick={captureSnapshot} style={{ width: "100%", marginTop: 10, padding: "10px", borderRadius: 12, background: G, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif" }}>
                    {faceSnapshot ? t("🔄 Retake Photo", "🔄 إعادة التقاط") : t("📸 Capture Verification Photo", "📸 التقاط صورة التحقق")}
                  </button>
                  {/* Snapshot preview — student must confirm clarity */}
                  {faceSnapshot && !faceCaptured && (
                    <div style={{ marginTop: 12, borderRadius: 12, overflow: "hidden", border: "2px solid #fbbf24" }}>
                      <div style={{ background: "#fffbeb", padding: "6px 12px", fontSize: 11, fontWeight: 700, color: "#92400e" }}>
                        📋 {t("Is this photo clear and well-lit?", "هل هذه الصورة واضحة ومضاءة جيداً؟")}
                      </div>
                      <img src={faceSnapshot} alt="Snapshot preview" style={{ width: "100%", display: "block" }} />
                      <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#fffbeb" }}>
                        <button onClick={() => setFaceCaptured(true)}
                          style={{ flex: 1, padding: "8px", borderRadius: 8, background: "#22c55e", border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          ✓ {t("Yes, use this", "نعم، استخدم هذه")}
                        </button>
                        <button onClick={() => { setFaceSnapshot(null); setFaceCaptured(false); }}
                          style={{ flex: 1, padding: "8px", borderRadius: 8, background: "#ef4444", border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          ✗ {t("Retake", "إعادة")}
                        </button>
                      </div>
                    </div>
                  )}
                  {faceCaptured && (
                    <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "#f0fff4", border: "1px solid #86efac", fontSize: 12, color: "#22c55e", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                      ✓ {t("Verification photo confirmed", "تم تأكيد صورة التحقق")}
                    </div>
                  )}
                </div>
              )}

              {/* Mic meter */}
              {micTested && (
                <div style={{ padding: "16px 20px", borderTop: "1px solid #f0f4f8" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", marginBottom: 10, letterSpacing: 1 }}>MIC LEVEL — speak to test</div>
                  <div style={{ height: 10, background: "#f0f4f8", borderRadius: 5, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${micLevel}%`, background: micLevel > 60 ? "#22c55e" : micLevel > 20 ? GOLD : "#e5e7eb", borderRadius: 5, transition: "width .1s" }} />
                  </div>
                </div>
              )}
            </div>

            {checksComplete && (
              <button onClick={() => setStep("checklist")} style={{ width: "100%", padding: "16px", borderRadius: 16, background: hasCriticalFailure ? "#dc2626" : G, border: "none", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 16px rgba(15,45,31,.3)" }}>
                {hasCriticalFailure ? t("Some checks failed — proceed anyway?", "فشل بعض الفحوصات — متابعة؟") : t("Continue to Checklist", "المتابعة إلى القائمة")} <ChevronRight style={{ width: 18, height: 18 }} />
              </button>
            )}
          </div>
        )}

        {/* ── CHECKLIST STEP ── */}
        {step === "checklist" && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,.08)", marginBottom: 16 }}>
              <div style={{ padding: "20px 20px 0", borderBottom: "1px solid #f0f4f8" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: G, marginBottom: 4 }}>{t("Final Checklist", "القائمة النهائية")}</div>
                <div style={{ fontSize: 13, color: "#7a9e88", marginBottom: 16 }}>{t("Confirm everything is in order before starting.", "تأكد من أن كل شيء على ما يرام قبل البدء.")}</div>
              </div>
              <div style={{ padding: "8px 0" }}>
                {[
                  { key: "quietEnvironment" as const, label: t("I am in a quiet environment with no distractions", "أنا في بيئة هادئة بدون مشتتات") },
                  { key: "faceVisible" as const, label: t("My face is clearly visible and well-lit", "وجهي مرئي بوضوح ومضيء جيداً") },
                  { key: "noDevices" as const, label: t("No unauthorized devices or materials nearby", "لا توجد أجهزة أو مواد غير مصرح بها") },
                  { key: "noTabSwitch" as const, label: t("I will not switch tabs or leave the exam window", "لن أتبدل التبويبات أو أغادر نافذة الامتحان") },
                ].map((item) => {
                  const checked = checklist[item.key];
                  return (
                    <div key={item.key} onClick={() => setChecklist(p => ({ ...p, [item.key]: !p[item.key] }))}
                      style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid #f0f4f8", cursor: "pointer", background: checked ? "#f0fff4" : "#fff", transition: "background .2s" }}>
                      <div style={{ width: 24, height: 24, borderRadius: 8, border: `2px solid ${checked ? "#22c55e" : "#d1d5db"}`, background: checked ? "#22c55e" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .2s" }}>
                        {checked && <span style={{ color: "#fff", fontSize: 14, fontWeight: 900 }}>✓</span>}
                      </div>
                      <div style={{ fontSize: 14, color: G, lineHeight: 1.6 }}>{item.label}</div>
                    </div>
                  );
                })}
              </div>
              {/* Agreement */}
              <div style={{ padding: "16px 20px" }}>
                <div onClick={() => setAgreed(!agreed)} style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${agreed ? G : "#d1d5db"}`, background: agreed ? G : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, transition: "all .2s" }}>
                    {agreed && <span style={{ color: "#fff", fontSize: 13, fontWeight: 900 }}>✓</span>}
                  </div>
                  <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.7 }}>
                    {t("I confirm that I have read and understood all exam rules. I agree to be monitored and accept that violations may affect my score.", "أؤكد أنني قرأت وفهمت جميع قواعد الامتحان. أوافق على المراقبة وأقبل أن المخالفات قد تؤثر على درجتي.")}
                  </div>
                </div>
              </div>
            </div>

            <button onClick={() => setStep("ready")} disabled={!allChecked || !agreed}
              style={{ width: "100%", padding: "16px", borderRadius: 16, background: (!allChecked || !agreed) ? "#e5e7eb" : G, border: "none", color: (!allChecked || !agreed) ? "#9ca3af" : "#fff", fontSize: 15, fontWeight: 700, cursor: (!allChecked || !agreed) ? "not-allowed" : "pointer", fontFamily: "'Cairo',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: (!allChecked || !agreed) ? "none" : "0 4px 16px rgba(15,45,31,.3)" }}>
              {t("Ready to Start", "جاهز للبدء")} <ChevronRight style={{ width: 18, height: 18 }} />
            </button>
          </div>
        )}

        {/* ── READY STEP ── */}
        {step === "ready" && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: "40px 24px", textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,.08)", marginBottom: 16 }}>
              <div style={{ width: 96, height: 96, borderRadius: "50%", background: "linear-gradient(135deg,#f0fff4,#dcfce7)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", boxShadow: "0 4px 20px rgba(34,197,94,.25)" }}>
                <CheckCircle2 style={{ width: 48, height: 48, color: "#22c55e" }} />
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 900, color: G, marginBottom: 8 }}>{t("You're Ready!", "أنت جاهز!")}</h2>
              <p style={{ fontSize: 14, color: "#7a9e88", lineHeight: 1.7, marginBottom: 24 }}>
                {t("All checks passed. Click below to begin your exam. The timer starts immediately.", "اجتازت جميع الفحوصات. انقر أدناه لبدء الامتحان. يبدأ المؤقت فوراً.")}
              </p>
              <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 24 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: G }}>{exam?.time_limit_minutes}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>{t("minutes", "دقيقة")}</div>
                </div>
                <div style={{ width: 1, height: 40, background: "#e5e7eb", alignSelf: "center" }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: G }}>{exam?.passing_score}%</div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>{t("pass mark", "درجة النجاح")}</div>
                </div>
              </div>
            </div>

            <button onClick={handleStart} disabled={starting}
              style={{ width: "100%", padding: "18px", borderRadius: 16, background: starting ? "#9ca3af" : G, border: "none", color: "#fff", fontSize: 17, fontWeight: 900, cursor: starting ? "not-allowed" : "pointer", fontFamily: "'Cairo',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: starting ? "none" : "0 6px 24px rgba(15,45,31,.4)", letterSpacing: 0.5 }}>
              {starting ? (
                <><Loader2 style={{ width: 20, height: 20, animation: "spin .8s linear infinite" }} />{t("Starting…", "جارٍ البدء…")}</>
              ) : (
                <><Play style={{ width: 20, height: 20 }} />{t("Start Exam Now", "ابدأ الامتحان الآن")}</>
              )}
            </button>
            <button onClick={() => navigate("/student/exams")} style={{ width: "100%", padding: "14px", marginTop: 10, borderRadius: 14, background: "transparent", border: "1.5px solid #e5e7eb", color: "#7a9e88", fontSize: 14, cursor: "pointer", fontFamily: "'Cairo',sans-serif" }}>
              {t("Back", "العودة")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PreExamVerification;
