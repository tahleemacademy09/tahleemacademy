/*  src/components/exam/ProctoringOverlay.tsx
    Advanced proctoring with webcam preview, aggressive warnings,
    multi-face detection, eye tracking, auto-submit countdown
*/
import { useEffect, useState, useRef } from "react";
import { ShieldAlert, ShieldCheck, Mic, Eye, EyeOff, Activity,
  AlertTriangle, Camera, CameraOff, X, Clock } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface ViolationEntry { type: string; time: string; details: string; }

interface ProctoringOverlayProps {
  cameraReady: boolean;
  faceDetected: boolean;
  integrityScore: number;
  suspicionLevel: string;
  strikes: number;
  maxStrikes: number;
  violations: number;
  lastWarningType: string | null;
  audioMonitoring: boolean;
  recentViolations: ViolationEntry[];
  getStream: () => MediaStream | null;
}

const WARNINGS: Record<string, { en: string; ar: string; severity: "warn"|"danger"|"critical" }> = {
  tab_switch:        { en: "⚠️ Tab switch detected! This has been recorded.", ar: "⚠️ تم اكتشاف تبديل التبويب! تم تسجيل ذلك.", severity:"warn" },
  fullscreen_exit:   { en: "⚠️ Return to fullscreen immediately!", ar: "⚠️ عُد إلى وضع ملء الشاشة فوراً!", severity:"warn" },
  webcam_disabled:   { en: "🚨 Camera disconnected — re-enable now!", ar: "🚨 الكاميرا مفصولة — أعد تفعيلها الآن!", severity:"danger" },
  copy_paste:        { en: "🚫 Copy/Paste is not allowed.", ar: "🚫 النسخ واللصق غير مسموح.", severity:"warn" },
  unusual_audio:     { en: "🎙️ Unusual audio detected.", ar: "🎙️ تم اكتشاف صوت غير معتاد.", severity:"warn" },
  dev_tools:         { en: "🚫 Developer tools are not allowed.", ar: "🚫 أدوات المطور غير مسموحة.", severity:"danger" },
  right_click:       { en: "🚫 Right-click is disabled.", ar: "🚫 النقر الأيمن معطل.", severity:"warn" },
  face_not_detected: { en: "👁️ Look at the screen! Face not visible.", ar: "👁️ انظر إلى الشاشة! وجهك غير مرئي.", severity:"danger" },
  multiple_faces:    { en: "🚨 Multiple faces detected!", ar: "🚨 تم اكتشاف أكثر من وجه!", severity:"critical" },
  looking_away:      { en: "👁️ Please look at your screen.", ar: "👁️ يرجى النظر إلى شاشتك.", severity:"warn" },
};

const VIOLATION_LABELS: Record<string, string> = {
  tab_switch: "Tab Switch", fullscreen_exit: "Fullscreen Exit",
  webcam_disabled: "Camera Off", copy_paste: "Copy/Paste",
  unusual_audio: "Audio Alert", dev_tools: "Dev Tools",
  right_click: "Right Click", face_not_detected: "Face Missing",
  multiple_faces: "Multiple Faces", looking_away: "Looking Away",
  tab_switch_return: "Tab Return",
};

