/**
 * EntranceExamTaking — Complete Mobile-First Exam Interface
 * - Beautiful Islamic-themed pre-exam instructions
 * - Camera + mic pre-check before proctored exam starts
 * - Full proctoring integration (data stored in proctoring_logs)
 * - Collapsible bottom number navigation
 * - After submit → advance to recitation step
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { lockReload, unlockReload } from "@/lib/reloadGuard";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useProctoring } from "@/hooks/useProctoring";
import ProctoringOverlay from "@/components/exam/ProctoringOverlay";
import { useTasjeel, TASJEEL_ROUTES } from "@/hooks/useTasjeel";
import { useRegistrationSettings } from "@/hooks/useRegistrationSettings";
import {
  Clock, Flag, Send, CheckCircle2, ChevronLeft, ChevronRight,
  Shield, AlertTriangle, BookOpen, Camera, Eye, EyeOff,
  ChevronUp, ChevronDown, Mic
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9A84C";
const RED  = "#ef4444";

const useIsMobile = () => {
  const [m, setM] = useState(false);
  useEffect(() => {
    const c = () => setM(window.innerWidth < 768);
    c(); window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, []);
  return m;
};

const fmtTime = (s: number) =>
  `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

// ── Beautiful Pre-Exam Instructions ────────────────────────────────────────
const PreExamInstructions = ({
  exam, procEnabled, regConfig, onStart,
}: { exam: any; procEnabled: boolean; regConfig: any; onStart: () => void }) => {
  const isMobile = useIsMobile();
  const [checked, setChecked] = useState(false);

  const steps = [
    { icon: "📖", title: "Read Carefully", desc: "Read each question carefully before answering." },
    { icon: "⏱️", title: `${exam?.time_limit_minutes || 15} Minutes`, desc: "You have a time limit. Manage your time wisely." },
    { icon: "🚫", title: "No Tab Switching", desc: "Switching tabs or minimising counts as a violation." },
    { icon: "✅", title: `Pass: ${exam?.passing_score || 50}%`, desc: "You need this score to proceed to recitation." },
  ];
  if (procEnabled) steps.push({ icon: "📷", title: "Camera On", desc: "Your webcam will be used for identity verification." });
  if (regConfig?.recitation_test_required) steps.push({ icon: "🎙️", title: "Recitation Next", desc: "After this exam you will record a Quran recitation." });

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50, overflowY: "auto",
      background: "linear-gradient(160deg,#021a0e 0%,#0c2d1a 50%,#041409 100%)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: isMobile ? "16px 12px 32px" : "40px 20px",
    }}>
      <div style={{
        width: "100%", maxWidth: 560, zIndex: 1,
        background: "rgba(255,255,255,.04)",
        border: "1px solid rgba(201,168,76,.2)",
        borderRadius: isMobile ? 20 : 28,
        padding: isMobile ? "28px 20px" : "40px 36px",
        backdropFilter: "blur(8px)",
      }}>
        {/* Bismillah header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 70, height: 70, borderRadius: "50%", margin: "0 auto 16px",
            background: "rgba(201,168,76,.12)", border: "2px solid rgba(201,168,76,.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <BookOpen size={30} color={GOLD} />
          </div>
          <p style={{ fontFamily: "'Amiri',serif", fontSize: isMobile ? 20 : 24, color: GOLD, margin: "0 0 10px", direction: "rtl" }}>
            بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
          </p>
          <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 900, color: "#fff", margin: "0 0 4px" }}>
            {exam?.title || "Entrance Examination"}
          </h1>
          <p style={{ fontSize: 12, color: "rgba(201,168,76,.7)", margin: 0, fontFamily: "'Amiri',serif" }}>
            اختبار القبول — Tahleem Academy
          </p>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 24 }}>
          {[
            { icon: "⏱️", v: `${exam?.time_limit_minutes || 15} min`, l: "Duration" },
            { icon: "❓", v: `${exam?.question_count || "?"}`, l: "Questions" },
            { icon: "🏆", v: `${exam?.passing_score || 50}%`, l: "Pass Mark" },
          ].map((s, i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,.06)", borderRadius: 14, padding: "12px 10px",
              textAlign: "center", border: "1px solid rgba(255,255,255,.08)",
            }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>{s.v}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.45)", marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Instructions grid */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(201,168,76,.8)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: 1 }}>
            📋 Instructions · التعليمات
          </p>
          {steps.map((s, i) => (
            <div key={i} style={{
              display: "flex", gap: 12, alignItems: "flex-start",
              background: "rgba(255,255,255,.04)", borderRadius: 12, padding: "10px 14px",
              border: "1px solid rgba(255,255,255,.07)",
            }}>
              <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#fff", margin: "0 0 2px" }}>{s.title}</p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,.55)", margin: 0, lineHeight: 1.5 }}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Violation warning */}
        <div style={{
          background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)",
          borderRadius: 12, padding: "12px 16px", marginBottom: 20,
          display: "flex", gap: 10, alignItems: "flex-start",
        }}>
          <EyeOff size={16} color={RED} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontWeight: 700, fontSize: 12, color: RED, margin: "0 0 3px" }}>
              ⚠️ Anti-Cheat Monitoring Active
            </p>
            <p style={{ fontSize: 11, color: "rgba(239,68,68,.75)", margin: 0, lineHeight: 1.5 }}>
              Leaving the page, switching tabs, or minimising counts as a violation.
              After <strong style={{ color: RED }}>3 violations</strong> your exam will be auto-submitted.
            </p>
          </div>
        </div>

        {/* Agree checkbox */}
        <label style={{
          display: "flex", gap: 10, alignItems: "flex-start",
          background: "rgba(255,255,255,.04)", borderRadius: 12, padding: "12px 16px",
          cursor: "pointer", marginBottom: 20, border: `1px solid ${checked ? "rgba(201,168,76,.4)" : "rgba(255,255,255,.08)"}`,
          transition: "border-color .2s",
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
            border: `2px solid ${checked ? GOLD : "rgba(255,255,255,.3)"}`,
            background: checked ? GOLD : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all .2s",
          }}>
            {checked && <CheckCircle2 size={12} color="#fff" />}
          </div>
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} style={{ display: "none" }} />
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.7)", margin: 0, lineHeight: 1.6 }}>
            I have read and understood all the instructions. I agree to abide by the exam rules and the academic integrity policy of Tahleem Academy.
          </p>
        </label>

        <button onClick={onStart} disabled={!checked} style={{
          width: "100%", padding: "16px", borderRadius: 14, border: "none",
          background: checked ? `linear-gradient(135deg,${G},${GM})` : "rgba(255,255,255,.08)",
          color: checked ? "#fff" : "rgba(255,255,255,.3)",
          fontSize: 16, fontWeight: 800, cursor: checked ? "pointer" : "not-allowed",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          boxShadow: checked ? "0 8px 32px rgba(6,78,59,.5)" : "none",
          transition: "all .2s", minHeight: 52,
        }}>
          <BookOpen size={18} /> {checked ? "Begin Exam — ابدأ الاختبار" : "Please read all instructions above"}
        </button>
      </div>
    </div>
  );
};

