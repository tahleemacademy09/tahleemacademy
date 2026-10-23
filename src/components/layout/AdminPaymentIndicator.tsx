import { useAcademySettings } from "@/hooks/useAcademySettings";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { CreditCard, Moon, Power } from "lucide-react";

const AdminPaymentIndicator = () => {
  const { settings, isPaymentEnabled, isHoliday, loading } = useAcademySettings();
  const navigate = useNavigate();

  if (loading) return null;

  if (!isPaymentEnabled) {
    return (
      <div className="mx-4 mt-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5 space-y-1">
        <div className="flex items-center gap-2 text-sm font-medium text-destructive">
          <CreditCard className="h-4 w-4" />
          ⚠️ PAYMENTS OFF
        </div>
        <p className="text-xs text-muted-foreground">
          Students have free access.
          {settings.payment_disabled_reason && ` Reason: ${settings.payment_disabled_reason}`}
        </p>
        <Button
          size="sm"
          className="text-xs mt-1"
          style={{ background: "#c9973a", color: "#fff" }}
          onClick={() => navigate("/admin/calendar")}
        >
          <Power className="h-3 w-3 mr-1" /> Manage
        </Button>
      </div>
    );
  }

  if (isHoliday) {
    const resumeDate = settings.resume_date ? new Date(settings.resume_date) : null;
    const daysLeft = resumeDate ? Math.max(0, Math.ceil((resumeDate.getTime() - Date.now()) / 86400000)) : 0;
    return (
      <div className="mx-4 mt-2 p-3 rounded-lg border border-amber-300/30 bg-amber-50 space-y-1">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
          <Moon className="h-4 w-4" />
          🌙 On Holiday
        </div>
        <p className="text-xs text-amber-700">
          {resumeDate && `Resumes: ${resumeDate.toLocaleDateString()} — ${daysLeft}d remaining`}
        </p>
      </div>
    );
  }

  return null;
};

export default AdminPaymentIndicator;
