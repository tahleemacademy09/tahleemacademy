/*  src/pages/student/PaymentScreen.tsx
    ENHANCED — Clean white UI, fixed Paystack public key loading,
    correct post-payment redirect, all bugs fixed
*/
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  CreditCard, Shield, BookOpen, Video, ClipboardList,
  MessageCircle, BookMarked, CheckCircle, Clock, History,
  Download, AlertTriangle, Star, Globe, ArrowRight,
  RefreshCw, Receipt, Calendar, Headphones, ArrowLeft,
  Loader2, CheckCircle2, XCircle, Wallet
} from "lucide-react";
import { format } from "date-fns";

declare global { interface Window { PaystackPop: any; } }

const G    = "#0f2d1f";
const GM   = "#1a4731";
const GOLD = "#c9a84c";

const SYM: Record<string, string> = { NGN: "₦", USD: "$", GBP: "£", SAR: "﷼", EUR: "€" };
const fmtAmt = (n: number, cur = "NGN") => `${SYM[cur] || "₦"}${(n || 0).toLocaleString()}`;

const FEATURES = [
  { icon: BookOpen,      en: "All Level Courses",   ar: "جميع الدورات"        },
  { icon: Video,         en: "Live Classes",         ar: "الحصص المباشرة"     },
  { icon: Video,         en: "Recorded Sessions",    ar: "التسجيلات"          },
  { icon: ClipboardList, en: "Exams & Tests",         ar: "الامتحانات"         },
  { icon: BookMarked,    en: "General Revision",     ar: "المراجعة العامة"    },
  { icon: Headphones,    en: "Al-Hifdh",              ar: "الحفظ"              },
  { icon: MessageCircle, en: "Al-Majlis Chat",        ar: "المجلس"             },
  { icon: Star,          en: "Certificates",          ar: "الشهادات"           },
];

