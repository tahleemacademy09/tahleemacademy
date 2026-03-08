import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Edit, Trash2, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

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

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{label}</h1>
        <Button onClick={() => navigate("/admin/exams/create")}><Plus className="h-4 w-4 me-2" /> {t("Create", "إنشاء")} {singularLabel}</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {["all", "first", "second", "third"].map(term => (
          <Button key={term} size="sm" variant={termFilter === term ? "default" : "outline"} onClick={() => setTermFilter(term)}>
            {term === "all" ? t("All Terms", "كل الفترات") : term === "first" ? t("First", "الأولى") : term === "second" ? t("Second", "الثانية") : t("Third", "الثالثة")}
          </Button>
        ))}
        <div className="border-s ps-2 ms-2">
          {["all", "published", "draft"].map(s => (
            <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)} className="ms-1">
              {s === "all" ? t("All", "الكل") : s === "published" ? t("Published", "منشور") : t("Draft", "مسودة")}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map(e => (
          <Card key={e.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{e.title}</p>
                  <Badge variant={isTest ? "secondary" : "default"} className="text-xs">{singularLabel}</Badge>
                  <Badge variant="outline" className="text-xs">{e.term || "first"}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{(e as any).courses?.subjects?.title || (e as any).courses?.title || ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={e.is_published ? "default" : "secondary"}>
                  {e.is_published ? t("Published", "منشور") : t("Draft", "مسودة")}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => togglePublish(e.id, e.is_published)}>
                  {e.is_published ? t("Unpublish", "إلغاء النشر") : t("Publish", "نشر")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/exams/${e.id}/edit`)}><Edit className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => deleteExam(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-muted-foreground text-center py-8">{t(`No ${type}s found`, `لم يتم العثور على ${isTest ? "تمرينات" : "امتحانات"}`)}</p>}
      </div>
    </div>
  );
};

export default TeacherExamsPage;
