import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useAcademySettings } from "@/hooks/useAcademySettings";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";

const DISMISS_KEY = "payment_banner_dismissed";

const PaymentBanner = () => {
  const { profile, hasRole } = useAuth();
  const navigate = useNavigate();
  const { isPaymentEnabled, isHoliday, loading } = useAcademySettings();
  const [dismissed, setDismissed] = useState(() =>
    sessionStorage.getItem(DISMISS_KEY) === "1"
  );

  if (loading || dismissed) return null;
  if (hasRole("admin") || hasRole("teacher")) return null;
  if (!profile) return null;

  // If payments are OFF or academy is on holiday, no banner
  if (!isPaymentEnabled || isHoliday) return null;

  if (profile.payment_status === "paid" || profile.payment_status === "exempt" || (profile as any).is_payment_exempt) return null;
  if (profile.payment_status !== "grace") return null;

  const endDate = (profile as any).subscription_end_date ? new Date((profile as any).subscription_end_date as string) : null;
  const daysLeft = endDate ? Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 86400000)) : 0;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-3 py-1.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 text-xs text-amber-800 min-w-0">
        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="truncate">
          Enrollment incomplete. {daysLeft > 0 ? `${daysLeft}d remaining.` : "Grace period expired."}
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Button
          size="sm"
          onClick={() => navigate("/student/enrollment-payment")}
          className="text-xs whitespace-nowrap h-7 px-2.5"
          style={{ background: "#c9973a", color: "#fff" }}
        >
          Pay Now →
        </Button>
        <button
          onClick={handleDismiss}
          className="p-1 rounded-full hover:bg-amber-100 text-amber-600 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

export default PaymentBanner;
