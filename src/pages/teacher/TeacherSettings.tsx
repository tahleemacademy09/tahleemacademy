/*  src/pages/teacher/TeacherSettings.tsx — ENHANCED v2
    Tabs: Profile | Teaching | Notifications | Preferences | Payments | Security

    NEW in v2:
    ─────────────────────────────────────────────────────────────────────────
    • "Payments" tab — teacher's salary/payment history from admin
    • Bank Account Details section — input + Paystack account verification
    • Paystack bank list fetched live from public Paystack API
    ─────────────────────────────────────────────────────────────────────────
*/
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { useToast } from "@/hooks/use-toast";
import { enablePushNotifications } from "@/components/NotificationPermissionBanner";
import {
  Camera, Save, Lock, LogOut, Eye, EyeOff,
  Loader2, AlertTriangle, Trash2, Bell, BookOpen,
  User, Shield, Settings2, CheckCircle2,
  CreditCard, Banknote, CheckCircle, XCircle,
  Clock, TrendingUp, Download, ChevronDown, ChevronUp,
  Building2, Phone as PhoneIcon, BadgeCheck,
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#D4A843";

const inp: React.CSSProperties = {
  width: "100%", padding: "10px 13px", borderRadius: 10,
  border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none",
  background: "#FAFAFA", boxSizing: "border-box" as const,
  fontFamily: "'Cairo', system-ui, sans-serif", color: "#111",
};

const TABS = [
  { id: "profile",       icon: <User      size={14} />, label: "Profile"       },
  { id: "teaching",      icon: <BookOpen  size={14} />, label: "Teaching"      },
  { id: "notifications", icon: <Bell      size={14} />, label: "Notifications" },
  { id: "preferences",   icon: <Settings2 size={14} />, label: "Preferences"   },
  { id: "payments",      icon: <CreditCard size={14} />, label: "Payments"     },
  { id: "security",      icon: <Shield    size={14} />, label: "Security"      },
];

const SPECIALIZATIONS = [
  "Quran Recitation (Tajweed)","Quran Memorisation (Hifdh)","Arabic Language",
  "Islamic Studies (Fiqh)","Tawheed & Aqeedah","Hadith Sciences","Seerah",
  "Nahw & Sarf (Grammar)","Tafseer","Other",
];
const LEVELS_TAUGHT    = ["Beginners","Intermediate","Advanced","Children (5–10)","Teens (11–17)","Adults","All Levels"];
const AVAIL_DAYS       = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const AVAIL_TIMES      = ["Morning (6–12)","Afternoon (12–17)","Evening (17–21)","Night (21–23)"];

const PAYMENT_STATUS_CFG: Record<string, { label: string; bg: string; color: string; icon: any }> = {
  paid:    { label: "Paid",    bg: "#F0FFF4", color: "#16A34A", icon: CheckCircle },
  pending: { label: "Pending", bg: "#FFFBEB", color: "#D97706", icon: Clock },
  failed:  { label: "Failed",  bg: "#FEF2F2", color: "#DC2626", icon: XCircle },
};

const fmtAmt = (amt: number, currency = "NGN") => {
  const sym: Record<string, string> = { NGN: "₦", USD: "$", GBP: "£", SAR: "﷼" };
  return `${sym[currency] || "₦"}${(amt || 0).toLocaleString()}`;
};

/* ── Stable sub-components (defined outside to prevent remount on every render) ── */
const Sec = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", overflow: "hidden", marginBottom: 14 }}>
    <div style={{ padding: "10px 16px", background: "linear-gradient(90deg,#F9FAFB,#F3F4F6)", borderBottom: "1px solid #E5E7EB" }}>
      <p style={{ fontWeight: 800, fontSize: 11, color: "#6B7280", margin: 0, textTransform: "uppercase", letterSpacing: .8 }}>{title}</p>
    </div>
    <div style={{ padding: "14px 16px" }}>{children}</div>
  </div>
);
const Fld = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 12 }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>{label}</label>
    {children}
  </div>
);
const Tog = ({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid #F9FAFB" }}>
    <div>
      <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>{label}</p>
      {sub && <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{sub}</p>}
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);
const Chip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button onClick={onClick} style={{
    padding: "7px 13px", borderRadius: 20, border: `1.5px solid ${active ? G : "#E5E7EB"}`,
    background: active ? G : "#fff", color: active ? "#fff" : "#555",
    fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer", transition: "all .15s",
    display: "flex", alignItems: "center", gap: 5,
  }}>
    {active && <CheckCircle2 size={11} />}{label}
  </button>
);
const SaveBtn = ({ fn, saving }: { fn: () => void; saving: boolean }) => (
  <button onClick={fn} disabled={saving} style={{
    width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
    cursor: saving ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 14,
    color: "#fff", background: saving ? "#9CA3AF" : `linear-gradient(135deg,${G},${GM})`,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    boxShadow: saving ? "none" : "0 4px 16px rgba(6,78,59,.25)",
  }}>
    {saving ? <><Loader2 size={15} style={{ animation: "spin .8s linear infinite" }} /> Saving…</> : <><Save size={15} /> Save Changes</>}
  </button>
);

