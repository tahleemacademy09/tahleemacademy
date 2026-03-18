import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  CreditCard, Shield, BookOpen, Video, ClipboardList,
  MessageCircle, BookMarked, CheckCircle, Clock, History,
  ChevronDown, ChevronUp, Download, AlertTriangle, Wifi,
  Star, Globe, ArrowRight, RefreshCw, Receipt, Calendar
} from "lucide-react";
import StandaloneNav from "@/components/layout/StandaloneNav";
import { format } from "date-fns";

declare global { interface Window { PaystackPop: any; } }

const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c", CREAM = "#fdf8f0";

const SYM: Record<string, string> = { NGN:"₦", USD:"$", GBP:"£", SAR:"﷼", EUR:"€" };
const fmtAmt = (n: number, cur = "NGN") => `${SYM[cur]||"₦"}${(n||0).toLocaleString()}`;

// ── Features included in all plans ───────────────────────────
const FEATURES = [
  { icon: BookOpen,      en:"All Level Courses",    ar:"جميع المستويات" },
  { icon: Video,         en:"Live Classes",          ar:"الحصص المباشرة" },
  { icon: Video,         en:"Recorded Sessions",     ar:"التسجيلات" },
  { icon: ClipboardList, en:"Exams & Tests",          ar:"الامتحانات" },
  { icon: BookMarked,    en:"Hifdh Revision",         ar:"مراجعة الحفظ" },
  { icon: MessageCircle, en:"Al-Majlis Chat",         ar:"المجلس" },
];

