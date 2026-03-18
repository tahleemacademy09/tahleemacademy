/*  src/components/exam/ProctoringOverlay.tsx  */
import { useEffect, useState, useRef, useCallback } from "react";
import { Shield, ShieldAlert, ShieldCheck, Camera, CameraOff,
  Eye, EyeOff, AlertTriangle, Activity, X, Minus, Users } from "lucide-react";
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

// All violation types with severity and point deduction
const VIOLATION_CONFIG: Record<string, {
  en: string; ar: string;
  severity: "low"|"medium"|"high"|"critical";
  points: number; icon: string;
}> = {
  tab_switch:        { en:"Left exam window",          ar:"غادرت نافذة الامتحان",      severity:"high",     points:5,  icon:"🚪" },
  fullscreen_exit:   { en:"Exited fullscreen",          ar:"خرجت من وضع ملء الشاشة",   severity:"medium",   points:3,  icon:"⬜" },
  webcam_disabled:   { en:"Camera disconnected",        ar:"الكاميرا مفصولة",           severity:"critical", points:10, icon:"📷" },
  copy_paste:        { en:"Copy/Paste attempted",       ar:"محاولة نسخ/لصق",            severity:"high",     points:5,  icon:"📋" },
  dev_tools:         { en:"DevTools opened",            ar:"فتح أدوات المطور",           severity:"critical", points:10, icon:"🔧" },
  right_click:       { en:"Right-click detected",      ar:"نقر بالزر الأيمن",           severity:"low",      points:1,  icon:"🖱️" },
  face_not_detected: { en:"Face not visible",          ar:"الوجه غير مرئي",             severity:"high",     points:5,  icon:"👤" },
  multiple_faces:    { en:"Multiple people detected",  ar:"أكثر من شخص في الإطار",      severity:"critical", points:10, icon:"👥" },
  looking_away:      { en:"Looking away from screen",  ar:"النظر بعيداً عن الشاشة",    severity:"medium",   points:3,  icon:"👀" },
  unusual_audio:     { en:"Background noise detected", ar:"ضجيج في الخلفية",            severity:"low",      points:2,  icon:"🎙️" },
};

const SEVERITY_COLORS = {
  low:      { bg:"#fffbeb", border:"#f59e0b", text:"#92400e", bar:"#f59e0b" },
  medium:   { bg:"#fff7ed", border:"#f97316", text:"#7c2d12", bar:"#f97316" },
  high:     { bg:"#fef2f2", border:"#ef4444", text:"#7f1d1d", bar:"#ef4444" },
  critical: { bg:"#1a0000", border:"#dc2626", text:"#ffffff", bar:"#dc2626" },
};

