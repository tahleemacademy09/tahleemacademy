/* src/pages/student/ProfileSettings.tsx
   ────────────────────────────────────────────────────────────────────
   FIXES in this version
   1. student_preferences schema-cache error → tries RPC first,
      falls back to direct upsert. Both work once the migration runs.
   2. WhatsApp toggle shows the phone number it will message, and
      warns if no number is saved in the Profile tab.
   3. Push notification permission banner shown when browser has
      blocked notifications, with an "Allow" button to prompt again.
   4. date_of_birth "" → null, all nullable fields sanitised.
   ────────────────────────────────────────────────────────────────────
*/
import { useState, useEffect, useRef } from "react";
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
  Eye, EyeOff, Loader2, AlertTriangle,
} from "lucide-react";

const G = "#064E3B";

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 10,
  border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none",
  background: "#FAFAFA", boxSizing: "border-box" as const,
};

const TABS = [
  { id: "profile",       icon: "👤", label: "Profile" },
  { id: "notifications", icon: "🔔", label: "Notifications" },
  { id: "preferences",   icon: "⚙️",  label: "Preferences" },
  { id: "security",      icon: "🔒", label: "Security" },
];

export default function ProfileSettings() {
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

  const [form, setForm] = useState({
    full_name: "", full_name_ar: "", phone: "", whatsapp: "",
    parent_name: "", parent_phone: "", date_of_birth: "",
    bio: "", gender: "", nationality: "", country: "", city: "", avatar_url: "",
  });

  const [notifs, setNotifs] = useState({
    email_notifications:        true,
    whatsapp_notifications:     false,
    class_reminder:             true,
    exam_reminder:              true,
    results_notification:       true,
    new_recording_alert:        true,
    announcement_notifications: true,
  });

  const [prefs, setPrefs] = useState({
    language: "en", dark_mode: false, autoplay_recordings: true,
    playback_speed: "1x", show_subtitles: false, default_subject_view: "grid",
  });

  // Check browser push permission state
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
        nationality:   p.nationality   || "",
        country:       p.country       || "",
        city:          p.city          || "",
        avatar_url:    p.avatar_url    || "",
      });

      const { data: pd } = await supabase
        .from("student_preferences" as any).select("*").eq("user_id", user.id).maybeSingle();
      if (pd) {
        const d = pd as any;
        if (d.notifications) setNotifs(n => ({ ...n, ...d.notifications }));
        if (d.preferences)   setPrefs(p  => ({ ...p,  ...d.preferences  }));
      }
    })();
  }, [user]);

  // Sanitise — empty string → null for all nullable DB columns
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
    nationality:   f.nationality   || null,
    country:       f.country       || null,
    city:          f.city          || null,
  });

  // ── Save profile ──────────────────────────────────────────────────
  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert(
      { ...sanitise(form), user_id: user.id, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    setSaving(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else       toast({ title: "✅ Profile saved!" });
  };

  // ── Save notifications ────────────────────────────────────────────
  //    Tries RPC first (bypasses PostgREST schema cache entirely),
  //    then falls back to a direct upsert as a safety net.
  const saveNotifs = async () => {
    if (!user) return;
    if (notifs.whatsapp_notifications && !form.whatsapp && !form.phone) {
      toast({
        title: "⚠️ No WhatsApp number saved",
        description: "Go to the Profile tab and add your WhatsApp number (with country code) so we can reach you.",
        variant: "destructive",
      });
      // Don't block the save — preferences are still stored
    }
    setSaving(true);
    const { error: rpcErr } = await supabase.rpc(
      "upsert_student_notifications" as any,
      { p_user_id: user.id, p_notifications: notifs } as any
    );
    if (rpcErr) {
      // RPC not deployed yet — fall back to direct upsert
      const { error: upsertErr } = await supabase
        .from("student_preferences" as any)
        .upsert(
          { user_id: user.id, notifications: notifs, updated_at: new Date().toISOString() } as any,
          { onConflict: "user_id" }
        );
      setSaving(false);
      if (upsertErr) toast({ title: "Save failed", description: upsertErr.message, variant: "destructive" });
      else           toast({ title: "✅ Notifications saved" });
    } else {
      setSaving(false);
      toast({ title: "✅ Notifications saved" });
    }
  };

  // ── Save preferences ──────────────────────────────────────────────
  const savePrefs = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("student_preferences" as any)
      .upsert(
        { user_id: user.id, preferences: prefs, updated_at: new Date().toISOString() } as any,
        { onConflict: "user_id" }
      );
    setSaving(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else {
      if (prefs.language !== language) setLanguage(prefs.language as any);
      toast({ title: "✅ Preferences saved" });
    }
  };

  // ── Change password ───────────────────────────────────────────────
  const changePassword = async () => {
    if (pw.new !== pw.confirm) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    if (pw.new.length < 8)     { toast({ title: "Min 8 characters",       variant: "destructive" }); return; }
    setChangingPw(true);
    const { error } = await supabase.auth.updateUser({ password: pw.new });
    setChangingPw(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "✅ Password updated!" }); setShowPw(false); setPw({ new: "", confirm: "" }); }
  };

  // ── Upload avatar ─────────────────────────────────────────────────
  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !user) return;
    setAvatarUploading(true);
    const path = `avatars/${user.id}.${file.name.split(".").pop()}`;
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

  // ── Reusable layout bits ──────────────────────────────────────────
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
  const Tog = ({ label, sub, checked, onChange }: any) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F9FAFB" }}>
      <div>
        <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>{label}</p>
        {sub && <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{sub}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
  const SaveBtn = ({ fn }: { fn: () => void }) => (
    <button onClick={fn} disabled={saving}
      style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", cursor: saving ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 14, color: "#fff", background: saving ? "#9CA3AF" : G, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      {saving ? <><Loader2 size={15} style={{ animation: "spin .8s linear infinite" }} /> Saving…</> : <><Save size={15} /> Save Changes</>}
    </button>
  );

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background: G, padding: "18px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
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
          <div>
            <p style={{ fontWeight: 800, fontSize: 17, color: "#fff", margin: 0 }}>{form.full_name || "My Settings"}</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,.65)", margin: 0 }}>{user?.email}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 2, overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: "8px 14px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", borderRadius: "10px 10px 0 0", background: tab === t.id ? "#F3F4F6" : "transparent", color: tab === t.id ? G : "rgba(255,255,255,.75)" }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 640, margin: "0 auto" }}>

        {/* ── PROFILE TAB ─────────────────────────────────────────── */}
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
            <p style={{ fontSize: 11, color: "#6B7280", margin: "-6px 0 10px" }}>
              📱 Add your WhatsApp number with country code (e.g. +44 7700…) to receive class reminders via WhatsApp.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Fld label="Date of Birth">
                <input style={inp} type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
              </Fld>
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
          <Sec title="Parent / Guardian">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Fld label="Parent Name"><input style={inp} value={form.parent_name} onChange={e => setForm(f => ({ ...f, parent_name: e.target.value }))} /></Fld>
              <Fld label="Parent Phone"><input style={inp} type="tel" value={form.parent_phone} onChange={e => setForm(f => ({ ...f, parent_phone: e.target.value }))} /></Fld>
            </div>
          </Sec>
          <SaveBtn fn={saveProfile} />
        </>}

        {/* ── NOTIFICATIONS TAB ───────────────────────────────────── */}
        {tab === "notifications" && <>

          {/* Push blocked by browser */}
          {pushBlocked && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "12px 14px", marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>🔕</span>
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#991B1B", margin: "0 0 3px" }}>Phone notifications are blocked</p>
                <p style={{ fontSize: 12, color: "#B91C1C", margin: 0, lineHeight: 1.5 }}>
                  Open your browser → Site Settings → Notifications → <strong>allow</strong> for <em>tahleemacademy.vercel.app</em>, then refresh.
                </p>
              </div>
            </div>
          )}

          {/* Not yet asked — show Allow button */}
          {!pushBlocked && typeof Notification !== "undefined" && Notification.permission === "default" && (
            <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 12, padding: "12px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>🔔</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#166534", margin: "0 0 2px" }}>Enable phone notifications</p>
                <p style={{ fontSize: 11, color: "#15803D", margin: 0 }}>Get class reminders in your phone's notification tray even when the app is closed.</p>
              </div>
              <button
                onClick={() => Notification.requestPermission().then(p => setPushBlocked(p === "denied"))}
                style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: G, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
                Allow
              </button>
            </div>
          )}

          {/* WhatsApp enabled but no number */}
          {notifs.whatsapp_notifications && !form.whatsapp && !form.phone && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "12px 14px", marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>⚠️</span>
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#92400E", margin: "0 0 3px" }}>WhatsApp number required</p>
                <p style={{ fontSize: 12, color: "#B45309", margin: 0, lineHeight: 1.5 }}>
                  Go to the <strong>Profile tab</strong> and add your WhatsApp number (with country code, e.g. +44 7700…) so we can send class reminders.
                </p>
              </div>
            </div>
          )}

          <Sec title="Channels">
            <Tog label="Email Notifications" sub="Updates via email"
              checked={notifs.email_notifications} onChange={(v: boolean) => setNotifs(n => ({ ...n, email_notifications: v }))} />
            <Tog
              label="WhatsApp Notifications"
              sub={form.whatsapp || form.phone
                ? `Will message: ${form.whatsapp || form.phone}`
                : "Add your number in the Profile tab first"}
              checked={notifs.whatsapp_notifications}
              onChange={(v: boolean) => setNotifs(n => ({ ...n, whatsapp_notifications: v }))} />
            <Tog label="Announcements" sub="Academy-wide messages"
              checked={notifs.announcement_notifications} onChange={(v: boolean) => setNotifs(n => ({ ...n, announcement_notifications: v }))} />
          </Sec>
          <Sec title="Classes & Exams">
            <Tog label="Class Reminders" sub="15 min + 5 min before class starts"
              checked={notifs.class_reminder} onChange={(v: boolean) => setNotifs(n => ({ ...n, class_reminder: v }))} />
            <Tog label="Exam Reminders"
              checked={notifs.exam_reminder} onChange={(v: boolean) => setNotifs(n => ({ ...n, exam_reminder: v }))} />
            <Tog label="Results Released" sub="When exam results are ready"
              checked={notifs.results_notification} onChange={(v: boolean) => setNotifs(n => ({ ...n, results_notification: v }))} />
            <Tog label="New Recordings" sub="When class recordings are uploaded"
              checked={notifs.new_recording_alert} onChange={(v: boolean) => setNotifs(n => ({ ...n, new_recording_alert: v }))} />
          </Sec>
          <SaveBtn fn={saveNotifs} />
        </>}

        {/* ── PREFERENCES TAB ─────────────────────────────────────── */}
        {tab === "preferences" && <>
          <Sec title="Language & Display">
            <Fld label="Interface Language">
              <select style={inp} value={prefs.language} onChange={e => setPrefs(p => ({ ...p, language: e.target.value }))}>
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </select>
            </Fld>
            <Tog label="Dark Mode" sub="Coming soon" checked={prefs.dark_mode} onChange={(v: boolean) => setPrefs(p => ({ ...p, dark_mode: v }))} />
          </Sec>
          <Sec title="Learning">
            <Tog label="Autoplay Recordings" checked={prefs.autoplay_recordings} onChange={(v: boolean) => setPrefs(p => ({ ...p, autoplay_recordings: v }))} />
            <Tog label="Show Subtitles" checked={prefs.show_subtitles} onChange={(v: boolean) => setPrefs(p => ({ ...p, show_subtitles: v }))} />
            <Fld label="Playback Speed">
              <select style={inp} value={prefs.playback_speed} onChange={e => setPrefs(p => ({ ...p, playback_speed: e.target.value }))}>
                {["0.75x","1x","1.25x","1.5x","2x"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Fld>
            <Fld label="Default View">
              <select style={inp} value={prefs.default_subject_view} onChange={e => setPrefs(p => ({ ...p, default_subject_view: e.target.value }))}>
                <option value="grid">Grid</option>
                <option value="list">List</option>
              </select>
            </Fld>
          </Sec>
          <SaveBtn fn={savePrefs} />
        </>}

        {/* ── SECURITY TAB ────────────────────────────────────────── */}
        {tab === "security" && <>
          <Sec title="Account Security">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: "1px solid #F3F4F6" }}>
              <div><p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>Password</p><p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Change your login password</p></div>
              <button onClick={() => setShowPw(true)} style={{ padding: "7px 14px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", gap: 5 }}>
                <Lock size={12} /> Change
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0" }}>
              <div><p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>Email</p><p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{user?.email}</p></div>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#DCFCE7", color: "#166534", fontWeight: 700 }}>✓ Verified</span>
            </div>
          </Sec>
          <Sec title="Session">
            <button onClick={async () => { await signOut(); navigate("/login"); }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, background: "#FFF7ED", border: "1px solid #FED7AA", cursor: "pointer", width: "100%", marginBottom: 8 }}>
              <LogOut size={16} color="#D97706" />
              <div style={{ textAlign: "left" }}><p style={{ fontWeight: 700, fontSize: 13, color: "#D97706", margin: 0 }}>Sign Out</p></div>
            </button>
            <button onClick={() => setShowDelete(true)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, background: "#FEF2F2", border: "1px solid #FECACA", cursor: "pointer", width: "100%" }}>
              <Trash2 size={16} color="#DC2626" />
              <div style={{ textAlign: "left" }}><p style={{ fontWeight: 700, fontSize: 13, color: "#DC2626", margin: 0 }}>Delete Account</p></div>
            </button>
          </Sec>
        </>}
      </div>

      {/* ── Change Password Dialog ───────────────────────────────── */}
      <Dialog open={showPw} onOpenChange={v => !v && setShowPw(false)}>
        <DialogContent style={{ maxWidth: 400, borderRadius: 20, padding: 0 }}>
          <div style={{ background: G, padding: "16px 20px", borderRadius: "20px 20px 0 0" }}>
            <h2 style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0 }}>🔒 Change Password</h2>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ position: "relative" }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>New Password</label>
              <input type={showPwVis ? "text" : "password"} value={pw.new} onChange={e => setPw(p => ({ ...p, new: e.target.value }))} style={{ ...inp, paddingRight: 40 }} />
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
              style={{ padding: "12px 0", borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 700, color: "#fff", background: changingPw || !pw.new || pw.new !== pw.confirm ? "#9CA3AF" : G, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {changingPw ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Changing…</> : "Update Password"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Account Dialog ────────────────────────────────── */}
      <Dialog open={showDelete} onOpenChange={v => !v && setShowDelete(false)}>
        <DialogContent style={{ maxWidth: 360, borderRadius: 20, padding: 24, textAlign: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <AlertTriangle size={24} color="#DC2626" />
          </div>
          <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Delete Account?</h3>
          <p style={{ fontSize: 12, color: "#6B7280", marginBottom: 18, lineHeight: 1.6 }}>
            Permanently deletes your account, exam results, and learning history. Cannot be undone.
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
