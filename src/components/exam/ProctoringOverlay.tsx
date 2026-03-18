/*  src/components/exam/ProctoringOverlay.tsx
    Real face detection using FaceDetector API + canvas fallback
    No camera preview shown to student
*/
import { useEffect, useState, useRef, useCallback } from "react";
import { ShieldAlert, ShieldCheck, Activity, AlertTriangle, Eye, EyeOff, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface ViolationEntry { type: string; time: string; details: string; }
interface ProctoringOverlayProps {
  cameraReady: boolean; faceDetected: boolean; integrityScore: number;
  suspicionLevel: string; strikes: number; maxStrikes: number;
  violations: number; lastWarningType: string | null;
  audioMonitoring: boolean; recentViolations: ViolationEntry[];
  getStream: () => MediaStream | null;
  onFaceUpdate?: (detected: boolean, count: number) => void;
}

const WARNINGS: Record<string, { en: string; ar: string; sev: "warn"|"danger"|"critical" }> = {
  tab_switch:        { en:"⚠️ You left the exam window! This has been recorded.", ar:"⚠️ غادرت نافذة الامتحان! تم تسجيل ذلك.", sev:"warn" },
  fullscreen_exit:   { en:"⚠️ Return to fullscreen immediately!", ar:"⚠️ عُد إلى ملء الشاشة فوراً!", sev:"warn" },
  webcam_disabled:   { en:"🚨 Camera disconnected — enable it now!", ar:"🚨 الكاميرا مفصولة — فعّلها الآن!", sev:"danger" },
  copy_paste:        { en:"🚫 Copy/Paste is not allowed.", ar:"🚫 النسخ واللصق غير مسموح.", sev:"warn" },
  dev_tools:         { en:"🚫 Developer tools are not allowed.", ar:"🚫 أدوات المطور محظورة.", sev:"danger" },
  right_click:       { en:"🚫 Right-click is disabled.", ar:"🚫 النقر الأيمن معطل.", sev:"warn" },
  face_not_detected: { en:"👁️ FACE NOT VISIBLE — Look at your screen now!", ar:"👁️ وجهك غير مرئي — انظر إلى شاشتك الآن!", sev:"danger" },
  multiple_faces:    { en:"🚨 Multiple people detected! Only you should be in frame.", ar:"🚨 تم اكتشاف أكثر من شخص! يجب أن تكون وحدك.", sev:"critical" },
  looking_away:      { en:"👁️ Please look directly at your screen.", ar:"👁️ يرجى النظر مباشرة إلى شاشتك.", sev:"warn" },
  unusual_audio:     { en:"🎙️ Unusual audio detected.", ar:"🎙️ صوت غير معتاد.", sev:"warn" },
};

const VLABELS: Record<string, string> = {
  tab_switch:"Tab Switch", fullscreen_exit:"Fullscreen Exit",
  webcam_disabled:"Camera Off", copy_paste:"Copy/Paste",
  dev_tools:"Dev Tools", right_click:"Right Click",
  face_not_detected:"No Face", multiple_faces:"Multi-Face",
  looking_away:"Looking Away", unusual_audio:"Audio Alert",
  tab_switch_return:"Tab Return",
};

const ProctoringOverlay = ({
  cameraReady, faceDetected, integrityScore, suspicionLevel,
  strikes, maxStrikes, violations, lastWarningType,
  audioMonitoring, recentViolations, getStream, onFaceUpdate,
}: ProctoringOverlayProps) => {
  const { t } = useLanguage();
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);

  const [showLog, setShowLog]           = useState(false);
  const [warning, setWarning]           = useState<{text:string;sev:string}|null>(null);
  const [autoSubmitIn, setAutoSubmit]   = useState<number|null>(null);
  const [localFaceOk, setLocalFaceOk]   = useState(true);
  const [faceCount, setFaceCount]       = useState(0);
  const [camExpanded, setCamExpanded]   = useState(false);
  const noFaceTimerRef = useRef<any>(null);
  const warningCooldownRef = useRef(false);

  // ── Setup video stream for face detection (hidden, not shown to user) ──
  useEffect(() => {
    const stream = getStream();
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(()=>{});
    }
  }, [cameraReady, getStream]);

  // ── Real face detection using FaceDetector API or canvas fallback ──
  const detectFaces = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    // Method 1: FaceDetector API (Chrome 70+)
    if ("FaceDetector" in window && !detectorRef.current) {
      try {
        detectorRef.current = new (window as any).FaceDetector({
          fastMode: false,
          maxDetectedFaces: 5,
        });
      } catch (_) { detectorRef.current = null; }
    }

    if (detectorRef.current) {
      try {
        const faces = await detectorRef.current.detect(video);
        const count = faces.length;
        setFaceCount(count);
        const detected = count >= 1;
        const multi    = count > 1;
        setLocalFaceOk(detected);
        if (onFaceUpdate) onFaceUpdate(detected, count);

        if (!detected) triggerFaceWarning();
        else if (multi) triggerMultiFaceWarning();
        else clearFaceWarning();
        return;
      } catch (_) { /* fall through to canvas method */ }
    }

    // Method 2: Canvas-based skin tone / motion detection
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width  = video.videoWidth  || 320;
    canvas.height = video.videoHeight || 240;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const frame   = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data    = frame.data;
      let skinPixels = 0;
      const total   = data.length / 4;

      // Sample every 8th pixel for performance
      for (let i = 0; i < data.length; i += 32) {
        const r = data[i], g = data[i+1], b = data[i+2];
        // Skin tone detection using RGB ranges
        if (
          r > 60 && g > 40 && b > 20 &&
          r > g && r > b &&
          r - g > 15 &&
          Math.abs(r - g) > 15 &&
          r < 250 && g < 220 && b < 200 &&
          // Ycbcr-like check
          (0.299*r + 0.587*g + 0.114*b) > 60
        ) { skinPixels++; }
      }

      const skinRatio = skinPixels / (total / 8);
      const detected  = skinRatio > 0.03; // At least 3% skin pixels
      setLocalFaceOk(detected);
      setFaceCount(detected ? 1 : 0);
      if (onFaceUpdate) onFaceUpdate(detected, detected ? 1 : 0);
      if (!detected) triggerFaceWarning();
      else clearFaceWarning();
    } catch (_) {}
  }, [onFaceUpdate]);

  const triggerFaceWarning = useCallback(() => {
    if (noFaceTimerRef.current) return;
    // Give 3 seconds grace before warning
    noFaceTimerRef.current = setTimeout(() => {
      if (!warningCooldownRef.current) {
        setWarning({ text: t("👁️ FACE NOT VISIBLE — Look at your screen now!", "👁️ وجهك غير مرئي — انظر إلى شاشتك الآن!"), sev:"danger" });
        warningCooldownRef.current = true;
        setTimeout(() => { warningCooldownRef.current = false; }, 8000);
      }
    }, 3000);
  }, [t]);

  const triggerMultiFaceWarning = useCallback(() => {
    if (!warningCooldownRef.current) {
      setWarning({ text: t("🚨 Multiple people detected! Only you should be visible.", "🚨 تم اكتشاف أكثر من شخص! يجب أن تكون وحدك."), sev:"critical" });
      warningCooldownRef.current = true;
      setTimeout(() => { warningCooldownRef.current = false; }, 8000);
    }
  }, [t]);

  const clearFaceWarning = useCallback(() => {
    if (noFaceTimerRef.current) {
      clearTimeout(noFaceTimerRef.current);
      noFaceTimerRef.current = null;
    }
  }, []);

  // Run face detection every 2 seconds
  useEffect(() => {
    if (!cameraReady) return;
    intervalRef.current = setInterval(detectFaces, 2000);
    return () => {
      clearInterval(intervalRef.current);
      if (noFaceTimerRef.current) clearTimeout(noFaceTimerRef.current);
    };
  }, [cameraReady, detectFaces]);

  // Show warning when violation occurs from proctoring hook
  useEffect(() => {
    if (!lastWarningType) return;
    const w = WARNINGS[lastWarningType];
    if (w) {
      setWarning({ text: t(w.en, w.ar), sev: w.sev });
      const timer = setTimeout(() => setWarning(null), 7000);
      return () => clearTimeout(timer);
    }
  }, [lastWarningType, violations]);

  // Auto-submit countdown
  useEffect(() => {
    if (suspicionLevel === "critical" && strikes >= maxStrikes - 1) {
      let c = 10; setAutoSubmit(c);
      const iv = setInterval(() => { c--; setAutoSubmit(c); if (c<=0) clearInterval(iv); }, 1000);
      return () => clearInterval(iv);
    } else { setAutoSubmit(null); }
  }, [suspicionLevel, strikes, maxStrikes]);

  const statusColor = { low:"#22c55e", medium:"#f59e0b", high:"#EF4444", critical:"#7f1d1d" }[suspicionLevel] || "#22c55e";
  const statusLabel = { low:"SECURE", medium:"CAUTION", high:"WARNING", critical:"CRITICAL" }[suspicionLevel] || "SECURE";
  const warnBg = warning?.sev==="critical"?"rgba(127,29,29,.97)":warning?.sev==="danger"?"rgba(185,28,28,.95)":"rgba(120,53,15,.93)";

  return (
    <>
      {/* Hidden video + canvas for face detection only */}
      <video ref={videoRef} muted playsInline style={{ position:"absolute", width:1, height:1, opacity:0, pointerEvents:"none" }} />
      <canvas ref={canvasRef} style={{ display:"none" }} />

      {/* Auto-submit countdown */}
      {autoSubmitIn !== null && autoSubmitIn > 0 && (
        <div style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,.9)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
          <ShieldAlert style={{ width:60, height:60, color:"#EF4444" }} />
          <div style={{ fontSize:22, fontWeight:900, color:"#fff" }}>🚨 Too Many Violations!</div>
          <div style={{ fontSize:15, color:"rgba(255,255,255,.7)" }}>Exam auto-submitting in</div>
          <div style={{ fontSize:80, fontWeight:900, color:"#EF4444", fontVariantNumeric:"tabular-nums" }}>{autoSubmitIn}</div>
        </div>
      )}

      {/* Warning toast */}
      {warning && (
        <div style={{ position:"fixed", top:60, left:"50%", transform:"translateX(-50%)", zIndex:150,
          maxWidth:400, width:"calc(100% - 24px)", background:warnBg, borderRadius:14,
          padding:"14px 16px", boxShadow:"0 8px 32px rgba(0,0,0,.5)",
          display:"flex", alignItems:"center", gap:10, animation:"slideDown .3s ease" }}>
          <ShieldAlert style={{ width:20, height:20, color:"#fff", flexShrink:0 }} />
          <p style={{ fontSize:14, fontWeight:700, color:"#fff", flex:1, lineHeight:1.4 }}>{warning.text}</p>
          <button onClick={()=>setWarning(null)} style={{ background:"none", border:"none", color:"rgba(255,255,255,.7)", cursor:"pointer" }}>
            <X style={{ width:14, height:14 }} />
          </button>
        </div>
      )}

      {/* Top-right status bar — compact, doesn't overlap content */}
      <div style={{ position:"fixed", top:60, right:8, zIndex:100, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:7, background:"rgba(0,0,0,.75)", backdropFilter:"blur(8px)", borderRadius:24, padding:"5px 12px", border:`1px solid ${statusColor}44` }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:statusColor }} />
          <span style={{ fontSize:9, fontWeight:800, color:statusColor, letterSpacing:1 }}>{statusLabel}</span>
          {localFaceOk
            ? <Eye style={{ width:12, height:12, color:"#22c55e" }} />
            : <EyeOff style={{ width:12, height:12, color:"#EF4444" }} />}
          <span style={{ fontSize:10, fontWeight:700, color:"#fff", borderLeft:"1px solid rgba(255,255,255,.2)", paddingLeft:7 }}>
            {Math.round(integrityScore)}%
          </span>
          <div style={{ display:"flex", gap:3, borderLeft:"1px solid rgba(255,255,255,.2)", paddingLeft:7 }}>
            {Array.from({length:maxStrikes},(_,i)=>(
              <div key={i} style={{ width:7, height:7, borderRadius:"50%", background:i<strikes?"#EF4444":"rgba(255,255,255,.2)" }} />
            ))}
          </div>
          <button onClick={()=>setShowLog(v=>!v)} style={{ position:"relative", background:"none", border:"none", color:"rgba(255,255,255,.6)", cursor:"pointer", padding:0 }}>
            <Activity style={{ width:12, height:12 }} />
            {violations>0 && <span style={{ position:"absolute", top:-4, right:-4, width:13, height:13, borderRadius:"50%", background:"#EF4444", color:"#fff", fontSize:8, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700 }}>{violations>9?"9+":violations}</span>}
          </button>
        </div>

        {/* Log dropdown */}
        {showLog && (
          <div style={{ width:260, maxHeight:220, overflowY:"auto", background:"rgba(10,10,10,.95)", borderRadius:12, border:"1px solid rgba(255,255,255,.1)", boxShadow:"0 8px 24px rgba(0,0,0,.5)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 12px", borderBottom:"1px solid rgba(255,255,255,.08)" }}>
              <Activity style={{ width:13, height:13, color:"#7a9e88" }} />
              <span style={{ fontSize:11, fontWeight:700, color:"#fff", flex:1 }}>Proctoring Log</span>
              <span style={{ fontSize:10, color:"rgba(255,255,255,.4)" }}>{violations}</span>
            </div>
            {recentViolations.length===0 ? (
              <div style={{ padding:"18px 12px", textAlign:"center" }}>
                <ShieldCheck style={{ width:22, height:22, color:"#22c55e", margin:"0 auto 6px" }} />
                <p style={{ fontSize:12, color:"rgba(255,255,255,.5)" }}>No suspicious activity</p>
              </div>
            ) : recentViolations.map((v,i)=>(
              <div key={i} style={{ display:"flex", gap:7, padding:"7px 12px", borderBottom:"1px solid rgba(255,255,255,.05)" }}>
                <AlertTriangle style={{ width:11, height:11, color:"#EF4444", flexShrink:0, marginTop:2 }} />
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:11, fontWeight:600, color:"#fff" }}>{VLABELS[v.type]||v.type}</span>
                    <span style={{ fontSize:9, color:"rgba(255,255,255,.4)", fontFamily:"monospace" }}>{v.time}</span>
                  </div>
                  {v.details&&<p style={{ fontSize:10, color:"rgba(255,255,255,.4)", marginTop:1 }}>{v.details}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes slideDown{from{opacity:0;transform:translate(-50%,-12px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>

      {/* Webcam preview — bottom RIGHT so it doesn't overlap content */}
      {cameraReady && (
        <div style={{
          position:"fixed", bottom:50, right:8, zIndex:100,
          borderRadius: camExpanded?12:50, overflow:"hidden",
          width: camExpanded?140:46, height: camExpanded?105:46,
          transition:"all .3s ease",
          border:`2px solid ${localFaceOk?"#22c55e":"#EF4444"}`,
          boxShadow:`0 3px 12px rgba(0,0,0,.4)`,
          cursor:"pointer",
        }} onClick={()=>setCamExpanded(v=>!v)}>
          <video ref={videoRef} muted playsInline
            style={{ width:"100%", height:"100%", objectFit:"cover", transform:"scaleX(-1)" }} />
          {!localFaceOk && (
            <div style={{ position:"absolute", inset:0, background:"rgba(239,68,68,.3)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <EyeOff style={{ width:14, height:14, color:"#fff" }} />
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default ProctoringOverlay;
