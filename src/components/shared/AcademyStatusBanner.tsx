// src/components/shared/AcademyStatusBanner.tsx
// Reads academy_status from Supabase → shows a dismissible banner
// to students and teachers when status is "holiday" or "maintenance".
// Renders null when status is "active".

import { useState } from "react";
import { useAcademySettings } from "@/hooks/useAcademySettings";
import { useLanguage } from "@/contexts/LanguageContext";
import { X, Moon, Wrench } from "lucide-react";

interface Props {
  /** Compact single-line mode for use inside a header strip */
  compact?: boolean;
}

export default function AcademyStatusBanner({ compact = false }: Props) {
  const { settings, loading } = useAcademySettings();
  const { language }          = useLanguage();
  const [dismissed, setDismissed] = useState(false);

  if (loading || dismissed) return null;

  const status  = settings.academy_status;
  const message = language === "ar"
    ? settings.holiday_message_ar || settings.holiday_message
    : settings.holiday_message;
  const resumeDate = settings.resume_date;

  if (status === "active") return null;

  /* ── Palette per status ─────────────────────────────────────── */
  const cfg = status === "holiday"
    ? {
        bg:      "#FEF3C7",
        border:  "#FDE68A",
        text:    "#92400E",
        sub:     "#B45309",
        icon:    <Moon size={compact ? 14 : 18} color="#D97706" />,
        emoji:   "🌙",
        title:   language === "ar" ? "الأكاديمية في إجازة" : "Academy Holiday",
      }
    : {
        bg:      "#DBEAFE",
        border:  "#BFDBFE",
        text:    "#1E3A8A",
        sub:     "#1D4ED8",
        icon:    <Wrench size={compact ? 14 : 18} color="#2563EB" />,
        emoji:   "🔧",
        title:   language === "ar" ? "صيانة مجدولة" : "Scheduled Maintenance",
      };

  /* ── Format resume date ─────────────────────────────────────── */
  let resumeLabel = "";
  if (resumeDate) {
    try {
      resumeLabel = new Date(resumeDate + "T00:00:00").toLocaleDateString(
        language === "ar" ? "ar-SA" : "en-GB",
        { day: "numeric", month: "long", year: "numeric" }
      );
    } catch { /* ignore */ }
  }

  if (compact) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: cfg.bg, borderBottom: `1px solid ${cfg.border}`,
        padding: "8px 14px", fontSize: 12, fontWeight: 600, color: cfg.text,
        fontFamily: "'Cairo', sans-serif",
      }}>
        {cfg.icon}
        <span style={{ flex: 1 }}>
          {cfg.emoji} {cfg.title}
          {message ? ` — ${message}` : ""}
          {resumeLabel ? ` · ${language === "ar" ? "يستأنف" : "Resumes"} ${resumeLabel}` : ""}
        </span>
        <button onClick={() => setDismissed(true)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" }}>
          <X size={13} color={cfg.sub} />
        </button>
      </div>
    );
  }

  return (
    <div style={{
      margin: "14px 14px 0",
      borderRadius: 16,
      border: `1.5px solid ${cfg.border}`,
      background: cfg.bg,
      padding: "14px 16px",
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
      position: "relative",
      fontFamily: "'Cairo', sans-serif",
    }}>
      {/* Icon circle */}
      <div style={{
        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
        background: "rgba(255,255,255,.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {cfg.icon}
      </div>

      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 800, fontSize: 14, color: cfg.text, margin: "0 0 4px" }}>
          {cfg.emoji} {cfg.title}
        </p>

        {message && (
          <p style={{
            fontSize: 13, color: cfg.text, margin: "0 0 4px",
            lineHeight: 1.5,
            direction: language === "ar" ? "rtl" : "ltr",
            fontFamily: language === "ar" ? "'Amiri', serif" : "inherit",
          }}>
            {message}
          </p>
        )}

        {resumeLabel && (
          <p style={{
            fontSize: 11, fontWeight: 700, color: cfg.sub,
            margin: 0, display: "flex", alignItems: "center", gap: 4,
          }}>
            📅 {language === "ar" ? "يستأنف بإذن الله" : "Resumes"}: {resumeLabel}
          </p>
        )}
      </div>

      {/* Dismiss */}
      <button onClick={() => setDismissed(true)}
        style={{
          position: "absolute", top: 10, right: 10,
          background: "rgba(255,255,255,.7)", border: "none",
          borderRadius: "50%", width: 24, height: 24,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        <X size={13} color={cfg.sub} />
      </button>
    </div>
  );
}
