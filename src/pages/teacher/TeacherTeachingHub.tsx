// src/pages/teacher/TeacherTeachingHub.tsx
// Teaching Hub: Live Classes | My Subjects | Timetable | Recordings | Recitation | Hifdh | Public Classes

import { useEffect, useState, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useLiveClass } from "@/contexts/LiveClassContext";
import { useToast } from "@/hooks/use-toast";
import {
  Video, BookOpen, Clock, Mic, Star, Globe2, Radio,
  Plus, X, Play, Users, Calendar, ChevronRight, Eye,
  FolderOpen, ClipboardList, Megaphone, CheckCircle,
  ChevronDown, ChevronUp, Search, Trash2, Edit,
} from "lucide-react";
import SubjectMaterials     from "@/components/classroom/SubjectMaterials";
import SubjectSyllabus      from "@/components/classroom/SubjectSyllabus";
import SubjectAssignments   from "@/components/classroom/SubjectAssignments";
import SubjectAnnouncements from "@/components/classroom/SubjectAnnouncements";
import SubjectRecordings    from "@/components/classroom/SubjectRecordings";
import TeacherRecitation    from "./TeacherRecitation";
import TeacherHifdhReview   from "./TeacherHifdhReview";
import TeacherPublicClasses from "./TeacherPublicClasses";
import TeacherTimetable     from "./TeacherTimetable";

const G    = "#064E3B";
const GM   = "#0a5c3e";
const GOLD = "#C9A84C";
const BG   = "#F0F2F5";

const card: React.CSSProperties = {
  background: "#fff", borderRadius: 16, border: "1px solid rgba(15,45,31,.07)",
  boxShadow: "0 1px 6px rgba(0,0,0,.04)",
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
  fontSize: 11, fontWeight: 700, background: `${color}18`, color,
});

type HubTab = "classes" | "subjects" | "timetable" | "recordings" | "recitation" | "hifdh" | "public";

const TABS: { id: HubTab; icon: any; en: string; ar: string }[] = [
  { id: "classes",    icon: Video,   en: "Live Classes",      ar: "الفصول المباشرة" },
  { id: "subjects",   icon: BookOpen,en: "My Subjects",       ar: "موادي" },
  { id: "timetable",  icon: Clock,   en: "Timetable",         ar: "الجدول" },
  { id: "recordings", icon: Mic,     en: "Recordings",        ar: "التسجيلات" },
  { id: "recitation", icon: Star,    en: "Recitation",        ar: "التلاوة" },
  { id: "hifdh",      icon: BookOpen,en: "Hifdh",             ar: "الحفظ" },
  { id: "public",     icon: Radio,   en: "Public Classes",    ar: "الدروس العامة" },
];

