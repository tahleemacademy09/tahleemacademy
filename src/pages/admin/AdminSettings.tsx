/* src/pages/admin/AdminSettings.tsx
   ─────────────────────────────────────────────────────────────────────────
   Unified Admin Settings — four tabs, end-to-end connected:

   👤 Profile     — name (EN/AR), phone, WhatsApp, bio, avatar upload
   🏫 Academy     — academy status, term, academic year, holiday message,
                    resume date → writes to academy_settings table.
                    Quick-links to PaymentSettings & RegistrationSettings.
   🔔 Notifications — admin notification preferences (saved to admin_preferences)
   🔒 Security    — change password, verified email badge, sign out

   Design: matches student ProfileSettings green design system, inline styles only.
   ─────────────────────────────────────────────────────────────────────────
*/
import { useState, useEffect, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "@/integrations/supabase/storageClient";
import { useAcademySettings } from "@/hooks/useAcademySettings";
import { useHifdhSettings } from "@/hooks/useHifdhSettings";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Camera, Save, Lock, LogOut, Eye, EyeOff, Loader2,
  ExternalLink, School, Bell, ShieldCheck, ChevronRight,
  CreditCard, UserCog, Calendar, AlertTriangle, CheckCircle,
  Sun, Moon, Coffee,
} from "lucide-react";
import { enablePushNotifications, hardResetPushNotifications } from "@/components/NotificationPermissionBanner";

/* ── Palette ────────────────────────────────────────────────────── */
const G    = "#064E3B";
const G2   = "#065F46";
const GOLD = "#D4A017";

/* ── Shared input style ─────────────────────────────────────────── */
const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 10,
  border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none",
  background: "#FAFAFA", boxSizing: "border-box" as const,
  fontFamily: "'Cairo', sans-serif",
};

const TABS = [
  { id: "profile",       emoji: "👤", label: "Profile"       },
  { id: "academy",       emoji: "🏫", label: "Academy"       },
  { id: "notifications", emoji: "🔔", label: "Notifications" },
  { id: "hifdh",         emoji: "📖", label: "Hifdh"         },
  { id: "security",      emoji: "🔒", label: "Security"      },
];

/* ── Academy status options ─────────────────────────────────────── */
const STATUS_OPTIONS = [
  { value: "active",       label: "Active",       emoji: "✅", color: "#166534", bg: "#DCFCE7" },
  { value: "holiday",      label: "Holiday",      emoji: "🌙", color: "#92400E", bg: "#FEF3C7" },
  { value: "maintenance",  label: "Maintenance",  emoji: "🔧", color: "#1E3A8A", bg: "#DBEAFE" },
];

const TERMS = [
  { value: "first",  label: "First Term"  },
  { value: "second", label: "Second Term" },
  { value: "third",  label: "Third Term"  },
  { value: "summer", label: "Summer"      },
];

