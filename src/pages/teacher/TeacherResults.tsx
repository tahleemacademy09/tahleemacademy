import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TeacherResults = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [results, setResults] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [termFilter, setTermFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data: subs } = await supabase.from("subjects").select("id, title").eq("teacher_id", user.id);
      setSubjects(subs || []);
      const subjectIds = (subs || []).map(s => s.id);
      if (subjectIds.length === 0) { setLoading(false); return; }
      const { data: courses } = await supabase.from("courses").select("id, subject_id, subjects(title)").in("subject_id", subjectIds);
      const courseIds = (courses || []).map(c => c.id);
      if (courseIds.length === 0) { setLoading(false); return; }

      const { data } = await supabase.from("exam_attempts")
        .select("*, profiles!exam_attempts_user_id_fkey(full_name), exams(title, type, term, course_id, courses(subject_id, subjects(title)))")
        .in("exam_id", (await supabase.from("exams").select("id").in("course_id", courseIds)).data?.map((e: any) => e.id) || [])
        .in("status", ["graded", "submitted"])
        .order("submitted_at", { ascending: false });

      setResults(data || []);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const filterResults = (type: string) => results.filter(r => {
    const examType = (r as any).exams?.type || "exam";
    if (examType !== type) return false;
    if (subjectFilter !== "all") {
      const subId = (r as any).exams?.courses?.subject_id;
      if (subId !== subjectFilter) return false;
    }
    if (termFilter !== "all" && ((r as any).exams?.term || "first") !== termFilter) return false;
    return true;
  });

  const ResultsTable = ({ data }: { data: any[] }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("Student", "الطالب")}</TableHead>
          <TableHead>{t("Subject", "المادة")}</TableHead>
          <TableHead>{t("Term", "الفترة")}</TableHead>
          <TableHead>{t("Score", "الدرجة")}</TableHead>
          <TableHead>{t("Max", "الحد الأقصى")}</TableHead>
          <TableHead>%</TableHead>
          <TableHead>{t("Result", "النتيجة")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map(r => (
          <TableRow key={r.id}>
            <TableCell>{(r as any).profiles?.full_name || "---"}</TableCell>
            <TableCell>{(r as any).exams?.courses?.subjects?.title || "---"}</TableCell>
            <TableCell>{(r as any).exams?.term || "first"}</TableCell>
            <TableCell>{Math.round(r.score || 0)}</TableCell>
            <TableCell>{Math.round(r.total_points || 0)}</TableCell>
            <TableCell>{Math.round(r.percentage || 0)}%</TableCell>
            <TableCell><Badge variant={r.passed ? "default" : "destructive"}>{r.passed ? t("Pass", "ناجح") : t("Fail", "راسب")}</Badge></TableCell>
          </TableRow>
        ))}
        {data.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">{t("No results", "لا توجد نتائج")}</TableCell></TableRow>}
      </TableBody>
    </Table>
  );

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold">{t("Results", "النتائج")}</h1>

      <div className="flex flex-wrap gap-3">
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder={t("All Subjects", "كل المواد")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All", "الكل")}</SelectItem>
            {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={termFilter} onValueChange={setTermFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Terms", "كل الفترات")}</SelectItem>
            <SelectItem value="first">{t("First", "الأولى")}</SelectItem>
            <SelectItem value="second">{t("Second", "الثانية")}</SelectItem>
            <SelectItem value="third">{t("Third", "الثالثة")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="tests">
        <TabsList>
          <TabsTrigger value="tests">{t("Test Results", "نتائج التمرينات")}</TabsTrigger>
          <TabsTrigger value="exams">{t("Exam Results", "نتائج الامتحانات")}</TabsTrigger>
        </TabsList>
        <TabsContent value="tests" className="mt-4"><Card><CardContent className="p-0"><ResultsTable data={filterResults("test")} /></CardContent></Card></TabsContent>
        <TabsContent value="exams" className="mt-4"><Card><CardContent className="p-0"><ResultsTable data={filterResults("exam")} /></CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
};

export default TeacherResults;
