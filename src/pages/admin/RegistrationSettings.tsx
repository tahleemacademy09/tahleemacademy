// src/pages/admin/RegistrationSettings.tsx
// Admin panel — every toggle here directly controls Register.tsx behaviour
// Uses useRegistrationSettings hook (same data source as Register.tsx)

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRegistrationSettings, RegistrationConfig } from "@/hooks/useRegistrationSettings";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  UserPlus, UserX, CreditCard, GraduationCap, Mic,
  FileText, AlertTriangle, Loader2, Settings, Bell,
  ChevronRight, Shield, Users, BarChart2, RefreshCw,
} from "lucide-react";

const G = "#064E3B";

/* Stable sub-components — defined outside to prevent keyboard dismiss on re-render */
const Sec = ({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) => (
  <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", overflow: "hidden", marginBottom: 14 }}>
    <div style={{ padding: "11px 16px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 8 }}>
      {icon}<p style={{ fontWeight: 800, fontSize: 12, color: "#374151", margin: 0, textTransform: "uppercase" as const, letterSpacing: .5 }}>{title}</p>
    </div>
    <div style={{ padding: "14px 16px" }}>{children}</div>
  </div>
);
const Tog = ({ label, sub, checked, onChange }: any) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid #F9FAFB" }}>
    <div>
      <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>{label}</p>
      {sub && <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{sub}</p>}
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

export default function RegistrationSettings() {
  const { user }     = useAuth();
  const { toast }    = useToast();
  const { config: serverConfig, loading, saveAll, fetch, currencySymbol } = useRegistrationSettings();

  // Local draft — saved only when admin clicks "Save All Settings"
  const [draft, setDraft]         = useState<RegistrationConfig | null>(null);
  const [saving, setSaving]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingOpen, setPendingOpen] = useState<boolean | null>(null);
  const [recentRegs, setRecentRegs]   = useState<any[]>([]);
  const [regStats, setRegStats]       = useState({ today: 0, week: 0, total: 0 });

  // Initialise draft from server when loaded
  useEffect(() => {
    if (!loading && serverConfig) setDraft({ ...serverConfig });
  }, [loading, serverConfig]);

  // Load registration stats
  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const [todayRes, weekRes, totalRes, recentRes] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", `${today}T00:00:00`),
        supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", weekAgo),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("full_name, created_at, country, avatar_url").order("created_at", { ascending: false }).limit(5),
      ]);
      setRegStats({ today: todayRes.count || 0, week: weekRes.count || 0, total: totalRes.count || 0 });
      setRecentRegs(recentRes.data || []);
    })();
  }, []);

  if (loading || !draft) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <Loader2 size={28} style={{ animation: "spin .8s linear infinite", color: G }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const d = draft; // shorthand
  const set = (patch: Partial<RegistrationConfig>) => setDraft(prev => prev ? { ...prev, ...patch } : prev);

  const handleToggleOpen = (v: boolean) => {
    setPendingOpen(v);
    setShowConfirm(true);
  };

  const confirmToggle = async () => {
    if (pendingOpen === null) return;
    const newDraft = { ...d, registration_open: pendingOpen };
    setDraft(newDraft);
    setShowConfirm(false);
    // Save immediately for the master gate
    setSaving(true);
    await saveAll(newDraft, user?.id);
    setSaving(false);

    // Notify all students if closing
    if (!pendingOpen) {
      const { data: roles } = await supabase.from("user_roles" as any).select("user_id").eq("role", "student");
      if (roles?.length) {
        await supabase.from("notifications" as any).insert(
          (roles as any[]).map((r: any) => ({
            user_id: r.user_id,
            title: "Registration Update",
            message: d.closed_message,
            type: "system_announcement",
            is_read: false,
          }))
        );
      }
    }
    toast({ title: pendingOpen ? "✅ Registration is now OPEN" : "✅ Registration is now CLOSED" });
    setPendingOpen(null);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    await saveAll(d, user?.id);
    setSaving(false);
    toast({ title: "✅ All registration settings saved", description: "Changes are live on the website immediately." });
  };

  const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none", background: "#FAFAFA", boxSizing: "border-box" as const };

  const sym = currencySymbol(d.entrance_fee_currency);

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: d.registration_open ? "#F0FDF4" : "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {d.registration_open ? <UserPlus size={22} color="#16A34A" /> : <UserX size={22} color="#DC2626" />}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: "#111", margin: 0 }}>Registration Settings</h1>
            <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>Controls the website registration page directly</p>
          </div>
          <button onClick={fetch} style={{ padding: "7px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#6B7280" }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 680, margin: "0 auto" }}>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
          {[
            { v: regStats.today, l: "Today",  icon: "📅", bg: "#EFF6FF", c: "#1D4ED8" },
            { v: regStats.week,  l: "7 Days",  icon: "📈", bg: "#F0FDF4", c: "#166534" },
            { v: regStats.total, l: "Total",   icon: "👥", bg: "#F5F3FF", c: "#6D28D9" },
          ].map((s, i) => (
            <div key={i} style={{ background: s.bg, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 18, marginBottom: 3 }}>{s.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: 11, color: s.c, opacity: .7, fontWeight: 600 }}>Registrations {s.l}</div>
            </div>
          ))}
        </div>

        {/* ── MASTER GATE ── */}
        <div style={{
          borderRadius: 16, padding: "18px 20px", marginBottom: 16,
          background: d.registration_open ? "#F0FDF4" : "#FEF2F2",
          border: `2px solid ${d.registration_open ? "#86EFAC" : "#FECACA"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 50, height: 50, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: d.registration_open ? "#16A34A" : "#DC2626", flexShrink: 0 }}>
              {d.registration_open ? <UserPlus size={22} color="#fff" /> : <UserX size={22} color="#fff" />}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 900, fontSize: 16, margin: 0, color: d.registration_open ? "#166534" : "#991B1B" }}>
                Registration is {d.registration_open ? "OPEN" : "CLOSED"}
              </p>
              <p style={{ fontSize: 12, margin: "3px 0 0", color: d.registration_open ? "#16A34A" : "#DC2626" }}>
                {d.registration_open
                  ? `New students can register on the website${d.entrance_fee_enabled ? ` · ${sym}${d.entrance_fee_amount.toLocaleString()} fee required` : " · No payment required"}`
                  : "Website shows closed message — no new registrations accepted"}
              </p>
            </div>
            {saving ? <Loader2 size={20} style={{ animation: "spin .8s linear infinite", color: G }} /> : null}
            <Switch checked={d.registration_open} onCheckedChange={handleToggleOpen} />
          </div>
        </div>

        {/* ── ENROLLMENT FLOW — which steps appear on website ── */}
        <Sec title="Enrollment Flow" icon={<GraduationCap size={14} color={G} />}>
          {/* Visual preview */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", padding: "10px 0 14px", borderBottom: "1px solid #F3F4F6", marginBottom: 12 }}>
            {[
              { label: "Account", always: true, icon: "👤" },
              { label: `Pay ${sym}${d.entrance_fee_amount.toLocaleString()}`, show: d.entrance_fee_enabled, icon: "💳" },
              { label: "Onboarding",  show: d.onboarding_required,      icon: "📝" },
              { label: "Exam",        show: d.entrance_exam_required,   icon: "📋" },
              { label: "Recitation",  show: d.recitation_test_required, icon: "🎤" },
              { label: "Dashboard",   always: true, icon: "🏠" },
            ].map((step, i, arr) => {
              const active = step.always || step.show;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, background: active ? G : "#E5E7EB", margin: "0 auto 3px", opacity: active ? 1 : .4 }}>
                      {step.icon}
                    </div>
                    <p style={{ fontSize: 9, fontWeight: 700, color: active ? G : "#9CA3AF", margin: 0, maxWidth: 56, textAlign: "center", lineHeight: 1.2 }}>{step.label}</p>
                  </div>
                  {i < arr.length - 1 && <ChevronRight size={12} color={active ? G : "#D1D5DB"} />}
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 12px" }}>
            ↑ This is exactly what students see on the registration page. Toggle below to update.
          </p>
          <Tog label="Onboarding Form" sub="Student fills background info before exam" checked={d.onboarding_required} onChange={(v: boolean) => set({ onboarding_required: v })} />
          <Tog label="Entrance Exam" sub="Written placement test after payment/signup" checked={d.entrance_exam_required} onChange={(v: boolean) => set({ entrance_exam_required: v })} />
          <Tog label="Recitation Test" sub="Audio/live Quran recitation evaluation" checked={d.recitation_test_required} onChange={(v: boolean) => set({ recitation_test_required: v })} />
        </Sec>

        {/* ── PAYMENT SETTINGS ── */}
        <Sec title="Payment Settings" icon={<CreditCard size={14} color={G} />}>
          <Tog label="Require Registration Fee" sub="Students pay before accessing onboarding & exam" checked={d.entrance_fee_enabled} onChange={(v: boolean) => set({ entrance_fee_enabled: v })} />

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginTop: 12, opacity: d.entrance_fee_enabled ? 1 : .45 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>Fee Amount</label>
              <input type="number" style={inp} value={d.entrance_fee_amount} min={0} disabled={!d.entrance_fee_enabled}
                onChange={e => set({ entrance_fee_amount: Number(e.target.value) })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>Currency</label>
              <select style={inp} value={d.entrance_fee_currency} disabled={!d.entrance_fee_enabled}
                onChange={e => set({ entrance_fee_currency: e.target.value })}>
                {[["NGN","₦ Nigerian Naira"],["USD","$ US Dollar"],["GBP","£ British Pound"],["EUR","€ Euro"],["GHS","₵ Ghana Cedi"]].map(([v,l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {d.entrance_fee_enabled && (
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "#FFF7ED", border: "1px solid #FED7AA", fontSize: 12, color: "#C2410C" }}>
              ⚠️ Make sure <code>VITE_PAYSTACK_PUBLIC_KEY</code> is set in Vercel environment variables for payments to work.
            </div>
          )}

          {/* Quick presets */}
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 8 }}>Quick Presets</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { label: "🌙 Ramadan Special — Waive Fee", action: () => set({ entrance_fee_enabled: false }) },
                { label: "💰 Standard Fee ₦5,000",         action: () => set({ entrance_fee_enabled: true, entrance_fee_amount: 5000, entrance_fee_currency: "NGN" }) },
                { label: "🎓 Full Onboarding Flow",         action: () => set({ onboarding_required: true, entrance_exam_required: true, recitation_test_required: true }) },
                { label: "⚡ Quick Signup (No Steps)",       action: () => set({ entrance_fee_enabled: false, onboarding_required: false, entrance_exam_required: false, recitation_test_required: false }) },
              ].map((p, i) => (
                <button key={i} onClick={p.action}
                  style={{ padding: "9px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#FAFAFA", cursor: "pointer", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#374151" }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </Sec>

        {/* ── LIMITS ── */}
        <Sec title="Registration Limits" icon={<Shield size={14} color={G} />}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>
              Max Registrations Per Day (0 = unlimited)
            </label>
            <input type="number" style={inp} value={d.max_daily_registrations} min={0}
              onChange={e => set({ max_daily_registrations: Number(e.target.value) })} />
            <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4, marginBottom: 0 }}>
              {d.max_daily_registrations === 0
                ? "Unlimited — no daily cap enforced"
                : `Website will stop accepting registrations after ${d.max_daily_registrations} today`}
            </p>
          </div>
        </Sec>

        {/* ── MESSAGES ── */}
        <Sec title="Website Messages" icon={<Bell size={14} color={G} />}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>
              Welcome Message (shown on the registration page sidebar)
            </label>
            <textarea rows={2} style={{ ...inp, resize: "none" }} value={d.registration_message}
              onChange={e => set({ registration_message: e.target.value })} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>رسالة الترحيب (العربية)</label>
            <textarea rows={2} style={{ ...inp, resize: "none", direction: "rtl" }} value={d.registration_message_ar}
              onChange={e => set({ registration_message_ar: e.target.value })} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>
              Closed Message (shown when registration is off)
            </label>
            <textarea rows={2} style={{ ...inp, resize: "none" }} value={d.closed_message}
              onChange={e => set({ closed_message: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>رسالة الإغلاق (العربية)</label>
            <textarea rows={2} style={{ ...inp, resize: "none", direction: "rtl" }} value={d.closed_message_ar}
              onChange={e => set({ closed_message_ar: e.target.value })} />
          </div>
        </Sec>

        {/* ── RECENT REGISTRATIONS ── */}
        {recentRegs.length > 0 && (
          <Sec title="Recent Registrations" icon={<Users size={14} color={G} />}>
            {recentRegs.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < recentRegs.length - 1 ? "1px solid #F9FAFB" : "none" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: "#1D4ED8", flexShrink: 0 }}>
                  {(r.full_name || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>{r.full_name || "Unknown"}</p>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{r.country || "—"} · {new Date(r.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </Sec>
        )}

        {/* Save button */}
        <button onClick={handleSaveAll} disabled={saving}
          style={{ width: "100%", padding: "14px 0", borderRadius: 13, border: "none", cursor: saving ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 15, color: "#fff", background: saving ? "#9CA3AF" : G, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 24 }}>
          {saving ? <><Loader2 size={16} style={{ animation: "spin .8s linear infinite" }} /> Saving…</> : <><Settings size={16} /> Save All Settings — Apply to Website</>}
        </button>
      </div>

      {/* Confirm toggle dialog */}
      <Dialog open={showConfirm} onOpenChange={v => !v && setShowConfirm(false)}>
        <DialogContent style={{ maxWidth: 380, borderRadius: 20, padding: 28, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", background: pendingOpen ? "#F0FDF4" : "#FEF2F2" }}>
            <AlertTriangle size={26} color={pendingOpen ? "#16A34A" : "#DC2626"} />
          </div>
          <h3 style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>
            {pendingOpen ? "Open Registration?" : "Close Registration?"}
          </h3>
          <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 20, lineHeight: 1.6 }}>
            {pendingOpen
              ? `The website registration page will immediately accept new students. ${d.entrance_fee_enabled ? `Fee: ${sym}${d.entrance_fee_amount.toLocaleString()}` : "No fee required."}`
              : `The website will show your closed message. Existing students are unaffected. All connected students will receive a notification.`}
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setShowConfirm(false)}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Cancel</button>
            <button onClick={confirmToggle}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, color: "#fff", background: pendingOpen ? "#16A34A" : "#DC2626" }}>
              {pendingOpen ? "Open Now" : "Close Now"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}