const PaymentScreen = () => {
  const navigate              = useNavigate();
  const { user, profile, hasRole } = useAuth();
  const { toast }             = useToast();
  const { t, language }       = useLanguage() as any;

  const [plans, setPlans]             = useState<any[]>([]);
  const [selectedPlan, setSelected]   = useState<any>(null);
  const [loading, setLoading]         = useState(true);
  const [paying, setPaying]           = useState(false);
  const [paystackLoaded, setPSLoaded] = useState(false);
  const [publicKey, setPubKey]        = useState("");
  const [history, setHistory]         = useState<any[]>([]);
  const [subscription, setSub]        = useState<any>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [graceLeft, setGraceLeft]     = useState<number|null>(null);
  const [activeView, setView]         = useState<"pay"|"history"|"status">("pay");
  const [detectedCurrency, setDetectedCurrency] = useState("NGN");

  // Detect user's likely currency from browser locale
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.startsWith("Africa/Lagos") || tz.startsWith("Africa/Abuja")) setDetectedCurrency("NGN");
    else if (tz.startsWith("Europe/London")) setDetectedCurrency("GBP");
    else if (tz.startsWith("America/")) setDetectedCurrency("USD");
    else if (tz.startsWith("Asia/Riyadh") || tz.startsWith("Asia/Dubai")) setDetectedCurrency("SAR");
    else setDetectedCurrency("USD");
  }, []);

  useEffect(() => {
    if (!user) { navigate("/login"); return; }
    if (hasRole("admin") || hasRole("teacher")) { navigate("/admin"); return; }
    loadAll();
    loadPaystack();
  }, [user, profile]);

  // Grace period countdown
  useEffect(() => {
    if (profile?.payment_status !== "grace" || !profile?.subscription_end_date) return;
    const end = new Date(profile.subscription_end_date).getTime();
    const tick = () => {
      const diff = Math.max(0, Math.ceil((end - Date.now()) / 86400000));
      setGraceLeft(diff);
    };
    tick();
    const iv = setInterval(tick, 60000);
    return () => clearInterval(iv);
  }, [profile]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [plansRes, histRes, subRes] = await Promise.all([
      supabase.from("payment_plans" as any).select("*").eq("is_active", true).order("amount"),
      supabase.from("payments" as any).select("*, payment_plans(name,currency)").eq("student_id", user!.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("student_subscriptions" as any).select("*").eq("student_id", user!.id).eq("status", "active").order("created_at", { ascending: false }).limit(1),
    ]);

    const pln = (plansRes.data || []) as any[];
    setPlans(pln);
    setHistory((histRes.data || []) as any[]);
    setSub((subRes.data?.[0]) || null);

    // Auto-select plan: match currency to detected region, prefer term
    const matchCur = pln.filter((p: any) => p.currency === detectedCurrency);
    const pool     = matchCur.length > 0 ? matchCur : pln;
    const level    = profile?.level || "beginner";
    const auto     = pool.find((p: any) => p.type === "term" && p.level === level)
                  || pool.find((p: any) => p.type === "term")
                  || pool[0];
    if (auto) setSelected(auto);

    setLoading(false);
  }, [user, profile, detectedCurrency]);

  const loadPaystack = () => {
    if (document.getElementById("paystack-js")) { setPSLoaded(true); return; }
    const s   = document.createElement("script");
    s.id      = "paystack-js";
    s.src     = "https://js.paystack.co/v2/inline.js";
    s.async   = true;
    s.onload  = () => setPSLoaded(true);
    document.head.appendChild(s);

    // Load public key from Supabase secret via edge function
    const key = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
    if (key) { setPubKey(key); return; }
    supabase.functions.invoke("get-paystack-key").then(({ data }) => {
      if (data?.key) setPubKey(data.key);
    });
  };

  const handlePayment = async () => {
    if (!selectedPlan || !user || !profile) return;
    if (!paystackLoaded || !window.PaystackPop) {
      toast({ title: t("Payment system loading…","نظام الدفع يتحمّل…"), variant: "destructive" }); return;
    }
    setPaying(true);
    const ref = `TAH-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;

    await supabase.from("payments" as any).insert({
      student_id: user.id, plan_id: selectedPlan.id,
      amount: selectedPlan.amount, currency: selectedPlan.currency || "NGN",
      status: "pending", type: "enrollment", paystack_reference: ref,
    });

    try {
      const popup = new window.PaystackPop();
      popup.newTransaction({
        key: publicKey,
        email: profile.email || user.email,
        amount: selectedPlan.amount * 100,
        currency: selectedPlan.currency || "NGN",
        ref,
        metadata: {
          student_id: user.id, plan_id: selectedPlan.id,
          student_name: profile.full_name, level: profile.level,
          custom_fields: [
            { display_name:"Student", variable_name:"student_name", value: profile.full_name || "" },
            { display_name:"Level",   variable_name:"level",        value: profile.level || "" },
          ],
        },
        onSuccess: async (res: any) => { await verifyPayment(ref, res); },
        onCancel: () => { toast({ title: t("Payment cancelled","تم إلغاء الدفع") }); setPaying(false); },
      });
    } catch {
      toast({ title: t("Payment failed to launch","فشل تشغيل الدفع"), variant: "destructive" });
      setPaying(false);
    }
  };

  const verifyPayment = async (ref: string, res: any) => {
    await supabase.from("payments" as any).update({
      status: "success",
      paystack_transaction_id: res?.trxref || res?.transaction,
      payment_method: "paystack",
      paid_at: new Date().toISOString(),
    }).eq("paystack_reference", ref);

    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + (selectedPlan.duration_months || 3));
    const endStr = endDate.toISOString().split("T")[0];

    await supabase.from("profiles").update({
      payment_status: "paid", subscription_end_date: endStr,
    } as any).eq("user_id", user!.id);

    const { data: pRec } = await supabase.from("payments" as any).select("id").eq("paystack_reference", ref).single() as any;
    await supabase.from("student_subscriptions" as any).insert({
      student_id: user!.id, plan_id: selectedPlan.id,
      payment_id: pRec?.id, status: "active",
      start_date: new Date().toISOString().split("T")[0], end_date: endStr,
    });

    toast({ title: "✅ " + t("Payment Successful! الحمد لله","تمّت عملية الدفع! الحمد لله") });
    setPaying(false);
    navigate("/student");
  };

  const handlePayLater = async () => {
    const graceEnd = new Date();
    graceEnd.setDate(graceEnd.getDate() + 7);
    await supabase.from("profiles").update({
      payment_status: "grace", subscription_end_date: graceEnd.toISOString().split("T")[0],
    } as any).eq("user_id", user!.id);
    toast({ title: t("7-day grace period started","بدأت فترة السماح 7 أيام") });
    navigate("/student");
  };

  const downloadReceipt = (p: any) => {
    const cur = p.payment_plans?.currency || "NGN";
    const lines = [
      "TAHLEEM ACADEMY — PAYMENT RECEIPT",
      "أكاديمية تعليم — إيصال الدفع",
      "─────────────────────────────────",
      `Reference:  ${p.paystack_reference || "—"}`,
      `Student:    ${profile?.full_name || "—"}`,
      `Email:      ${profile?.email || user?.email || "—"}`,
      `Plan:       ${p.payment_plans?.name || "—"}`,
      `Amount:     ${fmtAmt(p.amount, cur)}`,
      `Status:     ${p.status?.toUpperCase()}`,
      `Date:       ${format(new Date(p.paid_at || p.created_at), "dd MMM yyyy HH:mm")}`,
      "─────────────────────────────────",
      "Powered by Paystack · tahleemacademy.vercel.app",
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines], { type: "text/plain" }));
    a.download = `receipt-${p.paystack_reference || Date.now()}.txt`;
    a.click();
  };

  const isRTL = language === "ar";
  const isPaid = profile?.payment_status === "paid" || profile?.payment_status === "exempt" || profile?.is_payment_exempt;

  // Currency-filtered plans
  const ngnPlans = plans.filter((p: any) => (p.currency || "NGN") === "NGN" && p.type !== "private");
  const intlPlans = plans.filter((p: any) => (p.currency || "NGN") !== "NGN" && p.type !== "private");

  // Group by currency
  const intlByCur: Record<string, any[]> = {};
  intlPlans.forEach((p: any) => { const c = p.currency||"USD"; if (!intlByCur[c]) intlByCur[c] = []; intlByCur[c].push(p); });

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:`linear-gradient(135deg,${G},${GM})` }}>
      <div style={{ width:40, height:40, border:"4px solid rgba(201,168,76,.3)", borderTopColor:GOLD, borderRadius:"50%", animation:"spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(160deg,${G} 0%,${GM} 60%,#0a1f12 100%)`, fontFamily:"'Cairo',sans-serif", direction:isRTL?"rtl":"ltr" }}>
      <StandaloneNav />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Cairo:wght@400;600;700;900&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        .plan-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.2)!important}
        .pay-btn:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(201,168,76,.4)!important}
        .pay-btn:active{transform:translateY(0)}
        *{box-sizing:border-box}
      `}</style>

      <div style={{ maxWidth:580, margin:"0 auto", padding:"80px 16px 40px", animation:"fadeUp .5s ease" }}>

        {/* ── HEADER ── */}
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <p style={{ fontFamily:"'Amiri Quran',serif", fontSize:20, color:GOLD, margin:"0 0 6px", direction:"rtl" }}>
            بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
          </p>
          <h1 style={{ fontSize:26, fontWeight:900, color:"#fff", margin:"0 0 4px" }}>
            {isPaid ? t("Your Subscription","اشتراكك") : t("Complete Enrollment","أكمل التسجيل")}
          </h1>
          <p style={{ fontSize:13, color:"rgba(255,255,255,.55)", margin:0 }}>
            {isPaid
              ? t("Manage your subscription and payment history","إدارة اشتراكك وسجل مدفوعاتك")
              : t("Choose a plan and start your learning journey","اختر خطة وابدأ رحلتك التعليمية")}
          </p>
        </div>

        {/* ── GRACE PERIOD BANNER ── */}
        {profile?.payment_status === "grace" && graceLeft !== null && (
          <div style={{ background:"rgba(245,158,11,.15)", border:"1.5px solid rgba(245,158,11,.4)", borderRadius:14, padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:10 }}>
            <Clock style={{ width:20, height:20, color:"#f59e0b", flexShrink:0 }} />
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:"#fbbf24" }}>
                {t(`${graceLeft} day${graceLeft!==1?"s":""} remaining in grace period`,`${graceLeft} يوم متبقي في فترة السماح`)}
              </div>
              <div style={{ fontSize:11, color:"rgba(251,191,36,.7)" }}>
                {t("Complete payment to avoid losing access","أكمل الدفع لتجنب فقدان الوصول")}
              </div>
            </div>
          </div>
        )}

        {/* ── SUBSCRIPTION STATUS CARD (if paid) ── */}
        {isPaid && subscription && (
          <div style={{ background:"rgba(34,197,94,.1)", border:"1.5px solid rgba(34,197,94,.3)", borderRadius:16, padding:"16px 18px", marginBottom:20, display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:"rgba(34,197,94,.2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <CheckCircle style={{ width:22, height:22, color:"#22c55e" }} />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:800, color:"#fff" }}>{t("Active Subscription","اشتراك نشط")}</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,.6)", marginTop:2 }}>
                {t("Expires","ينتهي")} {subscription.end_date ? format(new Date(subscription.end_date), "dd MMM yyyy") : "—"}
              </div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:11, color:"rgba(255,255,255,.4)" }}>{t("Days left","أيام متبقية")}</div>
              <div style={{ fontSize:20, fontWeight:900, color:"#22c55e" }}>
                {subscription.end_date ? Math.max(0, Math.ceil((new Date(subscription.end_date).getTime() - Date.now()) / 86400000)) : "—"}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB BAR ── */}
        <div style={{ display:"flex", background:"rgba(255,255,255,.07)", borderRadius:12, padding:4, marginBottom:20, gap:4 }}>
          {[
            ["pay",     isPaid ? t("Renew","تجديد") : t("Pay","ادفع"),    CreditCard],
            ["history", t("History","السجل"),                              History],
            ["status",  t("Status","الحالة"),                              Star],
          ].map(([key, label, Icon]: any) => (
            <button key={key} onClick={()=>setView(key)}
              style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5, padding:"9px 8px", borderRadius:9, border:"none", cursor:"pointer", transition:"all .15s", fontFamily:"'Cairo',sans-serif",
                background: activeView===key ? "#fff" : "transparent",
                color:      activeView===key ? G     : "rgba(255,255,255,.55)",
                fontSize:12, fontWeight:activeView===key?800:500,
                boxShadow: activeView===key ? "0 2px 8px rgba(0,0,0,.15)" : "none" }}>
              <Icon style={{ width:13, height:13 }} />{label}
            </button>
          ))}
        </div>

        {/* ══════════ PAY TAB ══════════ */}
        {activeView==="pay" && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* Currency filter */}
            {intlPlans.length > 0 && (
              <div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,.4)", marginBottom:8, display:"flex", alignItems:"center", gap:5 }}>
                  <Globe style={{ width:12, height:12 }} />
                  {t("Select your currency","اختر عملتك")}
                  {detectedCurrency !== "NGN" && (
                    <span style={{ marginLeft:"auto", fontSize:10, color:GOLD, background:"rgba(201,168,76,.15)", borderRadius:10, padding:"1px 8px" }}>
                      🌍 {t("International detected","تم اكتشاف دولي")}
                    </span>
                  )}
                </div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {["NGN",...Object.keys(intlByCur)].map(cur=>(
                    <button key={cur} onClick={()=>{ const pool=(cur==="NGN"?ngnPlans:intlByCur[cur])||[]; setSelected(pool[0]||null); }}
                      style={{ padding:"5px 14px", borderRadius:20, border:`1.5px solid ${(selectedPlan?.currency||"NGN")===cur?"rgba(201,168,76,.8)":BORDER}`, background:(selectedPlan?.currency||"NGN")===cur?"rgba(201,168,76,.15)":"rgba(255,255,255,.05)", color:(selectedPlan?.currency||"NGN")===cur?GOLD:"rgba(255,255,255,.6)", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                      {SYM[cur]||cur} {cur}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Plans */}
            {[...(((selectedPlan?.currency||"NGN")==="NGN") ? ngnPlans : (intlByCur[selectedPlan?.currency||"NGN"]||[]))].map((plan: any) => {
              const sel = selectedPlan?.id === plan.id;
              const cur = plan.currency || "NGN";
              return (
                <div key={plan.id} className="plan-card" onClick={()=>setSelected(plan)}
                  style={{ background: sel ? `linear-gradient(135deg,rgba(201,168,76,.18),rgba(201,168,76,.08))` : "rgba(255,255,255,.07)", borderRadius:16, border:`2px solid ${sel?GOLD:"rgba(255,255,255,.1)"}`, padding:"18px 18px", cursor:"pointer", transition:"all .2s", position:"relative", overflow:"hidden" }}>
                  {sel && <div style={{ position:"absolute", top:0, right:0, width:0, height:0, borderStyle:"solid", borderWidth:"0 36px 36px 0", borderColor:`transparent ${GOLD} transparent transparent` }} />}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:15, fontWeight:800, color:"#fff" }}>{plan.name}</div>
                      {plan.name_ar && <div style={{ fontSize:13, color:GOLD, fontFamily:"'Amiri Quran',serif", direction:"rtl" }}>{plan.name_ar}</div>}
                      <div style={{ display:"flex", gap:8, marginTop:6, flexWrap:"wrap" }}>
                        {plan.duration_months && (
                          <span style={{ fontSize:11, padding:"2px 9px", borderRadius:20, background:"rgba(255,255,255,.1)", color:"rgba(255,255,255,.7)" }}>
                            <Calendar style={{ width:10, height:10, display:"inline", marginRight:4 }} />
                            {plan.duration_months} {t("months","شهور")}
                          </span>
                        )}
                        {plan.level && plan.level !== "all" && (
                          <span style={{ fontSize:11, padding:"2px 9px", borderRadius:20, background:"rgba(201,168,76,.15)", color:GOLD, fontWeight:600, textTransform:"capitalize" }}>
                            {plan.level}
                          </span>
                        )}
                        <span style={{ fontSize:11, padding:"2px 9px", borderRadius:20, background:"rgba(255,255,255,.08)", color:"rgba(255,255,255,.5)", textTransform:"capitalize" }}>
                          {plan.type}
                        </span>
                      </div>
                      {plan.description && <div style={{ fontSize:11, color:"rgba(255,255,255,.45)", marginTop:5, lineHeight:1.5 }}>{plan.description}</div>}
                    </div>
                    <div style={{ textAlign:"right", marginLeft:16 }}>
                      <div style={{ fontSize:26, fontWeight:900, color:sel?GOLD:"#fff" }}>
                        {fmtAmt(plan.amount, cur)}
                      </div>
                      {plan.duration_months && (
                        <div style={{ fontSize:10, color:"rgba(255,255,255,.4)" }}>
                          ≈ {fmtAmt(Math.round(plan.amount/plan.duration_months), cur)}/{t("mo","شهر")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* What's included */}
            {selectedPlan && (
              <div style={{ background:"rgba(255,255,255,.05)", borderRadius:14, padding:"14px 16px", border:"1px solid rgba(255,255,255,.08)" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,.5)", letterSpacing:.8, marginBottom:10, textTransform:"uppercase" }}>
                  {t("What's included","ما يشمل")}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {FEATURES.map((f, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:7 }}>
                      <CheckCircle style={{ width:13, height:13, color:"#22c55e", flexShrink:0 }} />
                      <span style={{ fontSize:12, color:"rgba(255,255,255,.7)" }}>{isRTL ? f.ar : f.en}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pay button */}
            <button onClick={handlePayment} disabled={paying||!selectedPlan||!publicKey}
              className="pay-btn"
              style={{ width:"100%", padding:"16px", borderRadius:16, background: paying ? "#7a9e88" : `linear-gradient(135deg,${GOLD},#a07828)`, border:"none", color:"#fff", fontSize:16, fontWeight:900, cursor:paying?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, transition:"all .2s", boxShadow:"0 4px 20px rgba(201,168,76,.3)", fontFamily:"'Cairo',sans-serif" }}>
              {paying ? (
                <><div style={{ width:20, height:20, border:"3px solid rgba(255,255,255,.3)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .8s linear infinite" }} />{t("Processing…","جارٍ المعالجة…")}</>
              ) : (
                <><CreditCard style={{ width:20, height:20 }} />{t("Pay Now","ادفع الآن")} — {selectedPlan ? fmtAmt(selectedPlan.amount, selectedPlan.currency) : "—"}<ArrowRight style={{ width:16, height:16 }} /></>
              )}
            </button>

            {/* Security */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, fontSize:11, color:"rgba(255,255,255,.35)" }}>
              <Shield style={{ width:12, height:12 }} />
              {t("256-bit SSL encryption · Secured by Paystack","تشفير SSL 256 بت · مؤمّن بواسطة Paystack")}
            </div>

            {/* Pay later */}
            {!isPaid && (
              <button onClick={handlePayLater}
                style={{ width:"100%", padding:"11px", borderRadius:12, background:"transparent", border:"1.5px solid rgba(255,255,255,.12)", color:"rgba(255,255,255,.5)", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'Cairo',sans-serif", transition:"border-color .15s" }}>
                <Clock style={{ width:13, height:13, display:"inline", marginRight:5 }} />
                {t("Pay Later (7-day grace period)","ادفع لاحقاً (7 أيام سماح)")}
              </button>
            )}
          </div>
        )}

        {/* ══════════ HISTORY TAB ══════════ */}
        {activeView==="history" && (
          <div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <span style={{ fontSize:13, color:"rgba(255,255,255,.5)" }}>{history.length} {t("transactions","معاملة")}</span>
              <button onClick={()=>loadAll()} style={{ display:"flex", alignItems:"center", gap:4, background:"none", border:"none", color:GOLD, fontSize:12, cursor:"pointer", fontFamily:"'Cairo',sans-serif" }}>
                <RefreshCw style={{ width:12, height:12 }} />{t("Refresh","تحديث")}
              </button>
            </div>

            {history.length === 0 ? (
              <div style={{ textAlign:"center", padding:"50px 20px", color:"rgba(255,255,255,.3)", fontSize:14 }}>
                <Receipt style={{ width:40, height:40, margin:"0 auto 12px", opacity:.3 }} />
                <div>{t("No payment history yet","لا يوجد سجل مدفوعات بعد")}</div>
              </div>
            ) : history.map((p: any, i: number) => {
              const cur     = p.payment_plans?.currency || "NGN";
              const isOk    = p.status === "success";
              const isFail  = p.status === "failed";
              return (
                <div key={p.id} style={{ background:"rgba(255,255,255,.06)", borderRadius:14, padding:"14px 16px", marginBottom:10, border:`1px solid rgba(255,255,255,${isOk?.12:.07})` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    {/* Status icon */}
                    <div style={{ width:38, height:38, borderRadius:11, background: isOk?"rgba(34,197,94,.15)":isFail?"rgba(239,68,68,.15)":"rgba(245,158,11,.15)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      {isOk  ? <CheckCircle style={{ width:18, height:18, color:"#22c55e" }} />
                              : isFail ? <AlertTriangle style={{ width:18, height:18, color:"#ef4444" }} />
                              : <Clock style={{ width:18, height:18, color:"#f59e0b" }} />}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#fff" }}>
                        {p.payment_plans?.name || t("Payment","دفعة")}
                      </div>
                      <div style={{ fontSize:11, color:"rgba(255,255,255,.4)", marginTop:2 }}>
                        {format(new Date(p.paid_at || p.created_at), "dd MMM yyyy · HH:mm")}
                      </div>
                      {p.paystack_reference && (
                        <div style={{ fontSize:10, fontFamily:"monospace", color:"rgba(255,255,255,.25)", marginTop:1 }}>
                          {p.paystack_reference}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:16, fontWeight:900, color: isOk?"#22c55e":isFail?"#ef4444":"#f59e0b" }}>
                        {fmtAmt(p.amount, cur)}
                      </div>
                      <div style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background: isOk?"rgba(34,197,94,.15)":isFail?"rgba(239,68,68,.15)":"rgba(245,158,11,.15)", color:isOk?"#22c55e":isFail?"#ef4444":"#f59e0b", fontWeight:700, marginTop:3 }}>
                        {p.status?.toUpperCase()}
                      </div>
                    </div>
                  </div>
                  {/* Download receipt (success only) */}
                  {isOk && (
                    <button onClick={()=>downloadReceipt(p)}
                      style={{ marginTop:10, display:"flex", alignItems:"center", gap:5, fontSize:11, color:GOLD, background:"rgba(201,168,76,.08)", border:"1px solid rgba(201,168,76,.2)", borderRadius:8, padding:"5px 12px", cursor:"pointer", fontFamily:"'Cairo',sans-serif" }}>
                      <Download style={{ width:11, height:11 }} />{t("Download Receipt","تنزيل الإيصال")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ══════════ STATUS TAB ══════════ */}
        {activeView==="status" && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {/* Account status */}
            <div style={{ background:"rgba(255,255,255,.07)", borderRadius:16, padding:"18px", border:"1px solid rgba(255,255,255,.1)" }}>
              <div style={{ fontSize:11, color:"rgba(255,255,255,.4)", marginBottom:12, letterSpacing:.8, textTransform:"uppercase" }}>
                {t("Account Status","حالة الحساب")}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {[
                  { label:t("Name","الاسم"),              value: profile?.full_name || "—" },
                  { label:t("Email","البريد"),             value: profile?.email || user?.email || "—" },
                  { label:t("Level","المستوى"),            value: profile?.level || "—" },
                  { label:t("Payment Status","حالة الدفع"), value: profile?.payment_status || "unpaid",
                    badge: true, color: profile?.payment_status==="paid"?"#22c55e":profile?.payment_status==="grace"?"#f59e0b":"#ef4444" },
                  { label:t("Subscription Expires","انتهاء الاشتراك"),
                    value: profile?.subscription_end_date ? format(new Date(profile.subscription_end_date), "dd MMM yyyy") : "—" },
                ].map((row, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingBottom:10, borderBottom:i<4?"1px solid rgba(255,255,255,.06)":"none" }}>
                    <span style={{ fontSize:12, color:"rgba(255,255,255,.45)" }}>{row.label}</span>
                    {(row as any).badge ? (
                      <span style={{ fontSize:12, fontWeight:800, padding:"3px 12px", borderRadius:20, background:`${(row as any).color}22`, color:(row as any).color, textTransform:"capitalize" }}>
                        {row.value}
                      </span>
                    ) : (
                      <span style={{ fontSize:13, fontWeight:600, color:"#fff" }}>{row.value}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Active subscription details */}
            {subscription && (
              <div style={{ background:"rgba(34,197,94,.08)", borderRadius:16, padding:"16px", border:"1px solid rgba(34,197,94,.2)" }}>
                <div style={{ fontSize:11, color:"rgba(255,255,255,.4)", marginBottom:10, letterSpacing:.8, textTransform:"uppercase" }}>
                  {t("Active Subscription","الاشتراك النشط")}
                </div>
                {[
                  [t("Start Date","تاريخ البدء"),  subscription.start_date ? format(new Date(subscription.start_date),"dd MMM yyyy") : "—"],
                  [t("End Date","تاريخ الانتهاء"), subscription.end_date   ? format(new Date(subscription.end_date),"dd MMM yyyy")   : "—"],
                  [t("Days Remaining","أيام متبقية"), subscription.end_date ? `${Math.max(0,Math.ceil((new Date(subscription.end_date).getTime()-Date.now())/86400000))} ${t("days","يوم")}` : "—"],
                ].map(([l, v], i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:i<2?"1px solid rgba(255,255,255,.06)":"none" }}>
                    <span style={{ fontSize:12, color:"rgba(255,255,255,.45)" }}>{l}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:"#22c55e" }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Renew CTA */}
            <button onClick={()=>setView("pay")}
              style={{ width:"100%", padding:"13px", borderRadius:14, background:`linear-gradient(135deg,${G},${GM})`, border:`1.5px solid rgba(201,168,76,.3)`, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, fontFamily:"'Cairo',sans-serif" }}>
              <RefreshCw style={{ width:15, height:15 }} />{t("Renew / Upgrade Plan","تجديد / ترقية الخطة")}
            </button>

            {/* Help */}
            <div style={{ textAlign:"center", fontSize:12, color:"rgba(255,255,255,.3)" }}>
              {t("Need help? Contact your teacher or admin","تحتاج مساعدة؟ تواصل مع المعلم أو الإدارة")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentScreen;