const ProctoringOverlay = ({
  cameraReady, faceDetected, integrityScore, suspicionLevel,
  strikes, maxStrikes, violations, lastWarningType,
  audioMonitoring, recentViolations, getStream,
  attemptId, onPointDeduction,
}: Props) => {
  const { t } = useLanguage();
  const videoRef      = useRef<HTMLVideoElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const detectorRef   = useRef<any>(null);
  const detectIv      = useRef<any>(null);
  const noFaceTimer   = useRef<any>(null);
  const warnCooldown  = useRef(false);
  const [showLog, setShowLog]           = useState(false);
  const [banner, setBanner]             = useState<any>(null);
  const [autoCountdown, setAutoCountdown] = useState<number|null>(null);
  const [localFace, setLocalFace]       = useState(true);
  const [faceCount, setFaceCount]       = useState(1);
  const [pointsLost, setPointsLost]     = useState(0);
  const [liveFeed, setLiveFeed]         = useState<string[]>([]);

  // Attach stream to hidden video
  useEffect(() => {
    const stream = getStream();
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraReady, getStream]);

  // Add live feed message
  const addFeed = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" });
    setLiveFeed(prev => [`${time} — ${msg}`, ...prev].slice(0, 20));
  }, []);

  // Trigger banner warning
  const triggerWarning = useCallback((type: string) => {
    if (warnCooldown.current) return;
    const cfg = VIOLATION_CONFIG[type];
    if (!cfg) return;
    warnCooldown.current = true;
    setBanner({ type, cfg, time: new Date().toLocaleTimeString() });
    onPointDeduction(cfg.points, cfg.en);
    setPointsLost(p => p + cfg.points);
    addFeed(`${cfg.icon} ${cfg.en} — −${cfg.points} pts`);
    setTimeout(() => { warnCooldown.current = false; }, 8000);
    setTimeout(() => setBanner(null), 6000);
  }, [onPointDeduction, addFeed]);

  // Face detection
  const detectFaces = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    // Try FaceDetector API first
    if ("FaceDetector" in window && !detectorRef.current) {
      try { detectorRef.current = new (window as any).FaceDetector({ fastMode: false, maxDetectedFaces: 5 }); }
      catch (_) { detectorRef.current = null; }
    }
    if (detectorRef.current) {
      try {
        const faces = await detectorRef.current.detect(video);
        const count = faces.length;
        setFaceCount(count);
        setLocalFace(count >= 1);
        if (count === 0) { startNoFaceTimer(); }
        else { clearNoFaceTimer(); }
        if (count > 1) { triggerWarning("multiple_faces"); addFeed("👥 Multiple faces detected!"); }
        return;
      } catch (_) {}
    }

    // Canvas skin-tone fallback
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data  = frame.data;
      let skin = 0;
      const total = data.length / 4;
      for (let i = 0; i < data.length; i += 32) {
        const r = data[i], g = data[i+1], b = data[i+2];
        if (r > 60 && g > 40 && b > 20 && r > g && r > b && r - g > 15 && r < 250) skin++;
      }
      const ratio = skin / (total / 8);
      const detected = ratio > 0.03;
      setLocalFace(detected);
      setFaceCount(detected ? 1 : 0);
      if (!detected) startNoFaceTimer();
      else clearNoFaceTimer();
    } catch (_) {}
  }, [triggerWarning, addFeed]);

  const startNoFaceTimer = useCallback(() => {
    if (noFaceTimer.current) return;
    noFaceTimer.current = setTimeout(() => {
      triggerWarning("face_not_detected");
      addFeed("👤 Face not visible in camera");
      noFaceTimer.current = null;
    }, 4000);
  }, [triggerWarning, addFeed]);

  const clearNoFaceTimer = useCallback(() => {
    if (noFaceTimer.current) { clearTimeout(noFaceTimer.current); noFaceTimer.current = null; }
  }, []);

  useEffect(() => {
    if (!cameraReady) return;
    detectIv.current = setInterval(detectFaces, 2500);
    return () => { clearInterval(detectIv.current); clearNoFaceTimer(); };
  }, [cameraReady, detectFaces, clearNoFaceTimer]);

  // Violations from proctoring hook
  useEffect(() => {
    if (!lastWarningType) return;
    triggerWarning(lastWarningType);
  }, [lastWarningType, violations]);

  // Auto-submit countdown
  useEffect(() => {
    if (suspicionLevel === "critical" && strikes >= maxStrikes - 1) {
      let c = 10; setAutoCountdown(c);
      const iv = setInterval(() => { c--; setAutoCountdown(c); if (c <= 0) clearInterval(iv); }, 1000);
      return () => clearInterval(iv);
    } else { setAutoCountdown(null); }
  }, [suspicionLevel, strikes, maxStrikes]);

  // Log to DB
  useEffect(() => {
    if (!lastWarningType || !attemptId) return;
    const cfg = VIOLATION_CONFIG[lastWarningType];
    supabase.from("proctoring_logs" as any).insert({
      attempt_id: attemptId, violation_type: lastWarningType,
      severity: cfg?.severity || "medium", points_deducted: cfg?.points || 0,
      detected_at: new Date().toISOString(),
    }).then(() => {});
  }, [lastWarningType, violations, attemptId]);

  const scoreColor = integrityScore >= 80 ? "#22c55e" : integrityScore >= 60 ? "#f59e0b" : "#EF4444";
  const scoreBg    = integrityScore >= 80 ? "#f0fff4" : integrityScore >= 60 ? "#fffbeb" : "#fff5f5";
  const statusLabel = { low:"SECURE", medium:"CAUTION", high:"WARNING", critical:"CRITICAL" }[suspicionLevel] || "SECURE";
  const statusColor = { low:"#22c55e", medium:"#f59e0b", high:"#ef4444", critical:"#dc2626" }[suspicionLevel] || "#22c55e";

  const bannerCfg = banner ? SEVERITY_COLORS[banner.cfg.severity] : null;

  return (
    <>
      {/* Hidden video + canvas */}
      <video ref={videoRef} muted playsInline
        style={{ position:"fixed", width:1, height:1, opacity:0, pointerEvents:"none", top:0, left:0 }} />
      <canvas ref={canvasRef} style={{ display:"none" }} />

      {/* Auto-submit full-screen overlay */}
      {autoCountdown !== null && autoCountdown > 0 && (
        <div style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(0,0,0,.92)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20 }}>
          <ShieldAlert style={{ width:72, height:72, color:"#dc2626" }} />
          <div style={{ fontSize:26, fontWeight:900, color:"#fff", textAlign:"center" }}>🚨 Multiple Violations Detected</div>
          <div style={{ fontSize:16, color:"rgba(255,255,255,.7)", textAlign:"center" }}>Your exam will auto-submit in</div>
          <div style={{ fontSize:88, fontWeight:900, color:"#dc2626", fontVariantNumeric:"tabular-nums", lineHeight:1 }}>{autoCountdown}</div>
          <div style={{ fontSize:13, color:"rgba(255,255,255,.4)" }}>seconds</div>
        </div>
      )}

      {/* Banner warning */}
      {banner && bannerCfg && (
        <div style={{
          position:"fixed", top:56, left:"50%", transform:"translateX(-50%)",
          zIndex:500, maxWidth:480, width:"calc(100% - 24px)",
          background: banner.cfg.severity === "critical" ? "linear-gradient(135deg,#7f1d1d,#991b1b)" : bannerCfg.bg,
          border:`2px solid ${bannerCfg.border}`,
          borderRadius:16, padding:"16px 18px",
          boxShadow:`0 8px 32px rgba(0,0,0,.3), 0 0 0 2px ${bannerCfg.border}44`,
          animation:"bannerIn .3s ease",
        }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:`${bannerCfg.border}22`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
              {banner.cfg.icon}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                <span style={{ fontSize:13, fontWeight:900, color:bannerCfg.text, letterSpacing:.5 }}>
                  ⚠️ PROCTORING ALERT
                </span>
                <span style={{ fontSize:11, color:bannerCfg.text, opacity:.7, background:`${bannerCfg.border}22`, borderRadius:10, padding:"2px 8px" }}>
                  −{banner.cfg.points} pts
                </span>
              </div>
              <div style={{ fontSize:15, fontWeight:700, color:bannerCfg.text, marginBottom:2 }}>
                {t(banner.cfg.en, banner.cfg.ar)}
              </div>
              <div style={{ fontSize:11, color:bannerCfg.text, opacity:.7 }}>
                This violation has been recorded and sent to your instructor.
              </div>
            </div>
            <button onClick={() => setBanner(null)} style={{ background:"none", border:"none", color:bannerCfg.text, cursor:"pointer", opacity:.6, padding:2, flexShrink:0 }}>
              <X style={{ width:16, height:16 }} />
            </button>
          </div>
          {/* Countdown bar */}
          <div style={{ height:3, background:`${bannerCfg.border}33`, borderRadius:2, marginTop:12, overflow:"hidden" }}>
            <div style={{ height:"100%", background:bannerCfg.border, borderRadius:2, animation:"shrinkBar 6s linear forwards" }} />
          </div>
        </div>
      )}

      {/* TOP-LEFT: Integrity score + camera preview */}
      <div style={{ position:"fixed", top:58, left:8, zIndex:200, display:"flex", flexDirection:"column", gap:6 }}>
        {/* Integrity score card */}
        <div style={{ background:"rgba(0,0,0,.85)", backdropFilter:"blur(10px)", borderRadius:14, padding:"10px 12px", border:`1px solid rgba(255,255,255,.1)`, minWidth:150 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:5 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:statusColor, boxShadow:`0 0 6px ${statusColor}` }} />
              <span style={{ fontSize:9, fontWeight:900, color:statusColor, letterSpacing:1.5 }}>{statusLabel}</span>
            </div>
            <button onClick={() => setShowLog(v => !v)} style={{ background:"none", border:"none", color:"rgba(255,255,255,.5)", cursor:"pointer", position:"relative", padding:0 }}>
              <Activity style={{ width:12, height:12 }} />
              {violations > 0 && <span style={{ position:"absolute", top:-3, right:-3, width:12, height:12, borderRadius:"50%", background:"#dc2626", color:"#fff", fontSize:7, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900 }}>{violations > 9 ? "9+" : violations}</span>}
            </button>
          </div>
          {/* Score ring */}
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ position:"relative", width:44, height:44, flexShrink:0 }}>
              <svg width={44} height={44} style={{ transform:"rotate(-90deg)" }}>
                <circle cx={22} cy={22} r={18} stroke="rgba(255,255,255,.1)" strokeWidth={4} fill="none" />
                <circle cx={22} cy={22} r={18} stroke={scoreColor} strokeWidth={4} fill="none"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 18}
                  strokeDashoffset={2 * Math.PI * 18 * (1 - integrityScore / 100)} />
              </svg>
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontSize:10, fontWeight:900, color:scoreColor }}>{Math.round(integrityScore)}</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize:9, color:"rgba(255,255,255,.4)", marginBottom:3 }}>INTEGRITY</div>
              {/* Strikes */}
              <div style={{ display:"flex", gap:3 }}>
                {Array.from({ length: maxStrikes }, (_, i) => (
                  <div key={i} style={{ width:10, height:10, borderRadius:3, background:i < strikes ? "#dc2626" : "rgba(255,255,255,.15)", border:`1px solid ${i < strikes ? "#dc2626" : "rgba(255,255,255,.1)"}` }} />
                ))}
              </div>
              {pointsLost > 0 && <div style={{ fontSize:9, color:"#ef4444", marginTop:3, fontWeight:700 }}>−{pointsLost} pts lost</div>}
            </div>
          </div>
          {/* Sensor status row */}
          <div style={{ display:"flex", gap:6, marginTop:8, paddingTop:8, borderTop:"1px solid rgba(255,255,255,.08)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:3, fontSize:9, color:cameraReady ? "#22c55e" : "#ef4444" }}>
              {cameraReady ? <Camera style={{ width:10, height:10 }} /> : <CameraOff style={{ width:10, height:10 }} />}
              <span>{cameraReady ? "CAM" : "NO CAM"}</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:3, fontSize:9, color:localFace ? "#22c55e" : "#ef4444" }}>
              {localFace ? <Eye style={{ width:10, height:10 }} /> : <EyeOff style={{ width:10, height:10 }} />}
              <span>{localFace ? (faceCount > 1 ? `${faceCount} FACES!` : "FACE OK") : "NO FACE"}</span>
            </div>
          </div>
        </div>

        {/* Camera preview */}
        {cameraReady && (
          <div style={{
            width:120, height:90, borderRadius:12, overflow:"hidden",
            border:`2px solid ${localFace ? "#22c55e" : "#ef4444"}`,
            boxShadow:`0 4px 16px rgba(0,0,0,.5), 0 0 0 2px ${localFace ? "rgba(34,197,94,.25)" : "rgba(239,68,68,.25)"}`,
            position:"relative", background:"#000",
          }}>
            <video ref={videoRef as any} muted playsInline
              style={{ width:"100%", height:"100%", objectFit:"cover", transform:"scaleX(-1)", display:"none" }} />
            {/* We use a separate video element for display */}
            <video id="proctor-display-video" muted playsInline autoPlay
              style={{ width:"100%", height:"100%", objectFit:"cover", transform:"scaleX(-1)" }} />
            {/* Status overlay */}
            <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"rgba(0,0,0,.5)", padding:"3px 6px", display:"flex", alignItems:"center", gap:4 }}>
              <div style={{ width:5, height:5, borderRadius:"50%", background:localFace ? "#22c55e" : "#ef4444", animation:"pulse 1.5s infinite" }} />
              <span style={{ fontSize:8, color:"#fff", fontWeight:700 }}>{localFace ? "MONITORED" : "FACE MISSING"}</span>
            </div>
          </div>
        )}
      </div>

      {/* Activity log */}
      {showLog && (
        <div style={{ position:"fixed", top:58, right:8, zIndex:300, width:260, maxHeight:280, background:"rgba(10,10,10,.96)", borderRadius:14, border:"1px solid rgba(255,255,255,.1)", boxShadow:"0 8px 32px rgba(0,0,0,.5)", overflow:"hidden", display:"flex", flexDirection:"column" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderBottom:"1px solid rgba(255,255,255,.08)" }}>
            <Shield style={{ width:14, height:14, color:"#22c55e" }} />
            <span style={{ fontSize:12, fontWeight:700, color:"#fff", flex:1 }}>Live Activity</span>
            <span style={{ fontSize:10, color:"rgba(255,255,255,.4)" }}>{violations} events</span>
            <button onClick={() => setShowLog(false)} style={{ background:"none", border:"none", color:"rgba(255,255,255,.5)", cursor:"pointer" }}><X style={{ width:12, height:12 }} /></button>
          </div>
          <div style={{ flex:1, overflowY:"auto" }}>
            {liveFeed.length === 0 ? (
              <div style={{ padding:"20px 12px", textAlign:"center" }}>
                <ShieldCheck style={{ width:20, height:20, color:"#22c55e", margin:"0 auto 6px" }} />
                <p style={{ fontSize:11, color:"rgba(255,255,255,.4)" }}>No violations detected</p>
              </div>
            ) : liveFeed.map((msg, i) => (
              <div key={i} style={{ padding:"6px 12px", borderBottom:"1px solid rgba(255,255,255,.04)", fontSize:10, color:i === 0 ? "#fca5a5" : "rgba(255,255,255,.5)", fontFamily:"monospace" }}>
                {msg}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes bannerIn { from{opacity:0;transform:translate(-50%,-14px)} to{opacity:1;transform:translate(-50%,0)} }
        @keyframes shrinkBar { from{width:100%} to{width:0%} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
      `}</style>
    </>
  );
};

// Attach display video separately
export const attachDisplayVideo = (stream: MediaStream | null) => {
  if (!stream) return;
  const el = document.getElementById("proctor-display-video") as HTMLVideoElement;
  if (el && !el.srcObject) { el.srcObject = stream; el.play().catch(() => {}); }
};

export default ProctoringOverlay;
