/*  src/pages/student/EnrollmentPayment.tsx
    PROFESSIONAL — Enhanced Enrollment & Payment
    ✔ Registration fee ₦5,000 (one-time, unlocks entrance exam)
    ✔ Student sees only their own level fee
    ✔ Monthly: ₦5k/₦6k/₦7k — Term: ₦15k/₦18k/₦21k
    ✔ Can pay at any time (not just when owing)
    ✔ Grace period countdown with locked state
    ✔ Admin override to unlock dashboard
    ✔ Full payment history & status tracking
*/
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, CreditCard, Clock, CheckCircle2, Info,
  Lock, Unlock, RefreshCw, Mail, BookOpen, Hash,
  Calendar, Shield, Loader2, TrendingUp, BadgeCheck,
  XCircle, Star, GraduationCap, FileText, Mic, Video,
  ArrowRight
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
  registration_paid: boolean;
  registration_paid_at: string | null;
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
  payment_type: "registration" | "subscription";
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
const REGISTRATION_FEE = 5000;

const LEVEL_FEES: Record<string, { monthly: number; term: number; label: string; labelAr: string; color: string }> = {
  beginner:     { monthly: 5000,  term: 15000, label: "Beginner",     labelAr: "المبتدئ",  color: "#2E7D32" },
  intermediate: { monthly: 6000,  term: 18000, label: "Intermediate", labelAr: "المتوسط", color: "#1565C0" },
  advanced:     { monthly: 7000,  term: 21000, label: "Advanced",     labelAr: "المتقدم", color: "#6A1B9A" },
  default:      { monthly: 5000,  term: 15000, label: "Standard",     labelAr: "الأساسي", color: "#075E54" },
};

const GRACE_DAYS   = 7;
const PAYSTACK_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";

