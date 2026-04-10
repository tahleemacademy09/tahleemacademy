// src/pages/teacher/TeacherPublicClasses.tsx
// Teacher version of public class management — create, manage and share public classes

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Copy, Share2, Trash2, Radio, Calendar, Users,
  ExternalLink, Video, Clock, ChevronRight, Loader2,
  Globe, Lock, MessageCircle, Star, Eye,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const G    = "#064E3B";
const GOLD = "#C9A84C";

const generateRoomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

export default function TeacherPublicClasses() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    title: "", title_ar: "", description: "", description_ar: "",
    subject_id: "", scheduled_at: "", max_guests: 100,
    allow_guests: true, require_name: true,
    chat_enabled: true, raise_hand_enabled: true,
    recording_enabled: false, password_enabled: false, password: "",
  });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: subs } = await supabase.from("subjects").select("id, title").eq("teacher_id", user.id);
      setSubjects(subs || []);
      const { data } = await supabase.from("public_classes")
        .select("*, subjects(title), public_class_guests(count)")
        .eq("host_id", user.id)
        .order("created_at", { ascending: false });
      setClasses(data || []);
      setLoading(false);
    };
    load();
  }, [user]);

  const handleCreate = async () => {
    if (!form.title || !user) return;
    setCreating(true);
    const roomCode = generateRoomCode();
    const joinUrl  = `${window.location.origin}/live/${roomCode}`;

    const { error } = await supabase.from("public_classes").insert({
      title:              form.title,
      title_ar:           form.title_ar || null,
      description:        form.description || null,
      description_ar:     form.description_ar || null,
      host_id:            user.id,
      subject_id:         form.subject_id || null,
      room_code:          roomCode,
      join_url:           joinUrl,
      status:             "scheduled",
      scheduled_at:       form.scheduled_at || null,
      max_guests:         form.max_guests,
      allow_guests:       form.allow_guests,
      require_name:       form.require_name,
      chat_enabled:       form.chat_enabled,
      raise_hand_enabled: form.raise_hand_enabled,
      recording_enabled:  form.recording_enabled,
      password_enabled:   form.password_enabled,
      password:           form.password_enabled ? form.password : null,
    });

    if (!error) {
      toast.success(t("Public class created!", "تم إنشاء الدرس العام!"));
      setShowCreate(false);
      setForm({
        title: "", title_ar: "", description: "", description_ar: "",
        subject_id: "", scheduled_at: "", max_guests: 100,
        allow_guests: true, require_name: true,
        chat_enabled: true, raise_hand_enabled: true,
        recording_enabled: false, password_enabled: false, password: "",
      });
      const { data } = await supabase.from("public_classes")
        .select("*, subjects(title)")
        .eq("host_id", user.id)
        .order("created_at", { ascending: false });
      setClasses(data || []);
    } else {
      toast.error(error.message);
    }
    setCreating(false);
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("public_classes").update({ status }).eq("id", id);
    setClasses(prev => prev.map(c => c.id === id ? { ...c, status } : c));
  };

  const deleteClass = async (id: string) => {
    if (!confirm(t("Delete this class?", "حذف هذا الدرس؟"))) return;
    await supabase.from("public_classes").delete().eq("id", id);
    setClasses(prev => prev.filter(c => c.id !== id));
    toast.success(t("Deleted", "تم الحذف"));
  };

  const copyLink = (cls: any) => {
    const url = cls.join_url || `${window.location.origin}/live/${cls.room_code}`;
    navigator.clipboard.writeText(url);
    toast.success(t("Link copied!", "تم نسخ الرابط!"));
  };

  const statusColor: Record<string, { bg: string; color: string }> = {
    scheduled: { bg: "#EFF6FF", color: "#2563EB" },
    live:      { bg: "#F0FDF4", color: "#16A34A" },
    ended:     { bg: "#F3F4F6", color: "#6B7280" },
    cancelled: { bg: "#FEF2F2", color: "#DC2626" },
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 10,
    border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none",
    background: "#FAFAFA", boxSizing: "border-box" as const,
    fontFamily: "system-ui, sans-serif",
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
      <Loader2 size={32} style={{ animation: "spin .8s linear infinite", color: GOLD }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "system-ui, sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: G, margin: 0 }}>{t("Public Classes", "الدروس العامة")}</h1>
            <p style={{ fontSize: 13, color: "#9CA3AF", margin: "2px 0 0" }}>{t("Share your knowledge with the world", "شارك علمك مع العالم")}</p>
          </div>
          <button onClick={() => setShowCreate(true)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "10px 18px",
            borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${G}, #075E54)`,
            color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            <Plus size={15} /> {t("New Public Class", "درس عام جديد")}
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.6)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}
          onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div style={{
            background: "#fff", borderRadius: 20, width: "100%", maxWidth: 560,
            maxHeight: "90vh", overflowY: "auto",
          }}>
            <div style={{ padding: "18px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: G, margin: 0 }}>{t("Create Public Class", "إنشاء درس عام")}</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9CA3AF" }}>×</button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>
                    {t("Title *", "العنوان *")}
                  </label>
                  <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inp} placeholder={t("e.g. Introduction to Tajweed", "مثال: مقدمة في التجويد")} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>
                    {t("Arabic Title", "العنوان بالعربية")}
                  </label>
                  <input value={form.title_ar} onChange={e => setForm(f => ({ ...f, title_ar: e.target.value }))} dir="rtl" style={{ ...inp, fontFamily: "'Amiri', serif" }} placeholder="مثال: مقدمة في التجويد" />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>
                  {t("Description", "الوصف")}
                </label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" as const }} placeholder={t("What will students learn?", "ماذا سيتعلم الطلاب؟")} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>
                    {t("Subject (optional)", "المادة (اختياري)")}
                  </label>
                  <select value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))} style={inp}>
                    <option value="">— {t("None", "لا شيء")} —</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>
                    {t("Scheduled At", "موعد الدرس")}
                  </label>
                  <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} style={inp} />
                </div>
              </div>

              {/* Settings */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", borderRadius: 12, background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: G, margin: 0 }}>{t("Settings", "الإعدادات")}</p>
                {[
                  { key: "allow_guests",       label: t("Allow Guests",          "السماح للضيوف") },
                  { key: "require_name",        label: t("Require Name",          "طلب الاسم") },
                  { key: "chat_enabled",        label: t("Enable Chat",           "تفعيل الدردشة") },
                  { key: "raise_hand_enabled",  label: t("Enable Raise Hand",     "تفعيل رفع اليد") },
                  { key: "recording_enabled",   label: t("Enable Recording",      "تفعيل التسجيل") },
                  { key: "password_enabled",    label: t("Password Protected",    "بكلمة مرور") },
                ].map(({ key, label }) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, color: "#374151" }}>{label}</span>
                    <Switch
                      checked={!!(form as any)[key]}
                      onCheckedChange={v => setForm(f => ({ ...f, [key]: v }))}
                    />
                  </div>
                ))}
                {form.password_enabled && (
                  <input
                    type="text" value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder={t("Enter password", "أدخل كلمة المرور")}
                    style={{ ...inp, marginTop: 4 }}
                  />
                )}
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {t("Cancel", "إلغاء")}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !form.title}
                  style={{
                    flex: 2, padding: "12px", borderRadius: 12, border: "none",
                    background: creating || !form.title ? "#E5E7EB" : `linear-gradient(135deg, ${G}, #075E54)`,
                    color: creating || !form.title ? "#9CA3AF" : "#fff",
                    fontSize: 13, fontWeight: 800, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                >
                  {creating ? <Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> : <Radio size={14} />}
                  {creating ? t("Creating…", "جاري الإنشاء…") : t("Create Class", "إنشاء الدرس")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Classes list */}
      <div style={{ maxWidth: 800, margin: "20px auto", padding: "0 20px 40px", display: "flex", flexDirection: "column", gap: 14 }}>
        {classes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 24px", borderRadius: 20, border: "2px dashed #E5E7EB", background: "#FAFAFA" }}>
            <Globe size={48} style={{ margin: "0 auto 16px", display: "block", opacity: 0.2, color: G }} />
            <p style={{ fontWeight: 700, fontSize: 16, color: "#374151", margin: "0 0 4px" }}>
              {t("No public classes yet", "لا توجد دروس عامة بعد")}
            </p>
            <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>
              {t("Create your first public class and share it with the world", "أنشئ أول درس عام وشاركه مع العالم")}
            </p>
          </div>
        ) : classes.map(cls => {
          const sc = statusColor[cls.status] || statusColor.scheduled;
          const joinUrl = cls.join_url || `${window.location.origin}/live/${cls.room_code}`;
          return (
            <div key={cls.id} style={{
              background: "#fff", borderRadius: 18, border: "1px solid #E5E7EB",
              overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,.04)",
            }}>
              {/* Status bar */}
              {cls.status === "live" && (
                <div style={{ background: "#16A34A", padding: "6px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff", animation: "pulse 1s infinite" }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>LIVE NOW</span>
                  <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
                </div>
              )}

              <div style={{ padding: 20 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: `${G}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Video size={22} color={G} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <h3 style={{ fontWeight: 800, fontSize: 16, color: G, margin: 0 }}>{language === "ar" ? cls.title_ar || cls.title : cls.title}</h3>
                      <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: sc.bg, color: sc.color }}>
                        {cls.status}
                      </span>
                    </div>
                    {cls.description && <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 6px", lineHeight: 1.5 }}>{cls.description}</p>}
                    <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#9CA3AF", flexWrap: "wrap" }}>
                      {cls.subjects?.title && <span>📚 {cls.subjects.title}</span>}
                      {cls.scheduled_at && <span>📅 {format(new Date(cls.scheduled_at), "MMM d 'at' h:mm a")}</span>}
                      <span>👥 {cls.guest_count || 0} / {cls.max_guests}</span>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, color: G }}>🔑 {cls.room_code}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => copyLink(cls)} style={{
                    padding: "8px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB",
                    background: "#fff", color: G, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <Copy size={13} /> {t("Copy Link", "نسخ الرابط")}
                  </button>
                  <button onClick={() => window.open(joinUrl, "_blank")} style={{
                    padding: "8px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB",
                    background: "#fff", color: G, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <ExternalLink size={13} /> {t("Open", "فتح")}
                  </button>

                  {cls.status === "scheduled" && (
                    <button onClick={() => updateStatus(cls.id, "live")} style={{
                      padding: "8px 14px", borderRadius: 10, border: "none",
                      background: "#16A34A", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <Radio size={13} /> {t("Go Live", "ابدأ البث")}
                    </button>
                  )}
                  {cls.status === "live" && (
                    <button onClick={() => updateStatus(cls.id, "ended")} style={{
                      padding: "8px 14px", borderRadius: 10, border: "none",
                      background: "#DC2626", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      {t("End Class", "إنهاء الدرس")}
                    </button>
                  )}

                  <button onClick={() => deleteClass(cls.id)} style={{
                    padding: "8px 10px", borderRadius: 10, border: "1.5px solid #FEE2E2",
                    background: "#FEF2F2", color: "#DC2626", fontSize: 12, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 4, marginLeft: "auto",
                  }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