const ProctoringOverlay = ({
  cameraReady, faceDetected, integrityScore, suspicionLevel,
  strikes, maxStrikes, violations, lastWarningType,
  audioMonitoring, recentViolations, getStream,
}: ProctoringOverlayProps) => {
  const { t } = useLanguage();
  const videoRef       = useRef<HTMLVideoElement>(null);
  const [showLog, setShowLog]         = useState(false);
  const [warning, setWarning]         = useState<{text:string;sev:string}|null>(null);
  const [autoSubmitIn, setAutoSubmit] = useState<number|null>(null);
  const [camExpanded, setCamExpanded] = useState(false);

  // Attach webcam stream to video element
  useEffect(() => {
    const stream = getStream();
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(()=>{});
    }
  }, [cameraReady, getStream]);

  // Show warning toast when violation occurs
  useEffect(() => {
    if (!lastWarningType) return;
    const w = WARNINGS[lastWarningType];
    if (w) {
      setWarning({ text: t(w.en, w.ar), sev: w.severity });
      const timer = setTimeout(()=>setWarning(null), 6000);
      return ()=>clearTimeout(timer);
    }
  }, [lastWarningType, violations]);

  // Auto-submit countdown when critical strikes
  useEffect(() => {
    if (suspicionLevel === "critical" && strikes >= maxStrikes - 1) {
      let count = 10;
      setAutoSubmit(count);
      const iv = setInterval(()=>{
        count--;
        setAutoSubmit(count);
        if (count <= 0) clearInterval(iv);
      }, 1000);
      return ()=>clearInterval(iv);
    } else {
      setAutoSubmit(null);
    }
  }, [suspicionLevel, strikes, maxStrikes]);

  const statusColor = {
    low: "#22c55e", medium: "#f59e0b", high: "#EF4444", critical: "#7f1d1d"
  }[suspicionLevel] || "#22c55e";

  const statusLabel = { low:"SECURE", medium:"CAUTION", high:"WARNING", critical:"CRITICAL" }[suspicionLevel] || "SECURE";

  const warnBg = warning?.sev === "critical" ? "rgba(127,29,29,0.97)"
               : warning?.sev === "danger"   ? "rgba(185,28,28,0.95)"
               : "rgba(146,64,14,0.93)";

  return (
    <>
      {/* ── Auto-submit countdown overlay ── */}
      {autoSubmitIn !== null && autoSubmitIn > 0 && (
        <div style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
          <ShieldAlert style={{ width:64, height:64, color:"#EF4444" }} />
          <div style={{ fontSize:24, fontWeight:900, color:"#fff", textAlign:"center" }}>
            🚨 Too Many Violations!
          </div>
          <div style={{ fontSize:16, color:"rgba(255,255,255,.7)", textAlign:"center", maxWidth:360 }}>
            Your exam will be auto-submitted in
          </div>
          <div style={{ fontSize:72, fontWeight:900, color:"#EF4444", fontVariantNumeric:"tabular-nums" }}>
            {autoSubmitIn}
          </div>
          <div style={{ fontSize:13, color:"rgba(255,255,255,.5)" }}>seconds</div>
        </div>
      )}

      {/* ── Warning Toast ── */}
      {warning && (
        <div style={{
          position:"fixed", top:70, left:"50%", transform:"translateX(-50%)",
          zIndex:150, maxWidth:420, width:"calc(100% - 32px)",
          background: warnBg,
          borderRadius:14, padding:"14px 18px",
          boxShadow:"0 8px 32px rgba(0,0,0,.4)",
          display:"flex", alignItems:"center", gap:12,
          animation:"slideDown .3s ease",
        }}>
          <ShieldAlert style={{ width:22, height:22, color:"#fff", flexShrink:0 }} />
          <p style={{ fontSize:14, fontWeight:700, color:"#fff", flex:1 }}>{warning.text}</p>
          <button onClick={()=>setWarning(null)} style={{ background:"none", border:"none", color:"rgba(255,255,255,.7)", cursor:"pointer", padding:2 }}>
            <X style={{ width:14, height:14 }} />
          </button>
        </div>
      )}

      {/* ── Top-right status bar ── */}
      <div style={{ position:"fixed", top:8, right:8, zIndex:100, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>

        {/* Main status pill */}
        <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(0,0,0,0.8)", backdropFilter:"blur(8px)", borderRadius:30, padding:"6px 12px", border:`1px solid ${statusColor}44` }}>
          {/* Status dot */}
          <div style={{ width:8, height:8, borderRadius:"50%", background:statusColor, flexShrink:0 }} />
          <span style={{ fontSize:10, fontWeight:800, color:statusColor, letterSpacing:1 }}>{statusLabel}</span>

          {/* Camera icon */}
          {cameraReady
            ? <Camera style={{ width:13, height:13, color:"#22c55e" }} />
            : <CameraOff style={{ width:13, height:13, color:"#EF4444" }} />}

          {/* Face icon */}
          {faceDetected
            ? <Eye style={{ width:13, height:13, color:"#22c55e" }} />
            : <EyeOff style={{ width:13, height:13, color:"#EF4444" }} />}

          {/* Mic */}
          {audioMonitoring && <Mic style={{ width:13, height:13, color:"#22c55e" }} />}

          {/* Score */}
          <span style={{ fontSize:11, fontWeight:700, color:"#fff", borderLeft:"1px solid rgba(255,255,255,.2)", paddingLeft:8 }}>
            {Math.round(integrityScore)}%
          </span>

          {/* Strikes */}
          <div style={{ display:"flex", gap:3, borderLeft:"1px solid rgba(255,255,255,.2)", paddingLeft:8 }}>
            {Array.from({length:maxStrikes},(_,i)=>(
              <div key={i} style={{ width:8, height:8, borderRadius:"50%", background:i<strikes?"#EF4444":"rgba(255,255,255,.2)" }} />
            ))}
          </div>

          {/* Activity log toggle */}
          <button onClick={()=>setShowLog(v=>!v)} style={{ position:"relative", background:"none", border:"none", color:"rgba(255,255,255,.7)", cursor:"pointer", padding:2 }}>
            <Activity style={{ width:13, height:13 }} />
            {violations>0 && (
              <span style={{ position:"absolute", top:-4, right:-4, width:14, height:14, borderRadius:"50%", background:"#EF4444", color:"#fff", fontSize:8, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700 }}>
                {violations>9?"9+":violations}
              </span>
            )}
          </button>
        </div>

        {/* Elevated suspicion badge */}
        {suspicionLevel !== "low" && (
          <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(239,68,68,.15)", border:"1px solid rgba(239,68,68,.4)", borderRadius:20, padding:"3px 10px" }}>
            <ShieldAlert style={{ width:11, height:11, color:"#EF4444" }} />
            <span style={{ fontSize:10, fontWeight:700, color:"#EF4444" }}>
              {statusLabel} — {strikes}/{maxStrikes} strikes
            </span>
          </div>
        )}

        {/* Activity log dropdown */}
        {showLog && (
          <div style={{ width:280, maxHeight:260, overflowY:"auto", background:"rgba(10,10,10,.95)", backdropFilter:"blur(12px)", borderRadius:12, border:"1px solid rgba(255,255,255,.1)", boxShadow:"0 8px 32px rgba(0,0,0,.5)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderBottom:"1px solid rgba(255,255,255,.08)" }}>
              <Activity style={{ width:14, height:14, color:"#7a9e88" }} />
              <span style={{ fontSize:12, fontWeight:700, color:"#fff", flex:1 }}>Proctoring Log</span>
              <span style={{ fontSize:10, color:"rgba(255,255,255,.4)" }}>{violations} events</span>
            </div>
            {recentViolations.length===0 ? (
              <div style={{ padding:"20px 12px", textAlign:"center" }}>
                <ShieldCheck style={{ width:24, height:24, color:"#22c55e", margin:"0 auto 8px" }} />
                <p style={{ fontSize:12, color:"rgba(255,255,255,.5)" }}>No suspicious activity</p>
              </div>
            ) : recentViolations.map((v,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"8px 12px", borderBottom:"1px solid rgba(255,255,255,.05)" }}>
                <AlertTriangle style={{ width:12, height:12, color:"#EF4444", flexShrink:0, marginTop:2 }} />
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:11, fontWeight:600, color:"#fff" }}>{VIOLATION_LABELS[v.type]||v.type}</span>
                    <span style={{ fontSize:9, color:"rgba(255,255,255,.4)", fontFamily:"monospace" }}>{v.time}</span>
                  </div>
                  {v.details && <p style={{ fontSize:10, color:"rgba(255,255,255,.4)", marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v.details}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Bottom-left webcam preview ── */}
      {cameraReady && (
        <div style={{
          position:"fixed", bottom:72, left:8, zIndex:100,
          borderRadius: camExpanded?12:50,
          overflow:"hidden",
          width: camExpanded?160:56,
          height: camExpanded?120:56,
          transition:"all .3s ease",
          border:`2px solid ${faceDetected?"#22c55e":"#EF4444"}`,
          boxShadow:`0 4px 16px rgba(0,0,0,.5), 0 0 0 2px ${faceDetected?"rgba(34,197,94,.3)":"rgba(239,68,68,.3)"}`,
          cursor:"pointer",
        }} onClick={()=>setCamExpanded(v=>!v)}>
          <video ref={videoRef} muted playsInline
            style={{ width:"100%", height:"100%", objectFit:"cover", transform:"scaleX(-1)" }} />
          {!faceDetected && (
            <div style={{ position:"absolute", inset:0, background:"rgba(239,68,68,.3)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <EyeOff style={{ width:16, height:16, color:"#fff" }} />
            </div>
          )}
          {camExpanded && (
            <div style={{ position:"absolute", bottom:4, left:0, right:0, textAlign:"center" }}>
              <span style={{ fontSize:9, background:"rgba(0,0,0,.6)", color:"#fff", padding:"1px 6px", borderRadius:10 }}>
                {faceDetected?"Face Detected":"No Face"}
              </span>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes slideDown { from{opacity:0;transform:translate(-50%,-10px)} to{opacity:1;transform:translate(-50%,0)} }
      `}</style>
    </>
  );
};

export default ProctoringOverlay;
