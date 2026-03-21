/*  src/pages/student/EnrollmentPayment.tsx
    ─────────────────────────────────────────────────────────────────
    NEW students     → Full Enrollment flow
                        Step 1: Pay Registration Fee (₦5,000 one-time)
                        Step 2: Complete 5-step onboarding process
                        Step 3: Pay subscription to activate account
    EXISTING students → Payment / Renewal only
                        No registration section shown at all
                        Renew monthly or term, view history, check status
    ─────────────────────────────────────────────────────────────────
*/
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, CreditCard, Clock, CheckCircle2,
  Lock, Unlock, RefreshCw, Mail, BookOpen, Hash,
  Calendar, Shield, Loader2, TrendingUp, BadgeCheck,
  XCircle, Star, GraduationCap, FileText, Mic, Video,
  ArrowRight, RotateCcw, AlertTriangle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────
interface Enrollment {
  id: string; user_id: string; level: string;
  plan_type: "monthly" | "term"; amount: number;
  status: "active" | "grace" | "expired" | "locked";
  grace_end_date: string | null; paid_at: string | null;
  next_due_date: string | null; admin_override: boolean;
  admin_override_until: string | null; created_at: string;
  registration_paid: boolean; registration_paid_at: string | null;
}
interface PaymentRecord {
  id: string; user_id: string; amount: number; paid_at: string;
  level: string; plan_type: string; receipt_id: string;
  status: "success" | "failed" | "pending"; payment_ref: string | null;
  payment_type: "registration" | "subscription";
}
interface StudentProfile {
  user_id: string; full_name: string; full_name_ar: string;
  email: string; level: string; student_id: string;
  avatar_url: string; created_at: string;
}

// ── Fee schedule ──────────────────────────────────────────────────
const REGISTRATION_FEE = 5000;
const LEVEL_FEES: Record<string, { monthly: number; term: number; label: string; labelAr: string; color: string }> = {
  beginner:     { monthly: 5000, term: 15000, label: "Beginner",     labelAr: "المبتدئ",  color: "#2E7D32" },
  intermediate: { monthly: 6000, term: 18000, label: "Intermediate", labelAr: "المتوسط", color: "#1565C0" },
  advanced:     { monthly: 7000, term: 21000, label: "Advanced",     labelAr: "المتقدم", color: "#6A1B9A" },
  default:      { monthly: 5000, term: 15000, label: "Standard",     labelAr: "الأساسي", color: "#075E54" },
};
const GRACE_DAYS   = 7;
const PAYSTACK_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";

