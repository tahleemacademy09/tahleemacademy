import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Users, Mic, ClipboardList, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";

const TeacherSubjects = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  const [subjectData, setSubjectData] = useState<{ students: any[]; recordings: any[]; exams: any[]; tests: any[] }>({ students: [], recordings: [], exams: [], tests: [] });
  const [subjectCounts, setSubjectCounts] = useState<Record<string, { studentCount: number; recordingCount: number; examCount: number; testCount: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase.from("subjects").select("*").eq("teacher_id", user.id);
      const subs = data || [];
      const counts: Record<string, any> = {};
      for (const sub of subs) {
        const { data: courses } = await supabase.from("courses").select("id").eq("subject_id", sub.id);
        const courseIds = (courses || []).map((c: any) => c.id);
        const { count: studentCount } = courseIds.length > 0
          ? await supabase.from("enrollments").select("id", { count: "exact", head: true }).in("course_id", courseIds)
          : { count: 0 };
        const { count: recordingCount } = await supabase.from("session_recordings").select("id", { count: "exact", head: true }).eq("subject_id", sub.id);
        const { data: examsData } = courseIds.length > 0
          ? await supabase.from("exams").select("id, type").in("course_id", courseIds)
          : { data: [] };
        counts[sub.id] = {
          studentCount: studentCount || 0,
          recordingCount: recordingCount || 0,
          examCount: (examsData || []).filter((e: any) => (e.type || "exam") === "exam").length,
          testCount: (examsData || []).filter((e: any) => e.type === "test").length,
        };
      }
      setSubjectCounts(counts);
      setSubjects(subs);
      setSubjects(subs);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const loadSubjectDetails = async (sub: any) => {
    setSelectedSubject(sub);
    const { data: courses } = await supabase.from("courses").select("id").eq("subject_id", sub.id);
    const courseIds = (courses || []).map((c: any) => c.id);

    // Students
    let students: any[] = [];
    if (courseIds.length > 0) {
      const { data: enrollments } = await supabase.from("enrollments").select("user_id").in("course_id", courseIds);
      const userIds = [...new Set((enrollments || []).map(e => e.user_id))];
      if (userIds.length > 0) {
        const { data } = await supabase.from("profiles").select("*").in("user_id", userIds);
        students = data || [];
      }
    }

    const { data: recordings } = await supabase.from("session_recordings").select("*").eq("subject_id", sub.id).order("created_at", { ascending: false });
    
    let exams: any[] = [], tests: any[] = [];
    if (courseIds.length > 0) {
      const { data } = await supabase.from("exams").select("*").in("course_id", courseIds);
      exams = (data || []).filter((e: any) => (e.type || "exam") === "exam");
      tests = (data || []).filter((e: any) => e.type === "test");
    }

    setSubjectData({ students, recordings: recordings || [], exams, tests });
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  if (selectedSubject) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Button variant="ghost" onClick={() => setSelectedSubject(null)}>← {t("Back to Subjects", "العودة للمواد")}</Button>
        <h1 className="text-2xl font-bold">{selectedSubject.title_ar || selectedSubject.title}</h1>
        <Tabs defaultValue="students">
          <TabsList>
            <TabsTrigger value="students">{t("Students", "الطلاب")}</TabsTrigger>
            <TabsTrigger value="recordings">{t("Recordings", "التسجيلات")}</TabsTrigger>
            <TabsTrigger value="exams">{t("Exams", "الامتحانات")}</TabsTrigger>
            <TabsTrigger value="tests">{t("Tests", "التمرينات")}</TabsTrigger>
          </TabsList>
          <TabsContent value="students" className="space-y-3 mt-4">
            {subjectData.students.map(s => (
              <Card key={s.id}><CardContent className="p-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">{(s.full_name || "?")[0]}</div>
                <div><p className="text-sm font-medium">{s.full_name}</p><p className="text-xs text-muted-foreground">{s.level}</p></div>
              </CardContent></Card>
            ))}
            {subjectData.students.length === 0 && <p className="text-muted-foreground text-sm">{t("No students enrolled", "لا يوجد طلاب مسجلين")}</p>}
          </TabsContent>
          <TabsContent value="recordings" className="space-y-3 mt-4">
            {subjectData.recordings.map(r => (
              <Card key={r.id}><CardContent className="p-3">
                <p className="font-medium text-sm">{r.teacher_name || "Recording"}</p>
                <p className="text-xs text-muted-foreground">{r.duration_seconds ? `${Math.round(r.duration_seconds / 60)} min` : ""} • {new Date(r.created_at).toLocaleDateString()}</p>
              </CardContent></Card>
            ))}
            {subjectData.recordings.length === 0 && <p className="text-muted-foreground text-sm">{t("No recordings", "لا توجد تسجيلات")}</p>}
          </TabsContent>
          <TabsContent value="exams" className="space-y-3 mt-4">
            {subjectData.exams.map(e => (
              <Card key={e.id}><CardContent className="p-3 flex items-center justify-between">
                <div><p className="font-medium text-sm">{e.title}</p><p className="text-xs text-muted-foreground">{e.term || "first"} term</p></div>
                <Badge>{e.is_published ? t("Published", "منشور") : t("Draft", "مسودة")}</Badge>
              </CardContent></Card>
            ))}
          </TabsContent>
          <TabsContent value="tests" className="space-y-3 mt-4">
            {subjectData.tests.map(e => (
              <Card key={e.id}><CardContent className="p-3 flex items-center justify-between">
                <div><p className="font-medium text-sm">{e.title}</p><p className="text-xs text-muted-foreground">{e.term || "first"} term</p></div>
                <Badge variant="secondary">{e.is_published ? t("Published", "منشور") : t("Draft", "مسودة")}</Badge>
              </CardContent></Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold">{t("My Subjects", "موادي")}</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {subjects.map(sub => (
          <Card key={sub.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => loadSubjectDetails(sub)}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-bold">{sub.title_ar || sub.title}</p>
                  {sub.title_ar && <p className="text-xs text-muted-foreground">{sub.title}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1"><Users className="h-3 w-3" /> {sub.studentCount} {t("students", "طلاب")}</div>
                <div className="flex items-center gap-1"><Mic className="h-3 w-3" /> {sub.recordingCount} {t("recordings", "تسجيلات")}</div>
                <div className="flex items-center gap-1"><ClipboardList className="h-3 w-3" /> {sub.examCount} {t("exams", "امتحانات")}</div>
                <div className="flex items-center gap-1"><FileText className="h-3 w-3" /> {sub.testCount} {t("tests", "تمرينات")}</div>
              </div>
              <Button size="sm" className="w-full">{t("Open Subject", "فتح المادة")}</Button>
            </CardContent>
          </Card>
        ))}
        {subjects.length === 0 && <p className="text-muted-foreground col-span-full text-center py-8">{t("No subjects assigned", "لا توجد مواد مسندة")}</p>}
      </div>
    </div>
  );
};

export default TeacherSubjects;
