import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, Mic, Eye, EyeOff, Activity, AlertTriangle, Camera, CameraOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";

interface ViolationEntry {
  type: string;
  time: string;
  details: string;
}

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
  face_not_detected: {
    en: "⚠️ Your face is not visible. Please look at the screen.",
    ar: "⚠️ وجهك غير مرئي. يرجى النظر إلى الشاشة.",
  },
  tab_switch_return: {
    en: "⚠️ You returned from another tab.",
    ar: "⚠️ لقد عدت من علامة تبويب أخرى.",
  },
};

const violationLabels: Record<string, { en: string; ar: string }> = {
  tab_switch: { en: "Tab Switch", ar: "تبديل التبويب" },
  tab_switch_return: { en: "Tab Return", ar: "عودة من تبويب" },
  fullscreen_exit: { en: "Fullscreen Exit", ar: "خروج من ملء الشاشة" },
  webcam_disabled: { en: "Camera Off", ar: "الكاميرا معطلة" },
  copy_paste: { en: "Copy/Paste", ar: "نسخ/لصق" },
  unusual_audio: { en: "Audio Alert", ar: "تنبيه صوتي" },
  dev_tools: { en: "Dev Tools", ar: "أدوات المطور" },
  right_click: { en: "Right Click", ar: "نقر بالزر الأيمن" },
  face_not_detected: { en: "Face Missing", ar: "وجه غير مرئي" },
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
  recentViolations,
  getStream,
}: ProctoringOverlayProps) => {
  const { t } = useLanguage();
  const [showWarning, setShowWarning] = useState(false);
  const [warningText, setWarningText] = useState("");
  const [showActivity, setShowActivity] = useState(false);

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
  }, [lastWarningType, violations]);

  const statusColor = suspicionLevel === "low" ? "bg-emerald-500" :
    suspicionLevel === "medium" ? "bg-yellow-500" :
    "bg-destructive";

  const statusLabel = suspicionLevel === "low" ? t("Clear", "سليم") :
    suspicionLevel === "medium" ? t("Caution", "تحذير") :
    suspicionLevel === "high" ? t("Warning", "إنذار") :
    t("Critical", "حرج");

  const strikeDots = Array.from({ length: maxStrikes }, (_, i) => i < strikes);

  return (
    <>
      {/* Top-right proctoring status bar */}
      <div className="fixed top-2 right-2 z-[90] flex flex-col items-end gap-1.5">
        {/* Main status badge */}
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background/90 backdrop-blur-sm px-3 py-1.5 shadow-md">
          {/* Camera status */}
          <div className="flex items-center gap-1">
            {cameraReady ? (
              <Camera className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <CameraOff className="h-3.5 w-3.5 text-destructive animate-pulse" />
            )}
          </div>

          {/* Face detection */}
          <div className="flex items-center gap-1">
            {faceDetected ? (
              <Eye className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-destructive animate-pulse" />
            )}
            <span className="text-[10px] font-medium text-muted-foreground">
              {faceDetected ? t("Face ✓", "الوجه ✓") : t("No Face", "لا وجه")}
            </span>
          </div>

          {/* Audio */}
          {audioMonitoring && (
            <Mic className="h-3.5 w-3.5 text-emerald-500" />
          )}

          {/* Integrity */}
          <div className="flex items-center gap-1 border-l border-border pl-2">
            <div className={`h-2 w-2 rounded-full ${statusColor}`} />
            <span className="text-[10px] font-mono font-bold">{Math.round(integrityScore)}%</span>
          </div>

          {/* Strikes */}
          <div className="flex gap-0.5 border-l border-border pl-2">
            {strikeDots.map((filled, i) => (
              <div key={i} className={`h-2 w-2 rounded-full ${
                filled ? "bg-destructive" : "bg-muted"
              }`} />
            ))}
          </div>

          {/* Activity toggle */}
          <button
            onClick={() => setShowActivity(!showActivity)}
            className="ml-1 p-0.5 rounded hover:bg-muted transition-colors"
            title={t("Activity Log", "سجل النشاط")}
          >
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
            {violations > 0 && (
              <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-destructive text-[8px] text-white flex items-center justify-center font-bold">
                {violations}
              </span>
            )}
          </button>
        </div>

        {/* Suspicion level badge when elevated */}
        {suspicionLevel !== "low" && (
          <Badge variant="destructive" className="text-[10px] gap-1 px-2 py-0.5">
            <ShieldAlert className="h-3 w-3" />
            {statusLabel} — {t("Strikes", "إنذارات")}: {strikes}/{maxStrikes}
          </Badge>
        )}

        {/* Activity log dropdown */}
        <AnimatePresence>
          {showActivity && (
            <motion.div
              initial={{ opacity: 0, y: -5, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -5, scale: 0.95 }}
              className="w-72 max-h-64 overflow-y-auto rounded-lg border border-border bg-background/95 backdrop-blur-sm shadow-xl"
            >
              <div className="px-3 py-2 border-b border-border flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold">{t("Proctoring Activity", "نشاط المراقبة")}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{violations} {t("events", "أحداث")}</span>
              </div>
              {recentViolations.length === 0 ? (
                <div className="px-3 py-4 text-center">
                  <ShieldCheck className="h-6 w-6 text-emerald-500 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">{t("No suspicious activity", "لا يوجد نشاط مشبوه")}</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recentViolations.map((v, i) => (
                    <div key={i} className="px-3 py-2 flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium">
                            {violationLabels[v.type]
                              ? t(violationLabels[v.type].en, violationLabels[v.type].ar)
                              : v.type}
                          </span>
                          <span className="text-[9px] text-muted-foreground font-mono">{v.time}</span>
                        </div>
                        {v.details && (
                          <p className="text-[10px] text-muted-foreground truncate">{v.details}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
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
    </>
  );
};

export default ProctoringOverlay;