// ── Helpers ───────────────────────────────────────────────────────
const fmt      = (n: number) => `₦${n.toLocaleString()}`;
const fmtDate  = (d: string | null) => d ? new Date(d).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDT    = (d: string | null) => d ? new Date(d).toLocaleString("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const daysLeft = (d: string | null) => { if (!d) return 0; return Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)); };
const addMonths= (n: number) => { const d = new Date(); d.setMonth(d.getMonth() + n); return d.toISOString(); };
const mkReceipt= () => `RCT-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

// ── Access helpers (exported) ─────────────────────────────────────
export type AccessStatus = "active" | "grace" | "locked" | "unknown";
export const getAccessStatus = (enr: Enrollment | null): AccessStatus => {
  if (!enr) return "unknown";
  if (enr.admin_override && enr.admin_override_until && new Date(enr.admin_override_until) > new Date()) return "active";
  if (enr.status === "active" && enr.next_due_date && new Date(enr.next_due_date) > new Date()) return "active";
  if (enr.status === "grace" && enr.grace_end_date && new Date(enr.grace_end_date) > new Date()) return "grace";
  return "locked";
};

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

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
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
  const [isNewStudent, setIsNewStudent]     = useState(false);

  const isAdmin      = hasRole("admin");
  const level        = ((profile as any)?.level || "beginner").toLowerCase();
  const fees         = LEVEL_FEES[level] || LEVEL_FEES.default;
  const accessStatus = getAccessStatus(enrollment);
  const graceLeft    = daysLeft(enrollment?.grace_end_date || null);
  const amountDue    = selectedPlan === "monthly" ? fees.monthly : fees.term;

  // A student is "new" if their registration fee is not yet paid
  const regPaid = enrollment?.registration_paid === true;

  // ── Load ────────────────────────────────────────────────────
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
        // Brand new student — create enrollment row, flag as new
        setIsNewStudent(true);
        const graceEnd = new Date(Date.now() + GRACE_DAYS * 86400000).toISOString();
        const { data: created } = await supabase.from("enrollments" as any)
          .insert({ user_id: user.id, level, plan_type: "monthly", amount: fees.monthly, status: "grace", grace_end_date: graceEnd, admin_override: false, registration_paid: false, registration_paid_at: null })
          .select().single();
        enr = created;
      } else {
        // Existing student — check if they predate the registration fee system
        if (!enr.registration_paid) {
          // They have an enrollment row but never paid registration →
          // they're old students who existed before the fee was introduced → mark as paid
          const paidAt = enr.paid_at || enr.created_at || new Date().toISOString();
          supabase.from("enrollments" as any)
            .update({ registration_paid: true, registration_paid_at: paidAt })
            .eq("id", enr.id).then(() => {});
          enr = { ...enr, registration_paid: true, registration_paid_at: paidAt };
        }
        // Existing student who has paid registration → NOT a new student
        setIsNewStudent(false);
      }

      // Auto-lock if grace expired
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

  // ── Paystack ────────────────────────────────────────────────
  const runPaystack = (amount: number, onSuccess: (ref: string) => void, onCancel?: () => void) => {
    const email = studentProfile?.email || user?.email || "";
    const ref   = `TAH-${(user?.id || "").slice(0, 8)}-${Date.now()}`;
    if (!PAYSTACK_KEY) {
      toast({ title: "⚠️ Demo mode", description: "No Paystack key — simulating payment." });
      setTimeout(() => onSuccess(ref), 1000);
      return;
    }
    const PaystackPop = (window as any).PaystackPop;
    if (!PaystackPop) {
      toast({ title: "Payment system not ready", description: "Please refresh and try again.", variant: "destructive" });
      onCancel?.(); return;
    }
    try {
      const h = PaystackPop.setup({
        key: PAYSTACK_KEY, email, amount: amount * 100, currency: "NGN", ref,
        metadata: { user_id: user?.id, level },
        callback: (res: any) => onSuccess(res.reference),
        onClose: () => { toast({ title: "Payment cancelled" }); onCancel?.(); },
      });
      h.openIframe();
    } catch (err: any) {
      toast({ title: "Payment failed to open", description: err?.message || "Please try again.", variant: "destructive" });
      onCancel?.();
    }
  };

  const payRegistration = () => {
    if (!user || !enrollment) return;
    setPayingReg(true);
    runPaystack(REGISTRATION_FEE, async (ref) => {
      const now = new Date().toISOString();
      const rcpt = mkReceipt();
      await supabase.from("enrollments" as any)
        .update({ registration_paid: true, registration_paid_at: now }).eq("id", enrollment.id);
      await supabase.from("payment_history" as any)
        .insert({ user_id: user.id, enrollment_id: enrollment.id, amount: REGISTRATION_FEE, paid_at: now, level, plan_type: "registration", receipt_id: rcpt, status: "success", payment_ref: ref, payment_type: "registration" });
      toast({ title: "✅ Registration Fee Paid!", description: `Receipt: ${rcpt}` });
      await loadEnrollment();
      setPayingReg(false);
    }, () => setPayingReg(false));
  };

  const initiatePayment = () => {
    if (!user || !enrollment) return;
    setPaying(true);
    runPaystack(amountDue, async (ref) => {
      const now = new Date().toISOString();
      const rcpt = mkReceipt();
      await supabase.from("enrollments" as any)
        .update({ status: "active", paid_at: now, next_due_date: addMonths(selectedPlan === "monthly" ? 1 : 3), plan_type: selectedPlan, amount: amountDue, level })
        .eq("id", enrollment.id);
      await supabase.from("payment_history" as any)
        .insert({ user_id: user.id, enrollment_id: enrollment.id, amount: amountDue, paid_at: now, level, plan_type: selectedPlan, receipt_id: rcpt, status: "success", payment_ref: ref, payment_type: "subscription" });
      toast({ title: "✅ Payment Successful!", description: `Receipt: ${rcpt}` });
      await loadEnrollment(); await loadHistory();
      setTab("status"); setPaying(false);
    }, () => setPaying(false));
  };

  const statusCfg = {
    active:  { color: "#2E7D32", bg: "#E8F5E9", icon: <CheckCircle2 size={18}/>, label: "Active",       desc: "Full access to all features" },
    grace:   { color: "#F57C00", bg: "#FFF3E0", icon: <Clock size={18}/>,        label: "Grace Period", desc: `${graceLeft} day${graceLeft !== 1 ? "s" : ""} remaining` },
    locked:  { color: "#C62828", bg: "#FFEBEE", icon: <Lock size={18}/>,         label: "Locked",       desc: "Complete payment to restore access" },
    unknown: { color: "#546E7A", bg: "#ECEFF1", icon: <Loader2 size={18}/>,      label: "Loading",      desc: "…" },
  }[accessStatus];

  // ── Shared styles ──────────────────────────────────────────
  const CSS = `
    @keyframes spin   { to{transform:rotate(360deg)} }
    @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
    @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.55} }
    @keyframes glow   { 0%,100%{box-shadow:0 0 0 0 rgba(201,146,42,.4)} 50%{box-shadow:0 0 0 10px rgba(201,146,42,0)} }
    .card  { background:#fff; border-radius:16px; box-shadow:0 2px 12px rgba(0,0,0,.07); overflow:hidden; animation:fadeUp .3s ease; }
    .pcard { border:2px solid #e0e0e0; border-radius:14px; padding:16px; cursor:pointer; transition:all .2s; background:#fff; }
    .pcard:hover { border-color:#075E54; box-shadow:0 4px 16px rgba(7,94,84,.12); }
    .pcard.sel { border-color:#075E54; background:#F0FFF8; box-shadow:0 4px 20px rgba(7,94,84,.18); }
    .tab  { flex:1; padding:12px 8px; border:none; background:none; cursor:pointer; font-size:13px; font-weight:600; color:#999; border-bottom:3px solid transparent; transition:all .2s; display:flex; align-items:center; justify-content:center; gap:6px; }
    .tab.on { color:#075E54; border-bottom-color:#075E54; }
    .pbtn { width:100%; padding:16px; background:linear-gradient(135deg,#064E3B,#075E54); color:#fff; border:none; border-radius:14px; font-size:16px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px; transition:opacity .2s; box-shadow:0 4px 20px rgba(7,94,84,.3); }
    .pbtn:disabled { opacity:.5; cursor:not-allowed; }
    .rbtn { width:100%; padding:16px; background:linear-gradient(135deg,#C9922A,#A67C1E); color:#fff; border:none; border-radius:14px; font-size:16px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px; animation:glow 2s infinite; }
    .rbtn:disabled { opacity:.5; cursor:not-allowed; animation:none; }
    .hrow { display:flex; align-items:center; gap:12px; padding:14px 0; border-bottom:1px solid #f0f0f0; }
    .bdg  { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; }
  `;

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#F5F7F5" }}>
      <style>{CSS}</style>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:14 }}>
        <div style={{ width:52, height:52, borderRadius:"50%", background:"#064E3B", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <Loader2 style={{ width:26, height:26, color:"#fff", animation:"spin .8s linear infinite" }}/>
        </div>
        <span style={{ color:"#667", fontSize:14 }}>Loading…</span>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // DECIDE: Is this a NEW student (reg not paid) or EXISTING?
  // ════════════════════════════════════════════════════════════
  const showEnrollmentFlow = isNewStudent && !regPaid;

  return (
    <div style={{ minHeight:"100vh", background:"#F0F4F0", fontFamily:"'Segoe UI', system-ui, sans-serif" }}>
      <style>{CSS}</style>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div style={{ background:"linear-gradient(135deg,#064E3B,#075E54,#047857)", padding:"50px 20px 24px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, opacity:.05, backgroundImage:`url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23fff'%3E%3Cpath d='M30 0l30 30-30 30L0 30z'/%3E%3C/g%3E%3C/svg%3E")` }}/>
        <div style={{ position:"relative" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
            <button onClick={() => navigate(-1)} style={{ width:36, height:36, borderRadius:10, background:"rgba(255,255,255,.18)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff" }}>
              <ArrowLeft size={18}/>
            </button>
            <span style={{ color:"#fff", fontWeight:700, fontSize:18 }}>
              {showEnrollmentFlow ? "Enrollment" : "Payment & Renewal"}
            </span>
          </div>
          <div style={{ color:"rgba(255,255,255,.65)", fontSize:13, fontFamily:"serif", textAlign:"center", marginBottom:10 }}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>
          <div style={{ display:"flex", justifyContent:"center" }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:7, background:statusCfg.bg, color:statusCfg.color, borderRadius:20, padding:"7px 16px", fontWeight:700, fontSize:13 }}>
              {statusCfg.icon} {statusCfg.label} — {statusCfg.desc}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:480, margin:"0 auto", padding:"0 16px 40px" }}>

        {/* ════════════════════════════════════════════════════
            NEW STUDENT FLOW
        ════════════════════════════════════════════════════ */}
        {showEnrollmentFlow && (
          <>
            {/* Welcome banner */}
            <div style={{ marginTop:16, padding:"16px 18px", background:"linear-gradient(135deg,#FEF3C7,#FFFBEB)", borderRadius:16, border:"2px solid #C9922A", display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ width:46, height:46, borderRadius:"50%", background:"linear-gradient(135deg,#C9922A,#A67C1E)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <GraduationCap size={22} color="#fff"/>
              </div>
              <div>
                <p style={{ fontWeight:800, fontSize:15, color:"#92400E", margin:"0 0 3px" }}>Welcome to Tahleem Academy!</p>
                <p style={{ fontSize:12, color:"#A16207", margin:0 }}>Complete your enrollment to get started</p>
              </div>
            </div>

            {/* Step 1 — Registration Fee */}
            <div className="card" style={{ marginTop:14, border:"2px solid #C9922A" }}>
              <div style={{ padding:"16px 18px", background:"linear-gradient(135deg,#FFFBEB,#FEF3C7)", borderBottom:"1px solid #F9D46A" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:36, height:36, borderRadius:"50%", background:"linear-gradient(135deg,#C9922A,#A67C1E)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <span style={{ color:"#fff", fontWeight:900, fontSize:16 }}>1</span>
                  </div>
                  <div style={{ flex:1 }}>
                    <p style={{ fontWeight:800, fontSize:15, color:"#92400E", margin:0 }}>Pay Registration Fee</p>
                    <p style={{ fontSize:12, color:"#A16207", margin:0 }}>One-time · Unlocks entrance exam & level assignment</p>
                  </div>
                  <span style={{ fontSize:22, fontWeight:900, color:"#92400E" }}>{fmt(REGISTRATION_FEE)}</span>
                </div>
              </div>

              {/* 5-step enrollment process */}
              <div style={{ padding:"16px 18px" }}>
                <p style={{ fontSize:11, fontWeight:700, color:"#999", marginBottom:14, textTransform:"uppercase" as const, letterSpacing:.6 }}>Your 5-Step Enrollment Process</p>
                {[
                  { icon:<Star size={15} color="#C9922A"/>,        step:"1", title:"Pay Registration Fee",       desc:"One-time ₦5,000 — unlocks the process", done:false,   active:true  },
                  { icon:<FileText size={15} color="#2563EB"/>,     step:"2", title:"Complete Onboarding Form",   desc:"Personal details, Quran background & goals", done:false, active:false },
                  { icon:<GraduationCap size={15} color="#7C3AED"/>,step:"3", title:"Written Entrance Exam",      desc:"Tajweed, Arabic & Islamic knowledge test",   done:false, active:false },
                  { icon:<Mic size={15} color="#DC2626"/>,          step:"4", title:"Recitation Audio Submission", desc:"AI-scored recitation accuracy",              done:false, active:false },
                  { icon:<Video size={15} color="#16A34A"/>,        step:"5", title:"Live Teacher Evaluation",    desc:"10–15 min Makharij & Tajweed session",       done:false, active:false },
                ].map((s, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom: i < 4 ? 14 : 20, opacity:s.active ? 1 : 0.5 }}>
                    <div style={{ width:32, height:32, borderRadius:"50%", background:s.active?"#FEF3C7":"#F3F4F6", border:`1.5px solid ${s.active?"#C9922A":"#E5E7EB"}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      {s.icon}
                    </div>
                    <div>
                      <p style={{ fontSize:11, fontWeight:700, color:"#999", letterSpacing:.5, margin:"0 0 1px", textTransform:"uppercase" as const }}>Step {s.step}</p>
                      <p style={{ fontSize:14, fontWeight:700, color: s.active?"#111":"#888", margin:"0 0 2px" }}>{s.title}</p>
                      <p style={{ fontSize:12, color:"#999", margin:0, lineHeight:1.4 }}>{s.desc}</p>
                    </div>
                  </div>
                ))}

                <button className="rbtn" onClick={payRegistration} disabled={payingReg}>
                  {payingReg
                    ? <><Loader2 style={{ width:18, height:18, animation:"spin .8s linear infinite" }}/> Processing…</>
                    : <><Star size={17} fill="currentColor"/> Pay Registration Fee — {fmt(REGISTRATION_FEE)}</>
                  }
                </button>
                <p style={{ textAlign:"center", fontSize:11, color:"#999", marginTop:8 }}>
                  One-time · Secured by Paystack · Non-refundable after exam begins
                </p>
              </div>
            </div>

            {/* Steps 2–5 locked preview */}
            <div className="card" style={{ marginTop:12, padding:"14px 18px", opacity:0.6 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <Lock size={16} color="#999"/>
                <p style={{ fontSize:13, color:"#888", margin:0 }}>Steps 2–5 unlock after registration fee is paid</p>
              </div>
            </div>
          </>
        )}

        {/* ── Registration paid confirmation (new students only, after paying) ── */}
        {isNewStudent && regPaid && (
          <>
            <div style={{ marginTop:16, padding:"14px 16px", background:"#E8F5E9", borderRadius:14, border:"1.5px solid #A5D6A7", display:"flex", alignItems:"center", gap:12 }}>
              <CheckCircle2 size={22} color="#2E7D32"/>
              <div style={{ flex:1 }}>
                <p style={{ fontWeight:700, fontSize:14, color:"#2E7D32", margin:"0 0 2px" }}>Registration Complete ✓</p>
                <p style={{ fontSize:12, color:"#388E3C", margin:0 }}>Paid {fmtDate(enrollment?.registration_paid_at || null)} · Entrance exam unlocked</p>
              </div>
              <button onClick={() => navigate("/onboarding")} style={{ background:"#2E7D32", color:"#fff", border:"none", borderRadius:10, padding:"9px 14px", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                Continue <ArrowRight size={13}/>
              </button>
            </div>

            {/* Now show subscription payment for new students who've paid reg fee */}
            <div style={{ marginTop:14, padding:"14px 18px", background:"#EFF6FF", borderRadius:14, border:"1.5px solid #BFDBFE" }}>
              <p style={{ fontWeight:700, fontSize:14, color:"#1E40AF", margin:"0 0 4px", display:"flex", alignItems:"center", gap:8 }}>
                <BookOpen size={15}/> Activate Your Account
              </p>
              <p style={{ fontSize:12, color:"#3B82F6", margin:0 }}>Pay your first subscription below to get full access to all courses and features.</p>
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════════
            EXISTING STUDENT — RENEWAL ALERT BANNERS
        ════════════════════════════════════════════════════ */}
        {!showEnrollmentFlow && accessStatus === "grace" && (
          <div style={{ marginTop:16, padding:"14px 16px", background:"#FFF8E1", borderRadius:14, border:"1.5px solid #F9A825", display:"flex", gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:"50%", background:"#FFF3CD", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <Clock size={18} color="#F57C00"/>
            </div>
            <div>
              <p style={{ fontWeight:700, color:"#E65100", fontSize:14, margin:"0 0 2px" }}>{graceLeft} day{graceLeft !== 1 ? "s" : ""} left in grace period</p>
              <p style={{ fontSize:12, color:"#8D5E00", margin:0 }}>Renew your subscription below to keep full access.</p>
              {graceLeft <= 2 && <p style={{ marginTop:6, fontSize:11, fontWeight:700, color:"#C62828", animation:"pulse 1.5s infinite", margin:"6px 0 0" }}>⚠️ Account locks in {graceLeft} day{graceLeft !== 1 ? "s" : ""}!</p>}
            </div>
          </div>
        )}

        {!showEnrollmentFlow && accessStatus === "locked" && (
          <div style={{ marginTop:16, padding:"16px", background:"#FFEBEE", borderRadius:14, border:"1.5px solid #EF9A9A" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
              <Lock size={20} color="#C62828"/>
              <span style={{ fontWeight:700, color:"#C62828", fontSize:15 }}>Account Access Locked</span>
            </div>
            <p style={{ fontSize:13, color:"#7B1A1A", margin:"0 0 10px" }}>Your subscription has expired. Renew now to restore access to:</p>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {["Al-Majlis Chat","Course Lessons","Al-Hifdh Tracker","Assignments & Exams","Live Sessions"].map(f => (
                <div key={f} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#7B1A1A" }}>
                  <XCircle size={14} color="#E74C3C"/> {f}
                </div>
              ))}
            </div>
          </div>
        )}

        {!showEnrollmentFlow && accessStatus === "active" && (
          <div style={{ marginTop:16, padding:"13px 16px", background:"#E8F5E9", borderRadius:14, border:"1.5px solid #A5D6A7", display:"flex", alignItems:"center", gap:12 }}>
            <CheckCircle2 size={20} color="#2E7D32"/>
            <div style={{ flex:1 }}>
              <p style={{ fontWeight:700, fontSize:13, color:"#2E7D32", margin:"0 0 1px" }}>Subscription Active</p>
              <p style={{ fontSize:12, color:"#388E3C", margin:0 }}>Next payment due: {fmtDate(enrollment?.next_due_date || null)}</p>
            </div>
            <span style={{ fontSize:12, fontWeight:700, color:"#2E7D32", background:"#C8E6C9", padding:"4px 10px", borderRadius:20 }}>✓ Active</span>
          </div>
        )}

        {/* ── STUDENT PROFILE CARD ─────────────────────────────── */}
        <div className="card" style={{ marginTop:14 }}>
          <div style={{ padding:"14px 18px", background:"linear-gradient(90deg,#064E3B,#075E54)", display:"flex", alignItems:"center", gap:12 }}>
            {studentProfile?.avatar_url
              ? <img src={studentProfile.avatar_url} style={{ width:48, height:48, borderRadius:"50%", objectFit:"cover", border:"2px solid rgba(255,255,255,.4)" }} alt=""/>
              : <div style={{ width:48, height:48, borderRadius:"50%", background:"rgba(255,255,255,.18)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:20, fontWeight:700, border:"2px solid rgba(255,255,255,.3)" }}>
                  {(studentProfile?.full_name || "S")[0].toUpperCase()}
                </div>
            }
            <div style={{ flex:1 }}>
              <p style={{ color:"#fff", fontWeight:700, fontSize:16, margin:"0 0 2px" }}>{studentProfile?.full_name || "Student"}</p>
              <p style={{ color:"rgba(255,255,255,.65)", fontSize:12, margin:0 }}>{studentProfile?.full_name_ar || ""}</p>
            </div>
            <span className="bdg" style={{ background:"rgba(255,255,255,.2)", color:"#fff" }}>
              <BookOpen size={11}/> {fees.label}
            </span>
          </div>
          <div style={{ padding:"4px 0" }}>
            {[
              { icon:<Hash size={14}/>,      label:"Student ID",  val: studentProfile?.student_id || "—" },
              { icon:<Mail size={14}/>,       label:"Email",       val: studentProfile?.email || user?.email || "—" },
              { icon:<Calendar size={14}/>,   label:"Joined",      val: fmtDate(studentProfile?.created_at || null) },
              { icon:<TrendingUp size={14}/>, label:"Next Payment",val: fmtDate(enrollment?.next_due_date || null) },
            ].map((row, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 18px", borderBottom: i < 3 ? "1px solid #f6f6f6" : "none" }}>
                <span style={{ color:"#075E54", flexShrink:0 }}>{row.icon}</span>
                <span style={{ fontSize:13, color:"#888", minWidth:100 }}>{row.label}</span>
                <span style={{ fontSize:13, color:"#222", fontWeight:600, marginLeft:"auto", textAlign:"right" as const, maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{row.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════
            PAYMENT TABS
            Show for: existing students always
                      new students only after reg fee paid
        ════════════════════════════════════════════════════ */}
        {(regPaid) && (
          <div className="card" style={{ marginTop:14, padding:0, overflow:"hidden" }}>
            <div style={{ display:"flex", borderBottom:"1px solid #f0f0f0" }}>
              {([
                { key:"pay",     icon:<CreditCard size={14}/>, label: !showEnrollmentFlow ? "Renew" : "Pay" },
                { key:"history", icon:<Clock size={14}/>,      label:"History" },
                { key:"status",  icon:<BadgeCheck size={14}/>, label:"Status" },
              ] as const).map(t => (
                <button key={t.key} className={`tab ${tab === t.key ? "on" : ""}`} onClick={() => setTab(t.key)}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* ── RENEW / PAY TAB ── */}
            {tab === "pay" && (
              <div style={{ padding:"20px 18px", display:"flex", flexDirection:"column", gap:16 }}>

                {!showEnrollmentFlow && accessStatus === "active" && (
                  <div style={{ padding:"12px 14px", background:"#F0FFF8", borderRadius:12, border:"1px solid #A5D6A7" }}>
                    <p style={{ fontSize:13, fontWeight:700, color:"#2E7D32", margin:"0 0 3px", display:"flex", alignItems:"center", gap:6 }}>
                      <RotateCcw size={13}/> Early Renewal
                    </p>
                    <p style={{ fontSize:12, color:"#4CAF50", margin:0 }}>Your subscription is active until {fmtDate(enrollment?.next_due_date || null)}. You can renew early to extend it.</p>
                  </div>
                )}

                <p style={{ fontSize:13, fontWeight:700, color:"#555", textTransform:"uppercase" as const, letterSpacing:.5, margin:0 }}>{fees.label} Level — Choose Plan</p>

                {/* Monthly plan */}
                <div className={`pcard ${selectedPlan === "monthly" ? "sel" : ""}`} onClick={() => setSelectedPlan("monthly")}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <p style={{ fontWeight:700, fontSize:15, color:"#111", margin:"0 0 2px" }}>Monthly</p>
                      <p style={{ fontSize:12, color:"#888", margin:"0 0 8px" }}>اشتراك شهري</p>
                      <div style={{ display:"flex", gap:6 }}>
                        <span className="bdg" style={{ background:"#E8F5E9", color:"#2E7D32" }}>1 Month</span>
                        <span className="bdg" style={{ background:"#EDE7F6", color:fees.color }}>{fees.label}</span>
                      </div>
                    </div>
                    <div style={{ textAlign:"right" as const }}>
                      <p style={{ fontSize:22, fontWeight:800, color:"#111", margin:0 }}>{fmt(fees.monthly)}</p>
                      <p style={{ fontSize:11, color:"#888", margin:0 }}>/ month</p>
                    </div>
                  </div>
                  {selectedPlan === "monthly" && <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:10, color:"#075E54", fontWeight:700, fontSize:12 }}><CheckCircle2 size={14}/> Selected</div>}
                </div>

                {/* Term plan */}
                <div className={`pcard ${selectedPlan === "term" ? "sel" : ""}`} onClick={() => setSelectedPlan("term")}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <p style={{ fontWeight:700, fontSize:15, color:"#111", margin:"0 0 2px" }}>Term (3 Months)</p>
                      <p style={{ fontSize:12, color:"#888", margin:"0 0 8px" }}>رسوم الفصل الدراسي</p>
                      <div style={{ display:"flex", gap:6 }}>
                        <span className="bdg" style={{ background:"#E8F5E9", color:"#2E7D32" }}>3 Months</span>
                        <span className="bdg" style={{ background:"#FFF3E0", color:fees.color }}>{fees.label}</span>
                        <span className="bdg" style={{ background:"#E3F2FD", color:"#1565C0" }}>Save {fmt(fees.monthly * 3 - fees.term)}</span>
                      </div>
                    </div>
                    <div style={{ textAlign:"right" as const }}>
                      <p style={{ fontSize:22, fontWeight:800, color:"#111", margin:0 }}>{fmt(fees.term)}</p>
                      <p style={{ fontSize:11, color:"#888", margin:0 }}>= {fmt(fees.monthly)} × 3</p>
                    </div>
                  </div>
                  {selectedPlan === "term" && <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:10, color:"#075E54", fontWeight:700, fontSize:12 }}><CheckCircle2 size={14}/> Selected</div>}
                </div>

                {/* Order summary */}
                <div style={{ background:"#F8FAF8", borderRadius:12, padding:"14px 16px", border:"1px solid #e8f0e8" }}>
                  <p style={{ fontSize:12, fontWeight:700, color:"#555", marginBottom:10, textTransform:"uppercase" as const, letterSpacing:.5 }}>Order Summary</p>
                  {[
                    { label:"Plan",     val: selectedPlan === "monthly" ? "Monthly Subscription" : "Term Subscription" },
                    { label:"Level",    val: fees.label },
                    { label:"Duration", val: selectedPlan === "monthly" ? "1 Month" : "3 Months" },
                    { label:"Total",    val: fmt(amountDue), bold:true, green:true },
                  ].map((r, i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", marginBottom: i < 3 ? 8 : 0, paddingTop: i === 3 ? 8 : 0, borderTop: i === 3 ? "1px dashed #ddd" : "none" }}>
                      <span style={{ fontSize:13, color:"#888" }}>{r.label}</span>
                      <span style={{ fontSize:13, fontWeight: r.bold ? 800 : 500, color: r.green ? "#064E3B" : "#111" }}>{r.val}</span>
                    </div>
                  ))}
                </div>

                <button className="pbtn" onClick={initiatePayment} disabled={paying}>
                  {paying
                    ? <><Loader2 style={{ width:18, height:18, animation:"spin .8s linear infinite" }}/> Processing…</>
                    : <><CreditCard size={18}/> Pay {fmt(amountDue)}</>
                  }
                </button>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, fontSize:11, color:"#999" }}>
                  <Shield size={12}/> Secured by Paystack · SSL Encrypted
                </div>
              </div>
            )}

            {/* ── HISTORY TAB ── */}
            {tab === "history" && (
              <div style={{ padding:"0 18px 16px" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 0 10px" }}>
                  <span style={{ fontSize:14, fontWeight:700, color:"#333" }}>Payment History</span>
                  <button onClick={loadHistory} style={{ background:"none", border:"none", cursor:"pointer", color:"#075E54", display:"flex", alignItems:"center", gap:4, fontSize:12 }}>
                    <RefreshCw size={13}/> Refresh
                  </button>
                </div>
                {loadingHistory && <div style={{ display:"flex", justifyContent:"center", padding:20 }}><Loader2 style={{ width:22, height:22, color:"#075E54", animation:"spin .8s linear infinite" }}/></div>}
                {!loadingHistory && history.length === 0 && (
                  <div style={{ textAlign:"center", padding:"28px 0", color:"#999" }}>
                    <CreditCard style={{ width:36, height:36, margin:"0 auto 10px", color:"#ddd" }}/>
                    <p style={{ fontSize:14, margin:0 }}>No payments yet</p>
                  </div>
                )}
                {history.map(p => (
                  <div key={p.id} className="hrow">
                    <div style={{ width:40, height:40, borderRadius:12, background: p.status === "success" ? "#E8F5E9" : "#FFEBEE", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      {p.status === "success" ? <CheckCircle2 size={18} color="#2E7D32"/> : <XCircle size={18} color="#C62828"/>}
                    </div>
                    <div style={{ flex:1 }}>
                      <p style={{ fontWeight:600, fontSize:14, color:"#111", margin:"0 0 2px" }}>
                        {(p as any).payment_type === "registration" ? "🌟 Registration Fee" : p.plan_type === "monthly" ? "📅 Monthly Subscription" : `📆 Term Subscription`}
                      </p>
                      <p style={{ fontSize:11, color:"#999", margin:0 }}>{fmtDT(p.paid_at)} · {p.receipt_id}</p>
                    </div>
                    <div style={{ textAlign:"right" as const }}>
                      <p style={{ fontWeight:800, color: p.status === "success" ? "#2E7D32" : "#C62828", fontSize:14, margin:"0 0 4px" }}>{fmt(p.amount)}</p>
                      <span className="bdg" style={{ background: p.status === "success" ? "#E8F5E9" : "#FFEBEE", color: p.status === "success" ? "#2E7D32" : "#C62828" }}>{p.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── STATUS TAB ── */}
            {tab === "status" && (
              <div style={{ padding:"20px 18px", display:"flex", flexDirection:"column", gap:14 }}>
                <div style={{ background:statusCfg.bg, borderRadius:14, padding:"20px 18px", border:`1.5px solid ${statusCfg.color}22`, textAlign:"center" }}>
                  <div style={{ width:56, height:56, borderRadius:"50%", background:statusCfg.color, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px", color:"#fff" }}>
                    {statusCfg.icon}
                  </div>
                  <p style={{ fontSize:18, fontWeight:800, color:statusCfg.color, margin:"0 0 4px" }}>{statusCfg.label}</p>
                  <p style={{ fontSize:13, color:"#666", margin:0 }}>{statusCfg.desc}</p>
                </div>

                {enrollment && (
                  <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                    {[
                      { icon:<BookOpen size={15}/>,   label:"Level",        val: fees.label },
                      { icon:<CreditCard size={15}/>,  label:"Last Paid",    val: fmtDate(enrollment.paid_at) },
                      { icon:<Calendar size={15}/>,    label:"Next Due",     val: fmtDate(enrollment.next_due_date) },
                      { icon:<Clock size={15}/>,       label:"Grace Until",  val: fmtDate(enrollment.grace_end_date) },
                      ...(enrollment.admin_override ? [{ icon:<Unlock size={15}/>, label:"Admin Override", val:`Until ${fmtDate(enrollment.admin_override_until)}` }] : []),
                    ].map((r, i, arr) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 4px", borderBottom: i < arr.length-1 ? "1px solid #f0f0f0" : "none" }}>
                        <span style={{ color:"#075E54" }}>{r.icon}</span>
                        <span style={{ fontSize:13, color:"#888", minWidth:100 }}>{r.label}</span>
                        <span style={{ fontSize:13, fontWeight:600, color:"#222", marginLeft:"auto" }}>{r.val}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <p style={{ fontSize:12, fontWeight:700, color:"#555", marginBottom:10, textTransform:"uppercase" as const, letterSpacing:.5 }}>Feature Access</p>
                  {[
                    { name:"Dashboard Overview",    allowed:true },
                    { name:"Al-Majlis Chat",        allowed: accessStatus !== "locked" },
                    { name:"Course Lessons",        allowed: accessStatus === "active" },
                    { name:"Al-Hifdh Tracker",      allowed: accessStatus === "active" },
                    { name:"Assignments & Exams",   allowed: accessStatus === "active" },
                    { name:"Live Sessions",         allowed: accessStatus === "active" },
                    { name:"Al-Musabaqah (Quiz)",   allowed: accessStatus === "active" },
                  ].map((f, i, arr) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom: i < arr.length-1 ? "1px solid #f6f6f6" : "none" }}>
                      {f.allowed ? <CheckCircle2 size={16} color="#2E7D32"/> : <Lock size={16} color="#E74C3C"/>}
                      <span style={{ fontSize:13, color: f.allowed ? "#222" : "#999", flex:1 }}>{f.name}</span>
                      <span className="bdg" style={{ background: f.allowed ? "#E8F5E9" : "#FFEBEE", color: f.allowed ? "#2E7D32" : "#C62828" }}>
                        {f.allowed ? "Unlocked" : "Locked"}
                      </span>
                    </div>
                  ))}
                </div>

                {accessStatus !== "active" && (
                  <button className="pbtn" onClick={() => setTab("pay")}>
                    <CreditCard size={18}/> {!showEnrollmentFlow ? "Renew Subscription" : "Make a Payment"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ADMIN CONTROLS ───────────────────────────────────── */}
        {isAdmin && enrollment && (
          <div className="card" style={{ marginTop:14 }}>
            <div style={{ padding:"14px 18px", borderBottom:"1px solid #f0f0f0", display:"flex", alignItems:"center", gap:8 }}>
              <Shield size={16} color="#075E54"/>
              <span style={{ fontWeight:700, fontSize:14, color:"#333" }}>Admin Controls</span>
            </div>
            <div style={{ padding:"14px 18px", display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={async () => {
                  const until = new Date(Date.now() + 7 * 86400000).toISOString();
                  await supabase.from("enrollments" as any).update({ admin_override:true, admin_override_until:until, status:"active" }).eq("id", enrollment.id);
                  await loadEnrollment(); toast({ title:"✅ 7-day access granted" });
                }} style={{ flex:1, padding:"11px 8px", background:"#E8F5E9", color:"#2E7D32", border:"1.5px solid #A5D6A7", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13 }}>
                  <Unlock size={13} style={{ display:"inline", marginRight:5 }}/>Grant 7 Days
                </button>
                <button onClick={async () => {
                  await supabase.from("enrollments" as any).update({ admin_override:false, status:"locked" }).eq("id", enrollment.id);
                  await loadEnrollment(); toast({ title:"🔒 Access locked" });
                }} style={{ flex:1, padding:"11px 8px", background:"#FFEBEE", color:"#C62828", border:"1.5px solid #EF9A9A", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13 }}>
                  <Lock size={13} style={{ display:"inline", marginRight:5 }}/>Lock Access
                </button>
              </div>
              <button onClick={async () => {
                await supabase.from("enrollments" as any).update({ registration_paid:true, registration_paid_at:new Date().toISOString() }).eq("id", enrollment.id);
                await loadEnrollment(); toast({ title:"✅ Registration marked as paid" });
              }} style={{ padding:"11px", background:"#FFF8E1", color:"#92400E", border:"1.5px solid #F9A825", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13 }}>
                <Star size={13} style={{ display:"inline", marginRight:5 }}/>Mark Registration as Paid
              </button>
              <button onClick={async () => {
                await supabase.from("enrollments" as any).update({ status:"active", paid_at:new Date().toISOString(), next_due_date:addMonths(1) }).eq("id", enrollment.id);
                await loadEnrollment(); toast({ title:"✅ Subscription marked as paid" });
              }} style={{ padding:"11px", background:"#E3F2FD", color:"#1565C0", border:"1.5px solid #90CAF9", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13 }}>
                <CheckCircle2 size={13} style={{ display:"inline", marginRight:5 }}/>Mark Subscription as Paid
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnrollmentPayment;
