// src/pages/teacher/TeacherStudentsHub.tsx
// Hub page: All Students | Private Students (with Sessions) | Attendance | Announcements

import { useEffect, useState, useMemo, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Users, UserCheck, Calendar, Megaphone, Search, Plus, X,
  Check, Trash2, Bell, ChevronDown, ChevronUp, Clock,
  BookOpen, BarChart2, MessageSquare, StickyNote,
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#0a5c3e";
const GOLD = "#C9A84C";
const BG   = "#F0F2F5";

// ── Shared style helpers ──────────────────────────────────────────
const card: React.CSSProperties = {
  background: "#fff", borderRadius: 16, border: "1px solid rgba(15,45,31,.07)",
  boxShadow: "0 1px 6px rgba(0,0,0,.04)", padding: 16,
};
const btn = (active = false, danger = false): React.CSSProperties => ({
  padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer",
  fontWeight: 600, fontSize: 13,
  background: danger ? "#FEF2F2" : active ? G : "#F0F4F2",
  color:      danger ? "#DC2626" : active ? "#fff" : G,
});
const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 10,
  border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none",
  background: "#FAFBFC", boxSizing: "border-box",
};
const badge = (color: string): React.CSSProperties => ({
  display: "inline-block", padding: "2px 9px", borderRadius: 20,
  fontSize: 11, fontWeight: 700,
  background: `${color}18`, color,
});

type HubTab = "students" | "private" | "attendance" | "announcements";

const TABS: { id: HubTab; icon: any; en: string; ar: string }[] = [
  { id: "students",      icon: Users,      en: "All Students",   ar: "كل الطلاب" },
  { id: "private",       icon: UserCheck,  en: "Private",        ar: "الخاصون" },
  { id: "attendance",    icon: Calendar,   en: "Attendance",     ar: "الحضور" },
  { id: "announcements", icon: Megaphone,  en: "Announcements",  ar: "الإعلانات" },
];

