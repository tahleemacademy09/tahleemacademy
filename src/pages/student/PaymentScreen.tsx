/*  src/pages/student/EnrollmentPayment.tsx
    PROFESSIONAL — Enhanced Enrollment & Payment
    ✔ Student sees only their own level fee
    ✔ Can pay at any time (not just when owing)
    ✔ Grace period countdown with locked state
    ✔ Admin override to unlock dashboard
    ✔ Full payment history & status tracking
    ✔ Student info card
*/
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, CreditCard, Clock, CheckCircle2, AlertTriangle,
  Lock, Unlock, ChevronRight, RefreshCw, Download, Info,
  User, Mail, BookOpen, Hash, Calendar, Shield, Loader2,
  TrendingUp, BadgeCheck, XCircle, Bell
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────
interface Enrollment {
  id: string;
  user_id: string;
  level: string;
  plan_type: "monthly" | "term";
  amount: number;
  status: "active" | "grace" | "expired" | "locked";
  grace_end_date: string | null;
  paid_at: string | null;
  next_due_date: string | null;
  admin_override: boolean;
  admin_override_until: string | null;
  created_at: string;
}

interface PaymentRecord {
  id: string;
  user_id: string;
  amount: number;
  paid_at: string;
  level: string;
  plan_type: string;
  receipt_id: string;
  status: "success" | "failed" | "pending";
  payment_ref: string | null;
}

interface StudentProfile {
  user_id: string;
  full_name: string;
  full_name_ar: string;
  email: string;
  level: string;
  student_id: string;
  avatar_url: string;
  created_at: string;
}

// ── Fee schedule ──────────────────────────────────────────────────
const LEVEL_FEES: Record<string, { monthly: number; term: number; label: string; labelAr: string; color: string }> = {
  beginner:     { monthly: 5000, term: 5000,  label: "Beginner",     labelAr: "المبتدئ",    color: "#2E7D32" },
  intermediate: { monthly: 5000, term: 6000,  label: "Intermediate", labelAr: "المتوسط",   color: "#1565C0" },
  advanced:     { monthly: 5000, term: 7000,  label: "Advanced",     labelAr: "المتقدم",   color: "#6A1B9A" },
  default:      { monthly: 5000, term: 5000,  label: "Standard",     labelAr: "الأساسي",   color: "#075E54" },
};

const GRACE_DAYS = 7;
const PAYSTACK_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";

// ── SQL to run once in Supabase ───────────────────────────────────
// CREATE TABLE IF NOT EXISTS enrollments (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
//   level text NOT NULL,
//   plan_type text NOT NULL DEFAULT 'monthly',
//   amount integer NOT NULL DEFAULT 5000,
//   status text NOT NULL DEFAULT 'grace',
//   grace_end_date timestamptz,
//   paid_at timestamptz,
//   next_due_date timestamptz,
//   admin_override boolean DEFAULT false,
//   admin_override_until timestamptz,
//   created_at timestamptz DEFAULT now(),
//   UNIQUE(user_id)
// );
// CREATE TABLE IF NOT EXISTS payment_history (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
//   enrollment_id uuid REFERENCES enrollments(id),
//   amount integer NOT NULL,
//   paid_at timestamptz DEFAULT now(),
//   level text,
//   plan_type text,
//   receipt_id text,
//   status text DEFAULT 'success',
//   payment_ref text,
//   created_at timestamptz DEFAULT now()
// );

// ── Helpers ───────────────────────────────────────────────────────
const fmt = (n: number) => `₦${n.toLocaleString()}`;
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (d: string | null) => d ? new Date(d).toLocaleString("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const daysLeft = (d: string | null): number => {
  if (!d) return 0;
  const diff = new Date(d).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
};
const addMonths = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() + n); return d.toISOString(); };