function Loader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${G}`, borderTopColor: "transparent", animation: "spin .7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  LIVE CLASSES TAB
// ═══════════════════════════════════════════════════════════════
function LiveClassesTab({ user, t }: any) {
  const { joinClass } = useLiveClass();
  const { toast } = useToast();
  const [sessions,  setSessions]  = useState<any[]>([]);
  const [subjects,  setSubjects]  = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState({ subject_id: "", topic: "", date: "", time: "", duration: 60, is_recorded: true });
  const [saving,    setSaving]    = useState(false);

  const fetchSessions = useCallback(async () => {
    if (!user) return;
    const { data: subs } = await supabase.from("subjects").select("id, title, title_ar").eq("teacher_id", user.id);
    setSubjects(subs || []);
    const subjectIds = (subs || []).map((s: any) => s.id);
    if (!subjectIds.length) { setLoading(false); return; }
    const { data } = await supabase.from("live_sessions")
      .select("*, subjects(title, title_ar)").in("subject_id", subjectIds)
      .order("scheduled_at", { ascending: false }).limit(40);
    setSessions(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const createSession = async () => {
    if (!form.subject_id || !user) return;
    setSaving(true);
    const scheduledAt = form.date && form.time ? `${form.date}T${form.time}:00` : new Date().toISOString();
    const { error } = await supabase.from("live_sessions").insert({
      subject_id: form.subject_id, host_id: user.id, status: "scheduled",
      scheduled_at: scheduledAt, topic: form.topic || null,
      duration_minutes: form.duration, is_recorded: form.is_recorded,
    });
    if (!error) {
      toast({ title: t("Session created!", "تم إنشاء الجلسة!") });
      setShowForm(false);
      setForm({ subject_id: "", topic: "", date: "", time: "", duration: 60, is_recorded: true });
      fetchSessions();
    } else {
      toast({ title: t("Error creating session", "خطأ"), variant: "destructive" });
    }
    setSaving(false);
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("live_sessions").update({ status, ...(status === "live" ? { actual_start_time: new Date().toISOString() } : {}) }).eq("id", id);
    fetchSessions();
  };

  const statusColor: Record<string, string> = { live: "#DC2626", scheduled: GOLD, ended: "#6b7280", cancelled: "#6b7280" };

  if (loading) return <Loader />;

  const live = sessions.filter(s => s.status === "live");
  const upcoming = sessions.filter(s => s.status === "scheduled");
  const past = sessions.filter(s => !["live", "scheduled"].includes(s.status));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button style={{ ...btn(true), display: "flex", alignItems: "center", gap: 6 }} onClick={() => setShowForm(v => !v)}>
          {showForm ? <><X size={14} />{t("Cancel", "إلغاء")}</> : <><Plus size={14} />{t("Create Session", "إنشاء جلسة")}</>}
        </button>
      </div>

      {showForm && (
        <div style={{ ...card, padding: 16, marginBottom: 16, background: "#F8FAF9" }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: G, marginBottom: 12 }}>{t("New Live Session", "جلسة مباشرة جديدة")}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{t("Subject", "المادة")} *</p>
              <select style={inp} value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))}>
                <option value="">{t("— Select subject —", "— اختر مادة —")}</option>
                {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{t("Date", "التاريخ")}</p>
              <input type="date" style={inp} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{t("Time", "الوقت")}</p>
              <input type="time" style={inp} value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
            </div>
            <div>
              <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{t("Topic", "الموضوع")}</p>
              <input style={inp} value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} placeholder={t("Optional topic…", "موضوع اختياري…")} />
            </div>
            <div>
              <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{t("Duration (min)", "المدة (دقيقة)")}</p>
              <input type="number" style={inp} value={form.duration} min={15} max={300} onChange={e => setForm(f => ({ ...f, duration: +e.target.value }))} />
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, cursor: "pointer", fontSize: 13, color: "#374151" }}>
            <input type="checkbox" checked={form.is_recorded} onChange={e => setForm(f => ({ ...f, is_recorded: e.target.checked }))} />
            {t("Record session", "تسجيل الجلسة")}
          </label>
          <button style={{ ...btn(true), opacity: saving ? .6 : 1 }} disabled={saving} onClick={createSession}>
            {saving ? t("Creating…", "جاري الإنشاء…") : t("Create Session", "إنشاء الجلسة")}
          </button>
        </div>
      )}

      {live.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: "#DC2626", letterSpacing: "0.08em", marginBottom: 6 }}>{t("LIVE NOW", "مباشر الآن")}</p>
          {live.map(s => (
            <div key={s.id} style={{ ...card, padding: "12px 16px", marginBottom: 6, borderLeft: `4px solid #DC2626`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1a2e25" }}>{s.subjects?.title}</div>
                {s.topic && <div style={{ fontSize: 12, color: "#6b7280" }}>{s.topic}</div>}
              </div>
              <button style={{ ...btn(true), background: "#DC2626", display: "flex", alignItems: "center", gap: 5 }}
                onClick={() => joinClass({ id: s.subject_id, title: s.subjects?.title })}>
                <Play size={13} />{t("Join Live", "انضم")}
              </button>
            </div>
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: GOLD, letterSpacing: "0.08em", marginBottom: 6 }}>{t("UPCOMING", "قادمة")}</p>
          {upcoming.map(s => (
            <div key={s.id} style={{ ...card, padding: "12px 16px", marginBottom: 6, borderLeft: `4px solid ${GOLD}`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1a2e25" }}>{s.subjects?.title}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : t("No time set", "لا يوجد وقت")}
                  {s.topic ? ` · ${s.topic}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={{ ...btn(true), padding: "6px 12px", fontSize: 12 }}
                  onClick={() => joinClass({ id: s.subject_id, title: s.subjects?.title })}>
                  {t("Start", "ابدأ")}
                </button>
                <button style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", fontSize: 12 }}
                  onClick={() => updateStatus(s.id, "cancelled")}>
                  {t("Cancel", "إلغاء")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", letterSpacing: "0.08em", marginBottom: 6 }}>{t("PAST SESSIONS", "الجلسات السابقة")}</p>
          {past.slice(0, 10).map(s => (
            <div key={s.id} style={{ ...card, padding: "10px 16px", marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: "#374151" }}>{s.subjects?.title}</span>
                <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>
                  {s.created_at?.split("T")[0]}{s.topic ? ` · ${s.topic}` : ""}
                </span>
              </div>
              <span style={badge(statusColor[s.status] || "#6b7280")}>{s.status}</span>
            </div>
          ))}
        </div>
      )}

      {sessions.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 20px", color: "#94a3b8" }}>
          <Video size={40} style={{ opacity: .3, marginBottom: 12 }} />
          <p style={{ fontSize: 14 }}>{t("No sessions yet. Create your first session.", "لا توجد جلسات. أنشئ جلستك الأولى.")}</p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  SUBJECTS TAB
// ═══════════════════════════════════════════════════════════════
type SubjectTab2 = "students" | "materials" | "syllabus" | "assignments" | "announcements" | "recordings";
const SUB_TABS: { id: SubjectTab2; icon: any; en: string; ar: string }[] = [
  { id: "students",      icon: Users,         en: "Students",      ar: "الطلاب" },
  { id: "materials",     icon: FolderOpen,     en: "Materials",     ar: "المواد" },
  { id: "syllabus",      icon: Calendar,       en: "Syllabus",      ar: "المنهج" },
  { id: "assignments",   icon: ClipboardList,  en: "Assignments",   ar: "الواجبات" },
  { id: "announcements", icon: Megaphone,      en: "Announcements", ar: "الإعلانات" },
  { id: "recordings",    icon: Mic,            en: "Recordings",    ar: "التسجيلات" },
];

function SubjectsTab({ user, t, language }: any) {
  const { joinClass } = useLiveClass();
  const [subjects,    setSubjects]   = useState<any[]>([]);
  const [counts,      setCounts]     = useState<Record<string, any>>({});
  const [selected,    setSelected]   = useState<any>(null);
  const [activeSubTab,setActiveSubTab] = useState<SubjectTab2>("students");
  const [subStudents, setSubStudents] = useState<any[]>([]);
  const [loading,     setLoading]    = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase.from("subjects").select("*").eq("teacher_id", user.id).order("title");
      setSubjects(data || []);
      // Counts per subject
      const cMap: Record<string, any> = {};
      for (const sub of (data || [])) {
        const { count: matCount } = await supabase.from("subject_materials").select("id", { count: "exact", head: true }).eq("subject_id", sub.id);
        const { data: courses } = await supabase.from("courses").select("id").eq("subject_id", sub.id);
        const courseIds = (courses || []).map((c: any) => c.id);
        let stuCount = 0;
        if (courseIds.length) {
          const { count } = await supabase.from("enrollments").select("user_id", { count: "exact", head: true }).in("course_id", courseIds);
          stuCount = count || 0;
        }
        cMap[sub.id] = { materials: matCount || 0, students: stuCount };
      }
      setCounts(cMap);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const openSubject = async (sub: any) => {
    setSelected(sub); setActiveSubTab("students");
    const { data: courses } = await supabase.from("courses").select("id").eq("subject_id", sub.id);
    const courseIds = (courses || []).map((c: any) => c.id);
    if (!courseIds.length) { setSubStudents([]); return; }
    const { data: enr } = await supabase.from("enrollments").select("user_id").in("course_id", courseIds);
    const uids = [...new Set((enr || []).map((e: any) => e.user_id))];
    if (!uids.length) { setSubStudents([]); return; }
    const { data: profs } = await supabase.from("profiles").select("user_id, full_name, level").in("user_id", uids);
    setSubStudents(profs || []);
  };

  const lvlColor: Record<string, string> = { beginner: "#16A34A", intermediate: "#2563EB", advanced: "#7C3AED" };

  if (loading) return <Loader />;

  if (selected) {
    return (
      <div>
        <button style={{ ...btn(false), display: "flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: 12 }}
          onClick={() => setSelected(null)}>
          ← {t("Back to Subjects", "العودة للمواد")}
        </button>

        <div style={{ ...card, padding: "14px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${G}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BookOpen size={20} color={G} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#1a2e25" }}>{selected.title}</div>
            {selected.title_ar && <div style={{ fontSize: 13, color: GOLD, direction: "rtl" }}>{selected.title_ar}</div>}
            <div style={{ fontSize: 12, color: "#7a9e88", marginTop: 2 }}>
              {counts[selected.id]?.students || 0} {t("students", "طلاب")} · {counts[selected.id]?.materials || 0} {t("materials", "مواد")}
            </div>
          </div>
          <button style={{ ...btn(true), display: "flex", alignItems: "center", gap: 5, padding: "8px 14px" }}
            onClick={() => joinClass(selected)}>
            <Play size={13} />{t("Start Class", "ابدأ الفصل")}
          </button>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: "flex", gap: 4, overflowX: "auto", marginBottom: 14, paddingBottom: 4 }}>
          {SUB_TABS.map(st => {
            const active = activeSubTab === st.id;
            return (
              <button key={st.id} onClick={() => setActiveSubTab(st.id)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: active ? 700 : 500, fontSize: 12, background: active ? G : "#fff", color: active ? "#fff" : "#6b7280", border: `1px solid ${active ? G : "#e5e7eb"}`, flexShrink: 0, transition: "all .13s" } as any}>
                <st.icon size={12} />{language === "ar" ? st.ar : st.en}
              </button>
            );
          })}
        </div>

        {activeSubTab === "students" && (
          <div>
            {subStudents.length === 0 && <p style={{ textAlign: "center", color: "#94a3b8", padding: "32px", fontSize: 13 }}>{t("No enrolled students yet.", "لا يوجد طلاب مسجلون.")}</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {subStudents.map(s => (
                <div key={s.user_id} style={{ ...card, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${G}15`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: G }}>
                    {(s.full_name || "?")[0].toUpperCase()}
                  </div>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#374151" }}>{s.full_name}</span>
                  <span style={badge(lvlColor[s.level || "beginner"] || G)}>{s.level || "beginner"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {activeSubTab === "materials"     && <SubjectMaterials     subjectId={selected.id} />}
        {activeSubTab === "syllabus"      && <SubjectSyllabus      subjectId={selected.id} />}
        {activeSubTab === "assignments"   && <SubjectAssignments   subjectId={selected.id} />}
        {activeSubTab === "announcements" && <SubjectAnnouncements subjectId={selected.id} />}
        {activeSubTab === "recordings"    && <SubjectRecordings    subjectId={selected.id} />}
      </div>
    );
  }

  return (
    <div>
      {subjects.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 20px", color: "#94a3b8" }}>
          <BookOpen size={40} style={{ opacity: .3, marginBottom: 12 }} />
          <p style={{ fontSize: 14 }}>{t("No subjects yet.", "لا توجد مواد.")}</p>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {subjects.map(sub => (
          <div key={sub.id} style={{ ...card, padding: "16px", cursor: "pointer", transition: "transform .15s, box-shadow .15s" }}
            onClick={() => openSubject(sub)}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px rgba(0,0,0,.09)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `${G}15`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <BookOpen size={18} color={G} />
            </div>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#1a2e25", marginBottom: 2 }}>{sub.title}</div>
            {sub.title_ar && <div style={{ fontSize: 12, color: GOLD, marginBottom: 6, direction: "rtl" }}>{sub.title_ar}</div>}
            <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#7a9e88" }}>
              <span><Users size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />{counts[sub.id]?.students || 0}</span>
              <span><FolderOpen size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />{counts[sub.id]?.materials || 0}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  RECORDINGS TAB (simplified)
// ═══════════════════════════════════════════════════════════════
function RecordingsTab({ user, t }: any) {
  const [recs,     setRecs]     = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [filter,   setFilter]   = useState("all");
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data: subs } = await supabase.from("subjects").select("id, title").eq("teacher_id", user.id);
      setSubjects(subs || []);
      const subjectIds = (subs || []).map((s: any) => s.id);
      if (subjectIds.length) {
        const { data } = await supabase.from("session_recordings")
          .select("*, subjects(title)").in("subject_id", subjectIds)
          .order("created_at", { ascending: false });
        setRecs(data || []);
      }
      setLoading(false);
    };
    fetch();
  }, [user]);

  const filtered = filter === "all" ? recs : recs.filter(r => r.subject_id === filter);

  if (loading) return <Loader />;

  const fmtSize = (b?: number) => !b ? "" : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;
  const fmtDur  = (s?: number) => !s ? "" : `${Math.floor(s / 60)}m ${s % 60}s`;

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <select style={{ ...inp, maxWidth: 240 }} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">{t("All Subjects", "كل المواد")}</option>
          {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </div>
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 20px", color: "#94a3b8" }}>
          <Mic size={40} style={{ opacity: .3, marginBottom: 12 }} />
          <p style={{ fontSize: 14 }}>{t("No recordings yet.", "لا توجد تسجيلات.")}</p>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map(r => (
          <div key={r.id} style={{ ...card, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#7C3AED18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Mic size={18} color="#7C3AED" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1a2e25" }}>{r.teacher_name || r.subjects?.title || t("Recording", "تسجيل")}</div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>
                {r.subjects?.title}{r.file_size ? ` · ${fmtSize(r.file_size)}` : ""}{r.duration_seconds ? ` · ${fmtDur(r.duration_seconds)}` : ""}
                {r.created_at ? ` · ${r.created_at.split("T")[0]}` : ""}
              </div>
            </div>
            {r.file_url && (
              <a href={r.file_url} target="_blank" rel="noopener noreferrer" style={{ ...btn(true) as any, textDecoration: "none", padding: "6px 12px", fontSize: 12 }}>
                {t("Play", "تشغيل")}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN HUB
// ═══════════════════════════════════════════════════════════════
export default function TeacherTeachingHub() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [tab, setTab] = useState<HubTab>("classes");

  // Tabs that render the existing full-page components
  const isFullPage = ["recitation", "hifdh", "public", "timetable"].includes(tab);

  return (
    <div style={{ background: BG, minHeight: "100vh", paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${G} 0%, #0a5c3e 100%)`, padding: "20px 20px 0" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: `${GOLD}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Video size={20} color={GOLD} />
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 900, color: "#fff", margin: 0, fontFamily: "serif" }}>{t("My Teaching", "تدريسي")}</h1>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,.55)", margin: 0 }}>{t("Live classes, subjects, timetable, recordings, recitation & hifdh", "الفصول المباشرة والمواد والجدول والتسجيلات والتلاوة والحفظ")}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 2, overflowX: "auto" }}>
            {TABS.map(tb => {
              const active = tab === tb.id;
              return (
                <button key={tb.id} onClick={() => setTab(tb.id)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", border: "none", cursor: "pointer", borderRadius: "10px 10px 0 0", fontWeight: active ? 700 : 500, fontSize: 12, background: active ? "#fff" : "transparent", color: active ? G : "rgba(255,255,255,.7)", flexShrink: 0 }}>
                  <tb.icon size={13} />{language === "ar" ? tb.ar : tb.en}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      {isFullPage ? (
        <div>
          {tab === "timetable"  && <TeacherTimetable />}
          {tab === "recitation" && <TeacherRecitation />}
          {tab === "hifdh"      && <TeacherHifdhReview />}
          {tab === "public"     && <TeacherPublicClasses />}
        </div>
      ) : (
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 16px 0" }}>
          {tab === "classes"    && <LiveClassesTab user={user} t={t} />}
          {tab === "subjects"   && <SubjectsTab    user={user} t={t} language={language} />}
          {tab === "recordings" && <RecordingsTab  user={user} t={t} />}
        </div>
      )}
    </div>
  );
}
