// src/pages/admin/RegistrationDiagnostics.tsx
// ═══════════════════════════════════════════════════════════════════════════
// REGISTRATION PIPELINE DIAGNOSTICS
// Route: /admin/registration-diagnostics
//
// Full admin view to diagnose registration flow breakpoints:
//   • Pipeline funnel — counts per step (enrollment → completed)
//   • Stuck users — who is at which step and for how long
//   • Payment health — Paystack env check, recent payment history
//   • Per-user drill-down — see exact pipeline state + manual advance/reset
//   • Email verification issues — unconfirmed accounts older than 1 hour
//   • Orphaned records — tasjeel_progress with no matching profile
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRegistrationSettings } from "@/hooks/useRegistrationSettings";
import {
  RefreshCw, AlertTriangle, CheckCircle, Clock, Users,
  CreditCard, Mail, ChevronDown, ChevronUp, ArrowRight,
  Search, XCircle, Shield, Zap, SkipForward, RotateCcw,
  Activity, Eye, TrendingUp,
} from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#1a4731";
const GOLD = "#c9a84c";
const BORDER = "rgba(15,45,31,0.12)";

// ── Step metadata ──────────────────────────────────────────────────────────
const STEPS = [
  { key: "enrollment",      label: "Email Verified",       sub: "awaiting payment or onboarding", color: "#6366f1", bg: "#eef2ff" },
  { key: "payment",         label: "Payment Pending",      sub: "stale — should not persist",     color: "#f59e0b", bg: "#fffbeb" },
  { key: "onboarding",      label: "Onboarding Form",      sub: "waiting for student to fill",    color: "#3b82f6", bg: "#eff6ff" },
  { key: "exam",            label: "Entrance Exam",        sub: "waiting to take exam",           color: "#8b5cf6", bg: "#f5f3ff" },
  { key: "recitation",      label: "Recitation Test",      sub: "waiting to submit audio",        color: "#ec4899", bg: "#fdf2f8" },
  { key: "schedule_session",label: "Schedule Session",     sub: "waiting to book session",        color: "#f97316", bg: "#fff7ed" },
  { key: "level_assignment",label: "Awaiting Level",       sub: "needs admin action",             color: "#14b8a6", bg: "#f0fdfa" },
  { key: "completed",       label: "Completed",            sub: "full access granted",            color: "#22c55e", bg: "#f0fff4" },
];

const stepMeta = (key: string) =>
  STEPS.find(s => s.key === key) ?? { key, label: key, sub: "unknown", color: "#9ca3af", bg: "#f9fafb" };

// ── Helpers ────────────────────────────────────────────────────────────────
const fmtAge = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  const m  = Math.floor(ms / 60000);
  const h  = Math.floor(m / 60);
  const d  = Math.floor(h / 24);
  if (d > 0)  return `${d}d ago`;
  if (h > 0)  return `${h}h ago`;
  if (m > 0)  return `${m}m ago`;
  return "just now";
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// ── Card wrapper ───────────────────────────────────────────────────────────
const Card = ({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ background: "#fff", borderRadius: 16, border: `1px solid ${BORDER}`, boxShadow: "0 2px 8px rgba(0,0,0,.05)", padding: "20px 22px", ...style }}>
    {children}
  </div>
);

const SectionTitle = ({ icon: Icon, title, sub }: { icon: any; title: string; sub?: string }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
    <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(15,45,31,.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Icon size={18} color={G} />
    </div>
    <div>
      <div style={{ fontSize: 15, fontWeight: 800, color: G }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: "#7a9e88", marginTop: 1 }}>{sub}</div>}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────
