import { useEffect, useRef, useState } from "react";
import { Camera, ShieldAlert, ShieldCheck, Mic, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";

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
  getStream: () => MediaStream | null;
}

const warningMessages: Record<string, { en: string; ar: string }> = {
  tab_switch: {
    en: "⚠️ You have left the exam window. This has been recorded.",
    ar: "⚠️ لقد غادرت نافذة الامتحان. تم تسجيل ذلك.",
  },
  fullscreen_exit: {
    en: "⚠️ Please return to fullscreen mode.",
    ar: "⚠️ يرجى العودة إلى وضع ملء الشاشة.",
  },
  webcam_disabled: {
    en: "⚠️ Your camera has been disconnected.",
    ar: "⚠️ تم فصل الكاميرا الخاصة بك.",
  },
  copy_paste: {
    en: "⚠️ Copy/paste is not allowed during the exam.",
    ar: "⚠️ النسخ واللصق غير مسموح أثناء الامتحان.",
  },
  unusual_audio: {
    en: "⚠️ Unusual audio detected. Please ensure a quiet environment.",
    ar: "⚠️ تم اكتشاف صوت غير عادي. يرجى التأكد من بيئة هادئة.",
  },
  dev_tools: {
    en: "⚠️ Developer tools are not allowed.",
    ar: "⚠️ أدوات المطور غير مسموحة.",
  },
  right_click: {
    en: "⚠️ Right-click is disabled during the exam.",
    ar: "⚠️ النقر بالزر الأيمن معطل أثناء الامتحان.",
  },
};

const ProctoringOverlay = ({
  cameraReady,
  faceDetected,
  integrityScore,
  suspicionLevel,
  strikes,
  maxStrikes,
  violations,
  lastWarningType,
  audioMonitoring,
  getStream,
}: ProctoringOverlayProps) => {
  const { t } = useLanguage();
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [warningText, setWarningText] = useState("");
  const [expanded, setExpanded] = useState(false);

  // Attach stream to preview video element
  useEffect(() => {
    const stream = getStream();
    if (videoPreviewRef.current && stream) {
      videoPreviewRef.current.srcObject = stream;
      videoPreviewRef.current.play().catch(() => {});
    }
  }, [cameraReady, getStream]);

  // Show warning toast when lastWarningType changes
  useEffect(() => {
    if (!lastWarningType) return;
    const msg = warningMessages[lastWarningType];
    if (msg) {
      setWarningText(t(msg.en, msg.ar));
      setShowWarning(true);
      const timer = setTimeout(() => setShowWarning(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [lastWarningType, violations]); // violations as dep to re-trigger on same type

  const statusColor = suspicionLevel === "low" ? "bg-emerald-500" :
    suspicionLevel === "medium" ? "bg-yellow-500" :
    "bg-destructive";

  const strikeDots = Array.from({ length: maxStrikes }, (_, i) => i < strikes);

  return (
    <>
      {/* Camera Preview — Bottom-right corner */}
      <div
        className={`fixed z-[90] transition-all duration-300 ${
          expanded ? "bottom-4 right-4 w-64 h-48" : "bottom-4 right-4 w-28 h-20"
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="relative w-full h-full rounded-xl overflow-hidden border-2 border-border shadow-lg cursor-pointer bg-black">
          {cameraReady ? (
            <video
              ref={videoPreviewRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Camera className="h-6 w-6 text-muted-foreground animate-pulse" />
            </div>
          )}

          {/* Face detection indicator */}
          <div className={`absolute top-1.5 left-1.5 h-2.5 w-2.5 rounded-full ${
            cameraReady && faceDetected ? "bg-emerald-500" : "bg-destructive animate-pulse"
          }`} />

          {/* Audio monitoring indicator */}
          {audioMonitoring && (
            <div className="absolute top-1.5 right-1.5">
              <Mic className="h-3 w-3 text-white/70" />
            </div>
          )}

          {/* Status bar */}
          <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-0.5 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <div className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />
              <span className="text-[9px] text-white/80 font-mono">{Math.round(integrityScore)}%</span>
            </div>
            <div className="flex gap-0.5">
              {strikeDots.map((filled, i) => (
                <div key={i} className={`h-1.5 w-1.5 rounded-full ${
                  filled ? "bg-destructive" : "bg-white/30"
                }`} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Warning Toast — Top center */}
      <AnimatePresence>
        {showWarning && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-[95] max-w-md"
          >
            <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 backdrop-blur-md px-4 py-3 shadow-lg">
              <ShieldAlert className="h-5 w-5 text-destructive shrink-0" />
              <p className="text-sm font-medium text-destructive">{warningText}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Strike counter overlay when strikes > 0 */}
      {strikes > 0 && (
        <div className="fixed top-16 right-4 z-[90]">
          <Badge variant="destructive" className="text-xs gap-1 px-2 py-1">
            <ShieldAlert className="h-3 w-3" />
            {t("Strikes", "إنذارات")}: {strikes}/{maxStrikes}
          </Badge>
        </div>
      )}
    </>
  );
};

export default ProctoringOverlay;
