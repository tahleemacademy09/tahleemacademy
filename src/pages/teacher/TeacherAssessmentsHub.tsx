// src/pages/teacher/TeacherAssessmentsHub.tsx
// Assessments Hub: Exams | Tests | Grading | Results | Transcripts

import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardList, FileText, CheckSquare, BarChart2, GraduationCap,
  Search, Edit, Trash2, Eye, Plus, X, Check, ChevronLeft,
  AlertTriangle, Download, RefreshCw, Send, Unlock,
} from "lucide-react";
import TeacherGrading    from "./TeacherGrading";
import TeacherTranscript from "./TeacherTranscript";

const G    = "#064E3B";
const GM   = "#0a5c3e";
const GOLD = "#C9A84C";
const BG   = "#F0F2F5";

const card: React.CSSProperties = {
  background: "#fff", borderRadius: 14, border: "1px solid rgba(15,45,31,.07)",
  boxShadow: "0 1px 5px rgba(0,0,0,.04)",
};
const btn = (active = false, danger = false): React.CSSProperties => ({
  padding: "7px 14px", borderRadius: 9, border: "none", cursor: "pointer",
  fontWeight: 600, fontSize: 12,
  background: danger ? "#FEF2F2" : active ? G : "#F0F4F2",
  color:      danger ? "#DC2626" : active ? "#fff" : G,
});
const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 10,
  border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none",
  background: "#FAFBFC", boxSizing: "border-box",
};
const badge = (color: string): React.CSSProperties => ({
  display: "inline-block", padding: "2px 8px", borderRadius: 20,
  fontSize: 11, fontWeight: 700, background: `${color}18`, color,
});

type HubTab = "exams" | "tests" | "grading" | "results" | "transcripts";

