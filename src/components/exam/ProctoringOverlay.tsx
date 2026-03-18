/*  src/components/exam/ProctoringOverlay.tsx
    FIXES:
    1. Banner auto-dismisses when student corrects behaviour (face returns = banner gone)
    2. Screenshot prevention via CSS + JS
    3. Face not visible: warning only first time, points deducted on 2nd warning
    4. No camera preview shown to student
*/
import { useEffect, useState, useRef, useCallback } from "react";
import { Shield, ShieldAlert, ShieldCheck, Eye, EyeOff,
  AlertTriangle, Activity, X } from "lucide-react";
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

const VCFG: Record<string, {
  en: string; ar: string;
  sev: "low"|"medium"|"high"|"critical";
  pts: number; icon: string;
  dismissOnFix?: boolean; // banner clears automatically when issue resolved
}> = {
  tab_switch:        { en:"⚠️ You left the exam window!",        ar:"⚠️ غادرت نافذة الامتحان!",       sev:"high",     pts:5,  icon:"🚪" },
  fullscreen_exit:   { en:"⚠️ Return to fullscreen!",            ar:"⚠️ عُد لوضع ملء الشاشة!",        sev:"medium",   pts:3,  icon:"⬜" },
  webcam_disabled:   { en:"🚨 Camera disconnected!",              ar:"🚨 الكاميرا مفصولة!",            sev:"critical", pts:10, icon:"📷" },
  copy_paste:        { en:"🚫 Copy/Paste is not allowed",         ar:"🚫 النسخ واللصق غير مسموح",      sev:"high",     pts:5,  icon:"📋" },
  dev_tools:         { en:"🚫 Developer tools detected!",         ar:"🚫 أدوات المطور محظورة!",         sev:"critical", pts:10, icon:"🔧" },
  right_click:       { en:"🚫 Right-click disabled",              ar:"🚫 النقر الأيمن معطل",            sev:"low",      pts:1,  icon:"🖱️" },
  face_not_detected: { en:"👁️ Look at your screen!",             ar:"👁️ انظر إلى شاشتك!",            sev:"high",     pts:0,  icon:"👤", dismissOnFix:true },
  multiple_faces:    { en:"🚨 Multiple people detected!",         ar:"🚨 أكثر من شخص في الإطار!",      sev:"critical", pts:10, icon:"👥" },
  looking_away:      { en:"👁️ Please focus on your screen",      ar:"👁️ ركز على شاشتك",               sev:"low",      pts:0,  icon:"👀", dismissOnFix:true },
  unusual_audio:     { en:"🎙️ Background noise detected",        ar:"🎙️ ضجيج في الخلفية",             sev:"low",      pts:0,  icon:"🎙️" },
};

const SEV_STYLE: Record<string,{bg:string;border:string;text:string}> = {
  low:      { bg:"#fffbeb", border:"#f59e0b", text:"#92400e" },
  medium:   { bg:"#fff7ed", border:"#f97316", text:"#7c2d12" },
  high:     { bg:"#1a0000", border:"#ef4444", text:"#ffffff" },
  critical: { bg:"#0f0000", border:"#dc2626", text:"#ffffff" },
};