// ═══════════════════════════════════════════════════════════════
//  ALL STUDENTS TAB
// ═══════════════════════════════════════════════════════════════
function AllStudents({ user, t, language }: any) {
  const [students,  setStudents]  = useState<any[]>([]);
  const [subjects,  setSubjects]  = useState<any[]>([]);
  const [search,    setSearch]    = useState("");
  const [subFilter, setSubFilter] = useState("all");
  const [lvlFilter, setLvlFilter] = useState("all");
  const [expanded,  setExpanded]  = useState<string | null>(null);
  const [attempts,  setAttempts]  = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data: subs } = await supabase.from("subjects").select("id, title, title_ar").eq("teacher_id", user.id);
      setSubjects(subs || []);
      const subjectIds = (subs || []).map((s: any) => s.id);
      if (!subjectIds.length) { setLoading(false); return; }
      const { data: courses } = await supabase.from("courses").select("id, subject_id").in("subject_id", subjectIds);
      const courseIds = (courses || []).map((c: any) => c.id);
      if (!courseIds.length) { setLoading(false); return; }
      const { data: enrollments } = await supabase.from("enrollments").select("user_id, course_id").in("course_id", courseIds);
      const userIds = [...new Set((enrollments || []).map((e: any) => e.user_id))];
      const { data: pvt } = await supabase.from("profiles").select("user_id").eq("assigned_teacher_id", user.id).eq("student_type", "private");
      const pvtIds = (pvt || []).map((p: any) => p.user_id);
      const allIds = [...new Set([...userIds, ...pvtIds])];
      if (!allIds.length) { setLoading(false); return; }
      const { data: profs } = await supabase.from("profiles").select("*").in("user_id", allIds);
      // Attach enrolled subject titles to each student
      const enriched = (profs || []).map((p: any) => {
        const enrolled = enrollments?.filter((e: any) => e.user_id === p.user_id) || [];
        const subjectTitles = enrolled.map((e: any) => {
          const course = courses?.find((c: any) => c.id === e.course_id);
          const sub = subs?.find((s: any) => s.id === course?.subject_id);
          return sub?.title || "";
        }).filter(Boolean);
        return { ...p, subjectTitles, isPvt: pvtIds.includes(p.user_id) };
      });
      setStudents(enriched);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const expandStudent = async (uid: string) => {
    if (expanded === uid) { setExpanded(null); return; }
    setExpanded(uid);
    const { data } = await supabase.from("exam_attempts")
      .select("*, exams(title, type, total_points)")
      .eq("user_id", uid).in("status", ["graded", "submitted"])
      .order("submitted_at", { ascending: false }).limit(6);
    setAttempts(data || []);
  };

  const filtered = useMemo(() => students.filter(s => {
    if (search && !(s.full_name || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (lvlFilter !== "all" && (s.level || "beginner") !== lvlFilter) return false;
    if (subFilter !== "all" && !s.subjectTitles?.some((t2: string) => t2 === subFilter)) return false;
    return true;
  }), [students, search, lvlFilter, subFilter]);

  if (loading) return <Loader />;

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <div style={{ position: "relative", flex: "1 1 180px", minWidth: 0 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input style={{ ...inp, paddingLeft: 32 }} placeholder={t("Search students…", "ابحث عن طالب…")} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select style={{ ...inp, width: "auto", flex: "0 0 auto" }} value={lvlFilter} onChange={e => setLvlFilter(e.target.value)}>
          <option value="all">{t("All Levels", "كل المستويات")}</option>
          <option value="beginner">{t("Beginner", "مبتدئ")}</option>
          <option value="intermediate">{t("Intermediate", "متوسط")}</option>
          <option value="advanced">{t("Advanced", "متقدم")}</option>
        </select>
        <select style={{ ...inp, width: "auto", flex: "0 0 auto" }} value={subFilter} onChange={e => setSubFilter(e.target.value)}>
          <option value="all">{t("All Subjects", "كل المواد")}</option>
          {subjects.map((s: any) => <option key={s.id} value={s.title}>{s.title}</option>)}
        </select>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { label: t("Total", "المجموع"), val: students.length, color: G },
          { label: t("Regular", "عاديون"), val: students.filter(s => !s.isPvt).length, color: "#2563EB" },
          { label: t("Private", "خاصون"), val: students.filter(s => s.isPvt).length, color: "#7C3AED" },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: "10px 16px", display: "flex", gap: 10, alignItems: "center", flex: "1 1 100px" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 11, color: "#7a9e88" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Student cards */}
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 20px", color: "#94a3b8" }}>
          <Users size={40} style={{ opacity: .3, marginBottom: 12 }} />
          <p style={{ fontSize: 14 }}>{t("No students found", "لم يتم العثور على طلاب")}</p>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map(s => {
          const isOpen = expanded === s.user_id;
          const lvlColors: Record<string, string> = { beginner: "#16A34A", intermediate: "#2563EB", advanced: "#7C3AED" };
          const lvl = s.level || "beginner";
          return (
            <div key={s.user_id} style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => expandStudent(s.user_id)}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: s.isPvt ? "#7C3AED18" : `${G}18`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, color: s.isPvt ? "#7C3AED" : G, flexShrink: 0 }}>
                  {(s.full_name || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#1a2e25" }}>{s.full_name || "---"}</span>
                    {s.isPvt && <span style={badge("#7C3AED")}>{t("Private", "خاص")}</span>}
                    <span style={badge(lvlColors[lvl] || G)}>{t(lvl, lvl)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#7a9e88", marginTop: 2 }}>
                    {s.subjectTitles?.slice(0, 3).join(" · ") || t("No enrolled subjects", "لا مواد")}
                  </div>
                </div>
                {isOpen ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
              </div>

              {isOpen && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f0" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                    {s.phone && <span style={{ fontSize: 12, color: "#6b7280" }}>📱 {s.phone}</span>}
                    {s.whatsapp && <span style={{ fontSize: 12, color: "#6b7280" }}>💬 {s.whatsapp}</span>}
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: G, marginBottom: 6 }}>{t("Recent Results", "النتائج الأخيرة")}</p>
                  {attempts.filter(a => a.user_id === s.user_id).length === 0 && (
                    <p style={{ fontSize: 12, color: "#94a3b8" }}>{t("No submissions yet", "لا توجد محاولات")}</p>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {attempts.filter(a => a.user_id === s.user_id).map(a => (
                      <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderRadius: 8, background: "#F8FAF9" }}>
                        <span style={{ fontSize: 12, color: "#374151" }}>{a.exams?.title || "---"}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: a.passed ? "#16A34A" : "#DC2626" }}>
                          {a.status === "submitted" ? t("Pending", "قيد المراجعة") : `${Math.round(a.percentage || 0)}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  PRIVATE STUDENTS TAB (with sessions integrated)
// ═══════════════════════════════════════════════════════════════
function PrivateStudents({ user, t }: any) {
  const { toast } = useToast();
  const [students,  setStudents]  = useState<any[]>([]);
  const [subjects,  setSubjects]  = useState<any[]>([]);
  const [sessions,  setSessions]  = useState<any[]>([]);
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState<string | null>(null); // student id
  const [form,      setForm]      = useState({ subject_id: "", session_date: "", start_time: "", end_time: "", notes: "" });
  const [saving,    setSaving]    = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const { data: pvt } = await supabase.from("profiles").select("*").eq("assigned_teacher_id", user.id).eq("student_type", "private");
    setStudents(pvt || []);
    const { data: subs } = await supabase.from("subjects").select("id, title").eq("teacher_id", user.id);
    setSubjects(subs || []);
    const { data: sess } = await supabase.from("private_sessions")
      .select("*, profiles!private_sessions_student_id_fkey(full_name), subjects(title)")
      .eq("teacher_id", user.id).order("session_date", { ascending: false });
    setSessions(sess || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const schedule = async (studentId: string) => {
    if (!form.session_date || !form.start_time || !form.end_time || !user) return;
    setSaving(true);
    const { error } = await supabase.from("private_sessions").insert({
      student_id: studentId, teacher_id: user.id,
      subject_id: form.subject_id || null,
      session_date: form.session_date, start_time: form.start_time,
      end_time: form.end_time, notes: form.notes || null,
    });
    if (!error) {
      toast({ title: t("Session scheduled!", "تم جدولة الجلسة!") });
      setShowForm(null);
      setForm({ subject_id: "", session_date: "", start_time: "", end_time: "", notes: "" });
      fetchData();
    } else {
      toast({ title: t("Error creating session", "خطأ في إنشاء الجلسة"), variant: "destructive" });
    }
    setSaving(false);
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("private_sessions").update({ status }).eq("id", id);
    fetchData();
  };

  const statusColor: Record<string, string> = { scheduled: GOLD, completed: "#16A34A", cancelled: "#DC2626" };
  const filtered = students.filter(s => !search || (s.full_name || "").toLowerCase().includes(search.toLowerCase()));

  if (loading) return <Loader />;

  return (
    <div>
      <div style={{ position: "relative", maxWidth: 360, marginBottom: 16 }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
        <input style={{ ...inp, paddingLeft: 32 }} placeholder={t("Search private students…", "ابحث…")} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 20px", color: "#94a3b8" }}>
          <UserCheck size={40} style={{ opacity: .3, marginBottom: 12 }} />
          <p style={{ fontSize: 14 }}>{t("No private students assigned", "لا يوجد طلاب خاصون")}</p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map(s => {
          const isOpen = expanded === s.user_id;
          const studentSessions = sessions.filter(sess => sess.student_id === s.user_id);
          const isScheduling = showForm === s.user_id;

          return (
            <div key={s.user_id} style={{ ...card, padding: 0, overflow: "hidden" }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer", background: isOpen ? "#F8FAF9" : "#fff" }}
                onClick={() => { setExpanded(isOpen ? null : s.user_id); setShowForm(null); }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#7C3AED18", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 17, color: "#7C3AED", flexShrink: 0 }}>
                  {(s.full_name || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1a2e25" }}>{s.full_name || "---"}</div>
                  <div style={{ fontSize: 12, color: "#7a9e88", marginTop: 2 }}>
                    {studentSessions.length} {t("sessions", "جلسات")}
                    {s.private_session_rate && ` · ${s.private_session_rate}`}
                    {s.phone && ` · 📱 ${s.phone}`}
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); setShowForm(isScheduling ? null : s.user_id); setExpanded(s.user_id); }}
                  style={{ ...btn(false), padding: "6px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
                  <Plus size={12} />{t("Schedule", "جدولة")}
                </button>
                {isOpen ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
              </div>

              {/* Schedule form */}
              {isOpen && isScheduling && (
                <div style={{ padding: "12px 16px 16px", background: "#FAFBFC", borderTop: "1px solid #f1f5f0" }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: G, marginBottom: 10 }}>{t("New Session", "جلسة جديدة")}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div>
                      <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{t("Date", "التاريخ")} *</p>
                      <input type="date" style={inp} value={form.session_date} onChange={e => setForm(f => ({ ...f, session_date: e.target.value }))} />
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{t("Subject", "المادة")}</p>
                      <select style={inp} value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))}>
                        <option value="">{t("None", "لا شيء")}</option>
                        {subjects.map((sub: any) => <option key={sub.id} value={sub.id}>{sub.title}</option>)}
                      </select>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{t("Start", "بداية")} *</p>
                      <input type="time" style={inp} value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{t("End", "نهاية")} *</p>
                      <input type="time" style={inp} value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{t("Notes", "ملاحظات")}</p>
                    <textarea style={{ ...inp, minHeight: 60, resize: "vertical" } as React.CSSProperties} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={{ ...btn(true), flex: 1, opacity: saving ? .6 : 1 }} disabled={saving} onClick={() => schedule(s.user_id)}>
                      {saving ? t("Saving…", "جاري الحفظ…") : t("Schedule Session", "جدولة الجلسة")}
                    </button>
                    <button style={btn(false)} onClick={() => setShowForm(null)}>
                      {t("Cancel", "إلغاء")}
                    </button>
                  </div>
                </div>
              )}

              {/* Sessions list */}
              {isOpen && studentSessions.length > 0 && (
                <div style={{ borderTop: "1px solid #f1f5f0" }}>
                  {studentSessions.map(sess => (
                    <div key={sess.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid #f8f9fa" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{sess.session_date} · {sess.start_time} – {sess.end_time}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>{sess.subjects?.title || t("No subject", "بلا مادة")}{sess.notes ? ` · ${sess.notes}` : ""}</div>
                      </div>
                      <span style={badge(statusColor[sess.status] || GOLD)}>{sess.status}</span>
                      {sess.status === "scheduled" && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F0FDF4", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => updateStatus(sess.id, "completed")}>
                            <Check size={13} color="#16A34A" />
                          </button>
                          <button style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#FEF2F2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => updateStatus(sess.id, "cancelled")}>
                            <X size={13} color="#DC2626" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {isOpen && studentSessions.length === 0 && (
                <div style={{ padding: "12px 16px", borderTop: "1px solid #f1f5f0", color: "#9ca3af", fontSize: 13, textAlign: "center" }}>
                  {t("No sessions yet. Click Schedule to create one.", "لا توجد جلسات. انقر جدولة لإنشاء جلسة.")}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  ATTENDANCE TAB
// ═══════════════════════════════════════════════════════════════
function Attendance({ user, t }: any) {
  const { toast } = useToast();
  const [sessions,  setSessions]  = useState<any[]>([]);
  const [selected,  setSelected]  = useState<any>(null);
  const [students,  setStudents]  = useState<any[]>([]);
  const [attend,    setAttend]    = useState<Record<string, string>>({});
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data: subs } = await supabase.from("subjects").select("id, title").eq("teacher_id", user.id);
      const subjectIds = (subs || []).map((s: any) => s.id);
      if (subjectIds.length > 0) {
        const { data } = await supabase.from("live_sessions")
          .select("*, subjects(title)").in("subject_id", subjectIds)
          .order("created_at", { ascending: false }).limit(50);
        setSessions(data || []);
      }
      setLoading(false);
    };
    fetch();
  }, [user]);

  const loadSession = async (sess: any) => {
    setSelected(sess); setStudents([]); setAttend({});
    const { data: courses } = await supabase.from("courses").select("id").eq("subject_id", sess.subject_id);
    const courseIds = (courses || []).map((c: any) => c.id);
    let enrolled: any[] = [];
    if (courseIds.length) {
      const { data: enr } = await supabase.from("enrollments").select("user_id").in("course_id", courseIds);
      const uids = [...new Set((enr || []).map((e: any) => e.user_id))];
      if (uids.length) {
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", uids);
        enrolled = profs || [];
      }
    }
    setStudents(enrolled);
    const { data: existing } = await supabase.from("manual_attendance").select("student_id, status").eq("session_id", sess.id);
    const map: Record<string, string> = {};
    (existing || []).forEach((a: any) => { map[a.student_id] = a.status; });
    enrolled.forEach(s => { if (!map[s.user_id]) map[s.user_id] = "absent"; });
    setAttend(map);
  };

  const save = async () => {
    if (!selected || !user) return;
    setSaving(true);
    await supabase.from("manual_attendance").delete().eq("session_id", selected.id);
    const records = Object.entries(attend).map(([sid, status]) => ({
      session_id: selected.id, student_id: sid,
      subject_id: selected.subject_id, teacher_id: user.id, status,
      date: selected.created_at?.split("T")[0] || new Date().toISOString().split("T")[0],
    }));
    const { error } = await supabase.from("manual_attendance").insert(records);
    if (!error) toast({ title: t("Attendance saved!", "تم حفظ الحضور!") });
    else toast({ title: t("Error saving", "خطأ في الحفظ"), variant: "destructive" });
    setSaving(false);
  };

  if (loading) return <Loader />;

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>{t("Select a session to mark attendance:", "اختر جلسة لتسجيل الحضور:")}</p>
        <select style={inp} value={selected?.id || ""} onChange={e => { const s = sessions.find(x => x.id === e.target.value); if (s) loadSession(s); }}>
          <option value="">{t("— Pick a session —", "— اختر جلسة —")}</option>
          {sessions.map(s => (
            <option key={s.id} value={s.id}>{s.subjects?.title || "?"} · {s.created_at?.split("T")[0]} · {s.status}</option>
          ))}
        </select>
      </div>

      {selected && students.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>{t("No enrolled students for this session's subject.", "لا طلاب مسجلين في هذه المادة.")}</div>
      )}

      {selected && students.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <span style={badge("#16A34A")}>{Object.values(attend).filter(v => v === "present").length} {t("Present", "حاضر")}</span>
              <span style={badge("#DC2626")}>{Object.values(attend).filter(v => v === "absent").length} {t("Absent", "غائب")}</span>
              <span style={badge(GOLD)}>{Object.values(attend).filter(v => v === "late").length} {t("Late", "متأخر")}</span>
            </div>
            <button style={btn(true)} onClick={save} disabled={saving}>
              {saving ? t("Saving…", "جاري…") : t("Save Attendance", "حفظ الحضور")}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {students.map(s => (
              <div key={s.user_id} style={{ ...card, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${G}18`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: G, flexShrink: 0 }}>
                  {(s.full_name || "?")[0].toUpperCase()}
                </div>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#374151" }}>{s.full_name}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["present", "late", "absent"] as const).map(st => {
                    const colors: Record<string, string> = { present: "#16A34A", late: GOLD, absent: "#DC2626" };
                    const labels: Record<string, string> = { present: t("P", "ح"), late: t("L", "م"), absent: t("A", "غ") };
                    const active = attend[s.user_id] === st;
                    return (
                      <button key={st} onClick={() => setAttend(a => ({ ...a, [s.user_id]: st }))}
                        style={{ width: 32, height: 32, borderRadius: 8, border: `2px solid ${active ? colors[st] : "#e5e7eb"}`, background: active ? `${colors[st]}18` : "#fff", cursor: "pointer", fontWeight: 700, fontSize: 12, color: active ? colors[st] : "#9ca3af" }}>
                        {labels[st]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  ANNOUNCEMENTS TAB
// ═══════════════════════════════════════════════════════════════
function Announcements({ user, t }: any) {
  const { toast } = useToast();
  const [items,     setItems]    = useState<any[]>([]);
  const [subjects,  setSubjects] = useState<any[]>([]);
  const [showForm,  setShowForm] = useState(false);
  const [form,      setForm]     = useState({ title: "", message: "", target_type: "all", target_id: "", priority: "normal" });
  const [saving,    setSaving]   = useState(false);
  const [loading,   setLoading]  = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const { data: subs } = await supabase.from("subjects").select("id, title").eq("teacher_id", user.id);
    setSubjects(subs || []);
    const { data } = await supabase.from("teacher_announcements").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false });
    setItems(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const create = async () => {
    if (!form.title || !form.message || !user) return;
    setSaving(true);
    const { error } = await supabase.from("teacher_announcements").insert({
      teacher_id: user.id, title: form.title, message: form.message,
      target_type: form.target_type,
      target_id: form.target_type !== "all" && form.target_id ? form.target_id : null,
      priority: form.priority,
    });
    if (!error) {
      toast({ title: t("Announcement sent!", "تم إرسال الإعلان!") });
      setShowForm(false);
      setForm({ title: "", message: "", target_type: "all", target_id: "", priority: "normal" });
      fetchData();
    }
    setSaving(false);
  };

  const priorityColor: Record<string, string> = { urgent: "#DC2626", important: GOLD, normal: "#16A34A" };

  if (loading) return <Loader />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button style={{ ...btn(true), display: "flex", alignItems: "center", gap: 6 }} onClick={() => setShowForm(v => !v)}>
          {showForm ? <><X size={14} />{t("Cancel", "إلغاء")}</> : <><Plus size={14} />{t("New Announcement", "إعلان جديد")}</>}
        </button>
      </div>

      {showForm && (
        <div style={{ ...card, marginBottom: 16, background: "#F8FAF9" }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: G, marginBottom: 12 }}>{t("New Announcement", "إعلان جديد")}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{t("Title", "العنوان")} *</p>
              <input style={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={t("Title…", "العنوان…")} />
            </div>
            <div>
              <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{t("Message", "الرسالة")} *</p>
              <textarea style={{ ...inp, minHeight: 80, resize: "vertical" } as React.CSSProperties} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder={t("Message…", "الرسالة…")} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div>
                <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{t("Target", "الهدف")}</p>
                <select style={inp} value={form.target_type} onChange={e => setForm(f => ({ ...f, target_type: e.target.value }))}>
                  <option value="all">{t("All Students", "كل الطلاب")}</option>
                  <option value="subject">{t("Subject", "مادة")}</option>
                </select>
              </div>
              {form.target_type === "subject" && (
                <div>
                  <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{t("Subject", "المادة")}</p>
                  <select style={inp} value={form.target_id} onChange={e => setForm(f => ({ ...f, target_id: e.target.value }))}>
                    <option value="">{t("Pick…", "اختر…")}</option>
                    {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </div>
              )}
              <div>
                <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{t("Priority", "الأولوية")}</p>
                <select style={inp} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  <option value="normal">{t("Normal", "عادي")}</option>
                  <option value="important">{t("Important", "مهم")}</option>
                  <option value="urgent">{t("Urgent", "عاجل")}</option>
                </select>
              </div>
            </div>
            <button style={{ ...btn(true), opacity: saving ? .6 : 1 }} disabled={saving} onClick={create}>
              {saving ? t("Sending…", "جاري الإرسال…") : t("Send Announcement", "إرسال الإعلان")}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 20px", color: "#94a3b8" }}>
          <Megaphone size={40} style={{ opacity: .3, marginBottom: 12 }} />
          <p style={{ fontSize: 14 }}>{t("No announcements yet", "لا توجد إعلانات")}</p>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map(a => (
          <div key={a.id} style={{ ...card, borderLeft: `4px solid ${priorityColor[a.priority] || "#E5E7EB"}` }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#1a2e25" }}>{a.title}</span>
                  <span style={badge(priorityColor[a.priority] || "#6b7280")}>{a.priority}</span>
                </div>
                <p style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.5, margin: 0 }}>{a.message}</p>
                <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{new Date(a.created_at).toLocaleDateString()}</p>
              </div>
              <button style={{ width: 32, height: 32, border: "none", background: "#FEF2F2", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                onClick={async () => { await supabase.from("teacher_announcements").delete().eq("id", a.id); setItems(items.filter(x => x.id !== a.id)); }}>
                <Trash2 size={13} color="#DC2626" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Loader ────────────────────────────────────────────────────
function Loader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${G}`, borderTopColor: "transparent", animation: "spin .7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN HUB
// ═══════════════════════════════════════════════════════════════
export default function TeacherStudentsHub() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [tab, setTab] = useState<HubTab>("students");

  return (
    <div style={{ background: BG, minHeight: "100vh", padding: "0 0 40px" }}>
      {/* Page Header */}
      <div style={{ background: `linear-gradient(135deg, ${G} 0%, #0a5c3e 100%)`, padding: "20px 20px 0", marginBottom: 0 }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: `${GOLD}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Users size={20} color={GOLD} />
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 900, color: "#fff", margin: 0, fontFamily: "serif" }}>{t("Students", "الطلاب")}</h1>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,.55)", margin: 0 }}>{t("Manage all students, private sessions, attendance & announcements", "إدارة الطلاب والجلسات الخاصة والحضور والإعلانات")}</p>
            </div>
          </div>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, overflowX: "auto" }}>
            {TABS.map(tab2 => {
              const active = tab === tab2.id;
              return (
                <button key={tab2.id} onClick={() => setTab(tab2.id)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", border: "none", cursor: "pointer", borderRadius: "10px 10px 0 0", fontWeight: active ? 700 : 500, fontSize: 13, background: active ? "#fff" : "transparent", color: active ? G : "rgba(255,255,255,.7)", flexShrink: 0, transition: "all .15s" }}>
                  <tab2.icon size={14} />
                  {language === "ar" ? tab2.ar : tab2.en}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 0" }}>
        {tab === "students"      && <AllStudents    user={user} t={t} language={language} />}
        {tab === "private"       && <PrivateStudents user={user} t={t} />}
        {tab === "attendance"    && <Attendance     user={user} t={t} />}
        {tab === "announcements" && <Announcements  user={user} t={t} />}
      </div>
    </div>
  );
}
