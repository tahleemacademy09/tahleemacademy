import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useAcademySettings } from "@/hooks/useAcademySettings";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

const PaymentBanner = () => {
  const { profile, hasRole } = useAuth();
  const navigate = useNavigate();
  const { isPaymentEnabled, isHoliday, loading } = useAcademySettings();

  if (loading) return null;
  if (hasRole("admin") || hasRole("teacher")) return null;
  if (!profile) return null;

  // If payments are OFF or academy is on holiday, no banner
  if (!isPaymentEnabled || isHoliday) return null;

  if (profile.payment_status === "paid" || profile.payment_status === "exempt" || profile.is_payment_exempt) return null;
  if (profile.payment_status !== "grace") return null;

  const endDate = profile.subscription_end_date ? new Date(profile.subscription_end_date) : null;
  const daysLeft = endDate ? Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 86400000)) : 0;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-amber-800">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>
          Your enrollment is incomplete. {daysLeft > 0 ? `${daysLeft} day${daysLeft > 1 ? "s" : ""} remaining.` : "Grace period expired."}
        </span>
      </div>
      <Button
        size="sm"
        onClick={() => navigate("/student/payment")}
        className="text-xs whitespace-nowrap"
        style={{ background: "#c9973a", color: "#fff" }}
      >
        Pay Now →
      </Button>
    </div>
  );
};

export default PaymentBanner;
