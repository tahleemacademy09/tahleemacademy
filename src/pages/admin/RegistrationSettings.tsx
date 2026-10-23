// src/pages/admin/RegistrationSettings.tsx
// Admin → Registration → Settings.  Mobile-first, same look as Daily Hifdh Revision.
//
//  • Master gate  — "Registration open" decides whether /register accepts students.
//                   Saved immediately; closing notifies students. Read back from the
//                   DB after saving so the admin sees what is really live.
//  • Enrollment flow — tap an icon to switch that step on/off (auto-saves).
//                   Payment icon = registration fee on/off (amount keeps its last saved value).
//  • Website messages — welcome + closed messages (EN/AR), saved with one button.
//  • Registration link — open / copy the public page students use.
//  • Recent registrations + counters.
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRegistrationSettings, RegistrationConfig } from "@/hooks/useRegistrationSettings";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  UserPlus, UserX, Loader2, Bell, Lock, ExternalLink, Copy, Users,
  RefreshCw, AlertTriangle, CheckCircle2, Save,
} from "lucide-react";

const G0 = "#061409", G1 = "#0f2d1f", G2 = "#1a3d27", G3 = "#276749";
const GOLD = "#c9a84c", GOLD_L = "#e6c97a";
const WARM = "#faf8f4", BRD = "#e5ddd3", PASS = "#16a34a", FAIL = "#dc2626";

type FlowKey = "entrance_fee_enabled" | "onboarding_required" | "entrance_exam_required" | "recitation_test_required";

const card: React.CSSProperties = { background: "#fff", borderRadius: 16, border: `1px solid ${BRD}`, padding: "14px 14px" };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: G2, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 };
const area: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 12, border: `1.5px solid ${BRD}`, fontSize: 13, outline: "none", background: WARM, boxSizing: "border-box", resize: "none", fontFamily: "inherit" };

