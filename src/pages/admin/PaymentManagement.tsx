import { useState, useEffect, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademicLevels, getLevelConfig, getLevelDisplay } from "@/hooks/useAcademicLevels";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  DollarSign, Users, AlertTriangle, TrendingUp, Download,
  CreditCard, Search, Bell, Plus, Pencil, Trash2,
  CheckCircle, XCircle, Clock, ChevronDown, ChevronUp,
  GraduationCap, Filter, RefreshCw, Send
} from "lucide-react";
import { format } from "date-fns";

const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c", BORDER = "rgba(15,45,31,0.12)";
const isMob = () => window.innerWidth < 640;

const EMPTY_PLAN = {
  name: "", name_ar: "", description: "", description_ar: "",
  amount: 0, currency: "NGN", type: "term", level: "all",
  duration_months: 3, is_active: true, paystack_plan_code: "",
};

const STATUS_CFG: Record<string, { label: string; bg: string; color: string; icon: any }> = {
  paid:    { label: "Paid",    bg: "#f0fff4", color: "#22c55e", icon: CheckCircle },
  unpaid:  { label: "Unpaid",  bg: "#fff5f5", color: "#ef4444", icon: XCircle },
  grace:   { label: "Grace",   bg: "#fffbeb", color: "#f59e0b", icon: Clock },
  exempt:  { label: "Exempt",  bg: "#f0f9ff", color: "#3b82f6", icon: GraduationCap },
};

const fmtAmt = (amt: number, currency = "NGN") => {
  const sym = { NGN:"₦", USD:"$", GBP:"£", SAR:"﷼" }[currency] || "₦";
  return `${sym}${(amt||0).toLocaleString()}`;
};

// ── Stat Card ─────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, sub, color, bg }: any) => (
  <div style={{ background:"#fff", borderRadius:16, padding:"16px 18px", border:`1px solid ${BORDER}`, boxShadow:"0 2px 8px rgba(0,0,0,.05)", display:"flex", alignItems:"center", gap:14, transition:"box-shadow .15s,transform .15s" }}
    onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.boxShadow="0 4px 16px rgba(0,0,0,.12)";(e.currentTarget as HTMLDivElement).style.transform="translateY(-1px)";}}
    onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.boxShadow="0 2px 8px rgba(0,0,0,.05)";(e.currentTarget as HTMLDivElement).style.transform="translateY(0)";}}>
    <div style={{ width:46, height:46, borderRadius:14, background:bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
      <Icon style={{ width:22, height:22, color }} />
    </div>
    <div style={{ minWidth:0 }}>
      <div style={{ fontSize:11, color:"#7a9e88", fontWeight:600, marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:900, color:G, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:"#7a9e88", marginTop:2 }}>{sub}</div>}
    </div>
  </div>
);

// ── Status Pill ───────────────────────────────────────────────
const StatusPill = ({ status, exempt }: { status: string; exempt?: boolean }) => {
  const key = exempt ? "exempt" : (status || "unpaid");
  const cfg = STATUS_CFG[key] || STATUS_CFG.unpaid;
  const Icon = cfg.icon;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 10px", borderRadius:20, background:cfg.bg, color:cfg.color, fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>
      <Icon style={{ width:10, height:10 }} />{cfg.label}
    </span>
  );
};

