/* src/pages/admin/RegistrationSettings.tsx
   NEW PAGE — Admin controls for registration open/close
   When OPEN: students create account → pay entrance fee → onboarding → entrance exam → access
   When CLOSED: no new registrations accepted (existing students unaffected)
   
   Add to App.tsx:
     const RegistrationSettings = lazy(() => import("./pages/admin/RegistrationSettings"));
     <Route path="/admin/registration-settings" element={<RegistrationSettings />} />
   
   Link in PaymentSettings or admin sidebar.
*/
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademySettings } from "@/hooks/useAcademySettings";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  UserPlus, UserX, CreditCard, FileText, Mic, Shield,
  AlertTriangle, CheckCircle2, Loader2, Settings, Bell,
  GraduationCap, Lock, Unlock, ChevronRight
} from "lucide-react";

const G = "#064E3B";

interface RegConfig {
  registration_open: boolean;
  entrance_fee_enabled: boolean;
  entrance_fee_amount: number;
  entrance_fee_currency: string;
  entrance_exam_required: boolean;
  recitation_test_required: boolean;
  onboarding_required: boolean;
  max_daily_registrations: number;
  registration_message: string;
  registration_message_ar: string;
  closed_message: string;
  closed_message_ar: string;
}

const DEFAULT: RegConfig = {
  registration_open: true,
  entrance_fee_enabled: true,
  entrance_fee_amount: 5000,
  entrance_fee_currency: "NGN",
  entrance_exam_required: true,
  recitation_test_required: true,
  onboarding_required: true,
  max_daily_registrations: 0,
  registration_message: "Welcome to Tahleem Academy! Complete your registration to begin your Islamic learning journey.",
  registration_message_ar: "مرحباً بك في أكاديمية تعليم! أكمل تسجيلك لبدء رحلتك التعليمية الإسلامية.",
  closed_message: "Registration is currently closed. Please check back later.",
  closed_message_ar: "التسجيل مغلق حالياً. يرجى المراجعة لاحقاً.",
};

