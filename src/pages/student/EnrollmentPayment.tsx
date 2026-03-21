/*
  EnrollmentPayment.tsx — Tahleem Academy
  ─────────────────────────────────────────────────────────────────
  NEW students     → Enrollment flow
                      Step 1: Pay Registration Fee (₦5,000 one-time)
                      Steps 2-5 unlock after: Onboarding → Exam → Recitation → Evaluation
                      Then: Pay subscription to activate account

  ALL students     → Payment tab (new + existing)
                      Choose monthly or term plan, pay via Paystack
                      View history, check status
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
  ArrowRight, RotateCcw, Receipt, Sparkles,
} from "lucide-react";

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

const REGISTRATION_FEE = 5000;
const LEVEL_FEES: Record<string, { monthly: number; term: number; label: string; labelAr: string; color: string; bg: string }> = {
  beginner:     { monthly: 5000, term: 14000, label: "Beginner",     labelAr: "المبتدئ",  color: "#2E7D32", bg: "#E8F5E9" },
  intermediate: { monthly: 6000, term: 17000, label: "Intermediate", labelAr: "المتوسط", color: "#1565C0", bg: "#E3F2FD" },
  advanced:     { monthly: 7000, term: 20000, label: "Advanced",     labelAr: "المتقدم", color: "#6A1B9A", bg: "#EDE7F6" },
  default:      { monthly: 5000, term: 14000, label: "Standard",     labelAr: "الأساسي", color: "#075E54", bg: "#E0F2F1" },
};
const GRACE_DAYS   = 7;
const PAYSTACK_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";

const fmt      = (n: number) => `₦${n.toLocaleString()}`;
const fmtDate  = (d: string | null) => d ? new Date(d).toLocaleDateString("en-NG", { day:"2-digit", month:"short", year:"numeric" }) : "—";
const fmtDT    = (d: string | null) => d ? new Date(d).toLocaleString("en-NG",   { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "—";
const daysLeft = (d: string | null) => { if (!d) return 0; return Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)); };
const addMonths= (n: number) => { const d = new Date(); d.setMonth(d.getMonth() + n); return d.toISOString(); };
const mkReceipt= () => `RCT-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

export type AccessStatus = "active" | "grace" | "locked" | "unknown";
export const getAccessStatus = (enr: Enrollment | null): AccessStatus => {
  if (!enr) return "unknown";
  if (enr.admin_override && enr.admin_override_until && new Date(enr.admin_override_until) > new Date()) return "active";
  if (enr.status === "active" && enr.next_due_date && new Date(enr.next_due_date) > new Date()) return "active";
  if (enr.status === "grace" && enr.grace_end_date && new Date(enr.grace_end_date) > new Date()) return "grace";
  return "locked";
};

export const PaymentLockedOverlay = ({ onPay }: { onPay: () => void }) => (
  <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.65)", backdropFilter:"blur(6px)", zIndex:50, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:24, borderRadius:"inherit" }}>
    <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(231,76,60,0.15)", border:"2px solid #E74C3C", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <Lock style={{ width:28, height:28, color:"#E74C3C" }}/>
    </div>
    <div style={{ color:"#fff", fontWeight:700, fontSize:18, textAlign:"center" }}>Feature Locked</div>
    <div style={{ color:"rgba(255,255,255,.75)", fontSize:13, textAlign:"center", maxWidth:240 }}>Complete your payment to unlock this feature</div>
    <button onClick={onPay} style={{ background:"#075E54", color:"#fff", border:"none", borderRadius:12, padding:"12px 28px", cursor:"pointer", fontWeight:700, fontSize:14 }}>Pay Now</button>
  </div>
);

const EnrollmentPayment = () => {
  const { user, profile, hasRole } = useAuth();
  const { toast }                  = useToast();
  const navigate                   = useNavigate();

  const [tab, setTab]                       = useState<"enroll"|"pay"|"history"|"status">("pay");
  const [enrollment, setEnrollment]         = useState<Enrollment | null>(null);
  const [history, setHistory]               = useState<PaymentRecord[]>([]);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading]               = useState(true);
  const [paying, setPaying]                 = useState(false);
  const [payingReg, setPayingReg]           = useState(false);
  const [selectedPlan, setSelectedPlan]     = useState<"monthly"|"term">("monthly");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isNewStudent, setIsNewStudent]     = useState(false);

  const isAdmin   = hasRole("admin");
  const level     = ((profile as any)?.level || "beginner").toLowerCase();
  const fees      = LEVEL_FEES[level] || LEVEL_FEES.default;
  const regPaid   = enrollment?.registration_paid === true;
  const accStatus = getAccessStatus(enrollment);
  const graceLeft = daysLeft(enrollment?.grace_end_date || null);
  const amountDue = selectedPlan === "monthly" ? fees.monthly : fees.term;
  const termSave  = fees.monthly * 3 - fees.term;

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
        setIsNewStudent(true);
        const graceEnd = new Date(Date.now() + GRACE_DAYS * 86400000).toISOString();
        const { data: created } = await supabase.from("enrollments" as any)
          .insert({ user_id:user.id, level, plan_type:"monthly", amount:fees.monthly,
                    status:"grace", grace_end_date:graceEnd, admin_override:false,
                    registration_paid:false, registration_paid_at:null })
          .select().single();
        enr = created;
      } else {
        if (!enr.registration_paid) {
          const paidAt = enr.paid_at || enr.created_at || new Date().toISOString();
          supabase.from("enrollments" as any)
            .update({ registration_paid:true, registration_paid_at:paidAt })
            .eq("id", enr.id).then(() => {});
          enr = { ...enr, registration_paid:true, registration_paid_at:paidAt };
        }
        setIsNewStudent(false);
      }

      if (enr && enr.status === "grace" && enr.grace_end_date && new Date(enr.grace_end_date) < new Date()) {
        await supabase.from("enrollments" as any).update({ status:"locked" }).eq("id", enr.id);
        enr = { ...enr, status:"locked" };
      }

      setEnrollment(enr as unknown as Enrollment);
      if (!enr?.registration_paid) setTab("enroll");
      else setTab("pay");
    } finally { setLoading(false); }
  }, [user, level, fees.monthly]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    setLoadingHistory(true);
    const { data } = await supabase.from("payment_history" as any)
      .select("*").eq("user_id", user.id).order("paid_at", { ascending:false }).limit(50);
    setHistory((data || []) as unknown as PaymentRecord[]);
    setLoadingHistory(false);
  }, [user]);

  useEffect(() => { loadEnrollment(); }, [loadEnrollment]);
  useEffect(() => { if (tab === "history") loadHistory(); }, [tab, loadHistory]);

  const runPaystack = (amount: number, onSuccess: (ref: string) => void, onCancel?: () => void) => {
    const email = studentProfile?.email || user?.email || "";
    const ref   = `TAH-${(user?.id || "").slice(0,8)}-${Date.now()}`;
    if (!PAYSTACK_KEY) {
      toast({ title:"⚠️ Demo mode", description:"No Paystack key — simulating payment." });
      setTimeout(() => onSuccess(ref), 800);
      return;
    }
    const PaystackPop = (window as any).PaystackPop;
    if (!PaystackPop) {
      toast({ title:"Payment not ready", description:"Please refresh.", variant:"destructive" });
      onCancel?.(); return;
    }
    try {
      PaystackPop.setup({
        key:PAYSTACK_KEY, email, amount:amount*100, currency:"NGN", ref,
        metadata:{ user_id:user?.id, level },
        callback: (res: any) => onSuccess(res.reference),
        onClose: () => { toast({ title:"Payment cancelled" }); onCancel?.(); },
      }).openIframe();
    } catch (err: any) {
      toast({ title:"Could not open payment", description:err?.message, variant:"destructive" });
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
        .update({ registration_paid:true, registration_paid_at:now }).eq("id", enrollment.id);
      await supabase.from("payment_history" as any).insert({
        user_id:user.id, enrollment_id:enrollment.id, amount:REGISTRATION_FEE,
        paid_at:now, level, plan_type:"registration", receipt_id:rcpt,
        status:"success", payment_ref:ref, payment_type:"registration",
      });
      toast({ title:"✅ Registration Fee Paid!", description:`Receipt: ${rcpt}` });
      await loadEnrollment();
      setPayingReg(false);
      setTab("pay");
    }, () => setPayingReg(false));
  };

  const initiatePayment = () => {
    if (!user || !enrollment) return;
    setPaying(true);
    runPaystack(amountDue, async (ref) => {
      const now = new Date().toISOString();
      const rcpt = mkReceipt();
      const months = selectedPlan === "monthly" ? 1 : 3;
      await supabase.from("enrollments" as any)
        .update({ status:"active", paid_at:now, next_due_date:addMonths(months),
                  plan_type:selectedPlan, amount:amountDue, level })
        .eq("id", enrollment.id);
      await supabase.from("payment_history" as any).insert({
        user_id:user.id, enrollment_id:enrollment.id, amount:amountDue,
        paid_at:now, level, plan_type:selectedPlan, receipt_id:rcpt,
        status:"success", payment_ref:ref, payment_type:"subscription",
      });
      toast({ title:"✅ Payment Successful!", description:`Receipt: ${rcpt}` });
      await loadEnrollment();
      await loadHistory();
      setTab("status");
      setPaying(false);
    }, () => setPaying(false));
  };

  const statusCfg = {
    active:  { color:"#2E7D32", bg:"#E8F5E9", icon:<CheckCircle2 size={18}/>, label:"Active",       desc:"Full access to all features" },
    grace:   { color:"#F57C00", bg:"#FFF3E0", icon:<Clock size={18}/>,        label:"Grace Period", desc:`${graceLeft} day${graceLeft!==1?"s":""} remaining` },
    locked:  { color:"#C62828", bg:"#FFEBEE", icon:<Lock size={18}/>,         label:"Locked",       desc:"Pay to restore access" },
    unknown: { color:"#546E7A", bg:"#ECEFF1", icon:<Loader2 size={18}/>,      label:"Loading…",     desc:"" },
  }[accStatus];

  const showEnrollTab = isNewStudent && !regPaid;

  const CSS = `
    @keyframes spin   { to{transform:rotate(360deg)} }
    @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
    @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.55} }
    @keyframes glow   { 0%,100%{box-shadow:0 0 0 0 rgba(201,146,42,.4)} 50%{box-shadow:0 0 0 10px rgba(201,146,42,0)} }
    .ep-card  { background:#fff; border-radius:18px; box-shadow:0 2px 14px rgba(0,0,0,.08); overflow:hidden; animation:fadeUp .3s ease; }
    .ep-pcard { border:2px solid #e0e0e0; border-radius:14px; padding:18px; cursor:pointer; transition:all .18s; background:#fff; }
    .ep-pcard:hover { border-color:#075E54; box-shadow:0 4px 16px rgba(7,94,84,.12); }
    .ep-pcard.sel { border-color:#075E54; background:#F0FFF8; box-shadow:0 4px 20px rgba(7,94,84,.18); }
    .ep-tab { flex:1; padding:13px 6px; border:none; background:none; cursor:pointer; font-size:12px; font-weight:700; color:#aaa; border-bottom:3px solid transparent; transition:all .2s; display:flex; align-items:center; justify-content:center; gap:5px; white-space:nowrap; }
    .ep-tab.on { color:#064E3B; border-bottom-color:#064E3B; }
    .ep-pbtn { width:100%; padding:17px; background:linear-gradient(135deg,#064E3B,#075E54); color:#fff; border:none; border-radius:14px; font-size:16px; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px; box-shadow:0 4px 20px rgba(7,94,84,.35); transition:opacity .2s; }
    .ep-pbtn:disabled { opacity:.5; cursor:not-allowed; }
    .ep-rbtn { width:100%; padding:17px; background:linear-gradient(135deg,#C9922A,#A67C1E); color:#fff; border:none; border-radius:14px; font-size:16px; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px; animation:glow 2s infinite; }
    .ep-rbtn:disabled { opacity:.5; cursor:not-allowed; animation:none; }
    .ep-hrow { display:flex; align-items:center; gap:12px; padding:14px 0; border-bottom:1px solid #f0f0f0; }
    .ep-bdg  { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; }
  `;

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#F5F7F5" }}>
      <style>{CSS}</style>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:14 }}>
        <div style={{ width:56, height:56, borderRadius:"50%", background:"#064E3B", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <Loader2 style={{ width:28, height:28, color:"#fff", animation:"spin .8s linear infinite" }}/>
        </div>
        <span style={{ color:"#667", fontSize:14 }}>Loading your account…</span>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#EFF4EF", fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
      <style>{CSS}</style>

      {/* ── HEADER ── */}
      <div style={{ background:"linear-gradient(135deg,#064E3B 0%,#075E54 55%,#047857 100%)", padding:"48px 20px 28px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, opacity:.05, backgroundImage:`url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23fff'%3E%3Cpath d='M40 0l40 40-40 40L0 40z'/%3E%3C/g%3E%3C/svg%3E")` }}/>
        <div style={{ position:"relative" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
            <button onClick={() => navigate(-1)} style={{ width:38, height:38, borderRadius:11, background:"rgba(255,255,255,.18)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff" }}>
              <ArrowLeft size={18}/>
            </button>
            <span style={{ color:"#fff", fontWeight:800, fontSize:19 }}>
              {showEnrollTab ? "Enrollment" : "Payment & Renewal"}
            </span>
          </div>
          <div style={{ color:"rgba(255,255,255,.6)", fontSize:13, fontFamily:"serif", textAlign:"center", marginBottom:12 }}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>
          <div style={{ display:"flex", justifyContent:"center" }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:statusCfg.bg, color:statusCfg.color, borderRadius:22, padding:"8px 18px", fontWeight:700, fontSize:13 }}>
              {statusCfg.icon} {statusCfg.label}{statusCfg.desc ? ` — ${statusCfg.desc}` : ""}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:490, margin:"0 auto", padding:"0 16px 48px" }}>

        {/* ── Status banners ── */}
        {accStatus === "grace" && (
          <div style={{ marginTop:16, padding:"14px 16px", background:"#FFF8E1", borderRadius:14, border:"1.5px solid #F9A825", display:"flex", gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:"50%", background:"#FFF3CD", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <Clock size={18} color="#F57C00"/>
            </div>
            <div>
              <p style={{ fontWeight:700, color:"#E65100", fontSize:14, margin:"0 0 2px" }}>{graceLeft} day{graceLeft!==1?"s":""} left in grace period</p>
              <p style={{ fontSize:12, color:"#8D5E00", margin:0 }}>Pay your subscription to keep full access to all features.</p>
              {graceLeft <= 2 && <p style={{ marginTop:5, fontSize:11, fontWeight:700, color:"#C62828", animation:"pulse 1.5s infinite" }}>⚠️ Account locks in {graceLeft} day{graceLeft!==1?"s":""}!</p>}
            </div>
          </div>
        )}

        {accStatus === "locked" && (
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

        {accStatus === "active" && !showEnrollTab && (
          <div style={{ marginTop:16, padding:"13px 16px", background:"#E8F5E9", borderRadius:14, border:"1.5px solid #A5D6A7", display:"flex", alignItems:"center", gap:12 }}>
            <CheckCircle2 size={20} color="#2E7D32"/>
            <div style={{ flex:1 }}>
              <p style={{ fontWeight:700, fontSize:13, color:"#2E7D32", margin:"0 0 1px" }}>Subscription Active</p>
              <p style={{ fontSize:12, color:"#388E3C", margin:0 }}>Next payment due: <strong>{fmtDate(enrollment?.next_due_date||null)}</strong></p>
            </div>
            <span style={{ fontSize:12, fontWeight:700, color:"#2E7D32", background:"#C8E6C9", padding:"4px 10px", borderRadius:20 }}>✓ Active</span>
          </div>
        )}

        {/* ── Student profile card ── */}
        <div className="ep-card" style={{ marginTop:16 }}>
          <div style={{ padding:"15px 18px", background:"linear-gradient(90deg,#064E3B,#075E54)", display:"flex", alignItems:"center", gap:13 }}>
            {studentProfile?.avatar_url
              ? <img src={studentProfile.avatar_url} style={{ width:50, height:50, borderRadius:"50%", objectFit:"cover", border:"2px solid rgba(255,255,255,.4)" }} alt=""/>
              : <div style={{ width:50, height:50, borderRadius:"50%", background:"rgba(255,255,255,.18)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:20, fontWeight:700, border:"2px solid rgba(255,255,255,.3)", flexShrink:0 }}>
                  {(studentProfile?.full_name || "S")[0].toUpperCase()}
                </div>
            }
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ color:"#fff", fontWeight:700, fontSize:16, margin:"0 0 2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{studentProfile?.full_name || "Student"}</p>
              <p style={{ color:"rgba(255,255,255,.65)", fontSize:12, margin:0 }}>{studentProfile?.full_name_ar || ""}</p>
            </div>
            <span className="ep-bdg" style={{ background:"rgba(255,255,255,.2)", color:"#fff", flexShrink:0 }}>
              <BookOpen size={11}/> {fees.label}
            </span>
          </div>
          <div style={{ padding:"4px 0" }}>
            {[
              { icon:<Hash size={14}/>,      label:"Student ID",   val: studentProfile?.student_id || "—" },
              { icon:<Mail size={14}/>,       label:"Email",        val: studentProfile?.email || user?.email || "—" },
              { icon:<Calendar size={14}/>,   label:"Joined",       val: fmtDate(studentProfile?.created_at||null) },
              { icon:<TrendingUp size={14}/>, label:"Next Payment", val: fmtDate(enrollment?.next_due_date||null) },
            ].map((row, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 18px", borderBottom:i<3?"1px solid #f6f6f6":"none" }}>
                <span style={{ color:"#075E54", flexShrink:0 }}>{row.icon}</span>
                <span style={{ fontSize:13, color:"#999", minWidth:96 }}>{row.label}</span>
                <span style={{ fontSize:13, color:"#222", fontWeight:600, marginLeft:"auto", textAlign:"right" as const, maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{row.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="ep-card" style={{ marginTop:14, padding:0, overflow:"hidden" }}>
          <div style={{ display:"flex", borderBottom:"1px solid #f0f0f0" }}>
            {(showEnrollTab
              ? [
                  { key:"enroll",  icon:<GraduationCap size={13}/>, label:"Enrollment" },
                  { key:"pay",     icon:<CreditCard size={13}/>,    label:"Pay" },
                  { key:"history", icon:<Receipt size={13}/>,       label:"History" },
                  { key:"status",  icon:<BadgeCheck size={13}/>,    label:"Status" },
                ]
              : [
                  { key:"pay",     icon:<CreditCard size={13}/>,    label: accStatus==="active" ? "Renew" : "Pay" },
                  { key:"history", icon:<Receipt size={13}/>,       label:"History" },
                  { key:"status",  icon:<BadgeCheck size={13}/>,    label:"Status" },
                ]
            ).map((t: any) => (
              <button key={t.key} className={`ep-tab ${tab===t.key?"on":""}`} onClick={() => setTab(t.key as any)}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* ════ ENROLLMENT TAB ════ */}
          {tab === "enroll" && showEnrollTab && (
            <div style={{ padding:"20px 18px", display:"flex", flexDirection:"column", gap:16 }}>
              {/* Welcome */}
              <div style={{ padding:"16px", background:"linear-gradient(135deg,#FEF3C7,#FFFBEB)", borderRadius:14, border:"2px solid #C9922A", display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:48, height:48, borderRadius:"50%", background:"linear-gradient(135deg,#C9922A,#A67C1E)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <GraduationCap size={22} color="#fff"/>
                </div>
                <div>
                  <p style={{ fontWeight:800, fontSize:15, color:"#92400E", margin:"0 0 3px" }}>Welcome to Tahleem Academy! 🌙</p>
                  <p style={{ fontSize:12, color:"#A16207", margin:0 }}>Complete your 5-step enrollment to begin your Islamic education journey.</p>
                </div>
              </div>

              {/* Step 1 — Registration fee (active) */}
              <div style={{ border:"2px solid #C9922A", borderRadius:16, overflow:"hidden" }}>
                <div style={{ padding:"14px 18px", background:"linear-gradient(135deg,#FFFBEB,#FEF3C7)", display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:36, height:36, borderRadius:"50%", background:"linear-gradient(135deg,#C9922A,#A67C1E)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <span style={{ color:"#fff", fontWeight:900, fontSize:15 }}>1</span>
                  </div>
                  <div style={{ flex:1 }}>
                    <p style={{ fontWeight:800, fontSize:15, color:"#92400E", margin:0 }}>Pay Registration Fee</p>
                    <p style={{ fontSize:12, color:"#A16207", margin:0 }}>One-time · Unlocks your full enrollment process</p>
                  </div>
                  <span style={{ fontSize:20, fontWeight:900, color:"#92400E" }}>{fmt(REGISTRATION_FEE)}</span>
                </div>
                <div style={{ padding:"16px 18px" }}>
                  <button className="ep-rbtn" onClick={payRegistration} disabled={payingReg}>
                    {payingReg
                      ? <><Loader2 style={{ width:18, height:18, animation:"spin .8s linear infinite" }}/> Processing…</>
                      : <><Star size={17} fill="currentColor"/> Pay Registration Fee — {fmt(REGISTRATION_FEE)}</>
                    }
                  </button>
                  <p style={{ textAlign:"center" as const, fontSize:11, color:"#bbb", marginTop:8 }}>One-time · Secured by Paystack · Non-refundable after exam begins</p>
                </div>
              </div>

              {/* Steps 2–5 locked preview */}
              <p style={{ fontSize:11, fontWeight:700, color:"#bbb", margin:"4px 0 0", textTransform:"uppercase" as const, letterSpacing:.6 }}>Your Enrollment Journey (Unlocks after Step 1)</p>
              <div className="ep-card" style={{ padding:0 }}>
                {[
                  { step:2, icon:<FileText size={16} color="#2563EB"/>,      iconBg:"#EFF6FF", title:"Complete Onboarding Form",   desc:"Personal details, Quran background & goals" },
                  { step:3, icon:<GraduationCap size={16} color="#7C3AED"/>, iconBg:"#F5F3FF", title:"Written Entrance Exam",      desc:"Tajweed, Arabic & Islamic knowledge test" },
                  { step:4, icon:<Mic size={16} color="#DC2626"/>,           iconBg:"#FEF2F2", title:"Recitation Audio Submission", desc:"AI-scored recitation accuracy" },
                  { step:5, icon:<Video size={16} color="#16A34A"/>,         iconBg:"#F0FDF4", title:"Live Teacher Evaluation",    desc:"10–15 min Makharij & Tajweed session" },
                ].map((s, idx) => (
                  <div key={s.step} style={{ display:"flex", alignItems:"flex-start", gap:14, padding:"14px 18px", borderBottom:idx<3?"1px solid #f5f5f5":"none", opacity:.45 }}>
                    <div style={{ width:38, height:38, borderRadius:12, background:s.iconBg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      {s.icon}
                    </div>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:11, fontWeight:700, color:"#bbb", margin:"0 0 1px", textTransform:"uppercase" as const, letterSpacing:.5 }}>Step {s.step}</p>
                      <p style={{ fontSize:14, fontWeight:700, color:"#555", margin:"0 0 2px" }}>{s.title}</p>
                      <p style={{ fontSize:12, color:"#aaa", margin:0 }}>{s.desc}</p>
                    </div>
                    <Lock size={14} color="#ccc"/>
                  </div>
                ))}
              </div>

              <div style={{ padding:"12px 14px", background:"#F0FFF8", borderRadius:12, border:"1px solid #A5D6A7", display:"flex", gap:10 }}>
                <Sparkles size={15} color="#075E54" style={{ flexShrink:0, marginTop:1 }}/>
                <p style={{ fontSize:12, color:"#064E3B", margin:0 }}>After paying the registration fee, you can also pay your subscription directly here to activate full platform access right away.</p>
              </div>
            </div>
          )}

          {/* ── Reg paid banner (top of pay tab for new students) ── */}
          {tab === "pay" && isNewStudent && regPaid && (
            <div style={{ padding:"13px 18px", background:"#E8F5E9", borderBottom:"1px solid #C8E6C9", display:"flex", alignItems:"center", gap:12 }}>
              <CheckCircle2 size={20} color="#2E7D32"/>
              <div style={{ flex:1 }}>
                <p style={{ fontWeight:700, fontSize:13, color:"#2E7D32", margin:"0 0 1px" }}>Registration Paid ✓</p>
                <p style={{ fontSize:11, color:"#388E3C", margin:0 }}>Now pay your subscription below to activate your full account access.</p>
              </div>
              <button onClick={() => navigate("/onboarding")} style={{ background:"#2E7D32", color:"#fff", border:"none", borderRadius:10, padding:"8px 13px", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
                Onboarding <ArrowRight size={12}/>
              </button>
            </div>
          )}

          {/* ════ PAY / RENEW TAB ════ */}
          {tab === "pay" && (
            <div style={{ padding:"20px 18px", display:"flex", flexDirection:"column", gap:16 }}>
              {accStatus === "active" && (
                <div style={{ padding:"12px 14px", background:"#F0FFF8", borderRadius:12, border:"1px solid #A5D6A7" }}>
                  <p style={{ fontSize:13, fontWeight:700, color:"#2E7D32", margin:"0 0 3px", display:"flex", alignItems:"center", gap:6 }}>
                    <RotateCcw size={13}/> Early Renewal Available
                  </p>
                  <p style={{ fontSize:12, color:"#4CAF50", margin:0 }}>Active until <strong>{fmtDate(enrollment?.next_due_date||null)}</strong>. Renewing now extends your access from that date.</p>
                </div>
              )}

              <p style={{ fontSize:11, fontWeight:700, color:"#aaa", textTransform:"uppercase" as const, letterSpacing:.6, margin:0 }}>
                {fees.label} Level — Choose Your Plan
              </p>

              {/* Monthly card */}
              <div className={`ep-pcard ${selectedPlan==="monthly"?"sel":""}`} onClick={() => setSelectedPlan("monthly")}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div>
                    <p style={{ fontWeight:800, fontSize:16, color:"#111", margin:"0 0 2px" }}>Monthly</p>
                    <p style={{ fontSize:12, color:"#aaa", margin:"0 0 10px", fontFamily:"serif" }}>اشتراك شهري</p>
                    <div style={{ display:"flex", flexWrap:"wrap" as const, gap:6 }}>
                      <span className="ep-bdg" style={{ background:"#E8F5E9", color:"#2E7D32" }}>1 Month</span>
                      <span className="ep-bdg" style={{ background:fees.bg, color:fees.color }}>{fees.label}</span>
                      <span className="ep-bdg" style={{ background:"#F3F4F6", color:"#666" }}>Flexible</span>
                    </div>
                  </div>
                  <div style={{ textAlign:"right" as const }}>
                    <p style={{ fontSize:26, fontWeight:900, color:"#111", margin:"0 0 2px" }}>{fmt(fees.monthly)}</p>
                    <p style={{ fontSize:11, color:"#aaa", margin:0 }}>/ month</p>
                  </div>
                </div>
                {selectedPlan === "monthly" && (
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:12, color:"#075E54", fontWeight:700, fontSize:12 }}>
                    <CheckCircle2 size={14}/> Selected
                  </div>
                )}
              </div>

              {/* Term card */}
              <div className={`ep-pcard ${selectedPlan==="term"?"sel":""}`} onClick={() => setSelectedPlan("term")} style={{ position:"relative" }}>
                {termSave > 0 && (
                  <div style={{ position:"absolute", top:-10, right:14, background:"linear-gradient(135deg,#064E3B,#075E54)", color:"#fff", borderRadius:20, padding:"3px 12px", fontSize:11, fontWeight:800 }}>
                    Save {fmt(termSave)}
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div>
                    <p style={{ fontWeight:800, fontSize:16, color:"#111", margin:"0 0 2px" }}>Term — 3 Months</p>
                    <p style={{ fontSize:12, color:"#aaa", margin:"0 0 10px", fontFamily:"serif" }}>رسوم الفصل الدراسي</p>
                    <div style={{ display:"flex", flexWrap:"wrap" as const, gap:6 }}>
                      <span className="ep-bdg" style={{ background:"#E8F5E9", color:"#2E7D32" }}>3 Months</span>
                      <span className="ep-bdg" style={{ background:fees.bg, color:fees.color }}>{fees.label}</span>
                      {termSave > 0 && <span className="ep-bdg" style={{ background:"#E3F2FD", color:"#1565C0" }}>Best Value</span>}
                    </div>
                  </div>
                  <div style={{ textAlign:"right" as const }}>
                    <p style={{ fontSize:26, fontWeight:900, color:"#111", margin:"0 0 2px" }}>{fmt(fees.term)}</p>
                    <p style={{ fontSize:11, color:"#aaa", margin:0 }}>≈ {fmt(Math.round(fees.term/3))}/mo</p>
                  </div>
                </div>
                {selectedPlan === "term" && (
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:12, color:"#075E54", fontWeight:700, fontSize:12 }}>
                    <CheckCircle2 size={14}/> Selected
                  </div>
                )}
              </div>

              {/* Order summary */}
              <div style={{ background:"#F8FAF8", borderRadius:13, padding:"15px 16px", border:"1px solid #E0EDE0" }}>
                <p style={{ fontSize:11, fontWeight:700, color:"#aaa", marginBottom:12, textTransform:"uppercase" as const, letterSpacing:.5 }}>Order Summary</p>
                {[
                  { label:"Plan",     val: selectedPlan==="monthly" ? "Monthly Subscription" : "Term Subscription (3 Months)" },
                  { label:"Level",    val: fees.label },
                  { label:"Duration", val: selectedPlan==="monthly" ? "1 Month" : "3 Months" },
                  { label:"Total",    val: fmt(amountDue), bold:true, green:true },
                ].map((r, i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", marginBottom:i<3?9:0, paddingTop:i===3?10:0, borderTop:i===3?"1px dashed #ddd":"none" }}>
                    <span style={{ fontSize:13, color:"#999" }}>{r.label}</span>
                    <span style={{ fontSize:13, fontWeight:r.bold?800:500, color:r.green?"#064E3B":"#111" }}>{r.val}</span>
                  </div>
                ))}
              </div>

              <button className="ep-pbtn" onClick={initiatePayment} disabled={paying}>
                {paying
                  ? <><Loader2 style={{ width:18, height:18, animation:"spin .8s linear infinite" }}/> Processing…</>
                  : <><CreditCard size={18}/> Pay {fmt(amountDue)}</>
                }
              </button>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, fontSize:11, color:"#bbb" }}>
                <Shield size={12}/> Secured by Paystack · SSL Encrypted
              </div>
            </div>
          )}

          {/* ════ HISTORY TAB ════ */}
          {tab === "history" && (
            <div style={{ padding:"0 18px 16px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 0 10px" }}>
                <span style={{ fontSize:14, fontWeight:700, color:"#333" }}>Payment History</span>
                <button onClick={loadHistory} style={{ background:"none", border:"none", cursor:"pointer", color:"#075E54", display:"flex", alignItems:"center", gap:4, fontSize:12, fontWeight:600 }}>
                  <RefreshCw size={13}/> Refresh
                </button>
              </div>
              {loadingHistory && (
                <div style={{ display:"flex", justifyContent:"center", padding:28 }}>
                  <Loader2 style={{ width:24, height:24, color:"#075E54", animation:"spin .8s linear infinite" }}/>
                </div>
              )}
              {!loadingHistory && history.length === 0 && (
                <div style={{ textAlign:"center" as const, padding:"32px 0" }}>
                  <Receipt style={{ width:38, height:38, margin:"0 auto 10px", color:"#ddd" }}/>
                  <p style={{ fontSize:14, color:"#aaa", margin:0 }}>No payments yet</p>
                  <p style={{ fontSize:12, color:"#ccc", margin:"4px 0 0" }}>Your payment history will appear here</p>
                </div>
              )}
              {history.map((p) => (
                <div key={p.id} className="ep-hrow">
                  <div style={{ width:42, height:42, borderRadius:13, background:p.status==="success"?"#E8F5E9":"#FFEBEE", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    {p.status==="success" ? <CheckCircle2 size={18} color="#2E7D32"/> : <XCircle size={18} color="#C62828"/>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontWeight:700, fontSize:14, color:"#111", margin:"0 0 2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                      {(p as any).payment_type === "registration"
                        ? "🌟 Registration Fee"
                        : p.plan_type === "monthly"
                          ? "📅 Monthly Subscription"
                          : "📆 Term Subscription"}
                    </p>
                    <p style={{ fontSize:11, color:"#bbb", margin:0 }}>{fmtDT(p.paid_at)} · {p.receipt_id}</p>
                  </div>
                  <div style={{ textAlign:"right" as const, flexShrink:0 }}>
                    <p style={{ fontWeight:800, color:p.status==="success"?"#2E7D32":"#C62828", fontSize:14, margin:"0 0 4px" }}>{fmt(p.amount)}</p>
                    <span className="ep-bdg" style={{ background:p.status==="success"?"#E8F5E9":"#FFEBEE", color:p.status==="success"?"#2E7D32":"#C62828" }}>{p.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ════ STATUS TAB ════ */}
          {tab === "status" && (
            <div style={{ padding:"20px 18px", display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ background:statusCfg.bg, borderRadius:16, padding:"22px 18px", border:`1.5px solid ${statusCfg.color}33`, textAlign:"center" as const }}>
                <div style={{ width:58, height:58, borderRadius:"50%", background:statusCfg.color, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px", color:"#fff" }}>
                  {statusCfg.icon}
                </div>
                <p style={{ fontSize:19, fontWeight:800, color:statusCfg.color, margin:"0 0 4px" }}>{statusCfg.label}</p>
                <p style={{ fontSize:13, color:"#777", margin:0 }}>{statusCfg.desc}</p>
              </div>

              {enrollment && (
                <div>
                  {[
                    { icon:<BookOpen size={15}/>,    label:"Level",        val: fees.label },
                    { icon:<CreditCard size={15}/>,  label:"Last Paid",    val: fmtDate(enrollment.paid_at) },
                    { icon:<Calendar size={15}/>,    label:"Next Due",     val: fmtDate(enrollment.next_due_date) },
                    { icon:<Clock size={15}/>,       label:"Grace Until",  val: fmtDate(enrollment.grace_end_date) },
                    ...(enrollment.admin_override ? [{ icon:<Unlock size={15}/>, label:"Admin Override", val:`Until ${fmtDate(enrollment.admin_override_until)}` }] : []),
                  ].map((r, i, arr) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 4px", borderBottom:i<arr.length-1?"1px solid #f0f0f0":"none" }}>
                      <span style={{ color:"#075E54" }}>{r.icon}</span>
                      <span style={{ fontSize:13, color:"#aaa", minWidth:108 }}>{r.label}</span>
                      <span style={{ fontSize:13, fontWeight:600, color:"#222", marginLeft:"auto" }}>{r.val}</span>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <p style={{ fontSize:11, fontWeight:700, color:"#aaa", marginBottom:10, textTransform:"uppercase" as const, letterSpacing:.5 }}>Feature Access</p>
                {[
                  { name:"Dashboard Overview",   allowed:true },
                  { name:"Enrollment & Payment", allowed:true },
                  { name:"Al-Majlis Chat",       allowed: accStatus!=="locked" },
                  { name:"Course Lessons",       allowed: accStatus==="active" },
                  { name:"Al-Hifdh Tracker",     allowed: accStatus==="active" },
                  { name:"Assignments & Exams",  allowed: accStatus==="active" },
                  { name:"Live Sessions",        allowed: accStatus==="active" },
                  { name:"Al-Musabaqah Quiz",    allowed: accStatus==="active" },
                ].map((f, i, arr) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:i<arr.length-1?"1px solid #f6f6f6":"none" }}>
                    {f.allowed ? <CheckCircle2 size={16} color="#2E7D32"/> : <Lock size={16} color="#E74C3C"/>}
                    <span style={{ fontSize:13, color:f.allowed?"#222":"#bbb", flex:1 }}>{f.name}</span>
                    <span className="ep-bdg" style={{ background:f.allowed?"#E8F5E9":"#FFEBEE", color:f.allowed?"#2E7D32":"#C62828" }}>
                      {f.allowed?"Unlocked":"Locked"}
                    </span>
                  </div>
                ))}
              </div>

              {accStatus !== "active" && (
                <button className="ep-pbtn" onClick={() => setTab("pay")}>
                  <CreditCard size={18}/> {accStatus==="locked" ? "Renew Subscription" : "Make a Payment"}
                </button>
              )}

              {enrollment?.admin_override && (
                <div style={{ background:"#E8F5E9", borderRadius:12, padding:"13px 16px", display:"flex", gap:10 }}>
                  <Unlock size={16} color="#2E7D32" style={{ flexShrink:0, marginTop:1 }}/>
                  <div>
                    <p style={{ fontSize:13, fontWeight:700, color:"#2E7D32", margin:"0 0 2px" }}>Admin Override Active</p>
                    <p style={{ fontSize:12, color:"#555", margin:0 }}>Extended access granted until {fmtDate(enrollment.admin_override_until)}.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── ADMIN CONTROLS ── */}
        {isAdmin && enrollment && (
          <div className="ep-card" style={{ marginTop:14 }}>
            <div style={{ padding:"14px 18px", borderBottom:"1px solid #f0f0f0", display:"flex", alignItems:"center", gap:8 }}>
              <Shield size={16} color="#075E54"/>
              <span style={{ fontWeight:700, fontSize:14, color:"#333" }}>Admin Controls</span>
            </div>
            <div style={{ padding:"14px 18px", display:"flex", flexDirection:"column", gap:10 }}>
              <p style={{ fontSize:12, color:"#aaa", margin:0 }}>Manually manage this student's access:</p>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={async () => {
                  const until = new Date(Date.now() + 7*86400000).toISOString();
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
                const now = new Date().toISOString();
                await supabase.from("enrollments" as any).update({ status:"active", paid_at:now, next_due_date:addMonths(1), registration_paid:true, registration_paid_at:now }).eq("id", enrollment.id);
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