const TABS: { id: HubTab; icon: any; en: string; ar: string }[] = [
  { id: "exams",       icon: ClipboardList, en: "Exams",       ar: "الامتحانات" },
  { id: "tests",       icon: FileText,      en: "Tests",       ar: "التمرينات" },
  { id: "grading",     icon: CheckSquare,   en: "Grading",     ar: "التصحيح" },
  { id: "results",     icon: BarChart2,     en: "Results",     ar: "النتائج" },
  { id: "transcripts", icon: GraduationCap, en: "Transcripts", ar: "كشف النتائج" },
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
//  EXAMS / TESTS LIST
// ═══════════════════════════════════════════════════════════════
function ExamsList({ user, t, type }: { user: any; t: any; type: "exam" | "test" }) {
  const { toast } = useToast();
  const [exams,   setExams]   = useState<any[]>([]);
  const [term,    setTerm]    = useState("all");
  const [status,  setStatus]  = useState("all");
  const [loading, setLoading] = useState(true);

  const isTest   = type === "test";
  const typeLabel = isTest ? t("Test", "تمرين") : t("Exam", "امتحان");

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data: subs } = await supabase.from("subjects").select("id").eq("teacher_id", user.id);
      const subjectIds = (subs || []).map((s: any) => s.id);
      if (!subjectIds.length) { setLoading(false); return; }
      const { data: courses } = await supabase.from("courses").select("id").in("subject_id", subjectIds);
      const courseIds = (courses || []).map((c: any) => c.id);
      if (!courseIds.length) { setLoading(false); return; }
      const { data } = await supabase.from("exams")
        .select("*, courses(title, subject_id, subjects(title))").in("course_id", courseIds)
        .order("created_at", { ascending: false });
      setExams((data || []).filter((e: any) => (e.type || "exam") === type));
      setLoading(false);
    };
    fetch();
  }, [user, type]);

  const togglePublish = async (id: string, current: boolean) => {
    await supabase.from("exams").update({ is_published: !current }).eq("id", id);
    setExams(exams.map(e => e.id === id ? { ...e, is_published: !current } : e));
  };

  const deleteExam = async (id: string, title: string) => {
    if (!confirm(`${t("Delete", "حذف")} "${title}"?`)) return;
    const { error } = await supabase.from("exams").delete().eq("id", id);
    if (!error) { setExams(exams.filter(e => e.id !== id)); toast({ title: t("Deleted", "تم الحذف") }); }
  };

  const filtered = exams.filter(e => {
    if (term !== "all" && (e.term || "first") !== term) return false;
    if (status === "published" && !e.is_published) return false;
    if (status === "draft" && e.is_published) return false;
    return true;
  });

  if (loading) return <Loader />;

  return (
    <div>
      {/* Stats */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { label: t("Total", "المجموع"), val: exams.length, color: G },
          { label: t("Published", "منشور"), val: exams.filter(e => e.is_published).length, color: "#16A34A" },
          { label: t("Draft", "مسودة"), val: exams.filter(e => !e.is_published).length, color: GOLD },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: "10px 14px", display: "flex", gap: 8, alignItems: "center", flex: "1 1 80px" }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.val}</span>
            <span style={{ fontSize: 11, color: "#7a9e88" }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {["all", "first", "second", "third"].map(ter => (
          <button key={ter} style={{ ...btn(term === ter), padding: "5px 12px", fontSize: 11 }} onClick={() => setTerm(ter)}>
            {ter === "all" ? t("All Terms", "كل الفترات") : ter === "first" ? t("1st Term", "الفصل الأول") : ter === "second" ? t("2nd Term", "الفصل الثاني") : t("3rd Term", "الفصل الثالث")}
          </button>
        ))}
        <div style={{ width: 1, background: "#e5e7eb", alignSelf: "stretch" }} />
        {["all", "published", "draft"].map(st => (
          <button key={st} style={{ ...btn(status === st), padding: "5px 12px", fontSize: 11 }} onClick={() => setStatus(st)}>
            {st === "all" ? t("All", "الكل") : st === "published" ? t("Published", "منشور") : t("Draft", "مسودة")}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 20px", color: "#94a3b8" }}>
          <ClipboardList size={40} style={{ opacity: .3, marginBottom: 12 }} />
          <p style={{ fontSize: 14 }}>{t(`No ${type}s found.`, `لم يتم العثور على ${isTest ? "تمرينات" : "امتحانات"}.`)}</p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map(e => (
          <div key={e.id} style={{ ...card, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "#1a2e25" }}>{e.title}</span>
                <span style={badge(isTest ? "#7C3AED" : G)}>{typeLabel}</span>
                <span style={badge("#94a3b8")}>{e.term || "first"}</span>
                {e.is_published && <span style={badge("#16A34A")}>{t("Live", "منشور")}</span>}
              </div>
              <div style={{ fontSize: 12, color: "#7a9e88" }}>
                {e.courses?.subjects?.title || e.courses?.title || ""}
                {e.total_points ? ` · ${e.total_points} ${t("pts", "نقطة")}` : ""}
                {e.time_limit_minutes ? ` · ${e.time_limit_minutes}m` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button style={{ ...btn(e.is_published ? false : true), padding: "5px 10px", fontSize: 11, background: e.is_published ? "#FEF2F2" : `${G}18`, color: e.is_published ? "#DC2626" : G }}
                onClick={() => togglePublish(e.id, e.is_published)}>
                {e.is_published ? t("Unpublish", "إلغاء النشر") : t("Publish", "نشر")}
              </button>
              <button style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#FEF2F2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={() => deleteExam(e.id, e.title)}>
                <Trash2 size={13} color="#DC2626" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  RESULTS TAB
// ═══════════════════════════════════════════════════════════════
function ResultsTab({ user, t }: any) {
  const [results,  setResults]  = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [subFilter,setSubFilter]= useState("all");
  const [termFilter,setTermFilter]= useState("all");
  const [typeFilter,setTypeFilter]= useState("all");
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data: subs } = await supabase.from("subjects").select("id, title").eq("teacher_id", user.id);
      setSubjects(subs || []);
      const subjectIds = (subs || []).map((s: any) => s.id);
      if (!subjectIds.length) { setLoading(false); return; }
      const { data: courses } = await supabase.from("courses").select("id").in("subject_id", subjectIds);
      const courseIds = (courses || []).map((c: any) => c.id);
      if (!courseIds.length) { setLoading(false); return; }
      const { data: examList } = await supabase.from("exams").select("id").in("course_id", courseIds);
      const examIds = (examList || []).map((e: any) => e.id);
      if (!examIds.length) { setLoading(false); return; }
      const { data } = await supabase.from("exam_attempts")
        .select("*, profiles!exam_attempts_user_id_fkey(full_name), exams(title, type, term, courses(subject_id, subjects(title)))")
        .in("exam_id", examIds).in("status", ["graded", "submitted"])
        .order("submitted_at", { ascending: false }).limit(100);
      setResults(data || []);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const filtered = results.filter(r => {
    if (subFilter !== "all") {
      const sid = r.exams?.courses?.subject_id;
      if (sid !== subFilter) return false;
    }
    if (termFilter !== "all" && (r.exams?.term || "first") !== termFilter) return false;
    if (typeFilter !== "all" && (r.exams?.type || "exam") !== typeFilter) return false;
    return true;
  });

  const graded = filtered.filter(r => r.status === "graded");
  const pending = filtered.filter(r => r.status === "submitted");

  if (loading) return <Loader />;

  const pctColor = (pct: number) => pct >= 75 ? "#16A34A" : pct >= 50 ? GOLD : "#DC2626";

  const ResultRow = ({ r }: { r: any }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid #f8f9fa" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#374151" }}>{r.profiles?.full_name || "—"}</div>
        <div style={{ fontSize: 11, color: "#9ca3af" }}>
          {r.exams?.title} · {r.exams?.courses?.subjects?.title} · {r.exams?.term || "first"}
        </div>
      </div>
      {r.status === "submitted" ? (
        <span style={badge(GOLD)}>{t("Pending", "قيد المراجعة")}</span>
      ) : (
        <>
          <span style={{ fontWeight: 800, fontSize: 15, color: pctColor(r.percentage || 0) }}>{Math.round(r.percentage || 0)}%</span>
          <span style={badge(r.passed ? "#16A34A" : "#DC2626")}>{r.passed ? t("Pass", "ناجح") : t("Fail", "راسب")}</span>
        </>
      )}
    </div>
  );

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <select style={{ ...inp, flex: "1 1 140px", maxWidth: 200 }} value={subFilter} onChange={e => setSubFilter(e.target.value)}>
          <option value="all">{t("All Subjects", "كل المواد")}</option>
          {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        <select style={{ ...inp, flex: "1 1 120px", maxWidth: 160 }} value={termFilter} onChange={e => setTermFilter(e.target.value)}>
          <option value="all">{t("All Terms", "كل الفترات")}</option>
          <option value="first">{t("1st Term", "الأول")}</option>
          <option value="second">{t("2nd Term", "الثاني")}</option>
          <option value="third">{t("3rd Term", "الثالث")}</option>
        </select>
        <select style={{ ...inp, flex: "1 1 120px", maxWidth: 160 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">{t("All Types", "كل الأنواع")}</option>
          <option value="exam">{t("Exams", "امتحانات")}</option>
          <option value="test">{t("Tests", "تمرينات")}</option>
        </select>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { label: t("Graded", "مصحح"), val: graded.length, color: "#16A34A" },
          { label: t("Pending", "قيد المراجعة"), val: pending.length, color: GOLD },
          { label: t("Pass Rate", "نسبة النجاح"), val: graded.length ? `${Math.round((graded.filter(r => r.passed).length / graded.length) * 100)}%` : "—", color: G },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: "10px 14px", display: "flex", gap: 8, alignItems: "center", flex: "1 1 100px" }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: s.color }}>{s.val}</span>
            <span style={{ fontSize: 11, color: "#7a9e88" }}>{s.label}</span>
          </div>
        ))}
      </div>

      {pending.length > 0 && (
        <div style={{ ...card, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ padding: "10px 14px", background: `${GOLD}12`, borderBottom: "1px solid #f1f5f0", fontSize: 12, fontWeight: 700, color: GOLD }}>
            {pending.length} {t("Pending review", "تحتاج مراجعة")}
          </div>
          {pending.slice(0, 5).map(r => <ResultRow key={r.id} r={r} />)}
        </div>
      )}

      {graded.length > 0 && (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", background: "#F8FAF9", borderBottom: "1px solid #f1f5f0", fontSize: 12, fontWeight: 700, color: G }}>
            {graded.length} {t("Graded results", "نتائج مصححة")}
          </div>
          {graded.slice(0, 20).map(r => <ResultRow key={r.id} r={r} />)}
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 20px", color: "#94a3b8" }}>
          <BarChart2 size={40} style={{ opacity: .3, marginBottom: 12 }} />
          <p style={{ fontSize: 14 }}>{t("No results found.", "لا توجد نتائج.")}</p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN HUB
// ═══════════════════════════════════════════════════════════════
export default function TeacherAssessmentsHub() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [tab, setTab] = useState<HubTab>("exams");

  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: subs } = await supabase.from("subjects").select("id").eq("teacher_id", user.id);
      const subIds = (subs || []).map((s: any) => s.id);
      if (!subIds.length) return;
      const { data: courses } = await supabase.from("courses").select("id").in("subject_id", subIds);
      const cIds = (courses || []).map((c: any) => c.id);
      if (!cIds.length) return;
      const { data: exams } = await supabase.from("exams").select("id").in("course_id", cIds);
      const eIds = (exams || []).map((e: any) => e.id);
      if (!eIds.length) return;
      const { count } = await supabase.from("exam_attempts").select("id", { count: "exact", head: true }).in("exam_id", eIds).eq("status", "submitted");
      setPendingCount(count || 0);
    })();
  }, [user]);

  const isFullPage = ["grading", "transcripts"].includes(tab);

  return (
    <div style={{ background: BG, minHeight: "100vh", paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${G} 0%, #0a5c3e 100%)`, padding: "20px 20px 0" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: `${GOLD}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ClipboardList size={20} color={GOLD} />
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 900, color: "#fff", margin: 0, fontFamily: "serif" }}>
                {t("Examinations", "الامتحانات")}
                {pendingCount > 0 && <span style={{ marginLeft: 8, background: "#DC2626", color: "#fff", borderRadius: 20, fontSize: 11, fontWeight: 900, padding: "2px 9px" }}>{pendingCount}</span>}
              </h1>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,.55)", margin: 0 }}>{t("Exams, tests, grading, results & transcripts", "الامتحانات والتمرينات والتصحيح والنتائج وكشف النتائج")}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 2, overflowX: "auto" }}>
            {TABS.map(tb => {
              const active = tab === tb.id;
              const isGrading = tb.id === "grading" && pendingCount > 0;
              return (
                <button key={tb.id} onClick={() => setTab(tb.id)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", border: "none", cursor: "pointer", borderRadius: "10px 10px 0 0", fontWeight: active ? 700 : 500, fontSize: 12, background: active ? "#fff" : "transparent", color: active ? G : "rgba(255,255,255,.7)", flexShrink: 0, position: "relative" }}>
                  <tb.icon size={13} />{language === "ar" ? tb.ar : tb.en}
                  {isGrading && <span style={{ marginLeft: 4, background: "#DC2626", color: "#fff", borderRadius: 20, fontSize: 9, fontWeight: 900, padding: "1px 5px" }}>{pendingCount}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      {isFullPage ? (
        <div>
          {tab === "grading"     && <TeacherGrading />}
          {tab === "transcripts" && <TeacherTranscript />}
        </div>
      ) : (
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 16px 0" }}>
          {tab === "exams"   && <ExamsList user={user} t={t} type="exam" />}
          {tab === "tests"   && <ExamsList user={user} t={t} type="test" />}
          {tab === "results" && <ResultsTab user={user} t={t} />}
        </div>
      )}
    </div>
  );
}
