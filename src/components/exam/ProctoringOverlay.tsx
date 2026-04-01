/*  src/components/exam/ProctoringOverlay.tsx — SMART v3
    ✅ Specific warnings: camera off, face absent, eyes closed, looking away
    ✅ Each banner: icon + title + what happened + what to do (EN + AR)
    ✅ Red pulsing border when face/eye issue active
    ✅ Severity-coded: warn → caution → alert → critical
    ✅ Auto-dismisses when student fixes the issue
*/
import { useEffect, useState, useRef, useCallback } from "react";
import { X, Camera, ShieldAlert } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";

interface ViolationEntry { type: string; time: string; details: string; }
interface Props {
  cameraReady: boolean; faceDetected: boolean;
  integrityScore: number; suspicionLevel: string;
  strikes: number; maxStrikes: number;
  violations: number; lastWarningType: string | null;
  audioMonitoring: boolean; recentViolations: ViolationEntry[];
  getStream: () => MediaStream | null;
  attemptId: string;
  onPointDeduction: (points: number, reason: string) => void;
}

const WARN: Record<string, {
  icon: string; sev: "warn"|"caution"|"alert"|"critical";
  title_en: string; title_ar: string;
  msg_en: string;   msg_ar: string;
  fix_en: string;   fix_ar: string;
  pts: number; autoFix?: boolean;
}> = {
  camera_covered:    { icon:"📷", sev:"critical", pts:10,
    title_en:"Camera Blocked!",              title_ar:"الكاميرا محجوبة!",
    msg_en:  "Your camera feed is too dark or covered.",
    msg_ar:  "صورة الكاميرا مظلمة جداً أو محجوبة.",
    fix_en:  "Uncover your camera immediately to continue.",
    fix_ar:  "أزل أي شيء يحجب الكاميرا فوراً." },
  webcam_disabled:   { icon:"🚫", sev:"critical", pts:10,
    title_en:"Camera Disconnected!",         title_ar:"الكاميرا مفصولة!",
    msg_en:  "Your webcam has stopped working.",
    msg_ar:  "الكاميرا توقفت عن العمل.",
    fix_en:  "Reconnect your camera immediately.",
    fix_ar:  "أعد تشغيل الكاميرا فوراً." },
  face_not_detected: { icon:"👤", sev:"alert", pts:0, autoFix:true,
    title_en:"Face Not Visible",             title_ar:"وجهك غير مرئي",
    msg_en:  "Your face cannot be seen in the camera.",
    msg_ar:  "وجهك غير ظاهر في الكاميرا.",
    fix_en:  "Sit directly in front of your camera and keep your face visible.",
    fix_ar:  "اجلس أمام الكاميرا مباشرة وابقَ ظاهراً." },
  eyes_not_visible:  { icon:"👁️", sev:"caution", pts:0, autoFix:true,
    title_en:"Eyes Not Detected",            title_ar:"العينان غير مرئيتان",
    msg_en:  "Your eyes are not visible — you may be looking down or eyes are closed.",
    msg_ar:  "عيناك غير مرئيتان — ربما تنظر للأسفل أو عيناك مغلقتان.",
    fix_en:  "Look directly at the screen with your eyes open.",
    fix_ar:  "انظر مباشرة إلى الشاشة وأبقِ عينيك مفتوحتين." },
  looking_away:      { icon:"👀", sev:"warn", pts:0, autoFix:true,
    title_en:"Not Concentrating",            title_ar:"غير مركز",
    msg_en:  "You appear to be looking away from the screen.",
    msg_ar:  "يبدو أنك تنظر بعيداً عن الشاشة.",
    fix_en:  "Keep your eyes on the exam screen at all times.",
    fix_ar:  "أبقِ عينيك على شاشة الامتحان في جميع الأوقات." },
  multiple_faces:    { icon:"👥", sev:"critical", pts:10,
    title_en:"Multiple People Detected!",    title_ar:"أكثر من شخص في الإطار!",
    msg_en:  "More than one face is visible in your camera.",
    msg_ar:  "يظهر أكثر من وجه في الكاميرا.",
    fix_en:  "Ensure you are completely alone. This has been reported.",
    fix_ar:  "تأكد من أنك وحدك تماماً. تم الإبلاغ عن هذا." },
  tab_switch:        { icon:"🚪", sev:"alert", pts:5,
    title_en:"You Left the Exam Window!",    title_ar:"غادرت نافذة الامتحان!",
    msg_en:  "You switched away from the exam. This has been recorded.",
    msg_ar:  "غادرت الامتحان. تم تسجيل ذلك.",
    fix_en:  "Stay on this page. Further violations will auto-submit your exam.",
    fix_ar:  "ابقَ في هذه الصفحة. المخالفات الإضافية ستؤدي إلى التسليم التلقائي." },
  fullscreen_exit:   { icon:"⬜", sev:"caution", pts:3,
    title_en:"Return to Fullscreen",         title_ar:"عُد لوضع ملء الشاشة",
    msg_en:  "You exited fullscreen mode.",
    msg_ar:  "خرجت من وضع ملء الشاشة.",
    fix_en:  "Press F11 or click the fullscreen button to return.",
    fix_ar:  "اضغط F11 للعودة لوضع ملء الشاشة." },
  copy_paste:        { icon:"📋", sev:"alert", pts:5,
    title_en:"Copy/Paste Detected",          title_ar:"تم اكتشاف النسخ/اللصق",
    msg_en:  "A copy or paste action was detected and blocked.",
    msg_ar:  "تم اكتشاف عملية نسخ أو لصق وإيقافها.",
    fix_en:  "All exam content is protected. This action has been reported.",
    fix_ar:  "محتوى الامتحان محمي. تم تسجيل وإبلاغ هذا الإجراء." },
  dev_tools:         { icon:"🔧", sev:"critical", pts:10,
    title_en:"Developer Tools Blocked!",     title_ar:"أدوات المطور محظورة!",
    msg_en:  "An attempt to open developer tools was detected.",
    msg_ar:  "تم اكتشاف محاولة فتح أدوات المطور.",
    fix_en:  "This is a serious violation and has been immediately reported.",
    fix_ar:  "هذه مخالفة خطيرة وتم الإبلاغ عنها فوراً." },
  right_click:       { icon:"🖱️", sev:"warn", pts:1,
    title_en:"Right-Click Disabled",         title_ar:"النقر الأيمن معطل",
    msg_en:  "Right-clicking is not allowed during the exam.",
    msg_ar:  "النقر بزر الماوس الأيمن غير مسموح أثناء الامتحان.",
    fix_en:  "This action has been recorded.",
    fix_ar:  "تم تسجيل هذا الإجراء." },
  not_concentrating: { icon:"🎯", sev:"caution", pts:0, autoFix:true,
    title_en:"Stay Focused!",               title_ar:"ابقَ مركزاً!",
    msg_en:  "You appear to be distracted or not concentrating.",
    msg_ar:  "يبدو أنك مشتت أو غير مركز.",
    fix_en:  "Focus on your exam. Repeated distraction is recorded and may affect your score.",
    fix_ar:  "ركز على امتحانك. الإلهاء المتكرر يُسجَّل وقد يؤثر على درجتك." },
  unusual_audio:     { icon:"🎙️", sev:"warn", pts:0,
    title_en:"Background Noise Detected",    title_ar:"ضوضاء في الخلفية",
    msg_en:  "Sustained background noise was detected.",
    msg_ar:  "تم اكتشاف ضوضاء مستمرة في الخلفية.",
    fix_en:  "Move to a quiet environment or silence background sounds.",
    fix_ar:  "انتقل إلى بيئة هادئة." },
};