// ── Helpers ───────────────────────────────────────────────────────
const fmt       = (n: number) => `₦${n.toLocaleString()}`;
const fmtDate   = (d: string | null) => d ? new Date(d).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDT     = (d: string | null) => d ? new Date(d).toLocaleString("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const daysLeft  = (d: string | null) => { if (!d) return 0; return Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)); };
const addMonths = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() + n); return d.toISOString(); };
const mkReceipt = () => `RCT-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

// ── Access control (exported) ─────────────────────────────────────
export type AccessStatus = "active" | "grace" | "locked" | "unknown";
export const getAccessStatus = (enr: Enrollment | null): AccessStatus => {
  if (!enr) return "unknown";
  if (enr.admin_override && enr.admin_override_until && new Date(enr.admin_override_until) > new Date()) return "active";
  if (enr.status === "active" && enr.next_due_date && new Date(enr.next_due_date) > new Date()) return "active";
  if (enr.status === "grace" && enr.grace_end_date && new Date(enr.grace_end_date) > new Date()) return "grace";
  return "locked";
};

// ── Locked overlay ────────────────────────────────────────────────
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
  const { toast }                  = useToast();
  const navigate                   = useNavigate();

  const [tab, setTab]                       = useState<"pay"|"history"|"status">("pay");
  const [enrollment, setEnrollment]         = useState<Enrollment | null>(null);
  const [history, setHistory]               = useState<PaymentRecord[]>([]);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading]               = useState(true);
  const [paying, setPaying]                 = useState(false);
  const [payingReg, setPayingReg]           = useState(false);
  const [selectedPlan, setSelectedPlan]     = useState<"monthly"|"term">("monthly");
  const [loadingHistory, setLoadingHistory] = useState(false);

  const isAdmin        = hasRole("admin");
  const level          = ((profile as any)?.level || "beginner").toLowerCase();
  const fees           = LEVEL_FEES[level] || LEVEL_FEES.default;
  const accessStatus   = getAccessStatus(enrollment);
  const graceRemaining = daysLeft(enrollment?.grace_end_date || null);
  const amountDue      = selectedPlan === "monthly" ? fees.monthly : fees.term;
  const regPaid        = enrollment?.registration_paid ?? false;

  // ── Load ──────────────────────────────────────────────────────
  const loadEnrollment = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: prof } = await supabase.from("profiles")
        .select("user_id,full_name,full_name_ar,email,level,student_id,avatar_url,created_at")
        .eq("user_id", user.id).maybeSingle();
      if (prof) setStudentProfile(prof as unknown as StudentProfile);

      let { data: enr } = await supabase.from("enrollments" as any)
        .select("*").eq("user_id", user.id).maybeSingle();

      if (!enr) {
        const graceEnd = new Date(Date.now() + GRACE_DAYS * 86400000).toISOString();
        const { data: created } = await supabase.from("enrollments" as any)
          .insert({ user_id: user.id, level, plan_type: "monthly", amount: fees.monthly, status: "grace", grace_end_date: graceEnd, admin_override: false, registration_paid: false, registration_paid_at: null })
          .select().single();
        enr = created;
      }

      // ── Existing students: if they already have active/grace status but
      //    registration_paid is false, they pre-date the reg fee system → auto-mark paid
      if (enr && !enr.registration_paid && (enr.status === "active" || enr.status === "grace") && enr.paid_at) {
        await supabase.from("enrollments" as any)
          .update({ registration_paid: true, registration_paid_at: enr.paid_at })
          .eq("id", enr.id);
        enr = { ...enr, registration_paid: true, registration_paid_at: enr.paid_at };
      }

      if (enr && enr.status === "grace" && enr.grace_end_date && new Date(enr.grace_end_date) < new Date()) {
        await supabase.from("enrollments" as any).update({ status: "locked" }).eq("id", enr.id);
        enr = { ...enr, status: "locked" };
      }

      setEnrollment(enr as unknown as Enrollment);
    } finally { setLoading(false); }
  }, [user, level, fees.monthly]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    setLoadingHistory(true);
    const { data } = await supabase.from("payment_history" as any)
      .select("*").eq("user_id", user.id).order("paid_at", { ascending: false }).limit(50);
    setHistory((data || []) as unknown as PaymentRecord[]);
    setLoadingHistory(false);
  }, [user]);

  useEffect(() => { loadEnrollment(); }, [loadEnrollment]);
  useEffect(() => { if (tab === "history") loadHistory(); }, [tab, loadHistory]);

  // ── Paystack wrapper ──────────────────────────────────────────
  const runPaystack = (amount: number, onSuccess: (ref: string) => void, onCancel?: () => void) => {
    const email = studentProfile?.email || user?.email || "";
    const ref   = `TAH-${(user?.id || "").slice(0, 8)}-${Date.now()}`;

    // No key configured — demo mode
    if (!PAYSTACK_KEY) {
      toast({ title: "⚠️ Demo mode", description: "No Paystack key — simulating payment." });
      setTimeout(() => onSuccess(ref), 1000);
      return;
    }

    // Script not loaded
    const PaystackPop = (window as any).PaystackPop;
    if (!PaystackPop) {
      toast({
        title: "Payment system not ready",
        description: "Please refresh the page and try again.",
        variant: "destructive",
      });
      onCancel?.();
      return;
    }

    try {
      const h = PaystackPop.setup({
        key: PAYSTACK_KEY,
        email,
        amount: amount * 100,
        currency: "NGN",
        ref,
        metadata: { user_id: user?.id, level },
        callback: (res: any) => onSuccess(res.reference),
        onClose: () => {
          toast({ title: "Payment cancelled" });
          onCancel?.();
        },
      });
      h.openIframe();
    } catch (err: any) {
      toast({ title: "Payment failed to open", description: err?.message || "Please try again.", variant: "destructive" });
      onCancel?.();
    }
  };

  // ── Pay registration ──────────────────────────────────────────
  const payRegistration = () => {
    if (!user || !enrollment) return;
    setPayingReg(true);
    runPaystack(REGISTRATION_FEE, async (ref) => {
      const now = new Date().toISOString();
      const rcpt = mkReceipt();
      await supabase.from("enrollments" as any).update({ registration_paid: true, registration_paid_at: now }).eq("id", enrollment.id);
      await supabase.from("payment_history" as any).insert({ user_id: user.id, enrollment_id: enrollment.id, amount: REGISTRATION_FEE, paid_at: now, level, plan_type: "registration", receipt_id: rcpt, status: "success", payment_ref: ref, payment_type: "registration" });
      toast({ title: "✅ Registration Fee Paid!", description: `Receipt: ${rcpt}. You may now proceed to the entrance exam.` });
      await loadEnrollment();
      setPayingReg(false);
    }, () => setPayingReg(false));
  };

  // ── Pay subscription ──────────────────────────────────────────
  const initiatePayment = () => {
    if (!user || !enrollment) return;
    setPaying(true);
    runPaystack(amountDue, async (ref) => {
      const now = new Date().toISOString();
      const rcpt = mkReceipt();
      await supabase.from("enrollments" as any).update({ status: "active", paid_at: now, next_due_date: addMonths(selectedPlan === "monthly" ? 1 : 3), plan_type: selectedPlan, amount: amountDue, level }).eq("id", enrollment.id);
      await supabase.from("payment_history" as any).insert({ user_id: user.id, enrollment_id: enrollment.id, amount: amountDue, paid_at: now, level, plan_type: selectedPlan, receipt_id: rcpt, status: "success", payment_ref: ref, payment_type: "subscription" });
      toast({ title: "✅ Payment Successful!", description: `Receipt: ${rcpt}` });
      await loadEnrollment();
      await loadHistory();
      setTab("status");
      setPaying(false);
    }, () => setPaying(false));
  };

  const statusConfig = {
    active:  { color: "#2E7D32", bg: "#E8F5E9", icon: <CheckCircle2 size={18} />, label: "Active",       desc: "Full access to all features" },
    grace:   { color: "#F57C00", bg: "#FFF3E0", icon: <Clock size={18} />,        label: "Grace Period", desc: `${graceRemaining} day${graceRemaining !== 1 ? "s" : ""} remaining` },
    locked:  { color: "#C62828", bg: "#FFEBEE", icon: <Lock size={18} />,         label: "Locked",       desc: "Complete payment to restore access" },
    unknown: { color: "#546E7A", bg: "#ECEFF1", icon: <Info size={18} />,         label: "Unknown",      desc: "Loading…" },
  }[accessStatus];

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

  return (
    <div style={{ minHeight: "100vh", background: "#F0F4F0", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{`
        @keyframes spin   { to { transform:rotate(360deg); } }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.6} }
        @keyframes glow   { 0%,100%{box-shadow:0 0 0 0 rgba(212,168,67,.4)} 50%{box-shadow:0 0 0 10px rgba(212,168,67,0)} }
        .ec   { background:#fff; border-radius:16px; box-shadow:0 2px 12px rgba(0,0,0,.07); overflow:hidden; animation:fadeUp .3s ease; }
        .pc   { border:2px solid #e0e0e0; border-radius:14px; padding:16px; cursor:pointer; transition:all .2s; background:#fff; }
        .pc:hover { border-color:#075E54; box-shadow:0 4px 16px rgba(7,94,84,.12); }
        .pc.sel { border-color:#075E54; background:#F0FFF8; box-shadow:0 4px 20px rgba(7,94,84,.18); }
        .tb   { flex:1; padding:12px 8px; border:none; background:none; cursor:pointer; font-size:13px; font-weight:600; color:#999; border-bottom:3px solid transparent; transition:all .2s; display:flex; align-items:center; justify-content:center; gap:6px; }
        .tb.a { color:#075E54; border-bottom-color:#075E54; }
        .pb   { width:100%; padding:16px; background:linear-gradient(135deg,#075E54,#128C7E); color:#fff; border:none; border-radius:14px; font-size:16px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px; transition:opacity .2s; box-shadow:0 4px 20px rgba(7,94,84,.35); }
        .pb:disabled { opacity:.55; cursor:not-allowed; }
        .rb   { width:100%; padding:16px; background:linear-gradient(135deg,#D4A843,#B8860B); color:#fff; border:none; border-radius:14px; font-size:16px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px; animation:glow 2s infinite; }
        .rb:disabled { opacity:.55; cursor:not-allowed; animation:none; }
        .hr   { display:flex; align-items:center; gap:12px; padding:14px 0; border-bottom:1px solid #f0f0f0; }
        .bdg  { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; }
      `}</style>

      {/* HEADER */}
      <div style={{ background: "linear-gradient(135deg,#064E3B,#075E54,#047857)", padding: "50px 20px 24px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: .06, backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23fff'%3E%3Cpath d='M30 0l30 30-30 30L0 30z'/%3E%3C/g%3E%3C/svg%3E")` }} />
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <button onClick={() => navigate(-1)} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,.18)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
              <ArrowLeft size={18} />
            </button>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>Enrollment & Payment</span>
          </div>
          <div style={{ color: "rgba(255,255,255,.7)", fontSize: 13, fontFamily: "serif", textAlign: "center", marginBottom: 8 }}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: statusConfig.bg, color: statusConfig.color, borderRadius: 20, padding: "7px 16px", fontWeight: 700, fontSize: 13 }}>
              {statusConfig.icon} {statusConfig.label} — {statusConfig.desc}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px 40px" }}>

        {/* ── STEP 1: REGISTRATION FEE (unpaid) ─────────────────── */}
        {!regPaid && (
          <div className="ec" style={{ marginTop: 16, border: "2px solid #D4A843" }}>
            <div style={{ padding: "16px 18px", background: "linear-gradient(135deg,#FFFBEB,#FEF3C7)", borderBottom: "1px solid #F9D46A" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#D4A843", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Star size={19} color="#fff" fill="#fff" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "#92400E" }}>Step 1 — Pay Registration Fee</div>
                  <div style={{ fontSize: 12, color: "#A16207" }}>One-time · Unlocks entrance exam & level assignment</div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#92400E", flexShrink: 0 }}>{fmt(REGISTRATION_FEE)}</div>
              </div>
            </div>
            <div style={{ padding: "16px 18px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#666", marginBottom: 12, textTransform: "uppercase" as const, letterSpacing: .5 }}>The 5-Step Enrolment Process</div>
              {[
                { icon: <FileText size={15} color="#D4A843" />,    num: "1", title: "Fill Onboarding Form",         desc: "Personal details, Quran background & goals" },
                { icon: <GraduationCap size={15} color="#2563EB" />, num: "2", title: "Written Entrance Exam",      desc: "Tajweed, Arabic & Islamic knowledge test" },
                { icon: <Mic size={15} color="#7C3AED" />,          num: "3", title: "Recitation Audio Submission", desc: "Record your recitation — AI scores accuracy" },
                { icon: <Video size={15} color="#16A34A" />,         num: "4", title: "Live Teacher Session",        desc: "10–15 min Tajweed & Makharij evaluation" },
                { icon: <CheckCircle2 size={15} color="#075E54" />,  num: "5", title: "Admin Level Assignment",      desc: "Exam + AI + teacher scores → your level" },
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: i < 4 ? 12 : 16 }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#F9FAFB", border: "1.5px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {s.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#999", letterSpacing: .5 }}>STEP {s.num}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{s.title}</div>
                    <div style={{ fontSize: 12, color: "#666", lineHeight: 1.4 }}>{s.desc}</div>
                  </div>
                </div>
              ))}
              <button className="rb" onClick={payRegistration} disabled={payingReg}>
                {payingReg
                  ? <><Loader2 style={{ width: 18, height: 18, animation: "spin .8s linear infinite" }} /> Processing…</>
                  : <><Star size={17} fill="currentColor" /> Pay Registration Fee — {fmt(REGISTRATION_FEE)}</>
                }
              </button>
              <div style={{ textAlign: "center", fontSize: 11, color: "#999", marginTop: 8 }}>
                One-time · Secured by Paystack · Non-refundable after exam begins
              </div>
            </div>
          </div>
        )}

        {/* ── REGISTRATION PAID CONFIRMATION ───────────────────── */}
        {regPaid && (
          <div style={{ marginTop: 16, padding: "12px 16px", background: "#E8F5E9", borderRadius: 12, border: "1.5px solid #A5D6A7", display: "flex", alignItems: "center", gap: 10 }}>
            <CheckCircle2 size={20} color="#2E7D32" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#2E7D32" }}>Registration Fee Paid ✓</div>
              <div style={{ fontSize: 12, color: "#388E3C" }}>Paid {fmtDate(enrollment?.registration_paid_at || null)} · Entrance exam unlocked</div>
            </div>
            <button onClick={() => navigate("/onboarding")} style={{ background: "#2E7D32", color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              Continue <ArrowRight size={13} />
            </button>
          </div>
        )}

        {/* ── GRACE ALERT ───────────────────────────────────────── */}
        {accessStatus === "grace" && regPaid && (
          <div style={{ marginTop: 16, padding: "14px 16px", background: "#FFF8E1", borderRadius: 14, border: "1.5px solid #F9A825", display: "flex", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#FFF3CD", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Clock size={18} color="#F57C00" />
            </div>
            <div>
              <div style={{ fontWeight: 700, color: "#E65100", fontSize: 14 }}>{graceRemaining} day{graceRemaining !== 1 ? "s" : ""} left in grace period</div>
              <div style={{ fontSize: 12, color: "#8D5E00", marginTop: 2 }}>Subscribe to keep full access to all features.</div>
              {graceRemaining <= 2 && <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: "#C62828", animation: "pulse 1.5s infinite" }}>⚠️ Account locks in {graceRemaining} day{graceRemaining !== 1 ? "s" : ""}!</div>}
            </div>
          </div>
        )}

        {/* ── LOCKED ALERT ──────────────────────────────────────── */}
        {accessStatus === "locked" && regPaid && (
          <div style={{ marginTop: 16, padding: "16px", background: "#FFEBEE", borderRadius: 14, border: "1.5px solid #EF9A9A" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <Lock size={20} color="#C62828" />
              <span style={{ fontWeight: 700, color: "#C62828", fontSize: 15 }}>Dashboard Access Locked</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {["Al-Majlis Chat","Course Lessons","Al-Hifdh Tracker","Assignments & Exams"].map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#7B1A1A" }}>
                  <XCircle size={14} color="#E74C3C" /> {f} — <strong>Locked</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── STUDENT INFO CARD ─────────────────────────────────── */}
        <div className="ec" style={{ marginTop: 16 }}>
          <div style={{ padding: "14px 18px", background: "linear-gradient(90deg,#064E3B,#075E54)", display: "flex", alignItems: "center", gap: 12 }}>
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
            <div style={{ marginLeft: "auto" }}>
              <span className="bdg" style={{ background: "rgba(255,255,255,.2)", color: "#fff" }}>
                <BookOpen size={11} /> {fees.label}
              </span>
            </div>
          </div>
          <div style={{ padding: "4px 0" }}>
            {[
              { icon: <Hash size={14} />,      label: "Student ID",   val: studentProfile?.student_id || "—" },
              { icon: <Mail size={14} />,       label: "Email",        val: studentProfile?.email || user?.email || "—" },
              { icon: <Calendar size={14} />,   label: "Joined",       val: fmtDate(studentProfile?.created_at || null) },
              { icon: <Star size={14} />,        label: "Registration", val: regPaid ? `Paid ${fmtDate(enrollment?.registration_paid_at || null)}` : "Not paid yet" },
              { icon: <TrendingUp size={14} />, label: "Next Payment", val: fmtDate(enrollment?.next_due_date || null) },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 18px", borderBottom: i < 4 ? "1px solid #f6f6f6" : "none" }}>
                <span style={{ color: "#075E54", flexShrink: 0 }}>{row.icon}</span>
                <span style={{ fontSize: 13, color: "#888", minWidth: 100 }}>{row.label}</span>
                <span style={{ fontSize: 13, color: i === 3 && !regPaid ? "#C62828" : "#222", fontWeight: 600, marginLeft: "auto", textAlign: "right" as const, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{row.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── TABS (subscription — only when reg paid) ──────────── */}
        {regPaid && (
          <div className="ec" style={{ marginTop: 14, padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", borderBottom: "1px solid #f0f0f0" }}>
              {([
                { key: "pay",     icon: <CreditCard size={14} />, label: "Pay" },
                { key: "history", icon: <Clock size={14} />,      label: "History" },
                { key: "status",  icon: <BadgeCheck size={14} />, label: "Status" },
              ] as const).map(t => (
                <button key={t.key} className={`tb ${tab === t.key ? "a" : ""}`} onClick={() => setTab(t.key)}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* PAY */}
            {tab === "pay" && (
              <div style={{ padding: "20px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: .5 }}>Your Level Plans — {fees.label}</div>

                <div className={`pc ${selectedPlan === "monthly" ? "sel" : ""}`} onClick={() => setSelectedPlan("monthly")}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#111" }}>Monthly Subscription</div>
                      <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>اشتراك شهري</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <span className="bdg" style={{ background: "#E8F5E9", color: "#2E7D32" }}>1 month</span>
                        <span className="bdg" style={{ background: "#E3F2FD", color: "#1565C0" }}>Monthly</span>
                        <span className="bdg" style={{ background: "#EDE7F6", color: fees.color }}>{fees.label}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" as const }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>{fmt(fees.monthly)}</div>
                      <div style={{ fontSize: 11, color: "#888" }}>per month</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 10 }}>Monthly access to all {fees.label} level courses & features</div>
                  {selectedPlan === "monthly" && <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: "#075E54", fontWeight: 700, fontSize: 12 }}><CheckCircle2 size={14} /> Selected</div>}
                </div>

                <div className={`pc ${selectedPlan === "term" ? "sel" : ""}`} onClick={() => setSelectedPlan("term")}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#111" }}>{fees.label} Term Fee</div>
                      <div style={{ fontSize: 12, color: fees.color, marginTop: 2 }}>رسوم مستوى {fees.labelAr}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <span className="bdg" style={{ background: "#E8F5E9", color: "#2E7D32" }}>3 months</span>
                        <span className="bdg" style={{ background: "#FFF3E0", color: fees.color }}>{fees.label}</span>
                        <span className="bdg" style={{ background: "#E3F2FD", color: "#1565C0" }}>Term</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" as const }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>{fmt(fees.term)}</div>
                      <div style={{ fontSize: 11, color: "#888" }}>= {fmt(fees.monthly)} × 3 months</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 10 }}>Full term access — all {fees.label} level features</div>
                  {selectedPlan === "term" && <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: "#075E54", fontWeight: 700, fontSize: 12 }}><CheckCircle2 size={14} /> Selected</div>}
                </div>

                <div style={{ background: "#F8FAF8", borderRadius: 12, padding: "14px 16px", border: "1px solid #e8f0e8" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: .5 }}>Order Summary</div>
                  {[
                    { label: "Plan",     val: selectedPlan === "monthly" ? "Monthly Subscription" : `${fees.label} Term Fee` },
                    { label: "Level",    val: fees.label },
                    { label: "Duration", val: selectedPlan === "monthly" ? "1 Month" : "3 Months" },
                    { label: "Amount",   val: fmt(amountDue), bold: true, green: true },
                  ].map((r, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: i < 3 ? 8 : 0, paddingTop: i === 3 ? 8 : 0, borderTop: i === 3 ? "1px dashed #ddd" : "none" }}>
                      <span style={{ fontSize: 13, color: "#888" }}>{r.label}</span>
                      <span style={{ fontSize: 13, fontWeight: r.bold ? 800 : 500, color: r.green ? "#075E54" : "#111" }}>{r.val}</span>
                    </div>
                  ))}
                </div>

                <button className="pb" onClick={initiatePayment} disabled={paying}>
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

            {/* HISTORY */}
            {tab === "history" && (
              <div style={{ padding: "0 18px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0 10px" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>Payment History</span>
                  <button onClick={loadHistory} style={{ background: "none", border: "none", cursor: "pointer", color: "#075E54", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                    <RefreshCw size={13} /> Refresh
                  </button>
                </div>
                {loadingHistory && <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Loader2 style={{ width: 22, height: 22, color: "#075E54", animation: "spin .8s linear infinite" }} /></div>}
                {!loadingHistory && history.length === 0 && (
                  <div style={{ textAlign: "center", padding: "28px 0", color: "#999" }}>
                    <CreditCard style={{ width: 36, height: 36, margin: "0 auto 10px", color: "#ddd" }} />
                    <div style={{ fontSize: 14 }}>No payments yet</div>
                  </div>
                )}
                {history.map(p => (
                  <div key={p.id} className="hr">
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: p.status === "success" ? "#E8F5E9" : "#FFEBEE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {p.status === "success" ? <CheckCircle2 size={18} color="#2E7D32" /> : <XCircle size={18} color="#C62828" />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#111" }}>
                        {(p as any).payment_type === "registration" ? "🌟 Registration Fee" : p.plan_type === "monthly" ? "Monthly Subscription" : `${p.level} Term Fee`}
                      </div>
                      <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{fmtDT(p.paid_at)} · {p.receipt_id}</div>
                    </div>
                    <div style={{ textAlign: "right" as const }}>
                      <div style={{ fontWeight: 800, color: p.status === "success" ? "#2E7D32" : "#C62828", fontSize: 14 }}>{fmt(p.amount)}</div>
                      <span className="bdg" style={{ background: p.status === "success" ? "#E8F5E9" : "#FFEBEE", color: p.status === "success" ? "#2E7D32" : "#C62828" }}>{p.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* STATUS */}
            {tab === "status" && (
              <div style={{ padding: "20px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ background: statusConfig.bg, borderRadius: 14, padding: "20px 18px", border: `1.5px solid ${statusConfig.color}22`, textAlign: "center" }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: statusConfig.color, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", color: "#fff" }}>
                    {statusConfig.icon}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: statusConfig.color }}>{statusConfig.label}</div>
                  <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>{statusConfig.desc}</div>
                </div>

                {enrollment && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {[
                      { icon: <BookOpen size={15} />,   label: "Level",        val: fees.label },
                      { icon: <Star size={15} />,        label: "Registration", val: regPaid ? "Paid ✓" : "Not paid" },
                      { icon: <CreditCard size={15} />,  label: "Last Paid",    val: fmtDate(enrollment.paid_at) },
                      { icon: <Calendar size={15} />,    label: "Next Due",     val: fmtDate(enrollment.next_due_date) },
                      { icon: <Clock size={15} />,       label: "Grace Until",  val: fmtDate(enrollment.grace_end_date) },
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

                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: .5 }}>Feature Access</div>
                  {[
                    { name: "Enrollment & Payment",  allowed: true },
                    { name: "Dashboard Overview",    allowed: true },
                    { name: "Entrance Exam",         allowed: regPaid },
                    { name: "Al-Majlis Chat",        allowed: accessStatus !== "locked" },
                    { name: "Course Lessons",        allowed: accessStatus === "active" },
                    { name: "Al-Hifdh Tracker",      allowed: accessStatus === "active" },
                    { name: "Assignments & Exams",   allowed: accessStatus === "active" },
                    { name: "Live Sessions",         allowed: accessStatus === "active" },
                  ].map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #f6f6f6" }}>
                      {f.allowed ? <CheckCircle2 size={16} color="#2E7D32" /> : <Lock size={16} color="#E74C3C" />}
                      <span style={{ fontSize: 13, color: f.allowed ? "#222" : "#999", flex: 1 }}>{f.name}</span>
                      <span className="bdg" style={{ background: f.allowed ? "#E8F5E9" : "#FFEBEE", color: f.allowed ? "#2E7D32" : "#C62828" }}>
                        {f.allowed ? "Unlocked" : "Locked"}
                      </span>
                    </div>
                  ))}
                </div>

                {accessStatus !== "active" && (
                  <button className="pb" onClick={() => setTab("pay")}>
                    <CreditCard size={18} /> Make a Payment
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ADMIN PANEL ───────────────────────────────────────── */}
        {isAdmin && enrollment && (
          <div className="ec" style={{ marginTop: 14 }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 8 }}>
              <Shield size={16} color="#075E54" />
              <span style={{ fontWeight: 700, fontSize: 14, color: "#333" }}>Admin Controls</span>
            </div>
            <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={async () => {
                  const until = new Date(Date.now() + 7 * 86400000).toISOString();
                  await supabase.from("enrollments" as any).update({ admin_override: true, admin_override_until: until, status: "active" }).eq("id", enrollment.id);
                  await loadEnrollment(); toast({ title: "✅ 7-day access granted" });
                }} style={{ flex: 1, padding: "11px 8px", background: "#E8F5E9", color: "#2E7D32", border: "1.5px solid #A5D6A7", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                  <Unlock size={13} style={{ display: "inline", marginRight: 5 }} />Grant 7 Days
                </button>
                <button onClick={async () => {
                  await supabase.from("enrollments" as any).update({ admin_override: false, status: "locked" }).eq("id", enrollment.id);
                  await loadEnrollment(); toast({ title: "🔒 Access locked" });
                }} style={{ flex: 1, padding: "11px 8px", background: "#FFEBEE", color: "#C62828", border: "1.5px solid #EF9A9A", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                  <Lock size={13} style={{ display: "inline", marginRight: 5 }} />Lock Access
                </button>
              </div>
              <button onClick={async () => {
                await supabase.from("enrollments" as any).update({ registration_paid: true, registration_paid_at: new Date().toISOString() }).eq("id", enrollment.id);
                await loadEnrollment(); toast({ title: "✅ Registration marked as paid" });
              }} style={{ padding: "11px", background: "#FFF8E1", color: "#92400E", border: "1.5px solid #F9A825", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                <Star size={13} style={{ display: "inline", marginRight: 5 }} />Mark Registration as Paid
              </button>
              <button onClick={async () => {
                await supabase.from("enrollments" as any).update({ status: "active", paid_at: new Date().toISOString(), next_due_date: addMonths(1) }).eq("id", enrollment.id);
                await loadEnrollment(); toast({ title: "✅ Subscription marked as paid" });
              }} style={{ padding: "11px", background: "#E3F2FD", color: "#1565C0", border: "1.5px solid #90CAF9", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                <CheckCircle2 size={13} style={{ display: "inline", marginRight: 5 }} />Mark Subscription as Paid
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnrollmentPayment;