// ── Access control exported hook ─────────────────────────────────
export type AccessStatus = "active" | "grace" | "locked" | "unknown";
export const getAccessStatus = (enr: Enrollment | null): AccessStatus => {
  if (!enr) return "unknown";
  if (enr.admin_override && enr.admin_override_until && new Date(enr.admin_override_until) > new Date()) return "active";
  if (enr.status === "active" && enr.next_due_date && new Date(enr.next_due_date) > new Date()) return "active";
  if (enr.status === "grace" && enr.grace_end_date && new Date(enr.grace_end_date) > new Date()) return "grace";
  return "locked";
};

// ── LOCKED OVERLAY (export for use in other pages) ───────────────
export const PaymentLockedOverlay = ({ onPay }: { onPay: () => void }) => (
  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 50, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, borderRadius: "inherit" }}>
    <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(231,76,60,0.15)", border: "2px solid #E74C3C", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Lock style={{ width: 28, height: 28, color: "#E74C3C" }} />
    </div>
    <div style={{ color: "#fff", fontWeight: 700, fontSize: 18, textAlign: "center" }}>Feature Locked</div>
    <div style={{ color: "rgba(255,255,255,.75)", fontSize: 13, textAlign: "center", maxWidth: 240 }}>Complete your payment to unlock this feature</div>
    <button onClick={onPay} style={{ background: "#075E54", color: "#fff", border: "none", borderRadius: 12, padding: "12px 28px", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>Pay Now</button>
  </div>
);

// ── MAIN COMPONENT ────────────────────────────────────────────────
const EnrollmentPayment = () => {
  const { user, profile, hasRole } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState<"pay" | "history" | "status">("pay");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [history, setHistory] = useState<PaymentRecord[]>([]);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "term">("monthly");
  const [loadingHistory, setLoadingHistory] = useState(false);

  const isAdmin = hasRole("admin");
  const level = ((profile as any)?.level || "beginner").toLowerCase();
  const fees = LEVEL_FEES[level] || LEVEL_FEES.default;
  const accessStatus = getAccessStatus(enrollment);
  const graceRemaining = daysLeft(enrollment?.grace_end_date || null);

  // ── Load data ────────────────────────────────────────────────
  const loadEnrollment = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Load student profile
      const { data: prof } = await supabase
        .from("profiles")
        .select("user_id,full_name,full_name_ar,email,level,student_id,avatar_url,created_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (prof) setStudentProfile(prof as unknown as StudentProfile);

      // Load or create enrollment
      let { data: enr } = await supabase
        .from("enrollments" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!enr) {
        // First time — create with grace period
        const graceEnd = new Date(Date.now() + GRACE_DAYS * 86400000).toISOString();
        const { data: created } = await supabase
          .from("enrollments" as any)
          .insert({
            user_id: user.id,
            level: level,
            plan_type: "monthly",
            amount: fees.monthly,
            status: "grace",
            grace_end_date: graceEnd,
            admin_override: false,
          })
          .select()
          .single();
        enr = created;
      }

      // Auto-expire if grace period is over
      if (enr && (enr as any).status === "grace" && (enr as any).grace_end_date && new Date((enr as any).grace_end_date) < new Date()) {
        await supabase.from("enrollments" as any).update({ status: "locked" }).eq("id", (enr as any).id);
        enr = { ...(enr as any), status: "locked" };
      }

      setEnrollment(enr as unknown as Enrollment);
    } finally {
      setLoading(false);
    }
  }, [user, level, fees.monthly]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    setLoadingHistory(true);
    const { data } = await supabase
      .from("payment_history" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("paid_at", { ascending: false })
      .limit(30);
    setHistory((data || []) as unknown as PaymentRecord[]);
    setLoadingHistory(false);
  }, [user]);

  useEffect(() => { loadEnrollment(); }, [loadEnrollment]);
  useEffect(() => { if (tab === "history") loadHistory(); }, [tab, loadHistory]);

  // ── Payment via Paystack ─────────────────────────────────────
  const initiatePayment = async () => {
    if (!user || !studentProfile) return;
    const amount = selectedPlan === "monthly" ? fees.monthly : fees.term;
    const email  = studentProfile.email || user.email || "";
    const ref    = `TAH-${user.id.slice(0,8)}-${Date.now()}`;

    // Resolve plan_id from payment_plans table so the webhook can link correctly
    const { data: matchedPlan } = await supabase
      .from("payment_plans" as any)
      .select("id, duration_months")
      .eq("amount", amount)
      .eq("is_active", true)
      .maybeSingle();
    const planId: string | null = matchedPlan?.id || null;

    // Pre-create a pending payment row so the webhook UPDATE can find it
    await supabase.from("payments" as any).insert({
      student_id:        user.id,
      plan_id:           planId,
      amount,
      currency:          "NGN",
      status:            "pending",
      type:              "subscription",
      paystack_reference: ref,
      payment_method:    "paystack",
    });

    if (!PAYSTACK_KEY) {
      // Demo mode — simulate success
      handlePaymentSuccess(ref, amount, planId);
      return;
    }

    setPaying(true);
    const handler = (window as any).PaystackPop?.setup({
      key: PAYSTACK_KEY,
      email,
      amount: amount * 100, // kobo
      currency: "NGN",
      ref,
      // Include plan_id in metadata so paystack-sync can match it without a table scan
      metadata: { user_id: user.id, plan_id: planId, level, plan_type: selectedPlan },
      callback: (res: any) => { setPaying(false); handlePaymentSuccess(res.reference, amount, planId); },
      onClose: () => { setPaying(false); toast({ title: "Payment cancelled" }); },
    });
    handler?.openIframe?.();
  };

  const handlePaymentSuccess = async (ref: string, amount: number, planId: string | null) => {
    if (!user || !enrollment) return;
    setPaying(true);
    const now      = new Date().toISOString();
    const durationMonths = selectedPlan === "monthly" ? 1 : 3;
    const nextDue  = addMonths(durationMonths);
    const receipt  = `RCT-${Math.random().toString(36).slice(2,10).toUpperCase()}`;

    // Update enrollment → active
    await supabase.from("enrollments" as any).update({
      status: "active",
      paid_at: now,
      next_due_date: nextDue,
      plan_type: selectedPlan,
      amount,
      level,
    }).eq("id", enrollment.id);

    // Update the pre-created pending payment row → success
    // (webhook will also do this, but this ensures immediate admin visibility)
    await supabase.from("payments" as any)
      .update({
        status:         "success",
        payment_method: "paystack",
        paid_at:        now,
      })
      .eq("paystack_reference", ref);

    // Also update profile payment_status and subscription_end_date immediately
    const subEnd = new Date();
    subEnd.setMonth(subEnd.getMonth() + durationMonths);
    await supabase.from("profiles").update({
      payment_status:        "paid",
      subscription_end_date: subEnd.toISOString().split("T")[0],
    } as any).eq("user_id", user.id);

    // Upsert student_subscriptions
    const { data: existingSub } = await supabase
      .from("student_subscriptions" as any)
      .select("id, end_date, status")
      .eq("student_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (existingSub) {
      const extendBase = existingSub.end_date && new Date(existingSub.end_date) > new Date()
        ? new Date(existingSub.end_date) : new Date();
      const extendEnd = new Date(extendBase);
      extendEnd.setMonth(extendEnd.getMonth() + durationMonths);
      await supabase.from("student_subscriptions" as any)
        .update({ end_date: extendEnd.toISOString().split("T")[0], status: "active" })
        .eq("id", existingSub.id);
    } else {
      await supabase.from("student_subscriptions" as any).insert({
        student_id: user.id,
        plan_id:    planId,
        status:     "active",
        start_date: now.split("T")[0],
        end_date:   subEnd.toISOString().split("T")[0],
      });
    }

    // Record legacy payment_history row (student's own history view)
    await supabase.from("payment_history" as any).insert({
      user_id:       user.id,
      enrollment_id: enrollment.id,
      amount,
      paid_at:       now,
      level,
      plan_type:     selectedPlan,
      receipt_id:    receipt,
      status:        "success",
      payment_ref:   ref,
    });

    toast({ title: "✅ Payment Successful!", description: `Receipt: ${receipt}` });
    await loadEnrollment();
    await loadHistory();
    setTab("status");
    setPaying(false);
  };

  // ── Status helpers ────────────────────────────────────────────
  const statusConfig = {
    active:  { color: "#2E7D32", bg: "#E8F5E9", icon: <CheckCircle2 size={18} />, label: "Active",        desc: "Full access to all features" },
    grace:   { color: "#F57C00", bg: "#FFF3E0", icon: <Clock size={18} />,        label: "Grace Period",  desc: `${graceRemaining} day${graceRemaining !== 1 ? "s" : ""} remaining` },
    locked:  { color: "#C62828", bg: "#FFEBEE", icon: <Lock size={18} />,         label: "Locked",        desc: "Complete payment to restore access" },
    unknown: { color: "#546E7A", bg: "#ECEFF1", icon: <Info size={18} />,         label: "Unknown",       desc: "Loading your status..." },
  }[accessStatus];

  // ── RENDER ──────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F7F5" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#075E54", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Loader2 style={{ width: 26, height: 26, color: "#fff", animation: "spin .8s linear infinite" }} />
        </div>
        <span style={{ color: "#667", fontSize: 14 }}>Loading your enrollment…</span>
      </div>
    </div>
  );

  const amountDue = selectedPlan === "monthly" ? fees.monthly : fees.term;

  return (
    <div style={{ minHeight: "100vh", background: "#F0F4F0", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.6; } }
        .enroll-card { background:#fff; border-radius:16px; box-shadow:0 2px 12px rgba(0,0,0,.07); overflow:hidden; animation: fadeUp .3s ease; }
        .plan-card { border:2px solid #e0e0e0; border-radius:14px; padding:16px; cursor:pointer; transition:all .2s; background:#fff; }
        .plan-card:hover { border-color:#075E54; box-shadow:0 4px 16px rgba(7,94,84,.12); }
        .plan-card.selected { border-color:#075E54; background:#F0FFF8; box-shadow:0 4px 20px rgba(7,94,84,.18); }
        .tab-btn { flex:1; padding:12px 8px; border:none; background:none; cursor:pointer; font-size:13px; font-weight:600; color:#999; border-bottom:3px solid transparent; transition:all .2s; }
        .tab-btn.active { color:#075E54; border-bottom-color:#075E54; }
        .pay-btn { width:100%; padding:16px; background:linear-gradient(135deg,#075E54,#128C7E); color:#fff; border:none; border-radius:14px; font-size:16px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px; transition:opacity .2s; box-shadow:0 4px 20px rgba(7,94,84,.35); }
        .pay-btn:disabled { opacity:.55; cursor:not-allowed; }
        .pay-btn:not(:disabled):hover { opacity:.92; }
        .history-row { display:flex; align-items:center; gap:12px; padding:14px 0; border-bottom:1px solid #f0f0f0; animation:fadeUp .2s ease; }
        .info-row { display:flex; align-items:center; gap:10; padding:12px 0; border-bottom:1px solid #f6f6f6; }
        .badge { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg, #064E3B 0%, #075E54 60%, #047857 100%)", padding: "50px 20px 24px", position: "relative", overflow: "hidden" }}>
        {/* Islamic pattern */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.06, backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23fff' fill-opacity='1'%3E%3Cpath d='M30 0l30 30-30 30L0 30z'/%3E%3C/g%3E%3C/svg%3E")` }} />
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <button onClick={() => navigate(-1)} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,.18)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
              <ArrowLeft size={18} />
            </button>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>Enrollment & Payment</span>
          </div>
          <div style={{ color: "rgba(255,255,255,.7)", fontSize: 13, fontFamily: "serif", textAlign: "center", marginBottom: 8 }}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>

          {/* Status badge in header */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: statusConfig.bg, color: statusConfig.color, borderRadius: 20, padding: "7px 16px", fontWeight: 700, fontSize: 13 }}>
              {statusConfig.icon}
              {statusConfig.label} — {statusConfig.desc}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px 40px" }}>

        {/* ── Grace Period Alert ─────────────────────────────────── */}
        {accessStatus === "grace" && (
          <div style={{ marginTop: 16, padding: "14px 16px", background: "#FFF8E1", borderRadius: 14, border: "1.5px solid #F9A825", display: "flex", alignItems: "flex-start", gap: 12, animation: "fadeUp .3s ease" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#FFF3CD", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Clock size={18} color="#F57C00" />
            </div>
            <div>
              <div style={{ fontWeight: 700, color: "#E65100", fontSize: 14 }}>{graceRemaining} day{graceRemaining !== 1 ? "s" : ""} left in grace period</div>
              <div style={{ fontSize: 12, color: "#8D5E00", marginTop: 2 }}>Complete payment to keep full access to your courses, Al-Majlis chat, and all features.</div>
              {graceRemaining <= 2 && (
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: "#C62828", animation: "pulse 1.5s infinite" }}>⚠️ Account will be locked in {graceRemaining} day{graceRemaining !== 1 ? "s" : ""}!</div>
              )}
            </div>
          </div>
        )}

        {/* ── Locked Alert ──────────────────────────────────────── */}
        {accessStatus === "locked" && (
          <div style={{ marginTop: 16, padding: "16px", background: "#FFEBEE", borderRadius: 14, border: "1.5px solid #EF9A9A", animation: "fadeUp .3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <Lock size={20} color="#C62828" />
              <span style={{ fontWeight: 700, color: "#C62828", fontSize: 15 }}>Dashboard Access Locked</span>
            </div>
            <div style={{ fontSize: 13, color: "#7B1A1A", lineHeight: 1.5 }}>
              Your grace period has ended. Several features are now restricted:
            </div>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {["Al-Majlis Chat", "Course Lessons", "Al-Hifdh Tracker", "Assignments & Exams"].map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#7B1A1A" }}>
                  <XCircle size={14} color="#E74C3C" /> {f} — <strong>Locked</strong>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: "#9e9e9e" }}>Contact your admin if you believe this is an error.</div>
          </div>
        )}

        {/* ── Student Info Card ─────────────────────────────────── */}
        <div className="enroll-card" style={{ marginTop: 16 }}>
          <div style={{ padding: "14px 18px", background: "linear-gradient(90deg, #064E3B, #075E54)", display: "flex", alignItems: "center", gap: 12 }}>
            {studentProfile?.avatar_url
              ? <img src={studentProfile.avatar_url} style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,.4)" }} alt="" />
              : <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,.18)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 20, fontWeight: 700, border: "2px solid rgba(255,255,255,.3)" }}>
                  {(studentProfile?.full_name || "S")[0].toUpperCase()}
                </div>
            }
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{studentProfile?.full_name || "Student"}</div>
              <div style={{ color: "rgba(255,255,255,.7)", fontSize: 12 }}>{studentProfile?.full_name_ar || ""}</div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <span className="badge" style={{ background: "rgba(255,255,255,.2)", color: "#fff" }}>
                <BookOpen size={11} /> {fees.label}
              </span>
            </div>
          </div>
          <div style={{ padding: "4px 0" }}>
            {[
              { icon: <Hash size={14} />, label: "Student ID", val: studentProfile?.student_id || "—" },
              { icon: <Mail size={14} />, label: "Email", val: studentProfile?.email || user?.email || "—" },
              { icon: <Calendar size={14} />, label: "Joined", val: fmtDate(studentProfile?.created_at || null) },
              { icon: <TrendingUp size={14} />, label: "Next Payment", val: fmtDate(enrollment?.next_due_date || null) },
            ].map((row, i) => (
              <div key={i} className="info-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 18px", borderBottom: i < 3 ? "1px solid #f6f6f6" : "none" }}>
                <span style={{ color: "#075E54", flexShrink: 0 }}>{row.icon}</span>
                <span style={{ fontSize: 13, color: "#888", minWidth: 90 }}>{row.label}</span>
                <span style={{ fontSize: 13, color: "#222", fontWeight: 600, marginLeft: "auto", textAlign: "right", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────── */}
        <div className="enroll-card" style={{ marginTop: 14, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", borderBottom: "1px solid #f0f0f0" }}>
            {([
              { key: "pay", icon: <CreditCard size={14} />, label: "Pay" },
              { key: "history", icon: <Clock size={14} />, label: "History" },
              { key: "status", icon: <BadgeCheck size={14} />, label: "Status" },
            ] as const).map(t => (
              <button key={t.key} className={`tab-btn ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* ── PAY TAB ───────────────────────────────────────── */}
          {tab === "pay" && (
            <div style={{ padding: "20px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 10, textTransform: "uppercase", letterSpacing: .5 }}>Your Level Plans</div>

                {/* Monthly plan */}
                <div className={`plan-card ${selectedPlan === "monthly" ? "selected" : ""}`} onClick={() => setSelectedPlan("monthly")} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#111" }}>Monthly Subscription</div>
                      <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>اشتراك شهري</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <span className="badge" style={{ background: "#E8F5E9", color: "#2E7D32" }}>1 month</span>
                        <span className="badge" style={{ background: "#E3F2FD", color: "#1565C0" }}>Monthly</span>
                        <span className="badge" style={{ background: "#EDE7F6", color: fees.color }}>{fees.label}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>{fmt(fees.monthly)}</div>
                      <div style={{ fontSize: 11, color: "#888" }}>per month</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 10 }}>Monthly access to all courses for your {fees.label} level</div>
                  {selectedPlan === "monthly" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: "#075E54", fontWeight: 700, fontSize: 12 }}>
                      <CheckCircle2 size={14} /> Selected
                    </div>
                  )}
                </div>

                {/* Term plan */}
                <div className={`plan-card ${selectedPlan === "term" ? "selected" : ""}`} onClick={() => setSelectedPlan("term")} style={{ position: "relative" }}>
                  {fees.term > fees.monthly && (
                    <div style={{ position: "absolute", top: 12, right: 12, background: "#075E54", color: "#fff", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <CheckCircle2 size={14} />
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#111" }}>{fees.label} Term Fee</div>
                      <div style={{ fontSize: 12, color: fees.color, marginTop: 2 }}>رسوم مستوى {fees.labelAr}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <span className="badge" style={{ background: "#E8F5E9", color: "#2E7D32" }}>3 months</span>
                        <span className="badge" style={{ background: "#FFF3E0", color: fees.color }}>{fees.label}</span>
                        <span className="badge" style={{ background: "#E3F2FD", color: "#1565C0" }}>Term</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>{fmt(fees.term)}</div>
                      <div style={{ fontSize: 11, color: "#888" }}>per term</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 10 }}>Full term access to all courses for your {fees.label} level</div>
                  {selectedPlan === "term" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: "#075E54", fontWeight: 700, fontSize: 12 }}>
                      <CheckCircle2 size={14} /> Selected
                    </div>
                  )}
                </div>
              </div>

              {/* Order summary */}
              <div style={{ background: "#F8FAF8", borderRadius: 12, padding: "14px 16px", border: "1px solid #e8f0e8" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 10, textTransform: "uppercase", letterSpacing: .5 }}>Order Summary</div>
                {[
                  { label: "Plan", val: selectedPlan === "monthly" ? "Monthly Subscription" : `${fees.label} Term Fee` },
                  { label: "Level", val: fees.label },
                  { label: "Duration", val: selectedPlan === "monthly" ? "1 Month" : "3 Months" },
                  { label: "Amount", val: fmt(amountDue), bold: true, green: true },
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: i < 3 ? 8 : 0, paddingTop: i === 3 ? 8 : 0, borderTop: i === 3 ? "1px dashed #ddd" : "none" }}>
                    <span style={{ fontSize: 13, color: "#888" }}>{r.label}</span>
                    <span style={{ fontSize: 13, fontWeight: r.bold ? 800 : 500, color: r.green ? "#075E54" : "#111" }}>{r.val}</span>
                  </div>
                ))}
              </div>

              <button className="pay-btn" onClick={initiatePayment} disabled={paying}>
                {paying
                  ? <><Loader2 style={{ width: 18, height: 18, animation: "spin .8s linear infinite" }} /> Processing…</>
                  : <><CreditCard size={18} /> Pay {fmt(amountDue)} Now</>
                }
              </button>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, color: "#999" }}>
                <Shield size={12} /> Secured by Paystack · SSL Encrypted
              </div>
            </div>
          )}

          {/* ── HISTORY TAB ──────────────────────────────────── */}
          {tab === "history" && (
            <div style={{ padding: "0 18px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0 10px" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>Payment History</span>
                <button onClick={loadHistory} style={{ background: "none", border: "none", cursor: "pointer", color: "#075E54", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                  <RefreshCw size={13} /> Refresh
                </button>
              </div>
              {loadingHistory && (
                <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
                  <Loader2 style={{ width: 22, height: 22, color: "#075E54", animation: "spin .8s linear infinite" }} />
                </div>
              )}
              {!loadingHistory && history.length === 0 && (
                <div style={{ textAlign: "center", padding: "28px 0", color: "#999" }}>
                  <CreditCard style={{ width: 36, height: 36, margin: "0 auto 10px", color: "#ddd" }} />
                  <div style={{ fontSize: 14 }}>No payments yet</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Your payment history will appear here</div>
                </div>
              )}
              {history.map((p, i) => (
                <div key={p.id} className="history-row">
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: p.status === "success" ? "#E8F5E9" : "#FFEBEE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {p.status === "success" ? <CheckCircle2 size={18} color="#2E7D32" /> : <XCircle size={18} color="#C62828" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#111" }}>
                      {p.plan_type === "monthly" ? "Monthly Subscription" : `${p.level} Term Fee`}
                    </div>
                    <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{fmtDateTime(p.paid_at)} · {p.receipt_id}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, color: p.status === "success" ? "#2E7D32" : "#C62828", fontSize: 14 }}>{fmt(p.amount)}</div>
                    <span className="badge" style={{ background: p.status === "success" ? "#E8F5E9" : "#FFEBEE", color: p.status === "success" ? "#2E7D32" : "#C62828", marginTop: 4 }}>
                      {p.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── STATUS TAB ───────────────────────────────────── */}
          {tab === "status" && (
            <div style={{ padding: "20px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Big status card */}
              <div style={{ background: statusConfig.bg, borderRadius: 14, padding: "20px 18px", border: `1.5px solid ${statusConfig.color}22`, textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: statusConfig.color, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", color: "#fff" }}>
                  {statusConfig.icon}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: statusConfig.color }}>{statusConfig.label}</div>
                <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>{statusConfig.desc}</div>
              </div>

              {/* Subscription detail */}
              {enrollment && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {[
                    { icon: <BookOpen size={15} />, label: "Level",        val: fees.label },
                    { icon: <CreditCard size={15} />, label: "Last Paid",  val: fmtDate(enrollment.paid_at) },
                    { icon: <Calendar size={15} />, label: "Next Due",     val: fmtDate(enrollment.next_due_date) },
                    { icon: <Clock size={15} />, label: "Grace Until",     val: fmtDate(enrollment.grace_end_date) },
                    ...(enrollment.admin_override ? [{ icon: <Unlock size={15} />, label: "Admin Override", val: `Until ${fmtDate(enrollment.admin_override_until)}` }] : []),
                  ].map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: "1px solid #f0f0f0" }}>
                      <span style={{ color: "#075E54" }}>{r.icon}</span>
                      <span style={{ fontSize: 13, color: "#888", minWidth: 100 }}>{r.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#222", marginLeft: "auto" }}>{r.val}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Feature access list */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 10, textTransform: "uppercase", letterSpacing: .5 }}>Feature Access</div>
                {[
                  { name: "Al-Majlis Chat",       allowed: accessStatus !== "locked" },
                  { name: "Course Lessons",        allowed: accessStatus === "active" },
                  { name: "Al-Hifdh Tracker",      allowed: accessStatus === "active" },
                  { name: "Assignments",           allowed: accessStatus === "active" },
                  { name: "Live Sessions",         allowed: accessStatus === "active" },
                  { name: "Dashboard Overview",    allowed: true },
                  { name: "Enrollment & Payment",  allowed: true },
                ].map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #f6f6f6" }}>
                    {f.allowed
                      ? <CheckCircle2 size={16} color="#2E7D32" />
                      : <Lock size={16} color="#E74C3C" />
                    }
                    <span style={{ fontSize: 13, color: f.allowed ? "#222" : "#999", flex: 1 }}>{f.name}</span>
                    <span className="badge" style={{ background: f.allowed ? "#E8F5E9" : "#FFEBEE", color: f.allowed ? "#2E7D32" : "#C62828" }}>
                      {f.allowed ? "Unlocked" : "Locked"}
                    </span>
                  </div>
                ))}
              </div>

              {/* Pay button if not active */}
              {accessStatus !== "active" && (
                <button className="pay-btn" onClick={() => setTab("pay")}>
                  <CreditCard size={18} /> Make a Payment
                </button>
              )}

              {/* Admin note */}
              {enrollment?.admin_override && (
                <div style={{ background: "#E8F5E9", borderRadius: 12, padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <Unlock size={16} color="#2E7D32" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#2E7D32" }}>Admin Access Override Active</div>
                    <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>An admin has granted you extended access until {fmtDate(enrollment.admin_override_until)}.</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Admin Panel ────────────────────────────────────── */}
        {isAdmin && enrollment && (
          <div className="enroll-card" style={{ marginTop: 14 }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 8 }}>
              <Shield size={16} color="#075E54" />
              <span style={{ fontWeight: 700, fontSize: 14, color: "#333" }}>Admin Controls</span>
            </div>
            <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Manually manage this student's access:</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={async () => {
                  const until = new Date(Date.now() + 7 * 86400000).toISOString();
                  await supabase.from("enrollments" as any).update({ admin_override: true, admin_override_until: until, status: "active" }).eq("id", enrollment.id);
                  await loadEnrollment();
                  toast({ title: "✅ 7-day access granted" });
                }} style={{ flex: 1, padding: "11px 8px", background: "#E8F5E9", color: "#2E7D32", border: "1.5px solid #A5D6A7", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                  <Unlock size={13} style={{ display: "inline", marginRight: 5 }} />Grant 7 Days
                </button>
                <button onClick={async () => {
                  await supabase.from("enrollments" as any).update({ admin_override: false, status: "locked" }).eq("id", enrollment.id);
                  await loadEnrollment();
                  toast({ title: "🔒 Access locked" });
                }} style={{ flex: 1, padding: "11px 8px", background: "#FFEBEE", color: "#C62828", border: "1.5px solid #EF9A9A", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                  <Lock size={13} style={{ display: "inline", marginRight: 5 }} />Lock Access
                </button>
              </div>
              <button onClick={async () => {
                await supabase.from("enrollments" as any).update({ status: "active", paid_at: new Date().toISOString(), next_due_date: addMonths(1) }).eq("id", enrollment.id);
                await loadEnrollment();
                toast({ title: "✅ Marked as paid" });
              }} style={{ padding: "11px", background: "#E3F2FD", color: "#1565C0", border: "1.5px solid #90CAF9", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                <CheckCircle2 size={13} style={{ display: "inline", marginRight: 5 }} />Mark as Paid (Manual)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnrollmentPayment;
