import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Edit, Trash2, ClipboardList } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const GOLD = "#c9a84c";

interface TeacherExamsPageProps {
  type: "exam" | "test";
}

const TeacherExamsPage = ({ type }: TeacherExamsPageProps) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [exams, setExams] = useState<any[]>([]);
  const [termFilter, setTermFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const isTest = type === "test";
  const label = isTest ? t("Tests", "التمرينات") : t("Exams", "الامتحانات");
  const singularLabel = isTest ? t("Test", "تمرين") : t("Exam", "امتحان");

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data: subs } = await supabase.from("subjects").select("id").eq("teacher_id", user.id);
      const subjectIds = (subs || []).map(s => s.id);
      if (subjectIds.length === 0) { setLoading(false); return; }
      const { data: courses } = await supabase.from("courses").select("id").in("subject_id", subjectIds);
      const courseIds = (courses || []).map(c => c.id);
      if (courseIds.length === 0) { setLoading(false); return; }

      const { data } = await supabase.from("exams").select("*, courses(title, subject_id, subjects(title))").in("course_id", courseIds).order("created_at", { ascending: false });
      setExams((data || []).filter((e: any) => (e.type || "exam") === type));
      setLoading(false);
    };
    fetch();
  }, [user, type]);

  const filtered = exams.filter(e => {
    if (termFilter !== "all" && (e.term || "first") !== termFilter) return false;
    if (statusFilter === "published" && !e.is_published) return false;
    if (statusFilter === "draft" && e.is_published) return false;
    return true;
  });

  const deleteExam = async (id: string) => {
    const { error } = await supabase.from("exams").delete().eq("id", id);
    if (!error) {
      setExams(exams.filter(e => e.id !== id));
      toast({ title: t("Deleted", "تم الحذف") });
    }
  };

  const togglePublish = async (id: string, current: boolean) => {
    await supabase.from("exams").update({ is_published: !current }).eq("id", id);
    setExams(exams.map(e => e.id === id ? { ...e, is_published: !current } : e));
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-24">
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-40 border-b border-white/10 shadow-lg backdrop-blur-md" style={{ background: "linear-gradient(135deg, #064E3B 0%, #083320 100%)" }}>
        <div className="mx-auto max-w-5xl px-3 py-3 sm:px-6 sm:py-5">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 sm:h-11 sm:w-11">
                <ClipboardList className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="m-0 truncate text-lg font-black tracking-tight text-white sm:text-xl">{label}</h1>
                <p className="m-0 truncate text-[11px] font-medium text-white/70">{t("Create and manage assessments", "إنشاء وإدارة التقييمات")}</p>
              </div>
            </div>
            <button
              onClick={() => navigate("/teacher/exams/create")}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border-0 px-4 py-2.5 text-xs font-black shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-95 sm:gap-2 sm:px-6 sm:text-sm"
              style={{ background: GOLD, color: "#064E3B" }}
            >
              <Plus className="h-4 w-4" /> {t("Create", "إنشاء")} {singularLabel}
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="mx-auto max-w-5xl space-y-5 px-3 pt-6 sm:px-6 sm:pt-8">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          {["all", "first", "second", "third"].map(term => (
            <button
              key={term}
              onClick={() => setTermFilter(term)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                termFilter === term ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
              style={termFilter === term ? { background: "#064E3B" } : undefined}
            >
              {term === "all" ? t("All Terms", "كل الفترات") : term === "first" ? t("First", "الأولى") : term === "second" ? t("Second", "الثانية") : t("Third", "الثالثة")}
            </button>
          ))}
          <div className="ms-2 flex items-center gap-1.5 border-s border-slate-200 ps-3">
            {["all", "published", "draft"].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                  statusFilter === s ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
                style={statusFilter === s ? { background: GOLD, color: "#064E3B" } : undefined}
              >
                {s === "all" ? t("All", "الكل") : s === "published" ? t("Published", "منشور") : t("Draft", "مسودة")}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3 sm:px-6 sm:py-4">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <ClipboardList className="h-4 w-4 text-emerald-700 sm:h-5 sm:w-5" />
              {label}
              {filtered.length > 0 && <Badge className="rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{filtered.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 sm:p-6">
            {filtered.map(e => (
              <div key={e.id} className="flex flex-col gap-3 rounded-xl border-2 border-slate-200 p-3.5 transition-colors hover:border-slate-300 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-slate-800">{e.title}</p>
                    <Badge variant={isTest ? "secondary" : "default"} className="rounded-full text-xs">{singularLabel}</Badge>
                    <Badge variant="outline" className="rounded-full text-xs capitalize">{e.term || "first"}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">{(e as any).courses?.subjects?.title || (e as any).courses?.title || ""}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge
                    className={cn("rounded-full", e.is_published ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-slate-200 text-slate-600 hover:bg-slate-200")}
                  >
                    {e.is_published ? t("Published", "منشور") : t("Draft", "مسودة")}
                  </Badge>
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={() => togglePublish(e.id, e.is_published)}>
                    {e.is_published ? t("Unpublish", "إلغاء النشر") : t("Publish", "نشر")}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => navigate(`/teacher/exams/${e.id}/edit`)}><Edit className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-600" onClick={() => deleteExam(e.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="py-10 text-center text-slate-400">
                <ClipboardList className="mx-auto mb-3 h-10 w-10 opacity-30" />
                <p className="text-sm">{t(`No ${type}s found`, `لم يتم العثور على ${isTest ? "تمرينات" : "امتحانات"}`)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TeacherExamsPage;
