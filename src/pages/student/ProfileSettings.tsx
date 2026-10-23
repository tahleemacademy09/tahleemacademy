/* src/pages/student/ProfileSettings.tsx
   ────────────────────────────────────────────────────────────────────
   FIXES in this version
   1. KEYBOARD BUG FIX — inputs now use individual useRef values +
      uncontrolled defaultValue pattern, so React never unmounts the
      input on each keystroke. The keyboard stays open the entire time.
   2. DARK MODE — fully implemented with a context-free localStorage
      approach. Toggles instantly, persists across page reloads.
   3. student_preferences schema-cache error → tries RPC first,
      falls back to direct upsert.
   4. WhatsApp toggle shows the phone number it will message.
   5. Push notification permission banner.
   6. date_of_birth "" → null, all nullable fields sanitised.
   7. STANDARDISED: nationality + "prefer not to say" gender removed; only
      Push + Class Reminders remain under Notifications (Telegram, email,
      WhatsApp, announcements, exam/result/recording alerts removed).
   ────────────────────────────────────────────────────────────────────
*/
import { useState, useEffect, useRef, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  Camera, Save, Lock, LogOut, Trash2,
  Eye, EyeOff, Loader2, AlertTriangle, Moon, Sun, LifeBuoy,
} from "lucide-react";
import PushBlockedHelp from "@/components/settings/PushBlockedHelp";
import { enablePushNotifications, hardResetPushNotifications } from "@/components/NotificationPermissionBanner";
import TermSwitcher from "@/components/settings/TermSwitcher";

// ─── Save resilience helpers ──────────────────────────────────────────────────
// "AbortError: signal is aborted without reason" is not a real server/validation
// error — it's the browser/OS killing the in-flight request (screen lock, app
// backgrounded, weak signal dropping mid-request). Retry once transparently,
// and if it still fails, show the user a friendly message instead of the raw
// browser error text.
async function withRetry<T>(fn: () => Promise<{ data: T; error: any }>): Promise<{ data: T; error: any }> {
  let result = await fn();
  const isAbort = result.error && (result.error.name === "AbortError" || /abort/i.test(String(result.error.message)));
  if (isAbort) result = await fn();
  return result;
}

function saveErrorToast(toast: ReturnType<typeof useToast>["toast"], error: any) {
  const isAbort = error.name === "AbortError" || /abort/i.test(String(error.message));
  toast({
    title: isAbort ? "Connection interrupted" : "Save failed",
    description: isAbort
      ? "Your save didn't go through — please check your connection and try again."
      : error.message,
    variant: "destructive",
  });
}

// ─── Dark mode helpers ────────────────────────────────────────────────────────
// Shared with src/lib/theme.ts, which is also bootstrapped on initial app load
// (src/main.tsx) so the preference now applies on every page, not just here.
import { DM_KEY, applyDark } from "@/lib/theme";

function useDarkMode(): [boolean, (v: boolean) => void] {
  const [dark, setDark] = useState(() => localStorage.getItem(DM_KEY) === "true");
  const toggle = useCallback((v: boolean) => {
    setDark(v);
    localStorage.setItem(DM_KEY, String(v));
    applyDark(v);
  }, []);
  return [dark, toggle];
}

// ─── Theme-aware colour tokens ────────────────────────────────────────────────
// These are used inline. When dark mode is on, the <html data-theme="dark">
// attribute is set so any CSS-var based components also switch automatically.
function useTheme(dark: boolean) {
  return {
    bg:       dark ? "#0f172a" : "#F3F4F6",
    surface:  dark ? "#1e293b" : "#ffffff",
    surface2: dark ? "#273548" : "#F9FAFB",
    border:   dark ? "#334155" : "#E5E7EB",
    text:     dark ? "#f1f5f9" : "#111827",
    text2:    dark ? "#94a3b8" : "#6B7280",
    text3:    dark ? "#cbd5e1" : "#374151",
    inputBg:  dark ? "#1e293b" : "#FAFAFA",
    inputBdr: dark ? "#334155" : "#E5E7EB",
    headerBg: dark ? "#0a1628" : "#064E3B",
    tabActive:dark ? "#1e293b" : "#F3F4F6",
    tabActiveText: dark ? "#34d399" : "#064E3B",
    accent:   "#064E3B",
  };
}