const ProctoringOverlay = ({
  cameraReady, faceDetected, integrityScore, suspicionLevel,
  strikes, maxStrikes, violations, lastWarningType,
  audioMonitoring, recentViolations, getStream,
  attemptId, onPointDeduction,
}: Props) => {
  const { t } = useLanguage();
  const videoRef     = useRef<HTMLVideoElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const detectIv     = useRef<any>(null);
  const noFaceTimer  = useRef<any>(null);
  const warnCooldown = useRef<Record<string,number>>({});
  const faceWarnCount = useRef(0); // track how many face warnings given

  const [showLog, setShowLog]         = useState(false);
  const [banner, setBanner]           = useState<any>(null);
  const [autoCountdown, setAutoCount] = useState<number|null>(null);
  const [localFace, setLocalFace]     = useState(true);
  const [faceCount, setFaceCount]     = useState(1);
  const [pointsLost, setPointsLost]   = useState(0);
  const [liveFeed, setLiveFeed]       = useState<string[]>([]);

  // ── Screenshot prevention ──────────────────────────────────
  useEffect(() => {
    // CSS: blur on print/screenshot attempt
    const style = document.createElement("style");
    style.id = "proctor-screenshot-block";
    style.textContent = `
      @media print { body { display: none !important; } }
      .exam-content { -webkit-user-select: none; user-select: none; }
    `;
    document.head.appendChild(style);

    // Block PrintScreen key
    const blockPrint = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen" || (e.metaKey && e.shiftKey && ["3","4","5"].includes(e.key))) {
        e.preventDefault();
        triggerWarningDirect("screenshot_attempt");
        // Clear clipboard immediately
        setTimeout(() => { navigator.clipboard?.writeText("").catch(() => {}); }, 100);
      }
    };

    // Detect screen capture API usage
    const handleVisibility = () => {
      if (document.hidden) {
        // May indicate screenshot tool
      }
    };

    document.addEventListener("keyup", blockPrint);
    return () => {
      document.removeEventListener("keyup", blockPrint);
      document.getElementById("proctor-screenshot-block")?.remove();
    };
  }, []);

  // Attach stream to hidden video for display
  useEffect(() => {
    const stream = getStream();
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
    // Also attach to camera preview display element
    const displayEl = document.getElementById("proctor-cam-preview") as HTMLVideoElement;
    if (displayEl && stream) {
      displayEl.srcObject = stream;
      displayEl.play().catch(() => {});
    }
  }, [cameraReady, getStream]);

  const addFeed = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" });
    setLiveFeed(prev => [`${time} — ${msg}`, ...prev].slice(0, 25));
  }, []);

  // ── Show banner — with per-type cooldown ──────────────────
  const triggerWarningDirect = useCallback((type: string, isSecondFaceWarn = false) => {
    const cfg = VCFG[type];
    if (!cfg) return;

    // Per-type cooldown (8s for most, 20s for face warnings)
    const cooldown = type === "face_not_detected" ? 20000 : 8000;
    const now = Date.now();
    if (warnCooldown.current[type] && now - warnCooldown.current[type] < cooldown) return;
    warnCooldown.current[type] = now;

    // Face detection: first warn = no points, second+ = deduct points
    let pts = cfg.pts;
    if (type === "face_not_detected") {
      faceWarnCount.current++;
      if (faceWarnCount.current < 2) {
        pts = 0; // first warning - no deduction
      } else {
        pts = 5; // 2nd+ warning - deduct 5 points
      }
    }

    setBanner({ type, cfg, pts, time: new Date().toLocaleTimeString() });

    if (pts > 0) {
      onPointDeduction(pts, cfg.en);
      setPointsLost(p => p + pts);
      addFeed(`${cfg.icon} ${cfg.en} — −${pts} pts`);
    } else {
      addFeed(`${cfg.icon} ${cfg.en} — Warning #${faceWarnCount.current}`);
    }

    // Auto-dismiss after 6s unless it's a "dismissOnFix" type
    if (!cfg.dismissOnFix) {
      setTimeout(() => setBanner((b: any) => b?.type === type ? null : b), 6000);
    }
  }, [onPointDeduction, addFeed]);

  // ── Face detection with auto-dismiss when face returns ────
  const detectFaces = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    let facePresent = false;
    let count = 0;

    // Try FaceDetector API
    if ("FaceDetector" in window) {
      try {
        const fd = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
        const faces = await fd.detect(video);
        count = faces.length;
        facePresent = count >= 1;
      } catch (_) {}
    }

    // Canvas fallback
    if (!facePresent && count === 0) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          canvas.width = 160; canvas.height = 120;
          ctx.drawImage(video, 0, 0, 160, 120);
          try {
            const { data } = ctx.getImageData(0, 0, 160, 120);
            let skin = 0;
            for (let i = 0; i < data.length; i += 16) {
              const r = data[i], g = data[i+1], b = data[i+2];
              if (r > 50 && g > 20 && b > 10 && r > g && r > b && Math.abs(r-g) < 120 && (r-b) > 10) skin++;
            }
            facePresent = (skin / (160*120/4)) > 0.02;
            count = facePresent ? 1 : 0;
          } catch (_) {}
        }
      }
    }

    setLocalFace(facePresent);
    setFaceCount(count);

    if (!facePresent) {
      // Start grace timer before warning
      if (!noFaceTimer.current) {
        noFaceTimer.current = setTimeout(() => {
          setLocalFace(v => {
            if (!v) triggerWarningDirect("face_not_detected");
            return v;
          });
          noFaceTimer.current = null;
        }, 5000); // 5s grace before warning
      }
    } else {
      // Face returned — clear grace timer AND dismiss banner if it was a face warning
      if (noFaceTimer.current) { clearTimeout(noFaceTimer.current); noFaceTimer.current = null; }
      setBanner((b: any) => {
        if (b?.cfg?.dismissOnFix) return null; // auto-dismiss face warning
        return b;
      });
      if (count > 1) triggerWarningDirect("multiple_faces");
    }
  }, [triggerWarningDirect]);

  useEffect(() => {
    if (!cameraReady) return;
    detectIv.current = setInterval(detectFaces, 3000);
    return () => { clearInterval(detectIv.current); if (noFaceTimer.current) clearTimeout(noFaceTimer.current); };
  }, [cameraReady, detectFaces]);

  // Violations from proctoring hook
  useEffect(() => {
    if (!lastWarningType) return;
    triggerWarningDirect(lastWarningType);
  }, [lastWarningType, violations]);

  // Auto-submit countdown
  useEffect(() => {
    if (suspicionLevel === "critical" && strikes >= maxStrikes - 1) {
      let c = 10; setAutoCount(c);
      const iv = setInterval(() => { c--; setAutoCount(c); if (c <= 0) clearInterval(iv); }, 1000);
      return () => clearInterval(iv);
    } else { setAutoCount(null); }
  }, [suspicionLevel, strikes, maxStrikes]);

  // Log to DB
  useEffect(() => {
    if (!lastWarningType || !attemptId) return;
    const cfg = VCFG[lastWarningType];
    supabase.from("proctoring_logs" as any).insert({
      attempt_id: attemptId, violation_type: lastWarningType,
      severity: cfg?.sev || "medium", points_deducted: cfg?.pts || 0,
      detected_at: new Date().toISOString(),
    }).then(() => {});
  }, [lastWarningType, violations, attemptId]);

  const scoreColor = integrityScore >= 80 ? "#22c55e" : integrityScore >= 60 ? "#f59e0b" : "#ef4444";
  const statusLabel = { low:"SECURE", medium:"CAUTION", high:"WARNING", critical:"CRITICAL" }[suspicionLevel] || "SECURE";
  const statusColor = { low:"#22c55e", medium:"#f59e0b", high:"#ef4444", critical:"#dc2626" }[suspicionLevel] || "#22c55e";
  const bannerStyle = banner ? SEV_STYLE[banner.cfg.sev] : null;

  return (
    <>
      {/* Hidden video elements */}
      <video ref={videoRef} muted playsInline
        style={{ position:"fixed", width:1, height:1, opacity:0, top:0, left:0, pointerEvents:"none" }} />
      <canvas ref={canvasRef} style={{ display:"none" }} />

      {/* Auto-submit overlay */}
      {autoCountdown !== null && autoCountdown > 0 && (
        <div style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(0,0,0,.92)",
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
          <ShieldAlert style={{ width:68, height:68, color:"#dc2626" }} />
          <div style={{ fontSize:24, fontWeight:900, color:"#fff", textAlign:"center" }}>🚨 Multiple Violations Detected!</div>
          <div style={{ fontSize:15, color:"rgba(255,255,255,.7)" }}>Your exam will auto-submit in</div>
          <div style={{ fontSize:90, fontWeight:900, color:"#dc2626", fontVariantNumeric:"tabular-nums", lineHeight:1 }}>{autoCountdown}</div>
        </div>
      )}

      {/* Warning banner — dismisses automatically when issue fixed */}
      {banner && bannerStyle && (
        <div style={{
          position:"fixed", top:56, left:"50%", transform:"translateX(-50%)",
          zIndex:500, maxWidth:460, width:"calc(100% - 16px)",
          background: banner.cfg.sev === "critical" || banner.cfg.sev === "high"
            ? "linear-gradient(135deg,#1a0000,#3a0000)"
            : bannerStyle.bg,
          border:`2px solid ${bannerStyle.border}`,
          borderRadius:16, padding:"14px 16px",
          boxShadow:`0 8px 32px rgba(0,0,0,.4), 0 0 0 2px ${bannerStyle.border}33`,
          animation:"bannerIn .25s ease",
        }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
            <div style={{ width:42, height:42, borderRadius:12, background:`${bannerStyle.border}22`,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>
              {banner.cfg.icon}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <span style={{ fontSize:11, fontWeight:900, color:bannerStyle.text, letterSpacing:.8 }}>
                  ⚠️ PROCTORING ALERT
                </span>
                {banner.pts > 0 && (
                  <span style={{ fontSize:11, fontWeight:700, color:bannerStyle.text,
                    background:`${bannerStyle.border}22`, borderRadius:10, padding:"2px 8px", marginLeft:"auto" }}>
                    −{banner.pts} pts
                  </span>
                )}
                {banner.pts === 0 && (
                  <span style={{ fontSize:10, color:bannerStyle.text, opacity:.7, marginLeft:"auto" }}>
                    Warning #{faceWarnCount.current}
                  </span>
                )}
              </div>
              <div style={{ fontSize:16, fontWeight:800, color:bannerStyle.text, marginBottom:3 }}>
                {t(banner.cfg.en, banner.cfg.ar)}
              </div>
              {banner.cfg.dismissOnFix ? (
                <div style={{ fontSize:11, color:bannerStyle.text, opacity:.7 }}>
                  This alert will disappear when you look at your screen.
                </div>
              ) : (
                <div style={{ fontSize:11, color:bannerStyle.text, opacity:.7 }}>
                  This has been recorded and sent to your instructor.
                </div>
              )}
              {banner.type === "face_not_detected" && faceWarnCount.current >= 2 && (
                <div style={{ fontSize:11, color:"#fca5a5", fontWeight:700, marginTop:4 }}>
                  ⚠️ Points will be deducted for repeated violations.
                </div>
              )}
            </div>
            <button onClick={() => setBanner(null)} style={{ background:"none", border:"none",
              color:bannerStyle.text, cursor:"pointer", opacity:.6, padding:2, flexShrink:0 }}>
              <X style={{ width:16, height:16 }} />
            </button>
          </div>
          {/* Shrink bar */}
          {!banner.cfg.dismissOnFix && (
            <div style={{ height:3, background:`${bannerStyle.border}33`, borderRadius:2, marginTop:12, overflow:"hidden" }}>
              <div style={{ height:"100%", background:bannerStyle.border, borderRadius:2,
                animation:"shrinkBar 6s linear forwards" }} />
            </div>
          )}
        </div>
      )}

      {/* ── TINY PROCTORING PILL — bottom-right, doesn't block content ── */}
      <div style={{ position:"fixed", bottom:56, right:8, zIndex:200, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>

        {/* Main pill — very compact */}
        <div style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(0,0,0,.75)", backdropFilter:"blur(8px)", borderRadius:30, padding:"5px 10px", border:`1px solid ${statusColor}44`, cursor:"pointer" }}
          onClick={() => setShowLog(v => !v)}>
          {/* Status dot */}
          <div style={{ width:6, height:6, borderRadius:"50%", background:statusColor, boxShadow:`0 0 4px ${statusColor}` }} />
          {/* Score */}
          <span style={{ fontSize:11, fontWeight:900, color:scoreColor }}>{Math.round(integrityScore)}%</span>
          {/* Strikes dots */}
          <div style={{ display:"flex", gap:2 }}>
            {Array.from({ length: maxStrikes }, (_, i) => (
              <div key={i} style={{ width:6, height:6, borderRadius:2, background: i < strikes ? "#dc2626" : "rgba(255,255,255,.2)" }} />
            ))}
          </div>
          {/* Camera + face tiny icons */}
          <div style={{ display:"flex", alignItems:"center", gap:3 }}>
            {cameraReady
              ? <div style={{ width:6, height:6, borderRadius:"50%", background:"#22c55e" }} />
              : <div style={{ width:6, height:6, borderRadius:"50%", background:"#ef4444" }} />}
            {localFace
              ? <Eye style={{ width:10, height:10, color:"#22c55e" }} />
              : <EyeOff style={{ width:10, height:10, color:"#ef4444" }} />}
          </div>
          {/* Violation count badge */}
          {violations > 0 && (
            <span style={{ fontSize:9, fontWeight:900, background:"#dc2626", color:"#fff", borderRadius:20, padding:"1px 5px" }}>
              {violations}
            </span>
          )}
        </div>

        {/* Activity log dropdown — opens upward */}
        {showLog && (
          <div style={{ position:"absolute", bottom:"100%", right:0, marginBottom:6, width:250, maxHeight:220,
            background:"rgba(10,10,10,.96)", borderRadius:12, border:"1px solid rgba(255,255,255,.1)",
            boxShadow:"0 -4px 24px rgba(0,0,0,.5)", overflow:"hidden", display:"flex", flexDirection:"column" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px", borderBottom:"1px solid rgba(255,255,255,.08)" }}>
              <Shield style={{ width:12, height:12, color:"#22c55e" }} />
              <span style={{ fontSize:11, fontWeight:700, color:"#fff", flex:1 }}>Live Activity</span>
              <button onClick={e => { e.stopPropagation(); setShowLog(false); }}
                style={{ background:"none", border:"none", color:"rgba(255,255,255,.5)", cursor:"pointer" }}>
                <X style={{ width:11, height:11 }} />
              </button>
            </div>
            <div style={{ flex:1, overflowY:"auto" }}>
              {liveFeed.length === 0 ? (
                <div style={{ padding:"16px 12px", textAlign:"center" }}>
                  <ShieldCheck style={{ width:18, height:18, color:"#22c55e", margin:"0 auto 5px" }} />
                  <p style={{ fontSize:11, color:"rgba(255,255,255,.4)" }}>No violations</p>
                </div>
              ) : liveFeed.map((msg, i) => (
                <div key={i} style={{ padding:"5px 12px", borderBottom:"1px solid rgba(255,255,255,.04)",
                  fontSize:10, color: i === 0 ? "#fca5a5" : "rgba(255,255,255,.4)", fontFamily:"monospace" }}>
                  {msg}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes bannerIn { from{opacity:0;transform:translate(-50%,-14px)} to{opacity:1;transform:translate(-50%,0)} }
        @keyframes shrinkBar { from{width:100%} to{width:0} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
      `}</style>
    </>
  );
};

export default ProctoringOverlay;