/* ════════════════════════════════════════════════════════════════ */
/* Stable sub-components — defined outside to prevent keyboard dismiss on re-render */
const Sec = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", overflow: "hidden", marginBottom: 14 }}>
    <div style={{ padding: "10px 16px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
      <p style={{ fontWeight: 700, fontSize: 12, color: "#6B7280", margin: 0, textTransform: "uppercase", letterSpacing: .5 }}>{title}</p>
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
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F9FAFB" }}>
    <div>
      <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>{label}</p>
      {sub && <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{sub}</p>}
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);
const SaveBtn = ({ fn, saving, busy }: { fn: () => void; saving: boolean; busy?: boolean }) => (
  <button onClick={fn} disabled={busy ?? saving}
    style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", cursor: (busy ?? saving) ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 14, color: "#fff", background: (busy ?? saving) ? "#9CA3AF" : G, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Cairo', sans-serif" }}>
    {(busy ?? saving)
      ? <><Loader2 size={15} style={{ animation: "spin .8s linear infinite" }} /> Saving…</>
      : <><Save size={15} /> Save Changes</>}
  </button>
);
const QuickLink = ({ icon: Icon, label, to, onNavigate, color = G }: { icon: any; label: string; to: string; onNavigate: (path: string) => void; color?: string }) => (
  <button onClick={() => onNavigate(to)}
    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "12px 14px", borderRadius: 12, background: "#F9FAFB", border: "1.5px solid #E5E7EB", cursor: "pointer", marginBottom: 8 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: color + "15", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={16} color={color} />
      </div>
      <span style={{ fontWeight: 700, fontSize: 13, color: "#374151", fontFamily: "'Cairo', sans-serif" }}>{label}</span>
    </div>
    <ChevronRight size={15} color="#9CA3AF" />
  </button>
);

/* ════════════════════════════════════════════════════════════════ */
export default function AdminSettings() {
  const { language, setLanguage } = useLanguage();
  const { user, signOut, refreshProfile }          = useAuth();
  const { toast }                  = useToast();
  const navigate                   = useNavigate();
  const avatarRef                  = useRef<HTMLInputElement>(null);
  const { settings, loading: acLoading, updateMultiple } = useAcademySettings();
  const [notifyStudents, setNotifyStudents] = useState(true);
  const [prevAcademyStatus, setPrevAcademyStatus] = useState<string | null>(null);
  const { settings: hifdhSettings, loading: hifdhLoading, save: saveHifdh } = useHifdhSettings();

  const [searchParams]             = useSearchParams();
  const [tab,             setTab]             = useState(() => searchParams.get("tab") || "profile");
  const [saving,          setSaving]          = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showPw,          setShowPw]          = useState(false);
  const [showPwVis,       setShowPwVis]       = useState(false);
  const [changingPw,      setChangingPw]      = useState(false);
  const [pw,              setPw]              = useState({ new: "", confirm: "" });
  const [acSaving,        setAcSaving]        = useState(false);
  const [hifdhSaving,     setHifdhSaving]     = useState(false);
  const [hifdhDraft,      setHifdhDraft]      = useState({ violation_limit: 5, pass_mark: 55, proctoring_enabled: false });

  /* ── Profile ─────────────────────────────────────────────────── */
  const [form, setForm] = useState({
    full_name: "", full_name_ar: "", phone: "", whatsapp: "",
    bio: "", country: "", city: "", avatar_url: "",
  });

  /* ── Academy (local draft, synced from useAcademySettings) ────── */
  const [academy, setAcademy] = useState({
    academy_status:       "active",
    current_term:         "first",
    current_academic_year:"2025/2026",
    holiday_message:      "",
    holiday_message_ar:   "",
    resume_date:          "",
    maintenance_bypass_user_ids: "",
  });

  /* ── Notification preferences ────────────────────────────────── */
  const [notifs, setNotifs] = useState({
    push_notifications:         false,
    email_notifications:        true,
    whatsapp_notifications:     false,
    new_registration_alert:     true,
    payment_alert:              true,
    exam_submission_alert:      true,
    recitation_submission_alert:true,
    student_complaint_alert:    true,
    daily_summary_email:        false,
    announcement_notifications: true,
  });

  /* ── Load profile ────────────────────────────────────────────── */
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: p } = await supabase
        .from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (p) setForm({
        full_name:    (p as any).full_name    || "",
        full_name_ar: (p as any).full_name_ar || "",
        phone:        (p as any).phone        || "",
        whatsapp:     (p as any).whatsapp     || "",
        bio:          (p as any).bio          || "",
        country:      (p as any).country      || "",
        city:         (p as any).city         || "",
        avatar_url:   (p as any).avatar_url   || "",
      });

      /* Load admin notification prefs */
      const { data: np } = await supabase
        .from("admin_preferences" as any).select("*").eq("user_id", user.id).maybeSingle();
      if (np) {
        const d = np as any;
        setNotifs(n => ({
          push_notifications:          (typeof Notification !== "undefined" && Notification.permission === "granted")
                                         ? (d.push_notifications ?? n.push_notifications)
                                         : false,
          email_notifications:         d.email_notifications         ?? n.email_notifications,
          whatsapp_notifications:      d.whatsapp_notifications      ?? n.whatsapp_notifications,
          new_registration_alert:      d.new_registration_alert      ?? n.new_registration_alert,
          payment_alert:               d.payment_alert               ?? n.payment_alert,
          exam_submission_alert:       d.exam_submission_alert       ?? n.exam_submission_alert,
          recitation_submission_alert: d.recitation_submission_alert ?? n.recitation_submission_alert,
          student_complaint_alert:     d.student_complaint_alert     ?? n.student_complaint_alert,
          daily_summary_email:         d.daily_summary_email         ?? n.daily_summary_email,
          announcement_notifications:  d.announcement_notifications  ?? n.announcement_notifications,
        }));
      }
    })();
  }, [user]);

  /* ── Sync academy settings once loaded ──────────────────────── */
  useEffect(() => {
    if (!acLoading) {
      setAcademy({
        academy_status:        settings.academy_status        || "active",
        current_term:          settings.current_term          || "first",
        current_academic_year: settings.current_academic_year || "2025/2026",
        holiday_message:       settings.holiday_message       || "",
        holiday_message_ar:    settings.holiday_message_ar    || "",
        resume_date:           settings.resume_date           || "",
        maintenance_bypass_user_ids: settings.maintenance_bypass_user_ids || "",
      });
      setPrevAcademyStatus((prev) => prev ?? (settings.academy_status || "active"));
    }
  }, [acLoading, settings]);

  /* ── Sync hifdh settings once loaded ────────────────────────── */
  useEffect(() => {
    if (!hifdhLoading) {
      setHifdhDraft({
        violation_limit: hifdhSettings.violation_limit,
        pass_mark: hifdhSettings.pass_mark,
        proctoring_enabled: hifdhSettings.proctoring_enabled,
      });
    }
  }, [hifdhLoading, hifdhSettings]);

  /* ── Save profile ────────────────────────────────────────────── */
  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert(
      { user_id: user.id, ...form, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    setSaving(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else       toast({ title: "✅ Profile saved!" });
  };

  /* ── Notify students of an academy status change ────────────────
     Reuses the exact same `notifications` table pattern as
     NotificationManagement.tsx — insert one row per recipient, the
     trg_dispatch_notification DB trigger handles push delivery. */
  const notifyStatusChange = async (status: string) => {
    const { data } = await supabase.from("user_roles").select("user_id").eq("role", "student");
    const userIds = (data ?? []).map((u: any) => u.user_id);
    if (userIds.length === 0) return;

    const copy = status === "maintenance"
      ? {
          title: "🔧 Scheduled Maintenance",
          title_ar: "صيانة مجدولة",
          message: academy.holiday_message ||
            "As-salamu alaykum wa rahmatullah. The academy is currently under scheduled maintenance, in sha Allah. Please check back soon.",
          message_ar: academy.holiday_message_ar ||
            "السلام عليكم ورحمة الله. الأكاديمية حالياً تحت الصيانة إن شاء الله. يرجى المراجعة لاحقاً.",
        }
      : status === "holiday"
      ? {
          title: "🌙 Academy Holiday",
          title_ar: "الأكاديمية في إجازة",
          message: academy.holiday_message ||
            "As-salamu alaykum. The academy is currently on holiday. We'll be back soon, in sha Allah.",
          message_ar: academy.holiday_message_ar ||
            "السلام عليكم. الأكاديمية في إجازة حالياً. سنعود قريباً إن شاء الله.",
        }
      : {
          title: "✅ We're Back Online",
          title_ar: "لقد عدنا الآن",
          message: "Alhamdulillah, Tahleem Academy is back online and ready for you.",
          message_ar: "الحمد لله، أكاديمية التحليم عادت للعمل وجاهزة لكم.",
        };

    const rows = userIds.map((user_id: string) => ({
      user_id,
      type: "announcement",
      priority: status === "active" ? "normal" : "high",
      title: copy.title,
      title_ar: copy.title_ar,
      message: copy.message,
      message_ar: copy.message_ar,
      link: null,
    }));

    await supabase.from("notifications").insert(rows);
  };

  /* ── Save academy settings ───────────────────────────────────── */
  const saveAcademy = async () => {
    if (!user) return;
    setAcSaving(true);
    await updateMultiple({
      academy_status:        academy.academy_status,
      current_term:          academy.current_term,
      current_academic_year: academy.current_academic_year,
      holiday_message:       academy.holiday_message        || null,
      holiday_message_ar:    academy.holiday_message_ar     || null,
      resume_date:           academy.resume_date            || null,
      maintenance_bypass_user_ids: academy.maintenance_bypass_user_ids || null,
    }, user.id);

    const statusChanged = prevAcademyStatus !== null && prevAcademyStatus !== academy.academy_status;
    if (notifyStudents && statusChanged) {
      await notifyStatusChange(academy.academy_status);
    }
    setPrevAcademyStatus(academy.academy_status);

    setAcSaving(false);
    toast({
      title: "✅ Academy settings saved!",
      description: notifyStudents && statusChanged ? "Students have been notified." : undefined,
    });
  };

  /* ── Push notification toggle ─────────────────────────────── */
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
        try {
          const reg = await navigator.serviceWorker.ready;
          reg.showNotification("🔔 Tahleem Academy", {
            body: "You'll now receive platform alerts on this device — even when the app is closed.",
            icon: "/icons/icon-192x192.png",
            badge: "/icons/icon-96x96.png",
            tag: "push-enabled-confirm",
          });
        } catch {}
        toast({ title: "✅ Push notifications enabled!" });
      } else if (result === "denied") {
        toast({ title: "Notifications blocked", description: "Allow notifications in your browser site settings, then try again.", variant: "destructive" });
      } else {
        // "error" or any other unexpected outcome — surface it so the admin
        // isn't left staring at a silently-off toggle with no explanation.
        toast({
          title: "Couldn't enable push notifications",
          description: "Something went wrong setting up push on this device. Please refresh and try again, or check that your browser allows notifications for this site.",
          variant: "destructive",
        });
      }
    } else {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await supabase.from("push_subscriptions" as any).delete().eq("user_id", user.id).eq("endpoint", sub.endpoint);
        }
      } catch {}
      setNotifs(n => ({ ...n, push_notifications: false }));
      toast({ title: "Push notifications disabled" });
    }
  };

  /* ── Master "All Notifications" toggle ────────────────────────
     ON hard-resets push (recovers an admin who previously blocked/ignored
     the permission prompt) then switches every channel on. OFF unsubscribes
     push and switches every channel off. Saves immediately either way. */
  const [masterToggling, setMasterToggling] = useState(false);
  const allNotifsOn = Object.values(notifs).every(Boolean);

  const handleMasterToggle = async (v: boolean) => {
    if (!user) return;
    setMasterToggling(true);
    if (v) {
      const result = await hardResetPushNotifications(user.id);
      if (result === "denied") {
        setMasterToggling(false);
        toast({ title: "Notifications blocked", description: "Allow notifications in your browser site settings, then try again.", variant: "destructive" });
        return;
      }
      const next = {
        push_notifications: result === "granted", email_notifications: true, whatsapp_notifications: true,
        new_registration_alert: true, payment_alert: true, exam_submission_alert: true,
        recitation_submission_alert: true, student_complaint_alert: true,
        daily_summary_email: true, announcement_notifications: true,
      };
      setNotifs(next);
      const { push_notifications: _skip, ...toSave } = next;
      await supabase.from("admin_preferences" as any)
        .upsert({ user_id: user.id, ...toSave, updated_at: new Date().toISOString() } as any, { onConflict: "user_id" });
      toast({ title: "✅ All notifications turned on" });
    } else {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
        await supabase.from("push_subscriptions" as any).delete().eq("user_id", user.id);
      } catch {}
      const next = {
        push_notifications: false, email_notifications: false, whatsapp_notifications: false,
        new_registration_alert: false, payment_alert: false, exam_submission_alert: false,
        recitation_submission_alert: false, student_complaint_alert: false,
        daily_summary_email: false, announcement_notifications: false,
      };
      setNotifs(next);
      const { push_notifications: _skip, ...toSave } = next;
      await supabase.from("admin_preferences" as any)
        .upsert({ user_id: user.id, ...toSave, updated_at: new Date().toISOString() } as any, { onConflict: "user_id" });
      toast({ title: "All notifications turned off" });
    }
    setMasterToggling(false);
  };

  /* ── Save notification preferences ──────────────────────────── */
  const saveNotifs = async () => {
    if (!user) return;
    setSaving(true);
    const { push_notifications: _skip, ...notifsToSave } = notifs;
    const { error } = await supabase
      .from("admin_preferences" as any)
      .upsert(
        { user_id: user.id, ...notifsToSave, updated_at: new Date().toISOString() } as any,
        { onConflict: "user_id" }
      );
    setSaving(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else       toast({ title: "✅ Notification preferences saved!" });
  };

  const saveHifdhSettings = async () => {
    if (!user) return;
    setHifdhSaving(true);
    await saveHifdh({
      violation_limit: hifdhDraft.violation_limit,
      pass_mark: hifdhDraft.pass_mark,
      proctoring_enabled: hifdhDraft.proctoring_enabled,
    }, user.id);
    setHifdhSaving(false);
    toast({ title: "✅ Hifdh settings saved!" });
  };

  /* ── Change password ─────────────────────────────────────────── */
  const changePassword = async () => {
    if (pw.new !== pw.confirm) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    if (pw.new.length < 8)     { toast({ title: "Min 8 characters",       variant: "destructive" }); return; }
    setChangingPw(true);
    const { error } = await supabase.auth.updateUser({ password: pw.new });
    setChangingPw(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "✅ Password updated!" }); setShowPw(false); setPw({ new: "", confirm: "" }); }
  };

  /* ── Upload avatar ───────────────────────────────────────────── */
  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !user) return;
    setAvatarUploading(true);
    // FIX: path used to be `avatars/${user.id}.ext` — inside the "avatars"
    // bucket, "avatars" is a literal folder there, not the user's own ID.
    // Supabase's per-user storage policy expects the first path segment to
    // BE the uploader's user ID, so every upload was rejected before it
    // reached disk (same bug already fixed in student ProfileSettings).
    const path = `${user.id}/avatar.${file.name.split(".").pop()}`;
    const { error: upErr } = await storageSupabase.storage
      .from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
      setAvatarUploading(false); return;
    }
    const { data } = storageSupabase.storage.from("avatars").getPublicUrl(path);
    const url = data.publicUrl + "?t=" + Date.now();
    setForm(f => ({ ...f, avatar_url: url }));
    await supabase.from("profiles").upsert(
      { user_id: user.id, avatar_url: data.publicUrl, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    await refreshProfile();
    setAvatarUploading(false);
    toast({ title: "✅ Photo updated!" });
  };

  /* ── Derived ─────────────────────────────────────────────────── */
  const initials = (form.full_name || user?.email || "A")[0].toUpperCase();
  const activeStatus = STATUS_OPTIONS.find(s => s.value === academy.academy_status) ?? STATUS_OPTIONS[0];

  /* ════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "'Cairo', sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ background: `linear-gradient(135deg, ${G} 0%, ${G2} 100%)`, padding: "20px 16px 0", position: "relative", overflow: "hidden" }}>
        {/* decorative circles */}
        <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,.05)" }} />
        <div style={{ position: "absolute", bottom: 10, left: -20, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,.04)" }} />

        {/* Admin identity */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18, position: "relative" }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{ width: 62, height: 62, borderRadius: "50%", border: `3px solid ${GOLD}`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.15)" }}>
              {form.avatar_url
                ? <img src={form.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                : <span style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>{initials}</span>}
              {avatarUploading && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%" }}>
                  <Loader2 size={18} color="#fff" style={{ animation: "spin .8s linear infinite" }} />
                </div>
              )}
            </div>
            <input ref={avatarRef} id="as-avatar-input" type="file" accept="image/*"
              style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }} onChange={uploadAvatar} />
            <label htmlFor="as-avatar-input"
              style={{ position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderRadius: "50%", background: GOLD, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Camera size={12} color="#fff" />
            </label>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <p style={{ fontWeight: 800, fontSize: 17, color: "#fff", margin: 0 }}>{form.full_name || "Admin"}</p>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: GOLD, color: "#fff" }}>ADMIN</span>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,.65)", margin: "2px 0 0" }}>{user?.email}</p>
          </div>
          {/* Academy status pill */}
          <div style={{ padding: "5px 12px", borderRadius: 20, background: activeStatus.bg, border: `1px solid ${activeStatus.color}30` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: activeStatus.color }}>{activeStatus.emoji} {activeStatus.label}</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, overflowX: "auto", scrollbarWidth: "none" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: "8px 14px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", borderRadius: "10px 10px 0 0", background: tab === t.id ? "#F3F4F6" : "transparent", color: tab === t.id ? G : "rgba(255,255,255,.75)", fontFamily: "'Cairo', sans-serif" }}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ─────────────────────────────────────────── */}
      <div style={{ padding: 16, maxWidth: 680, margin: "0 auto" }}>

        {/* ════════ PROFILE TAB ════════ */}
        {tab === "profile" && <>
          <Sec title="Personal Information">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Fld label="Full Name (English)">
                <input style={inp} value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
              </Fld>
              <Fld label="الاسم (عربي)">
                <input style={{ ...inp, direction: "rtl" }} value={form.full_name_ar} onChange={e => setForm(f => ({ ...f, full_name_ar: e.target.value }))} />
              </Fld>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Fld label="Phone">
                <input style={inp} type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </Fld>
              <Fld label="WhatsApp">
                <input style={inp} type="tel" placeholder="+44 7700 000000" value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} />
              </Fld>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Fld label="Country">
                <input style={inp} value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} />
              </Fld>
              <Fld label="City">
                <input style={inp} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </Fld>
            </div>
            <Fld label="Bio / About">
              <textarea style={{ ...inp, resize: "vertical", minHeight: 80, lineHeight: 1.5 }}
                value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} />
            </Fld>
          </Sec>
          <SaveBtn fn={saveProfile} saving={saving} />
        </>}

        {/* ════════ ACADEMY TAB ════════ */}
        {tab === "academy" && <>

          {/* Status card */}
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: "16px", marginBottom: 14 }}>
            <p style={{ fontWeight: 700, fontSize: 12, color: "#6B7280", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: .5 }}>Academy Status</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {STATUS_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setAcademy(a => ({ ...a, academy_status: opt.value }))}
                  style={{ padding: "10px 8px", borderRadius: 12, border: `2px solid ${academy.academy_status === opt.value ? opt.color : "#E5E7EB"}`, background: academy.academy_status === opt.value ? opt.bg : "#F9FAFB", cursor: "pointer", transition: "all .15s" }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{opt.emoji}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: academy.academy_status === opt.value ? opt.color : "#6B7280" }}>{opt.label}</div>
                </button>
              ))}
            </div>
          </div>

          <Sec title="Term & Year">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Fld label="Current Term">
                <select style={inp} value={academy.current_term} onChange={e => setAcademy(a => ({ ...a, current_term: e.target.value }))}>
                  {TERMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Fld>
              <Fld label="Academic Year">
                <input style={inp} placeholder="2025/2026" value={academy.current_academic_year}
                  onChange={e => setAcademy(a => ({ ...a, current_academic_year: e.target.value }))} />
              </Fld>
            </div>
          </Sec>

          <Sec title="Holiday / Maintenance Message">
            <p style={{ fontSize: 11, color: "#6B7280", margin: "0 0 10px", lineHeight: 1.5 }}>
              Shown to students on the dashboard when academy status is set to <strong>Holiday</strong> or <strong>Maintenance</strong>.
            </p>
            <Fld label="Message (English)">
              <textarea style={{ ...inp, resize: "vertical", minHeight: 70 }}
                placeholder="e.g. Academy is closed for Eid Al-Fitr. Classes resume on…"
                value={academy.holiday_message}
                onChange={e => setAcademy(a => ({ ...a, holiday_message: e.target.value }))} />
            </Fld>
            <Fld label="الرسالة (عربي)">
              <textarea style={{ ...inp, resize: "vertical", minHeight: 70, direction: "rtl" }}
                placeholder="مثال: الأكاديمية مغلقة بمناسبة عيد الفطر..."
                value={academy.holiday_message_ar}
                onChange={e => setAcademy(a => ({ ...a, holiday_message_ar: e.target.value }))} />
            </Fld>
            <Fld label="Resume Date">
              <input style={inp} type="date" value={academy.resume_date}
                onChange={e => setAcademy(a => ({ ...a, resume_date: e.target.value }))} />
            </Fld>
          </Sec>

          <Sec title="Maintenance Bypass (Testing)">
            <p style={{ fontSize: 11, color: "#6B7280", margin: "0 0 10px", lineHeight: 1.5 }}>
              These student user IDs can still log in and use the platform normally even while status is <strong>Maintenance</strong> — useful for testing before you announce it. Comma-separate multiple IDs.
            </p>
            <Fld label="Allowed User IDs">
              <textarea style={{ ...inp, resize: "vertical", minHeight: 50, fontFamily: "monospace", fontSize: 12 }}
                placeholder="e.g. c08dbeb5-51ac-4cf6-a51d-ab868ef26a65"
                value={academy.maintenance_bypass_user_ids}
                onChange={e => setAcademy(a => ({ ...a, maintenance_bypass_user_ids: e.target.value }))} />
            </Fld>
          </Sec>

          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 12,
            padding: "12px 14px", marginBottom: 12,
          }}>
            <input
              type="checkbox"
              id="notify-students"
              checked={notifyStudents}
              onChange={(e) => setNotifyStudents(e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            <label htmlFor="notify-students" style={{ fontSize: 12, color: "#374151", cursor: "pointer", flex: 1 }}>
              Notify all students when the academy status changes (uses your Holiday/Maintenance message above)
            </label>
          </div>

          <SaveBtn fn={saveAcademy} saving={saving} busy={acSaving} />

          {/* Quick links to specialised settings */}
          <div style={{ marginTop: 20, marginBottom: 4 }}>
            <p style={{ fontWeight: 700, fontSize: 12, color: "#6B7280", textTransform: "uppercase", letterSpacing: .5, margin: "0 0 10px" }}>Specialised Settings</p>
            <QuickLink icon={CreditCard}  label="Payment Settings"      to="/admin/payment-settings"      color="#D97706" onNavigate={navigate} />
            <QuickLink icon={UserCog}     label="Registration Settings"  to="/admin/registration-settings"  color="#7C3AED" onNavigate={navigate} />
            <QuickLink icon={School}      label="Subject Registration"   to="/admin/subject-registration"   color="#0D9488" onNavigate={navigate} />
            <QuickLink icon={Calendar}    label="Academic Calendar"       to="/admin/calendar"               color="#0891B2" onNavigate={navigate} />
          </div>
        </>}

        {/* ════════ NOTIFICATIONS TAB ════════ */}
        {tab === "notifications" && <>

          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px", borderRadius: 14, marginBottom: 12,
            background: allNotifsOn ? "#ECFDF5" : "#F9FAFB",
            border: `1.5px solid ${allNotifsOn ? "#86EFAC" : "#E5E7EB"}`,
          }}>
            <div>
              <p style={{ fontWeight: 800, fontSize: 14, color: "#111827", margin: 0 }}>All Notifications</p>
              <p style={{ fontSize: 11.5, color: "#6B7280", margin: "2px 0 0", lineHeight: 1.5 }}>
                {masterToggling ? "Updating…" : allNotifsOn ? "Everything is on" : "Turn everything on or off at once"}
              </p>
            </div>
            <Switch checked={allNotifsOn} disabled={masterToggling} onCheckedChange={handleMasterToggle} />
          </div>

          {/* Push notification enable card */}
          {typeof Notification !== "undefined" && Notification.permission === "denied" && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "12px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>🔕</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#991B1B", margin: "0 0 2px" }}>Push notifications blocked</p>
                <p style={{ fontSize: 11, color: "#B91C1C", margin: 0 }}>
                  Unblock via browser → Site Settings → Notifications → Allow.
                </p>
              </div>
            </div>
          )}

          {/* WhatsApp warning if enabled without number */}
          {notifs.whatsapp_notifications && !form.whatsapp && !form.phone && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "12px 14px", marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>⚠️</span>
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#92400E", margin: "0 0 2px" }}>WhatsApp number required</p>
                <p style={{ fontSize: 12, color: "#B45309", margin: 0 }}>
                  Go to the <strong>Profile tab</strong> and add your WhatsApp number.
                </p>
              </div>
            </div>
          )}

          <Sec title="Channels">
            {/* ── Phone / Web Push toggle ── */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F9FAFB" }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>Phone &amp; Web Notifications</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>
                  {typeof Notification === "undefined"
                    ? "Not supported on this browser"
                    : Notification.permission === "denied"
                    ? "Blocked — allow in browser site settings to enable"
                    : notifs.push_notifications
                    ? "On — platform alerts arrive even when the app is closed"
                    : "Off — tap to get registration, payment and other alerts on this device"}
                </p>
              </div>
              <Switch
                checked={notifs.push_notifications}
                disabled={typeof Notification !== "undefined" && Notification.permission === "denied"}
                onCheckedChange={handlePushToggle}
              />
            </div>
            <Tog label="Email Notifications" sub="Receive alerts to your email"
              checked={notifs.email_notifications} onChange={v => setNotifs(n => ({ ...n, email_notifications: v }))} />
            <Tog label="WhatsApp Notifications"
              sub={form.whatsapp || form.phone ? `Will message: ${form.whatsapp || form.phone}` : "Add your number in the Profile tab first"}
              checked={notifs.whatsapp_notifications} onChange={v => setNotifs(n => ({ ...n, whatsapp_notifications: v }))} />
            <Tog label="Academy Announcements" sub="When you send an announcement"
              checked={notifs.announcement_notifications} onChange={v => setNotifs(n => ({ ...n, announcement_notifications: v }))} />
          </Sec>

          <Sec title="Student Activity">
            <Tog label="New Registration Alert" sub="When a student completes registration"
              checked={notifs.new_registration_alert} onChange={v => setNotifs(n => ({ ...n, new_registration_alert: v }))} />
            <Tog label="Payment Alerts" sub="When a payment is made or overdue"
              checked={notifs.payment_alert} onChange={v => setNotifs(n => ({ ...n, payment_alert: v }))} />
            <Tog label="Exam Submission Alert" sub="When a student submits an exam"
              checked={notifs.exam_submission_alert} onChange={v => setNotifs(n => ({ ...n, exam_submission_alert: v }))} />
            <Tog label="Recitation Submission" sub="New Hifdh or recitation submissions"
              checked={notifs.recitation_submission_alert} onChange={v => setNotifs(n => ({ ...n, recitation_submission_alert: v }))} />
            <Tog label="Student Complaints / Support" sub="Flagged messages from Al-Majlis"
              checked={notifs.student_complaint_alert} onChange={v => setNotifs(n => ({ ...n, student_complaint_alert: v }))} />
          </Sec>

          <Sec title="Digest">
            <Tog label="Daily Summary Email" sub="End-of-day stats: registrations, payments, exams"
              checked={notifs.daily_summary_email} onChange={v => setNotifs(n => ({ ...n, daily_summary_email: v }))} />
          </Sec>

          <SaveBtn fn={saveNotifs} saving={saving} />
        </>}

        {/* ════════ HIFDH TAB ════════ */}
        {tab === "hifdh" && <>
          <Sec title="Hifdh Daily — General Settings">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid #F3F4F6" }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#374151", margin: 0 }}>
                  🎯 Pass Mark
                </p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: "3px 0 0", lineHeight: 1.5 }}>
                  Minimum recitation/score percentage a student must reach to pass a Hifdh page or test.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 16 }}>
                <button
                  onClick={() => setHifdhDraft(d => ({ ...d, pass_mark: Math.max(10, d.pass_mark - 5) }))}
                  style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", justifyContent: "center" }}
                >−</button>
                <span style={{ minWidth: 44, textAlign: "center", fontWeight: 800, fontSize: 20, color: G, fontFamily: "'Cairo', sans-serif" }}>
                  {hifdhDraft.pass_mark}%
                </span>
                <button
                  onClick={() => setHifdhDraft(d => ({ ...d, pass_mark: Math.min(100, d.pass_mark + 5) }))}
                  style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", justifyContent: "center" }}
                >+</button>
              </div>
            </div>
            <div style={{ padding: "12px 0 4px", display: "flex", gap: 8, flexWrap: "wrap" as const }}>
              {[50, 55, 60, 70, 80, 90].map(n => (
                <button key={n} onClick={() => setHifdhDraft(d => ({ ...d, pass_mark: n }))}
                  style={{ padding: "5px 14px", borderRadius: 20, border: `1.5px solid ${hifdhDraft.pass_mark === n ? G : "#E5E7EB"}`, background: hifdhDraft.pass_mark === n ? G : "#fff", color: hifdhDraft.pass_mark === n ? "#fff" : "#374151", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo', sans-serif" }}>
                  {n}%
                </button>
              ))}
            </div>
          </Sec>

          <Sec title="Hifdh Proctoring">
            <Tog
              label="🛡️ Enable Hifdh Proctoring"
              sub="Applies focused-mode protections during daily recitation AND the Hifdh questions/test: blocks copy/paste & right-click, detects tab-switching/app-switching, keeps the screen awake, and flags violations for teacher review — so students focus only on their recitation, not the rest of the device."
              checked={hifdhDraft.proctoring_enabled}
              onChange={(v) => setHifdhDraft(d => ({ ...d, proctoring_enabled: v }))}
            />
            {hifdhDraft.proctoring_enabled && (
              <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
                <p style={{ margin: 0, fontSize: 11, color: "#166534", lineHeight: 1.6 }}>
                  ✅ Active across: Daily Revision recitation · Hifdh questions (Section A &amp; B) · Recitation/Musabaqah tests.
                  Violations are recorded in the session log and visible to teachers/admins on review.
                </p>
              </div>
            )}
          </Sec>

          <Sec title="Face Violation Proctoring (Test Camera)">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid #F3F4F6" }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#374151", margin: 0 }}>
                  📷 Face Violation Limit
                </p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: "3px 0 0", lineHeight: 1.5 }}>
                  How many camera violations a student is allowed before the test is auto-submitted with a score of 0.
                  The warning overlay appears after each violation.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 16 }}>
                <button
                  onClick={() => setHifdhDraft(d => ({ ...d, violation_limit: Math.max(1, d.violation_limit - 1) }))}
                  style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", justifyContent: "center" }}
                >−</button>
                <span style={{ minWidth: 32, textAlign: "center", fontWeight: 800, fontSize: 20, color: G, fontFamily: "'Cairo', sans-serif" }}>
                  {hifdhDraft.violation_limit}
                </span>
                <button
                  onClick={() => setHifdhDraft(d => ({ ...d, violation_limit: Math.min(20, d.violation_limit + 1) }))}
                  style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", justifyContent: "center" }}
                >+</button>
              </div>
            </div>
            <div style={{ padding: "12px 0 4px", display: "flex", gap: 8, flexWrap: "wrap" as const }}>
              {[2, 3, 5, 7, 10].map(n => (
                <button key={n} onClick={() => setHifdhDraft(d => ({ ...d, violation_limit: n }))}
                  style={{ padding: "5px 14px", borderRadius: 20, border: `1.5px solid ${hifdhDraft.violation_limit === n ? G : "#E5E7EB"}`, background: hifdhDraft.violation_limit === n ? G : "#fff", color: hifdhDraft.violation_limit === n ? "#fff" : "#374151", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo', sans-serif" }}>
                  {n}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "10px 0 0", fontStyle: "italic" }}>
              Tip: 5 is recommended for most classes. Set higher (7–10) for younger students who may move around more.
            </p>
          </Sec>

          <SaveBtn fn={saveHifdhSettings} saving={hifdhSaving} />
        </>}

        {/* ════════ SECURITY TAB ════════ */}
        {tab === "security" && <>
          <Sec title="Account Security">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: "1px solid #F3F4F6" }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>Password</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Change your admin login password</p>
              </div>
              <button onClick={() => setShowPw(true)}
                style={{ padding: "7px 14px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", gap: 5, fontFamily: "'Cairo', sans-serif" }}>
                <Lock size={12} /> Change
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: "1px solid #F3F4F6" }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>Email</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{user?.email}</p>
              </div>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#DCFCE7", color: "#166534", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                <CheckCircle size={11} /> Verified
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0" }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>Role</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Full platform administrator access</p>
              </div>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#FEF3C7", color: "#92400E", fontWeight: 700 }}>
                👑 Admin
              </span>
            </div>
          </Sec>

          <Sec title="Two-Factor Authentication">
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "4px 0" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <ShieldCheck size={18} color={G} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#374151", margin: "0 0 2px" }}>2FA via Supabase Auth</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 8px", lineHeight: 1.5 }}>
                  Two-factor authentication is managed through Supabase's built-in auth security. Enable it from your Supabase project's Auth settings.
                </p>
                <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer"
                  style={{ fontSize: 12, color: G, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
                  Open Supabase Dashboard <ExternalLink size={11} />
                </a>
              </div>
            </div>
          </Sec>

          <Sec title="Session">
            <button onClick={async () => { await signOut(); navigate("/login"); }}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, background: "#FFF7ED", border: "1px solid #FED7AA", cursor: "pointer", width: "100%", fontFamily: "'Cairo', sans-serif" }}>
              <LogOut size={16} color="#D97706" />
              <div style={{ textAlign: "left" }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#D97706", margin: 0 }}>Sign Out</p>
                <p style={{ fontSize: 11, color: "#F59E0B", margin: 0 }}>End your current admin session</p>
              </div>
            </button>
          </Sec>
        </>}
      </div>

      {/* ── Change Password Dialog ──────────────────────────────── */}
      <Dialog open={showPw} onOpenChange={v => !v && setShowPw(false)}>
        <DialogContent style={{ maxWidth: 400, borderRadius: 20, padding: 0 }}>
          <div style={{ background: G, padding: "16px 20px", borderRadius: "20px 20px 0 0" }}>
            <h2 style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0 }}>🔒 Change Password</h2>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ position: "relative" }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>New Password</label>
              <input type={showPwVis ? "text" : "password"} value={pw.new}
                onChange={e => setPw(p => ({ ...p, new: e.target.value }))} style={{ ...inp, paddingRight: 40 }} />
              <button onClick={() => setShowPwVis(v => !v)}
                style={{ position: "absolute", right: 10, bottom: 9, background: "none", border: "none", cursor: "pointer" }}>
                {showPwVis ? <EyeOff size={15} color="#9CA3AF" /> : <Eye size={15} color="#9CA3AF" />}
              </button>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>Confirm Password</label>
              <input type="password" value={pw.confirm}
                onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} style={inp} />
            </div>
            {pw.new && pw.confirm && pw.new !== pw.confirm && (
              <p style={{ fontSize: 12, color: "#DC2626", margin: 0 }}>⚠️ Passwords don't match</p>
            )}
            <button onClick={changePassword} disabled={changingPw || !pw.new || pw.new !== pw.confirm}
              style={{ padding: "12px 0", borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 700, color: "#fff", background: (changingPw || !pw.new || pw.new !== pw.confirm) ? "#9CA3AF" : G, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Cairo', sans-serif" }}>
              {changingPw ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Changing…</> : "Update Password"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}