export default function RegistrationSettings() {
  const { user } = useAuth();
  const { settings, loading: settingsLoading } = useAcademySettings();
  const { toast } = useToast();

  const [config, setConfig]         = useState<RegConfig>(DEFAULT);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<boolean | null>(null);
  const [recentRegs, setRecentRegs] = useState<any[]>([]);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    // Load from academy_settings table
    const { data } = await supabase
      .from("academy_settings" as any)
      .select("key, value")
      .in("key", [
        "registration_open", "entrance_fee_enabled", "entrance_fee_amount",
        "entrance_fee_currency", "entrance_exam_required", "recitation_test_required",
        "onboarding_required", "max_daily_registrations",
        "registration_message", "registration_message_ar",
        "closed_message", "closed_message_ar",
      ]);

    if (data) {
      const map: Record<string, string> = {};
      (data as any[]).forEach((row: any) => { map[row.key] = row.value; });
      setConfig(c => ({
        ...c,
        registration_open: map.registration_open !== "false",
        entrance_fee_enabled: map.entrance_fee_enabled !== "false",
        entrance_fee_amount: Number(map.entrance_fee_amount) || 5000,
        entrance_fee_currency: map.entrance_fee_currency || "NGN",
        entrance_exam_required: map.entrance_exam_required !== "false",
        recitation_test_required: map.recitation_test_required !== "false",
        onboarding_required: map.onboarding_required !== "false",
        max_daily_registrations: Number(map.max_daily_registrations) || 0,
        registration_message: map.registration_message || c.registration_message,
        registration_message_ar: map.registration_message_ar || c.registration_message_ar,
        closed_message: map.closed_message || c.closed_message,
        closed_message_ar: map.closed_message_ar || c.closed_message_ar,
      }));
    }

    // Load recent registrations
    const { data: regs } = await supabase
      .from("profiles")
      .select("full_name, created_at, country")
      .order("created_at", { ascending: false })
      .limit(5);
    setRecentRegs(regs || []);
    setLoading(false);
  };

  const saveAll = async () => {
    setSaving(true);
    const entries = Object.entries(config).map(([key, value]) => ({
      key, value: String(value), updated_by: user?.id, updated_at: new Date().toISOString(),
    }));

    for (const entry of entries) {
      await supabase.from("academy_settings" as any).upsert(entry as any, { onConflict: "key" });
    }

    // Notify all students if registration just closed
    if (!config.registration_open) {
      const { data: students } = await supabase.from("user_roles" as any).select("user_id").eq("role", "student");
      if (students?.length) {
        await supabase.from("notifications" as any).insert(
          (students as any[]).map((s: any) => ({
            user_id: s.user_id,
            title: "Registration Status Update",
            message: config.closed_message,
            type: "system_announcement",
          }))
        );
      }
    }

    setSaving(false);
    toast({ title: config.registration_open ? "✅ Registration is now OPEN" : "✅ Registration is now CLOSED" });
    setShowConfirm(false);
  };

  const handleToggleReg = (v: boolean) => {
    setPendingToggle(v);
    setShowConfirm(true);
  };

  const sec: React.CSSProperties = { background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", overflow: "hidden", marginBottom: 14 };
  const secH: React.CSSProperties = { padding: "11px 16px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 8 };
  const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none", background: "#FAFAFA", boxSizing: "border-box" as const };
  const tog = (label: string, sub: string, checked: boolean, onChange: (v: boolean) => void) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #F9FAFB" }}>
      <div>
        <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>{label}</p>
        {sub && <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{sub}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );

  if (loading || settingsLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <Loader2 size={28} style={{ animation: "spin .8s linear infinite", color: G }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: config.registration_open ? "#F0FDF4" : "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {config.registration_open ? <Unlock size={20} color="#16A34A" /> : <Lock size={20} color="#DC2626" />}
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: "#111", margin: 0 }}>Registration Settings</h1>
            <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>Control who can register and what they must complete</p>
          </div>
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 640, margin: "0 auto" }}>

        {/* ── STATUS BANNER ── */}
        <div style={{
          borderRadius: 16, padding: "18px 20px", marginBottom: 16,
          background: config.registration_open ? "#F0FDF4" : "#FEF2F2",
          border: `2px solid ${config.registration_open ? "#86EFAC" : "#FECACA"}`,
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{ width: 50, height: 50, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: config.registration_open ? "#16A34A" : "#DC2626", flexShrink: 0 }}>
            {config.registration_open ? <UserPlus size={22} color="#fff" /> : <UserX size={22} color="#fff" />}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 900, fontSize: 16, margin: 0, color: config.registration_open ? "#166534" : "#991B1B" }}>
              Registration is {config.registration_open ? "OPEN" : "CLOSED"}
            </p>
            <p style={{ fontSize: 12, margin: "3px 0 0", color: config.registration_open ? "#16A34A" : "#DC2626" }}>
              {config.registration_open
                ? `New students can register${config.entrance_fee_enabled ? ` · ₦${config.entrance_fee_amount.toLocaleString()} entrance fee` : " · No fee"}${config.entrance_exam_required ? " · Entrance exam required" : ""}`
                : "No new registrations accepted. Existing students are unaffected."}
            </p>
          </div>
          <Switch checked={config.registration_open} onCheckedChange={handleToggleReg} />
        </div>

        {/* ── REGISTRATION FLOW ── */}
        <div style={sec}>
          <div style={secH}>
            <GraduationCap size={15} color={G} />
            <p style={{ fontWeight: 700, fontSize: 13, color: "#374151", margin: 0 }}>Registration Flow — What students must complete</p>
          </div>

          {/* Visual flow */}
          <div style={{ padding: "14px 16px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", flexWrap: "nowrap" }}>
              {[
                { n: 1, label: "Create Account", always: true, icon: "👤" },
                { n: 2, label: `Pay ₦${config.entrance_fee_amount.toLocaleString()}`, enabled: config.entrance_fee_enabled, icon: "💳" },
                { n: 3, label: "Onboarding", enabled: config.onboarding_required, icon: "📝" },
                { n: 4, label: "Entrance Exam", enabled: config.entrance_exam_required, icon: "📋" },
                { n: 5, label: "Recitation Test", enabled: config.recitation_test_required, icon: "🎤" },
                { n: 6, label: "Dashboard Access", always: true, icon: "🏠" },
              ].map((step, i, arr) => {
                const active = step.always || step.enabled;
                return (
                  <div key={step.n} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: active ? G : "#E5E7EB", margin: "0 auto 4px", opacity: active ? 1 : .45 }}>
                        {step.icon}
                      </div>
                      <p style={{ fontSize: 9, fontWeight: 700, color: active ? G : "#9CA3AF", margin: 0, maxWidth: 60, textAlign: "center", lineHeight: 1.2 }}>{step.label}</p>
                    </div>
                    {i < arr.length - 1 && <ChevronRight size={14} color={active ? G : "#D1D5DB"} style={{ flexShrink: 0 }} />}
                  </div>
                );
              })}
            </div>
          </div>

          {tog("Onboarding Questions", "Student tells us about their background before exam", config.onboarding_required, v => setConfig(c => ({ ...c, onboarding_required: v })))}
          {tog("Entrance Exam", "Written placement test required after payment", config.entrance_exam_required, v => setConfig(c => ({ ...c, entrance_exam_required: v })))}
          {tog("Recitation Test", "Audio/live Quran recitation evaluation", config.recitation_test_required, v => setConfig(c => ({ ...c, recitation_test_required: v })))}
        </div>

        {/* ── ENTRANCE FEE ── */}
        <div style={sec}>
          <div style={secH}>
            <CreditCard size={15} color={G} />
            <p style={{ fontWeight: 700, fontSize: 13, color: "#374151", margin: 0 }}>Entrance Fee</p>
          </div>
          {tog("Require Entrance Fee", "Students must pay before accessing onboarding & exam", config.entrance_fee_enabled, v => setConfig(c => ({ ...c, entrance_fee_enabled: v })))}
          <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>Fee Amount</label>
              <input type="number" style={inp} value={config.entrance_fee_amount} min={0}
                onChange={e => setConfig(c => ({ ...c, entrance_fee_amount: Number(e.target.value) }))}
                disabled={!config.entrance_fee_enabled} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>Currency</label>
              <select style={inp} value={config.entrance_fee_currency}
                onChange={e => setConfig(c => ({ ...c, entrance_fee_currency: e.target.value }))}
                disabled={!config.entrance_fee_enabled}>
                <option value="NGN">NGN (₦)</option>
                <option value="USD">USD ($)</option>
                <option value="GBP">GBP (£)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GHS">GHS (₵)</option>
              </select>
            </div>
          </div>
          {config.entrance_fee_enabled && (
            <div style={{ padding: "10px 16px 14px" }}>
              <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FFF7ED", border: "1px solid #FED7AA", fontSize: 12, color: "#C2410C" }}>
                ⚠️ Make sure your Paystack key is set in <code>VITE_PAYSTACK_PUBLIC_KEY</code> for payments to work.
              </div>
            </div>
          )}
        </div>

        {/* ── MESSAGES ── */}
        <div style={sec}>
          <div style={secH}>
            <Bell size={15} color={G} />
            <p style={{ fontWeight: 700, fontSize: 13, color: "#374151", margin: 0 }}>Messages Shown to Students</p>
          </div>
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>Welcome Message (shown on registration page)</label>
              <textarea rows={2} style={{ ...inp, resize: "none" }} value={config.registration_message}
                onChange={e => setConfig(c => ({ ...c, registration_message: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>Welcome Message (Arabic)</label>
              <textarea rows={2} style={{ ...inp, resize: "none", direction: "rtl" }} value={config.registration_message_ar}
                onChange={e => setConfig(c => ({ ...c, registration_message_ar: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>Closed Message (shown when registration is off)</label>
              <textarea rows={2} style={{ ...inp, resize: "none" }} value={config.closed_message}
                onChange={e => setConfig(c => ({ ...c, closed_message: e.target.value }))} />
            </div>
          </div>
        </div>

        {/* ── LIMITS ── */}
        <div style={sec}>
          <div style={secH}>
            <Shield size={15} color={G} />
            <p style={{ fontWeight: 700, fontSize: 13, color: "#374151", margin: 0 }}>Limits</p>
          </div>
          <div style={{ padding: "14px 16px" }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>Max Registrations Per Day (0 = unlimited)</label>
            <input type="number" style={inp} value={config.max_daily_registrations} min={0}
              onChange={e => setConfig(c => ({ ...c, max_daily_registrations: Number(e.target.value) }))} />
            <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4, marginBottom: 0 }}>Set to 0 to allow unlimited registrations per day</p>
          </div>
        </div>

        {/* ── RECENT REGISTRATIONS ── */}
        {recentRegs.length > 0 && (
          <div style={sec}>
            <div style={secH}>
              <UserPlus size={15} color={G} />
              <p style={{ fontWeight: 700, fontSize: 13, color: "#374151", margin: 0 }}>Recent Registrations</p>
            </div>
            {recentRegs.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid #F9FAFB" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: "#1D4ED8", flexShrink: 0 }}>
                  {(r.full_name || "?")[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>{r.full_name || "Unknown"}</p>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{r.country || "—"} · {new Date(r.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Save button */}
        <button onClick={saveAll} disabled={saving}
          style={{ width: "100%", padding: "14px 0", borderRadius: 13, border: "none", cursor: saving ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 15, color: "#fff", background: saving ? "#9CA3AF" : G, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {saving ? <><Loader2 size={16} style={{ animation: "spin .8s linear infinite" }} /> Saving…</> : <><Settings size={16} /> Save All Settings</>}
        </button>
      </div>

      {/* Confirm Dialog */}
      <Dialog open={showConfirm} onOpenChange={v => !v && setShowConfirm(false)}>
        <DialogContent style={{ maxWidth: 380, borderRadius: 20, padding: 28, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", background: pendingToggle ? "#F0FDF4" : "#FEF2F2" }}>
            <AlertTriangle size={26} color={pendingToggle ? "#16A34A" : "#DC2626"} />
          </div>
          <h3 style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>
            {pendingToggle ? "Open Registration?" : "Close Registration?"}
          </h3>
          <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 20, lineHeight: 1.6 }}>
            {pendingToggle
              ? "New students will be able to register on the website. The registration flow you've configured will apply."
              : "No new accounts can be created. Existing students will not be affected."}
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setShowConfirm(false)}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Cancel</button>
            <button onClick={() => { setConfig(c => ({ ...c, registration_open: pendingToggle! })); saveAll(); }}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, color: "#fff", background: pendingToggle ? "#16A34A" : "#DC2626" }}>
              {pendingToggle ? "Open Now" : "Close Now"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
