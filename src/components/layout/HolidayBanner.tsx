import { useAcademySettings } from "@/hooks/useAcademySettings";
import { Moon } from "lucide-react";

const HolidayBanner = () => {
  const { settings, isHoliday, loading } = useAcademySettings();

  if (loading || !isHoliday) return null;

  const resumeDate = settings.resume_date ? new Date(settings.resume_date) : null;
  const daysLeft = resumeDate ? Math.max(0, Math.ceil((resumeDate.getTime() - Date.now()) / 86400000)) : 0;

  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3 border-b" style={{ background: "linear-gradient(135deg, #1a2f23 0%, #0f3122 100%)" }}>
      <div className="flex items-center gap-2 text-sm" style={{ color: "#c9973a" }}>
        <Moon className="h-4 w-4 flex-shrink-0" />
        <span>
          🌙 Academy Holiday
          {settings.holiday_message && ` — ${settings.holiday_message}`}
          {resumeDate && ` • Resumes: ${resumeDate.toLocaleDateString()} (${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining)`}
        </span>
      </div>
    </div>
  );
};

export default HolidayBanner;
