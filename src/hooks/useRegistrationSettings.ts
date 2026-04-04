// src/pages/admin/RegistrationSettings.tsx
// ══════════════════════════════════════════════════════════════════════════
// UNIFIED REGISTRATION CONTROL CENTER
// Sections:
//  1. Stats + Master Gate (open/close registration)
//  2. Enrollment Flow (which steps appear)
//  3. Entrance Exam Questions (CRUD — was separate EntranceExamAdmin)
//  4. Recitation Test Settings (was separate RecitationTestAdmin)
//  5. Student Registrations Panel (level assignment + delete accounts)
// ══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRegistrationSettings, RegistrationConfig } from "@/hooks/useRegistrationSettings";
import { Switch } from "@/components/ui/switch";
import {
  UserPlus, UserX, CreditCard, GraduationCap, Mic,
  FileText, Loader2, RefreshCw, Plus, Trash2, Edit2,
  BookOpen, CheckCircle, XCircle, ChevronDown, ChevronUp,
  ArrowUp, ArrowDown, Save, Shield, Users, Settings,
  AlertTriangle, Bell, Calendar, Eye, Search,
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9A84C";
const ENTRANCE_EXAM_ID = "36ef6492-2515-44ea-b086-67c9cee02475";
const LEVELS = ["beginner", "intermediate", "advanced"] as const;

type Tab = "gate" | "flow" | "exam" | "recitation" | "students";

// ── Helpers ────────────────────────────────────────────────────────────────
const card: React.CSSProperties = { background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", overflow: "hidden", marginBottom: 14 };
const cardHead = (title: string, icon: React.ReactNode): React.CSSProperties => ({ padding: "11px 16px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" });
const inp: React.CSSProperties  = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none", background: "#FAFAFA", boxSizing: "border-box" as const, fontFamily: "inherit" };

const Sec = ({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) => (
  <div style={card}>
    <div style={cardHead(title, icon)}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon}<p style={{ fontWeight: 800, fontSize: 12, color: "#374151", margin: 0, textTransform: "uppercase" as const, letterSpacing: .5 }}>{title}</p>
      </div>
    </div>
    <div style={{ padding: "14px 16px" }}>{children}</div>
  </div>
);

const Tog = ({ label, sub, checked, onChange }: any) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid #F9FAFB" }}>
    <div>
      <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>{label}</p>
      {sub && <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{sub}</p>}
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

// ── Level colours ─────────────────────────────────────────────────────────
const LVL: Record<string, { bg: string; text: string; border: string; label: string }> = {
  beginner:     { bg: "#F0FDF4", text: "#166534", border: "#86EFAC", label: "Beginner"     },
  intermediate: { bg: "#EFF6FF", text: "#1E40AF", border: "#93C5FD", label: "Intermediate" },
  advanced:     { bg: "#FDF4FF", text: "#6B21A8", border: "#D8B4FE", label: "Advanced"     },
};

// ══════════════════════════════════════════════════════════════════════════
export default function RegistrationSettings() {
  const { user }    = useAuth();
  const { toast }   = useToast();
  const { config: serverConfig, loading, saveAll, fetch, currencySymbol } = useRegistrationSettings();

  const [tab,      setTab]      = useState<Tab>("gate");
  const [draft,    setDraft]    = useState<RegistrationConfig | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [regStats, setRegStats] = useState({ today: 0, week: 0, total: 0 });
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  // Exam questions state
  const [questions,    setQuestions]    = useState<any[]>([]);
  const [qLoading,     setQLoading]     = useState(false);
  const [editQ,        setEditQ]        = useState<any | null>(null);
  const [showQForm,    setShowQForm]    = useState(false);
  const [savingQ,      setSavingQ]      = useState(false);
  const [qForm,        setQForm]        = useState({ question_text: "", question_text_ar: "", question_type: "mcq", points: 5, difficulty: "easy", options: ["","","",""], correct_answer: "" });

  // Recitation state
  const [recSettings,  setRecSettings]  = useState({
    surahName: "Al-Fatihah", surahArabic: "الفاتحة",
    instructions: "Please recite Surah Al-Fatihah clearly and at a moderate pace.",
    tips: "", minDuration: "10", maxDuration: "120",
    aiEnabled: true, availTimes: "09:00,10:00,11:00,14:00,15:00,16:00,17:00",
  });
  const [recSaving, setRecSaving] = useState(false);

  // Students state
  const [students,     setStudents]     = useState<any[]>([]);
  const [stdLoading,   setStdLoading]   = useState(false);
  const [stdFilter,    setStdFilter]    = useState<"all"|"pending"|"assigned">("pending");
  const [stdSearch,    setStdSearch]    = useState("");
  const [assigning,    setAssigning]    = useState<string|null>(null);
  const [selLevels,    setSelLevels]    = useState<Record<string, string>>({});
  const [deleting,     setDeleting]     = useState<string|null>(null);
  const [expandedId,   setExpandedId]   = useState<string|null>(null);

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => { if (!loading && serverConfig) setDraft({ ...serverConfig }); }, [loading, serverConfig]);

  useEffect(() => {
    (async () => {
      const today   = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const [a, b, c] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", `${today}T00:00:00`),
        supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", weekAgo),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
      ]);
      setRegStats({ today: a.count || 0, week: b.count || 0, total: c.count || 0 });
    })();
  }, []);

  useEffect(() => {
    if (tab === "exam") loadQuestions();
    if (tab === "recitation") loadRecSettings();
    if (tab === "students") loadStudents();
  }, [tab]);

  // ── Exam questions ────────────────────────────────────────────────────────
  const loadQuestions = async () => {
    setQLoading(true);
    const { data } = await supabase.from("exam_questions").select("*").eq("exam_id", ENTRANCE_EXAM_ID).order("sort_order");
    setQuestions(data || []);
    setQLoading(false);
  };

  const saveQuestion = async () => {
    setSavingQ(true);
    const payload = {
      exam_id:          ENTRANCE_EXAM_ID,
      question_text:    qForm.question_text,
      question_text_ar: qForm.question_text_ar,
      question_type:    qForm.question_type,
      points:           Number(qForm.points) || 1,
      difficulty:       qForm.difficulty,
      options:          qForm.question_type === "mcq" ? qForm.options.filter(Boolean).map((o, i) => ({ id: `opt${i}`, text: o })) : null,
      correct_answer:   qForm.correct_answer,
      sort_order:       editQ?.sort_order ?? (questions.length + 1),
    };
    if (editQ?.id) {
      await supabase.from("exam_questions").update(payload as any).eq("id", editQ.id);
    } else {
      await supabase.from("exam_questions").insert(payload as any);
    }
    await loadQuestions();
    setShowQForm(false); setEditQ(null);
    resetQForm();
    toast({ title: editQ ? "✅ Question updated" : "✅ Question added" });
    setSavingQ(false);
  };

  const deleteQuestion = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    await supabase.from("exam_questions").delete().eq("id", id);
    await loadQuestions();
    toast({ title: "Question deleted" });
  };

  const moveQuestion = async (id: string, dir: "up" | "down") => {
    const idx = questions.findIndex(q => q.id === id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= questions.length) return;
    const a = questions[idx]; const b = questions[swapIdx];
    await supabase.from("exam_questions").update({ sort_order: b.sort_order } as any).eq("id", a.id);
    await supabase.from("exam_questions").update({ sort_order: a.sort_order } as any).eq("id", b.id);
    await loadQuestions();
  };

  const resetQForm = () => setQForm({ question_text: "", question_text_ar: "", question_type: "mcq", points: 5, difficulty: "easy", options: ["","","",""], correct_answer: "" });
  const openEditQ = (q: any) => {
    setEditQ(q);
    const opts = (q.options || []).map((o: any) => typeof o === "string" ? o : o.text || "");
    setQForm({ question_text: q.question_text || "", question_text_ar: q.question_text_ar || "", question_type: q.question_type || "mcq", points: q.points || 5, difficulty: q.difficulty || "easy", options: [...opts, "", "", "", ""].slice(0, 4), correct_answer: q.correct_answer || "" });
    setShowQForm(true);
  };

  // ── Recitation settings ───────────────────────────────────────────────────
  const loadRecSettings = async () => {
    const { data } = await supabase.from("academy_settings" as any).select("key,value").in("key", ["recitation_surah_name","recitation_surah_arabic","recitation_instructions","recitation_tips","recitation_min_duration","recitation_max_duration","recitation_ai_enabled","available_session_times"]);
    if (data) {
      const m: Record<string,string> = {};
      (data as any[]).forEach((r: any) => { m[r.key] = r.value; });
      setRecSettings({ surahName: m.recitation_surah_name || "Al-Fatihah", surahArabic: m.recitation_surah_arabic || "الفاتحة", instructions: m.recitation_instructions || "", tips: m.recitation_tips || "", minDuration: m.recitation_min_duration || "10", maxDuration: m.recitation_max_duration || "120", aiEnabled: m.recitation_ai_enabled !== "false", availTimes: m.available_session_times || "" });
    }
  };

  const saveRecSettings = async () => {
    setRecSaving(true);
    const entries: [string, string][] = [
      ["recitation_surah_name",    recSettings.surahName],
      ["recitation_surah_arabic",  recSettings.surahArabic],
      ["recitation_instructions",  recSettings.instructions],
      ["recitation_tips",          recSettings.tips],
      ["recitation_min_duration",  recSettings.minDuration],
      ["recitation_max_duration",  recSettings.maxDuration],
      ["recitation_ai_enabled",    String(recSettings.aiEnabled)],
      ["available_session_times",  recSettings.availTimes],
    ];
    await Promise.all(entries.map(([key, value]) =>
      supabase.from("academy_settings" as any).upsert({ key, value, updated_at: new Date().toISOString() } as any, { onConflict: "key" })
    ));
    toast({ title: "✅ Recitation settings saved" });
    setRecSaving(false);
  };

  // ── Students ──────────────────────────────────────────────────────────────
  const loadStudents = async () => {
    setStdLoading(true);
    try {
      const { data: tp } = await supabase.from("tasjeel_progress" as any).select("user_id,current_step,level_assigned,created_at").neq("current_step","enrollment");
      if (!tp?.length) { setStudents([]); setStdLoading(false); return; }
      const uids = tp.map((r: any) => r.user_id);
      const tMap: Record<string,any> = {}; (tp as any[]).forEach((r:any)=>{ tMap[r.user_id]=r; });
      const [profRes, examRes, recRes] = await Promise.all([
        supabase.from("profiles").select("user_id,full_name,full_name_ar,email,student_id,avatar_url,level,phone,country,created_at").in("user_id", uids),
        supabase.from("exam_attempts").select("user_id,score,percentage,status,submitted_at").in("user_id", uids).in("status",["submitted","graded","completed"]),
        (supabase as any).from("recitation_tests").select("user_id,ai_score,status,virtual_session_date,virtual_session_time,admin_approved").in("user_id", uids),
      ]);
      const pMap: Record<string,any>={}; (profRes.data||[]).forEach((r:any)=>{ pMap[r.user_id]=r; });
      const eMap: Record<string,any>={}; (examRes.data||[]).forEach((r:any)=>{ if(!eMap[r.user_id]||new Date(r.submitted_at)>new Date(eMap[r.user_id].submitted_at)) eMap[r.user_id]=r; });
      const rMap: Record<string,any>={}; (recRes.data||[]).forEach((r:any)=>{ rMap[r.user_id]=r; });
      const built = uids.map((uid:string) => ({ uid, t: tMap[uid]||{}, p: pMap[uid]||{}, e: eMap[uid]||{}, r: rMap[uid]||{} }));
      setStudents(built);
    } catch (e: any) { toast({ title: "Error loading", variant: "destructive" }); }
    setStdLoading(false);
  };

  const assignLevel = async (uid: string) => {
    const lvl = selLevels[uid] || "beginner";
    setAssigning(uid);
    try {
      await supabase.from("profiles").update({ level: lvl, course_level: lvl } as any).eq("user_id", uid);
      await (supabase as any).from("tasjeel_progress").update({ current_step: "completed", level_assigned: lvl, level_assigned_at: new Date().toISOString(), completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", uid);
      await (supabase as any).from("recitation_tests").update({ final_level: lvl, admin_approved: true, admin_approved_at: new Date().toISOString(), status: "approved" }).eq("user_id", uid);
      await (supabase as any).from("notifications").insert({ user_id: uid, title: "🎉 Your Level Has Been Assigned!", message: `Congratulations! You have been placed in the ${LVL[lvl]?.label || lvl} level. Your dashboard is now unlocked!`, type: "level_assigned", is_read: false });
      toast({ title: `✅ Level assigned: ${LVL[lvl]?.label}` });
      await loadStudents();
    } catch (e: any) { toast({ title: "Assignment failed", variant: "destructive" }); }
    setAssigning(null);
  };

  const deleteAccount = async (uid: string, name: string) => {
    if (!confirm(`⚠️ PERMANENTLY delete "${name}"?\n\nThis will remove ALL their data (exams, recitation, progress) and they can re-register with the same email.\n\nThis cannot be undone.`)) return;
    setDeleting(uid);
    try {
      // Delete related data in order
      await supabase.from("notifications" as any).delete().eq("user_id", uid);
      const { data: attempts } = await supabase.from("exam_attempts").select("id").eq("user_id", uid);
      if (attempts?.length) await supabase.from("exam_answers").delete().in("attempt_id", attempts.map((a:any)=>a.id));
      await supabase.from("exam_attempts").delete().eq("user_id", uid);
      await supabase.from("tasjeel_progress" as any).delete().eq("user_id", uid);
      await (supabase as any).from("recitation_tests").delete().eq("user_id", uid);
      await (supabase as any).from("onboarding_forms").delete().eq("user_id", uid);
      await supabase.from("user_roles" as any).delete().eq("user_id", uid);
      await (supabase as any).from("student_enrollments").delete().eq("user_id", uid);
      await supabase.from("profiles").delete().eq("user_id", uid);
      // Note: deleting auth.users requires service role key — this cleans all data
      toast({ title: `✅ Account for "${name}" deleted. They can re-register.` });
      await loadStudents();
    } catch (e: any) { toast({ title: "Delete failed: " + e.message, variant: "destructive" }); }
    setDeleting(null);
  };

  // ── Save registration config ──────────────────────────────────────────────
  const handleSaveAll = async () => {
    if (!draft) return;
    setSaving(true);
    await saveAll(draft, user?.id);
    setSaving(false);
    toast({ title: "✅ Settings saved — live immediately" });
  };

  if (loading || !draft) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <Loader2 size={28} style={{ animation: "spin .8s linear infinite", color: G }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const d   = draft;
  const set = (patch: Partial<RegistrationConfig>) => setDraft(prev => prev ? { ...prev, ...patch } : prev);
  const sym = currencySymbol(d.entrance_fee_currency);

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "gate",       label: "Open/Close",  icon: <Shield size={14}    /> },
    { id: "flow",       label: "Flow",        icon: <Settings size={14}  /> },
    { id: "exam",       label: "Exam Qs",     icon: <FileText size={14}  /> },
    { id: "recitation", label: "Recitation",  icon: <Mic size={14}       /> },
    { id: "students",   label: "Students",    icon: <Users size={14}     /> },
  ];

  const filteredStudents = students.filter(s => {
    const isApproved = s.t.current_step === "completed";
    if (stdFilter === "pending" && isApproved) return false;
    if (stdFilter === "assigned" && !isApproved) return false;
    if (stdSearch) {
      const q = stdSearch.toLowerCase();
      return s.p.full_name?.toLowerCase().includes(q) || s.p.email?.toLowerCase().includes(q) || s.p.student_id?.includes(q);
    }
    return true;
  });

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: d.registration_open ? "#F0FDF4" : "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {d.registration_open ? <UserPlus size={22} color="#16A34A" /> : <UserX size={22} color="#DC2626" />}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 17, fontWeight: 800, color: "#111", margin: 0 }}>Registration Control Center</h1>
            <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>All registration settings, exam questions, recitation & student management</p>
          </div>
          <button onClick={fetch} style={{ padding: "7px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#6B7280" }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4, marginTop: 14, overflowX: "auto", scrollbarWidth: "none" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
              borderRadius: 20, border: `1.5px solid ${tab === t.id ? G : "#E5E7EB"}`,
              background: tab === t.id ? G : "#fff", color: tab === t.id ? "#fff" : "#6B7280",
              fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
            }}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 700, margin: "0 auto" }}>

        {/* ════════ TAB: GATE ════════ */}
        {tab === "gate" && (
          <>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
              {[{ v: regStats.today, l: "Today", icon: "📅", bg: "#EFF6FF", c: "#1D4ED8" }, { v: regStats.week, l: "7 Days", icon: "📈", bg: "#F0FDF4", c: "#166534" }, { v: regStats.total, l: "Total", icon: "👥", bg: "#F5F3FF", c: "#6D28D9" }].map((s, i) => (
                <div key={i} style={{ background: s.bg, borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ fontSize: 18, marginBottom: 3 }}>{s.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 11, color: s.c, opacity: .7, fontWeight: 600 }}>Registrations {s.l}</div>
                </div>
              ))}
            </div>

            {/* Master gate */}
            <div style={{ borderRadius: 16, padding: "18px 20px", marginBottom: 16, background: d.registration_open ? "#F0FDF4" : "#FEF2F2", border: `2px solid ${d.registration_open ? "#86EFAC" : "#FECACA"}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 50, height: 50, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: d.registration_open ? "#16A34A" : "#DC2626", flexShrink: 0 }}>
                  {d.registration_open ? <UserPlus size={22} color="#fff" /> : <UserX size={22} color="#fff" />}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 900, fontSize: 16, margin: 0, color: d.registration_open ? "#166534" : "#991B1B" }}>
                    Registration is {d.registration_open ? "OPEN" : "CLOSED"}
                  </p>
                  <p style={{ fontSize: 12, margin: "3px 0 0", color: d.registration_open ? "#16A34A" : "#DC2626" }}>
                    {d.registration_open
                      ? `New students can register${d.entrance_fee_enabled ? ` · ${sym}${d.entrance_fee_amount.toLocaleString()} fee` : " · No payment"}`
                      : "Registration page shows closed message"}
                  </p>
                </div>
                {saving && <Loader2 size={20} style={{ animation: "spin .8s linear infinite", color: G }} />}
                <Switch checked={d.registration_open} onCheckedChange={async v => {
                  if (!v && !confirm("Close registration? Students won't be able to register until you re-open.")) return;
                  const nd = { ...d, registration_open: v };
                  setDraft(nd); setSaving(true);
                  await saveAll(nd, user?.id); setSaving(false);
                  toast({ title: v ? "✅ Registration OPEN" : "✅ Registration CLOSED" });
                }} />
              </div>
            </div>

            <Sec title="Messages" icon={<Bell size={14} color={G} />}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>Welcome message (when open)</label>
                <textarea value={d.registration_message} onChange={e => set({ registration_message: e.target.value })} rows={2} style={{ ...inp, resize: "vertical" as const }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>Closed message (when closed)</label>
                <textarea value={d.closed_message} onChange={e => set({ closed_message: e.target.value })} rows={2} style={{ ...inp, resize: "vertical" as const }} />
              </div>
            </Sec>

            <button onClick={handleSaveAll} disabled={saving} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${G},${GM})`, color: "#fff", fontSize: 14, fontWeight: 800, cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? <><Loader2 size={14} style={{ display: "inline", marginRight: 6, animation: "spin .8s linear infinite" }} />Saving…</> : "💾 Save Settings"}
            </button>
          </>
        )}

        {/* ════════ TAB: FLOW ════════ */}
        {tab === "flow" && (
          <>
            {/* Visual flow */}
            <div style={{ ...card }}>
              <div style={cardHead("Enrollment Flow Preview", <GraduationCap size={14} color={G} />)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <GraduationCap size={14} color={G} />
                  <p style={{ fontWeight: 800, fontSize: 12, color: "#374151", margin: 0, textTransform: "uppercase", letterSpacing: .5 }}>Enrollment Flow Preview</p>
                </div>
              </div>
              <div style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", paddingBottom: 12, marginBottom: 10 }}>
                  {[
                    { label: "Account", always: true, icon: "👤" },
                    { label: `Pay ${sym}${d.entrance_fee_amount}`, show: d.entrance_fee_enabled, icon: "💳" },
                    { label: "Onboarding",  show: d.onboarding_required,       icon: "📝" },
                    { label: "Exam",        show: d.entrance_exam_required,    icon: "📋" },
                    { label: "Recitation",  show: d.recitation_test_required,  icon: "🎤" },
                    { label: "Session",     show: d.recitation_test_required,  icon: "📅" },
                    { label: "Dashboard",   always: true,                      icon: "🏠" },
                  ].map((step, i, arr) => {
                    const active = step.always || step.show;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, opacity: active ? 1 : .35 }}>
                          <div style={{ width: 44, height: 44, borderRadius: "50%", background: active ? G : "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                            {step.icon}
                          </div>
                          <span style={{ fontSize: 9, fontWeight: 700, color: active ? G : "#9ca3af", textAlign: "center", maxWidth: 55 }}>{step.label}</span>
                        </div>
                        {i < arr.length - 1 && <span style={{ color: "#d1d5db", fontSize: 16, flexShrink: 0 }}>›</span>}
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>↑ This is exactly what students see. Toggle below to update.</p>
              </div>
            </div>

            <Sec title="Registration Fee" icon={<CreditCard size={14} color={G} />}>
              <Tog label="Require Payment" sub="Students must pay before proceeding" checked={d.entrance_fee_enabled} onChange={(v: boolean) => set({ entrance_fee_enabled: v })} />
              {d.entrance_fee_enabled && (
                <div style={{ paddingTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Amount</label>
                    <input type="number" value={d.entrance_fee_amount} onChange={e => set({ entrance_fee_amount: Number(e.target.value) })} style={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Currency</label>
                    <select value={d.entrance_fee_currency} onChange={e => set({ entrance_fee_currency: e.target.value })} style={inp}>
                      {["NGN","USD","GBP","EUR","GHS"].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </Sec>

            <Sec title="Registration Steps" icon={<GraduationCap size={14} color={G} />}>
              <Tog label="Onboarding Form"    sub="Student fills background info before exam"       checked={d.onboarding_required}       onChange={(v: boolean) => set({ onboarding_required: v })} />
              <Tog label="Entrance Exam"      sub="Written placement test after payment/signup"     checked={d.entrance_exam_required}    onChange={(v: boolean) => set({ entrance_exam_required: v })} />
              <Tog label="Recitation Test"    sub="Audio evaluation of Quran recitation"            checked={d.recitation_test_required}  onChange={(v: boolean) => set({ recitation_test_required: v })} />
            </Sec>

            <button onClick={handleSaveAll} disabled={saving} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${G},${GM})`, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
              {saving ? "Saving…" : "💾 Save Flow Settings"}
            </button>
          </>
        )}

        {/* ════════ TAB: EXAM QUESTIONS ════════ */}
        {tab === "exam" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111", margin: 0 }}>Entrance Exam Questions</h2>
                <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>{questions.length} questions · ID: {ENTRANCE_EXAM_ID.slice(0,8)}…</p>
              </div>
              <button onClick={() => { resetQForm(); setEditQ(null); setShowQForm(true); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10, border: "none", background: G, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                <Plus size={14} /> Add Question
              </button>
            </div>

            {/* Question form */}
            {showQForm && (
              <div style={{ ...card, marginBottom: 16, border: `2px solid ${G}` }}>
                <div style={{ padding: "12px 16px", background: "#F0FDF4", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ fontWeight: 800, fontSize: 13, color: G, margin: 0 }}>{editQ ? "Edit Question" : "New Question"}</p>
                  <button onClick={() => { setShowQForm(false); setEditQ(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 18 }}>×</button>
                </div>
                <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Type</label>
                      <select value={qForm.question_type} onChange={e => setQForm(f => ({ ...f, question_type: e.target.value }))} style={inp}>
                        {["mcq","true_false","short_answer","essay","fill_blank"].map(t => <option key={t} value={t}>{t.replace("_"," ")}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Points</label>
                      <input type="number" value={qForm.points} onChange={e => setQForm(f => ({ ...f, points: Number(e.target.value) }))} style={inp} min={1} max={20} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Difficulty</label>
                      <select value={qForm.difficulty} onChange={e => setQForm(f => ({ ...f, difficulty: e.target.value }))} style={inp}>
                        {["easy","medium","hard"].map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Question (English)</label>
                    <textarea value={qForm.question_text} onChange={e => setQForm(f => ({ ...f, question_text: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" as const }} placeholder="Question text…" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Question (Arabic — optional)</label>
                    <textarea value={qForm.question_text_ar} onChange={e => setQForm(f => ({ ...f, question_text_ar: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" as const, direction: "rtl" }} placeholder="السؤال بالعربية…" />
                  </div>
                  {qForm.question_type === "mcq" && (
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Options</label>
                      {qForm.options.map((opt, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                          <input type="radio" name="correct" checked={qForm.correct_answer === `opt${i}`} onChange={() => setQForm(f => ({ ...f, correct_answer: `opt${i}` }))} />
                          <input value={opt} onChange={e => setQForm(f => { const o = [...f.options]; o[i] = e.target.value; return { ...f, options: o }; })} style={{ ...inp, flex: 1 }} placeholder={`Option ${i + 1}…`} />
                          {qForm.correct_answer === `opt${i}` && <CheckCircle size={14} color="#16a34a" />}
                        </div>
                      ))}
                      <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Select radio button to mark correct answer</p>
                    </div>
                  )}
                  {qForm.question_type === "true_false" && (
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Correct Answer</label>
                      <div style={{ display: "flex", gap: 10 }}>
                        {["true","false"].map(v => (
                          <button key={v} onClick={() => setQForm(f => ({ ...f, correct_answer: v }))} style={{ padding: "8px 20px", borderRadius: 10, border: `2px solid ${qForm.correct_answer === v ? G : "#E5E7EB"}`, background: qForm.correct_answer === v ? G : "#fff", color: qForm.correct_answer === v ? "#fff" : "#374151", fontWeight: 700, cursor: "pointer" }}>
                            {v === "true" ? "✓ True" : "✗ False"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <button onClick={saveQuestion} disabled={savingQ || !qForm.question_text} style={{ padding: "11px", borderRadius: 10, border: "none", background: savingQ || !qForm.question_text ? "#e5e7eb" : `linear-gradient(135deg,${G},${GM})`, color: savingQ || !qForm.question_text ? "#9ca3af" : "#fff", fontWeight: 700, cursor: savingQ || !qForm.question_text ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <Save size={14} /> {savingQ ? "Saving…" : editQ ? "Update Question" : "Add Question"}
                  </button>
                </div>
              </div>
            )}

            {/* Questions list */}
            {qLoading ? (
              <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={24} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
            ) : questions.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>
                <FileText size={40} style={{ margin: "0 auto 12px", display: "block" }} />
                <p>No questions yet. Add your first question above.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {questions.map((q, idx) => (
                  <div key={q.id} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <span style={{ width: 28, height: 28, borderRadius: "50%", background: "#F0FDF4", border: "1px solid #86EFAC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: G, flexShrink: 0 }}>{idx + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: "0 0 4px", lineHeight: 1.5 }}>{q.question_text || "(no text)"}</p>
                        {q.question_text_ar && <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 6px", direction: "rtl", fontFamily: "'Amiri',serif" }}>{q.question_text_ar}</p>}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#F3F4F6", color: "#6B7280" }}>{q.question_type?.replace("_"," ")}</span>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#FEF3C7", color: "#92400E" }}>{q.points || 1} pt</span>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#EFF6FF", color: "#1E40AF" }}>{q.difficulty}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => moveQuestion(q.id, "up")} disabled={idx === 0} style={{ padding: 6, borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: idx === 0 ? "not-allowed" : "pointer", opacity: idx === 0 ? .4 : 1 }}><ArrowUp size={13} /></button>
                        <button onClick={() => moveQuestion(q.id, "down")} disabled={idx === questions.length - 1} style={{ padding: 6, borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: idx === questions.length - 1 ? "not-allowed" : "pointer", opacity: idx === questions.length - 1 ? .4 : 1 }}><ArrowDown size={13} /></button>
                        <button onClick={() => openEditQ(q)} style={{ padding: 6, borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer" }}><Edit2 size={13} color={G} /></button>
                        <button onClick={() => deleteQuestion(q.id)} style={{ padding: 6, borderRadius: 8, border: "1px solid #FEE2E2", background: "#FEF2F2", cursor: "pointer" }}><Trash2 size={13} color="#DC2626" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ════════ TAB: RECITATION ════════ */}
        {tab === "recitation" && (
          <>
            <Sec title="Surah Configuration" icon={<BookOpen size={14} color={G} />}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Surah Name (English)</label>
                  <input value={recSettings.surahName} onChange={e => setRecSettings(s => ({ ...s, surahName: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Surah Name (Arabic)</label>
                  <input value={recSettings.surahArabic} onChange={e => setRecSettings(s => ({ ...s, surahArabic: e.target.value }))} style={{ ...inp, direction: "rtl", fontFamily: "'Amiri',serif" }} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Instructions for student</label>
                <textarea value={recSettings.instructions} onChange={e => setRecSettings(s => ({ ...s, instructions: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" as const }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Tips (optional)</label>
                <textarea value={recSettings.tips} onChange={e => setRecSettings(s => ({ ...s, tips: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" as const }} placeholder="e.g. Recite slowly, pronounce each letter clearly…" />
              </div>
            </Sec>

            <Sec title="Recording Limits" icon={<Mic size={14} color={G} />}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Min Duration (seconds)</label>
                  <input type="number" value={recSettings.minDuration} onChange={e => setRecSettings(s => ({ ...s, minDuration: e.target.value }))} style={inp} min={5} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Max Duration (seconds)</label>
                  <input type="number" value={recSettings.maxDuration} onChange={e => setRecSettings(s => ({ ...s, maxDuration: e.target.value }))} style={inp} max={300} />
                </div>
              </div>
            </Sec>

            <Sec title="Virtual Session Times" icon={<Calendar size={14} color={G} />}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
                Available Session Times (comma-separated, 24h format)
              </label>
              <input value={recSettings.availTimes} onChange={e => setRecSettings(s => ({ ...s, availTimes: e.target.value }))} style={inp} placeholder="09:00,10:00,14:00,15:00,16:00" />
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: "6px 0 0" }}>Students will pick from these times when scheduling their virtual session with admin.</p>
            </Sec>

            <Sec title="AI Scoring" icon={<Shield size={14} color={G} />}>
              <Tog label="Enable AI Accuracy Scoring" sub="Uses Groq Whisper to score the recitation automatically" checked={recSettings.aiEnabled} onChange={(v: boolean) => setRecSettings(s => ({ ...s, aiEnabled: v }))} />
            </Sec>

            <button onClick={saveRecSettings} disabled={recSaving} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${G},${GM})`, color: "#fff", fontSize: 14, fontWeight: 800, cursor: recSaving ? "not-allowed" : "pointer" }}>
              {recSaving ? "Saving…" : "💾 Save Recitation Settings"}
            </button>
          </>
        )}

        {/* ════════ TAB: STUDENTS ════════ */}
        {tab === "students" && (
          <>
            {/* Filter + search */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {[["all","All"],["pending","Pending Approval"],["assigned","Level Assigned"]].map(([v,l]) => (
                <button key={v} onClick={() => setStdFilter(v as any)} style={{ padding: "8px 14px", borderRadius: 20, border: `1.5px solid ${stdFilter === v ? G : "#E5E7EB"}`, background: stdFilter === v ? G : "#fff", color: stdFilter === v ? "#fff" : "#6B7280", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {l} ({students.filter(s => v === "all" ? true : v === "pending" ? s.t.current_step !== "completed" : s.t.current_step === "completed").length})
                </button>
              ))}
              <div style={{ flex: 1, display: "flex", gap: 8 }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
                  <input value={stdSearch} onChange={e => setStdSearch(e.target.value)} placeholder="Search name, email, ID…" style={{ ...inp, paddingLeft: 30 }} />
                </div>
                <button onClick={loadStudents} style={{ padding: "8px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer" }}>
                  <RefreshCw size={14} color="#6B7280" />
                </button>
              </div>
            </div>

            {stdLoading ? (
              <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={24} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
            ) : filteredStudents.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>
                <Users size={40} style={{ margin: "0 auto 12px", display: "block" }} />
                <p>No students found</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filteredStudents.map(({ uid, t, p, e, r }) => {
                  const isApproved = t.current_step === "completed";
                  const isExpanded = expandedId === uid;
                  const stepColor: Record<string,string> = { exam: "#f59e0b", recitation: "#8b5cf6", schedule_session: "#3b82f6", level_assignment: "#f97316", completed: "#22c55e" };
                  const stepLabel: Record<string,string> = { exam: "Exam Stage", recitation: "Recitation Stage", schedule_session: "Session Booked", level_assignment: "Awaiting Approval", completed: "Level Assigned" };

                  return (
                    <div key={uid} style={{ background: "#fff", borderRadius: 16, border: `1px solid ${isApproved ? "#86EFAC" : "#E5E7EB"}`, overflow: "hidden" }}>
                      {/* Student header */}
                      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => setExpandedId(isExpanded ? null : uid)}>
                        {p.avatar_url ? (
                          <img src={p.avatar_url} style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: 44, height: 44, borderRadius: "50%", background: G, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>{(p.full_name || "U")[0].toUpperCase()}</span>
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 800, fontSize: 14, color: "#111", margin: "0 0 3px" }}>{p.full_name || "Unknown Student"}</p>
                          <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{p.email} · ID: {p.student_id || "—"}</p>
                          <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: (stepColor[t.current_step] || "#6B7280") + "20", color: stepColor[t.current_step] || "#6B7280", fontWeight: 700 }}>
                              {stepLabel[t.current_step] || t.current_step}
                            </span>
                            {e.percentage !== undefined && e.percentage !== null && (
                              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#FFFBEB", color: "#92400E" }}>
                                Exam: {Math.round(e.percentage)}%
                              </span>
                            )}
                            {r.ai_score !== undefined && r.ai_score !== null && (
                              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#F5F3FF", color: "#6D28D9" }}>
                                Rec: {r.ai_score}%
                              </span>
                            )}
                            {isApproved && t.level_assigned && (
                              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: LVL[t.level_assigned]?.bg, color: LVL[t.level_assigned]?.text, fontWeight: 700 }}>
                                ✓ {LVL[t.level_assigned]?.label || t.level_assigned}
                              </span>
                            )}
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp size={16} color="#9CA3AF" /> : <ChevronDown size={16} color="#9CA3AF" />}
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div style={{ borderTop: "1px solid #F3F4F6", padding: "14px 16px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                            {[
                              ["📞 Phone",    p.phone || "—"],
                              ["🌍 Country",  p.country || "—"],
                              ["📅 Registered", p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"],
                              ["📖 Exam Score", e.percentage !== null && e.percentage !== undefined ? `${Math.round(e.percentage)}%` : "—"],
                              ["🎙️ Rec Score", r.ai_score !== null && r.ai_score !== undefined ? `${r.ai_score}%` : "—"],
                              ["📅 Session",   r.virtual_session_date ? `${r.virtual_session_date}${r.virtual_session_time ? " · " + r.virtual_session_time : ""}` : "Not booked"],
                            ].map(([l, v]) => (
                              <div key={l} style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px" }}>
                                <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", margin: "0 0 3px" }}>{l}</p>
                                <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0 }}>{v}</p>
                              </div>
                            ))}
                          </div>

                          {/* Level assignment */}
                          {!isApproved && (
                            <div style={{ background: "#F0FDF4", borderRadius: 12, padding: "14px 16px", marginBottom: 12, border: "1px solid #86EFAC" }}>
                              <p style={{ fontSize: 12, fontWeight: 700, color: G, margin: "0 0 10px" }}>Assign Level & Approve</p>
                              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                                {LEVELS.map(lvl => {
                                  const cfg = LVL[lvl];
                                  const sel = (selLevels[uid] || "beginner") === lvl;
                                  return (
                                    <button key={lvl} onClick={() => setSelLevels(s => ({ ...s, [uid]: lvl }))} style={{ flex: 1, padding: "8px 6px", borderRadius: 10, border: `2px solid ${sel ? cfg.border : "#E5E7EB"}`, background: sel ? cfg.bg : "#fff", color: cfg.text, fontWeight: sel ? 800 : 600, fontSize: 11, cursor: "pointer", transition: "all .15s" }}>
                                      {cfg.label}
                                    </button>
                                  );
                                })}
                              </div>
                              <button onClick={() => assignLevel(uid)} disabled={assigning === uid} style={{ width: "100%", padding: "11px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${G},${GM})`, color: "#fff", fontWeight: 800, cursor: assigning === uid ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                {assigning === uid ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} />Assigning…</> : <><CheckCircle size={14} />Approve & Assign Level</>}
                              </button>
                            </div>
                          )}

                          {/* Delete account */}
                          <button onClick={() => deleteAccount(uid, p.full_name || "this student")} disabled={deleting === uid} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1.5px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontWeight: 700, fontSize: 12, cursor: deleting === uid ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                            {deleting === uid ? <><Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} />Deleting…</> : <><Trash2 size={13} />Delete Account (re-registration allowed)</>}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