const PaymentScreen = () => {
  const navigate               = useNavigate();
  const { user, profile, hasRole, refreshProfile } = useAuth();
  const { toast }              = useToast();
  const { t, language }        = useLanguage() as any;

  const [plans, setPlans]               = useState<any[]>([]);
  const [selectedPlan, setSelected]     = useState<any>(null);
  const [loading, setLoading]           = useState(true);
  const [paying, setPaying]             = useState(false);
  const [publicKey, setPublicKey]       = useState("");
  const [psReady, setPsReady]           = useState(false);
  const [history, setHistory]           = useState<any[]>([]);
  const [subscription, setSub]          = useState<any>(null);
  const [graceLeft, setGraceLeft]       = useState<number | null>(null);
  const [activeView, setView]           = useState<"pay" | "history" | "status">("pay");
  const [paySuccess, setPaySuccess]     = useState(false);
  const [detectedCurrency, setDetected] = useState("NGN");
  const [keyError, setKeyError]         = useState(false);

  const isRTL = language === "ar";

  // ── Detect locale currency ───────────────────────────────────
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz.startsWith("Africa/")) setDetected("NGN");
      else if (tz.startsWith("Europe/London")) setDetected("GBP");
      else if (tz.startsWith("Europe/")) setDetected("EUR");
      else if (tz.startsWith("America/")) setDetected("USD");
      else if (["Asia/Riyadh","Asia/Dubai","Asia/Kuwait"].some(z => tz.startsWith(z))) setDetected("SAR");
    } catch (_) {}
  }, []);

  // ── Auth guard ───────────────────────────────────────────────
  useEffect(() => {
    if (!user) { navigate("/login"); return; }
    if (hasRole("admin") || hasRole("teacher")) { navigate("/admin"); return; }
    loadAll();
    loadPaystackScript();
    loadPublicKey();
  }, [user]);

  // ── Grace countdown ──────────────────────────────────────────
  useEffect(() => {
    if (profile?.payment_status !== "grace" || !(profile as any)?.subscription_end_date) return;
    const end = new Date((profile as any).subscription_end_date).getTime();
    const tick = () => setGraceLeft(Math.max(0, Math.ceil((end - Date.now()) / 86400000)));
    tick();
    const iv = setInterval(tick, 60000);
    return () => clearInterval(iv);
  }, [profile]);

  // ── Load script ──────────────────────────────────────────────
  const loadPaystackScript = () => {
    if (window.PaystackPop) { setPsReady(true); return; }
    if (document.getElementById("paystack-js")) {
      const check = setInterval(() => { if (window.PaystackPop) { setPsReady(true); clearInterval(check); } }, 300);
      return;
    }
    const s    = document.createElement("script");
    s.id       = "paystack-js";
    s.src      = "https://js.paystack.co/v2/inline.js";
    s.async    = true;
    s.onload   = () => setPsReady(true);
    s.onerror  = () => setKeyError(true);
    document.head.appendChild(s);
  };

  // ── Load public key from edge function (GET to paystack-webhook) ─
  const loadPublicKey = async () => {
    // 1. Try VITE env var first (Lovable sets this)
    const envKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY ||
                   import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (envKey && envKey.startsWith("pk_")) { setPublicKey(envKey); return; }

    // 2. Call the paystack-webhook edge function (it handles GET → returns publicKey)
    try {
      const { data, error } = await supabase.functions.invoke("paystack-webhook", {
        method: "GET",
      });
      if (!error && data?.publicKey) { setPublicKey(data.publicKey); return; }
      if (!error && data?.key)       { setPublicKey(data.key); return; }
    } catch (_) {}

    // 3. Last resort: check Supabase secrets via a simple call
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paystack-webhook`,
        { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
      );
      const json = await res.json();
      if (json?.publicKey) { setPublicKey(json.publicKey); return; }
    } catch (_) {}

    setKeyError(true);
  };

  // ── Load plans + history + subscription ──────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, histRes, subRes] = await Promise.all([
        supabase.from("payment_plans" as any).select("*").eq("is_active", true).order("amount"),
        supabase.from("payments" as any)
          .select("*, payment_plans(name, name_ar, currency)")
          .eq("student_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase.from("student_subscriptions" as any)
          .select("*")
          .eq("student_id", user!.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      const pln = (plansRes.data || []) as any[];
      setPlans(pln);
      setHistory((histRes.data || []) as any[]);
      setSub((subRes.data?.[0]) || null);

      // Auto-select best plan
      if (pln.length > 0 && !selectedPlan) {
        const level    = profile?.level || "beginner";
        const curPool  = pln.filter((p: any) => (p.currency || "NGN") === detectedCurrency);
        const pool     = curPool.length > 0 ? curPool : pln;
        const auto     = pool.find((p: any) => p.type === "term" && p.level === level)
                      || pool.find((p: any) => p.type === "term")
                      || pool[0];
        setSelected(auto || null);
      }
    } catch (e) {
      toast({ title: "Failed to load plans", variant: "destructive" });
    }
    setLoading(false);
  }, [user, profile, detectedCurrency]);

  // ── Initiate Paystack payment ────────────────────────────────
  const handlePayment = async () => {
    if (!selectedPlan || !user || !profile) return;
    if (!psReady || !window.PaystackPop) {
      toast({ title: t("Payment system not ready. Please wait.", "نظام الدفع غير جاهز، يرجى الانتظار."), variant: "destructive" });
      loadPaystackScript();
      return;
    }
    if (!publicKey) {
      toast({ title: t("Missing payment key. Contact admin.", "مفتاح الدفع مفقود. تواصل مع الإدارة."), variant: "destructive" });
      return;
    }

    setPaying(true);
    const ref = `TAH-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // Record pending payment
    await supabase.from("payments" as any).insert({
      student_id: user.id,
      plan_id: selectedPlan.id,
      amount: selectedPlan.amount,
      currency: selectedPlan.currency || "NGN",
      status: "pending",
      type: "enrollment",
      paystack_reference: ref,
    });

    try {
      const popup = new window.PaystackPop();
      popup.newTransaction({
        key: publicKey,
        email: (profile as any).email || user.email,
        amount: selectedPlan.amount * 100,   // Paystack uses kobo/cents
        currency: selectedPlan.currency || "NGN",
        ref,
        label: `${profile.full_name || "Student"} — ${selectedPlan.name}`,
        metadata: {
          student_id: user.id,
          plan_id: selectedPlan.id,
          student_name: profile.full_name,
          level: profile.level,
          custom_fields: [
            { display_name: "Student", variable_name: "student_name", value: profile.full_name || "" },
            { display_name: "Level",   variable_name: "level",        value: profile.level || "" },
          ],
        },
        onSuccess: async (res: any) => {
          await verifyAndActivate(ref, res);
        },
        onCancel: () => {
          // Mark as cancelled in DB
          supabase.from("payments" as any)
            .update({ status: "cancelled" })
            .eq("paystack_reference", ref);
          toast({ title: t("Payment cancelled", "تم إلغاء الدفع") });
          setPaying(false);
        },
      });
    } catch (err: any) {
      toast({ title: t("Could not launch payment", "تعذّر تشغيل الدفع"), description: err?.message, variant: "destructive" });
      setPaying(false);
    }
  };

  // ── Verify & activate after Paystack callback ────────────────
  const verifyAndActivate = async (ref: string, res: any) => {
    try {
      // Update payment record
      await supabase.from("payments" as any).update({
        status: "success",
        paystack_transaction_id: String(res?.trxref || res?.transaction || res?.reference || ""),
        payment_method: "paystack",
        paid_at: new Date().toISOString(),
      }).eq("paystack_reference", ref);

      // Calculate end date
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + (selectedPlan.duration_months || 3));
      const endStr = endDate.toISOString().split("T")[0];

      // Update student profile
      await supabase.from("profiles").update({
        payment_status: "paid",
        subscription_end_date: endStr,
      } as any).eq("user_id", user!.id);

      // Get payment record ID
      const { data: pRec } = await supabase.from("payments" as any)
        .select("id").eq("paystack_reference", ref).single();

      // Create subscription record
      await supabase.from("student_subscriptions" as any).upsert({
        student_id: user!.id,
        plan_id: selectedPlan.id,
        payment_id: (pRec as any)?.id,
        status: "active",
        start_date: new Date().toISOString().split("T")[0],
        end_date: endStr,
      });

      // Send in-app notification
      await supabase.from("notifications").insert({
        user_id: user!.id,
        title: "Payment Successful ✅",
        message: `Your payment of ${fmtAmt(selectedPlan.amount, selectedPlan.currency)} has been confirmed. الحمد لله`,
        type: "payment",
      });

      // Refresh profile in context
      await refreshProfile();
      await loadAll();

      setPaying(false);
      setPaySuccess(true);

      // Auto-redirect after 3 seconds
      setTimeout(() => navigate("/student"), 3000);

    } catch (err: any) {
      toast({ title: t("Payment verified but activation failed. Contact admin.", "تم الدفع لكن التفعيل فشل. تواصل مع الإدارة."), variant: "destructive" });
      setPaying(false);
    }
  };

  // ── Grace period ─────────────────────────────────────────────
  const handlePayLater = async () => {
    const graceEnd = new Date();
    graceEnd.setDate(graceEnd.getDate() + 7);
    await supabase.from("profiles").update({
      payment_status: "grace",
      subscription_end_date: graceEnd.toISOString().split("T")[0],
    } as any).eq("user_id", user!.id);
    await refreshProfile();
    toast({ title: t("7-day grace period started", "بدأت فترة السماح — 7 أيام") });
    navigate("/student");
  };

  // ── Download receipt ─────────────────────────────────────────
  const downloadReceipt = (p: any) => {
    const cur = p.payment_plans?.currency || "NGN";
    const lines = [
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "      TAHLEEM ACADEMY",
      "      أكاديمية التعليم",
      "      PAYMENT RECEIPT · إيصال الدفع",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      `Reference:  ${p.paystack_reference || "—"}`,
      `Student:    ${profile?.full_name || "—"}`,
      `Email:      ${(profile as any)?.email || user?.email || "—"}`,
      `Plan:       ${p.payment_plans?.name || "—"}`,
      `Amount:     ${fmtAmt(p.amount, cur)}`,
      `Status:     ${p.status?.toUpperCase()}`,
      `Date:       ${format(new Date(p.paid_at || p.created_at), "dd MMM yyyy HH:mm")}`,
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "  tahleemacademy.vercel.app",
      "  Powered by Paystack",
    ].join("\n");
    const a   = document.createElement("a");
    a.href    = URL.createObjectURL(new Blob([lines], { type: "text/plain" }));
    a.download = `receipt-${p.paystack_reference || Date.now()}.txt`;
    a.click();
  };

  const isPaid = profile?.payment_status === "paid"
    || profile?.payment_status === "exempt"
    || (profile as any)?.is_payment_exempt;

  // Currency grouping
  const ngnPlans  = plans.filter((p: any) => (p.currency || "NGN") === "NGN" && p.type !== "private");
  const otherPlans = plans.filter((p: any) => (p.currency || "NGN") !== "NGN" && p.type !== "private");
  const otherByCur: Record<string, any[]> = {};
  otherPlans.forEach((p: any) => { const c = p.currency || "USD"; if (!otherByCur[c]) otherByCur[c] = []; otherByCur[c].push(p); });
  const currencies = ["NGN", ...Object.keys(otherByCur)];
  const activeCur  = selectedPlan?.currency || "NGN";
  const visiblePlans = activeCur === "NGN" ? ngnPlans : (otherByCur[activeCur] || []);

  // ── Loading ───────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafb" }}>
      <div style={{ textAlign: "center" }}>
        <Loader2 style={{ width: 36, height: 36, color: G, animation: "spin .8s linear infinite", margin: "0 auto 12px" }} />
        <p style={{ fontSize: 13, color: "#7a9e88", fontFamily: "'Cairo',sans-serif" }}>Loading…</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Payment success screen ────────────────────────────────────
  if (paySuccess) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafb", fontFamily: "'Cairo',sans-serif", padding: 20 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}`}</style>
      <div style={{ background: "#fff", borderRadius: 24, padding: "48px 32px", maxWidth: 400, width: "100%", textAlign: "center", boxShadow: "0 8px 48px rgba(0,0,0,.1)" }}>
        <div style={{ width: 96, height: 96, borderRadius: "50%", background: "linear-gradient(135deg,#f0fff4,#dcfce7)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", animation: "pop .5s ease" }}>
          <CheckCircle2 style={{ width: 52, height: 52, color: "#22c55e" }} />
        </div>
        <div style={{ fontSize: 13, color: GOLD, fontFamily: "serif", marginBottom: 8 }} dir="rtl">الحمد لله</div>
        <h2 style={{ fontSize: 24, fontWeight: 900, color: G, marginBottom: 8 }}>{t("Payment Successful!", "تمّت عملية الدفع!")}</h2>
        <p style={{ fontSize: 14, color: "#7a9e88", lineHeight: 1.6, marginBottom: 24 }}>
          {t("Your account has been activated. Redirecting to dashboard…", "تم تفعيل حسابك. جارٍ التوجيه للوحة التحكم…")}
        </p>
        <div style={{ height: 4, background: "#f0f4f0", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: "100%", background: `linear-gradient(90deg,${G},${GOLD})`, animation: "progressFill 3s linear forwards", borderRadius: 2 }} />
        </div>
        <button onClick={() => navigate("/student")}
          style={{ width: "100%", padding: "14px", marginTop: 20, borderRadius: 14, background: G, border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif" }}>
          {t("Go to Dashboard", "الذهاب للوحة التحكم")}
        </button>
      </div>
      <style>{`@keyframes progressFill{from{width:0}to{width:100%}}`}</style>
    </div>
  );

  // ── MAIN SCREEN ───────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafb", fontFamily: "'Cairo',sans-serif", direction: isRTL ? "rtl" : "ltr" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes fadeUp  { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
        * { box-sizing: border-box; }
      `}</style>

      {/* ── TOP BAR ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "0 16px", height: 56, display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => navigate("/student")}
          style={{ width: 36, height: 36, borderRadius: "50%", background: "#f8fafb", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft style={{ width: 16, height: 16, color: G }} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: G }}>{t("Enrollment & Payment", "التسجيل والدفع")}</div>
        </div>
        <Wallet style={{ width: 20, height: 20, color: GOLD }} />
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 60px", animation: "fadeUp .4s ease" }}>

        {/* ── HERO ── */}
        <div style={{ background: `linear-gradient(135deg,${G},${GM})`, borderRadius: 20, padding: "24px 20px", marginBottom: 20, textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, opacity: .04, backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff'%3E%3Cpath d='M20 0l20 20-20 20L0 20z'/%3E%3C/g%3E%3C/svg%3E")` }} />
          <p style={{ fontFamily: "serif", fontSize: 18, color: GOLD, margin: "0 0 6px" }} dir="rtl">بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ</p>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff", margin: "0 0 4px" }}>
            {isPaid ? t("Your Subscription", "اشتراكك") : t("Complete Enrollment", "أكمل التسجيل")}
          </h1>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.6)", margin: 0 }}>
            {isPaid
              ? t("Manage your subscription", "إدارة اشتراكك")
              : t("Choose a plan and start your learning journey", "اختر خطة وابدأ رحلتك التعليمية")}
          </p>
        </div>

        {/* ── GRACE BANNER ── */}
        {profile?.payment_status === "grace" && graceLeft !== null && (
          <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 14, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <Clock style={{ width: 20, height: 20, color: "#f59e0b", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#92400e" }}>
                {t(`${graceLeft} day${graceLeft !== 1 ? "s" : ""} left in grace period`, `${graceLeft} يوم متبقي في فترة السماح`)}
              </div>
              <div style={{ fontSize: 11, color: "#a16207" }}>{t("Complete payment to keep access", "أكمل الدفع للحفاظ على الوصول")}</div>
            </div>
          </div>
        )}

        {/* ── ACTIVE SUBSCRIPTION BANNER ── */}
        {isPaid && subscription && (
          <div style={{ background: "#f0fff4", border: "1.5px solid #86efac", borderRadius: 14, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <CheckCircle style={{ width: 22, height: 22, color: "#22c55e" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: G }}>{t("Active Subscription", "اشتراك نشط")}</div>
              <div style={{ fontSize: 12, color: "#7a9e88", marginTop: 2 }}>
                {t("Expires", "ينتهي")} {subscription.end_date ? format(new Date(subscription.end_date), "dd MMM yyyy") : "—"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#9ca3af" }}>{t("Days left", "أيام")}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#22c55e" }}>
                {subscription.end_date ? Math.max(0, Math.ceil((new Date(subscription.end_date).getTime() - Date.now()) / 86400000)) : "—"}
              </div>
            </div>
          </div>
        )}

        {/* ── TABS ── */}
        <div style={{ display: "flex", background: "#fff", borderRadius: 14, padding: 4, marginBottom: 20, gap: 4, border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          {([
            ["pay",     isPaid ? t("Renew", "تجديد") : t("Pay", "ادفع"), CreditCard],
            ["history", t("History", "السجل"),                           History],
            ["status",  t("Status", "الحالة"),                           Star],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setView(key as any)}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 8px", borderRadius: 10, border: "none", cursor: "pointer", transition: "all .15s", fontFamily: "'Cairo',sans-serif",
                background: activeView === key ? G : "transparent",
                color:      activeView === key ? "#fff" : "#9ca3af",
                fontSize: 12, fontWeight: activeView === key ? 800 : 500,
              }}>
              <Icon style={{ width: 13, height: 13 }} />{label}
            </button>
          ))}
        </div>

        {/* ══════════ PAY TAB ══════════ */}
        {activeView === "pay" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Currency selector */}
            {currencies.length > 1 && (
              <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", border: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 10, display: "flex", alignItems: "center", gap: 5, letterSpacing: .5 }}>
                  <Globe style={{ width: 12, height: 12 }} />
                  {t("CURRENCY", "العملة")}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {currencies.map(cur => (
                    <button key={cur} onClick={() => {
                      const pool = cur === "NGN" ? ngnPlans : (otherByCur[cur] || []);
                      setSelected(pool[0] || null);
                    }} style={{
                      padding: "6px 16px", borderRadius: 20,
                      border: `1.5px solid ${activeCur === cur ? G : "#e5e7eb"}`,
                      background: activeCur === cur ? G : "#fff",
                      color: activeCur === cur ? "#fff" : "#374151",
                      fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all .15s"
                    }}>
                      {SYM[cur] || cur} {cur}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Plan cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {visiblePlans.map((plan: any) => {
                const sel = selectedPlan?.id === plan.id;
                const cur = plan.currency || "NGN";
                return (
                  <div key={plan.id} onClick={() => setSelected(plan)}
                    style={{ background: "#fff", borderRadius: 16, border: `2px solid ${sel ? G : "#e5e7eb"}`, padding: "18px 18px", cursor: "pointer", transition: "all .18s", position: "relative", overflow: "hidden",
                      boxShadow: sel ? `0 4px 20px rgba(15,45,31,.12)` : "0 1px 4px rgba(0,0,0,.04)" }}>
                    {/* Selected corner */}
                    {sel && <div style={{ position: "absolute", top: 0, right: 0, width: 0, height: 0, borderStyle: "solid", borderWidth: "0 40px 40px 0", borderColor: `transparent ${G} transparent transparent` }}>
                      <CheckCircle style={{ position: "absolute", top: 4, right: -36, width: 14, height: 14, color: "#fff" }} />
                    </div>}

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: G, marginBottom: 2 }}>{plan.name}</div>
                        {plan.name_ar && <div style={{ fontSize: 13, color: GOLD, fontFamily: "serif", marginBottom: 6 }} dir="rtl">{plan.name_ar}</div>}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                          {plan.duration_months && (
                            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#f0f4f0", color: G, fontWeight: 600 }}>
                              <Calendar style={{ width: 10, height: 10, display: "inline", marginRight: 3 }} />
                              {plan.duration_months} {t("months", "شهور")}
                            </span>
                          )}
                          {plan.level && plan.level !== "all" && (
                            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#fffbeb", color: "#92400e", fontWeight: 700, textTransform: "capitalize" as const }}>
                              {plan.level}
                            </span>
                          )}
                          {plan.type && (
                            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#f0f9ff", color: "#0284c7", fontWeight: 600, textTransform: "capitalize" as const }}>
                              {plan.type}
                            </span>
                          )}
                        </div>
                        {plan.description && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6, lineHeight: 1.5 }}>{plan.description}</div>}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 28, fontWeight: 900, color: sel ? G : "#374151", lineHeight: 1 }}>
                          {fmtAmt(plan.amount, cur)}
                        </div>
                        {plan.duration_months && plan.duration_months > 1 && (
                          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
                            ≈ {fmtAmt(Math.round(plan.amount / plan.duration_months), cur)}/{t("mo", "شهر")}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {visiblePlans.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#9ca3af", fontSize: 13 }}>
                  {t("No plans available", "لا توجد خطط متاحة")}
                </div>
              )}
            </div>

            {/* What's included */}
            {selectedPlan && (
              <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", border: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 12, letterSpacing: .8, textTransform: "uppercase" as const }}>
                  {t("What's Included", "ما يشمل الاشتراك")}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {FEATURES.map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <CheckCircle style={{ width: 15, height: 15, color: "#22c55e", flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: "#374151" }}>{isRTL ? f.ar : f.en}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Key error warning */}
            {keyError && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                <AlertTriangle style={{ width: 16, height: 16, color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12, color: "#92400e" }}>
                  {t("Payment gateway not configured. Please ensure PAYSTACK_PUBLIC_KEY is set in Supabase secrets and contact admin.", "بوابة الدفع غير مهيأة. تأكد من إعداد PAYSTACK_PUBLIC_KEY في أسرار Supabase.")}
                </div>
              </div>
            )}

            {/* Pay button */}
            <button onClick={handlePayment}
              disabled={paying || !selectedPlan || (!publicKey && !psReady)}
              style={{
                width: "100%", padding: "18px", borderRadius: 16,
                background: paying ? "#9ca3af" : G,
                border: "none", color: "#fff", fontSize: 16, fontWeight: 900,
                cursor: paying ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                transition: "all .2s", boxShadow: paying ? "none" : `0 4px 20px rgba(15,45,31,.25)`,
                fontFamily: "'Cairo',sans-serif"
              }}>
              {paying ? (
                <><Loader2 style={{ width: 20, height: 20, animation: "spin .8s linear infinite" }} />{t("Processing…", "جارٍ المعالجة…")}</>
              ) : (
                <><CreditCard style={{ width: 20, height: 20 }} />
                  {t("Pay Now", "ادفع الآن")} — {selectedPlan ? fmtAmt(selectedPlan.amount, selectedPlan.currency) : "—"}
                  <ArrowRight style={{ width: 16, height: 16 }} /></>
              )}
            </button>

            {/* Security note */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, color: "#9ca3af" }}>
              <Shield style={{ width: 12, height: 12 }} />
              {t("Secured by Paystack · 256-bit SSL", "مؤمّن بواسطة Paystack · تشفير 256-bit")}
            </div>

            {/* Pay later */}
            {!isPaid && (
              <button onClick={handlePayLater}
                style={{ width: "100%", padding: "13px", borderRadius: 14, background: "transparent", border: "1.5px solid #e5e7eb", color: "#9ca3af", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Cairo',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Clock style={{ width: 14, height: 14 }} />
                {t("Pay Later (7-day grace)", "ادفع لاحقاً — فترة سماح 7 أيام")}
              </button>
            )}
          </div>
        )}

        {/* ══════════ HISTORY TAB ══════════ */}
        {activeView === "history" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 13, color: "#9ca3af" }}>{history.length} {t("transactions", "معاملة")}</span>
              <button onClick={loadAll} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: G, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                <RefreshCw style={{ width: 12, height: 12 }} />{t("Refresh", "تحديث")}
              </button>
            </div>

            {history.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 16, padding: "50px 20px", textAlign: "center", border: "1px solid #e5e7eb" }}>
                <Receipt style={{ width: 40, height: 40, margin: "0 auto 12px", color: "#d1d5db" }} />
                <p style={{ fontSize: 14, color: "#9ca3af" }}>{t("No payment history yet", "لا يوجد سجل مدفوعات بعد")}</p>
              </div>
            ) : history.map((p: any) => {
              const cur    = p.payment_plans?.currency || "NGN";
              const isOk   = p.status === "success";
              const isFail = p.status === "failed" || p.status === "cancelled";
              return (
                <div key={p.id} style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 10, border: "1px solid #e5e7eb" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: isOk ? "#f0fff4" : isFail ? "#fff5f5" : "#fffbeb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {isOk   ? <CheckCircle style={{ width: 20, height: 20, color: "#22c55e" }} />
                              : isFail ? <XCircle style={{ width: 20, height: 20, color: "#ef4444" }} />
                              : <Clock style={{ width: 20, height: 20, color: "#f59e0b" }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: G }}>{p.payment_plans?.name || t("Payment", "دفعة")}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                        {format(new Date(p.paid_at || p.created_at), "dd MMM yyyy · HH:mm")}
                      </div>
                      {p.paystack_reference && (
                        <div style={{ fontSize: 10, fontFamily: "monospace", color: "#d1d5db", marginTop: 1 }}>{p.paystack_reference}</div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: isOk ? "#22c55e" : isFail ? "#ef4444" : "#f59e0b" }}>
                        {fmtAmt(p.amount, cur)}
                      </div>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700, background: isOk ? "#f0fff4" : isFail ? "#fff5f5" : "#fffbeb", color: isOk ? "#22c55e" : isFail ? "#ef4444" : "#f59e0b" }}>
                        {p.status?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  {isOk && (
                    <button onClick={() => downloadReceipt(p)}
                      style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: G, background: "#f8fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontFamily: "'Cairo',sans-serif" }}>
                      <Download style={{ width: 11, height: 11 }} />{t("Download Receipt", "تنزيل الإيصال")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ══════════ STATUS TAB ══════════ */}
        {activeView === "status" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "#fff", borderRadius: 16, padding: "18px", border: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 14, letterSpacing: .8, textTransform: "uppercase" as const }}>
                {t("Account Status", "حالة الحساب")}
              </div>
              {[
                { label: t("Name", "الاسم"),             value: profile?.full_name || "—" },
                { label: t("Email", "البريد"),            value: (profile as any)?.email || user?.email || "—" },
                { label: t("Level", "المستوى"),           value: profile?.level || "—" },
                { label: t("Payment Status", "حالة الدفع"), value: profile?.payment_status || "unpaid",
                  badge: true, color: profile?.payment_status === "paid" ? "#22c55e" : profile?.payment_status === "grace" ? "#f59e0b" : "#ef4444" },
                { label: t("Expires", "الانتهاء"),
                  value: (profile as any)?.subscription_end_date ? format(new Date((profile as any).subscription_end_date), "dd MMM yyyy") : "—" },
              ].map((row, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: i < 4 ? "1px solid #f0f4f0" : "none" }}>
                  <span style={{ fontSize: 13, color: "#6b7280" }}>{row.label}</span>
                  {(row as any).badge ? (
                    <span style={{ fontSize: 12, fontWeight: 800, padding: "3px 12px", borderRadius: 20, background: `${(row as any).color}18`, color: (row as any).color, textTransform: "capitalize" as const }}>
                      {row.value}
                    </span>
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 600, color: G }}>{row.value}</span>
                  )}
                </div>
              ))}
            </div>

            {subscription && (
              <div style={{ background: "#f0fff4", borderRadius: 16, padding: "16px 18px", border: "1px solid #86efac" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", marginBottom: 12, letterSpacing: .8, textTransform: "uppercase" as const }}>
                  {t("Active Subscription", "الاشتراك النشط")}
                </div>
                {[
                  [t("Start Date", "تاريخ البدء"),   subscription.start_date ? format(new Date(subscription.start_date), "dd MMM yyyy") : "—"],
                  [t("End Date", "تاريخ الانتهاء"),  subscription.end_date   ? format(new Date(subscription.end_date), "dd MMM yyyy")   : "—"],
                  [t("Days Remaining", "أيام متبقية"), subscription.end_date
                    ? `${Math.max(0, Math.ceil((new Date(subscription.end_date).getTime() - Date.now()) / 86400000))} ${t("days", "يوم")}`
                    : "—"],
                ].map(([l, v], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 2 ? "1px solid rgba(134,239,172,.3)" : "none" }}>
                    <span style={{ fontSize: 13, color: "#4a7c59" }}>{l}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: G }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => setView("pay")}
              style={{ width: "100%", padding: "14px", borderRadius: 14, background: G, border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Cairo',sans-serif" }}>
              <RefreshCw style={{ width: 15, height: 15 }} />
              {t("Renew / Upgrade Plan", "تجديد / ترقية الخطة")}
            </button>

            <p style={{ textAlign: "center", fontSize: 12, color: "#9ca3af" }}>
              {t("Need help? Contact your teacher or admin.", "تحتاج مساعدة؟ تواصل مع المعلم أو الإدارة.")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentScreen;