const G = "#064E3B";

const TABS = [
  { id: "profile",       icon: "👤", label: "Profile" },
  { id: "notifications", icon: "🔔", label: "Notifications" },
  { id: "preferences",   icon: "⚙️",  label: "Preferences" },
  { id: "security",      icon: "🔒", label: "Security" },
];

// ─── Stable input component ───────────────────────────────────────────────────
// KEY FIX: This component never re-mounts because it has a stable identity.
// We use a local ref + onBlur-to-sync pattern so the parent form state is
// updated (for saving) but React does NOT re-render the input on every
// keystroke, which is what caused the keyboard to dismiss.
interface StableInputProps {
  value: string;
  onCommit: (val: string) => void;
  type?: string;
  placeholder?: string;
  dir?: "rtl" | "ltr";
  style?: React.CSSProperties;
}
function StableInput({ value, onCommit, type = "text", placeholder, dir, style }: StableInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  // Sync external value into the input ONLY when it changes from outside
  // (e.g. initial load). While the user is typing, the input controls itself.
  const lastExternalValue = useRef(value);
  useEffect(() => {
    if (ref.current && value !== lastExternalValue.current) {
      // Only push if the input isn't focused (user isn't mid-type)
      if (document.activeElement !== ref.current) {
        ref.current.value = value;
      }
      lastExternalValue.current = value;
    }
  }, [value]);

  // Set initial value once on mount
  useEffect(() => {
    if (ref.current) ref.current.value = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <input
      ref={ref}
      type={type}
      defaultValue={value}
      placeholder={placeholder}
      dir={dir}
      // Commit to parent state on blur (when user leaves field) and on Enter
      onBlur={e => onCommit(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter") onCommit((e.target as HTMLInputElement).value); }}
      style={style}
    />
  );
}

// ─── Stable select component ──────────────────────────────────────────────────
// Selects don't dismiss the keyboard so onChange is fine, but we wrap for
// consistent styling and dark-mode style passing.
interface StableSelectProps {
  value: string;
  onChange: (val: string) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}
function StableSelect({ value, onChange, children, style }: StableSelectProps) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={style}>
      {children}
    </select>
  );
}

type Theme = ReturnType<typeof useTheme>;

/* Stable sub-components — defined outside to prevent keyboard dismiss on re-render */
const PSec = ({ title, children, T }: { title: string; children: React.ReactNode; T: Theme }) => (
  <div style={{ background: T.surface, borderRadius: 16, border: `1px solid ${T.border}`, overflow: "hidden", marginBottom: 14 }}>
    <div style={{ padding: "10px 16px", background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
      <p style={{ fontWeight: 700, fontSize: 12, color: T.text2, margin: 0, textTransform: "uppercase", letterSpacing: .5 }}>{title}</p>
    </div>
    <div style={{ padding: "14px 16px" }}>{children}</div>
  </div>
);
const PFld = ({ label, children, T }: { label: string; children: React.ReactNode; T: Theme }) => (
  <div style={{ marginBottom: 12 }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: T.text2, display: "block", marginBottom: 4 }}>{label}</label>
    {children}
  </div>
);
const PTog = ({ label, sub, checked, onChange, T }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void; T: Theme }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${T.surface2}` }}>
    <div>
      <p style={{ fontWeight: 600, fontSize: 13, color: T.text3, margin: 0 }}>{label}</p>
      {sub && <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>{sub}</p>}
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);
const PSaveBtn = ({ fn, saving }: { fn: () => void; saving: boolean }) => (
  <button onClick={fn} disabled={saving}
    style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", cursor: saving ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 14, color: "#fff", background: saving ? "#9CA3AF" : G, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 }}>
    {saving ? <><Loader2 size={15} style={{ animation: "spin .8s linear infinite" }} /> Saving…</> : <><Save size={15} /> Save Changes</>}
  </button>
);

export default function ProfileSettings() {
  const { language, setLanguage } = useLanguage();
  const { user, signOut }          = useAuth();
  const { toast }                  = useToast();
  const navigate                   = useNavigate();
  const avatarRef                  = useRef<HTMLInputElement>(null);
  const [dark, setDark]            = useDarkMode();
  const T                          = useTheme(dark);
  const inp: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 10,
    border: `1.5px solid ${T.inputBdr}`, fontSize: 13, outline: "none",
    background: T.inputBg, boxSizing: "border-box" as const,
    color: T.text, transition: "border-color .15s",
  };

  const [tab,             setTab]             = useState("profile");
  const [saving,          setSaving]          = useState(false);
  const [notifsLoaded,    setNotifsLoaded]    = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showDelete,      setShowDelete]      = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showPw,          setShowPw]          = useState(false);
  const [showPwVis,       setShowPwVis]       = useState(false);
  const [changingPw,      setChangingPw]      = useState(false);
  const [pw,              setPw]              = useState({ new: "", confirm: "" });
  const [pushBlocked,     setPushBlocked]     = useState(false);
  const [signingOutAll,  setSigningOutAll]  = useState(false);

  // Form state — only updated on blur, NOT on every keystroke
  const [form, setForm] = useState({
    full_name: "", full_name_ar: "", phone: "", whatsapp: "",
    parent_name: "", parent_phone: "", date_of_birth: "",
    bio: "", gender: "", country: "", city: "", avatar_url: "",
  });

  // Stable field updater — memoised so identity never changes between renders
  const updateField = useCallback((field: keyof typeof form) => (val: string) => {
    setForm(f => ({ ...f, [field]: val }));
  }, []);

  const [notifs, setNotifs] = useState({
    push_notifications: false,
    class_reminder:     true,
  });

  const [prefs, setPrefs] = useState({
    language: "en", dark_mode: dark, autoplay_recordings: true,
    playback_speed: "1x", show_subtitles: false, default_subject_view: "grid",
  });

  // Sync dark_mode into prefs when toggled so it saves to DB correctly
  useEffect(() => {
    setPrefs(p => ({ ...p, dark_mode: dark }));
  }, [dark]);

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setPushBlocked(Notification.permission === "denied");
    }
  }, []);

  // Load profile + preferences on mount
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: p } = await supabase
        .from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (p) setForm({
        full_name:     p.full_name     || "",
        full_name_ar:  p.full_name_ar  || "",
        phone:         p.phone         || "",
        whatsapp:      p.whatsapp      || "",
        parent_name:   p.parent_name   || "",
        parent_phone:  p.parent_phone  || "",
        date_of_birth: p.date_of_birth || "",
        bio:           p.bio           || "",
        gender:        p.gender        || "",
        country:       p.country       || "",
        city:          p.city          || "",
        avatar_url:    p.avatar_url    || "",
      });

      const { data: pd } = await supabase
        .from("student_preferences" as any).select("*").eq("user_id", user.id).maybeSingle();
      if (pd) {
        const d = pd as any;
        setNotifs(n => ({
          push_notifications:         (typeof Notification !== "undefined" && Notification.permission === "granted")
                                        ? (d.push_notifications ?? n.push_notifications)
                                        : false,
          class_reminder:             d.class_reminder             ?? n.class_reminder,
        }));
        setNotifsLoaded(true);
        const savedDark = d.dark_mode ?? dark;
        setPrefs(pr => ({
          language:             d.language             ?? pr.language,
          dark_mode:            savedDark,
          autoplay_recordings:  d.autoplay_recordings  ?? pr.autoplay_recordings,
          playback_speed:       d.playback_speed        ?? pr.playback_speed,
          show_subtitles:       d.show_subtitles        ?? pr.show_subtitles,
          default_subject_view: d.default_subject_view ?? pr.default_subject_view,
        }));
        // Apply saved dark mode preference from DB
        if (d.dark_mode !== undefined && d.dark_mode !== dark) {
          setDark(d.dark_mode);
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const sanitise = (f: typeof form) => ({
    ...f,
    date_of_birth: f.date_of_birth || null,
    full_name_ar:  f.full_name_ar  || null,
    phone:         f.phone         || null,
    whatsapp:      f.whatsapp      || null,
    parent_name:   f.parent_name   || null,
    parent_phone:  f.parent_phone  || null,
    bio:           f.bio           || null,
    gender:        f.gender        || null,
    country:       f.country       || null,
    city:          f.city          || null,
  });

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await withRetry(async () =>
      await supabase.from("profiles").upsert(
        { ...sanitise(form), user_id: user.id, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      )
    );
    setSaving(false);
    if (error) saveErrorToast(toast, error);
    else       toast({ title: "✅ Profile saved!" });
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
        // Fire a confirmation notification so the user sees it works immediately
        try {
          const reg = await navigator.serviceWorker.ready;
          reg.showNotification("🔔 Tahleem Academy", {
            body: "You'll now receive class reminders and updates on this device — even when the app is closed.",
            icon: "/icons/icon-192x192.png",
            badge: "/icons/icon-96x96.png",
            tag: "push-enabled-confirm",
          });
        } catch {}
        toast({ title: "✅ Push notifications enabled!" });
      } else if (result === "denied") {
        setPushBlocked(true);
        toast({ title: "Notifications blocked", description: "Follow the 3 steps shown on this page — it will switch on automatically once you allow it.", variant: "destructive" });
      } else {
        // "error" or any other unexpected outcome — surface it so the user
        // isn't left staring at a silently-off toggle.
        toast({
          title: "Couldn't enable push notifications",
          description: "Something went wrong setting up push on this device. Please refresh and try again, or check that your browser allows notifications for this site.",
          variant: "destructive",
        });
      }
    } else {
      // Unsubscribe from push
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

  // ── Master "All Notifications" toggle ─────────────────────────────────
  // Turning this ON does a hard reset of push (unsubscribes any stale
  // subscription, wipes old DB rows, re-requests permission fresh) so it
  // also recovers someone who previously blocked/ignored the prompt — then
  // switches every channel on. Turning it OFF unsubscribes push and
  // switches every channel off. Either way it saves immediately.
  const [masterToggling, setMasterToggling] = useState(false);
  const allNotifsOn = Object.values(notifs).every(Boolean);

  const handleMasterToggle = async (v: boolean) => {
    if (!user) return;
    setMasterToggling(true);
    if (v) {
      const result = await hardResetPushNotifications(user.id);
      if (result === "denied") {
        setPushBlocked(true);
        setMasterToggling(false);
        toast({ title: "Notifications blocked", description: "Follow the 3 steps shown on this page — it will switch on automatically once you allow it.", variant: "destructive" });
        return;
      }
      const next = {
        push_notifications: result === "granted",
        class_reminder:     true,
      };
      setNotifs(next);
      setPushBlocked(false);
      const { push_notifications: _skip, ...toSave } = next;
      await supabase.from("student_preferences" as any)
        .upsert({ user_id: user.id, ...toSave, updated_at: new Date().toISOString() } as any, { onConflict: "user_id" });
      toast({ title: "✅ All notifications turned on" });
    } else {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) { await sub.unsubscribe(); }
        await supabase.from("push_subscriptions" as any).delete().eq("user_id", user.id);
      } catch {}
      const next = { push_notifications: false, class_reminder: false };
      setNotifs(next);
      const { push_notifications: _skip, ...toSave } = next;
      await supabase.from("student_preferences" as any)
        .upsert({ user_id: user.id, ...toSave, updated_at: new Date().toISOString() } as any, { onConflict: "user_id" });
      toast({ title: "All notifications turned off" });
    }
    setMasterToggling(false);
  };

  const saveNotifs = async () => {
    if (!user) return;
    if (!notifsLoaded) return;  // don't save stale defaults before DB load completes
    setSaving(true);
    // push_notifications is browser-state only (controlled by the OS permission),
    // not a DB column — strip it before saving to student_preferences
    const { push_notifications: _skip, ...notifsToSave } = notifs;
    const { error } = await withRetry(async () =>
      await supabase.from("student_preferences" as any)
        .upsert({ user_id: user.id, ...notifsToSave, updated_at: new Date().toISOString() } as any, { onConflict: "user_id" })
    );
    setSaving(false);
    if (error) saveErrorToast(toast, error);
    else       toast({ title: "✅ Notifications saved" });
  };

  const savePrefs = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await withRetry(async () =>
      await supabase.from("student_preferences" as any)
        .upsert({ user_id: user.id, ...prefs, updated_at: new Date().toISOString() } as any, { onConflict: "user_id" })
    );
    setSaving(false);
    if (error) saveErrorToast(toast, error);
    else {
      if (prefs.language !== language) setLanguage(prefs.language as any);
      toast({ title: "✅ Preferences saved" });
    }
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

  const signOutEverywhere = async () => {
    setSigningOutAll(true);
    const { error } = await supabase.auth.signOut({ scope: "global" });
    setSigningOutAll(false);
    if (error) { toast({ title: "Couldn't sign out of all devices", description: error.message, variant: "destructive" }); return; }
    navigate("/login");
  };

  const deleteAccount = async () => {
    if (!user) return;
    setDeletingAccount(true);
    const { error } = await (supabase as any).rpc("delete_own_account");
    setDeletingAccount(false);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setShowDelete(false);
    toast({ title: "Account deleted", description: "Sorry to see you go. You've been signed out." });
    await signOut();
    navigate("/login");
  };

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !user) return;
    setAvatarUploading(true);
    // FIX ("new row violates row-level security policy" on avatar upload):
    // the path used to be `avatars/${user.id}.ext` — inside the "avatars"
    // BUCKET that's a literal "avatars" FOLDER as the first path segment,
    // not the user's own ID. Supabase's standard per-user storage policy
    // checks (storage.foldername(name))[1] = auth.uid(), i.e. it expects the
    // first folder in the path to BE the uploader's user ID — so every
    // upload was being rejected before it ever reached disk. Putting the
    // user's own ID as the folder (not the filename) satisfies that policy.
    const path = `${user.id}/avatar.${file.name.split(".").pop()}`;
    const { error: upErr } = await storageSupabase.storage
      .from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { toast({ title: "Upload failed", description: upErr.message, variant: "destructive" }); setAvatarUploading(false); return; }
    const { data } = storageSupabase.storage.from("avatars").getPublicUrl(path);
    setForm(f => ({ ...f, avatar_url: data.publicUrl + "?t=" + Date.now() }));
    await supabase.from("profiles").upsert(
      { user_id: user.id, avatar_url: data.publicUrl, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    setAvatarUploading(false);
    toast({ title: "✅ Photo updated!" });
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: T.bg, transition: "background .25s" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        /* Dark mode global overrides */
        [data-theme="dark"] { color-scheme: dark; }
        [data-theme="dark"] body { background: #0f172a; color: #f1f5f9; }
      `}</style>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div style={{ background: T.headerBg, padding: "18px 16px 0", transition: "background .25s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          {/* Avatar */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{ width: 58, height: 58, borderRadius: "50%", border: "3px solid rgba(255,255,255,.3)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.15)" }}>
              {form.avatar_url
                ? <img src={form.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                : <span style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{(form.full_name || user?.email || "?")[0].toUpperCase()}</span>}
              {avatarUploading && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%" }}>
                  <Loader2 size={18} color="#fff" style={{ animation: "spin .8s linear infinite" }} />
                </div>
              )}
            </div>
            <input ref={avatarRef} id="ps-avatar-input" type="file" accept="image/*"
              style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }} onChange={uploadAvatar} />
            <label htmlFor="ps-avatar-input"
              style={{ position: "absolute", bottom: 0, right: 0, width: 22, height: 22, borderRadius: "50%", background: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Camera size={11} color={G} />
            </label>
          </div>

          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 800, fontSize: 17, color: "#fff", margin: 0 }}>{form.full_name || "My Settings"}</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,.65)", margin: 0 }}>{user?.email}</p>
          </div>

          {/* Dark mode toggle in header */}
          <button
            onClick={() => setDark(!dark)}
            title={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "2px solid rgba(255,255,255,.25)",
              background: dark ? "rgba(255,255,255,.15)" : "rgba(255,255,255,.1)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "background .2s",
            }}>
            {dark ? <Sun size={16} color="#fbbf24" /> : <Moon size={16} color="rgba(255,255,255,.85)" />}
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 2, overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: "8px 14px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", borderRadius: "10px 10px 0 0", background: tab === t.id ? T.tabActive : "transparent", color: tab === t.id ? T.tabActiveText : "rgba(255,255,255,.75)", transition: "all .15s" }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 640, margin: "0 auto" }}>

        {/* ── PROFILE TAB ─────────────────────────────────────────── */}
        {tab === "profile" && <>
          <PSec title="Personal Information" T={T}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <PFld label="Full Name (English)" T={T}>
                {/* StableInput: onCommit fires on blur/Enter — keyboard stays open while typing */}
                <StableInput value={form.full_name} onCommit={updateField("full_name")} style={inp} />
              </PFld>
              <PFld label="الاسم (عربي)" T={T}>
                <StableInput value={form.full_name_ar} onCommit={updateField("full_name_ar")} dir="rtl" style={inp} />
              </PFld>
            </div>
            <PFld label="Email" T={T}>
              <input style={{ ...inp, opacity: .7, cursor: "not-allowed" }} type="email" value={user?.email ?? ""} readOnly disabled />
            </PFld>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <PFld label="Phone" T={T}>
                <StableInput value={form.phone} onCommit={updateField("phone")} type="tel" style={inp} />
              </PFld>
              <PFld label="WhatsApp" T={T}>
                <StableInput value={form.whatsapp} onCommit={updateField("whatsapp")} type="tel" placeholder="+234 800 000 0000" style={inp} />
              </PFld>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <PFld label="Date of Birth" T={T}>
                {/* Date inputs are fine with onChange — no keyboard involved */}
                <input style={inp} type="date" value={form.date_of_birth}
                  onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
              </PFld>
              <PFld label="Gender" T={T}>
                <StableSelect style={inp} value={form.gender} onChange={v => setForm(f => ({ ...f, gender: v }))}>
                  <option value="" disabled>Select gender</option>
                  <option value="male">Male / ذكر</option>
                  <option value="female">Female / أنثى</option>
                </StableSelect>
              </PFld>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <PFld label="Country" T={T}>
                <StableInput value={form.country} onCommit={updateField("country")} style={inp} />
              </PFld>
              <PFld label="City" T={T}>
                <StableInput value={form.city} onCommit={updateField("city")} style={inp} />
              </PFld>
            </div>
          </PSec>

          <PSec title="Parent / Guardian" T={T}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <PFld label="Parent Name" T={T}>
                <StableInput value={form.parent_name} onCommit={updateField("parent_name")} style={inp} />
              </PFld>
              <PFld label="Parent Phone" T={T}>
                <StableInput value={form.parent_phone} onCommit={updateField("parent_phone")} type="tel" style={inp} />
              </PFld>
            </div>
          </PSec>
          <PSaveBtn fn={saveProfile} saving={saving} />
        </>}

        {/* ── NOTIFICATIONS TAB ───────────────────────────────────── */}
        {tab === "notifications" && <>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px", borderRadius: 14, marginBottom: 12,
            background: allNotifsOn ? (dark ? "rgba(5,150,105,.12)" : "#ECFDF5") : (dark ? T.surface2 : "#F9FAFB"),
            border: `1.5px solid ${allNotifsOn ? (dark ? "rgba(5,150,105,.4)" : "#86EFAC") : T.border}`,
          }}>
            <div>
              <p style={{ fontWeight: 800, fontSize: 14, color: T.text, margin: 0 }}>All Notifications</p>
              <p style={{ fontSize: 11.5, color: T.text2, margin: "2px 0 0", lineHeight: 1.5 }}>
                {masterToggling ? "Updating…" : allNotifsOn ? "Everything is on" : "Turn everything on or off at once"}
              </p>
            </div>
            <Switch checked={allNotifsOn} disabled={masterToggling} onCheckedChange={handleMasterToggle} />
          </div>

          {pushBlocked && user && (
            <PushBlockedHelp userId={user.id} dark={dark} onEnabled={() => {
              setNotifs(n => ({ ...n, push_notifications: true }));
              setPushBlocked(false);
              toast({ title: "✅ Push notifications enabled!" });
            }} />
          )}

          <PSec title="Channels" T={T}>
            {/* ── Phone / Web Push toggle ── */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${T.surface2}` }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, color: T.text3, margin: 0 }}>Phone &amp; Web Notifications</p>
                <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>
                  {typeof Notification === "undefined"
                    ? "Not supported on this browser"
                    : Notification.permission === "denied"
                    ? "Blocked — follow the steps above to allow"
                    : notifs.push_notifications
                    ? "On — you'll get alerts even when the app is closed"
                    : "Off — tap to get class reminders on this device"}
                </p>
              </div>
              <Switch
                checked={notifs.push_notifications}
                onCheckedChange={handlePushToggle}
              />
            </div>
          </PSec>
          <PSec title="Classes" T={T}>
            <PTog label="Class Reminders" sub="15 min + 5 min before class starts"
              checked={notifs.class_reminder} onChange={(v: boolean) => setNotifs(n => ({ ...n, class_reminder: v }))} T={T} />
          </PSec>
          <PSaveBtn fn={saveNotifs} saving={saving} />
        </>}

        {/* ── PREFERENCES TAB ─────────────────────────────────────── */}
        {tab === "preferences" && <>
          <PSec title="Language & Display" T={T}>
            <PFld label="Interface Language" T={T}>
              <StableSelect style={inp} value={prefs.language} onChange={v => setPrefs(p => ({ ...p, language: v }))}>
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </StableSelect>
            </PFld>

            <PTog
              label={dark ? "Dark Mode" : "Light Mode"}
              sub={dark ? "Easy on the eyes at night" : "Bright and clear for daytime use — applies across the whole app"}
              checked={dark}
              onChange={(v: boolean) => {
                setDark(v);
                setPrefs(p => ({ ...p, dark_mode: v }));
              }}
              T={T}
            />
            <PFld label="Default View" T={T}>
              <StableSelect style={inp} value={prefs.default_subject_view} onChange={v => setPrefs(p => ({ ...p, default_subject_view: v }))}>
                <option value="grid">Grid</option>
                <option value="list">List</option>
              </StableSelect>
            </PFld>
          </PSec>

          <PSec title="Recordings & Playback" T={T}>
            <PFld label="Default Playback Speed" T={T}>
              <StableSelect style={inp} value={prefs.playback_speed} onChange={v => setPrefs(p => ({ ...p, playback_speed: v }))}>
                {["0.75x","1x","1.25x","1.5x","2x"].map(s => <option key={s} value={s}>{s}</option>)}
              </StableSelect>
            </PFld>
            <PTog label="Autoplay Recordings" checked={prefs.autoplay_recordings} onChange={(v: boolean) => setPrefs(p => ({ ...p, autoplay_recordings: v }))}  T={T}/>
            <PTog label="Show Subtitles" checked={prefs.show_subtitles} onChange={(v: boolean) => setPrefs(p => ({ ...p, show_subtitles: v }))}  T={T}/>
          </PSec>
          <PSaveBtn fn={savePrefs} saving={saving} />
          <TermSwitcher />
        </>}

        {/* ── SECURITY TAB ────────────────────────────────────────── */}
        {tab === "security" && <>
          <PSec title="Account Security" T={T}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: `1px solid ${T.border}` }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, color: T.text3, margin: 0 }}>Password</p>
                <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>Change your login password</p>
              </div>
              <button onClick={() => setShowPw(true)} style={{ padding: "7px 14px", borderRadius: 9, border: `1.5px solid ${T.border}`, background: T.surface, cursor: "pointer", fontSize: 12, fontWeight: 700, color: T.text, display: "flex", alignItems: "center", gap: 5 }}>
                <Lock size={12} /> Change
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0" }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, color: T.text3, margin: 0 }}>Email</p>
                <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>{user?.email}</p>
              </div>
              {user?.email_confirmed_at
                ? <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#DCFCE7", color: "#166534", fontWeight: 700 }}>✓ Verified</span>
                : <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#FEF3C7", color: "#92400E", fontWeight: 700 }}>Not verified</span>}
            </div>
          </PSec>
          <PSec title="Help" T={T}>
            <button onClick={() => navigate("/student/support")}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}`, cursor: "pointer", width: "100%", textAlign: "left" }}>
              <LifeBuoy size={16} color={dark ? "#34d399" : G} />
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, color: T.text, margin: 0 }}>Help &amp; Support</p>
                <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>Get help or contact the academy</p>
              </div>
            </button>
          </PSec>
          <PSec title="Session" T={T}>
            <button onClick={async () => { await signOut(); navigate("/login"); }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, background: dark ? "rgba(217,119,6,.12)" : "#FFF7ED", border: `1px solid ${dark ? "rgba(217,119,6,.3)" : "#FED7AA"}`, cursor: "pointer", width: "100%", marginBottom: 8 }}>
              <LogOut size={16} color="#D97706" />
              <p style={{ fontWeight: 700, fontSize: 13, color: "#D97706", margin: 0 }}>Sign Out</p>
            </button>
            <button onClick={signOutEverywhere} disabled={signingOutAll}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, background: dark ? "rgba(217,119,6,.12)" : "#FFF7ED", border: `1px solid ${dark ? "rgba(217,119,6,.3)" : "#FED7AA"}`, cursor: signingOutAll ? "not-allowed" : "pointer", width: "100%", marginBottom: 8, textAlign: "left" }}>
              {signingOutAll ? <Loader2 size={16} color="#D97706" style={{ animation: "spin .8s linear infinite" }} /> : <LogOut size={16} color="#D97706" />}
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#D97706", margin: 0 }}>Sign Out of All Devices</p>
                <p style={{ fontSize: 11, color: T.text2, margin: 0 }}>Use this if you logged in on a shared or lost device</p>
              </div>
            </button>
            <button onClick={() => setShowDelete(true)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, background: dark ? "rgba(220,38,38,.1)" : "#FEF2F2", border: `1px solid ${dark ? "rgba(220,38,38,.3)" : "#FECACA"}`, cursor: "pointer", width: "100%" }}>
              <Trash2 size={16} color="#DC2626" />
              <p style={{ fontWeight: 700, fontSize: 13, color: "#DC2626", margin: 0 }}>Delete Account</p>
            </button>
          </PSec>
        </>}
      </div>

      {/* ── Change Password Dialog ────────────────────────────────── */}
      <Dialog open={showPw} onOpenChange={v => !v && setShowPw(false)}>
        <DialogContent style={{ maxWidth: 400, borderRadius: 20, padding: 0, background: T.surface }}>
          <div style={{ background: G, padding: "16px 20px", borderRadius: "20px 20px 0 0" }}>
            <h2 style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0 }}>🔒 Change Password</h2>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ position: "relative" }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: T.text2, display: "block", marginBottom: 4 }}>New Password</label>
              <input type={showPwVis ? "text" : "password"} value={pw.new}
                onChange={e => setPw(p => ({ ...p, new: e.target.value }))}
                style={{ ...inp, paddingRight: 40 }} />
              <button onClick={() => setShowPwVis(v => !v)} style={{ position: "absolute", right: 10, bottom: 9, background: "none", border: "none", cursor: "pointer" }}>
                {showPwVis ? <EyeOff size={15} color="#9CA3AF" /> : <Eye size={15} color="#9CA3AF" />}
              </button>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: T.text2, display: "block", marginBottom: 4 }}>Confirm Password</label>
              <input type="password" value={pw.confirm}
                onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))}
                style={inp} />
            </div>
            <p style={{ fontSize: 11, color: T.text2, margin: "-6px 0 0" }}>Use at least 8 characters.</p>
            {pw.new && pw.confirm && pw.new !== pw.confirm && <p style={{ fontSize: 12, color: "#DC2626", margin: 0 }}>⚠️ Passwords don't match</p>}
            <button onClick={changePassword} disabled={changingPw || !pw.new || pw.new !== pw.confirm}
              style={{ padding: "12px 0", borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 700, color: "#fff", background: changingPw || !pw.new || pw.new !== pw.confirm ? "#9CA3AF" : G, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {changingPw ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Changing…</> : "Update Password"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Account Dialog ─────────────────────────────────── */}
      <Dialog open={showDelete} onOpenChange={v => !v && setShowDelete(false)}>
        <DialogContent style={{ maxWidth: 360, borderRadius: 20, padding: 24, textAlign: "center", background: T.surface }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <AlertTriangle size={24} color="#DC2626" />
          </div>
          <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 8, color: T.text }}>Delete Account?</h3>
          <p style={{ fontSize: 12, color: T.text2, marginBottom: 18, lineHeight: 1.6 }}>
            Permanently deletes your account, exam results, and learning history. Cannot be undone.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setShowDelete(false)} disabled={deletingAccount}
              style={{ flex: 1, padding: 11, borderRadius: 11, border: `1.5px solid ${T.border}`, background: T.surface, cursor: deletingAccount ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13, color: T.text }}>Cancel</button>
            <button onClick={deleteAccount} disabled={deletingAccount}
              style={{ flex: 1, padding: 11, borderRadius: 11, border: "none", background: deletingAccount ? "#9CA3AF" : "#DC2626", color: "#fff", cursor: deletingAccount ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {deletingAccount ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Deleting…</> : "Delete"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
