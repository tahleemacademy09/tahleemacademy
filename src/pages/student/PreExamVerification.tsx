/*  src/pages/student/PreExamVerification.tsx — Mobile-first redesign */
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Camera, Mic, Monitor, Wifi, Shield, AlertTriangle, CheckCircle2,
  XCircle, Smartphone, Globe, Play, Clock, BookOpen,
  ChevronRight, Loader2, Eye, RotateCcw,
} from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#1a4731";
const GOLD = "#c9a84c";
const TL   = "#7a9e88";
const BORDER = "rgba(15,45,31,0.1)";
const CREAM  = "#faf6ee";

type CheckStatus = "pending" | "running" | "passed" | "failed" | "warning";
interface SysCheck { id: string; label: string; labelAr: string; icon: React.ReactNode; status: CheckStatus; detail?: string; }

const PreExamVerification = () => {
  const { examId }        = useParams<{ examId: string }>();
  const { t, language }   = useLanguage();
  const { user }          = useAuth();
  const { toast }         = useToast();
  const navigate          = useNavigate();

  const [exam,           setExam]           = useState<any>(null);
  const [loading,        setLoading]        = useState(true);
  const [questionCount,  setQuestionCount]  = useState<number | null>(null);
  const [step,           setStep]           = useState<"info"|"checks"|"checklist"|"ready">("info");
  const [checksComplete, setChecksComplete] = useState(false);
  const [agreed,         setAgreed]         = useState(false);
  const [starting,       setStarting]       = useState(false);
  const [micLevel,       setMicLevel]       = useState(0);
  const [micTested,      setMicTested]      = useState(false);
  const [webcamStream,   setWebcamStream]   = useState<MediaStream | null>(null);
  const [faceSnapshot,   setFaceSnapshot]   = useState<string | null>(null);
  const [faceCaptured,   setFaceCaptured]   = useState(false);
  const [checklist,      setChecklist]      = useState({
    quietEnvironment: false, faceVisible: false, noDevices: false, noTabSwitch: false,
  });

  const videoRef        = useRef<HTMLVideoElement>(null);
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const audioCtxRef     = useRef<AudioContext | null>(null);
  const analyserRef     = useRef<AnalyserNode | null>(null);
  const micAnimRef      = useRef<number>();
  const allChecked      = Object.values(checklist).every(Boolean);

  const [checks, setChecks] = useState<SysCheck[]>([
    { id:"camera",     label:"Webcam",               labelAr:"الكاميرا",       icon:<Camera     style={{width:15,height:15}}/>, status:"pending" },
    { id:"mic",        label:"Microphone",            labelAr:"الميكروفون",    icon:<Mic        style={{width:15,height:15}}/>, status:"pending" },
    { id:"device",     label:"Device",                labelAr:"الجهاز",        icon:<Smartphone style={{width:15,height:15}}/>, status:"pending" },
    { id:"browser",    label:"Browser",               labelAr:"المتصفح",       icon:<Globe      style={{width:15,height:15}}/>, status:"pending" },
    { id:"internet",   label:"Internet",              labelAr:"الإنترنت",      icon:<Wifi       style={{width:15,height:15}}/>, status:"pending" },
    { id:"fullscreen", label:"Fullscreen",            labelAr:"ملء الشاشة",    icon:<Monitor    style={{width:15,height:15}}/>, status:"pending" },
  ]);

  const updateCheck = useCallback((id: string, status: CheckStatus, detail?: string) => {
    setChecks(p => p.map(c => c.id === id ? { ...c, status, detail } : c));
  }, []);

  // Assign stream to hidden video for snapshot capture
  useEffect(() => {
    if (!webcamStream || !videoRef.current) return;
    videoRef.current.srcObject = webcamStream;
    videoRef.current.play().catch(() => {});
  }, [webcamStream]);

  useEffect(() => {
    if (!examId || !user) return;
    (async () => {
      const { data } = await supabase.from("exams").select("*").eq("id", examId).single();
      if (!data) { navigate("/student/exams"); return; }
      const { data: existing } = await supabase.from("exam_attempts").select("id")
        .eq("exam_id", examId).eq("user_id", user.id).eq("status","in_progress").maybeSingle();
      if (existing) { navigate(`/student/exam/${existing.id}`); return; }
      setExam(data);
      const { count } = await supabase.from("exam_questions").select("id", { count:"exact", head:true }).eq("exam_id", examId);
      setQuestionCount(count ?? data.question_count ?? null);
      setLoading(false);
    })();
  }, [examId, user]);

  useEffect(() => { return () => { if (micAnimRef.current) cancelAnimationFrame(micAnimRef.current); audioCtxRef.current?.close(); }; }, []);

  const runChecks = async () => {
    updateCheck("device","running");
    await new Promise(r => setTimeout(r, 250));
    const ua = navigator.userAgent;
    const isMobile = /mobile|android|iphone/i.test(ua);
    updateCheck("device","passed", isMobile ? "Mobile" : /tablet|ipad/i.test(ua) ? "Tablet" : "Desktop");

    updateCheck("browser","running");
    await new Promise(r => setTimeout(r, 150));
    const isChrome = /chrome/i.test(ua) && !/edge/i.test(ua);
    const isFF     = /firefox/i.test(ua);
    const isEdge   = /edg/i.test(ua);
    const bn = isChrome ? "Chrome" : isFF ? "Firefox" : isEdge ? "Edge" : /safari/i.test(ua) ? "Safari" : "Other";
    updateCheck("browser", (isChrome||isFF||isEdge) ? "passed" : "warning", bn);

    updateCheck("internet","running");
    try {
      const t0 = Date.now();
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, { method:"HEAD", headers:{ apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
      const ms = Date.now() - t0;
      updateCheck("internet", ms < 2000 ? "passed" : "warning", `${ms}ms`);
    } catch { updateCheck("internet","failed","Connection failed"); }

    updateCheck("fullscreen","running");
    await new Promise(r => setTimeout(r, 150));
    updateCheck("fullscreen", document.documentElement.requestFullscreen ? "passed" : "warning", "Supported");

    updateCheck("camera","running");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video:{ width:640, height:480 }, audio:false });
      setWebcamStream(stream);
      updateCheck("camera","passed","Ready");
    } catch (e: any) {
      updateCheck("camera", exam?.webcam_required ? "failed" : "warning", e.name === "NotAllowedError" ? "Permission denied" : "Not available");
    }

    updateCheck("mic","running");
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio:true });
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const an = ctx.createAnalyser(); an.fftSize = 256;
      analyserRef.current = an;
      ctx.createMediaStreamSource(micStream).connect(an);
      updateCheck("mic","passed","Ready");
      setMicTested(true);
      const buf = new Uint8Array(an.frequencyBinCount);
      const tick = () => {
        an.getByteFrequencyData(buf);
        setMicLevel(Math.min(100, (buf.reduce((a,b)=>a+b,0)/buf.length/128)*100));
        micAnimRef.current = requestAnimationFrame(tick);
      };
      micAnimRef.current = requestAnimationFrame(tick);
    } catch { updateCheck("mic", exam?.record_audio ? "failed" : "warning", "Not available"); }

    setChecksComplete(true);
  };

  useEffect(() => { if (step === "checks" && exam) runChecks(); }, [step, exam]);

  const captureSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    if (!v.videoWidth || v.readyState < 2) {
      toast({ title: t("Camera not ready yet","الكاميرا غير جاهزة"), variant:"destructive" }); return;
    }
    const c = canvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext("2d")!;
    ctx.save(); ctx.scale(-1,1); ctx.drawImage(v, -c.width, 0); ctx.restore();
    setFaceSnapshot(c.toDataURL("image/jpeg", 0.92));
    setFaceCaptured(false);
    toast({ title: t("Preview ready — confirm clarity","المعاينة جاهزة — تأكد من الوضوح") });
  };

  const handleStart = async () => {
    if (!user || !examId) return;
    setStarting(true);
    try {
      webcamStream?.getTracks().forEach(t => t.stop());
      const { data, error } = await supabase.from("exam_attempts").insert({
        exam_id: examId, user_id: user.id, status:"in_progress",
        started_at: new Date().toISOString(), tab_switches: 0,
      }).select().single();
      if (error || !data) throw error;
      if (faceSnapshot) {
        fetch(faceSnapshot).then(r=>r.blob()).then(blob => {
          const path = `${user.id}/${examId}/verification_${Date.now()}.jpg`;
          supabase.storage.from("proctoring-media").upload(path, blob, { contentType:"image/jpeg", upsert:true }).catch(()=>{});
        }).catch(()=>{});
      }
      if (exam?.fullscreen_required) { try { await document.documentElement.requestFullscreen(); } catch (_) {} }
      navigate(`/student/exam/${data.id}`);
    } catch { toast({ title: t("Failed to start exam.","فشل بدء الامتحان."), variant:"destructive" }); setStarting(false); }
  };

  const hasCriticalFailure = checks.some(c => c.status === "failed");
  const passedCount = checks.filter(c => c.status === "passed").length;
  const progressPct = (passedCount / checks.length) * 100;

  const STEPS = ["info","checks","checklist","ready"];
  const stepIdx = STEPS.indexOf(step);

  const statusIcon = (s: CheckStatus) => {
    if (s === "running") return <Loader2 style={{ width:16,height:16,color:"#0284c7",animation:"spin .8s linear infinite" }}/>;
    if (s === "passed")  return <CheckCircle2 style={{ width:16,height:16,color:"#22c55e" }}/>;
    if (s === "failed")  return <XCircle style={{ width:16,height:16,color:"#ef4444" }}/>;
    if (s === "warning") return <AlertTriangle style={{ width:16,height:16,color:"#f59e0b" }}/>;
    return <div style={{ width:14,height:14,borderRadius:"50%",border:"2px solid #d1d5db" }}/>;
  };
  const statusBg = (s: CheckStatus) => ({
    pending:"#f8fafb", running:"#f0f9ff", passed:"#f0fff4", failed:"#fff5f5", warning:"#fffbeb"
  }[s]);
  const statusBorder = (s: CheckStatus) => ({
    pending:"#e5e7eb", running:"#bae6fd", passed:"#86efac", failed:"#fca5a5", warning:"#fde68a"
  }[s]);

  if (loading) return (
    <div style={{ minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:CREAM }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ width:44,height:44,border:`4px solid ${G}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 14px" }}/>
        <p style={{ color:TL,fontSize:14,fontFamily:"'Cairo',sans-serif" }}>{t("Loading exam…","جارٍ التحميل…")}</p>
      </div>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );

  return (
    <div style={{ background:CREAM,minHeight:"100vh",fontFamily:"'Cairo',sans-serif" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Playfair+Display:wght@700&display=swap'); @keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}"}</style>
      <canvas ref={canvasRef} style={{ display:"none" }}/>
      {/* Hidden video for snapshots only — never shown to user */}
      <video ref={videoRef} autoPlay muted playsInline style={{ display:"none" }}/>

      {/* ── Top header bar ── */}
      <div style={{ background:`linear-gradient(135deg,${G},${GM})`, padding:"18px 18px 16px", position:"sticky", top:0, zIndex:50, boxShadow:"0 2px 16px rgba(15,45,31,.3)" }}>
        <div style={{ maxWidth:560, margin:"0 auto" }}>
          <button onClick={() => navigate("/student/exams")} style={{ background:"rgba(255,255,255,.15)", border:"none", borderRadius:10, padding:"6px 14px", color:"rgba(255,255,255,.85)", fontSize:12, fontWeight:700, cursor:"pointer", marginBottom:12, display:"flex", alignItems:"center", gap:5 }}>
            ← {t("Back","العودة")}
          </button>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:40,height:40,borderRadius:12,background:"rgba(255,255,255,.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
              <Shield style={{ width:20,height:20,color:GOLD }}/>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ fontSize:10,color:"rgba(255,255,255,.55)",fontWeight:700,letterSpacing:1,margin:0,textTransform:"uppercase" as const }}>
                {t("Pre-Exam Verification","التحقق قبل الامتحان")}
              </p>
              <h1 style={{ fontSize:16,fontWeight:800,color:"#fff",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const }}>
                {language === "ar" ? exam?.title_ar || exam?.title : exam?.title}
              </h1>
            </div>
          </div>

          {/* Step progress bar */}
          <div style={{ display:"flex", alignItems:"center", gap:0, marginTop:14 }}>
            {["Info","Checks","Checklist","Start"].map((lbl, i) => {
              const done = i < stepIdx, active = i === stepIdx;
              return (
                <div key={i} style={{ flex:1, display:"flex", flexDirection:"column" as const, alignItems:"center", position:"relative" }}>
                  {/* connector line */}
                  {i > 0 && <div style={{ position:"absolute",top:11,right:"50%",left:"-50%",height:2,background: done||active ? GOLD : "rgba(255,255,255,.2)",zIndex:0 }}/>}
                  <div style={{
                    width:22,height:22,borderRadius:"50%",position:"relative",zIndex:1,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:11,fontWeight:900,
                    background: done ? GOLD : active ? "#fff" : "rgba(255,255,255,.15)",
                    color: done ? G : active ? G : "rgba(255,255,255,.5)",
                    border: active ? `2px solid ${GOLD}` : "none",
                    boxShadow: active ? `0 0 8px ${GOLD}88` : "none",
                  }}>
                    {done ? "✓" : i+1}
                  </div>
                  {active && <span style={{ fontSize:9,fontWeight:700,color:GOLD,marginTop:3,letterSpacing:.5 }}>{lbl.toUpperCase()}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth:560,margin:"0 auto",padding:"20px 16px 40px" }}>

        {/* ══ INFO STEP ══════════════════════════════════ */}
        {step === "info" && (
          <div style={{ animation:"fadeUp .3s ease" }}>
            {/* Exam details card */}
            <div style={{ background:"#fff",borderRadius:20,overflow:"hidden",boxShadow:"0 4px 20px rgba(15,45,31,.1)",marginBottom:14 }}>
              <div style={{ background:`linear-gradient(135deg,${G},${GM})`,padding:"18px 20px" }}>
                <p style={{ fontSize:10,color:"rgba(255,255,255,.55)",fontWeight:700,letterSpacing:1,margin:"0 0 12px",textTransform:"uppercase" as const }}>EXAM DETAILS</p>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
                  {[
                    { icon:<Clock style={{width:14,height:14}}/>,     lbl:t("Duration","المدة"),          val:`${exam?.time_limit_minutes} ${t("min","دق")}` },
                    { icon:<BookOpen style={{width:14,height:14}}/>,   lbl:t("Questions","الأسئلة"),        val:`${questionCount ?? "..."} ${t("Qs","سؤال")}` },
                    { icon:<Shield style={{width:14,height:14}}/>,     lbl:t("Pass Mark","درجة النجاح"),    val:`${exam?.passing_score}%` },
                    { icon:<RotateCcw style={{width:14,height:14}}/>,  lbl:t("Attempts","المحاولات"),       val:`${exam?.max_attempts || 1}` },
                  ].map((item,i) => (
                    <div key={i} style={{ display:"flex",alignItems:"center",gap:10 }}>
                      <div style={{ width:32,height:32,borderRadius:10,background:"rgba(255,255,255,.12)",display:"flex",alignItems:"center",justifyContent:"center",color:GOLD,flexShrink:0 }}>{item.icon}</div>
                      <div>
                        <div style={{ fontSize:9,color:"rgba(255,255,255,.45)",fontWeight:600 }}>{item.lbl}</div>
                        <div style={{ fontSize:15,fontWeight:900,color:"#fff" }}>{item.val}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Proctoring notice */}
              {exam?.proctoring_enabled && (
                <div style={{ padding:"14px 18px",background:"#fffbeb",borderBottom:"1px solid #fde68a",display:"flex",gap:10,alignItems:"flex-start" }}>
                  <AlertTriangle style={{ width:18,height:18,color:"#f59e0b",flexShrink:0,marginTop:1 }}/>
                  <div>
                    <div style={{ fontSize:13,fontWeight:700,color:"#92400e",marginBottom:3 }}>{t("This exam is proctored","هذا الامتحان مراقَب")}</div>
                    <div style={{ fontSize:12,color:"#78350f",lineHeight:1.6 }}>
                      {t("Your camera and activity will be monitored. Violations may reduce your score.","ستُراقَب كاميرتك ونشاطك. قد تؤثر المخالفات على درجتك.")}
                    </div>
                  </div>
                </div>
              )}

              {/* Guidelines */}
              {(exam?.guidelines || exam?.guidelines_ar) && (
                <div style={{ padding:"14px 18px",borderBottom:"1px solid #f0f4f8" }}>
                  <div style={{ fontSize:10,fontWeight:800,color:"#9ca3af",marginBottom:8,letterSpacing:1 }}>GUIDELINES</div>
                  <div style={{ fontSize:14,color:G,lineHeight:1.8,fontFamily:"'Amiri',serif" }} dir="auto">
                    {language === "ar" ? exam.guidelines_ar || exam.guidelines : exam.guidelines}
                  </div>
                </div>
              )}

              {/* Rules */}
              <div style={{ padding:"14px 18px" }}>
                <div style={{ fontSize:10,fontWeight:800,color:"#9ca3af",marginBottom:10,letterSpacing:1 }}>RULES</div>
                {[
                  t("Do not switch tabs or leave this page during the exam.","لا تتبدل التبويبات أو تغادر هذه الصفحة."),
                  t("Keep your face visible in the camera at all times.","احرص على أن يكون وجهك مرئياً في الكاميرا طوال الوقت."),
                  t("No phones, notes, or external materials are allowed.","لا يُسمح بالهواتف أو الملاحظات أو المواد الخارجية."),
                  t("Exiting fullscreen may count as a violation.","الخروج من وضع ملء الشاشة قد يُعدّ مخالفة."),
                ].map((rule,i) => (
                  <div key={i} style={{ display:"flex",gap:10,alignItems:"flex-start",marginBottom:9 }}>
                    <div style={{ width:20,height:20,borderRadius:6,background:G,color:"#fff",fontSize:10,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1 }}>{i+1}</div>
                    <div style={{ fontSize:13,color:"#374151",lineHeight:1.6 }}>{rule}</div>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={() => setStep("checks")} style={{ width:"100%",padding:"16px",borderRadius:16,background:`linear-gradient(135deg,${G},${GM})`,border:"none",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 4px 16px rgba(15,45,31,.3)" }}>
              {t("Run System Checks","تشغيل فحوصات النظام")} <ChevronRight style={{width:18,height:18}}/>
            </button>
          </div>
        )}

        {/* ══ CHECKS STEP ════════════════════════════════ */}
        {step === "checks" && (
          <div style={{ animation:"fadeUp .3s ease" }}>
            <div style={{ background:"#fff",borderRadius:20,overflow:"hidden",boxShadow:"0 4px 20px rgba(15,45,31,.1)",marginBottom:14 }}>
              {/* Progress header */}
              <div style={{ padding:"16px 18px",background:`linear-gradient(135deg,${G},${GM})` }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
                  <span style={{ fontSize:13,fontWeight:800,color:"#fff" }}>{t("System Checks","فحوصات النظام")}</span>
                  <span style={{ fontSize:12,color:"rgba(255,255,255,.65)" }}>{passedCount}/{checks.length} {t("passed","اجتاز")}</span>
                </div>
                {/* Progress bar */}
                <div style={{ height:6,background:"rgba(255,255,255,.15)",borderRadius:3,overflow:"hidden" }}>
                  <div style={{ height:"100%",width:`${progressPct}%`,background:GOLD,borderRadius:3,transition:"width .5s" }}/>
                </div>
              </div>

              {/* Check items */}
              <div>
                {checks.map((ck, i) => (
                  <div key={ck.id} style={{
                    display:"flex",alignItems:"center",gap:12,padding:"13px 18px",
                    borderBottom: i < checks.length-1 ? "1px solid #f0f4f8" : "none",
                    background: statusBg(ck.status), transition:"background .3s",
                  }}>
                    <div style={{ width:36,height:36,borderRadius:10,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:`${statusBorder(ck.status)}33`,border:`1.5px solid ${statusBorder(ck.status)}`,color:TL }}>
                      {ck.icon}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13,fontWeight:700,color:G }}>{language==="ar" ? ck.labelAr : ck.label}</div>
                      {ck.detail && <div style={{ fontSize:11,color:TL,marginTop:1 }}>{ck.detail}</div>}
                    </div>
                    {statusIcon(ck.status)}
                  </div>
                ))}
              </div>

              {/* Camera status */}
              {webcamStream && (
                <div style={{ padding:"14px 18px",borderTop:"1px solid #f0f4f8" }}>
                  <div style={{ display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background: faceCaptured ? "#f0fff4" : "#f0f9ff",borderRadius:12,border:`1px solid ${faceCaptured ? "#86efac" : "#bae6fd"}` }}>
                    <div style={{ fontSize:22,flexShrink:0 }}>{faceCaptured ? "✅" : "📷"}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13,fontWeight:700,color: faceCaptured ? "#065f46" : "#0369a1" }}>
                        {faceCaptured ? t("Verification photo captured","تم التقاط صورة التحقق") : t("Camera active — tap Capture for verification","الكاميرا نشطة — اضغط التقاط للتحقق")}
                      </div>
                      <div style={{ fontSize:11,color:TL,marginTop:2 }}>
                        {faceCaptured ? t("Your identity is recorded for this session.","تم تسجيل هويتك لهذه الجلسة.") : t("A photo will be taken automatically on exam start.","سيتم التقاط صورة تلقائياً عند البدء.")}
                      </div>
                    </div>
                    {!faceCaptured ? (
                      <button onClick={captureSnapshot} style={{ padding:"8px 14px",borderRadius:10,background:G,border:"none",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0 }}>
                        {t("Capture","التقاط")}
                      </button>
                    ) : (
                      <button onClick={() => { setFaceSnapshot(null); setFaceCaptured(false); }} style={{ padding:"6px 12px",borderRadius:10,background:"none",border:"1px solid #86efac",color:"#065f46",fontSize:11,fontWeight:600,cursor:"pointer",flexShrink:0 }}>
                        {t("Redo","إعادة")}
                      </button>
                    )}
                  </div>
                  {/* Snapshot preview */}
                  {faceSnapshot && !faceCaptured && (
                    <div style={{ marginTop:10,borderRadius:12,overflow:"hidden",border:"2px solid #fbbf24" }}>
                      <div style={{ background:"#fffbeb",padding:"7px 12px",fontSize:11,fontWeight:700,color:"#92400e" }}>
                        📋 {t("Is this photo clear and well-lit?","هل الصورة واضحة ومضاءة جيداً؟")}
                      </div>
                      <img src={faceSnapshot} alt="preview" style={{ width:"100%",display:"block" }}/>
                      <div style={{ display:"flex",gap:8,padding:"10px 12px",background:"#fffbeb" }}>
                        <button onClick={() => setFaceCaptured(true)} style={{ flex:1,padding:"9px",borderRadius:9,background:"#22c55e",border:"none",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer" }}>
                          ✓ {t("Yes, use this","نعم، استخدمها")}
                        </button>
                        <button onClick={() => { setFaceSnapshot(null); setFaceCaptured(false); }} style={{ flex:1,padding:"9px",borderRadius:9,background:"#ef4444",border:"none",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer" }}>
                          ✗ {t("Retake","إعادة")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Mic level */}
              {micTested && (
                <div style={{ padding:"14px 18px",borderTop:"1px solid #f0f4f8" }}>
                  <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
                    <span style={{ fontSize:11,fontWeight:700,color:TL,letterSpacing:.8 }}>🎙 MIC LEVEL</span>
                    <span style={{ fontSize:11,fontWeight:700,color: micLevel>60 ? "#22c55e" : micLevel>20 ? "#f59e0b" : TL }}>{micLevel > 20 ? t("Detected ✓","تم الاكتشاف ✓") : t("Speak to test…","تكلم للاختبار…")}</span>
                  </div>
                  <div style={{ height:8,background:"#f0f4f8",borderRadius:4,overflow:"hidden" }}>
                    <div style={{ height:"100%",width:`${micLevel}%`,background: micLevel>60?"#22c55e":micLevel>20?GOLD:"#e5e7eb",borderRadius:4,transition:"width .1s" }}/>
                  </div>
                </div>
              )}
            </div>

            {checksComplete && (
              <button onClick={() => setStep("checklist")} style={{
                width:"100%",padding:"16px",borderRadius:16,border:"none",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                background: hasCriticalFailure ? "linear-gradient(135deg,#dc2626,#b91c1c)" : `linear-gradient(135deg,${G},${GM})`,
                boxShadow:"0 4px 16px rgba(15,45,31,.3)",
              }}>
                {hasCriticalFailure ? t("Some checks failed — proceed anyway?","فشل بعض الفحوصات — متابعة؟") : t("Continue to Checklist","المتابعة إلى القائمة")}
                <ChevronRight style={{width:18,height:18}}/>
              </button>
            )}
          </div>
        )}

        {/* ══ CHECKLIST STEP ═════════════════════════════ */}
        {step === "checklist" && (
          <div style={{ animation:"fadeUp .3s ease" }}>
            <div style={{ background:"#fff",borderRadius:20,overflow:"hidden",boxShadow:"0 4px 20px rgba(15,45,31,.1)",marginBottom:14 }}>
              <div style={{ background:`linear-gradient(135deg,${G},${GM})`,padding:"18px 20px" }}>
                <div style={{ fontSize:16,fontWeight:900,color:"#fff",marginBottom:4 }}>{t("Final Checklist","القائمة النهائية")}</div>
                <div style={{ fontSize:12,color:"rgba(255,255,255,.6)" }}>{t("Confirm before starting — tap each to check off","تأكد قبل البدء — انقر لتأشير كل بند")}</div>
                {/* Progress dots */}
                <div style={{ display:"flex",gap:6,marginTop:12 }}>
                  {Object.values(checklist).map((v,i) => (
                    <div key={i} style={{ flex:1,height:4,borderRadius:2,background: v ? GOLD : "rgba(255,255,255,.2)",transition:"background .3s" }}/>
                  ))}
                </div>
              </div>
              <div>
                {([
                  { key:"quietEnvironment" as const, emoji:"🔇", label:t("I am in a quiet environment with no distractions","أنا في بيئة هادئة بدون مشتتات") },
                  { key:"faceVisible"       as const, emoji:"🙂", label:t("My face is clearly visible and well-lit","وجهي مرئي بوضوح ومضيء جيداً") },
                  { key:"noDevices"         as const, emoji:"📵", label:t("No unauthorized devices or materials nearby","لا توجد أجهزة أو مواد غير مصرح بها") },
                  { key:"noTabSwitch"       as const, emoji:"🔒", label:t("I will not switch tabs or leave the exam window","لن أغادر نافذة الامتحان") },
                ]).map((item, i, arr) => {
                  const checked = checklist[item.key];
                  return (
                    <div key={item.key} onClick={() => setChecklist(p => ({ ...p, [item.key]: !p[item.key] }))}
                      style={{
                        display:"flex",alignItems:"center",gap:14,padding:"16px 18px",cursor:"pointer",
                        background: checked ? "#f0fff4" : "#fff",
                        borderBottom: i < arr.length-1 ? "1px solid #f0f4f8" : "none",
                        transition:"background .2s",
                      }}>
                      <span style={{ fontSize:20,flexShrink:0 }}>{item.emoji}</span>
                      <div style={{ flex:1,fontSize:13,color:G,lineHeight:1.6 }}>{item.label}</div>
                      <div style={{
                        width:26,height:26,borderRadius:8,flexShrink:0,
                        border:`2px solid ${checked ? "#22c55e" : "#d1d5db"}`,
                        background: checked ? "#22c55e" : "#fff",
                        display:"flex",alignItems:"center",justifyContent:"center",
                        transition:"all .2s",
                      }}>
                        {checked && <span style={{ color:"#fff",fontSize:14,fontWeight:900 }}>✓</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Agreement */}
              <div style={{ padding:"16px 18px",background:"#f8fafb",borderTop:"1px solid #f0f4f8" }}>
                <div onClick={() => setAgreed(!agreed)} style={{ display:"flex",alignItems:"flex-start",gap:12,cursor:"pointer" }}>
                  <div style={{ width:24,height:24,borderRadius:7,border:`2px solid ${agreed ? G : "#d1d5db"}`,background: agreed ? G : "#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1,transition:"all .2s" }}>
                    {agreed && <span style={{ color:"#fff",fontSize:13,fontWeight:900 }}>✓</span>}
                  </div>
                  <div style={{ fontSize:13,color:"#374151",lineHeight:1.7 }}>
                    {t("I confirm I have read and understood all exam rules. I agree to be monitored and accept that violations may affect my score.","أؤكد أنني قرأت وفهمت جميع قواعد الامتحان وأوافق على المراقبة.")}
                  </div>
                </div>
              </div>
            </div>

            <button onClick={() => setStep("ready")} disabled={!allChecked || !agreed} style={{
              width:"100%",padding:"16px",borderRadius:16,border:"none",fontSize:15,fontWeight:800,
              cursor: (!allChecked||!agreed) ? "not-allowed" : "pointer",
              display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              background: (!allChecked||!agreed) ? "#e5e7eb" : `linear-gradient(135deg,${G},${GM})`,
              color: (!allChecked||!agreed) ? "#9ca3af" : "#fff",
              boxShadow: (!allChecked||!agreed) ? "none" : "0 4px 16px rgba(15,45,31,.3)",
            }}>
              {t("Ready to Start","جاهز للبدء")} <ChevronRight style={{width:18,height:18}}/>
            </button>
          </div>
        )}

        {/* ══ READY STEP ═════════════════════════════════ */}
        {step === "ready" && (
          <div style={{ animation:"fadeUp .3s ease" }}>
            {/* Go card */}
            <div style={{ background:"#fff",borderRadius:20,padding:"32px 22px",textAlign:"center",boxShadow:"0 4px 20px rgba(15,45,31,.1)",marginBottom:14 }}>
              {/* Animated ready icon */}
              <div style={{ width:96,height:96,borderRadius:"50%",background:`linear-gradient(135deg,${G},${GM})`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 18px",boxShadow:"0 6px 28px rgba(15,45,31,.35)",animation:"fadeUp .4s ease" }}>
                <CheckCircle2 style={{ width:48,height:48,color:GOLD }}/>
              </div>
              <h2 style={{ fontSize:26,fontWeight:900,color:G,margin:"0 0 10px",fontFamily:"'Playfair Display',serif" }}>
                {t("You're Ready!","أنت جاهز!")}
              </h2>
              <p style={{ fontSize:14,color:TL,lineHeight:1.7,margin:"0 0 24px" }}>
                {t("All checks passed. The timer starts immediately when you tap Start.","اجتازت جميع الفحوصات. يبدأ المؤقت فوراً عند الضغط على ابدأ.")}
              </p>
              {/* Stats row */}
              <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:8 }}>
                {[
                  { lbl:t("Duration","المدة"),       val:`${exam?.time_limit_minutes}`,  sub:t("minutes","دقيقة") },
                  { lbl:t("Pass Mark","النجاح"),      val:`${exam?.passing_score}%`,      sub:t("required","مطلوب") },
                  { lbl:t("Questions","الأسئلة"),     val:String(questionCount ?? "?"),   sub:t("total","إجمالي") },
                ].map((s,i) => (
                  <div key={i} style={{ padding:"12px 8px",background:"#f8fafb",borderRadius:14,border:`1px solid ${BORDER}` }}>
                    <div style={{ fontSize:11,color:TL,fontWeight:600,marginBottom:4 }}>{s.lbl}</div>
                    <div style={{ fontSize:22,fontWeight:900,color:G,lineHeight:1 }}>{s.val}</div>
                    <div style={{ fontSize:10,color:TL,marginTop:3 }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {exam?.proctoring_enabled && (
                <div style={{ padding:"10px 14px",borderRadius:12,background:"#fffbeb",border:"1px solid #fde68a",fontSize:12,color:"#92400e",fontWeight:600,display:"flex",alignItems:"center",gap:8,justifyContent:"center" }}>
                  📷 {t("Camera will start monitoring when exam begins","ستبدأ مراقبة الكاميرا عند بدء الامتحان")}
                </div>
              )}
            </div>

            {/* Start button */}
            <button onClick={handleStart} disabled={starting} style={{
              width:"100%",padding:"18px",borderRadius:16,border:"none",color:"#fff",fontSize:17,fontWeight:900,
              cursor: starting ? "not-allowed" : "pointer",letterSpacing:.5,
              background: starting ? "#9ca3af" : `linear-gradient(135deg,${G},${GM})`,
              display:"flex",alignItems:"center",justifyContent:"center",gap:10,
              boxShadow: starting ? "none" : "0 6px 24px rgba(15,45,31,.4)",
              marginBottom:10,
            }}>
              {starting
                ? <><Loader2 style={{width:20,height:20,animation:"spin .8s linear infinite"}}/> {t("Starting…","جارٍ البدء…")}</>
                : <><Play style={{width:20,height:20}}/> {t("Start Exam Now","ابدأ الامتحان الآن")}</>}
            </button>
            <button onClick={() => setStep("checklist")} style={{ width:"100%",padding:"13px",borderRadius:14,background:"transparent",border:`1.5px solid ${BORDER}`,color:TL,fontSize:14,cursor:"pointer" }}>
              ← {t("Back","العودة")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PreExamVerification;