const PaymentManagement = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { data: academicLevels = [] } = useAcademicLevels();

  const [payments, setPayments]         = useState<any[]>([]);
  const [plans, setPlans]               = useState<any[]>([]);
  const [students, setStudents]         = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [stats, setStats]               = useState({ totalMonth:0, totalAll:0, active:0, unpaid:0, expiring:0, failed:0, totalUSD:0, totalGBP:0, totalSAR:0, intlCount:0 });
  const [intlRegion, setIntlRegion]     = useState("all"); // filter for international tab
  const [filter, setFilter]             = useState("all");
  const [search, setSearch]             = useState("");
  const [activeTab, setActiveTab]       = useState<"students"|"transactions"|"plans"|"international">("students");
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [syncing, setSyncing]           = useState(false);
  const [syncResult, setSyncResult]     = useState<{synced:number;failed:number;total:number}|null>(null);

  // Manual payment dialog
  const [manualOpen, setManualOpen]     = useState(false);
  const [manualForm, setManualForm]     = useState({ student_id:"", plan_id:"", amount:0, method:"bank_transfer", notes:"", date:new Date().toISOString().split("T")[0] });
  const [manualLoading, setManualLoading] = useState(false);

  // Plan dialog
  const [planOpen, setPlanOpen]         = useState(false);
  const [editingPlan, setEditingPlan]   = useState<any>(null);
  const [planForm, setPlanForm]         = useState<any>({ ...EMPTY_PLAN });
  const [planLoading, setPlanLoading]   = useState(false);

  // Transaction expand
  const [expandedTx, setExpandedTx]     = useState<string|null>(null);

  // Grace period dialog
  const [graceOpen, setGraceOpen]       = useState(false);
  const [graceStudent, setGraceStudent] = useState<any>(null);
  const [graceForm, setGraceForm]       = useState({ days: 7, notes: "" });
  const [graceLoading, setGraceLoading] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    const [pr, plr, sr, subr] = await Promise.all([
      supabase.from("payments" as any).select("*").order("created_at", { ascending:false }),
      supabase.from("payment_plans" as any).select("*").order("amount"),
      (supabase as any).from("profiles").select("*").eq("role", "student").order("full_name"),
      supabase.from("student_subscriptions" as any).select("*"),
    ]);

    const pay  = (pr.data  || []) as any[];
    const pln  = (plr.data || []) as any[];
    const stu  = (sr.data  || []) as any[];
    const sub  = (subr.data|| []) as any[];

    setPayments(pay); setPlans(pln); setStudents(stu); setSubscriptions(sub);

    const now       = new Date();
    const monthStart= new Date(now.getFullYear(), now.getMonth(), 1);
    const week7     = new Date(now.getTime() + 7*86400000);
    const success   = pay.filter((p:any) => p.status === "success");
    const thisMonth = success.filter((p:any) => new Date(p.paid_at||p.created_at) >= monthStart);

    // Per-currency totals — join with plan to get currency
    const getPayCurrency = (p:any) => pln.find((pl:any)=>pl.id===p.plan_id)?.currency || "NGN";
    const usdPay  = success.filter((p:any) => getPayCurrency(p)==="USD");
    const gbpPay  = success.filter((p:any) => getPayCurrency(p)==="GBP");
    const sarPay  = success.filter((p:any) => getPayCurrency(p)==="SAR");
    const intlPay = success.filter((p:any) => getPayCurrency(p)!=="NGN");

    setStats({
      totalMonth: thisMonth.filter((p:any)=>getPayCurrency(p)==="NGN").reduce((s:number,p:any)=>s+(p.amount||0),0),
      totalAll:   success.filter((p:any)=>getPayCurrency(p)==="NGN").reduce((s:number,p:any)=>s+(p.amount||0),0),
      active:     sub.filter((s:any) => s.status==="active").length,
      unpaid:     stu.filter((s:any) => !s.payment_status||s.payment_status==="unpaid").length,
      expiring:   sub.filter((s:any) => s.end_date && new Date(s.end_date)<=week7 && s.status==="active").length,
      failed:     pay.filter((p:any) => p.status==="failed").length,
      totalUSD:   usdPay.reduce((s:number,p:any)=>s+(p.amount||0),0),
      totalGBP:   gbpPay.reduce((s:number,p:any)=>s+(p.amount||0),0),
      totalSAR:   sarPay.reduce((s:number,p:any)=>s+(p.amount||0),0),
      intlCount:  intlPay.length,
    });

    setLoading(false); setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, []);

  // ── Realtime: auto-refresh when a payment is confirmed ───────
  // Listens to payments, profiles (payment_status), and student_subscriptions.
  // When the Paystack webhook fires and updates any of these, the admin page
  // refreshes silently — no manual reload needed.
  useEffect(() => {
    const channel = supabase
      .channel("admin-payment-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" },
        (payload: any) => {
          // Show a toast when a payment is confirmed so the admin knows immediately
          if (payload.eventType === "UPDATE" && payload.new?.status === "success" && payload.old?.status !== "success") {
            toast({ title: "✅ Payment Confirmed", description: `Reference: ${payload.new.paystack_reference || "—"}` });
          } else if (payload.eventType === "INSERT" && payload.new?.status === "success") {
            toast({ title: "✅ New Payment Received", description: `Reference: ${payload.new.paystack_reference || "—"}` });
          }
          loadData(true);
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles",
          filter: "role=eq.student" },
        () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "student_subscriptions" },
        () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "enrollments" },
        () => loadData(true))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  // ── Record manual payment ───────────────────────────────────
  const recordManual = async () => {
    if (!manualForm.student_id || !manualForm.plan_id || !manualForm.amount) {
      toast({ title: t("Fill all required fields","امل جميع الحقول المطلوبة"), variant:"destructive" }); return;
    }
    setManualLoading(true);
    const plan = plans.find((p:any) => p.id === manualForm.plan_id);
    const ref  = `TAH-MANUAL-${Date.now()}`;
    // Term = exactly 3 months; monthly = 1 month; fall back to plan.duration_months
    const durationMonths = plan?.type === "term" ? 3 : plan?.type === "monthly" ? 1 : (plan?.duration_months || 3);
    const endDate = new Date(manualForm.date);
    endDate.setMonth(endDate.getMonth() + durationMonths);
    const endStr = endDate.toISOString().split("T")[0];

    await Promise.all([
      supabase.from("payments" as any).insert({
        student_id:manualForm.student_id, plan_id:manualForm.plan_id,
        amount:manualForm.amount, status:"success", type:"manual",
        paystack_reference:ref, payment_method:manualForm.method,
        paid_at:manualForm.date, notes:manualForm.notes, recorded_by:user!.id,
      }),
      supabase.from("profiles").update({ payment_status:"paid", subscription_end_date:endStr } as any).eq("user_id",manualForm.student_id),
      supabase.from("student_subscriptions" as any).insert({
        student_id:manualForm.student_id, plan_id:manualForm.plan_id,
        status:"active", start_date:manualForm.date, end_date:endStr,
      }),
    ]);

    toast({ title: t("Payment recorded ✅","تم تسجيل الدفعة ✅") });
    setManualOpen(false);
    setManualForm({ student_id:"", plan_id:"", amount:0, method:"bank_transfer", notes:"", date:new Date().toISOString().split("T")[0] });
    loadData(true);
    setManualLoading(false);
  };

  // ── Toggle exempt ───────────────────────────────────────────
  const toggleExempt = async (studentId: string, exempt: boolean) => {
    await supabase.from("profiles").update({ is_payment_exempt:exempt, payment_status:exempt?"exempt":"unpaid" } as any).eq("user_id",studentId);
    toast({ title: exempt ? t("Marked as exempt 🎓","تم وضع علامة كمعفى 🎓") : t("Exemption removed","تمت إزالة الإعفاء") });
    loadData(true);
  };

  // ── Grant grace period ──────────────────────────────────────────────────
  const grantGrace = async () => {
    if (!graceStudent) return;
    setGraceLoading(true);
    const now = new Date();
    const graceEnd = new Date(now.getTime() + graceForm.days * 86400000);
    const endStr = graceEnd.toISOString().split("T")[0];

    await Promise.all([
      supabase.from("profiles").update({ payment_status:"grace", subscription_end_date:endStr } as any).eq("user_id",graceStudent.user_id),
      supabase.from("notifications" as any).insert({
        user_id:  graceStudent.user_id,
        title:    t("Grace Period Granted 🕐","تم منح فترة سماح 🕐"),
        message:  t(
          `You have been granted a ${graceForm.days}-day grace period until ${format(graceEnd,"d MMM yyyy")}. Please complete your payment before then to retain full access.`,
          `لقد مُنحت فترة سماح مدتها ${graceForm.days} يومًا حتى ${format(graceEnd,"d MMM yyyy")}. يرجى إتمام الدفع قبل ذلك للحفاظ على وصولك الكامل.`
        ),
        type: "info",
        link: "/student/enrollment-payment",
        is_read: false,
      }),
      supabase.from("activity_logs").insert({
        user_id:     user!.id,
        action:      "grace_period_granted",
        entity_type: "profile",
        entity_id:   graceStudent.user_id,
        metadata: { student_name:graceStudent.full_name, days:graceForm.days, until:endStr, notes:graceForm.notes },
      }),
    ]);

    toast({ title: t(`✅ Grace period granted to ${graceStudent.full_name}`,`✅ تم منح فترة سماح لـ ${graceStudent.full_name}`), description: t(`${graceForm.days} days until ${format(graceEnd,"d MMM yyyy")}`,`${graceForm.days} أيام حتى ${format(graceEnd,"d MMM yyyy")}`) });
    setGraceOpen(false);
    setGraceStudent(null);
    setGraceForm({ days:7, notes:"" });
    loadData(true);
    setGraceLoading(false);
  };

  // ── Send reminder ─────────────────────────────────────────────────────────
  // Writes a real notification row for the student (appears in their bell icon)
  // and also logs the admin action in activity_logs for audit trail.
  const sendReminder = async (student: any) => {
    if (!student.user_id) {
      toast({ title: t("Cannot send — student has no user ID","لا يمكن الإرسال — لا يوجد معرّف للطالب"), variant:"destructive" });
      return;
    }

    // Find the student subscription to include plan/amount info in the message
    const sub  = subscriptions.find((s:any) => s.student_id === student.user_id);
    const plan = sub ? plans.find((p:any) => p.id === sub.plan_id) : null;
    const amtText = plan ? ` (${fmtAmt(plan.amount, plan.currency)} — ${plan.name})` : "";
    const dueText = sub?.end_date
      ? ` Due: ${format(new Date(sub.end_date), "d MMM yyyy")}.`
      : "";

    const [notifResult] = await Promise.all([
      // ✅ Real in-app notification the student sees in their bell icon
      supabase.from("notifications" as any).insert({
        user_id:  student.user_id,
        title:    t("Payment Reminder 💳","تذكير بالدفع 💳"),
        message:  t(
          `Your subscription payment is due${amtText}.${dueText} Please visit the Payment page to renew and keep full access to all features.`,
          `رسوم اشتراكك مستحقة${amtText}.${dueText} يرجى الانتقال إلى صفحة الدفع للتجديد والحفاظ على الوصول الكامل.`
        ),
        type:    "info",
        link:    "/student/enrollment-payment",
        is_read: false,
      }),

      // Audit log — admin action record
      supabase.from("activity_logs").insert({
        user_id:     user!.id,
        action:      "payment_reminder_sent",
        entity_type: "profile",
        entity_id:   student.user_id,
        metadata: {
          student_name: student.full_name,
          email:        student.email,
          amount:       plan?.amount,
          plan_name:    plan?.name,
        },
      }),
    ]);

    if (notifResult.error) {
      toast({
        title:       t("Failed to send reminder","فشل إرسال التذكير"),
        description: notifResult.error.message,
        variant:     "destructive",
      });
      return;
    }

    toast({
      title:       t(`✅ Reminder sent to ${student.full_name}`,`✅ تم إرسال تذكير إلى ${student.full_name}`),
      description: t("Student will see it in their notification bell","سيرى الطالب الإشعار في جرس الإشعارات"),
    });
  };

  // ── Save plan ───────────────────────────────────────────────
  const savePlan = async () => {
    if (!planForm.name || !planForm.amount) {
      toast({ title: t("Name and amount required","الاسم والمبلغ مطلوبان"), variant:"destructive" }); return;
    }
    setPlanLoading(true);
    const payload = {
      name:planForm.name, name_ar:planForm.name_ar||null,
      description:planForm.description||null, description_ar:planForm.description_ar||null,
      amount:Number(planForm.amount), currency:planForm.currency,
      type:planForm.type, level:planForm.level==="all"?null:planForm.level,
      duration_months:Number(planForm.duration_months)||null,
      is_active:planForm.is_active, paystack_plan_code:planForm.paystack_plan_code||null,
    };
    if (editingPlan) {
      await supabase.from("payment_plans" as any).update(payload as any).eq("id",editingPlan.id);
      toast({ title: t("Plan updated ✅","تم تحديث الخطة ✅") });
    } else {
      await supabase.from("payment_plans" as any).insert(payload as any);
      toast({ title: t("Plan created ✅","تم إنشاء الخطة ✅") });
    }
    setPlanOpen(false); setPlanLoading(false); loadData(true);
  };

  const deletePlan = async (id: string) => {
    if (!confirm(t("Delete this plan?","حذف هذه الخطة?"))) return;
    await supabase.from("payment_plans" as any).delete().eq("id",id);
    toast({ title: t("Plan deleted","تم حذف الخطة") });
    loadData(true);
  };

  // ── Sync pending payments from Paystack ────────────────────
  const syncFromPaystack = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("paystack-sync", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const result = res.data as any;
      setSyncResult({ synced: result?.synced ?? 0, failed: result?.failed ?? 0, total: result?.total ?? 0 });
      if ((result?.synced ?? 0) > 0) {
        toast({ title: `✅ Synced ${result.synced} payment${result.synced !== 1 ? "s" : ""} from Paystack` });
        loadData(true);
      } else {
        toast({ title: t("No pending payments found", "لا توجد مدفوعات معلقة") });
      }
    } catch (e: any) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    }
    setSyncing(false);
  };

  // ── Export CSV ──────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [
      "Date,Student,Plan,Amount,Currency,Status,Method,Reference",
      ...payments.map((p:any) => {
        const s = students.find((x:any) => x.user_id===p.student_id);
        const pl= plans.find((x:any)   => x.id===p.plan_id);
        return [
          p.paid_at||p.created_at, s?.full_name||"", pl?.name||"",
          p.amount, pl?.currency||"NGN", p.status, p.payment_method||"", p.paystack_reference||""
        ].join(",");
      })
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows], { type:"text/csv" }));
    a.download = `payments-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const filtered = students.filter((s:any) => {
    const matchS = !search || (s.full_name||"").toLowerCase().includes(search.toLowerCase()) || (s.email||"").toLowerCase().includes(search.toLowerCase());
    const st = s.is_payment_exempt ? "exempt" : (s.payment_status||"unpaid");
    const matchF = filter==="all" || st===filter;
    return matchS && matchF;
  });

  // Input style helper
  const inp: React.CSSProperties = { width:"100%", padding:"9px 12px", borderRadius:10, border:`1.5px solid ${BORDER}`, fontSize:14, outline:"none", color:G, background:"#f8fafb", fontFamily:"'Cairo',sans-serif", boxSizing:"border-box" };
  const lbl: React.CSSProperties = { fontSize:12, fontWeight:700, color:G, display:"block", marginBottom:5 };

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"60vh" }}>
      <div style={{ width:40, height:40, border:`4px solid ${G}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ padding:"16px", maxWidth:1200, margin:"0 auto", fontFamily:"'Cairo',sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,textarea:focus,select:focus{border-color:${GM}!important;box-shadow:0 0 0 3px ${GM}22}`}</style>

      {/* ── PAGE HEADER ── */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:900, color:G, margin:0 }}>{t("Payment Management","إدارة المدفوعات")}</h1>
          <p style={{ fontSize:12, color:"#7a9e88", marginTop:2 }}>{t("Track fees, subscriptions and student payment status","تتبع الرسوم والاشتراكات وحالة دفع الطلاب")}</p>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button onClick={()=>loadData(true)} style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 12px", borderRadius:10, background:"#f8fafb", border:`1px solid ${BORDER}`, color:G, fontSize:12, fontWeight:600, cursor:"pointer" }}>
            <RefreshCw style={{ width:13, height:13, animation:refreshing?"spin .8s linear infinite":"none" }} />
            {t("Refresh","تحديث")}
          </button>
          <button onClick={syncFromPaystack} disabled={syncing} title="Verify pending payments against Paystack API and update student statuses"
            style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 12px", borderRadius:10, background:syncing?"#f0fff4":"#ecfdf5", border:"1px solid rgba(34,197,94,.3)", color:"#16a34a", fontSize:12, fontWeight:700, cursor:syncing?"wait":"pointer", opacity:syncing?.7:1 }}>
            <RefreshCw style={{ width:13, height:13, animation:syncing?"spin .8s linear infinite":"none", color:"#16a34a" }} />
            {syncing ? t("Syncing…","جارٍ المزامنة…") : t("Sync Paystack","مزامنة Paystack")}
          </button>
          <button onClick={exportCSV} style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 12px", borderRadius:10, background:"#f8fafb", border:`1px solid ${BORDER}`, color:G, fontSize:12, fontWeight:600, cursor:"pointer" }}>
            <Download style={{ width:13, height:13 }} />{t("Export","تصدير")}
          </button>
          <button onClick={()=>{setManualOpen(true);}}
            style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", borderRadius:10, background:G, border:"none", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
            <Plus style={{ width:13, height:13 }} />{t("Record Payment","تسجيل دفعة")}
          </button>
        </div>
      </div>

      {/* ── PAYSTACK AUTO-SYNC NOTICE ── */}
      <div style={{ background:"linear-gradient(135deg,#f0fff4,#ecfdf5)", border:`1px solid rgba(34,197,94,.2)`, borderRadius:14, padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"flex-start", gap:12 }}>
        <div style={{ fontSize:22, flexShrink:0 }}>⚡</div>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:G }}>Paystack Auto-Sync Active</div>
          <div style={{ fontSize:12, color:"#7a9e88", marginTop:2, lineHeight:1.5 }}>
            Payments made via Paystack are automatically recorded and subscriptions extended based on the plan duration.
            Webhook endpoint: <span style={{ fontFamily:"monospace", fontSize:11, background:"rgba(0,0,0,.06)", padding:"1px 6px", borderRadius:4 }}>supabase/functions/paystack-webhook</span>
          </div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:10, marginBottom:12 }}>
        <div onClick={()=>{ setActiveTab("students"); setFilter("all"); }} style={{ cursor:"pointer" }}>
          <StatCard icon={TrendingUp}     label={t("NGN This Month","هذا الشهر ₦")}  value={fmtAmt(stats.totalMonth)} sub={t("Nigeria Revenue","إيرادات نيجيريا")} color="#22c55e" bg="#f0fff4" />
        </div>
        <div onClick={()=>setActiveTab("transactions")} style={{ cursor:"pointer" }}>
          <StatCard icon={DollarSign}     label={t("NGN All Time","إجمالي ₦")}       value={fmtAmt(stats.totalAll)}   sub={t("Total NGN","إجمالي نيرا")}           color="#3b82f6" bg="#eff6ff" />
        </div>
        <div onClick={()=>setActiveTab("students")} style={{ cursor:"pointer" }}>
          <StatCard icon={Users}          label={t("Active Subs","اشتراكات نشطة")}   value={stats.active}             sub={t("Subscriptions","اشتراكات")}          color="#8b5cf6" bg="#f5f3ff" />
        </div>
        <div onClick={()=>{ setActiveTab("students"); setFilter("unpaid"); }} style={{ cursor:"pointer" }}>
          <StatCard icon={AlertTriangle}  label={t("Unpaid","غير مدفوع")}            value={stats.unpaid}             sub={t("Students","طلاب")}                   color="#ef4444" bg="#fff5f5" />
        </div>
        <div onClick={()=>{ setActiveTab("students"); setFilter("grace"); }} style={{ cursor:"pointer" }}>
          <StatCard icon={Bell}           label={t("Expiring","تنتهي قريباً")}       value={stats.expiring}           sub={t("Within 7 days","خلال 7 أيام")}       color="#f59e0b" bg="#fffbeb" />
        </div>
        <div onClick={()=>setActiveTab("transactions")} style={{ cursor:"pointer" }}>
          <StatCard icon={CreditCard}     label={t("Failed","فاشلة")}                value={stats.failed}             sub={t("Transactions","معاملات")}            color="#ef4444" bg="#fff5f5" />
        </div>
      </div>

      {/* ── INTERNATIONAL REVENUE STRIP ── */}
      {(stats.totalUSD > 0 || stats.totalGBP > 0 || stats.totalSAR > 0 || stats.intlCount > 0) && (
        <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
          {/* Strip header */}
          <div style={{ width:"100%", display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <div style={{ height:1, flex:1, background:BORDER }} />
            <span style={{ fontSize:11, fontWeight:700, color:"#7a9e88", letterSpacing:1 }}>🌍 INTERNATIONAL PAYMENTS</span>
            <div style={{ height:1, flex:1, background:BORDER }} />
          </div>
          {stats.totalUSD > 0 && <StatCard icon={DollarSign} label="USD Collected" value={`$${stats.totalUSD.toLocaleString()}`} sub="United States Dollar" color="#2563eb" bg="#eff6ff" />}
          {stats.totalGBP > 0 && <StatCard icon={DollarSign} label="GBP Collected" value={`£${stats.totalGBP.toLocaleString()}`} sub="British Pound" color="#7c3aed" bg="#f5f3ff" />}
          {stats.totalSAR > 0 && <StatCard icon={DollarSign} label="SAR Collected" value={`﷼${stats.totalSAR.toLocaleString()}`} sub="Saudi Riyal" color="#d97706" bg="#fffbeb" />}
          <StatCard icon={Users} label="Intl Transactions" value={stats.intlCount} sub="Non-NGN payments" color="#0891b2" bg="#ecfeff" />
        </div>
      )}

      {/* ── TABS ── */}
      <div style={{ background:"#fff", borderRadius:18, border:`1px solid ${BORDER}`, boxShadow:"0 2px 12px rgba(0,0,0,.06)", overflow:"hidden" }}>
        {/* Tab bar — horizontally scrollable on mobile */}
        <div style={{ display:"flex", borderBottom:`1px solid ${BORDER}`, background:"#fafafa", overflowX:"auto", WebkitOverflowScrolling:"touch" as any }}>
          {([
            ["students",      t("Students","الطلاب"),           Users],
            ["transactions",  t("Transactions","المعاملات"),    CreditCard],
            ["international", t("International","دولي"),        DollarSign],
            ["plans",         t("Plans","خطط الدفع"),           TrendingUp],
          ] as any[]).map(([key, label, Icon]) => (
            <button key={key} onClick={()=>setActiveTab(key)}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"13px 16px", background:"none", border:"none",
                borderBottom:`3px solid ${activeTab===key?GOLD:"transparent"}`,
                color:activeTab===key?G:"#7a9e88", fontSize:13, fontWeight:activeTab===key?800:500, cursor:"pointer", transition:"all .15s",
                position:"relative", whiteSpace:"nowrap", flexShrink:0 }}>
              <Icon style={{ width:14, height:14 }} />{label}
              {key==="international" && stats.intlCount > 0 && (
                <span style={{ marginLeft:4, background:GOLD, color:"#fff", fontSize:9, fontWeight:900, borderRadius:10, padding:"1px 6px" }}>
                  {stats.intlCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── STUDENTS TAB ── */}
        {activeTab==="students" && (
          <div style={{ padding:18 }}>
            {/* Search + filter */}
            <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
              <div style={{ position:"relative", flex:1, minWidth:180 }}>
                <Search style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", width:14, height:14, color:"#7a9e88" }} />
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("Search students…","بحث عن طالب…")}
                  style={{ ...inp, paddingLeft:34 }} />
              </div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {["all","paid","unpaid","grace","exempt"].map(f => (
                  <button key={f} onClick={()=>setFilter(f)}
                    style={{ padding:"7px 12px", borderRadius:20, border:`1.5px solid ${filter===f?G:BORDER}`, background:filter===f?G:"#fff", color:filter===f?"#fff":G, fontSize:12, fontWeight:filter===f?700:500, cursor:"pointer", transition:"all .15s", textTransform:"capitalize" }}>
                    {f==="all"?t("All","الكل"):f}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ fontSize:12, color:"#7a9e88", marginBottom:10 }}>
              {t("Showing","عرض")} <strong style={{ color:G }}>{filtered.length}</strong> {t("of","من")} {students.length} {t("students","طلاب")}
            </div>

            {/* Mobile: card list | Desktop: table */}
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {filtered.length===0 ? (
                <div style={{ padding:"40px 20px", textAlign:"center", color:"#7a9e88", fontSize:14 }}>
                  {t("No students found","لا يوجد طلاب")}
                </div>
              ) : filtered.map((s:any) => {
                const sub = subscriptions.find((x:any) => x.student_id===s.user_id);
                return (
                  <div key={s.user_id} style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:14, padding:"14px 16px", display:"flex", flexDirection:"column", gap:10, boxShadow:"0 1px 4px rgba(0,0,0,.04)" }}>
                    {/* Top row */}
                    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:15, fontWeight:700, color:G, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.full_name||"—"}</div>
                        <div style={{ fontSize:11, color:"#7a9e88", marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.email}</div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                        <StatusPill status={s.payment_status} exempt={s.is_payment_exempt} />
                      </div>
                    </div>
                    {/* Middle row */}
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                      {s.level && (
                        <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"rgba(15,45,31,.08)", color:G, fontWeight:600 }}>
                          {s.level}
                        </span>
                      )}
                      {s.subscription_end_date && (
                        <span style={{ fontSize:11, color: new Date(s.subscription_end_date)<new Date() ? "#ef4444" : "#7a9e88" }}>
                          {new Date(s.subscription_end_date)<new Date() ? "⚠️ Expired" : "✅ Until"} {format(new Date(s.subscription_end_date),"dd MMM yyyy")}
                        </span>
                      )}
                      {sub && (
                        <span style={{ fontSize:11, color:"#7a9e88" }}>
                          Sub: {sub.status}
                        </span>
                      )}
                    </div>
                    {/* Actions row */}
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      <button onClick={()=>{ setManualForm(f=>({...f,student_id:s.user_id})); setManualOpen(true); }}
                        style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", borderRadius:10, background:G, border:"none", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", flex:1, justifyContent:"center" }}>
                        <DollarSign style={{ width:13, height:13 }} />{t("Record Payment","تسجيل دفعة")}
                      </button>
                      {(!s.is_payment_exempt && (s.payment_status==="unpaid"||!s.payment_status||s.payment_status==="grace")) && (
                        <button onClick={()=>{ setGraceStudent(s); setGraceForm({ days:7, notes:"" }); setGraceOpen(true); }}
                          style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", borderRadius:10, background:"#f0fff4", border:`1px solid #86efac`, color:"#15803d", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                          <Clock style={{ width:12, height:12 }} />{t("Grace","سماح")}
                        </button>
                      )}
                      {(!s.is_payment_exempt && (s.payment_status==="unpaid"||!s.payment_status)) && (
                        <button onClick={()=>sendReminder(s)}
                          style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", borderRadius:10, background:"#fffbeb", border:`1px solid ${GOLD}`, color:"#92400e", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                          <Bell style={{ width:12, height:12 }} />{t("Remind","تذكير")}
                        </button>
                      )}
                      <button onClick={()=>toggleExempt(s.user_id,!s.is_payment_exempt)}
                        title={s.is_payment_exempt?t("Remove exemption","إزالة الإعفاء"):t("Mark exempt","وضع علامة كمعفى")}
                        style={{ padding:"8px 12px", borderRadius:10, background:s.is_payment_exempt?"#fff5f5":"#f0f9ff", border:`1px solid ${s.is_payment_exempt?"#fca5a5":"#93c5fd"}`, color:s.is_payment_exempt?"#ef4444":"#3b82f6", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
                        <GraduationCap style={{ width:13, height:13 }} />{s.is_payment_exempt?"Unexempt":"Exempt"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TRANSACTIONS TAB ── */}
        {activeTab==="transactions" && (
          <div style={{ padding:18 }}>
            <div style={{ fontSize:12, color:"#7a9e88", marginBottom:12 }}>
              {payments.length} {t("transactions total","معاملة إجمالاً")} — {payments.filter((p:any)=>p.status==="success").length} {t("successful","ناجحة")}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {payments.length===0 ? (
                <div style={{ padding:"40px 20px", textAlign:"center", color:"#7a9e88" }}>{t("No transactions yet","لا توجد معاملات")}</div>
              ) : payments.map((p:any) => {
                const stu  = students.find((s:any)=>s.user_id===p.student_id);
                const plan = plans.find((pl:any)=>pl.id===p.plan_id);
                const isExpanded = expandedTx===p.id;
                return (
                  <div key={p.id} style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:14, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.04)" }}>
                    <div style={{ padding:"14px 16px", cursor:"pointer" }} onClick={()=>setExpandedTx(isExpanded?null:p.id)}>
                      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:700, color:G, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{stu?.full_name||"—"}</div>
                          {plan && <div style={{ fontSize:11, color:"#7a9e88" }}>{plan.name}</div>}
                          <div style={{ fontSize:11, color:"#7a9e88", marginTop:2 }}>{format(new Date(p.paid_at||p.created_at),"dd MMM yyyy")}</div>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
                          <span style={{ fontSize:16, fontWeight:900, color:G }}>{fmtAmt(p.amount, plan?.currency)}</span>
                          <StatusPill status={p.status==="success"?"paid":p.status==="failed"?"unpaid":"grace"} />
                        </div>
                        {isExpanded?<ChevronUp style={{width:14,height:14,color:"#7a9e88",alignSelf:"center"}}/>:<ChevronDown style={{width:14,height:14,color:"#7a9e88",alignSelf:"center"}}/>}
                      </div>
                    </div>
                    {isExpanded && (
                      <div style={{ padding:"12px 16px 14px", background:"#f8fafb", borderTop:`1px solid ${BORDER}` }}>
                        <div style={{ display:"flex", flexDirection:"column", gap:6, fontSize:12, color:"#7a9e88" }}>
                          <div><strong style={{ color:G }}>Method:</strong> {p.payment_method||"—"}</div>
                          {p.notes && <div><strong style={{ color:G }}>Notes:</strong> {p.notes}</div>}
                          {p.type && <div><strong style={{ color:G }}>Type:</strong> {p.type}</div>}
                          <div><strong style={{ color:G }}>Reference:</strong> <span style={{fontFamily:"monospace"}}>{p.paystack_reference||"—"}</span></div>
                          <div><strong style={{ color:G }}>Created:</strong> {format(new Date(p.created_at),"dd MMM yyyy HH:mm")}</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── INTERNATIONAL TAB ── */}
        {activeTab==="international" && (
          <div style={{ padding:18 }}>
            {/* Currency summary cards */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12, marginBottom:20 }}>
              {[
                { currency:"USD", sym:"$", label:"US Dollar", flag:"🇺🇸", color:"#2563eb", bg:"#eff6ff" },
                { currency:"GBP", sym:"£", label:"British Pound", flag:"🇬🇧", color:"#7c3aed", bg:"#f5f3ff" },
                { currency:"SAR", sym:"﷼", label:"Saudi Riyal", flag:"🇸🇦", color:"#d97706", bg:"#fffbeb" },
                { currency:"EUR", sym:"€", label:"Euro", flag:"🇪🇺", color:"#059669", bg:"#ecfdf5" },
              ].map(({ currency, sym, label, flag, color, bg }) => {
                const currPay = payments.filter((p:any) => {
                  const plan = plans.find((pl:any) => pl.id===p.plan_id);
                  return plan?.currency===currency && p.status==="success";
                });
                const total = currPay.reduce((s:number,p:any)=>s+(p.amount||0),0);
                const intlPlans = plans.filter((pl:any)=>pl.currency===currency);
                return (
                  <div key={currency} style={{ background:"#fff", borderRadius:16, border:`1.5px solid ${total>0?color+"44":BORDER}`, padding:"16px", cursor:"pointer",
                    boxShadow: total>0?"0 2px 12px rgba(0,0,0,.06)":"none",
                    opacity: intlPlans.length===0?.5:1 }}
                    onClick={()=>setIntlRegion(intlRegion===currency?"all":currency)}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                      <span style={{ fontSize:22 }}>{flag}</span>
                      <div>
                        <div style={{ fontSize:13, fontWeight:800, color:G }}>{label}</div>
                        <div style={{ fontSize:10, color:"#7a9e88" }}>{currency}</div>
                      </div>
                      {intlRegion===currency && <div style={{ marginLeft:"auto", width:8, height:8, borderRadius:"50%", background:color }} />}
                    </div>
                    <div style={{ fontSize:26, fontWeight:900, color: total>0?color:"#9ca3af" }}>
                      {sym}{total.toLocaleString()}
                    </div>
                    <div style={{ fontSize:11, color:"#7a9e88", marginTop:4 }}>
                      {currPay.length} {t("payments","دفعات")} · {intlPlans.length} {t("plans","خطط")}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add international plan shortcut */}
            <div style={{ background:"linear-gradient(135deg,#1e3a5f,#1e3a8a)", borderRadius:14, padding:"16px 20px", marginBottom:20, display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ fontSize:32 }}>🌍</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:800, color:"#fff" }}>{t("Add International Payment Plan","إضافة خطة دفع دولية")}</div>
                <div style={{ fontSize:12, color:"rgba(255,255,255,.65)", marginTop:2 }}>{t("Create USD, GBP or SAR plans for international students","أنشئ خططاً بالدولار أو الجنيه أو الريال للطلاب الدوليين")}</div>
              </div>
              <button onClick={()=>{ setPlanForm({...EMPTY_PLAN, currency:"USD"}); setEditingPlan(null); setPlanOpen(true); setActiveTab("plans"); }}
                style={{ padding:"9px 18px", borderRadius:10, background:"rgba(255,255,255,.15)", border:"1px solid rgba(255,255,255,.3)", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
                <Plus style={{ width:13, height:13, display:"inline", marginRight:5 }} />{t("New Intl Plan","خطة دولية")}
              </button>
            </div>

            {/* International transactions table */}
            <div style={{ marginBottom:12, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontSize:13, fontWeight:700, color:G }}>{t("International Transactions","المعاملات الدولية")}</div>
              <div style={{ display:"flex", gap:6 }}>
                {["all","USD","GBP","SAR","EUR"].map(c=>(
                  <button key={c} onClick={()=>setIntlRegion(c)}
                    style={{ padding:"5px 12px", borderRadius:20, border:`1.5px solid ${intlRegion===c?"#2563eb":BORDER}`, background:intlRegion===c?"#eff6ff":"#fff", color:intlRegion===c?"#2563eb":G, fontSize:11, fontWeight:700, cursor:"pointer" }}>
                    {c==="all"?"All":c}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div style={{ borderRadius:12, border:`1px solid ${BORDER}`, overflow:"hidden" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1.2fr 1.5fr 1fr 0.8fr 1fr 1.2fr", background:"#f8fafb", padding:"10px 16px", gap:8 }}>
                {["Date","Student","Amount","Currency","Method","Reference"].map((h,i)=>(
                  <span key={i} style={{ fontSize:10, fontWeight:800, color:"#7a9e88", letterSpacing:.8, textTransform:"uppercase" }}>{h}</span>
                ))}
              </div>
              {(() => {
                const intlTx = payments.filter((p:any) => {
                  const plan = plans.find((pl:any)=>pl.id===p.plan_id);
                  const cur  = plan?.currency||"NGN";
                  if (cur==="NGN") return false;
                  if (intlRegion!=="all" && cur!==intlRegion) return false;
                  return true;
                });
                if (intlTx.length===0) return (
                  <div style={{ padding:"40px 20px", textAlign:"center", color:"#7a9e88", fontSize:14 }}>
                    <div style={{ fontSize:40, marginBottom:10 }}>🌍</div>
                    {t("No international transactions yet","لا توجد معاملات دولية بعد")}
                  </div>
                );
                return intlTx.map((p:any, i:number) => {
                  const stu  = students.find((s:any)=>s.user_id===p.student_id);
                  const plan = plans.find((pl:any)=>pl.id===p.plan_id);
                  const cur  = plan?.currency||"USD";
                  const sym  = { USD:"$", GBP:"£", SAR:"﷼", EUR:"€" }[cur] || "$";
                  const curColor = { USD:"#2563eb", GBP:"#7c3aed", SAR:"#d97706", EUR:"#059669" }[cur] || "#2563eb";
                  return (
                    <div key={p.id} style={{ display:"grid", gridTemplateColumns:"1.2fr 1.5fr 1fr 0.8fr 1fr 1.2fr", padding:"12px 16px", gap:8, alignItems:"center", borderTop:`1px solid ${BORDER}`, background:i%2===0?"#fff":"#fafcfb" }}>
                      <span style={{ fontSize:12, color:"#7a9e88" }}>{format(new Date(p.paid_at||p.created_at),"dd MMM yyyy")}</span>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:G }}>{stu?.full_name||"—"}</div>
                        <div style={{ fontSize:10, color:"#7a9e88" }}>{stu?.email}</div>
                      </div>
                      <span style={{ fontSize:15, fontWeight:900, color:curColor }}>{sym}{(p.amount||0).toLocaleString()}</span>
                      <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 9px", borderRadius:16, background:`${curColor}18`, color:curColor, fontSize:11, fontWeight:700 }}>
                        {cur}
                      </span>
                      <span style={{ fontSize:12, color:"#7a9e88", textTransform:"capitalize" }}>{p.payment_method||"—"}</span>
                      <span style={{ fontSize:10, fontFamily:"monospace", color:"#7a9e88", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.paystack_reference||"—"}</span>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Record international payment button */}
            <div style={{ marginTop:16 }}>
              <button onClick={()=>setManualOpen(true)}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 18px", borderRadius:12, background:G, border:"none", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                <Plus style={{ width:14, height:14 }} />{t("Record International Payment","تسجيل دفعة دولية")}
              </button>
            </div>
          </div>
        )}

        {/* ── PLANS TAB ── */}
        {activeTab==="plans" && (
          <div style={{ padding:18 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <p style={{ fontSize:13, color:"#7a9e88", margin:0 }}>{t("Create and manage payment plans","إنشاء وإدارة خطط الدفع")}</p>
              <button onClick={()=>{ setEditingPlan(null); setPlanForm({...EMPTY_PLAN}); setPlanOpen(true); }}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", borderRadius:10, background:G, border:"none", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                <Plus style={{ width:14, height:14 }} />{t("New Plan","خطة جديدة")}
              </button>
            </div>

            {plans.length===0 ? (
              <div style={{ textAlign:"center", padding:"50px 20px", color:"#7a9e88" }}>
                <DollarSign style={{ width:40, height:40, margin:"0 auto 12px", opacity:.3 }} />
                <p>{t("No payment plans yet","لا توجد خطط دفع بعد")}</p>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:14 }}>
                {plans.map((plan:any) => (
                  <div key={plan.id} style={{ background:"#fff", borderRadius:16, border:`1.5px solid ${plan.is_active?BORDER:"#e5e7eb"}`, overflow:"hidden", opacity:plan.is_active?1:.65, boxShadow:"0 2px 10px rgba(0,0,0,.06)" }}>
                    {/* Plan header */}
                    <div style={{ background:`linear-gradient(135deg,${G},${GM})`, padding:"14px 16px", display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
                      <div>
                        <div style={{ fontSize:16, fontWeight:800, color:"#fff" }}>{plan.name}</div>
                        {plan.name_ar && <div style={{ fontSize:13, color:"rgba(255,255,255,.65)", direction:"rtl" }}>{plan.name_ar}</div>}
                      </div>
                      <Switch checked={plan.is_active} onCheckedChange={async checked => {
                        await supabase.from("payment_plans" as any).update({ is_active:checked }).eq("id",plan.id);
                        loadData(true);
                      }} />
                    </div>
                    {/* Plan body */}
                    <div style={{ padding:"14px 16px" }}>
                      <div style={{ fontSize:28, fontWeight:900, color:G, marginBottom:8 }}>
                        {fmtAmt(plan.amount, plan.currency)}
                      </div>
                      {plan.description && <p style={{ fontSize:13, color:"#7a9e88", marginBottom:10, lineHeight:1.5 }}>{plan.description}</p>}
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
                        {[plan.type, plan.level||"all levels", plan.duration_months&&`${plan.duration_months} months`, plan.currency].filter(Boolean).map((tag:any,i:number)=>(
                          <span key={i} style={{ padding:"3px 10px", borderRadius:20, background:"rgba(15,45,31,.07)", color:G, fontSize:11, fontWeight:600, textTransform:"capitalize" }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div style={{ display:"flex", gap:8, paddingTop:10, borderTop:`1px solid ${BORDER}` }}>
                        <button onClick={()=>{ setEditingPlan(plan); setPlanForm({ name:plan.name, name_ar:plan.name_ar||"", description:plan.description||"", description_ar:plan.description_ar||"", amount:plan.amount, currency:plan.currency||"NGN", type:plan.type||"term", level:plan.level||"all", duration_months:plan.duration_months||3, is_active:plan.is_active??true, paystack_plan_code:plan.paystack_plan_code||"" }); setPlanOpen(true); }}
                          style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5, padding:"8px 0", borderRadius:10, background:"#f8fafb", border:`1px solid ${BORDER}`, color:G, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                          <Pencil style={{ width:12, height:12 }} />{t("Edit","تعديل")}
                        </button>
                        <button onClick={()=>deletePlan(plan.id)}
                          style={{ padding:"8px 12px", borderRadius:10, background:"#fff5f5", border:"1px solid #fca5a5", color:"#ef4444", fontSize:12, cursor:"pointer" }}>
                          <Trash2 style={{ width:13, height:13 }} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MANUAL PAYMENT DIALOG ── */}
      {manualOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={()=>setManualOpen(false)}>
          <div style={{ background:"#fff", borderRadius:20, padding:24, width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:18, fontWeight:800, color:G, marginBottom:20 }}>{t("Record Manual Payment","تسجيل دفعة يدوية")}</div>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {/* Student */}
              <div>
                <label style={lbl}>{t("Student *","الطالب *")}</label>
                <select value={manualForm.student_id} onChange={e=>setManualForm(f=>({...f,student_id:e.target.value}))} style={{ ...inp, appearance:"none" }}>
                  <option value="">{t("Select student…","اختر طالباً…")}</option>
                  {students.map((s:any)=><option key={s.user_id} value={s.user_id}>{s.full_name||s.email}</option>)}
                </select>
              </div>
              {/* Plan */}
              <div>
                <label style={lbl}>{t("Plan *","الخطة *")}</label>
                <select value={manualForm.plan_id} onChange={e=>{ const pl=plans.find((p:any)=>p.id===e.target.value); setManualForm(f=>({...f,plan_id:e.target.value,amount:pl?.amount||0})); }} style={{ ...inp, appearance:"none" }}>
                  <option value="">{t("Select plan…","اختر خطة…")}</option>
                  {plans.map((p:any)=><option key={p.id} value={p.id}>{p.name} — {fmtAmt(p.amount,p.currency)}</option>)}
                </select>
              </div>
              {/* Amount */}
              <div>
                <label style={lbl}>{t("Amount *","المبلغ *")} {manualForm.plan_id && (() => { const pl=plans.find((p:any)=>p.id===manualForm.plan_id); const sym={NGN:"₦",USD:"$",GBP:"£",SAR:"﷼"}[pl?.currency||"NGN"]||"₦"; return <span style={{color:"#7a9e88",fontWeight:400}}>({sym} {pl?.currency||"NGN"})</span>; })()}</label>
                <input type="number" value={manualForm.amount} onChange={e=>setManualForm(f=>({...f,amount:+e.target.value}))} style={inp} min={0} />
              </div>
              {/* Method */}
              <div>
                <label style={lbl}>{t("Payment Method","طريقة الدفع")}</label>
                <select value={manualForm.method} onChange={e=>setManualForm(f=>({...f,method:e.target.value}))} style={{ ...inp, appearance:"none" }}>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="paystack">Paystack</option>
                  <option value="other">Other</option>
                </select>
              </div>
              {/* Date */}
              <div>
                <label style={lbl}>{t("Payment Date","تاريخ الدفع")}</label>
                <input type="date" value={manualForm.date} onChange={e=>setManualForm(f=>({...f,date:e.target.value}))} style={inp} />
              </div>
              {/* Notes */}
              <div>
                <label style={lbl}>{t("Notes","ملاحظات")}</label>
                <textarea value={manualForm.notes} onChange={e=>setManualForm(f=>({...f,notes:e.target.value}))} rows={3} style={{ ...inp, resize:"vertical" }} placeholder={t("Optional notes…","ملاحظات اختيارية…")} />
              </div>
              {/* Actions */}
              <div style={{ display:"flex", gap:10, marginTop:4 }}>
                <button onClick={()=>setManualOpen(false)} style={{ flex:1, padding:"11px 0", borderRadius:12, background:"#f8fafb", border:`1px solid ${BORDER}`, color:G, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'Cairo',sans-serif" }}>
                  {t("Cancel","إلغاء")}
                </button>
                <button onClick={recordManual} disabled={manualLoading} style={{ flex:2, padding:"11px 0", borderRadius:12, background:G, border:"none", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'Cairo',sans-serif", opacity:manualLoading?.7:1 }}>
                  {manualLoading ? t("Saving…","جاري الحفظ…") : t("Record Payment ✅","تسجيل الدفعة ✅")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── GRACE PERIOD DIALOG ── */}
      {graceOpen && graceStudent && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={()=>setGraceOpen(false)}>
          <div style={{ background:"#fff", borderRadius:20, padding:24, width:"100%", maxWidth:420 }} onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
              <div style={{ width:44, height:44, borderRadius:14, background:"#f0fff4", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Clock style={{ width:22, height:22, color:"#15803d" }} />
              </div>
              <div>
                <div style={{ fontSize:17, fontWeight:800, color:G }}>{t("Grant Grace Period","منح فترة سماح")}</div>
                <div style={{ fontSize:12, color:"#7a9e88", marginTop:1 }}>{graceStudent.full_name}</div>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {/* Days selector */}
              <div>
                <label style={lbl}>{t("Extension (days)","التمديد (أيام)")}</label>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
                  {[3,7,14,30].map(d=>(
                    <button key={d} onClick={()=>setGraceForm(f=>({...f,days:d}))}
                      style={{ padding:"8px 16px", borderRadius:20, border:`1.5px solid ${graceForm.days===d?G:BORDER}`, background:graceForm.days===d?G:"#fff", color:graceForm.days===d?"#fff":G, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                      {d}d
                    </button>
                  ))}
                </div>
                <input type="number" value={graceForm.days} min={1} max={90}
                  onChange={e=>setGraceForm(f=>({...f,days:Math.max(1,+e.target.value)}))}
                  style={inp} placeholder={t("Custom days…","أيام مخصصة…")} />
              </div>
              {/* Preview */}
              <div style={{ background:"#f0fff4", borderRadius:12, padding:"12px 16px", border:"1px solid #86efac" }}>
                <div style={{ fontSize:12, color:"#15803d", fontWeight:700 }}>
                  {t("Grace period until","فترة السماح حتى")}: <strong>{format(new Date(Date.now()+graceForm.days*86400000),"d MMM yyyy")}</strong>
                </div>
                <div style={{ fontSize:11, color:"#16a34a", marginTop:4 }}>
                  {t("Student will be notified automatically","سيُخطر الطالب تلقائيًا")}
                </div>
              </div>
              {/* Notes */}
              <div>
                <label style={lbl}>{t("Admin Note (optional)","ملاحظة المشرف (اختياري)")}</label>
                <textarea value={graceForm.notes} onChange={e=>setGraceForm(f=>({...f,notes:e.target.value}))} rows={2} style={{ ...inp, resize:"none" }} placeholder={t("e.g. Financial hardship, awaiting bank transfer…","مثال: ضائقة مالية، بانتظار التحويل…")} />
              </div>
              {/* Actions */}
              <div style={{ display:"flex", gap:10, marginTop:4 }}>
                <button onClick={()=>setGraceOpen(false)} style={{ flex:1, padding:"11px 0", borderRadius:12, background:"#f8fafb", border:`1px solid ${BORDER}`, color:G, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'Cairo',sans-serif" }}>
                  {t("Cancel","إلغاء")}
                </button>
                <button onClick={grantGrace} disabled={graceLoading} style={{ flex:2, padding:"11px 0", borderRadius:12, background:"#15803d", border:"none", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'Cairo',sans-serif", opacity:graceLoading?.7:1 }}>
                  {graceLoading ? t("Saving…","جاري الحفظ…") : t("Grant Grace Period ✅","منح فترة السماح ✅")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PLAN DIALOG ── */}
      {planOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={()=>setPlanOpen(false)}>
          <div style={{ background:"#fff", borderRadius:20, padding:24, width:"100%", maxWidth:520, maxHeight:"90vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:18, fontWeight:800, color:G, marginBottom:20 }}>
              {editingPlan ? t("Edit Plan","تعديل الخطة") : t("Create Plan","إنشاء خطة")}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <label style={lbl}>{t("Name (EN) *","الاسم (إنجليزي) *")}</label>
                  <input value={planForm.name} onChange={e=>setPlanForm((f:any)=>({...f,name:e.target.value}))} style={inp} placeholder="e.g. Term Fee" />
                </div>
                <div>
                  <label style={lbl}>{t("Name (AR)","الاسم (عربي)")}</label>
                  <input value={planForm.name_ar} onChange={e=>setPlanForm((f:any)=>({...f,name_ar:e.target.value}))} style={{ ...inp, direction:"rtl" }} placeholder="مثال: رسوم الفصل" />
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <label style={lbl}>{t("Amount *","المبلغ *")}</label>
                  <input type="number" value={planForm.amount} onChange={e=>setPlanForm((f:any)=>({...f,amount:+e.target.value}))} style={inp} min={0} />
                </div>
                <div>
                  <label style={lbl}>{t("Currency","العملة")}</label>
                  <select value={planForm.currency} onChange={e=>setPlanForm((f:any)=>({...f,currency:e.target.value}))} style={{ ...inp, appearance:"none" }}>
                    <option value="NGN">NGN (₦)</option>
                    <option value="USD">USD ($)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="SAR">SAR (﷼)</option>
                  </select>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <label style={lbl}>{t("Type","النوع")}</label>
                  <select value={planForm.type} onChange={e=>{
                    const t2 = e.target.value;
                    const autoMonths = t2==="term" ? 3 : t2==="monthly" ? 1 : planForm.duration_months;
                    setPlanForm((f:any)=>({...f,type:t2,duration_months:autoMonths}));
                  }} style={{ ...inp, appearance:"none" }}>
                    <option value="term">Term (3 months)</option>
                    <option value="monthly">Monthly (1 month)</option>
                    <option value="one_time">One-Time</option>
                    <option value="private">Private</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>{t("Duration (months)","المدة (أشهر)")}</label>
                  <input type="number" value={planForm.duration_months} onChange={e=>setPlanForm((f:any)=>({...f,duration_months:+e.target.value}))} style={inp} min={1} max={36} />
                </div>
              </div>
              <div>
                <label style={lbl}>{t("Level","المستوى")}</label>
                <select value={planForm.level} onChange={e=>setPlanForm((f:any)=>({...f,level:e.target.value}))} style={{ ...inp, appearance:"none" }}>
                  <option value="all">All Levels</option>
                  {academicLevels.map(l => (
                    <option key={l.slug} value={l.slug}>{l.name_en}</option>
                  ))}
                </select>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <label style={lbl}>{t("Description (EN)","الوصف (إنجليزي)")}</label>
                  <textarea value={planForm.description} onChange={e=>setPlanForm((f:any)=>({...f,description:e.target.value}))} rows={2} style={{ ...inp, resize:"none" }} />
                </div>
                <div>
                  <label style={lbl}>{t("Description (AR)","الوصف (عربي)")}</label>
                  <textarea value={planForm.description_ar} onChange={e=>setPlanForm((f:any)=>({...f,description_ar:e.target.value}))} rows={2} style={{ ...inp, resize:"none", direction:"rtl" }} />
                </div>
              </div>
              <div>
                <label style={lbl}>{t("Paystack Plan Code","كود خطة Paystack")} <span style={{ fontWeight:400, color:"#7a9e88" }}>({t("optional","اختياري")})</span></label>
                <input value={planForm.paystack_plan_code} onChange={e=>setPlanForm((f:any)=>({...f,paystack_plan_code:e.target.value}))} style={inp} placeholder="PLN_xxxxx" />
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <Switch checked={planForm.is_active} onCheckedChange={v=>setPlanForm((f:any)=>({...f,is_active:v}))} />
                <span style={{ fontSize:13, fontWeight:600, color:G }}>{t("Active","نشط")}</span>
              </div>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={()=>setPlanOpen(false)} style={{ flex:1, padding:"11px 0", borderRadius:12, background:"#f8fafb", border:`1px solid ${BORDER}`, color:G, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'Cairo',sans-serif" }}>
                  {t("Cancel","إلغاء")}
                </button>
                <button onClick={savePlan} disabled={planLoading} style={{ flex:2, padding:"11px 0", borderRadius:12, background:G, border:"none", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'Cairo',sans-serif", opacity:planLoading?.7:1 }}>
                  {planLoading?"Saving…" : editingPlan ? t("Update Plan ✅","تحديث الخطة ✅") : t("Create Plan ✅","إنشاء الخطة ✅")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentManagement;
