/* src/pages/admin/PaymentSettings.tsx
   Registration Fee Payment Toggle — Admin can turn on/off payment requirement instantly
   Uses existing academy_settings table (payment_enabled key)
*/
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademySettings } from "@/hooks/useAcademySettings";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Loader2, CreditCard, ShieldCheck, ShieldAlert, Clock, Bell, AlertTriangle } from "lucide-react";

const G = "#064E3B";

export default function PaymentSettings() {
  const { user } = useAuth();
  const { settings, isPaymentEnabled, loading, updateMultiple } = useAcademySettings();
  const { toast } = useToast();
  const [toggling, setToggling] = useState(false);
  const [reason, setReason] = useState("");
  const [graceDays, setGraceDays] = useState("7");
  const [notifyStudents, setNotifyStudents] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<"enable" | "disable" | null>(null);

  const confirmToggle = (action: "enable" | "disable") => {
    setPendingAction(action);
    setShowConfirm(true);
  };

  const executeToggle = async () => {
    if (!pendingAction) return;
    setToggling(true);
    setShowConfirm(false);

    const enabling = pendingAction === "enable";
    const now = new Date().toISOString();

    const updates: Record<string, string | null> = {
      payment_enabled: enabling ? "true" : "false",
      payment_enabled_at: enabling ? now : null,
      payment_disabled_at: enabling ? null : now,
      payment_disabled_by: enabling ? null : (user?.id || null),
      payment_disabled_reason: enabling ? null : (reason || "Admin disabled payment"),
      payment_grace_days: graceDays,
    };

    await updateMultiple(updates, user?.id);

    // Notify all students if requested
    if (notifyStudents) {
      const { data: roles } = await supabase.from("user_roles" as any)
        .select("user_id").eq("role", "student");
      if (roles?.length) {
        await supabase.from("notifications" as any).insert(
          (roles as any[]).map((r: any) => ({
            user_id: r.user_id,
            title: enabling
              ? "Registration fee payment required"
              : "Fee payment temporarily waived",
            message: enabling
              ? `Registration fee payments are now active. Grace period: ${graceDays} days.`
              : (reason || "The admin has temporarily waived the registration fee requirement."),
            type: "payment_update",
          }))
        );
      }
    }

    toast({
      title: enabling ? "✅ Payment requirement enabled" : "✅ Payment requirement disabled",
      description: enabling
        ? `Students have ${graceDays} days grace period`
        : "Students can access without payment until re-enabled",
    });

    setReason("");
    setToggling(false);
    setPendingAction(null);
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <Loader2 size={28} style={{ animation: "spin .8s linear infinite", color: G }} />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F8F9FA" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: isPaymentEnabled ? "#FEF2F2" : "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CreditCard size={20} color={isPaymentEnabled ? "#DC2626" : "#16A34A"} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#111", margin: 0 }}>Payment Settings</h1>
            <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>Control registration fee requirement for all students</p>
          </div>
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 600, margin: "0 auto" }}>
        {/* Current Status Banner */}
        <div style={{
          background: isPaymentEnabled ? "#FEF2F2" : "#F0FDF4",
          border: `2px solid ${isPaymentEnabled ? "#FECACA" : "#86EFAC"}`,
          borderRadius: 16, padding: 20, marginBottom: 16,
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: isPaymentEnabled ? "#DC2626" : "#16A34A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {isPaymentEnabled
              ? <ShieldAlert size={24} color="#fff" />
              : <ShieldCheck size={24} color="#fff" />}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 900, fontSize: 16, color: isPaymentEnabled ? "#991B1B" : "#166534", margin: 0 }}>
              Payment is currently {isPaymentEnabled ? "REQUIRED" : "WAIVED"}
            </p>
            <p style={{ fontSize: 12, color: isPaymentEnabled ? "#DC2626" : "#16A34A", margin: "3px 0 0" }}>
              {isPaymentEnabled
                ? `Students must pay the registration fee to access content. Grace period: ${settings.payment_grace_days || 7} days.`
                : "Students can access all content without paying the registration fee."}
            </p>
            {settings.payment_disabled_at && !isPaymentEnabled && (
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: "4px 0 0" }}>
                Disabled: {new Date(settings.payment_disabled_at).toLocaleString()}
                {settings.payment_disabled_reason && ` — ${settings.payment_disabled_reason}`}
              </p>
            )}
          </div>
        </div>

        {/* Main toggle card */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <p style={{ fontWeight: 800, fontSize: 15, color: "#111", margin: 0 }}>Registration Fee Requirement</p>
              <p style={{ fontSize: 12, color: "#6B7280", margin: "3px 0 0" }}>
                {isPaymentEnabled ? "Turn off to waive fees temporarily" : "Turn on to require payment"}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {toggling && <Loader2 size={16} style={{ animation: "spin .8s linear infinite", color: G }} />}
              <Switch
                checked={isPaymentEnabled}
                disabled={toggling}
                onCheckedChange={(v) => confirmToggle(v ? "enable" : "disable")}
              />
            </div>
          </div>

          {/* Grace period */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 6 }}>
              <Clock size={11} style={{ marginRight: 4, verticalAlign: "middle" }} />
              Grace Period (days after enabling)
            </label>
            <input
              type="number" min={0} max={90} value={graceDays}
              onChange={e => setGraceDays(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 14, outline: "none", boxSizing: "border-box" as const }}
            />
            <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
              Students get this many days after payment is enabled before losing access
            </p>
          </div>

          {/* Reason for disabling */}
          {!isPaymentEnabled && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 6 }}>
                Reason for waiving (shown to students)
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Ramadan special — fees waived for this month"
                rows={2}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box" as const }}
              />
            </div>
          )}

          {/* Notify toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "#F9FAFB", borderRadius: 12, border: "1px solid #E5E7EB" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Bell size={14} color="#6B7280" />
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#374151", margin: 0 }}>Notify all students</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Send in-app notification when toggled</p>
              </div>
            </div>
            <Switch checked={notifyStudents} onCheckedChange={setNotifyStudents} />
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20 }}>
          <p style={{ fontWeight: 800, fontSize: 14, color: "#111", marginBottom: 12 }}>Quick Actions</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Enable — Ramadan (30 days free)", action: () => { setReason("Ramadan Mubarak! Registration fees waived for Ramadan."); setGraceDays("30"); confirmToggle("disable"); }, color: "#D97706", bg: "#FFF7ED" },
              { label: "Enable — New term grace (14 days)", action: () => { setGraceDays("14"); confirmToggle("enable"); }, color: "#1D4ED8", bg: "#EFF6FF" },
              { label: "Disable — System maintenance", action: () => { setReason("System maintenance in progress. Fees waived temporarily."); confirmToggle("disable"); }, color: "#7C3AED", bg: "#F5F3FF" },
              { label: "Enable — Full payment required now", action: () => { setGraceDays("0"); confirmToggle("enable"); }, color: "#DC2626", bg: "#FEF2F2" },
            ].map((q, i) => (
              <button key={i} onClick={q.action}
                style={{ padding: "11px 16px", borderRadius: 12, border: `1.5px solid ${q.color}33`, background: q.bg, cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 600, color: q.color }}>
                {q.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Confirm Dialog */}
      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, maxWidth: 380, width: "100%", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: pendingAction === "disable" ? "#FEF2F2" : "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <AlertTriangle size={26} color={pendingAction === "disable" ? "#DC2626" : "#16A34A"} />
            </div>
            <h3 style={{ fontWeight: 800, fontSize: 17, color: "#111", marginBottom: 8 }}>
              {pendingAction === "enable" ? "Enable payment requirement?" : "Waive payment requirement?"}
            </h3>
            <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 20, lineHeight: 1.6 }}>
              {pendingAction === "enable"
                ? `Students will have ${graceDays} days grace period before losing access.${notifyStudents ? " They will be notified." : ""}`
                : `Students will be able to access content without paying.${notifyStudents ? " They will be notified." : ""}`}
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowConfirm(false)}
                style={{ flex: 1, padding: "11px", borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={executeToggle}
                style={{ flex: 1, padding: "11px", borderRadius: 12, border: "none", background: pendingAction === "disable" ? "#DC2626" : "#16A34A", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
