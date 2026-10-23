import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useAcademySettings } from "@/hooks/useAcademySettings";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X, Clock } from "lucide-react";
import { useState } from "react";

const DISMISS_KEY = "payment_banner_dismissed";
// Reminder dismiss is keyed by day so it reappears each day it's still relevant,
// instead of disappearing for the rest of the subscription like the grace banner.
const REMINDER_DISMISS_KEY_PREFIX = "payment_renewal_reminder_dismissed_";
const REMINDER_WINDOW_DAYS = 7;

const todayKey = () => new Date().toISOString().slice(0, 10);

const PaymentBanner = () => {
  const { profile, hasRole } = useAuth();
  const navigate = useNavigate();
  const { isPaymentEnabled, isHoliday, loading } = useAcademySettings();
  const [dismissed, setDismissed] = useState(() =>
    sessionStorage.getItem(DISMISS_KEY) === "1"
  );
  const [reminderDismissed, setReminderDismissed] = useState(() =>
    sessionStorage.getItem(REMINDER_DISMISS_KEY_PREFIX + todayKey()) === "1"
  );

  if (loading) return null;
  if (hasRole("admin") || hasRole("teacher")) return null;
  if (!profile) return null;

  // If payments are OFF or academy is on holiday, no banner
  if (!isPaymentEnabled || isHoliday) return null;

  if (profile.payment_status === "exempt" || (profile as any).is_payment_exempt) return null;

  const endDate = (profile as any).subscription_end_date ? new Date((profile as any).subscription_end_date as string) : null;
  const daysLeft = endDate ? Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 86400000)) : 0;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const handleReminderDismiss = () => {
    sessionStorage.setItem(REMINDER_DISMISS_KEY_PREFIX + todayKey(), "1");
    setReminderDismissed(true);
  };

  // ── Grace period: already past expiry, access is at risk/limited ──────
  if (profile.payment_status === "grace") {
    if (dismissed) return null;
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
  }

  // ── Pre-expiry reminder: still paid/active, but renewal is coming up ──
  if (
    profile.payment_status === "paid" &&
    endDate &&
    daysLeft > 0 &&
    daysLeft <= REMINDER_WINDOW_DAYS
  ) {
    if (reminderDismissed) return null;
    return (
      <div className="bg-blue-50 border-b border-blue-200 px-3 py-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-blue-800 min-w-0">
          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">
            Your subscription renews in {daysLeft}d.
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            size="sm"
            onClick={() => navigate("/student/enrollment-payment")}
            className="text-xs whitespace-nowrap h-7 px-2.5"
            style={{ background: "#075E54", color: "#fff" }}
          >
            Renew Now →
          </Button>
          <button
            onClick={handleReminderDismiss}
            className="p-1 rounded-full hover:bg-blue-100 text-blue-600 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default PaymentBanner;