export default function RegistrationDiagnostics() {
  const { toast }  = useToast();
  const { config, loading: cfgLoading } = useRegistrationSettings();

  // ── Data state ─────────────────────────────────────────────────────────
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [funnelData,   setFunnelData]   = useState<Record<string, number>>({});
  const [stuckUsers,   setStuckUsers]   = useState<any[]>([]);
  const [recentPays,   setRecentPays]   = useState<any[]>([]);
  const [failedPays,   setFailedPays]   = useState<any[]>([]);
  const [unverified,   setUnverified]   = useState<any[]>([]);
  const [searchQ,      setSearchQ]      = useState("");
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [actionUser,   setActionUser]   = useState<string | null>(null);

  // Env check
  const paystackKeyPresent = !!(import.meta.env.VITE_PAYSTACK_PUBLIC_KEY);

  // ── Fetch all diagnostics data ─────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      // 1. Pipeline funnel — count per step
      const { data: tpRows } = await supabase
        .from("tasjeel_progress" as any)
        .select("current_step, updated_at, created_at, user_id");

      const funnel: Record<string, number> = {};
      STEPS.forEach(s => { funnel[s.key] = 0; });
      funnel["unknown"] = 0;
      (tpRows || []).forEach((r: any) => {
        const k = r.current_step || "unknown";
        funnel[k] = (funnel[k] || 0) + 1;
      });
      setFunnelData(funnel);

      // 2. Stuck users — tasjeel_progress joined with profiles
      const { data: stuckRaw } = await supabase
        .from("tasjeel_progress" as any)
        .select("user_id, current_step, created_at, updated_at")
        .not("current_step", "eq", "completed")
        .order("updated_at", { ascending: true });

      if (stuckRaw && stuckRaw.length > 0) {
        const userIds = (stuckRaw as any[]).map((r: any) => r.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email, created_at")
          .in("id", userIds);

        const { data: enrollments } = await supabase
          .from("enrollments" as any)
          .select("user_id, registration_paid, registration_paid_at, status")
          .in("user_id", userIds);

        const { data: payments } = await supabase
          .from("payment_history" as any)
          .select("user_id, amount, status, paid_at, payment_ref")
          .in("user_id", userIds)
          .order("paid_at", { ascending: false });

        const profMap: Record<string, any>   = {};
        const enrollMap: Record<string, any> = {};
        const payMap: Record<string, any[]>  = {};
        (profiles || []).forEach((p: any) => { profMap[p.id] = p; });
        (enrollments || []).forEach((e: any) => { enrollMap[e.user_id] = e; });
        (payments || []).forEach((p: any) => {
          if (!payMap[p.user_id]) payMap[p.user_id] = [];
          payMap[p.user_id].push(p);
        });

        setStuckUsers((stuckRaw as any[]).map((r: any) => ({
          ...r,
          profile:    profMap[r.user_id]   || null,
          enrollment: enrollMap[r.user_id] || null,
          payments:   payMap[r.user_id]    || [],
        })));
      } else {
        setStuckUsers([]);
      }

      // 3. Recent payments (last 20)
      const { data: pays } = await supabase
        .from("payment_history" as any)
        .select("user_id, amount, currency, status, paid_at, payment_ref, payment_type, plan_type")
        .order("paid_at", { ascending: false })
        .limit(20);

      if (pays && pays.length > 0) {
        const payUserIds = [...new Set((pays as any[]).map((p: any) => p.user_id))];
        const { data: payProfs } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", payUserIds);
        const ppMap: Record<string, any> = {};
        (payProfs || []).forEach((p: any) => { ppMap[p.id] = p; });
        setRecentPays((pays as any[]).map((p: any) => ({ ...p, profile: ppMap[p.user_id] || null })));
        setFailedPays((pays as any[]).filter((p: any) => p.status !== "success").map((p: any) => ({ ...p, profile: ppMap[p.user_id] || null })));
      } else {
        setRecentPays([]);
        setFailedPays([]);
      }

      // 4. Unverified emails (profiles created > 1h ago with no tasjeel_progress)
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, created_at")
        .lt("created_at", oneHourAgo)
        .order("created_at", { ascending: false })
        .limit(50);

      if (allProfiles && allProfiles.length > 0) {
        const allProfIds = (allProfiles as any[]).map((p: any) => p.id);
        const { data: tpCheck } = await supabase
          .from("tasjeel_progress" as any)
          .select("user_id")
          .in("user_id", allProfIds);
        const tpSet = new Set((tpCheck || []).map((r: any) => r.user_id));
        setUnverified((allProfiles as any[]).filter((p: any) => !tpSet.has(p.id)).slice(0, 20));
      } else {
        setUnverified([]);
      }

    } catch (err: any) {
      toast({ title: "Error loading diagnostics", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Manual pipeline advance ────────────────────────────────────────────
  const advanceUser = async (userId: string, toStep: string) => {
    setActionUser(userId);
    try {
      const { error } = await supabase
        .from("tasjeel_progress" as any)
        .update({ current_step: toStep, updated_at: new Date().toISOString() } as any)
        .eq("user_id", userId);
      if (error) throw error;
      toast({ title: `Advanced to "${toStep}"`, description: "Pipeline step updated." });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Failed to advance", description: err?.message, variant: "destructive" });
    } finally {
      setActionUser(null);
    }
  };

  // ── Manual mark registration paid ────────────────────────────────────
  const markRegPaid = async (userId: string) => {
    setActionUser(userId);
    try {
      const ref = `MANUAL-${Date.now()}`;
      await supabase.from("payment_history" as any).insert({
        user_id: userId, amount: config.entrance_fee_amount,
        paid_at: new Date().toISOString(), status: "success",
        payment_ref: ref, payment_type: "registration", plan_type: "registration",
      });
      await supabase.from("enrollments" as any).upsert({
        user_id: userId, level: "pending", plan_type: "monthly",
        amount: config.entrance_fee_amount, status: "grace",
        grace_end_date: new Date(Date.now() + 7 * 86400000).toISOString(),
        registration_paid: true, registration_paid_at: new Date().toISOString(),
        admin_override: true,
      }, { onConflict: "user_id" });
      const postStep = config.onboarding_required ? "onboarding"
        : config.entrance_exam_required ? "exam"
        : config.recitation_test_required ? "recitation"
        : "level_assignment";
      await advanceUser(userId, postStep);
      toast({ title: "Marked as paid", description: `Ref: ${ref}` });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    } finally {
      setActionUser(null);
    }
  };

  // ── Filter ─────────────────────────────────────────────────────────────
  const filteredStuck = stuckUsers.filter(u => {
    if (!searchQ) return true;
    const q = searchQ.toLowerCase();
    return (
      (u.profile?.full_name || "").toLowerCase().includes(q) ||
      (u.profile?.email || "").toLowerCase().includes(q) ||
      u.current_step.toLowerCase().includes(q)
    );
  });

  const totalInPipeline  = Object.entries(funnelData).filter(([k]) => k !== "completed").reduce((a, [, v]) => a + v, 0);
  const totalCompleted   = funnelData["completed"] || 0;
  const stuckAtPayment   = (funnelData["enrollment"] || 0) + (funnelData["payment"] || 0);
  const needsAdminAction = funnelData["level_assignment"] || 0;

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400, fontFamily: "'Cairo',sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, border: `3px solid rgba(15,45,31,.15)`, borderTopColor: G, borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ color: G, fontWeight: 700 }}>Loading diagnostics…</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 20px", maxWidth: 1100, margin: "0 auto", fontFamily: "'Cairo',sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        .diag-row:hover { background: rgba(15,45,31,.03) !important; }
        .diag-action:hover { opacity: .85; transform: translateY(-1px); }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: G, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Activity size={20} color={GOLD} />
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 900, color: G, margin: 0 }}>Registration Diagnostics</h1>
              <div style={{ fontSize: 12, color: "#7a9e88", marginTop: 2 }}>Live pipeline health check — find where students are getting stuck</div>
            </div>
          </div>
        </div>
        <button
          onClick={fetchAll}
          disabled={refreshing}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 10, background: G, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: refreshing ? "not-allowed" : "pointer", opacity: refreshing ? .6 : 1 }}
        >
          <RefreshCw size={14} style={{ animation: refreshing ? "spin .8s linear infinite" : "none" }} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* ── Environment Health ── */}
      <Card style={{ marginBottom: 20, animation: "fadeIn .4s ease" }}>
        <SectionTitle icon={Shield} title="Environment Health" sub="Critical configuration checks" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
          {[
            {
              label:   "Paystack Public Key",
              ok:      paystackKeyPresent,
              ok_msg:  "VITE_PAYSTACK_PUBLIC_KEY is set",
              err_msg: "VITE_PAYSTACK_PUBLIC_KEY is MISSING — payments are running in demo mode and no real charges are occurring. Set this in your Vercel environment variables.",
            },
            {
              label:   "Registration Open",
              ok:      config.registration_open,
              ok_msg:  "Registration is currently open",
              err_msg: "Registration is CLOSED — new students cannot sign up.",
            },
            {
              label:   "Entrance Fee",
              ok:      true,
              ok_msg:  config.entrance_fee_enabled
                ? `Enabled — ${config.entrance_fee_currency} ${config.entrance_fee_amount.toLocaleString()}`
                : "Disabled (free registration)",
              err_msg: "",
            },
            {
              label:   "Pipeline Steps",
              ok:      true,
              ok_msg:  [
                config.entrance_fee_enabled     ? "💳 Payment"   : null,
                config.onboarding_required      ? "📋 Onboarding" : null,
                config.entrance_exam_required   ? "📝 Exam"       : null,
                config.recitation_test_required ? "🎤 Recitation" : null,
                "🏅 Level Assignment",
              ].filter(Boolean).join(" → "),
              err_msg: "",
            },
          ].map((check, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 12, background: check.ok ? "#f0fff4" : "#fef2f2", border: `1px solid ${check.ok ? "#86efac" : "#fecaca"}` }}>
              {check.ok
                ? <CheckCircle size={18} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} />
                : <AlertTriangle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
              }
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: check.ok ? "#166534" : "#991b1b", marginBottom: 3 }}>{check.label}</div>
                <div style={{ fontSize: 11, color: check.ok ? "#166534" : "#dc2626", lineHeight: 1.5 }}>
                  {check.ok ? check.ok_msg : check.err_msg}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Pipeline Funnel ── */}
      <Card style={{ marginBottom: 20, animation: "fadeIn .45s ease" }}>
        <SectionTitle icon={TrendingUp} title="Pipeline Funnel" sub="How many students are at each step right now" />

        {/* Summary stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
          {[
            { label: "In Pipeline",     value: totalInPipeline,  color: "#6366f1", bg: "#eef2ff",  icon: Users },
            { label: "Completed",       value: totalCompleted,   color: "#22c55e", bg: "#f0fff4",  icon: CheckCircle },
            { label: "At Payment Step", value: stuckAtPayment,   color: "#f59e0b", bg: "#fffbeb",  icon: CreditCard },
            { label: "Need Admin",      value: needsAdminAction, color: "#ec4899", bg: "#fdf2f8",  icon: Zap },
          ].map((s, i) => (
            <div key={i} style={{ background: s.bg, borderRadius: 14, padding: "14px 16px", border: `1px solid ${s.color}22` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <s.icon size={16} color={s.color} />
                <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.label}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: G }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Funnel bars */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {STEPS.map((step) => {
            const count = funnelData[step.key] || 0;
            const maxCount = Math.max(...Object.values(funnelData), 1);
            const pct = Math.round((count / maxCount) * 100);
            return (
              <div key={step.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 130, fontSize: 11, fontWeight: 700, color: G, flexShrink: 0, textAlign: "right" }}>{step.label}</div>
                <div style={{ flex: 1, height: 28, background: "#f3f4f6", borderRadius: 8, overflow: "hidden", position: "relative" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg,${step.color}cc,${step.color})`, borderRadius: 8, transition: "width .6s ease", minWidth: count > 0 ? 28 : 0 }} />
                  {count > 0 && (
                    <span style={{ position: "absolute", left: `max(${pct}% - 2px, 4px)`, top: "50%", transform: "translate(-100%,-50%)", fontSize: 11, fontWeight: 800, color: count > 0 ? "#fff" : "#9ca3af", paddingRight: 6 }}>{count}</span>
                  )}
                </div>
                <div style={{ width: 32, fontSize: 12, fontWeight: 900, color: count > 0 ? step.color : "#d1d5db", flexShrink: 0 }}>{count}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Stuck Users ── */}
      <Card style={{ marginBottom: 20, animation: "fadeIn .5s ease" }}>
        <SectionTitle icon={Clock} title="Students In Pipeline" sub="Everyone not yet completed — sorted by longest waiting" />

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 16 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search by name, email or step…"
            style={{ width: "100%", padding: "9px 12px 9px 34px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 13, outline: "none", fontFamily: "'Cairo',sans-serif", color: G, boxSizing: "border-box" }}
          />
          {searchQ && (
            <button onClick={() => setSearchQ("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>
              <XCircle size={14} />
            </button>
          )}
        </div>

        {filteredStuck.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#9ca3af" }}>
            <CheckCircle size={32} color="#22c55e" style={{ margin: "0 auto 10px", display: "block" }} />
            <div style={{ fontWeight: 700 }}>{searchQ ? "No results for that search" : "No students stuck in the pipeline 🎉"}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {/* Header */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 80px 80px 100px", gap: 8, padding: "6px 12px", fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: .5 }}>
              <span>Student</span><span>Current Step</span><span>Reg Paid</span><span>Waiting</span><span></span>
            </div>

            {filteredStuck.map((u) => {
              const meta        = stepMeta(u.current_step);
              const regPaid     = u.enrollment?.registration_paid;
              const hasPay      = u.payments?.length > 0;
              const isExpanded  = expanded === u.user_id;
              const isActing    = actionUser === u.user_id;
              const stuckMs     = Date.now() - new Date(u.updated_at || u.created_at).getTime();
              const stuckDays   = Math.floor(stuckMs / 86400000);
              const isAlert     = stuckDays >= 3;

              return (
                <div key={u.user_id} style={{ borderRadius: 12, border: `1px solid ${isAlert ? "#fecaca" : BORDER}`, background: isAlert ? "#fff5f5" : "#fff", marginBottom: 6, overflow: "hidden", transition: "box-shadow .15s" }}>
                  {/* Row */}
                  <div
                    className="diag-row"
                    style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 80px 80px 100px", gap: 8, padding: "12px 14px", alignItems: "center", cursor: "pointer" }}
                    onClick={() => setExpanded(isExpanded ? null : u.user_id)}
                  >
                    {/* Name/email */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: G, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {u.profile?.full_name || "Unknown"}
                        {isAlert && <span style={{ marginLeft: 6, fontSize: 10, background: "#fecaca", color: "#991b1b", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>STUCK</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "#7a9e88", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.profile?.email || u.user_id}</div>
                    </div>

                    {/* Step badge */}
                    <div>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: meta.color, background: meta.bg, borderRadius: 20, padding: "3px 10px" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
                        {meta.label}
                      </span>
                    </div>

                    {/* Reg paid */}
                    <div>
                      {regPaid
                        ? <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e" }}>✓ Paid</span>
                        : hasPay
                          ? <span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b" }}>⚠ Partial</span>
                          : <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444" }}>✗ No</span>
                      }
                    </div>

                    {/* Age */}
                    <div style={{ fontSize: 11, color: isAlert ? "#ef4444" : "#7a9e88", fontWeight: isAlert ? 700 : 400 }}>
                      {fmtAge(u.updated_at || u.created_at)}
                    </div>

                    {/* Expand */}
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      {isExpanded ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: "0 14px 16px", borderTop: `1px solid ${BORDER}`, background: "#fafefb" }}>
                      {/* Timeline */}
                      <div style={{ marginTop: 14, marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: G, marginBottom: 10, textTransform: "uppercase", letterSpacing: .5 }}>Pipeline Snapshot</div>
                        <div style={{ display: "flex", gap: 0, flexWrap: "wrap" }}>
                          {STEPS.map((step, idx) => {
                            const isCurrent = u.current_step === step.key;
                            const isDone    = STEPS.findIndex(s => s.key === u.current_step) > idx;
                            return (
                              <div key={step.key} style={{ display: "flex", alignItems: "center" }}>
                                <div style={{ textAlign: "center", padding: "6px 8px", borderRadius: 8, background: isCurrent ? step.bg : isDone ? "#f0fff4" : "#f9fafb", border: `1.5px solid ${isCurrent ? step.color : isDone ? "#86efac" : "#e5e7eb"}` }}>
                                  <div style={{ fontSize: 9, fontWeight: 800, color: isCurrent ? step.color : isDone ? "#22c55e" : "#9ca3af", whiteSpace: "nowrap" }}>
                                    {isDone ? "✓" : isCurrent ? "●" : "○"} {step.label}
                                  </div>
                                </div>
                                {idx < STEPS.length - 1 && <div style={{ width: 12, height: 1, background: isDone ? "#86efac" : "#e5e7eb", flexShrink: 0 }} />}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Info grid */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                        <div style={{ fontSize: 11, color: "#555" }}><b>User ID:</b> <code style={{ fontSize: 10 }}>{u.user_id}</code></div>
                        <div style={{ fontSize: 11, color: "#555" }}><b>Registered:</b> {u.profile?.created_at ? fmtDate(u.profile.created_at) : "—"}</div>
                        <div style={{ fontSize: 11, color: "#555" }}><b>Step updated:</b> {fmtDate(u.updated_at || u.created_at)}</div>
                        <div style={{ fontSize: 11, color: "#555" }}><b>Enrollment status:</b> {u.enrollment?.status || "No enrollment row"}</div>
                      </div>

                      {/* Payment history for this user */}
                      {u.payments.length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: G, marginBottom: 8, textTransform: "uppercase", letterSpacing: .5 }}>Payment History</div>
                          {u.payments.map((p: any, i: number) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 8, background: p.status === "success" ? "#f0fff4" : "#fff5f5", marginBottom: 4 }}>
                              {p.status === "success" ? <CheckCircle size={13} color="#22c55e" /> : <XCircle size={13} color="#ef4444" />}
                              <span style={{ fontSize: 11, fontWeight: 700 }}>₦{(p.amount || 0).toLocaleString()}</span>
                              <span style={{ fontSize: 10, color: "#9ca3af" }}>{p.payment_ref}</span>
                              <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: "auto" }}>{fmtAge(p.paid_at)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Admin actions */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: G, width: "100%", marginBottom: 2 }}>Admin Actions:</div>

                        {/* Advance to next step */}
                        {STEPS.filter(s => s.key !== "completed" && s.key !== u.current_step).map(step => (
                          <button
                            key={step.key}
                            className="diag-action"
                            disabled={isActing}
                            onClick={() => advanceUser(u.user_id, step.key)}
                            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${step.color}`, background: step.bg, color: step.color, fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all .15s" }}
                          >
                            <SkipForward size={11} /> Move to: {step.label}
                          </button>
                        ))}

                        <button
                          className="diag-action"
                          disabled={isActing}
                          onClick={() => advanceUser(u.user_id, "completed")}
                          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1.5px solid #22c55e", background: "#f0fff4", color: "#16a34a", fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all .15s" }}
                        >
                          <CheckCircle size={11} /> Mark Completed
                        </button>

                        {!regPaid && config.entrance_fee_enabled && (
                          <button
                            className="diag-action"
                            disabled={isActing}
                            onClick={() => markRegPaid(u.user_id)}
                            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1.5px solid #f59e0b", background: "#fffbeb", color: "#b45309", fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all .15s" }}
                          >
                            <CreditCard size={11} /> Mark Reg Fee Paid (manual)
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Recent Payments ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20, animation: "fadeIn .55s ease" }}>
        {/* Recent successful */}
        <Card>
          <SectionTitle icon={CreditCard} title="Recent Payments" sub="Last 20 transactions" />
          {recentPays.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: "#9ca3af", fontSize: 13 }}>No payment records found</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
              {recentPays.map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: p.status === "success" ? "#f0fff4" : "#fff5f5", border: `1px solid ${p.status === "success" ? "#86efac" : "#fecaca"}` }}>
                  {p.status === "success" ? <CheckCircle size={14} color="#22c55e" /> : <XCircle size={14} color="#ef4444" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: G, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.profile?.full_name || "Unknown"}</div>
                    <div style={{ fontSize: 10, color: "#7a9e88", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.payment_ref}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: G }}>₦{(p.amount || 0).toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: "#9ca3af" }}>{fmtAge(p.paid_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Failed / issues */}
        <Card>
          <SectionTitle icon={AlertTriangle} title="Failed / Non-Success Payments" sub="Payments that didn't complete" />
          {failedPays.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <CheckCircle size={28} color="#22c55e" style={{ margin: "0 auto 8px", display: "block" }} />
              <div style={{ fontSize: 13, color: "#22c55e", fontWeight: 700 }}>No failed payments 🎉</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
              {failedPays.map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: "#fff5f5", border: "1px solid #fecaca" }}>
                  <XCircle size={14} color="#ef4444" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: G, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.profile?.full_name || "Unknown"}</div>
                    <div style={{ fontSize: 10, color: "#7a9e88" }}>{p.payment_ref}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444" }}>{p.status}</div>
                    <div style={{ fontSize: 10, color: "#9ca3af" }}>{fmtAge(p.paid_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Unverified Emails ── */}
      <Card style={{ animation: "fadeIn .6s ease" }}>
        <SectionTitle icon={Mail} title="Accounts Without Pipeline Record" sub="Registered 1h+ ago but never reached email verification — likely abandoned or email never confirmed" />
        {unverified.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <CheckCircle size={28} color="#22c55e" style={{ margin: "0 auto 8px", display: "block" }} />
            <div style={{ fontSize: 13, color: "#22c55e", fontWeight: 700 }}>No orphaned accounts found 🎉</div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 12, padding: "10px 14px", background: "#fffbeb", borderRadius: 10, border: "1px solid #fde68a", fontSize: 12, color: "#92400e" }}>
              ⚠️ These accounts exist in <code>profiles</code> but have no <code>tasjeel_progress</code> row. This means the user created an account but never clicked the verification link — or verification failed.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 8 }}>
              {unverified.map((u, i) => (
                <div key={i} style={{ padding: "10px 12px", borderRadius: 10, background: "#fafafa", border: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: G, marginBottom: 2 }}>{u.full_name || "Unknown"}</div>
                  <div style={{ fontSize: 11, color: "#7a9e88", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis" }}>{u.email}</div>
                  <div style={{ fontSize: 10, color: "#9ca3af" }}>Registered {fmtAge(u.created_at)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <div style={{ height: 40 }} />
    </div>
  );
}