export default function RegistrationSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { config: server, loading, saveAll, fetch, currencySymbol } = useRegistrationSettings();

  const [d, setD] = useState<RegistrationConfig | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<boolean | null>(null);
  const [msgDirty, setMsgDirty] = useState(false);
  const [stats, setStats] = useState({ today: 0, week: 0, total: 0 });
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => { if (!loading && server && !msgDirty) setD({ ...server }); }, [loading, server]); // eslint-disable-line

  const loadStats = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const [a, b, c, r] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", `${today}T00:00:00`),
      supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", weekAgo),
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("profiles").select("full_name, created_at, country").order("created_at", { ascending: false }).limit(5),
    ]);
    setStats({ today: a.count || 0, week: b.count || 0, total: c.count || 0 });
    setRecent(r.data || []);
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  if (loading || !d) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
        <Loader2 size={26} style={{ animation: "spin .8s linear infinite", color: G2 }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const sym = currencySymbol(d.entrance_fee_currency);
  const registerUrl = `${window.location.origin}/register`;

  // Save a patch right away; on failure roll back and tell the admin.
  const persist = async (patch: Partial<RegistrationConfig>, key: string, okMsg: string) => {
    const prev = d;
    const next = { ...d, ...patch };
    setD(next);
    setSavingKey(key);
    try {
      await saveAll(next, user?.id);
      toast({ title: okMsg, description: "Live on the website now." });
      return true;
    } catch (e: any) {
      setD(prev);
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
      return false;
    } finally { setSavingKey(null); }
  };

  const toggleFlow = (k: FlowKey, name: string) =>
    persist({ [k]: !d[k] } as any, k, `${name} ${!d[k] ? "enabled" : "disabled"}`);

  const confirmGate = async () => {
    if (confirmOpen === null) return;
    const open = confirmOpen;
    setConfirmOpen(null);
    const ok = await persist({ registration_open: open }, "gate", open ? "Registration is now OPEN" : "Registration is now CLOSED");
    if (ok && !open) {
      const { data: roles } = await supabase.from("user_roles" as any).select("user_id").eq("role", "student");
      if (roles?.length) {
        await supabase.from("notifications" as any).insert(
          (roles as any[]).map((r: any) => ({ user_id: r.user_id, title: "Registration Update", message: d.closed_message, type: "system_announcement", is_read: false }))
        );
      }
    }
  };

  const saveMessages = async () => {
    const ok = await persist({}, "msg", "Messages saved");
    if (ok) setMsgDirty(false);
  };
  const setMsg = (patch: Partial<RegistrationConfig>) => { setD({ ...d, ...patch }); setMsgDirty(true); };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(registerUrl); toast({ title: "Link copied" }); }
    catch { toast({ title: registerUrl }); }
  };

  const flow: { k: FlowKey | null; name: string; icon: string; on: boolean; sub: string }[] = [
    { k: null, name: "Account", icon: "👤", on: true, sub: "Always" },
    { k: "entrance_fee_enabled", name: `Pay ${sym}${d.entrance_fee_amount.toLocaleString()}`, icon: "💳", on: d.entrance_fee_enabled, sub: "Fee" },
    { k: "onboarding_required", name: "Onboarding", icon: "📝", on: d.onboarding_required, sub: "Form" },
    { k: "entrance_exam_required", name: "Exam", icon: "📋", on: d.entrance_exam_required, sub: "Entrance" },
    { k: "recitation_test_required", name: "Recitation", icon: "🎤", on: d.recitation_test_required, sub: "Test" },
    { k: null, name: "Dashboard", icon: "🏠", on: true, sub: "Always" },
  ];

  return (
    <div style={{ background: WARM, padding: "14px 14px 32px", display: "flex", flexDirection: "column", gap: 12, fontFamily: "'Cairo',sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Master gate (hero card) ── */}
      <div style={{ borderRadius: 20, overflow: "hidden", padding: "18px 16px",
        background: d.registration_open ? `linear-gradient(135deg,${G1},${G2})` : `linear-gradient(135deg,#3b0d0d,#7f1d1d)`,
        border: `1px solid ${d.registration_open ? GOLD + "33" : "#fca5a533"}`, boxShadow: `0 4px 24px ${G1}44` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.5)", letterSpacing: 0.6 }}>NEW STUDENT REGISTRATION</p>
            <p style={{ margin: "3px 0 0", fontWeight: 900, fontSize: 22, color: "#fff", letterSpacing: -0.5 }}>
              {d.registration_open ? "Open" : "Closed"}
            </p>
          </div>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {savingKey === "gate"
              ? <Loader2 size={20} color="#fff" style={{ animation: "spin .8s linear infinite" }} />
              : d.registration_open ? <UserPlus size={22} color="#86efac" /> : <UserX size={22} color="#fca5a5" />}
          </div>
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "rgba(255,255,255,.65)", lineHeight: 1.5 }}>
          {d.registration_open
            ? "Students can create an account on the registration page."
            : "The registration page shows your closed message. Existing students are unaffected."}
        </p>
        <button onClick={() => setConfirmOpen(!d.registration_open)} disabled={savingKey === "gate"}
          style={{ width: "100%", padding: 14, borderRadius: 14, border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 900, fontSize: 15,
            background: d.registration_open ? "rgba(255,255,255,.12)" : `linear-gradient(135deg,${GOLD},${GOLD_L})`,
            color: d.registration_open ? "#fff" : G0, boxShadow: d.registration_open ? "none" : `0 4px 20px ${GOLD}55` }}>
          {d.registration_open ? "Close Registration" : "Open Registration"}
        </button>
      </div>

      {/* ── Stats side by side ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[{ v: stats.today, l: "Today" }, { v: stats.week, l: "7 Days" }, { v: stats.total, l: "Total" }].map(s => (
          <div key={s.l} style={{ background: `linear-gradient(135deg,${G1},${G2})`, borderRadius: 14, padding: "12px 6px", textAlign: "center", border: "1px solid rgba(255,255,255,.08)" }}>
            <p style={{ margin: 0, fontWeight: 900, fontSize: 20, color: GOLD, lineHeight: 1 }}>{s.v}</p>
            <p style={{ margin: "4px 0 0", fontSize: 9, color: "rgba(255,255,255,.5)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{s.l}</p>
          </div>
        ))}
      </div>

      {/* ── Registration link ── */}
      <div style={card}>
        <p style={label}>Registration page</p>
        <p style={{ margin: "6px 0 10px", fontSize: 12, color: "#6B7280", wordBreak: "break-all" }}>{registerUrl}</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <a href="/register" target="_blank" rel="noreferrer"
            style={{ padding: "11px 0", borderRadius: 12, background: `linear-gradient(135deg,${G2},${G3})`, color: "#fff", fontWeight: 800, fontSize: 13, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <ExternalLink size={14} /> Preview
          </a>
          <button onClick={copyLink}
            style={{ padding: "11px 0", borderRadius: 12, border: `1.5px solid ${BRD}`, background: "#fff", color: G2, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Copy size={14} /> Copy link
          </button>
        </div>
      </div>

      {/* ── Enrollment flow (tap icons) ── */}
      <div style={card}>
        <p style={label}>Enrollment flow — tap to switch on/off</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 12 }}>
          {flow.map((f, i) => {
            const locked = f.k === null;
            const busy = savingKey === f.k;
            return (
              <button key={i} disabled={locked || !!savingKey}
                onClick={() => f.k && toggleFlow(f.k, f.name.startsWith("Pay") ? "Registration fee" : f.name)}
                style={{ padding: "12px 4px", borderRadius: 14, cursor: locked ? "default" : "pointer", fontFamily: "inherit",
                  border: `2px solid ${f.on ? G3 : BRD}`, background: f.on ? `${G1}0d` : "#f3f4f6", opacity: f.on ? 1 : 0.7,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <span style={{ width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                  background: f.on ? `linear-gradient(135deg,${G2},${G3})` : "#e5e7eb", filter: f.on ? "none" : "grayscale(1)" }}>
                  {busy ? <Loader2 size={18} color="#fff" style={{ animation: "spin .8s linear infinite" }} /> : f.icon}
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, color: f.on ? G2 : "#9CA3AF", lineHeight: 1.2 }}>{f.name}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: locked ? "#9CA3AF" : f.on ? PASS : FAIL, display: "flex", alignItems: "center", gap: 3 }}>
                  {locked ? <><Lock size={9} /> {f.sub}</> : f.on ? "ON" : "OFF"}
                </span>
              </button>
            );
          })}
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 11, color: "#6B7280", lineHeight: 1.5 }}>
          Students go: Create account → Verify email{d.entrance_fee_enabled ? " → Pay" : ""}{d.onboarding_required ? " → Onboarding" : ""}{d.entrance_exam_required ? " → Exam" : ""}{d.recitation_test_required ? " → Recitation" : ""} → Level assignment.
        </p>
      </div>

      {/* ── Messages ── */}
      <div style={card}>
        <p style={{ ...label, display: "flex", alignItems: "center", gap: 6 }}><Bell size={13} /> Website messages</p>
        {([
          ["Welcome message", "registration_message", false],
          ["رسالة الترحيب (العربية)", "registration_message_ar", true],
          ["Closed message", "closed_message", false],
          ["رسالة الإغلاق (العربية)", "closed_message_ar", true],
        ] as const).map(([l, k, rtl]) => (
          <div key={k} style={{ marginTop: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>{l}</label>
            <textarea rows={2} style={{ ...area, direction: rtl ? "rtl" : "ltr" }} value={d[k]} onChange={e => setMsg({ [k]: e.target.value } as any)} />
          </div>
        ))}
        <button onClick={saveMessages} disabled={!msgDirty || savingKey === "msg"}
          style={{ marginTop: 12, width: "100%", padding: 13, borderRadius: 14, border: "none", fontFamily: "inherit", fontWeight: 900, fontSize: 14,
            cursor: msgDirty ? "pointer" : "default", background: msgDirty ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : "#e5e7eb", color: msgDirty ? G0 : "#9CA3AF",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {savingKey === "msg" ? <Loader2 size={16} style={{ animation: "spin .8s linear infinite" }} /> : msgDirty ? <Save size={16} /> : <CheckCircle2 size={16} />}
          {msgDirty ? "Save messages" : "Messages saved"}
        </button>
      </div>

      {/* ── Recent registrations ── */}
      {recent.length > 0 && (
        <div style={card}>
          <p style={{ ...label, display: "flex", alignItems: "center", gap: 6 }}><Users size={13} /> Recent registrations</p>
          {recent.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: i ? "1px solid #f3f4f6" : "none", marginTop: i ? 0 : 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg,${G2},${G3})`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: "#fff", flexShrink: 0 }}>
                {(r.full_name || "?")[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: G2, margin: 0 }}>{r.full_name || "Unknown"}</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{r.country || "—"} · {new Date(r.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => { fetch(); loadStats(); }}
        style={{ alignSelf: "center", padding: "9px 16px", borderRadius: 12, border: `1.5px solid ${BRD}`, background: "#fff", color: "#6B7280", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
        <RefreshCw size={13} /> Reload from server
      </button>

      {/* Confirm open/close */}
      <Dialog open={confirmOpen !== null} onOpenChange={v => !v && setConfirmOpen(null)}>
        <DialogContent style={{ maxWidth: 360, borderRadius: 20, padding: 24, textAlign: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", background: confirmOpen ? "#F0FDF4" : "#FEF2F2" }}>
            <AlertTriangle size={24} color={confirmOpen ? PASS : FAIL} />
          </div>
          <h3 style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>{confirmOpen ? "Open registration?" : "Close registration?"}</h3>
          <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 18, lineHeight: 1.6 }}>
            {confirmOpen
              ? "The registration page will accept new students immediately."
              : "The registration page will show your closed message and all students will be notified."}
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setConfirmOpen(null)} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${BRD}`, background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Cancel</button>
            <button onClick={confirmGate} style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 13, color: "#fff", background: confirmOpen ? PASS : FAIL }}>
              {confirmOpen ? "Open now" : "Close now"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