const SEV_THEME = {
  warn:     { bg:"#fffbeb", border:"#f59e0b", text:"#78350f" },
  caution:  { bg:"#fff7ed", border:"#f97316", text:"#7c2d12" },
  alert:    { bg:"#0f0000", border:"#ef4444", text:"#ffffff" },
  critical: { bg:"#080000", border:"#dc2626", text:"#ffffff" },
};

const ProctoringOverlay = ({
  cameraReady, faceDetected, integrityScore, suspicionLevel,
  strikes, maxStrikes, violations, lastWarningType,
  audioMonitoring, recentViolations, getStream,
  attemptId, onPointDeduction,
}: Props) => {
  const { language } = useLanguage();
  const videoRef      = useRef<HTMLVideoElement>(null);
  const warnCooldown  = useRef<Record<string, number>>({});
  const faceWarnCount = useRef(0);
  const ptsDone       = useRef<Set<string>>(new Set());

  const [banners, setBanners]         = useState<Array<{ id:string; type:string; pts:number }>>([]);
  const [autoCountdown, setAutoCount] = useState<number|null>(null);
  const [pointsLost, setPointsLost]   = useState(0);
  const [borderAlert, setBorderAlert] = useState(false);

  // Screenshot prevention
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "proctor-css";
    style.textContent = "@media print{body{display:none!important}} .exam-content{-webkit-user-select:none;user-select:none}";
    document.head.appendChild(style);
    const blockPrint = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") { e.preventDefault(); showBanner("copy_paste"); setTimeout(()=>navigator.clipboard?.writeText("").catch(()=>{}),100); }
    };
    document.addEventListener("keyup", blockPrint);
    return () => { document.removeEventListener("keyup", blockPrint); document.getElementById("proctor-css")?.remove(); };
  }, []);

  // Attach stream
  useEffect(() => {
    const s = getStream();
    if (s && videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(()=>{}); }
  }, [cameraReady, getStream]);

  const showBanner = useCallback((type: string) => {
    const cfg = WARN[type]; if (!cfg) return;
    const COOL: Record<string,number> = {
      face_not_detected:2000, eyes_not_visible:3500, looking_away:3500,
      camera_covered:2500, webcam_disabled:2500, multiple_faces:5000,
      tab_switch:3000, dev_tools:3000, copy_paste:4000, right_click:6000,
      fullscreen_exit:5000, unusual_audio:12000,
    };
    const now = Date.now();
    if (warnCooldown.current[type] && now - warnCooldown.current[type] < (COOL[type]||6000)) return;
    warnCooldown.current[type] = now;

    let pts = cfg.pts;
    if (type === "face_not_detected") { faceWarnCount.current++; pts = faceWarnCount.current >= 2 ? 5 : 0; }

    const id = type + "-" + now;
    // Only show 1 banner at a time - replace existing
    setBanners([{id, type, pts}]);

    if (pts > 0 && !ptsDone.current.has(id)) {
      ptsDone.current.add(id);
      onPointDeduction(pts, cfg.title_en);
      setPointsLost(p => p + pts);
    }

    if (!cfg.autoFix) setTimeout(() => setBanners(prev => prev.filter(b => b.id !== id)), 7000);
    if (["face_not_detected","eyes_not_visible","looking_away","camera_covered"].includes(type)) setBorderAlert(true);

    if (attemptId) {
      supabase.from("proctoring_logs" as any).insert({
        attempt_id: attemptId, violation_type: type, severity: cfg.sev,
        points_deducted: pts, detected_at: new Date().toISOString(),
      }).then(()=>{});
    }
  }, [onPointDeduction, attemptId]);

  useEffect(() => { if (lastWarningType) showBanner(lastWarningType); }, [lastWarningType, violations]);

  // Auto-dismiss face banners when face returns
  useEffect(() => {
    if (faceDetected) {
      setBanners(p => p.filter(b => !["face_not_detected","eyes_not_visible","looking_away","not_concentrating"].includes(b.type)));
      setBorderAlert(false);
    }
  }, [faceDetected]);

  useEffect(() => {
    if (cameraReady) setBanners(p => p.filter(b => b.type !== "webcam_disabled"));
    else showBanner("webcam_disabled");
  }, [cameraReady]);

  // Auto-submit countdown
  useEffect(() => {
    if (suspicionLevel === "critical" && strikes >= maxStrikes - 1) {
      let c = 10; setAutoCount(c);
      const iv = setInterval(()=>{ c--; setAutoCount(c); if (c<=0) clearInterval(iv); }, 1000);
      return () => clearInterval(iv);
    } else setAutoCount(null);
  }, [suspicionLevel, strikes, maxStrikes]);

  const isAr = language === "ar";
  const statusColor = {low:"#22c55e",medium:"#f59e0b",high:"#ef4444",critical:"#dc2626"}[suspicionLevel]||"#22c55e";

  return (
    <>
      <video ref={videoRef} muted playsInline
        style={{position:"fixed",width:1,height:1,opacity:0,top:0,left:0,pointerEvents:"none"}}/>

      {/* Pulsing alert border */}
      {borderAlert && (
        <div style={{position:"fixed",inset:0,zIndex:400,pointerEvents:"none",
          border:"4px solid #ef4444",borderRadius:0,
          animation:"procBorderPulse 1s ease-in-out infinite"}}/>
      )}

      {/* Auto-submit countdown */}
      {autoCountdown !== null && autoCountdown > 0 && (
        <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.96)",
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,padding:24}}>
          <ShieldAlert style={{width:72,height:72,color:"#dc2626"}}/>
          <div style={{fontSize:22,fontWeight:900,color:"#fff",textAlign:"center"}}>
            🚨 Multiple Violations — Auto-Submitting
          </div>
          <div style={{fontSize:14,color:"rgba(255,255,255,.6)",textAlign:"center",maxWidth:300}}>
            Too many integrity violations were detected. Exam submitting in:
          </div>
          <div style={{fontSize:96,fontWeight:900,color:"#dc2626",lineHeight:1}}>{autoCountdown}</div>
        </div>
      )}

      {/* Banners stack */}
      <div style={{position:"fixed",top:60,left:"50%",transform:"translateX(-50%)",
        zIndex:500,width:"calc(100% - 20px)",maxWidth:500,
        display:"flex",flexDirection:"column",gap:8,pointerEvents:"none"}}>
        {banners.map(banner => {
          const cfg = WARN[banner.type]; if (!cfg) return null;
          const theme = SEV_THEME[cfg.sev];
          const isDark = cfg.sev === "alert" || cfg.sev === "critical";
          return (
            <div key={banner.id} style={{
              background: isDark ? "linear-gradient(135deg,#1a0000,#2a0000)" : theme.bg,
              border:"2px solid "+theme.border,borderRadius:16,
              padding:"14px 16px 12px",
              boxShadow:"0 8px 32px rgba(0,0,0,.55), 0 0 0 1px "+theme.border+"44",
              animation:"procBannerIn .2s ease",pointerEvents:"auto",
            }}>
              <div style={{display:"flex",alignItems:"flex-start",gap:11,marginBottom:8}}>
                <div style={{width:40,height:40,borderRadius:10,background:theme.border+"22",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
                  {cfg.icon}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,fontWeight:900,color:theme.text,opacity:.65,letterSpacing:1,textTransform:"uppercase"}}>
                    {{warn:"⚠ Warning",caution:"⚠ Caution",alert:"🚨 Alert",critical:"🚨 Critical"}[cfg.sev]}
                  </div>
                  <div style={{fontSize:15,fontWeight:900,color:theme.text,lineHeight:1.3}}>
                    {isAr ? cfg.title_ar : cfg.title_en}
                  </div>
                </div>
                {banner.pts > 0 && (
                  <div style={{background:theme.border+"33",border:"1px solid "+theme.border,
                    borderRadius:8,padding:"3px 9px",fontSize:11,fontWeight:900,color:theme.text,flexShrink:0}}>
                    −{banner.pts} pts
                  </div>
                )}
                <button onClick={()=>setBanners(p=>p.filter(b=>b.id!==banner.id))}
                  style={{background:"none",border:"none",color:theme.text,cursor:"pointer",opacity:.6,padding:2,flexShrink:0,pointerEvents:"auto",
                     display:"flex",alignItems:"center",justifyContent:"center",width:24,height:24,borderRadius:6}}>

                  <X style={{width:14,height:14}}/>
                </button>
              </div>
              <div style={{fontSize:13,color:theme.text,opacity:.8,lineHeight:1.6,paddingLeft:51,marginBottom:6}}>
                {isAr ? cfg.msg_ar : cfg.msg_en}
              </div>
              {cfg.fix_en && (
                <div style={{fontSize:12,fontWeight:700,color:theme.text,paddingLeft:51,lineHeight:1.5,
                  borderTop:"1px solid "+theme.border+"33",paddingTop:7}}>
                  👉 {isAr ? cfg.fix_ar : cfg.fix_en}
                </div>
              )}
              {cfg.autoFix && (
                <div style={{fontSize:10,color:theme.text,opacity:.45,paddingLeft:51,marginTop:5}}>
                  {isAr ? "⟳ سيختفي هذا التنبيه تلقائياً عند حل المشكلة" : "⟳ Dismisses automatically when resolved."}
                </div>
              )}
              {(
                <div style={{height:2,background:theme.border+"22",borderRadius:1,marginTop:10,overflow:"hidden"}}>
                  <div style={{height:"100%",background:theme.border,borderRadius:1,animation:"procShrink 7s linear forwards"}}/>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Status pills */}
      <div style={{position:"fixed",bottom:80,left:10,zIndex:300,pointerEvents:"none",
        background:"rgba(0,0,0,.75)",backdropFilter:"blur(8px)",borderRadius:20,
        padding:"5px 10px 5px 7px",border:"1px solid "+statusColor+"44",
        display:"flex",alignItems:"center",gap:6,fontSize:10,color:statusColor,fontWeight:700,letterSpacing:.5}}>
        <div style={{width:6,height:6,borderRadius:"50%",background:statusColor,
          animation:suspicionLevel!=="low"?"procPulse 1s infinite":"none"}}/>
        {{low:"SECURE",medium:"CAUTION",high:"WARNING",critical:"CRITICAL"}[suspicionLevel]||"SECURE"}
        {pointsLost > 0 && <span style={{color:"#ef4444",marginLeft:4}}>−{pointsLost}pts</span>}
      </div>
      <div style={{position:"fixed",bottom:80,right:10,zIndex:300,pointerEvents:"none",
        background:"rgba(0,0,0,.75)",backdropFilter:"blur(8px)",borderRadius:20,
        padding:"5px 10px",border:"1px solid "+(cameraReady?"#22c55e44":"#ef444444"),
        display:"flex",alignItems:"center",gap:5,
        fontSize:10,color:cameraReady?"#22c55e":"#ef4444",fontWeight:700}}>
        <Camera style={{width:10,height:10}}/>
        {!cameraReady ? "📷 Camera Off" : !faceDetected ? "👤 No Face!" : "Face ✓"}
      </div>

      <style>{`
        @keyframes procBannerIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes procShrink{from{width:100%}to{width:0}}
        @keyframes procPulse{0%,100%{opacity:1}50%{opacity:.2}}
        @keyframes procBorderPulse{0%,100%{opacity:.4}50%{opacity:1}}
      `}</style>
    </>
  );
};

export default ProctoringOverlay;