export default function TeacherSettings() {
  const { language, setLanguage } = useLanguage();
  const { user, signOut }          = useAuth();
  const { toast }                  = useToast();
  const navigate                   = useNavigate();
  const avatarRef                  = useRef<HTMLInputElement>(null);

  const [tab,             setTab]             = useState("profile");
  const [saving,          setSaving]          = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showDelete,      setShowDelete]      = useState(false);
  const [showPw,          setShowPw]          = useState(false);
  const [showPwVis,       setShowPwVis]       = useState(false);
  const [changingPw,      setChangingPw]      = useState(false);
  const [pw,              setPw]              = useState({ new: "", confirm: "" });
  const [pushBlocked,     setPushBlocked]     = useState(false);
  const [tgChatId,        setTgChatId]        = useState<string | null>(null);
  const [tgCode,          setTgCode]          = useState<string | null>(null);
  const [tgPolling,       setTgPolling]       = useState(false);

  // ── Payment state ────────────────────────────────────────────────────────
  const [teacherPayments,  setTeacherPayments]  = useState<any[]>([]);
  const [paymentLoading,   setPaymentLoading]   = useState(false);
  const [paymentStats,     setPaymentStats]     = useState({ totalEarned: 0, pending: 0, lastPaid: "" });
  const [expandedPay,      setExpandedPay]      = useState<string | null>(null);

  // ── Bank account state ───────────────────────────────────────────────────
  const [bankList,         setBankList]         = useState<any[]>([]);
  const [bankListLoading,  setBankListLoading]  = useState(false);
  const [bankForm,         setBankForm]         = useState({
    bank_code: "", bank_name: "", account_number: "", account_name: "",
    currency: "NGN",
  });
  const [verifying,        setVerifying]        = useState(false);
  const [verified,         setVerified]         = useState(false);
  const [savingBank,       setSavingBank]       = useState(false);
  const [existingBank,     setExistingBank]     = useState<any>(null);
  const [editingBank,      setEditingBank]      = useState(false);

  const [form, setForm] = useState({
    full_name: "", full_name_ar: "", phone: "", whatsapp: "",
    bio: "", gender: "", nationality: "", country: "", city: "",
    avatar_url: "", date_of_birth: "",
  });

  const [teaching, setTeaching] = useState({
    specializations:  [] as string[],
    levels_taught:    [] as string[],
    years_experience: "",
    qualifications:   "",
    teaching_bio:     "",
    available_days:   [] as string[],
    available_times:  [] as string[],
    max_students:     "20",
    session_duration: "60",
    accepts_private:  true,
    accepts_group:    true,
  });

  const [notifs, setNotifs] = useState({
    push_notifications:         false,
    email_notifications:        true,
    whatsapp_notifications:     false,
    class_reminder:             true,
    announcement_notifications: true,
    new_recording_alert:        false,
    new_student_assignment:     true,
    exam_submission_alert:      true,
    student_message_alert:      true,
    session_booking_alert:      true,
    grading_reminder:           true,
  });

  const [prefs, setPrefs] = useState({
    language: "en",
    dark_mode: false,
    autoplay_recordings: true,
    playback_speed: "1x",
    default_view: "grid",
    show_student_details: true,
    compact_timetable: false,
  });

  // ── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof Notification !== "undefined")
      setPushBlocked(Notification.permission === "denied");
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: p } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (p) setForm({
        full_name:     (p as any).full_name     || "",
        full_name_ar:  (p as any).full_name_ar  || "",
        phone:         (p as any).phone         || "",
        whatsapp:      (p as any).whatsapp      || "",
        bio:           (p as any).bio           || "",
        gender:        (p as any).gender        || "",
        nationality:   (p as any).nationality   || "",
        country:       (p as any).country       || "",
        city:          (p as any).city          || "",
        avatar_url:    (p as any).avatar_url    || "",
        date_of_birth: (p as any).date_of_birth || "",
      });

      const { data: tp } = await (supabase as any).from("teacher_profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (tp) setTeaching({
        specializations:  tp.specializations  || [],
        levels_taught:    tp.levels_taught    || [],
        years_experience: tp.years_experience || "",
        qualifications:   tp.qualifications   || "",
        teaching_bio:     tp.teaching_bio     || "",
        available_days:   tp.available_days   || [],
        available_times:  tp.available_times  || [],
        max_students:     tp.max_students?.toString()    || "20",
        session_duration: tp.session_duration?.toString() || "60",
        accepts_private:  tp.accepts_private  ?? true,
        accepts_group:    tp.accepts_group    ?? true,
      });

      const { data: pd } = await (supabase as any).from("student_preferences").select("*").eq("user_id", user.id).maybeSingle();
      if (pd) {
        const d = pd as any;
        setNotifs(n => ({ ...n,
          push_notifications:         (typeof Notification !== "undefined" && Notification.permission === "granted")
                                        ? (d.push_notifications ?? n.push_notifications)
                                        : false,
          email_notifications:        d.email_notifications        ?? n.email_notifications,
          whatsapp_notifications:     d.whatsapp_notifications     ?? n.whatsapp_notifications,
          class_reminder:             d.class_reminder             ?? n.class_reminder,
          announcement_notifications: d.announcement_notifications ?? n.announcement_notifications,
          new_recording_alert:        d.new_recording_alert        ?? n.new_recording_alert,
          new_student_assignment:     d.new_student_assignment     ?? n.new_student_assignment,
          exam_submission_alert:      d.exam_submission_alert      ?? n.exam_submission_alert,
          student_message_alert:      d.student_message_alert      ?? n.student_message_alert,
          session_booking_alert:      d.session_booking_alert      ?? n.session_booking_alert,
          grading_reminder:           d.grading_reminder           ?? n.grading_reminder,
        }));
        setPrefs(pr => ({ ...pr,
          language:            d.language             ?? pr.language,
          dark_mode:           d.dark_mode            ?? pr.dark_mode,
          autoplay_recordings: d.autoplay_recordings  ?? pr.autoplay_recordings,
          playback_speed:      d.playback_speed       ?? pr.playback_speed,
          default_view:        d.default_subject_view ?? pr.default_view,
        }));
      }

      const { data: tg } = await supabase.from("profiles")
        .select("telegram_chat_id, telegram_link_code").eq("user_id", user.id).maybeSingle();
      if (tg) { setTgChatId((tg as any).telegram_chat_id ?? null); setTgCode((tg as any).telegram_link_code ?? null); }

      // Load bank details
      const { data: bank } = await (supabase as any).from("teacher_bank_accounts")
        .select("*").eq("user_id", user.id).maybeSingle();
      if (bank) {
        setExistingBank(bank);
        setBankForm({
          bank_code:      bank.bank_code      || "",
          bank_name:      bank.bank_name      || "",
          account_number: bank.account_number || "",
          account_name:   bank.account_name   || "",
          currency:       bank.currency       || "NGN",
        });
        setVerified(bank.is_verified ?? false);
        setEditingBank(false);
      } else {
        setEditingBank(true);
      }
    })();
  }, [user]);

  // Load payments when switching to payments tab
  useEffect(() => {
    if (tab === "payments" && user) loadTeacherPayments();
  }, [tab, user]);

  // Load bank list when payments tab is active
  useEffect(() => {
    if (tab === "payments" && bankList.length === 0) loadBankList();
  }, [tab]);

  useEffect(() => {
    if (!tgPolling || !user || tgChatId) return;
    const t = setInterval(async () => {
      const { data } = await supabase.from("profiles")
        .select("telegram_chat_id").eq("user_id", user.id).maybeSingle();
      if ((data as any)?.telegram_chat_id) {
        setTgChatId((data as any).telegram_chat_id);
        setTgCode(null); setTgPolling(false);
        toast({ title: "✅ Telegram linked!" });
      }
    }, 4000);
    return () => clearInterval(t);
  }, [tgPolling, user, tgChatId, toast]);

  // ── Payment loaders ──────────────────────────────────────────────────────
  const loadTeacherPayments = async () => {
    if (!user) return;
    setPaymentLoading(true);
    try {
      const { data } = await (supabase as any)
        .from("teacher_payments")
        .select("*, profiles!teacher_payments_paid_by_fkey(full_name)")
        .eq("teacher_id", user.id)
        .order("payment_date", { ascending: false });

      const rows = data || [];
      setTeacherPayments(rows);

      const totalEarned = rows.filter((r: any) => r.status === "paid").reduce((s: number, r: any) => s + (r.amount || 0), 0);
      const pending     = rows.filter((r: any) => r.status === "pending").reduce((s: number, r: any) => s + (r.amount || 0), 0);
      const lastPaid    = rows.find((r: any) => r.status === "paid")?.payment_date || "";
      setPaymentStats({ totalEarned, pending, lastPaid });
    } finally {
      setPaymentLoading(false);
    }
  };

  const loadBankList = async () => {
    setBankListLoading(true);
    try {
      const res  = await fetch("https://api.paystack.co/bank?currency=NGN&perPage=100");
      const json = await res.json();
      if (json.status) setBankList(json.data || []);
    } catch {
      // Fallback popular Nigerian banks
      setBankList([
        { code: "044", name: "Access Bank" },
        { code: "050", name: "Ecobank Nigeria" },
        { code: "011", name: "First Bank of Nigeria" },
        { code: "214", name: "First City Monument Bank (FCMB)" },
        { code: "070", name: "Fidelity Bank" },
        { code: "058", name: "Guaranty Trust Bank (GTB)" },
        { code: "030", name: "Heritage Bank" },
        { code: "301", name: "Jaiz Bank" },
        { code: "082", name: "Keystone Bank" },
        { code: "526", name: "Moniepoint MFB" },
        { code: "076", name: "Polaris Bank" },
        { code: "101", name: "Providus Bank" },
        { code: "221", name: "Stanbic IBTC Bank" },
        { code: "068", name: "Standard Chartered" },
        { code: "232", name: "Sterling Bank" },
        { code: "100", name: "Suntrust Bank" },
        { code: "032", name: "Union Bank of Nigeria" },
        { code: "033", name: "United Bank for Africa (UBA)" },
        { code: "215", name: "Unity Bank" },
        { code: "035", name: "Wema Bank" },
        { code: "057", name: "Zenith Bank" },
        { code: "000013", name: "GTBank Mobile Money" },
        { code: "50211", name: "Kuda Bank" },
        { code: "565", name: "Carbon" },
        { code: "090115", name: "PalmPay" },
        { code: "120001", name: "9PSB (9 Payment Service Bank)" },
        { code: "999992", name: "Opay (OPay Digital Services)" },
      ]);
    } finally {
      setBankListLoading(false);
    }
  };

  const verifyAccount = async () => {
    if (!bankForm.account_number || bankForm.account_number.length < 10 || !bankForm.bank_code) {
      toast({ title: "Enter a 10-digit account number and select your bank", variant: "destructive" });
      return;
    }
    setVerifying(true);
    setVerified(false);
    try {
      // Use Paystack's public resolve endpoint (needs CORS proxy or backend edge function)
      // We call our Supabase edge function to keep the secret key server-side
      const { data, error } = await (supabase as any).functions.invoke("verify-bank-account", {
        body: { account_number: bankForm.account_number, bank_code: bankForm.bank_code },
      });
      if (error || !data?.account_name) {
        // Fallback: mark as unverified but allow saving with a warning
        toast({
          title: "⚠️ Could not auto-verify",
          description: "Please double-check your account details. Admin will manually verify before payments.",
          variant: "destructive",
        });
        setVerified(false);
      } else {
        setBankForm(f => ({ ...f, account_name: data.account_name }));
        setVerified(true);
        toast({ title: `✅ Account verified: ${data.account_name}` });
      }
    } catch {
      toast({ title: "Verification failed — check your details and try again", variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const saveBank = async () => {
    if (!user) return;
    if (!bankForm.account_number || !bankForm.bank_code || !bankForm.account_name.trim()) {
      toast({ title: "Fill in all bank details", description: "Bank, account number, and account name are all required.", variant: "destructive" });
      return;
    }
    setSavingBank(true);
    const { error } = await (supabase as any).from("teacher_bank_accounts").upsert({
      user_id:        user.id,
      bank_code:      bankForm.bank_code,
      bank_name:      bankForm.bank_name,
      account_number: bankForm.account_number,
      account_name:   bankForm.account_name,
      currency:       bankForm.currency,
      is_verified:    verified,
      updated_at:     new Date().toISOString(),
    }, { onConflict: "user_id" });
    setSavingBank(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else {
      const saved = { ...bankForm, is_verified: verified };
      setExistingBank(saved);
      setEditingBank(false);
      if (verified) {
        toast({ title: "✅ Bank details saved! Admin will use this for salary payments." });
      } else {
        toast({
          title: "✅ Bank details saved",
          description: "Auto-verification failed — admin will manually verify your account before payments.",
        });
      }
    }
  };

  // ── Existing save handlers ───────────────────────────────────────────────
  const saveProfile = async () => {
    if (!user) return; setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      full_name: form.full_name||null, full_name_ar: form.full_name_ar||null,
      phone: form.phone||null, whatsapp: form.whatsapp||null,
      bio: form.bio||null, gender: form.gender||null,
      nationality: form.nationality||null, country: form.country||null,
      city: form.city||null, date_of_birth: form.date_of_birth||null,
      user_id: user.id, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setSaving(false);
    error ? toast({ title: "Save failed", description: error.message, variant: "destructive" })
           : toast({ title: "✅ Profile saved!" });
  };

  const saveTeaching = async () => {
    if (!user) return; setSaving(true);
    const { error } = await (supabase as any).from("teacher_profiles").upsert({
      user_id: user.id, ...teaching,
      max_students:     parseInt(teaching.max_students)    || 20,
      session_duration: parseInt(teaching.session_duration) || 60,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setSaving(false);
    error ? toast({ title: "Save failed", description: error.message, variant: "destructive" })
           : toast({ title: "✅ Teaching profile saved!" });
  };

  const handlePushToggle = async (enabled: boolean) => {
    if (!user) return;
    if (enabled) {
      if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) {
        toast({ title: "Not supported", description: "Your browser doesn't support push notifications.", variant: "destructive" });
        return;
      }
      const result = await enablePushNotifications(user.id);
      if (result === "granted") {
        setNotifs(n => ({ ...n, push_notifications: true }));
        setPushBlocked(false);
        try {
          const reg = await navigator.serviceWorker.ready;
          reg.showNotification("🔔 Tahleem Academy", {
            body: "You'll now receive student alerts and class reminders on this device — even when the app is closed.",
            icon: "/icons/icon-192x192.png",
            badge: "/icons/icon-96x96.png",
            tag: "push-enabled-confirm",
            vibrate: [200, 100, 200],
          });
        } catch {}
        toast({ title: "✅ Push notifications enabled!" });
      } else if (result === "denied") {
        setPushBlocked(true);
        toast({ title: "Notifications blocked", description: "Allow notifications in your browser site settings, then try again.", variant: "destructive" });
      }
    } else {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await (supabase as any).from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", sub.endpoint);
        }
      } catch {}
      setNotifs(n => ({ ...n, push_notifications: false }));
      toast({ title: "Push notifications disabled" });
    }
  };

  const saveNotifs = async () => {
    if (!user) return; setSaving(true);
    const { push_notifications: _skip, ...notifsToSave } = notifs;
    const { error } = await (supabase as any).from("student_preferences")
      .upsert({ user_id: user.id, ...notifsToSave, updated_at: new Date().toISOString() } as any, { onConflict: "user_id" });
    setSaving(false);
    error ? toast({ title: "Save failed", description: error.message, variant: "destructive" })
           : toast({ title: "✅ Notifications saved!" });
  };

  const savePrefs = async () => {
    if (!user) return; setSaving(true);
    const { error } = await (supabase as any).from("student_preferences").upsert({
      user_id: user.id, language: prefs.language, dark_mode: prefs.dark_mode,
      autoplay_recordings: prefs.autoplay_recordings, playback_speed: prefs.playback_speed,
      default_subject_view: prefs.default_view, updated_at: new Date().toISOString(),
    } as any, { onConflict: "user_id" });
    setSaving(false);
    if (!error) { if (prefs.language !== language) setLanguage(prefs.language as any); toast({ title: "✅ Preferences saved!" }); }
    else toast({ title: "Save failed", description: error.message, variant: "destructive" });
  };

  const changePassword = async () => {
    if (pw.new !== pw.confirm) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    if (pw.new.length < 8)     { toast({ title: "Min 8 characters",       variant: "destructive" }); return; }
    setChangingPw(true);
    const { error } = await supabase.auth.updateUser({ password: pw.new });
    setChangingPw(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "✅ Password updated!" }); setShowPw(false); setPw({ new: "", confirm: "" }); }
  };

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !user) return;
    setAvatarUploading(true);
    const path = `avatars/${user.id}.${file.name.split(".").pop()}`;
    const { error: upErr } = await storageSupabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { toast({ title: "Upload failed", description: upErr.message, variant: "destructive" }); setAvatarUploading(false); return; }
    const { data } = storageSupabase.storage.from("avatars").getPublicUrl(path);
    setForm(f => ({ ...f, avatar_url: data.publicUrl + "?t=" + Date.now() }));
    await supabase.from("profiles").upsert({ user_id: user.id, avatar_url: data.publicUrl, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    setAvatarUploading(false);
    toast({ title: "✅ Photo updated!" });
  };

  const generateTgCode = async () => {
    if (!user) return;
    const code = `${user.id.slice(0, 6)}-${Math.random().toString(36).slice(2, 8)}`;
    await supabase.from("profiles").update({ telegram_link_code: code }).eq("user_id", user.id);
    setTgCode(code); setTgPolling(true);
  };
  const unlinkTelegram = async () => {
    if (!user) return;
    await supabase.from("profiles").update({ telegram_chat_id: null, telegram_link_code: null } as any).eq("user_id", user.id);
    setTgChatId(null); setTgCode(null); setTgPolling(false);
    toast({ title: "✅ Telegram unlinked" });
  };

  const toggleMulti = (arr: string[], val: string, set: (a: string[]) => void) =>
    set(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);

  const initials = (form.full_name || user?.email || "T")[0].toUpperCase();

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "'Cairo', system-ui, sans-serif" }}>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes fadeUp  { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:none } }
        @keyframes shimmer { 0% { background-position:-200% 0 } 100% { background-position:200% 0 } }
        .pay-row:hover     { background: #F9FAFB !important; }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ background: `linear-gradient(135deg,${G},${GM})`, boxShadow: "0 4px 20px rgba(6,78,59,.3)" }}>
        <div style={{ padding: "20px 16px 16px", display: "flex", alignItems: "center", gap: 14, maxWidth: 680, margin: "0 auto" }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{ width: 62, height: 62, borderRadius: "50%", border: "3px solid rgba(255,255,255,.35)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.15)" }}>
              {form.avatar_url
                ? <img src={form.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                : <span style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>{initials}</span>}
              {avatarUploading && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%" }}>
                  <Loader2 size={18} color="#fff" style={{ animation: "spin .8s linear infinite" }} />
                </div>
              )}
            </div>
            <input ref={avatarRef} id="ts-avatar" type="file" accept="image/*"
              style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }} onChange={uploadAvatar} />
            <label htmlFor="ts-avatar" style={{ position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderRadius: "50%", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,.2)" }}>
              <Camera size={12} color={G} />
            </label>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: "#fff" }}>{form.full_name || "My Settings"}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.65)", marginTop: 2 }}>{user?.email}</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 5, padding: "3px 10px", borderRadius: 20, background: "rgba(212,168,67,.25)", border: "1px solid rgba(212,168,67,.4)" }}>
              <BookOpen size={10} color={GOLD} />
              <span style={{ fontSize: 10, fontWeight: 700, color: GOLD }}>TEACHER</span>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 2, overflowX: "auto", padding: "0 10px", maxWidth: 680, margin: "0 auto", scrollbarWidth: "none" as const }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "9px 14px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12,
              whiteSpace: "nowrap", borderRadius: "10px 10px 0 0",
              display: "flex", alignItems: "center", gap: 5, transition: "all .15s",
              background: tab === t.id ? "#F3F4F6" : "transparent",
              color: tab === t.id ? G : "rgba(255,255,255,.7)",
            }}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div style={{ padding: "16px 14px 40px", maxWidth: 680, margin: "0 auto", animation: "fadeUp .3s ease" }}>

        {/* ════════════════════════════════════════════════════════
            PROFILE
        ════════════════════════════════════════════════════════ */}
        {tab === "profile" && <>
          <Sec title="Personal Information">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Fld label="Full Name (English)">
                <input style={inp} value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="e.g. Abdullah Hassan" />
              </Fld>
              <Fld label="الاسم الكامل (عربي)">
                <input style={{ ...inp, direction: "rtl" }} value={form.full_name_ar} onChange={e => setForm(f => ({ ...f, full_name_ar: e.target.value }))} placeholder="مثلاً: عبد الله حسن" />
              </Fld>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Fld label="Phone"><input style={inp} type="tel" placeholder="+234 800 000 0000" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></Fld>
              <Fld label="WhatsApp"><input style={inp} type="tel" placeholder="+234 800 000 0000" value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} /></Fld>
            </div>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "-6px 0 10px" }}>📱 Include country code — used for class reminders via WhatsApp</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Fld label="Gender">
                <select style={inp} value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                  <option value="">Prefer not to say</option>
                  <option value="male">Male / ذكر</option>
                  <option value="female">Female / أنثى</option>
                </select>
              </Fld>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <Fld label="Country"><input style={inp} value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} /></Fld>
              <Fld label="City"><input style={inp} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></Fld>
              <Fld label="Nationality"><input style={inp} value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} /></Fld>
            </div>
          </Sec>
          <Sec title="Short Bio">
            <Fld label="About You (visible to students)">
              <textarea style={{ ...inp, minHeight: 88, resize: "vertical" as const, lineHeight: 1.6 }}
                value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                placeholder="Brief introduction about yourself, your background, and teaching style…" />
            </Fld>
          </Sec>
          <SaveBtn fn={saveProfile} saving={saving} />
        </>}

        {/* ════════════════════════════════════════════════════════
            TEACHING
        ════════════════════════════════════════════════════════ */}
        {tab === "teaching" && <>
          <Sec title="Specialisations">
            <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 10px" }}>Select all subjects you teach</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SPECIALIZATIONS.map(s => (
                <Chip key={s} label={s} active={teaching.specializations.includes(s)}
                  onClick={() => toggleMulti(teaching.specializations, s, v => setTeaching(t => ({ ...t, specializations: v })))} />
              ))}
            </div>
          </Sec>
          <Sec title="Levels You Teach">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {LEVELS_TAUGHT.map(l => (
                <Chip key={l} label={l} active={teaching.levels_taught.includes(l)}
                  onClick={() => toggleMulti(teaching.levels_taught, l, v => setTeaching(t => ({ ...t, levels_taught: v })))} />
              ))}
            </div>
          </Sec>
          <Sec title="Qualifications & Experience">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <Fld label="Years of Teaching Experience">
                <select style={inp} value={teaching.years_experience} onChange={e => setTeaching(t => ({ ...t, years_experience: e.target.value }))}>
                  <option value="">Select…</option>
                  {["Less than 1 year","1–2 years","3–5 years","6–10 years","10+ years"].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </Fld>
              <Fld label="Highest Qualification">
                <select style={inp} value={teaching.qualifications} onChange={e => setTeaching(t => ({ ...t, qualifications: e.target.value }))}>
                  <option value="">Select…</option>
                  {["Ijazah in Quran Recitation","Ijazah with Sanad","Bachelor's in Islamic Studies","Master's in Islamic Studies","PhD in Islamic Studies","Diploma (Dars-e-Nizami)","Self-Taught / Informal Study","Other"].map(q => <option key={q} value={q}>{q}</option>)}
                </select>
              </Fld>
            </div>
            <Fld label="Professional Teaching Bio">
              <textarea style={{ ...inp, minHeight: 88, resize: "vertical" as const, lineHeight: 1.6 }}
                value={teaching.teaching_bio} onChange={e => setTeaching(t => ({ ...t, teaching_bio: e.target.value }))}
                placeholder="Your credentials, teaching approach, and what makes your sessions effective…" />
            </Fld>
          </Sec>
          <Sec title="Availability">
            <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 10px" }}>Days available to teach</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {AVAIL_DAYS.map(d => (
                <Chip key={d} label={d} active={teaching.available_days.includes(d)}
                  onClick={() => toggleMulti(teaching.available_days, d, v => setTeaching(t => ({ ...t, available_days: v })))} />
              ))}
            </div>
            <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 10px" }}>Preferred time slots</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {AVAIL_TIMES.map(tm => (
                <Chip key={tm} label={tm} active={teaching.available_times.includes(tm)}
                  onClick={() => toggleMulti(teaching.available_times, tm, v => setTeaching(t => ({ ...t, available_times: v })))} />
              ))}
            </div>
          </Sec>
          <Sec title="Session Preferences">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <Fld label="Default Session Duration">
                <select style={inp} value={teaching.session_duration} onChange={e => setTeaching(t => ({ ...t, session_duration: e.target.value }))}>
                  {["30","45","60","90","120"].map(d => <option key={d} value={d}>{d} min</option>)}
                </select>
              </Fld>
              <Fld label="Max Students (Group Classes)">
                <select style={inp} value={teaching.max_students} onChange={e => setTeaching(t => ({ ...t, max_students: e.target.value }))}>
                  {["5","10","15","20","25","30","40","Unlimited"].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </Fld>
            </div>
            <Tog label="Accept Private Sessions" sub="1-on-1 with individual students"
              checked={teaching.accepts_private} onChange={v => setTeaching(t => ({ ...t, accepts_private: v }))} />
            <Tog label="Accept Group Classes" sub="Multiple students in one session"
              checked={teaching.accepts_group} onChange={v => setTeaching(t => ({ ...t, accepts_group: v }))} />
          </Sec>
          <SaveBtn fn={saveTeaching} saving={saving} />
        </>}

        {/* ════════════════════════════════════════════════════════
            NOTIFICATIONS
        ════════════════════════════════════════════════════════ */}
        {tab === "notifications" && <>
          {pushBlocked && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "12px 14px", marginBottom: 12, display: "flex", gap: 10 }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>🔕</span>
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#991B1B", margin: "0 0 3px" }}>Notifications blocked</p>
                <p style={{ fontSize: 12, color: "#B91C1C", margin: 0, lineHeight: 1.5 }}>
                  Browser → Site Settings → Notifications → <strong>allow</strong> for <em>tahleemacademy.vercel.app</em>, then refresh.
                </p>
              </div>
            </div>
          )}

          {/* Telegram */}
          <div style={{ background: tgChatId ? "#ECFDF5" : "#EFF6FF", border: `1px solid ${tgChatId ? "#86EFAC" : "#BFDBFE"}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 22 }}>✈️</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 14, color: G, margin: 0 }}>Telegram Notifications</p>
                <p style={{ fontSize: 11, color: "#475569", margin: "2px 0 0" }}>
                  {tgChatId ? "Linked — receiving alerts on Telegram." : "Get all alerts on Telegram, even when offline."}
                </p>
              </div>
              {tgChatId && <button onClick={unlinkTelegram} style={{ padding: "6px 12px", border: "1px solid #DC2626", color: "#DC2626", background: "#fff", borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Unlink</button>}
            </div>
            {!tgChatId && !tgCode && <button onClick={generateTgCode} style={{ padding: "9px 16px", border: "none", background: G, color: "#fff", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Link Telegram</button>}
            {!tgChatId && tgCode && (
              <div style={{ fontSize: 12, color: "#1E3A8A", lineHeight: 1.6 }}>
                <p style={{ margin: "0 0 6px" }}>1. Open <a href={`https://t.me/Tahleembot?start=${tgCode}`} target="_blank" rel="noreferrer" style={{ color: G, fontWeight: 700 }}>@Tahleembot</a> on Telegram.</p>
                <p style={{ margin: "0 0 6px" }}>2. Tap <strong>Start</strong> (or send <code>/start {tgCode}</code>).</p>
                <p style={{ margin: 0, color: "#64748B" }}>Waiting… <Loader2 size={12} style={{ display: "inline", animation: "spin 1s linear infinite" }} /></p>
              </div>
            )}
          </div>

          <Sec title="Channels">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F9FAFB" }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>Phone &amp; Web Notifications</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>
                  {typeof Notification === "undefined"
                    ? "Not supported on this browser"
                    : Notification.permission === "denied"
                    ? "Blocked — allow in browser site settings to enable"
                    : notifs.push_notifications
                    ? "On — alerts arrive even when the app is closed"
                    : "Off — tap to receive student and class alerts on this device"}
                </p>
              </div>
              <Switch
                checked={notifs.push_notifications}
                disabled={typeof Notification !== "undefined" && Notification.permission === "denied"}
                onCheckedChange={handlePushToggle}
              />
            </div>
            <Tog label="Email Notifications" sub="Academy updates and messages"
              checked={notifs.email_notifications} onChange={v => setNotifs(n => ({ ...n, email_notifications: v }))} />
            <Tog label="WhatsApp Notifications"
              sub={form.whatsapp || form.phone ? `Will message: ${form.whatsapp || form.phone}` : "Add a number in the Profile tab first"}
              checked={notifs.whatsapp_notifications} onChange={v => setNotifs(n => ({ ...n, whatsapp_notifications: v }))} />
            <Tog label="Announcements" sub="Academy-wide messages from admin"
              checked={notifs.announcement_notifications} onChange={v => setNotifs(n => ({ ...n, announcement_notifications: v }))} />
          </Sec>
          <Sec title="Teaching Alerts">
            <Tog label="Session Booking Requests" sub="When a student books a session with you"
              checked={notifs.session_booking_alert} onChange={v => setNotifs(n => ({ ...n, session_booking_alert: v }))} />
            <Tog label="New Student Assignment" sub="When a student is assigned to your class"
              checked={notifs.new_student_assignment} onChange={v => setNotifs(n => ({ ...n, new_student_assignment: v }))} />
            <Tog label="Exam Submission Alerts" sub="When a student submits an exam for grading"
              checked={notifs.exam_submission_alert} onChange={v => setNotifs(n => ({ ...n, exam_submission_alert: v }))} />
            <Tog label="Grading Reminders" sub="Reminder when pending exams need grading"
              checked={notifs.grading_reminder} onChange={v => setNotifs(n => ({ ...n, grading_reminder: v }))} />
            <Tog label="Student Messages" sub="When a student sends you a direct message"
              checked={notifs.student_message_alert} onChange={v => setNotifs(n => ({ ...n, student_message_alert: v }))} />
          </Sec>
          <Sec title="Classes & Recordings">
            <Tog label="Class Reminders" sub="15 min and 5 min before class starts"
              checked={notifs.class_reminder} onChange={v => setNotifs(n => ({ ...n, class_reminder: v }))} />
            <Tog label="New Recordings" sub="When a recording is uploaded to your class"
              checked={notifs.new_recording_alert} onChange={v => setNotifs(n => ({ ...n, new_recording_alert: v }))} />
          </Sec>
          <SaveBtn fn={saveNotifs} saving={saving} />
        </>}

        {/* ════════════════════════════════════════════════════════
            PREFERENCES
        ════════════════════════════════════════════════════════ */}
        {tab === "preferences" && <>
          <Sec title="Language & Display">
            <Fld label="Interface Language">
              <select style={inp} value={prefs.language} onChange={e => setPrefs(p => ({ ...p, language: e.target.value }))}>
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </select>
            </Fld>
            <Tog label="Dark Mode" sub="Coming soon" checked={prefs.dark_mode} onChange={v => setPrefs(p => ({ ...p, dark_mode: v }))} />
          </Sec>
          <Sec title="Recordings & Playback">
            <Tog label="Autoplay Recordings" sub="Play the next recording automatically"
              checked={prefs.autoplay_recordings} onChange={v => setPrefs(p => ({ ...p, autoplay_recordings: v }))} />
            <Fld label="Default Playback Speed">
              <select style={inp} value={prefs.playback_speed} onChange={e => setPrefs(p => ({ ...p, playback_speed: e.target.value }))}>
                {["0.75x","1x","1.25x","1.5x","2x"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Fld>
          </Sec>
          <Sec title="Dashboard Layout">
            <Fld label="Default Content View">
              <select style={inp} value={prefs.default_view} onChange={e => setPrefs(p => ({ ...p, default_view: e.target.value }))}>
                <option value="grid">Grid</option>
                <option value="list">List</option>
              </select>
            </Fld>
            <Tog label="Show Full Student Details" sub="Show student name, level and progress in lists"
              checked={prefs.show_student_details} onChange={v => setPrefs(p => ({ ...p, show_student_details: v }))} />
            <Tog label="Compact Timetable View" sub="Condensed rows in the timetable"
              checked={prefs.compact_timetable} onChange={v => setPrefs(p => ({ ...p, compact_timetable: v }))} />
          </Sec>
          <SaveBtn fn={savePrefs} saving={saving} />
        </>}

        {/* ════════════════════════════════════════════════════════
            PAYMENTS  ← NEW TAB
        ════════════════════════════════════════════════════════ */}
        {tab === "payments" && <>

          {/* ── Summary cards ─────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
            {[
              {
                icon: TrendingUp, bg: "#ECFDF5", color: "#16A34A",
                label: "Total Earned", value: fmtAmt(paymentStats.totalEarned),
              },
              {
                icon: Clock, bg: "#FFFBEB", color: "#D97706",
                label: "Pending", value: fmtAmt(paymentStats.pending),
              },
              {
                icon: Banknote, bg: "#EFF6FF", color: "#3B82F6",
                label: "Last Paid", value: paymentStats.lastPaid
                  ? new Date(paymentStats.lastPaid).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                  : "—",
              },
            ].map(({ icon: Icon, bg, color, label, value }) => (
              <div key={label} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", padding: "12px 10px", textAlign: "center" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 6px" }}>
                  <Icon size={16} color={color} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#111" }}>{value}</div>
                <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* ── Bank Account Details ───────────────────────────── */}
          <Sec title="💳 Bank Account Details">
            {/* ── READ-ONLY VIEW (when saved bank exists and not editing) ── */}
            {existingBank && !editingBank ? (
              <div>
                {/* Verification status badge */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                  borderRadius: 10, marginBottom: 14,
                  background: existingBank.is_verified ? "#ECFDF5" : "#FFFBEB",
                  border: `1px solid ${existingBank.is_verified ? "#86EFAC" : "#FDE68A"}`,
                }}>
                  {existingBank.is_verified
                    ? <><BadgeCheck size={16} color="#16A34A" /><span style={{ fontSize: 12, fontWeight: 700, color: "#15803D" }}>Account Verified</span></>
                    : <><AlertTriangle size={16} color="#D97706" /><span style={{ fontSize: 12, fontWeight: 700, color: "#92400E" }}>Not yet verified — admin will confirm before payments</span></>
                  }
                </div>

                {/* Detail rows */}
                {[
                  { label: "Bank", value: existingBank.bank_name || existingBank.bank_code },
                  { label: "Account Number", value: existingBank.account_number },
                  { label: "Account Name", value: existingBank.account_name },
                  { label: "Currency", value: existingBank.currency || "NGN" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #F3F4F6" }}>
                    <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: 13, color: "#111", fontWeight: 700 }}>{value || "—"}</span>
                  </div>
                ))}

                <button
                  onClick={() => setEditingBank(true)}
                  style={{
                    marginTop: 14, width: "100%", padding: "11px 0", borderRadius: 11,
                    border: `1.5px solid ${G}`, background: "#fff", color: G,
                    fontWeight: 700, fontSize: 13, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  }}
                >
                  ✏️ Edit Bank Details
                </button>
              </div>
            ) : (
              /* ── EDIT FORM ── */
              <div>
                {/* Cancel button if editing existing */}
                {existingBank && (
                  <button
                    onClick={() => {
                      setBankForm({
                        bank_code:      existingBank.bank_code      || "",
                        bank_name:      existingBank.bank_name      || "",
                        account_number: existingBank.account_number || "",
                        account_name:   existingBank.account_name   || "",
                        currency:       existingBank.currency       || "NGN",
                      });
                      setVerified(existingBank.is_verified ?? false);
                      setEditingBank(false);
                    }}
                    style={{
                      marginBottom: 12, padding: "6px 14px", borderRadius: 8,
                      border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer",
                      fontSize: 12, fontWeight: 600, color: "#6B7280",
                    }}
                  >
                    ← Cancel
                  </button>
                )}

                <Fld label="Currency">
                  <select style={inp} value={bankForm.currency} onChange={e => setBankForm(f => ({ ...f, currency: e.target.value }))}>
                    <option value="NGN">NGN — Nigerian Naira</option>
                    <option value="USD">USD — US Dollar</option>
                    <option value="GBP">GBP — British Pound</option>
                    <option value="SAR">SAR — Saudi Riyal</option>
                  </select>
                </Fld>

                <Fld label="Bank">
                  {bankListLoading
                    ? <div style={{ ...inp, display: "flex", alignItems: "center", gap: 8, color: "#9CA3AF" }}><Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> Loading banks…</div>
                    : <select style={inp} value={bankForm.bank_code} onChange={e => {
                        const selected = bankList.find(b => b.code === e.target.value);
                        setBankForm(f => ({ ...f, bank_code: e.target.value, bank_name: selected?.name || "" }));
                        setVerified(false);
                      }}>
                        <option value="">Select your bank…</option>
                        {bankList.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
                      </select>
                  }
                </Fld>

                <Fld label="Account Number">
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      style={{ ...inp, flex: 1, letterSpacing: 1 }}
                      type="text"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="10-digit account number"
                      value={bankForm.account_number}
                      onChange={e => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setBankForm(f => ({ ...f, account_number: v, account_name: "" }));
                        setVerified(false);
                      }}
                    />
                    <button
                      onClick={verifyAccount}
                      disabled={verifying || bankForm.account_number.length < 10 || !bankForm.bank_code}
                      style={{
                        padding: "0 14px", borderRadius: 10, border: "none", cursor: "pointer",
                        fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
                        background: verifying ? "#9CA3AF" : G, color: "#fff",
                        display: "flex", alignItems: "center", gap: 6,
                        opacity: bankForm.account_number.length < 10 || !bankForm.bank_code ? 0.5 : 1,
                      }}
                    >
                      {verifying
                        ? <><Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> Checking…</>
                        : verified
                        ? <><CheckCircle size={13} /> Verified</>
                        : "Verify"}
                    </button>
                  </div>
                </Fld>

                {/* Account Name — auto-filled by Verify, or entered manually */}
                <Fld label="Account Name">
                  <div style={{ position: "relative" }}>
                    <input
                      style={{ ...inp, paddingRight: bankForm.account_name ? 36 : 13 }}
                      type="text"
                      placeholder="e.g. MUHAMMED ABDULLAHI (auto-filled or enter manually)"
                      value={bankForm.account_name}
                      onChange={e => setBankForm(f => ({ ...f, account_name: e.target.value }))}
                    />
                    {verified && bankForm.account_name && (
                      <CheckCircle size={14} color="#16A34A"
                        style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)" }} />
                    )}
                  </div>
                  {!verified && bankForm.account_number.length === 10 && bankForm.bank_code && !bankForm.account_name && (
                    <p style={{ fontSize: 11, color: "#D97706", margin: "4px 0 0" }}>
                      ⚠ Click Verify to auto-fill, or type your account name manually
                    </p>
                  )}
                </Fld>

                <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 14px", lineHeight: 1.5 }}>
                  🔒 Your bank details are encrypted and only visible to the academy admin for salary disbursements.
                </p>

                {/* Save disabled until all 3 fields filled */}
                {(() => {
                  const canSave = !!bankForm.account_number && !!bankForm.bank_code && !!bankForm.account_name.trim();
                  return (
                    <button
                      onClick={saveBank}
                      disabled={savingBank || !canSave}
                      style={{
                        width: "100%", padding: "12px 0", borderRadius: 12, border: "none",
                        cursor: savingBank || !canSave ? "not-allowed" : "pointer",
                        fontWeight: 800, fontSize: 14, color: "#fff",
                        background: savingBank || !canSave ? "#9CA3AF" : `linear-gradient(135deg,${G},${GM})`,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        boxShadow: canSave ? "0 4px 16px rgba(6,78,59,.25)" : "none",
                      }}
                    >
                      {savingBank
                        ? <><Loader2 size={15} style={{ animation: "spin .8s linear infinite" }} /> Saving…</>
                        : <><Building2 size={15} /> Save Bank Details</>}
                    </button>
                  );
                })()}
              </div>
            )}
          </Sec>

          {/* ── Payment History ────────────────────────────────── */}
          <Sec title="📋 Payment History">
            {paymentLoading ? (
              <div style={{ textAlign: "center", padding: "30px 0", color: "#9CA3AF" }}>
                <Loader2 size={22} style={{ animation: "spin .8s linear infinite", margin: "0 auto 8px", display: "block" }} />
                <p style={{ fontSize: 13, margin: 0 }}>Loading payment history…</p>
              </div>
            ) : teacherPayments.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 0" }}>
                <Banknote size={36} color="#D1D5DB" style={{ margin: "0 auto 10px", display: "block" }} />
                <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>No payment records yet</p>
                <p style={{ fontSize: 11, color: "#D1D5DB", margin: "4px 0 0" }}>Payments made by admin will appear here</p>
              </div>
            ) : (
              <div>
                {teacherPayments.map((pay: any) => {
                  const cfg = PAYMENT_STATUS_CFG[pay.status] || PAYMENT_STATUS_CFG.pending;
                  const Icon = cfg.icon;
                  const isOpen = expandedPay === pay.id;
                  return (
                    <div key={pay.id} className="pay-row" style={{
                      borderRadius: 12, border: "1px solid #E5E7EB", marginBottom: 8,
                      overflow: "hidden", cursor: "pointer", background: "#fff",
                      transition: "background .15s",
                    }}>
                      {/* Row header */}
                      <div
                        onClick={() => setExpandedPay(isOpen ? null : pay.id)}
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}
                      >
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Icon size={16} color={cfg.color} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "#111" }}>
                            {pay.description || pay.payment_type || "Salary Payment"}
                          </div>
                          <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                            {pay.payment_date ? new Date(pay.payment_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontWeight: 900, fontSize: 14, color: "#111" }}>
                            {fmtAmt(pay.amount, pay.currency)}
                          </div>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 10, fontWeight: 700 }}>
                            <Icon size={9} />{cfg.label}
                          </span>
                        </div>
                        {isOpen ? <ChevronUp size={14} color="#9CA3AF" /> : <ChevronDown size={14} color="#9CA3AF" />}
                      </div>

                      {/* Expanded details */}
                      {isOpen && (
                        <div style={{ padding: "0 14px 14px", borderTop: "1px solid #F3F4F6" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                            {[
                              { label: "Payment Method", val: pay.payment_method || "Bank Transfer" },
                              { label: "Reference",      val: pay.reference      || "—" },
                              { label: "Period",         val: pay.period         || "—" },
                              { label: "Processed by",   val: pay.profiles?.full_name || "Admin" },
                            ].map(({ label, val }) => (
                              <div key={label}>
                                <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2 }}>{label}</div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{val}</div>
                              </div>
                            ))}
                          </div>
                          {pay.notes && (
                            <div style={{ marginTop: 10, padding: "8px 10px", background: "#F9FAFB", borderRadius: 8 }}>
                              <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2 }}>Notes</div>
                              <div style={{ fontSize: 12, color: "#374151" }}>{pay.notes}</div>
                            </div>
                          )}
                          {pay.receipt_url && (
                            <a
                              href={pay.receipt_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10,
                                padding: "7px 12px", borderRadius: 8, border: `1px solid ${G}`,
                                color: G, fontWeight: 700, fontSize: 12, textDecoration: "none",
                              }}
                            >
                              <Download size={12} /> Download Receipt
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Sec>
        </>}

        {/* ════════════════════════════════════════════════════════
            SECURITY
        ════════════════════════════════════════════════════════ */}
        {tab === "security" && <>
          <Sec title="Account Security">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: "1px solid #F3F4F6" }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>Password</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Change your login password</p>
              </div>
              <button onClick={() => setShowPw(true)} style={{ padding: "7px 14px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", gap: 5 }}>
                <Lock size={12} /> Change
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: "1px solid #F3F4F6" }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>Email</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{user?.email}</p>
              </div>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#DCFCE7", color: "#166534", fontWeight: 700 }}>✓ Verified</span>
            </div>
            <div style={{ padding: "11px 0" }}>
              <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: "0 0 3px" }}>Account Type</p>
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>Teacher — managed by admin. Contact admin to update your role.</p>
            </div>
          </Sec>
          <Sec title="Active Session">
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#F9FAFB", borderRadius: 10, border: "1px solid #E5E7EB", marginBottom: 6 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: G, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{initials}</span>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#111" }}>{form.full_name || user?.email}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>Teacher · Tahleem Academy</div>
              </div>
            </div>
          </Sec>
          <Sec title="Session Management">
            <button onClick={async () => { await signOut(); navigate("/login"); }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderRadius: 12, background: "#FFF7ED", border: "1px solid #FED7AA", cursor: "pointer", width: "100%", marginBottom: 10 }}>
              <LogOut size={16} color="#D97706" />
              <div style={{ textAlign: "left" }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#D97706", margin: 0 }}>Sign Out</p>
                <p style={{ fontSize: 11, color: "#92400E", margin: 0 }}>Log out of this device</p>
              </div>
            </button>
            <button onClick={() => setShowDelete(true)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderRadius: 12, background: "#FEF2F2", border: "1px solid #FECACA", cursor: "pointer", width: "100%" }}>
              <Trash2 size={16} color="#DC2626" />
              <div style={{ textAlign: "left" }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#DC2626", margin: 0 }}>Delete Account</p>
                <p style={{ fontSize: 11, color: "#991B1B", margin: 0 }}>Permanently remove your account and all data</p>
              </div>
            </button>
          </Sec>
        </>}
      </div>

      {/* ── Change Password Dialog ──────────────────────────────────────────── */}
      <Dialog open={showPw} onOpenChange={v => !v && setShowPw(false)}>
        <DialogContent style={{ maxWidth: 400, borderRadius: 20, padding: 0, overflow: "hidden" }}>
          <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "18px 20px" }}>
            <h2 style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0 }}>🔒 Change Password</h2>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ position: "relative" }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>New Password</label>
              <input type={showPwVis ? "text" : "password"} value={pw.new}
                onChange={e => setPw(p => ({ ...p, new: e.target.value }))}
                style={{ ...inp, paddingRight: 40 }} placeholder="Minimum 8 characters" />
              <button onClick={() => setShowPwVis(v => !v)} style={{ position: "absolute", right: 10, bottom: 9, background: "none", border: "none", cursor: "pointer" }}>
                {showPwVis ? <EyeOff size={15} color="#9CA3AF" /> : <Eye size={15} color="#9CA3AF" />}
              </button>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>Confirm Password</label>
              <input type="password" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} style={inp} />
            </div>
            {pw.new && pw.confirm && pw.new !== pw.confirm && <p style={{ fontSize: 12, color: "#DC2626", margin: 0 }}>⚠️ Passwords don't match</p>}
            <button onClick={changePassword} disabled={changingPw || !pw.new || pw.new !== pw.confirm}
              style={{ padding: "12px 0", borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 700, color: "#fff", background: changingPw || !pw.new || pw.new !== pw.confirm ? "#9CA3AF" : `linear-gradient(135deg,${G},${GM})`, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {changingPw ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Changing…</> : "Update Password"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Account Dialog ───────────────────────────────────────────── */}
      <Dialog open={showDelete} onOpenChange={v => !v && setShowDelete(false)}>
        <DialogContent style={{ maxWidth: 360, borderRadius: 20, padding: 24, textAlign: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <AlertTriangle size={24} color="#DC2626" />
          </div>
          <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Delete Account?</h3>
          <p style={{ fontSize: 12, color: "#6B7280", marginBottom: 18, lineHeight: 1.6 }}>
            Permanently removes your teacher account, all classes, student assignments, and grading history. Cannot be undone — contact admin if you just need a break.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setShowDelete(false)} style={{ flex: 1, padding: 11, borderRadius: 11, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Cancel</button>
            <button style={{ flex: 1, padding: 11, borderRadius: 11, border: "none", background: "#DC2626", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Delete</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
