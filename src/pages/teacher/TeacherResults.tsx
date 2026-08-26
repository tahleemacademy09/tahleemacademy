import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart2 } from "lucide-react";

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
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("Student", "الطالب")}</TableHead>
          <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("Subject", "المادة")}</TableHead>
          <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("Term", "الفترة")}</TableHead>
          <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("Score", "الدرجة")}</TableHead>
          <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("Max", "الحد الأقصى")}</TableHead>
          <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">%</TableHead>
          <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("Result", "النتيجة")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map(r => (
          <TableRow key={r.id} className="hover:bg-slate-50">
            <TableCell className="font-medium text-slate-800">{(r as any).profiles?.full_name || "---"}</TableCell>
            <TableCell className="text-slate-600">{(r as any).exams?.courses?.subjects?.title || "---"}</TableCell>
            <TableCell className="text-slate-600 capitalize">{(r as any).exams?.term || "first"}</TableCell>
            <TableCell className="font-semibold text-slate-800">{Math.round(r.score || 0)}</TableCell>
            <TableCell className="text-slate-500">{Math.round(r.total_points || 0)}</TableCell>
            <TableCell className="font-semibold text-slate-800">{Math.round(r.percentage || 0)}%</TableCell>
            <TableCell><Badge variant={r.passed ? "default" : "destructive"} className="rounded-full">{r.passed ? t("Pass", "ناجح") : t("Fail", "راسب")}</Badge></TableCell>
          </TableRow>
        ))}
        {data.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="py-10 text-center text-slate-400">
              <BarChart2 className="mx-auto mb-2 h-8 w-8 opacity-30" />
              {t("No results", "لا توجد نتائج")}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-24">
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-40 border-b border-white/10 shadow-lg backdrop-blur-md" style={{ background: "linear-gradient(135deg, #064E3B 0%, #083320 100%)" }}>
        <div className="mx-auto max-w-5xl px-3 py-3 sm:px-6 sm:py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 sm:h-11 sm:w-11">
              <BarChart2 className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="m-0 truncate text-lg font-black tracking-tight text-white sm:text-xl">{t("Results", "النتائج")}</h1>
              <p className="m-0 truncate text-[11px] font-medium text-white/70">{t("Exam and test performance", "أداء الامتحانات والتمارين")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="mx-auto max-w-5xl space-y-5 px-3 pt-6 sm:px-6 sm:pt-8">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="h-11 w-48 rounded-lg"><SelectValue placeholder={t("All Subjects", "كل المواد")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All", "الكل")}</SelectItem>
              {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={termFilter} onValueChange={setTermFilter}>
            <SelectTrigger className="h-11 w-40 rounded-lg"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All Terms", "كل الفترات")}</SelectItem>
              <SelectItem value="first">{t("First", "الأولى")}</SelectItem>
              <SelectItem value="second">{t("Second", "الثانية")}</SelectItem>
              <SelectItem value="third">{t("Third", "الثالثة")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="tests">
          <TabsList className="rounded-xl bg-slate-100 p-1">
            <TabsTrigger value="tests" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">{t("Test Results", "نتائج التمرينات")}</TabsTrigger>
            <TabsTrigger value="exams" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">{t("Exam Results", "نتائج الامتحانات")}</TabsTrigger>
          </TabsList>
          <TabsContent value="tests" className="mt-4">
            <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm"><CardContent className="p-0"><ResultsTable data={filterResults("test")} /></CardContent></Card>
          </TabsContent>
          <TabsContent value="exams" className="mt-4">
            <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm"><CardContent className="p-0"><ResultsTable data={filterResults("exam")} /></CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default TeacherResults;
