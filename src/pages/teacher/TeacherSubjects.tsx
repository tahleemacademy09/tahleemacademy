// src/pages/teacher/TeacherSubjects.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import SubjectRecordings    from "@/components/classroom/SubjectRecordings";
import SubjectMaterials     from "@/components/classroom/SubjectMaterials";
import SubjectSyllabus      from "@/components/classroom/SubjectSyllabus";
import SubjectAssignments   from "@/components/classroom/SubjectAssignments";
import SubjectAnnouncements from "@/components/classroom/SubjectAnnouncements";
import { useLiveClass } from "@/contexts/LiveClassContext";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen, Users, Mic, ClipboardList, FileText, ChevronLeft,
  Calendar, Megaphone, FolderOpen, Video, Search, Star,
  CheckCircle, Clock,
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9A84C";

type SubjectTab = "students" | "materials" | "syllabus" | "assignments" | "announcements" | "recordings" | "exams" | "tests";

const TABS: { id: SubjectTab; label: string; labelAr: string; icon: any }[] = [
  { id: "students",      label: "Students",      labelAr: "الطلاب",      icon: Users },
  { id: "materials",     label: "Materials",     labelAr: "المواد",      icon: FolderOpen },
  { id: "syllabus",      label: "Syllabus",      labelAr: "المنهج",      icon: Calendar },
  { id: "assignments",   label: "Assignments",   labelAr: "الواجبات",    icon: FileText },
  { id: "announcements", label: "Announcements", labelAr: "الإعلانات",   icon: Megaphone },
  { id: "recordings",    label: "Recordings",    labelAr: "التسجيلات",   icon: Video },
  { id: "exams",         label: "Exams",         labelAr: "الامتحانات",  icon: ClipboardList },
  { id: "tests",         label: "Tests",         labelAr: "التمرينات",   icon: CheckCircle },
];

const lvlColor: Record<string, { bg: string; color: string; border: string }> = {
  beginner:     { bg: "#F0FDF4", color: "#166534", border: "#86EFAC" },
  intermediate: { bg: "#EFF6FF", color: "#1E40AF", border: "#93C5FD" },
  advanced:     { bg: "#FDF4FF", color: "#6B21A8", border: "#D8B4FE" },
  all:          { bg: "#F3F4F6", color: "#374151", border: "#D1D5DB" },
};

const safeLevel = (lv: string | undefined | null) =>
  lvlColor[lv as string] ?? lvlColor["all"];