// ── Violation Warning ──────────────────────────────────────────────────────
const ViolationWarning = ({ count, onReturn }: { count: number; onReturn: () => void }) => {
  const isMobile = useIsMobile();
  const remaining = 3 - count;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,.92)", backdropFilter: "blur(12px)",
      padding: isMobile ? "12px" : "20px",
    }}>
      <div style={{
        maxWidth: 440, width: "100%", background: "#160808",
        border: "2px solid rgba(239,68,68,.5)", borderRadius: 24, padding: isMobile ? "28px 20px" : "36px 32px",
        textAlign: "center",
      }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(239,68,68,.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <AlertTriangle size={32} color={RED} />
        </div>
        <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: RED, margin: "0 0 10px" }}>
          ⚠️ Violation {count} / 3
        </h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,.75)", margin: "0 0 16px", lineHeight: 1.6 }}>
          You left or minimised the exam window.
        </p>
        <div style={{ background: "rgba(239,68,68,.1)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, border: "1px solid rgba(239,68,68,.25)" }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: RED, margin: 0 }}>
            {remaining === 1 ? "⚡ FINAL WARNING — next violation auto-submits!" : `${remaining} violations remaining before auto-submit`}
          </p>
        </div>
        <button onClick={onReturn} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${G},${GM})`, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 14, minHeight: 48 }}>
          <Eye size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
          Return to Exam
        </button>
      </div>
    </div>
  );
};

// ── Camera + Mic Pre-Check ────────────────────────────────────────────────────
// Shown before a proctored exam starts. Requests camera/mic access, shows a
// live preview and mic level meter, and only enables "Start Exam" once the
// student confirms the camera is working.
const CameraSetup = ({ exam, onReady }: { exam: any; onReady: () => void }) => {
  const isMobile = useIsMobile();

  type CamState = "requesting" | "ready" | "denied" | "na";
  const [camState,    setCamState]    = useState<CamState>("requesting");
  const [micLevel,    setMicLevel]    = useState(0);
  const [micReady,    setMicReady]    = useState(false);
  const [confirmed,   setConfirmed]   = useState(false);
  const [cameraOptional, setCameraOptional] = useState(false);

  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micRafRef   = useRef<number>();

  useEffect(() => {
    let cancelled = false;
    setCameraOptional(!exam?.webcam_required);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setCamState("ready");

        // Mic level meter
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          audioCtxRef.current = ctx;
          const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
          ctx.createMediaStreamSource(stream).connect(analyser);
          const buf = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            if (cancelled) return;
            analyser.getByteFrequencyData(buf);
            const level = Math.min(100, (buf.reduce((a,b)=>a+b,0)/buf.length/128)*200);
            setMicLevel(level);
            if (level > 15) setMicReady(true);
            micRafRef.current = requestAnimationFrame(tick);
          };
          micRafRef.current = requestAnimationFrame(tick);
        } catch { /* mic level not critical */ }
      } catch (e: any) {
        if (cancelled) return;
        if (e.name === "NotAllowedError") setCamState("denied");
        else setCamState("na");
      }
    })();

    return () => {
      cancelled = true;
      if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
      audioCtxRef.current?.close().catch(() => {});
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [exam?.webcam_required]);

  const handleStart = () => {
    // Stop the preview stream — proctoring will open its own stream
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    onReady();
  };

  const retryCamera = async () => {
    setCamState("requesting");
    streamRef.current?.getTracks().forEach(t => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(()=>{}); }
      setCamState("ready");
    } catch { setCamState("denied"); }
  };

  const camOk     = camState === "ready";
  const canStart  = confirmed && (camOk || cameraOptional);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60,
      background: "linear-gradient(160deg,#021a0e 0%,#0c2d1a 50%,#041409 100%)",
      overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: isMobile ? "16px 12px 32px" : "40px 20px",
    }}>
      <div style={{
        width: "100%", maxWidth: 520, zIndex: 1,
        background: "rgba(255,255,255,.04)", border: "1px solid rgba(201,168,76,.2)",
        borderRadius: isMobile ? 20 : 28, padding: isMobile ? "24px 18px" : "36px 32px",
        backdropFilter: "blur(8px)",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", margin: "0 auto 16px", background: "rgba(201,168,76,.12)", border: "2px solid rgba(201,168,76,.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Camera size={28} color={GOLD} />
          </div>
          <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: "#fff", margin: "0 0 6px" }}>
            Camera &amp; Mic Check
          </h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,.55)", margin: 0, lineHeight: 1.6 }}>
            {exam?.webcam_required
              ? "Camera is required for this exam. Please ensure it is on before starting."
              : "Your camera helps us verify your identity. Confirm it's working before starting."}
          </p>
        </div>

        {/* Camera preview */}
        <div style={{ background: "#000", borderRadius: 14, overflow: "hidden", marginBottom: 16, aspectRatio: "4/3", position: "relative", border: `2px solid ${camOk ? "rgba(34,197,94,.5)" : "rgba(255,255,255,.1)"}` }}>
          {camState === "requesting" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", border: `3px solid ${GOLD}`, borderTopColor: "transparent", animation: "spin .8s linear infinite" }} />
              <p style={{ color: "rgba(255,255,255,.5)", fontSize: 13, margin: 0 }}>Requesting camera…</p>
            </div>
          )}
          {(camState === "denied" || camState === "na") && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 20, textAlign: "center" }}>
              <span style={{ fontSize: 36 }}>📷</span>
              <p style={{ color: "#ef4444", fontSize: 14, fontWeight: 700, margin: 0 }}>
                {camState === "denied" ? "Camera permission denied" : "Camera not available"}
              </p>
              <p style={{ color: "rgba(255,255,255,.45)", fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                {camState === "denied"
                  ? "Please allow camera access in your browser settings, then tap Retry."
                  : "No camera detected on this device."}
              </p>
              <button onClick={retryCamera} style={{ padding: "10px 22px", borderRadius: 10, border: `1.5px solid ${GOLD}`, background: "transparent", color: GOLD, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                🔄 Retry Camera
              </button>
            </div>
          )}
          <video
            ref={videoRef}
            autoPlay muted playsInline
            style={{
              width: "100%", height: "100%", objectFit: "cover",
              transform: "scaleX(-1)", // mirror selfie view
              display: camState === "ready" ? "block" : "none",
            }}
          />
          {camOk && (
            <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(34,197,94,.9)", borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#fff" }}>
              ✓ Camera On
            </div>
          )}
        </div>

        {/* Mic level */}
        <div style={{ marginBottom: 16, background: "rgba(255,255,255,.06)", borderRadius: 12, padding: "12px 14px", border: "1px solid rgba(255,255,255,.1)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.6)", letterSpacing: .8 }}>🎙 MIC LEVEL</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: micReady ? "#22c55e" : "rgba(255,255,255,.4)" }}>
              {micReady ? "Detected ✓" : "Speak to test…"}
            </span>
          </div>
          <div style={{ height: 8, background: "rgba(255,255,255,.1)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${micLevel}%`, background: micLevel > 60 ? "#22c55e" : micLevel > 20 ? GOLD : "rgba(255,255,255,.3)", borderRadius: 4, transition: "width .08s" }} />
          </div>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,.3)", margin: "6px 0 0" }}>Say a few words to confirm your microphone is working</p>
        </div>

        {/* Checklist items */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {[
            { emoji: "🔇", text: "I'm in a quiet environment", key: "quiet" },
            { emoji: "💡", text: "My face is clearly visible and well-lit", key: "lit" },
            { emoji: "🚫", text: "No other devices or materials nearby", key: "alone" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", background: "rgba(255,255,255,.04)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(255,255,255,.08)", cursor: "default" }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{item.emoji}</span>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,.7)", flex: 1 }}>{item.text}</span>
            </div>
          ))}
        </div>

        {/* Confirm checkbox */}
        <div
          onClick={() => setConfirmed(v => !v)}
          style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "rgba(255,255,255,.04)", borderRadius: 12, padding: "14px", cursor: "pointer", marginBottom: 20, border: `1px solid ${confirmed ? "rgba(201,168,76,.4)" : "rgba(255,255,255,.1)"}` }}
        >
          <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${confirmed ? GOLD : "rgba(255,255,255,.3)"}`, background: confirmed ? GOLD : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
            {confirmed && <CheckCircle2 size={13} color="#000" />}
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.65)", margin: 0, lineHeight: 1.6 }}>
            I confirm my camera and microphone are working. I'm ready to start the proctored exam.
          </p>
        </div>

        {/* Start button */}
        <button
          onClick={handleStart}
          disabled={!canStart}
          style={{
            width: "100%", padding: "16px", borderRadius: 14, border: "none",
            background: canStart ? `linear-gradient(135deg,${G},${GM})` : "rgba(255,255,255,.08)",
            color: canStart ? "#fff" : "rgba(255,255,255,.3)",
            fontSize: 15, fontWeight: 800, cursor: canStart ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            boxShadow: canStart ? "0 8px 32px rgba(6,78,59,.5)" : "none",
            transition: "all .2s",
          }}
        >
          {!canStart && !confirmed && "✓ Confirm your readiness above"}
          {!canStart && confirmed && !camOk && !cameraOptional && "📷 Enable camera to continue"}
          {canStart && <><BookOpen size={18} /> Start Exam — ابدأ الاختبار</>}
        </button>

        {/* Skip camera (only if not required) */}
        {cameraOptional && !camOk && confirmed && (
          <button
            onClick={handleStart}
            style={{ width: "100%", marginTop: 10, padding: "12px", borderRadius: 12, border: "1.5px solid rgba(255,165,0,.4)", background: "transparent", color: "rgba(255,165,0,.8)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            ⚠️ Proceed without camera (not recommended)
          </button>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
const EntranceExamTaking = () => {
  const { attemptId }                   = useParams<{ attemptId: string }>();
  const { user }                        = useAuth();
  const { toast }                       = useToast();
  const navigate                        = useNavigate();
  const { currentStep, advanceStep }    = useTasjeel();
  const { config: regConfig }           = useRegistrationSettings();
  const isMobile                        = useIsMobile();

  const [exam,              setExam]              = useState<any>(null);
  const [questions,         setQuestions]         = useState<any[]>([]);
  const [answers,           setAnswers]           = useState<Record<string, string>>({});
  const [flagged,           setFlagged]           = useState<Set<string>>(new Set());
  const [currentIdx,        setCurrentIdx]        = useState(0);
  const [timeLeft,          setTimeLeft]          = useState(0);
  const [loading,           setLoading]           = useState(true);
  const [submitting,        setSubmitting]        = useState(false);
  const [showConfirm,       setShowConfirm]       = useState(false);
  const [showInstructions,  setShowInstructions]  = useState(true);
  const [showCameraSetup,   setShowCameraSetup]   = useState(false); // camera pre-check step
  const [procConfig,        setProcConfig]        = useState<any>({});
  const [violationCount,    setViolationCount]    = useState(0);
  const [showViolation,     setShowViolation]     = useState(false);
  // Collapsible nav
  const [navOpen,           setNavOpen]           = useState(false);

  const violationRef   = useRef(0);
  const examActiveRef  = useRef(false);
  const submittedRef   = useRef(false);
  const answersRef     = useRef(answers);
  const timerRef       = useRef<any>(null);
  // Grace period: don't count violations for first 8 seconds after exam starts
  const examStartTimeRef = useRef<number>(0);

  useEffect(() => { answersRef.current = answers; }, [answers]);

  // ── Load exam ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!attemptId || !user) return;
    (async () => {
      try {
        const { data: att } = await supabase
          .from("exam_attempts").select("*, exams(*)")
          .eq("id", attemptId).single();
        if (!att || att.user_id !== user.id) { navigate("/student/entrance-exam", { replace: true }); return; }
        if (att.status !== "in_progress") {
          // Exam already done — send user to wherever their pipeline step says
          const dest = (currentStep && TASJEEL_ROUTES[currentStep]) ? TASJEEL_ROUTES[currentStep] : "/student/recitation-test";
          navigate(dest, { replace: true });
          return;
        }

        const ex = att.exams as any;
        setExam(ex);
        const elapsed  = Date.now() - new Date(att.started_at).getTime();
        const limitMs  = (ex.time_limit_minutes || 15) * 60_000;
        setTimeLeft(Math.max(0, Math.floor((limitMs - elapsed) / 1000)));

        const { data: qs } = await supabase.rpc("get_exam_questions_for_student", { _exam_id: ex.id });
        setQuestions(qs || []);

        const { data: ea } = await supabase.from("exam_answers").select("question_id, answer_text, is_flagged").eq("attempt_id", attemptId);
        if (ea) {
          const am: Record<string, string> = {};
          const fl = new Set<string>();
          ea.forEach((a: any) => { if (a.answer_text) am[a.question_id] = a.answer_text; if (a.is_flagged) fl.add(a.question_id); });
          setAnswers(am); setFlagged(fl);
        }

        setProcConfig({
          proctoring_enabled:         ex.proctoring_enabled ?? false,
          fullscreen_required:        ex.fullscreen_required ?? false,
          tab_switch_limit:           ex.tab_switch_limit ?? 3,
          max_warnings:               ex.max_warnings ?? 3,
          auto_submit_on_violation:   ex.auto_submit_on_violation ?? false,
          screenshot_interval_seconds:ex.screenshot_interval_seconds ?? 30,
          webcam_required:            ex.webcam_required ?? false,
        });
        setLoading(false);
      } catch { toast({ title: "Error loading exam", variant: "destructive" }); setLoading(false); }
    })();
  }, [attemptId, user, navigate, toast]);

  // ── Timer — only starts after camera setup is done ───────────────────────
  useEffect(() => {
    if (loading || showInstructions || showCameraSetup || timeLeft <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => { if (t <= 1) { clearInterval(timerRef.current); if (!submittedRef.current) handleSubmit(); return 0; } return t - 1; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [loading, showInstructions, showCameraSetup]);

  // ── Violation tracking ────────────────────────────────────────────────────
  // 8-second grace period after exam starts so the camera permission dialog
  // doesn't count as a tab-switch violation.
  useEffect(() => {
    if (showInstructions || showCameraSetup || loading) return;
    const GRACE_MS = 8000;
    examStartTimeRef.current = Date.now();
    const fire = () => {
      if (!examActiveRef.current || submittedRef.current) return;
      if (Date.now() - examStartTimeRef.current < GRACE_MS) return; // still in grace period
      violationRef.current += 1;
      const c = violationRef.current; setViolationCount(c);
      if (c >= 3) { toast({ title: "⚠️ Exam auto-submitted", variant: "destructive" }); setTimeout(() => { if (!submittedRef.current) handleSubmit(); }, 1000); }
      else setShowViolation(true);
    };
    const onVis = () => { if (document.visibilityState !== "visible") fire(); };
    const onBlur = () => fire();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    examActiveRef.current = true;
    lockReload("entrance-exam");
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      examActiveRef.current = false;
      unlockReload("entrance-exam");
    };
  }, [showInstructions, showCameraSetup, loading]);

  // ── Proctoring — only enabled after camera setup ──────────────────────────
  const procEnabled = !showInstructions && !showCameraSetup && !loading && (procConfig.proctoring_enabled ?? false);
  const proc = useProctoring(
    { attemptId: attemptId!, userId: user?.id || "", ...procConfig },
    procEnabled,
    () => { if (!submittedRef.current) handleSubmit(); }
  );

  // ── Save answer ──────────────────────────────────────────────────────────
  const saveAnswer = useCallback(async (qId: string, ans: string) => {
    setAnswers(prev => ({ ...prev, [qId]: ans }));
    const { data: ex } = await supabase.from("exam_answers").select("id").eq("attempt_id", attemptId!).eq("question_id", qId).maybeSingle();
    if (ex) { await supabase.from("exam_answers").update({ answer_text: ans, updated_at: new Date().toISOString() }).eq("id", ex.id); }
    else { await supabase.from("exam_answers").insert({ attempt_id: attemptId!, question_id: qId, answer_text: ans }); }
  }, [attemptId]);

  // ── Toggle flag ──────────────────────────────────────────────────────────
  const toggleFlag = useCallback(async (qId: string) => {
    const nowFlagged = !flagged.has(qId);
    setFlagged(prev => { const n = new Set(prev); nowFlagged ? n.add(qId) : n.delete(qId); return n; });
    const { data: ex } = await supabase.from("exam_answers").select("id").eq("attempt_id", attemptId!).eq("question_id", qId).maybeSingle();
    if (ex) await supabase.from("exam_answers").update({ is_flagged: nowFlagged }).eq("id", ex.id);
  }, [flagged, attemptId]);

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (submittedRef.current || submitting) return;
    submittedRef.current = true; examActiveRef.current = false;
    setSubmitting(true); clearInterval(timerRef.current);
    try {
      const cur = answersRef.current;
      for (const [qId, ans] of Object.entries(cur)) {
        if (!ans) continue;
        const { data: ex } = await supabase.from("exam_answers").select("id").eq("attempt_id", attemptId!).eq("question_id", qId).maybeSingle();
        if (ex) await supabase.from("exam_answers").update({ answer_text: ans }).eq("id", ex.id);
        else await supabase.from("exam_answers").insert({ attempt_id: attemptId!, question_id: qId, answer_text: ans });
      }
      await supabase.rpc("grade_exam_attempt", { _attempt_id: attemptId! });

      // Advance pipeline: exam → recitation (if required) or level_assignment
      if (regConfig?.recitation_test_required) {
        await advanceStep("recitation");
        navigate("/student/recitation-test", { replace: true });
      } else {
        await advanceStep("level_assignment");
        navigate("/student/awaiting-level", { replace: true });
      }
    } catch (err) {
      console.error("Submission error:", err);
      toast({ title: "Submission error — please try again", variant: "destructive" });
      submittedRef.current = false; examActiveRef.current = true; setSubmitting(false);
    }
  }, [submitting, attemptId, navigate, toast, advanceStep, regConfig]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f3122" }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: `3px solid ${GOLD}`, borderTopColor: "transparent", animation: "spin .7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Instructions ─────────────────────────────────────────────────────────
  if (showInstructions) return (
    <PreExamInstructions
      exam={exam} procEnabled={procConfig.proctoring_enabled}
      regConfig={regConfig}
      onStart={() => {
        setShowInstructions(false);
        // If proctoring enabled, go to camera setup first; otherwise start exam directly
        if (procConfig.proctoring_enabled) {
          setShowCameraSetup(true);
        } else {
          examActiveRef.current = true;
          examStartTimeRef.current = Date.now();
        }
      }}
    />
  );

  // ── Camera + Mic Pre-Check (proctored exams only) ─────────────────────────
  if (showCameraSetup) return (
    <CameraSetup
      exam={exam}
      onReady={() => {
        setShowCameraSetup(false);
        examActiveRef.current = true;
        examStartTimeRef.current = Date.now();
      }}
    />
  );

  const q        = questions[currentIdx];
  const answered = Object.keys(answers).filter(k => answers[k]).length;
  const isCrit   = timeLeft > 0 && timeLeft < 30;
  const isWarn   = timeLeft > 0 && timeLeft < 120;

  // ── Main exam UI ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "'Cairo',sans-serif", paddingBottom: isMobile ? 130 : 16 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Amiri:wght@400;700&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes timerPulse{0%,100%{opacity:1}50%{opacity:.5}}
        .qnav:active{transform:scale(.9)} * { -webkit-tap-highlight-color:transparent; }
      `}</style>

      {showViolation && <ViolationWarning count={violationCount} onReturn={() => setShowViolation(false)} />}
      {procEnabled && <ProctoringOverlay {...proc} attemptId={attemptId!} onPointDeduction={() => {}} />}

      {/* ── TOP BAR ─────────────────────────────────────────────────────── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 30, background: "#FFFFFF",
        borderBottom: "2px solid #E5E7EB",
        padding: isMobile ? "10px 14px" : "12px 20px",
        display: "flex", alignItems: "center", gap: 12,
        boxShadow: "0 2px 8px rgba(0,0,0,.06)",
      }}>
        {/* Timer */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: isCrit ? "#FEF2F2" : isWarn ? "#FFFBEB" : "#F0FDF4",
          border: `2px solid ${isCrit ? "#FECACA" : isWarn ? "#FDE68A" : "#86EFAC"}`,
          borderRadius: 10, padding: isMobile ? "7px 12px" : "8px 14px",
          animation: isCrit ? "timerPulse 1s ease infinite" : "none",
        }}>
          <Clock size={isMobile ? 14 : 15} color={isCrit ? RED : isWarn ? "#D97706" : G} />
          <span style={{ fontSize: isMobile ? 15 : 16, fontWeight: 900, color: isCrit ? RED : isWarn ? "#D97706" : G, letterSpacing: 1 }}>
            {fmtTime(timeLeft)}
          </span>
        </div>

        {/* Progress */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 700 }}>Q {currentIdx + 1} / {questions.length}</span>
            <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 700 }}>{answered} answered</span>
          </div>
          <div style={{ height: 4, background: "#E5E7EB", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${questions.length ? (answered / questions.length) * 100 : 0}%`, height: "100%", background: `linear-gradient(90deg,${G},${GOLD})`, transition: "width .4s" }} />
          </div>
        </div>

        {/* Violation badge */}
        {violationCount > 0 && (
          <div style={{ padding: "4px 10px", borderRadius: 8, background: "#FEF2F2", border: "1.5px solid #FECACA", fontSize: 12, fontWeight: 700, color: RED }}>
            ⚠️ {violationCount}/3
          </div>
        )}

        {/* Submit */}
        {!isMobile && (
          <button onClick={() => setShowConfirm(true)} style={{
            padding: "8px 18px", borderRadius: 10, border: "none",
            background: `linear-gradient(135deg,${G},${GM})`,
            color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer",
          }}>
            <Send size={13} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
            Submit
          </button>
        )}
      </div>

      {/* ── QUESTION AREA ───────────────────────────────────────────────── */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: isMobile ? "16px 12px" : "24px 20px" }}>
        {q ? (
          <div style={{ background: "#FFFFFF", border: "2px solid #E5E7EB", borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,.06)" }}>
            {/* Question header */}
            <div style={{ padding: isMobile ? "16px" : "20px 24px", background: "#F8F9FA", borderBottom: "2px solid #E5E7EB", display: "flex", alignItems: "flex-start", gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: G, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>{currentIdx + 1}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#EFF6FF", color: "#1D4ED8", textTransform: "uppercase" as const, fontWeight: 700 }}>
                    {q.question_type?.replace("_", " ")}
                  </span>
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#FFF7ED", color: "#C2410C", fontWeight: 700 }}>
                    {q.points || 1} pt{(q.points || 1) !== 1 ? "s" : ""}
                  </span>
                </div>
                <p style={{ fontSize: isMobile ? 17 : 19, color: "#111827", margin: 0, lineHeight: 1.65, fontWeight: 800 }}>
                  {q.question_text || q.question_text_ar || "Question text missing"}
                </p>
                {q.question_text_ar && q.question_text && (
                  <p style={{ fontSize: 16, color: "#374151", margin: "10px 0 0", direction: "rtl", fontFamily: "'Amiri',serif", lineHeight: 2, fontWeight: 700 }}>
                    {q.question_text_ar}
                  </p>
                )}
              </div>
              <button onClick={() => toggleFlag(q.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, flexShrink: 0 }}>
                <Flag size={18} color={flagged.has(q.id) ? "#F59E0B" : "#D1D5DB"} fill={flagged.has(q.id) ? "#F59E0B" : "none"} />
              </button>
            </div>

            {/* Answer area */}
            <div style={{ padding: isMobile ? "18px 16px" : "22px 24px" }}>
              {/* MCQ / True-False */}
              {(q.question_type === "mcq" || q.question_type === "true_false") && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {(q.question_type === "true_false"
                    ? [{ id: "true", text: "True ✓" }, { id: "false", text: "False ✗" }]
                    : (q.options as any[] || [])
                  ).map((opt: any) => {
                    const optId  = typeof opt === "string" ? opt : opt.id;
                    const optTxt = typeof opt === "string" ? opt : (opt.text || opt.text_ar || opt.id);
                    const isSel  = answers[q.id] === optId;
                    return (
                      <button key={optId} onClick={() => saveAnswer(q.id, optId)} style={{
                        width: "100%", padding: isMobile ? "14px 16px" : "16px 20px",
                        borderRadius: 14, textAlign: "left", cursor: "pointer",
                        border: `2.5px solid ${isSel ? G : "#E5E7EB"}`,
                        background: isSel ? "#F0FDF4" : "#FFFFFF",
                        color: isSel ? G : "#1F2937", fontWeight: isSel ? 800 : 600,
                        fontSize: isMobile ? 15 : 16, display: "flex", alignItems: "center", gap: 14,
                        transition: "all .2s", minHeight: isMobile ? 56 : 52,
                        boxShadow: isSel ? "0 2px 8px rgba(6,78,59,.12)" : "none",
                      }}>
                        <span style={{
                          width: 24, height: 24, borderRadius: "50%",
                          border: `2.5px solid ${isSel ? G : "#D1D5DB"}`,
                          background: isSel ? G : "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                          {isSel && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#fff", display: "block" }} />}
                        </span>
                        <span style={{ flex: 1, lineHeight: 1.5 }}>{optTxt}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Text answer */}
              {["short_answer", "essay", "fill_blank"].includes(q.question_type) && (
                <textarea value={answers[q.id] || ""} onChange={e => saveAnswer(q.id, e.target.value)}
                  placeholder="Type your answer here… اكتب إجابتك هنا"
                  rows={q.question_type === "essay" ? (isMobile ? 6 : 8) : 4}
                  dir="auto"
                  style={{
                    width: "100%", padding: isMobile ? "14px" : "16px",
                    borderRadius: 14, border: "2.5px solid #E5E7EB",
                    background: "#FFFFFF", color: "#111827",
                    fontSize: isMobile ? 15 : 16, fontWeight: 600,
                    outline: "none", resize: "vertical" as const,
                    fontFamily: "inherit", boxSizing: "border-box" as const,
                    lineHeight: 1.7,
                  }} />
              )}
            </div>

            {/* Question navigation arrows */}
            <div style={{
              padding: isMobile ? "14px 16px" : "16px 24px",
              borderTop: "2px solid #E5E7EB", background: "#F8F9FA",
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
            }}>
              <button onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))} disabled={currentIdx === 0} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: isMobile ? "12px 18px" : "11px 20px", borderRadius: 10,
                border: "2px solid #E5E7EB", background: "#fff",
                color: "#374151", cursor: currentIdx === 0 ? "not-allowed" : "pointer",
                opacity: currentIdx === 0 ? .4 : 1, fontWeight: 700, fontSize: 14, minHeight: 48,
              }}>
                <ChevronLeft size={16} /> Prev
              </button>
              <span style={{ fontSize: 13, color: "#6B7280", fontWeight: 700 }}>{currentIdx + 1} / {questions.length}</span>
              {currentIdx < questions.length - 1 ? (
                <button onClick={() => setCurrentIdx(currentIdx + 1)} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: isMobile ? "12px 18px" : "11px 20px", borderRadius: 10,
                  border: "none", background: G, color: "#fff",
                  cursor: "pointer", fontWeight: 700, fontSize: 14, minHeight: 48,
                }}>
                  Next <ChevronRight size={16} />
                </button>
              ) : (
                <button onClick={() => setShowConfirm(true)} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: isMobile ? "12px 20px" : "11px 22px", borderRadius: 10,
                  border: "none", background: `linear-gradient(135deg,${G},${GM})`,
                  color: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 14, minHeight: 48,
                }}>
                  <Send size={14} /> Submit
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ padding: "60px 20px", textAlign: "center", color: "#9CA3AF" }}>
            <p>No questions found for this exam.</p>
          </div>
        )}
      </div>

      {/* ── MOBILE BOTTOM NAVIGATION (collapsible) ─────────────────────── */}
      {isMobile && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 25,
          background: "#FFFFFF", borderTop: "2px solid #E5E7EB",
          borderRadius: navOpen ? "16px 16px 0 0" : "16px 16px 0 0",
          boxShadow: "0 -4px 24px rgba(0,0,0,.1)",
          transition: "all .3s ease",
        }}>
          {/* Collapse toggle bar */}
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 16px", cursor: "pointer",
            }}
            onClick={() => setNavOpen(v => !v)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 1 }}>
                Questions
              </span>
              <span style={{ padding: "2px 8px", borderRadius: 20, background: "#F0FDF4", color: "#16A34A", fontSize: 12, fontWeight: 700 }}>
                {answered}/{questions.length}
              </span>
              {flagged.size > 0 && (
                <span style={{ padding: "2px 8px", borderRadius: 20, background: "#FFFBEB", color: "#D97706", fontSize: 12, fontWeight: 700 }}>
                  🏳 {flagged.size}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={e => { e.stopPropagation(); setShowConfirm(true); }} style={{
                padding: "6px 14px", borderRadius: 20, border: "none",
                background: `linear-gradient(135deg,${GOLD},#b8902a)`,
                color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer",
              }}>
                <Send size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                Submit
              </button>
              {navOpen ? <ChevronDown size={18} color="#9CA3AF" /> : <ChevronUp size={18} color="#9CA3AF" />}
            </div>
          </div>

          {/* Question grid — only visible when open */}
          {navOpen && (
            <div style={{ padding: "0 14px 20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginBottom: 12 }}>
                {questions.map((qs, idx) => {
                  const isAns     = !!answers[qs.id];
                  const isCur     = idx === currentIdx;
                  const isFl      = flagged.has(qs.id);
                  return (
                    <button key={idx} className="qnav"
                      onClick={() => { setCurrentIdx(idx); setNavOpen(false); }}
                      style={{
                        aspectRatio: "1", borderRadius: 8, border: "none",
                        fontWeight: 800, fontSize: 12, cursor: "pointer",
                        background: isCur ? G : isFl ? "#FFFBEB" : isAns ? "#F0FDF4" : "#F9FAFB",
                        color: isCur ? "#fff" : isFl ? "#D97706" : isAns ? "#16A34A" : "#9CA3AF",
                        outline: isCur ? `2px solid ${G}` : "none",
                        minHeight: 38, transition: "all .15s",
                      }}>
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#6B7280", justifyContent: "center" }}>
                <span>🟢 Current</span><span>✅ Answered</span><span>⚠️ Flagged</span><span>⬜ Unanswered</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SUBMIT CONFIRM ───────────────────────────────────────────────── */}
      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.8)", padding: isMobile ? "16px" : "20px" }}>
          <div style={{ background: "#0f2d1f", border: "1px solid rgba(201,168,76,.3)", borderRadius: isMobile ? 18 : 24, padding: isMobile ? "24px 20px" : "32px 28px", maxWidth: 420, width: "100%", textAlign: "center" }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(201,168,76,.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
              <CheckCircle2 size={30} color={GOLD} />
            </div>
            <h3 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900, color: "#fff", margin: "0 0 8px" }}>Submit Exam?</h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,.6)", margin: "0 0 18px", lineHeight: 1.6 }}>
              You answered <strong style={{ color: GOLD }}>{answered}</strong> of <strong style={{ color: "#fff" }}>{questions.length}</strong> questions.
              {answered < questions.length && <span style={{ display: "block", marginTop: 6, color: RED, fontWeight: 700 }}>⚠️ {questions.length - answered} question{questions.length - answered !== 1 ? "s" : ""} unanswered!</span>}
            </p>
            {regConfig?.recitation_test_required && (
              <div style={{ background: "rgba(201,168,76,.08)", borderRadius: 12, padding: "10px 14px", marginBottom: 16, border: "1px solid rgba(201,168,76,.2)", display: "flex", gap: 8, alignItems: "flex-start", textAlign: "left" }}>
                <Mic size={14} color={GOLD} style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: 12, color: "rgba(255,255,255,.7)", margin: 0 }}>
                  After submitting you will be directed to the <strong style={{ color: GOLD }}>Recitation Test</strong> — please have a microphone ready.
                </p>
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowConfirm(false)} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid rgba(255,255,255,.2)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer", minHeight: 48 }}>
                Go Back
              </button>
              <button onClick={handleSubmit} disabled={submitting} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${GOLD},#b8902a)`, color: "#fff", fontWeight: 800, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? .7 : 1, minHeight: 48 }}>
                {submitting ? "Submitting…" : "Confirm Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EntranceExamTaking;
