import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Search, Users, Eye } from "lucide-react";

const TeacherStudents = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data: subs } = await supabase.from("subjects").select("id, title, title_ar").eq("teacher_id", user.id);
      setSubjects(subs || []);
      const subjectIds = (subs || []).map(s => s.id);
      if (subjectIds.length === 0) { setLoading(false); return; }

      const { data: courses } = await supabase.from("courses").select("id, subject_id").in("subject_id", subjectIds);
      const courseIds = (courses || []).map(c => c.id);
      if (courseIds.length === 0) { setLoading(false); return; }

      const { data: enrollments } = await supabase.from("enrollments").select("user_id, course_id").in("course_id", courseIds);
      const userIds = [...new Set((enrollments || []).map(e => e.user_id))];
      if (userIds.length === 0) { setLoading(false); return; }

      const { data: profiles } = await supabase.from("profiles").select("*").in("user_id", userIds);

      // Map enrollments to profiles
      const enriched = (profiles || []).map(p => {
        const pEnrollments = (enrollments || []).filter(e => e.user_id === p.user_id);
        const pSubjects = pEnrollments.map(e => {
          const course = (courses || []).find(c => c.id === e.course_id);
          return (subs || []).find(s => s.id === course?.subject_id);
        }).filter(Boolean);
        return { ...p, enrolledSubjects: pSubjects, subjectCount: pSubjects.length };
      });

      setStudents(enriched);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const filtered = students.filter(s => {
    if (filter === "group" && s.student_type === "private") return false;
    if (filter === "private" && s.student_type !== "private") return false;
    if (subjectFilter !== "all" && !s.enrolledSubjects?.some((sub: any) => sub?.id === subjectFilter)) return false;
    if (search && !s.full_name?.toLowerCase().includes(search.toLowerCase()) && !s.full_name_ar?.includes(search)) return false;
    return true;
  });

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold">{t("My Students", "طلابي")}</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex gap-1">
          {["all", "group", "private"].map(f => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "all" ? t("All", "الكل") : f === "group" ? t("Group", "مجموعة") : t("Private", "خاص")}
            </Button>
          ))}
        </div>
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder={t("All Subjects", "كل المواد")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Subjects", "كل المواد")}</SelectItem>
            {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("Search by name...", "ابحث بالاسم...")} value={search} onChange={e => setSearch(e.target.value)} className="ps-9" />
        </div>
      </div>

      {/* Student cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(s => (
          <Card key={s.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {(s.full_name || "?")[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{s.full_name || "---"}</p>
                  <p className="text-xs text-muted-foreground">{s.level || "---"} • {s.subjectCount} {t("subjects", "مواد")}</p>
                </div>
                <Badge variant={s.student_type === "private" ? "secondary" : "default"} className="text-xs">
                  {s.student_type === "private" ? t("Private", "خاص") : t("Group", "مجموعة")}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 text-xs"><Eye className="h-3 w-3 me-1" /> {t("View", "عرض")}</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-muted-foreground col-span-full text-center py-8">{t("No students found", "لم يتم العثور على طلاب")}</p>}
      </div>
    </div>
  );
};

export default TeacherStudents;
