
/*
  EnrollmentPayment.tsx — Tahleem Academy
  Uses the ACTUAL database tables:
    - profiles          → payment_status, subscription_end_date, level
    - payment_plans     → available plans (fetched live from DB)
    - payments          → payment history
    - student_subscriptions → active subscriptions
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
  XCircle, RotateCcw, Receipt,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────
interface Plan {
  id: string;
  name: string;
  amount: number;
  currency: string;
  duration_months: number;
  is_active: boolean;
  paystack_plan_code?: string;
  level?: string | null;
}
interface Payment {
  id: string; amount: number; status: string;
  created_at: string; plan_id: string;
  paystack_reference?: string; payment_method?: string;
  type?: string;
}
interface StudentProfile {
  user_id: string; full_name: string; full_name_ar?: string;
  email?: string; level?: string; student_id?: string;
  avatar_url?: string; created_at: string;
  payment_status?: string; subscription_end_date?: string;
  is_payment_exempt?: boolean;
}

const PAYSTACK_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";

const fmt     = (n: number, cur = "NGN") => cur === "NGN" ? `₦${n.toLocaleString()}` : `${cur} ${n.toLocaleString()}`;
const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString("en-NG", { day:"2-digit", month:"short", year:"numeric" }) : "—";
const fmtDT   = (d: string | null | undefined) => d ? new Date(d).toLocaleString("en-NG", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "—";
const daysLeft= (d: string | null | undefined) => { if (!d) return 0; return Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)); };

// ── Access status derived from profile ────────────────────────────
export type AccessStatus = "active" | "grace" | "locked" | "unknown";
export const getAccessStatus = (profile: StudentProfile | null): AccessStatus => {
  if (!profile) return "unknown";
  if (profile.is_payment_exempt) return "active";

  const now = new Date();

  // If there's a subscription end date, trust it first regardless of payment_status
  if (profile.subscription_end_date) {
    const end = new Date(profile.subscription_end_date);
    if (end > now) return "active";
    // Within 7 days after expiry = grace period
    const graceCutoff = new Date(end.getTime() + 7 * 86400000);
    if (graceCutoff > now) return "grace";
    return "locked";
  }

  // No end date — fall back to payment_status field
  if (profile.payment_status === "paid") return "active";

  // New students get 7-day grace from join date
  const joined = new Date(profile.created_at);
  const graceEnd = new Date(joined.getTime() + 7 * 86400000);
  if (graceEnd > now) return "grace";

  return "locked";
};

export const PaymentLockedOverlay = ({ onPay }: { onPay: () => void }) => (
  <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.65)", backdropFilter:"blur(6px)", zIndex:50, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:24, borderRadius:"inherit" }}>
    <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(231,76,60,0.15)", border:"2px solid #E74C3C", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <Lock style={{ width:28, height:28, color:"#E74C3C" }}/>
    </div>
    <p style={{ color:"#fff", fontWeight:700, fontSize:18, textAlign:"center", margin:0 }}>Feature Locked</p>
    <p style={{ color:"rgba(255,255,255,.75)", fontSize:13, textAlign:"center", maxWidth:240, margin:0 }}>Complete your payment to unlock this feature</p>
    <button onClick={onPay} style={{ background:"#075E54", color:"#fff", border:"none", borderRadius:12, padding:"12px 28px", cursor:"pointer", fontWeight:700, fontSize:14 }}>Pay Now</button>
  </div>
);

// ══════════════════════════════════════════════════════════════════
const EnrollmentPayment = () => {
  const { user, profile: authProfile, hasRole } = useAuth();
  const { toast }   = useToast();
  const navigate    = useNavigate();

  const [tab, setTab]                     = useState<"pay"|"history"|"status">("pay");
  const [profile, setProfile]             = useState<StudentProfile | null>(null);
  const [plans, setPlans]                 = useState<Plan[]>([]);
  const [payments, setPayments]           = useState<Payment[]>([]);
  const [selectedPlan, setSelectedPlan]   = useState<Plan | null>(null);
  const [loading, setLoading]             = useState(true);
  const [paying, setPaying]               = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedTerms, setSelectedTerms]   = useState<Record<string,number>>({});
  const [billingMode, setBillingMode]       = useState<"monthly"|"term">("monthly");

  const isAdmin   = hasRole("admin");
  const accStatus = getAccessStatus(profile);
  const subEnd    = profile?.subscription_end_date;
  const graceLeft = accStatus === "grace" ? daysLeft(subEnd ? new Date(new Date(subEnd).getTime() + 7*86400000).toISOString() : profile?.created_at ? new Date(new Date(profile.created_at).getTime() + 7*86400000).toISOString() : null) : 0;

  // ── Load data ─────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const profRes = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (profRes.data) setProfile(profRes.data as unknown as StudentProfile);

      // Fetch all active plans, then filter to match student's level or "all" (null level)
      const studentLevel = ((profRes.data as any)?.level || "beginner").toLowerCase();
      const plansRes = await supabase.from("payment_plans" as any)
        .select("*").eq("is_active", true).order("amount");

      const allPlans = (plansRes.data || []) as unknown as Plan[];
      const hasPrivate = !!(profRes.data as any)?.private_session_rate || (profRes.data as any)?.student_type === "private";

      // Match plan to student's level:
      // 1. plan.level field matches student level, OR
      // 2. plan.level is null/all (applies to everyone), OR
      // 3. plan name contains the student's level word (e.g. "Beginner Term Fee")
      const levelPlans = allPlans.filter(p => {
        const isPrivatePlan = p.name?.toLowerCase().includes("private");
        if (isPrivatePlan && !hasPrivate) return false;
        const planLevel = (p.level || "").toLowerCase();
        const planName  = (p.name  || "").toLowerCase();
        if (!planLevel || planLevel === "all") return true;
        return planLevel === studentLevel || planName.includes(studentLevel);
      });

      // Fallback: if nothing matches, show all non-private active plans
      const activePlans = levelPlans.length > 0
        ? levelPlans
        : allPlans.filter(p => {
            const isPrivate = p.name?.toLowerCase().includes("private");
            return !isPrivate || hasPrivate;
          });

      setPlans(activePlans);
      if (activePlans.length > 0) setSelectedPlan(activePlans[0]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    setLoadingHistory(true);
    const { data } = await supabase.from("payments" as any)
      .select("*").eq("student_id", user.id)
      .order("created_at", { ascending: false }).limit(50);
    setPayments((data || []) as unknown as Payment[]);
    setLoadingHistory(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (tab === "history") loadHistory(); }, [tab, loadHistory]);

  // ── Receipt download ──────────────────────────────────────────
  const downloadReceipt = (p: Payment, plan?: Plan) => {
    const ref = p.paystack_reference || p.id;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${ref}</title>
      <style>
        body{font-family:'Segoe UI',system-ui,sans-serif;padding:40px;color:#111;max-width:640px;margin:auto}
        h1{color:#064E3B;margin:0 0 4px;font-size:22px}
        .sub{color:#777;font-size:13px;margin-bottom:24px}
        .box{border:1px solid #ddd;border-radius:12px;padding:20px;margin-bottom:18px}
        .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #eee;font-size:14px}
        .row:last-child{border-bottom:none}
        .label{color:#888}
        .total{font-size:18px;font-weight:800;color:#064E3B}
        .stamp{margin-top:24px;text-align:center;color:#2E7D32;font-weight:800;border:2px dashed #2E7D32;padding:10px;border-radius:10px}
        @media print{button{display:none}}
      </style></head><body>
      <h1>🕌 Tahleem Academy</h1>
      <div class="sub">Official Payment Receipt</div>
      <div class="box">
        <div class="row"><span class="label">Receipt No.</span><span><b>RCPT-${ref}</b></span></div>
        <div class="row"><span class="label">Date</span><span>${fmtDT(p.created_at)}</span></div>
        <div class="row"><span class="label">Student</span><span>${profile?.full_name || ""}</span></div>
        <div class="row"><span class="label">Student ID</span><span>${(profile as any)?.student_id || "—"}</span></div>
        <div class="row"><span class="label">Plan</span><span>${plan?.name || "Subscription"}</span></div>
        <div class="row"><span class="label">Payment Method</span><span>${p.payment_method || "Paystack"}</span></div>
        <div class="row"><span class="label">Reference</span><span style="font-family:monospace;font-size:12px">${ref}</span></div>
        <div class="row"><span class="label">Amount Paid</span><span class="total">${fmt(p.amount, plan?.currency || "NGN")}</span></div>
      </div>
      <div class="stamp">✓ PAID — Thank you. Jazakum Allahu khayran.</div>
      <p style="text-align:center;color:#aaa;font-size:11px;margin-top:30px">tahleemacademy.com · This is a computer-generated receipt.</p>
      <p style="text-align:center;margin-top:18px"><button onclick="window.print()" style="background:#064E3B;color:#fff;border:none;border-radius:8px;padding:10px 22px;font-weight:700;cursor:pointer">Print / Save as PDF</button></p>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast({ title: "Pop-up blocked", description: "Allow pop-ups to download receipt", variant: "destructive" }); return; }
    w.document.write(html); w.document.close();
  };

  // ── Paystack payment ──────────────────────────────────────────
  const initiatePayment = async () => {
    if (!user || !selectedPlan) {
      toast({ title:"Please select a plan", variant:"destructive" }); return;
    }
    if (!profile) {
      toast({ title:"Profile not loaded. Please refresh.", variant:"destructive" }); return;
    }

    const email = (profile as any).email || user.email || "";
    const ref   = `TAH-${user.id.slice(0,8)}-${Date.now()}`;
    const baseAmount  = selectedPlan.amount; // monthly rate
    let amount: number;
    let termMonths: number;
    if (billingMode === "monthly") {
      amount     = baseAmount;
      termMonths = 1;
    } else {
      const activeTerm = selectedTerms[selectedPlan.id] ?? 1;
      const termAmounts: Record<number,number> = { 1: baseAmount*3, 2: baseAmount*6, 3: Math.round(baseAmount*9*0.9) };
      amount     = termAmounts[activeTerm] || baseAmount*3;
      termMonths = activeTerm * 3;
    }

    // Demo mode — dev-only. This used to run in production too whenever
    // VITE_PAYSTACK_PUBLIC_KEY failed to load (env var typo, build issue,
    // etc), which silently marked a student "paid" with zero real payment.
    // Restricting it to import.meta.env.DEV means a missing key in
    // production now correctly blocks payment instead of faking success.
    if (!PAYSTACK_KEY) {
      if (import.meta.env.DEV) {
        toast({ title:"⚠️ Demo mode", description:"No Paystack key configured — simulating success (dev only)." });
        await handlePaymentSuccess(ref, amount, selectedPlan, termMonths);
      } else {
        toast({ title:"Payment unavailable", description:"Payment configuration error. Please contact support.", variant:"destructive" });
      }
      return;
    }

    const PaystackPop = (window as any).PaystackPop;
    if (!PaystackPop) {
      // Load script then retry automatically
      setPaying(true);
      const existing = document.getElementById("paystack-script");
      if (existing) { existing.remove(); }
      const script = document.createElement("script");
      script.id = "paystack-script";
      script.src = "https://js.paystack.co/v1/inline.js";
      script.onload = () => { setPaying(false); setTimeout(initiatePayment, 300); };
      script.onerror = () => { 
        setPaying(false); 
        toast({ title: "Payment system unavailable", description: "Check your internet connection and try again.", variant: "destructive" }); 
      };
      document.head.appendChild(script);
      return;
    }

    setPaying(true);
    try {
      const handler = PaystackPop.setup({
        key:      PAYSTACK_KEY,
        email,
        amount:   amount * 100,  // kobo
        currency: selectedPlan.currency || "NGN",
        ref,
        plan:     selectedPlan.paystack_plan_code || undefined,
        metadata: {
          user_id:   user.id,
          plan_id:   selectedPlan.id,
          plan_name: selectedPlan.name,
        },
        // IMPORTANT: callback must NOT be async — Paystack breaks if it is
        callback: (res: any) => {
          clearTimeout((window as any).__paystack_safety_timer__);
          const reference = res.reference || ref;
          handlePaymentSuccess(reference, amount, selectedPlan, termMonths);
        },
        onClose: () => {
          clearTimeout((window as any).__paystack_safety_timer__);
          toast({ title: "Payment cancelled" });
          setPaying(false);
        },
      });
      handler.openIframe();
      // Safety: reset paying after 3 min if no callback received (e.g. iframe blocked)
      const safetyTimer = setTimeout(() => {
        setPaying(false);
        toast({ title: "Payment window closed", description: "If you completed payment, wait a moment then refresh." });
      }, 180000);
      // Store timer so callback can clear it
      (window as any).__paystack_safety_timer__ = safetyTimer;
    } catch (err: any) {
      toast({ title:"Could not open payment", description: err?.message || "Please try again.", variant:"destructive" });
      setPaying(false);
    }
  };

  // IMPORTANT: this used to write "paid" straight to the database itself,
  // trusting Paystack's client-side callback with no server-side check
  // that money had actually moved. That's what let some students end up
  // marked "paid" without paying. It also ran independently of the
  // paystack-webhook — which does its own (also unguarded) extension of
  // the subscription for the same charge — so a single month's payment
  // could get credited twice.
  //
  // Now this just hands the reference to the paystack-verify edge
  // function, which checks the transaction against Paystack's own server
  // and applies the credit exactly once (shared idempotency guard with
  // the webhook, keyed on paystack_reference).
  const handlePaymentSuccess = async (ref: string, amount: number, plan: Plan, termMonthsParam = 3) => {
    if (!user || !profile) return;
    try {
      const { data, error } = await supabase.functions.invoke("paystack-verify", {
        body: { reference: ref },
      });

      if (error || !data?.ok) {
        const msg = data?.error || error?.message || "Payment could not be confirmed.";
        toast({
          title: "Payment not confirmed",
          description: `${msg} If you were charged, contact admin with ref: ${ref}`,
          variant: "destructive",
        });
        return;
      }

      const endStr = data.subscription_end_date;
      toast({
        title: "✅ Payment Successful!",
        description: endStr ? `Ref: ${ref} · Active until ${fmtDate(endStr)}` : `Ref: ${ref}`,
      });
      await loadData();
      await loadHistory();
      setTab("status");
    } catch (err: any) {
      toast({ title:"Could not confirm payment", description:"Contact admin with ref: " + ref, variant:"destructive" });
    } finally {
      setPaying(false);
    }
  };

  // ── Status config ─────────────────────────────────────────────
  const statusCfg = {
    active:  { color:"#2E7D32", bg:"#E8F5E9", icon:<CheckCircle2 size={18}/>, label:"Active",       desc:"Full access to all features" },
    grace:   { color:"#F57C00", bg:"#FFF3E0", icon:<Clock size={18}/>,        label:"Grace Period", desc:`${graceLeft} day${graceLeft!==1?"s":""} remaining` },
    locked:  { color:"#C62828", bg:"#FFEBEE", icon:<Lock size={18}/>,         label:"Locked",       desc:"Renew to restore access" },
    unknown: { color:"#546E7A", bg:"#ECEFF1", icon:<Shield size={18}/>,       label:"Pending",      desc:"Pay to activate your account" },
  }[accStatus];

  // ── CSS ───────────────────────────────────────────────────────
  const CSS = `
    @keyframes spin   { to{transform:rotate(360deg)} }
    @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
    @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.5} }
    .ep-card  { background:#fff; border-radius:18px; box-shadow:0 2px 14px rgba(0,0,0,.08); overflow:hidden; animation:fadeUp .3s ease; }
    .ep-pcard { border:2px solid #e0e0e0; border-radius:14px; padding:18px; cursor:pointer; transition:all .18s; background:#fff; }
    .ep-pcard:hover { border-color:#075E54; box-shadow:0 4px 16px rgba(7,94,84,.12); }
    .ep-pcard.sel { border-color:#075E54; background:#F0FFF8; box-shadow:0 4px 20px rgba(7,94,84,.18); }
    .ep-tab { flex:1; padding:14px 6px; border:none; background:none; cursor:pointer; font-size:13px; font-weight:700; color:#aaa; border-bottom:3px solid transparent; transition:all .2s; display:flex; align-items:center; justify-content:center; gap:6px; }
    .ep-tab.on { color:#064E3B; border-bottom-color:#064E3B; }
    .ep-pbtn { width:100%; padding:18px; background:linear-gradient(135deg,#064E3B,#075E54); color:#fff; border:none; border-radius:14px; font-size:17px; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px; box-shadow:0 6px 24px rgba(7,94,84,.4); transition:opacity .15s; }
    .ep-pbtn:disabled { opacity:.5; cursor:not-allowed; }
    .ep-pbtn:not(:disabled):active { opacity:.85; }
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

  // ── Level label from profile ──────────────────────────────────
  const levelLabel = ((profile as any)?.level || (authProfile as any)?.level || "beginner");
  const levelDisplay = levelLabel.charAt(0).toUpperCase() + levelLabel.slice(1);

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
            <span style={{ color:"#fff", fontWeight:800, fontSize:19 }}>Payment & Renewal</span>
          </div>
          <div style={{ color:"rgba(255,255,255,.6)", fontSize:13, fontFamily:"serif", textAlign:"center" as const, marginBottom:12 }}>
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </div>
          {/* Status pill — always shows real status, never "Loading..." */}
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
              <p style={{ fontWeight:700, color:"#E65100", fontSize:14, margin:"0 0 2px" }}>{graceLeft} day{graceLeft!==1?"s":""} left in your grace period</p>
              <p style={{ fontSize:12, color:"#8D5E00", margin:0 }}>Pay your subscription below to keep full access to all features.</p>
              {graceLeft <= 2 && <p style={{ marginTop:5, fontSize:11, fontWeight:700, color:"#C62828", animation:"pulse 1.5s infinite", margin:"5px 0 0" }}>⚠️ Account locks in {graceLeft} day{graceLeft!==1?"s":""}!</p>}
            </div>
          </div>
        )}

        {accStatus === "locked" && (
          <div style={{ marginTop:16, padding:"16px", background:"#FFEBEE", borderRadius:14, border:"1.5px solid #EF9A9A" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
              <Lock size={20} color="#C62828"/>
              <span style={{ fontWeight:700, color:"#C62828", fontSize:15 }}>Account Access Locked</span>
            </div>
            <p style={{ fontSize:13, color:"#7B1A1A", margin:"0 0 10px" }}>Your subscription has expired. Renew to restore access to all features.</p>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {["Al-Majlis Chat","Course Lessons","Al-Hifdh Tracker","Assignments & Exams","Live Sessions"].map(f => (
                <div key={f} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#7B1A1A" }}>
                  <XCircle size={14} color="#E74C3C"/> {f}
                </div>
              ))}
            </div>
          </div>
        )}

        {accStatus === "active" && !profile?.is_payment_exempt && (
          <div style={{ marginTop:16, padding:"13px 16px", background:"#E8F5E9", borderRadius:14, border:"1.5px solid #A5D6A7", display:"flex", alignItems:"center", gap:12 }}>
            <CheckCircle2 size={20} color="#2E7D32"/>
            <div style={{ flex:1 }}>
              <p style={{ fontWeight:700, fontSize:13, color:"#2E7D32", margin:"0 0 1px" }}>Subscription Active</p>
              <p style={{ fontSize:12, color:"#388E3C", margin:0 }}>Active until: <strong>{fmtDate(subEnd)}</strong></p>
            </div>
            <span style={{ fontSize:12, fontWeight:700, color:"#2E7D32", background:"#C8E6C9", padding:"4px 10px", borderRadius:20 }}>✓ Active</span>
          </div>
        )}

        {profile?.is_payment_exempt && (
          <div style={{ marginTop:16, padding:"13px 16px", background:"#E3F2FD", borderRadius:14, border:"1.5px solid #90CAF9", display:"flex", alignItems:"center", gap:12 }}>
            <Shield size={20} color="#1565C0"/>
            <p style={{ fontWeight:700, fontSize:13, color:"#1565C0", margin:0 }}>🎓 Payment Exempt — Full access granted by admin</p>
          </div>
        )}

        {/* ── Student profile card ── */}
        <div className="ep-card" style={{ marginTop:16 }}>
          <div style={{ padding:"15px 18px", background:"linear-gradient(90deg,#064E3B,#075E54)", display:"flex", alignItems:"center", gap:13 }}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} style={{ width:50, height:50, borderRadius:"50%", objectFit:"cover", border:"2px solid rgba(255,255,255,.4)" }} alt=""/>
              : <div style={{ width:50, height:50, borderRadius:"50%", background:"rgba(255,255,255,.18)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:20, fontWeight:700, border:"2px solid rgba(255,255,255,.3)", flexShrink:0 }}>
                  {(profile?.full_name || user?.email || "S")[0].toUpperCase()}
                </div>
            }
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ color:"#fff", fontWeight:700, fontSize:16, margin:"0 0 2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{profile?.full_name || "Student"}</p>
              {profile?.full_name_ar && <p style={{ color:"rgba(255,255,255,.65)", fontSize:12, margin:0 }}>{profile.full_name_ar}</p>}
            </div>
            <span className="ep-bdg" style={{ background:"rgba(255,255,255,.2)", color:"#fff", flexShrink:0 }}>
              <BookOpen size={11}/> {levelDisplay}
            </span>
          </div>
          <div>
            {[
              { icon:<Hash size={14}/>,      label:"Student ID",    val: (profile as any)?.student_id || "—" },
              { icon:<Mail size={14}/>,       label:"Email",         val: (profile as any)?.email || user?.email || "—" },
              { icon:<Calendar size={14}/>,   label:"Joined",        val: fmtDate(profile?.created_at) },
              { icon:<TrendingUp size={14}/>, label:"Active Until",  val: fmtDate(subEnd) },
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
            {([
              { key:"pay",     icon:<CreditCard size={14}/>, label: accStatus==="active" ? "Renew" : "Pay" },
              { key:"history", icon:<Receipt size={14}/>,    label:"History" },
              { key:"status",  icon:<BadgeCheck size={14}/>, label:"Status" },
            ] as const).map(t => (
              <button key={t.key} className={`ep-tab ${tab===t.key?"on":""}`} onClick={() => setTab(t.key)}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* ════ PAY TAB ════ */}
          {tab === "pay" && (
            <div style={{ padding:"20px 18px", display:"flex", flexDirection:"column", gap:16 }}>

              {accStatus === "active" && (
                <div style={{ padding:"12px 14px", background:"#F0FFF8", borderRadius:12, border:"1px solid #A5D6A7" }}>
                  <p style={{ fontSize:13, fontWeight:700, color:"#2E7D32", margin:"0 0 3px", display:"flex", alignItems:"center", gap:6 }}>
                    <RotateCcw size={13}/> Early Renewal Available
                  </p>
                  <p style={{ fontSize:12, color:"#4CAF50", margin:0 }}>
                    Active until <strong>{fmtDate(subEnd)}</strong>. Renewing now extends your subscription from that date.
                  </p>
                </div>
              )}

              {plans.length === 0 ? (
                <div style={{ textAlign:"center" as const, padding:"28px 0", color:"#bbb" }}>
                  <CreditCard style={{ width:36, height:36, margin:"0 auto 10px", color:"#ddd" }}/>
                  <p style={{ fontSize:14, color:"#aaa", margin:0 }}>No payment plans available</p>
                  <p style={{ fontSize:12, color:"#bbb", margin:"4px 0 0" }}>Contact admin to set up plans</p>
                </div>
              ) : (
                <>
                  <p style={{ fontSize:11, fontWeight:700, color:"#aaa", textTransform:"uppercase" as const, letterSpacing:.6, margin:0 }}>
                    {levelDisplay} Level — Choose Your Plan
                  </p>

                  {/* Billing mode toggle */}
                  <div style={{ display:"flex", background:"#f0f0f0", borderRadius:10, padding:3, gap:3 }}>
                    {(["monthly","term"] as const).map(mode => (
                      <button key={mode} type="button"
                        onClick={() => setBillingMode(mode)}
                        style={{ flex:1, padding:"8px 0", borderRadius:8, border:"none", fontWeight:700, fontSize:13, cursor:"pointer", transition:"all .15s",
                          background: billingMode===mode ? "#064E3B" : "transparent",
                          color:      billingMode===mode ? "#fff"    : "#777",
                        }}>
                        {mode === "monthly" ? "📅 Monthly" : "📦 Pay per Term"}
                      </button>
                    ))}
                  </div>

                  {/* Show one card per plan */}
                  {plans.map(plan => {
                    const baseAmount = plan.amount; // monthly rate
                    const currency   = plan.currency || "NGN";
                    const terms = [
                      { n:1, label:"1 Term",  months:3,  amount: baseAmount * 3,                    save: 0 },
                      { n:2, label:"2 Terms", months:6,  amount: baseAmount * 6,                    save: 0 },
                      { n:3, label:"3 Terms", months:9,  amount: Math.round(baseAmount * 9 * 0.9), save: Math.round(baseAmount * 9 * 0.1) },
                    ];
                    const activeTerm = selectedTerms[plan.id] ?? 1;
                    const chosen = terms.find(t => t.n === activeTerm) || terms[0];
                    const displayAmount = billingMode === "monthly" ? baseAmount : chosen.amount;
                    return (
                      <div key={plan.id} className="ep-pcard sel" style={{ display:"flex", flexDirection:"column", gap:14 }}>
                        {/* Plan header */}
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                          <div>
                            <p style={{ fontWeight:800, fontSize:16, color:"#111", margin:"0 0 2px" }}>{plan.name}</p>
                            <p style={{ fontSize:12, color:"#aaa", margin:0, fontFamily:"serif" }}>رسوم الفصل الدراسي</p>
                          </div>
                          <div style={{ textAlign:"right" as const }}>
                            <p style={{ fontSize:26, fontWeight:900, color:"#064E3B", margin:"0 0 2px" }}>{fmt(displayAmount, currency)}</p>
                            <p style={{ fontSize:11, color:"#aaa", margin:0 }}>
                              {billingMode === "monthly" ? "per month" : `${chosen.months} months`}
                            </p>
                          </div>
                        </div>

                        {/* Term selector — only shown in term mode */}
                        {billingMode === "term" && (
                          <div>
                            <p style={{ fontSize:11, fontWeight:700, color:"#aaa", textTransform:"uppercase" as const, letterSpacing:.5, margin:"0 0 8px" }}>How many terms?</p>
                            <div style={{ display:"flex", gap:8 }}>
                              {terms.map(t => (
                                <button key={t.n} type="button"
                                  onClick={() => { setSelectedTerms(prev => ({...prev, [plan.id]: t.n})); setSelectedPlan(plan); }}
                                  style={{ flex:1, padding:"10px 6px", borderRadius:10, border:`2px solid ${activeTerm===t.n?"#064E3B":"#e0e0e0"}`, background:activeTerm===t.n?"#064E3B":"#fff", color:activeTerm===t.n?"#fff":"#555", fontWeight:800, fontSize:13, cursor:"pointer", transition:"all .15s", position:"relative" as const }}>
                                  {t.label}
                                  {t.save > 0 && (
                                    <span style={{ position:"absolute", top:-8, right:-4, background:"#C9922A", color:"#fff", borderRadius:10, padding:"1px 6px", fontSize:9, fontWeight:800 }}>
                                      -10%
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                            {chosen.save > 0 && (
                              <p style={{ fontSize:11, color:"#C9922A", fontWeight:700, margin:"6px 0 0" }}>
                                🎉 You save {fmt(chosen.save, currency)} by paying 3 terms upfront!
                              </p>
                            )}
                          </div>
                        )}

                        {/* Activate this plan */}
                        {selectedPlan?.id !== plan.id && (
                          <button type="button" onClick={() => { setSelectedPlan(plan); setSelectedTerms(prev => ({...prev, [plan.id]: activeTerm})); }}
                            style={{ padding:"8px", background:"#f5f5f5", border:"none", borderRadius:8, fontSize:12, fontWeight:700, color:"#555", cursor:"pointer" }}>
                            Select this plan
                          </button>
                        )}
                        {selectedPlan?.id === plan.id && (
                          <div style={{ display:"flex", alignItems:"center", gap:6, color:"#075E54", fontWeight:700, fontSize:12 }}>
                            <CheckCircle2 size={14}/> Selected — {billingMode === "monthly" ? `Monthly · ${fmt(baseAmount, currency)}` : `${chosen.label} · ${fmt(chosen.amount, currency)}`}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Order summary */}
                  {selectedPlan && (() => {
                    const ba = selectedPlan.amount;
                    const st = selectedTerms[selectedPlan.id] ?? 1;
                    const totalAmt = billingMode === "monthly"
                      ? ba
                      : ({ 1:ba*3, 2:ba*6, 3:Math.round(ba*9*0.9) } as Record<number,number>)[st] || ba*3;
                    const termsLabel = billingMode === "monthly"
                      ? "1 Month"
                      : `${st} Term${st>1?"s":""} (${st*3} months)`;
                    return (
                      <div style={{ background:"#F8FAF8", borderRadius:13, padding:"15px 16px", border:"1px solid #E0EDE0" }}>
                        <p style={{ fontSize:11, fontWeight:700, color:"#aaa", marginBottom:12, textTransform:"uppercase" as const, letterSpacing:.5 }}>Order Summary</p>
                        {[
                          { label:"Plan",     val: selectedPlan.name },
                          { label:"Period",   val: termsLabel },
                          { label:"Level",    val: levelDisplay },
                          { label:"Total",    val: fmt(totalAmt, selectedPlan.currency), bold:true, green:true },
                        ].map((r, i) => (
                          <div key={i} style={{ display:"flex", justifyContent:"space-between", marginBottom:i<3?9:0, paddingTop:i===3?10:0, borderTop:i===3?"1px dashed #ddd":"none" }}>
                            <span style={{ fontSize:13, color:"#999" }}>{r.label}</span>
                            <span style={{ fontSize:13, fontWeight:r.bold?800:500, color:r.green?"#064E3B":"#111" }}>{r.val}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* PAY BUTTON */}
                  <button
                    className="ep-pbtn"
                    type="button"
                    onClick={initiatePayment}
                    disabled={paying || !selectedPlan}
                  >
                    {paying
                      ? <><Loader2 style={{ width:20, height:20, animation:"spin .8s linear infinite" }}/> Processing…</>
                      : <><CreditCard size={20}/> Pay {selectedPlan ? fmt((() => { const ba=selectedPlan.amount; if(billingMode==="monthly") return ba; const st=selectedTerms[selectedPlan.id]??1; return ({1:ba*3,2:ba*6,3:Math.round(ba*9*0.9)} as Record<number,number>)[st]||ba*3; })(), selectedPlan.currency) : "—"}</>
                    }
                  </button>

                  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, fontSize:11, color:"#bbb" }}>
                    <Shield size={12}/> Secured by Paystack · SSL Encrypted
                  </div>
                </>
              )}
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
              {!loadingHistory && payments.length === 0 && (
                <div style={{ textAlign:"center" as const, padding:"32px 0" }}>
                  <Receipt style={{ width:38, height:38, margin:"0 auto 10px", color:"#ddd" }}/>
                  <p style={{ fontSize:14, color:"#aaa", margin:0 }}>No payments yet</p>
                  <p style={{ fontSize:12, color:"#ccc", margin:"4px 0 0" }}>Your payment history will appear here</p>
                </div>
              )}
              {payments.map(p => {
                const plan = plans.find(pl => pl.id === p.plan_id);
                return (
                  <div key={p.id} className="ep-hrow">
                    <div style={{ width:42, height:42, borderRadius:13, background:p.status==="success"?"#E8F5E9":"#FFEBEE", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      {p.status==="success" ? <CheckCircle2 size={18} color="#2E7D32"/> : <XCircle size={18} color="#C62828"/>}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontWeight:700, fontSize:14, color:"#111", margin:"0 0 2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                        {plan ? `📅 ${plan.name}` : "📅 Subscription Payment"}
                      </p>
                      <p style={{ fontSize:11, color:"#bbb", margin:0 }}>
                        {fmtDT(p.created_at)} {p.paystack_reference ? `· ${p.paystack_reference}` : ""}
                      </p>
                    </div>
                    <div style={{ textAlign:"right" as const, flexShrink:0 }}>
                      <p style={{ fontWeight:800, color:p.status==="success"?"#2E7D32":"#C62828", fontSize:14, margin:"0 0 4px" }}>
                        {fmt(p.amount, plan?.currency)}
                      </p>
                      <span className="ep-bdg" style={{ background:p.status==="success"?"#E8F5E9":"#FFEBEE", color:p.status==="success"?"#2E7D32":"#C62828" }}>
                        {p.status}
                      </span>
                      {p.status === "success" && (
                        <button
                          type="button"
                          onClick={() => downloadReceipt(p, plan)}
                          style={{ display:"block", marginTop:6, background:"none", border:"1px solid #075E54", color:"#075E54", borderRadius:8, padding:"3px 8px", fontSize:10, fontWeight:700, cursor:"pointer" }}>
                          ⬇ Receipt
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
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

              {profile && (
                <div>
                  {[
                    { icon:<BookOpen size={15}/>,   label:"Level",          val: levelDisplay },
                    { icon:<CreditCard size={15}/>, label:"Payment Status", val: (profile.payment_status || "unpaid").charAt(0).toUpperCase() + (profile.payment_status || "unpaid").slice(1) },
                    { icon:<Calendar size={15}/>,   label:"Active Until",   val: fmtDate(subEnd) },
                    { icon:<Clock size={15}/>,      label:"Joined",         val: fmtDate(profile.created_at) },
                  ].map((r, i, arr) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 4px", borderBottom:i<arr.length-1?"1px solid #f0f0f0":"none" }}>
                      <span style={{ color:"#075E54" }}>{r.icon}</span>
                      <span style={{ fontSize:13, color:"#aaa", minWidth:120 }}>{r.label}</span>
                      <span style={{ fontSize:13, fontWeight:600, color:"#222", marginLeft:"auto" }}>{r.val}</span>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <p style={{ fontSize:11, fontWeight:700, color:"#aaa", marginBottom:10, textTransform:"uppercase" as const, letterSpacing:.5 }}>Feature Access</p>
                {[
                  { name:"Dashboard Overview",   allowed: true },
                  { name:"Payment & Renewal",    allowed: true },
                  { name:"Al-Majlis Chat",       allowed: accStatus !== "locked" },
                  { name:"Course Lessons",       allowed: accStatus === "active" },
                  { name:"Al-Hifdh Tracker",     allowed: accStatus === "active" },
                  { name:"Assignments & Exams",  allowed: accStatus === "active" },
                  { name:"Live Sessions",        allowed: accStatus === "active" },
                  { name:"Al-Musabaqah Quiz",    allowed: accStatus === "active" },
                ].map((f, i, arr) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:i<arr.length-1?"1px solid #f6f6f6":"none" }}>
                    {f.allowed ? <CheckCircle2 size={16} color="#2E7D32"/> : <Lock size={16} color="#E74C3C"/>}
                    <span style={{ fontSize:13, color:f.allowed?"#222":"#bbb", flex:1 }}>{f.name}</span>
                    <span className="ep-bdg" style={{ background:f.allowed?"#E8F5E9":"#FFEBEE", color:f.allowed?"#2E7D32":"#C62828" }}>
                      {f.allowed ? "Unlocked" : "Locked"}
                    </span>
                  </div>
                ))}
              </div>

              {accStatus !== "active" && (
                <button className="ep-pbtn" type="button" onClick={() => setTab("pay")}>
                  <CreditCard size={18}/> {accStatus==="locked" ? "Renew Subscription" : "Make a Payment"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── ADMIN CONTROLS ── */}
        {isAdmin && profile && (
          <div className="ep-card" style={{ marginTop:14 }}>
            <div style={{ padding:"14px 18px", borderBottom:"1px solid #f0f0f0", display:"flex", alignItems:"center", gap:8 }}>
              <Shield size={16} color="#075E54"/>
              <span style={{ fontWeight:700, fontSize:14, color:"#333" }}>Admin Controls</span>
            </div>
            <div style={{ padding:"14px 18px", display:"flex", flexDirection:"column", gap:10 }}>
              <p style={{ fontSize:12, color:"#aaa", margin:0 }}>Manually manage this student's access:</p>
              <div style={{ display:"flex", gap:10 }}>
                <button type="button" onClick={async () => {
                  const end = new Date(); end.setMonth(end.getMonth() + 1);
                  await supabase.from("profiles").update({ payment_status:"paid", subscription_end_date:end.toISOString().split("T")[0] } as any).eq("user_id", user!.id);
                  await loadData(); toast({ title:"✅ 1 month access granted" });
                }} style={{ flex:1, padding:"11px 8px", background:"#E8F5E9", color:"#2E7D32", border:"1.5px solid #A5D6A7", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13 }}>
                  <Unlock size={13} style={{ display:"inline", marginRight:5 }}/>Grant 1 Month
                </button>
                <button type="button" onClick={async () => {
                  await supabase.from("profiles").update({ payment_status:"unpaid" } as any).eq("user_id", user!.id);
                  await loadData(); toast({ title:"🔒 Access locked" });
                }} style={{ flex:1, padding:"11px 8px", background:"#FFEBEE", color:"#C62828", border:"1.5px solid #EF9A9A", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13 }}>
                  <Lock size={13} style={{ display:"inline", marginRight:5 }}/>Lock Access
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnrollmentPayment;
