// src/components/shared/StudentMaintenanceGate.tsx
// Full-screen block shown to students the moment they log in while
// academy_status === "maintenance". Replaces the entire app — no nav,
// no dashboard, no dismiss — until an admin flips status back to Active.

import { useAcademySettings } from "@/hooks/useAcademySettings";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Wrench, LogOut } from "lucide-react";

export default function StudentMaintenanceGate() {
  const { settings } = useAcademySettings();
  const { signOut } = useAuth();
  const { language } = useLanguage();

  const message = language === "ar"
    ? settings.holiday_message_ar || settings.holiday_message
    : settings.holiday_message;

  let resumeLabel = "";
  if (settings.resume_date) {
    try {
      resumeLabel = new Date(settings.resume_date + "T00:00:00").toLocaleDateString(
        language === "ar" ? "ar-SA" : "en-GB",
        { day: "numeric", month: "long", year: "numeric" }
      );
    } catch { /* ignore */ }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(180deg, #F0F9FF 0%, #EFF6FF 100%)",
      padding: 20,
      fontFamily: "'Cairo', sans-serif",
    }}>
      <div style={{
        maxWidth: 420,
        width: "100%",
        background: "#fff",
        borderRadius: 24,
        border: "1.5px solid #BFDBFE",
        boxShadow: "0 8px 30px rgba(30,58,138,0.08)",
        padding: "36px 28px",
        textAlign: "center",
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18, margin: "0 auto 18px",
          background: "#DBEAFE",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Wrench size={28} color="#2563EB" />
        </div>

        <p style={{ fontSize: 13, fontWeight: 700, color: "#2563EB", letterSpacing: .5, margin: "0 0 6px" }}>
          🌙 {language === "ar" ? "بسم الله الرحمن الرحيم" : "Bismillāhi-r-Raḥmāni-r-Raḥīm"}
        </p>

        <h1 style={{ fontSize: 19, fontWeight: 800, color: "#1E3A8A", margin: "0 0 12px" }}>
          {language === "ar" ? "صيانة مجدولة" : "Scheduled Maintenance"}
        </h1>

        {message && (
          <p style={{
            fontSize: 14, color: "#1E3A8A", lineHeight: 1.7, margin: "0 0 14px",
            direction: language === "ar" ? "rtl" : "ltr",
            fontFamily: language === "ar" ? "'Amiri', serif" : "inherit",
          }}>
            {message}
          </p>
        )}

        {resumeLabel && (
          <p style={{ fontSize: 12, fontWeight: 700, color: "#1D4ED8", margin: "0 0 22px" }}>
            📅 {language === "ar" ? "يستأنف بإذن الله" : "Resumes"}: {resumeLabel}
          </p>
        )}

        <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 24px", lineHeight: 1.6 }}>
          {language === "ar"
            ? "جميع أقسام المنصة معطلة مؤقتاً. جزاكم الله خيراً على صبركم."
            : "All platform features are temporarily unavailable. Barak Allahu feekum for your patience."}
        </p>

        <button
          onClick={() => signOut()}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#1D4ED8",
            fontSize: 13, fontWeight: 700, borderRadius: 12,
            padding: "10px 18px", cursor: "pointer",
          }}
        >
          <LogOut size={14} />
          {language === "ar" ? "تسجيل الخروج" : "Sign out"}
        </button>
      </div>
    </div>
  );
}