export default function TeacherSubjects() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { joinClass } = useLiveClass();

  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<SubjectTab>("students");
  const [subjectData, setSubjectData] = useState<{
    students: any[]; exams: any[]; tests: any[];
  }>({ students: [], exams: [], tests: [] });
  const [subjectCounts, setSubjectCounts] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    const fetchSubjects = async () => {
      const { data: owned } = await supabase
        .from("subjects").select("*").eq("teacher_id", user.id).order("title");

      const { data: ttSlots } = await supabase
        .from("subject_timetable" as any).select("subject_id").eq("teacher_id", user.id);
      const ttSubjectIds = [...new Set((ttSlots || []).map((s: any) => s.subject_id).filter(Boolean))];

      let extra: any[] = [];
      if (ttSubjectIds.length > 0) {
        const ownedIds = (owned || []).map((s: any) => s.id);
        const missingIds = ttSubjectIds.filter((id: string) => !ownedIds.includes(id));
        if (missingIds.length > 0) {
          const { data: extraSubs } = await supabase
            .from("subjects").select("*").in("id", missingIds).order("title");
          extra = extraSubs || [];
        }
      }

      const subs = [...(owned || []), ...extra];
      const counts: Record<string, any> = {};
      for (const sub of subs) {
        const { data: courses } = await supabase.from("courses").select("id").eq("subject_id", sub.id);
        const courseIds = (courses || []).map((c: any) => c.id);
        const { count: sc } = courseIds.length > 0
          ? await supabase.from("enrollments").select("id", { count: "exact", head: true }).in("course_id", courseIds)
          : { count: 0 };
        const { count: rc } = await supabase.from("session_recordings").select("id", { count: "exact", head: true }).eq("subject_id", sub.id);
        const { count: mc } = await supabase.from("subject_materials").select("id", { count: "exact", head: true }).eq("subject_id", sub.id);
        const { data: examsData } = courseIds.length > 0
          ? await supabase.from("exams").select("id, type").in("course_id", courseIds)
          : { data: [] };
        counts[sub.id] = {
          studentCount: sc || 0,
          recordingCount: rc || 0,
          materialCount: mc || 0,
          examCount: (examsData || []).filter((e: any) => (e.type || "exam") === "exam").length,
          testCount: (examsData || []).filter((e: any) => e.type === "test").length,
        };
      }
      setSubjectCounts(counts);
      setSubjects(subs);
      setLoading(false);
    };
    fetchSubjects();
  }, [user]);

  const loadSubjectDetails = async (sub: any) => {
    setSelectedSubject(sub);
    setActiveTab("students");
    setDetailLoading(true);

    const { data: courses } = await supabase.from("courses").select("id").eq("subject_id", sub.id);
    const courseIds = (courses || []).map((c: any) => c.id);

    let students: any[] = [];
    if (courseIds.length > 0) {
      const { data: enrollments } = await supabase.from("enrollments").select("user_id").in("course_id", courseIds);
      const userIds = [...new Set((enrollments || []).map(e => e.user_id))];
      if (userIds.length > 0) {
        const { data } = await supabase.from("profiles").select("*").in("user_id", userIds).order("full_name");
        students = data || [];
      }
    }

    let exams: any[] = [], tests: any[] = [];
    if (courseIds.length > 0) {
      const { data } = await supabase.from("exams").select("*").in("course_id", courseIds).order("created_at", { ascending: false });
      exams = (data || []).filter((e: any) => (e.type || "exam") === "exam");
      tests = (data || []).filter((e: any) => e.type === "test");
    }

    setSubjectData({ students, exams, tests });
    setDetailLoading(false);
  };

  const filteredSubjects = subjects.filter(s =>
    !search ||
    s.title?.toLowerCase().includes(search.toLowerCase()) ||
    s.title_ar?.includes(search)
  );

  // ── Loading ───────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: `4px solid ${GOLD}`, borderTopColor: "transparent", animation: "spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Subject detail ────────────────────────────────────────────
  if (selectedSubject) {
    const lc = safeLevel(selectedSubject.level);
    return (
      <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "system-ui, sans-serif" }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

        {/* Header */}
        <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setSelectedSubject(null)} style={{
              width: 36, height: 36, borderRadius: 10, border: "1.5px solid #E5E7EB",
              background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <ChevronLeft size={16} color="#6B7280" />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: 16, fontWeight: 800, color: G, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {language === "ar" ? (selectedSubject.title_ar || selectedSubject.title) : selectedSubject.title}
              </h1>
              {selectedSubject.title_ar && language !== "ar" && (
                <p style={{ fontSize: 12, color: GOLD, margin: "2px 0 0", fontFamily: "'Amiri', serif", direction: "rtl" }}>
                  {selectedSubject.title_ar}
                </p>
              )}
            </div>
            {/* Start/Join Live Class — global, persists across navigation */}
            <button
              onClick={() => joinClass(selectedSubject)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 10, border: "none",
                background: `linear-gradient(135deg, ${G}, ${GM})`,
                color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >
              <Video size={13} />
              {t("Start Class", "ابدأ الحصة")}
            </button>
            <span style={{
              padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: lc.bg, color: lc.color, border: `1px solid ${lc.border}`,
            }}>
              {selectedSubject.level || "All Levels"}
            </span>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", overflowX: "auto", padding: "0 20px", gap: 0, borderTop: "1px solid #F3F4F6" }}>
            {TABS.map(tab => {
              const active = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "10px 14px", border: "none", background: "none",
                  cursor: "pointer", fontSize: 12, fontWeight: active ? 800 : 500,
                  color: active ? G : "#6B7280",
                  borderBottom: active ? `3px solid ${GOLD}` : "3px solid transparent",
                  whiteSpace: "nowrap", flexShrink: 0,
                }}>
                  <tab.icon size={13} />
                  {language === "ar" ? tab.labelAr : tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div style={{ padding: 20, maxWidth: 800, margin: "0 auto" }}>
          {detailLoading ? (
            <div style={{ textAlign: "center", padding: 40 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", border: `4px solid ${GOLD}`, borderTopColor: "transparent", animation: "spin .8s linear infinite", margin: "0 auto" }} />
            </div>
          ) : (
            <>
              {/* Students tab */}
              {activeTab === "students" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {subjectData.students.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "48px 24px", borderRadius: 16, border: "2px dashed #E5E7EB", background: "#FAFAFA" }}>
                      <Users size={40} style={{ margin: "0 auto 12px", display: "block", opacity: 0.3, color: G }} />
                      <p style={{ color: "#9CA3AF", fontSize: 14 }}>{t("No students enrolled", "لا يوجد طلاب مسجلين")}</p>
                    </div>
                  ) : subjectData.students.map(s => {
                    const lv = safeLevel(s.level);
                    return (
                      <div key={s.id} style={{
                        background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB",
                        padding: "14px 16px", display: "flex", alignItems: "center", gap: 14,
                      }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: "50%", background: G,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 16, fontWeight: 900, color: "#fff", flexShrink: 0,
                        }}>
                          {(s.full_name || "?")[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 700, fontSize: 14, color: G, margin: 0 }}>{s.full_name || "—"}</p>
                          {s.full_name_ar && <p style={{ fontSize: 12, color: GOLD, margin: "2px 0 0", fontFamily: "'Amiri', serif", direction: "rtl" }}>{s.full_name_ar}</p>}
                          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{s.email || s.student_id || ""}</p>
                        </div>
                        <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: lv.bg, color: lv.color, border: `1px solid ${lv.border}` }}>
                          {s.level || "beginner"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === "materials"     && <SubjectMaterials subjectId={selectedSubject.id} subjectTitle={selectedSubject.title} />}
              {activeTab === "syllabus"      && <SubjectSyllabus subjectId={selectedSubject.id} />}
              {activeTab === "assignments"   && <SubjectAssignments subjectId={selectedSubject.id} />}
              {activeTab === "announcements" && <SubjectAnnouncements subjectId={selectedSubject.id} />}
              {activeTab === "recordings"    && <SubjectRecordings subjectId={selectedSubject.id} />}

              {/* Exams tab */}
              {activeTab === "exams" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {subjectData.exams.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "48px 24px", borderRadius: 16, border: "2px dashed #E5E7EB", background: "#FAFAFA" }}>
                      <ClipboardList size={40} style={{ margin: "0 auto 12px", display: "block", opacity: 0.3, color: G }} />
                      <p style={{ color: "#9CA3AF", fontSize: 14 }}>{t("No exams yet", "لا توجد امتحانات بعد")}</p>
                      <button onClick={() => navigate("/teacher/exams")} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 10, background: G, color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                        {t("Create Exam", "إنشاء امتحان")}
                      </button>
                    </div>
                  ) : subjectData.exams.map(e => (
                    <div key={e.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <ClipboardList size={16} color="#DC2626" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: 14, color: G, margin: 0 }}>{e.title}</p>
                        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{e.term || "first"} term • {e.is_published ? t("Published", "منشور") : t("Draft", "مسودة")}</p>
                      </div>
                      <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: e.is_published ? "#F0FDF4" : "#F3F4F6", color: e.is_published ? "#16A34A" : "#6B7280", border: `1px solid ${e.is_published ? "#86EFAC" : "#D1D5DB"}` }}>
                        {e.is_published ? t("Published", "منشور") : t("Draft", "مسودة")}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Tests tab */}
              {activeTab === "tests" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {subjectData.tests.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "48px 24px", borderRadius: 16, border: "2px dashed #E5E7EB", background: "#FAFAFA" }}>
                      <FileText size={40} style={{ margin: "0 auto 12px", display: "block", opacity: 0.3, color: G }} />
                      <p style={{ color: "#9CA3AF", fontSize: 14 }}>{t("No tests yet", "لا توجد تمرينات بعد")}</p>
                      <button onClick={() => navigate("/teacher/tests")} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 10, background: G, color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                        {t("Create Test", "إنشاء تمرين")}
                      </button>
                    </div>
                  ) : subjectData.tests.map(e => (
                    <div key={e.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <FileText size={16} color="#2563EB" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: 14, color: G, margin: 0 }}>{e.title}</p>
                        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{e.term || "first"} term • {e.is_published ? t("Published", "منشور") : t("Draft", "مسودة")}</p>
                      </div>
                      <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: e.is_published ? "#EFF6FF" : "#F3F4F6", color: e.is_published ? "#2563EB" : "#6B7280", border: `1px solid ${e.is_published ? "#93C5FD" : "#D1D5DB"}` }}>
                        {e.is_published ? t("Published", "منشور") : t("Draft", "مسودة")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Subject list ───────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "system-ui, sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: G, margin: 0 }}>{t("My Subjects", "موادي")}</h1>
            <p style={{ fontSize: 13, color: "#9CA3AF", margin: "2px 0 0" }}>{subjects.length} {t("subjects assigned", "مادة مسندة")}</p>
          </div>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t("Search subjects…", "ابحث في المواد…")}
              style={{ paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#FAFAFA", fontSize: 13, outline: "none", width: 220 }}
            />
          </div>
        </div>
      </div>

      <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
        {filteredSubjects.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 24px", borderRadius: 20, border: "2px dashed #E5E7EB", background: "#FAFAFA" }}>
            <BookOpen size={48} style={{ margin: "0 auto 16px", display: "block", opacity: 0.2, color: G }} />
            <p style={{ fontWeight: 700, fontSize: 16, color: "#374151", margin: "0 0 4px" }}>
              {search ? t("No matching subjects", "لا توجد مواد مطابقة") : t("No subjects assigned", "لا توجد مواد مسندة")}
            </p>
            <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>{t("Contact admin to be assigned to subjects", "تواصل مع المدير لتعيين مواد")}</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {filteredSubjects.map(sub => {
              const counts = subjectCounts[sub.id] || {};
              const lc = safeLevel(sub.level);
              return (
                <div
                  key={sub.id}
                  onClick={() => loadSubjectDetails(sub)}
                  style={{ background: "#fff", borderRadius: 18, border: `1px solid ${lc.border}`, overflow: "hidden", cursor: "pointer", boxShadow: "0 1px 6px rgba(0,0,0,.04)", transition: "all .2s" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 24px rgba(0,0,0,.1)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 6px rgba(0,0,0,.04)"}
                >
                  <div style={{ height: 90, background: `linear-gradient(135deg, ${G} 0%, ${GM} 100%)`, position: "relative" }}>
                    {sub.image_url && (
                      <img src={sub.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        onError={e => { (e.target as HTMLElement).style.display = "none"; }} />
                    )}
                    <div style={{ position: "absolute", top: 8, right: 8, padding: "3px 10px", borderRadius: 20, background: lc.bg, color: lc.color, fontSize: 10, fontWeight: 700, border: `1px solid ${lc.border}` }}>
                      {sub.level || "All Levels"}
                    </div>
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <BookOpen size={32} color="rgba(255,255,255,.2)" />
                    </div>
                  </div>

                  <div style={{ padding: 16 }}>
                    <p style={{ fontWeight: 800, fontSize: 15, color: G, margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.title}</p>
                    {sub.title_ar && (
                      <p style={{ fontSize: 12, color: GOLD, margin: "0 0 10px", fontFamily: "'Amiri', serif", direction: "rtl", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {sub.title_ar}
                      </p>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
                      {[
                        { icon: Users,        count: counts.studentCount  || 0, label: t("students",   "طلاب") },
                        { icon: FolderOpen,   count: counts.materialCount || 0, label: t("materials",  "مواد") },
                        { icon: ClipboardList,count: counts.examCount     || 0, label: t("exams",      "امتحانات") },
                        { icon: Video,        count: counts.recordingCount|| 0, label: t("recordings", "تسجيلات") },
                      ].map((s, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6B7280" }}>
                          <s.icon size={12} color="#9CA3AF" />
                          <span><strong style={{ color: G }}>{s.count}</strong> {s.label}</span>
                        </div>
                      ))}
                    </div>

                    <button style={{ width: "100%", padding: "10px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${G}, ${GM})`, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      {t("Open Subject", "فتح المادة")}
                      <Star size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
