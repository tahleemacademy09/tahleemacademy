import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Download, GraduationCap, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import tahleemStamp from "@/assets/tahleem-stamp.png";

const gradePoint = (pct: number) => pct >= 85 ? 4.0 : pct >= 75 ? 3.5 : pct >= 65 ? 3.0 : pct >= 55 ? 2.0 : pct >= 45 ? 1.0 : 0.0;

const TeacherTranscript = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [term, setTerm] = useState("first");
  const [results, setResults] = useState<any[]>([]);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showComment, setShowComment] = useState(false);
  const [commentAttemptId, setCommentAttemptId] = useState("");
  const [commentText, setCommentText] = useState("");

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      // Get all students from teacher's subjects
      const { data: subs } = await supabase.from("subjects").select("id").eq("teacher_id", user.id);
      const subjectIds = (subs || []).map(s => s.id);
      if (subjectIds.length > 0) {
        const { data: courses } = await supabase.from("courses").select("id").in("subject_id", subjectIds);
        const courseIds = (courses || []).map((c: any) => c.id);
        if (courseIds.length > 0) {
          const { data: enrollments } = await supabase.from("enrollments").select("user_id").in("course_id", courseIds);
          const userIds = [...new Set((enrollments || []).map(e => e.user_id))];
          if (userIds.length > 0) {
            const { data } = await supabase.from("profiles").select("user_id, full_name, full_name_ar, level").in("user_id", userIds);
            setStudents(data || []);
          }
        }
      }
      // Also include private students
      const { data: pvt } = await supabase.from("profiles").select("user_id, full_name, full_name_ar, level").eq("assigned_teacher_id", user.id);
      if (pvt) setStudents(prev => {
        const existing = new Set(prev.map(p => p.user_id));
        return [...prev, ...pvt.filter(p => !existing.has(p.user_id))];
      });
      setLoading(false);
    };
    fetch();
  }, [user]);

  const loadTranscript = async () => {
    if (!selectedStudent) return;
    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", selectedStudent).maybeSingle();
    setStudentProfile(profile);

    // Get attempts with exam details
    const { data } = await supabase.from("exam_attempts")
      .select("*, exams(title, title_ar, type, term, course_id, courses(subject_id, subjects(title, title_ar)))")
      .eq("user_id", selectedStudent)
      .eq("status", "graded")
      .order("submitted_at", { ascending: false });

    // Filter by term and get best attempt per subject per type
    const termResults = (data || []).filter((a: any) => ((a as any).exams?.term || "first") === term);
    setResults(termResults);
  };

  useEffect(() => { if (selectedStudent) loadTranscript(); }, [selectedStudent, term]);

  // Group by subject
  const subjectMap = new Map<string, { title: string; title_ar: string; test: number; exam: number }>();
  results.forEach((r: any) => {
    const subTitle = (r as any).exams?.courses?.subjects?.title || "Unknown";
    const subTitleAr = (r as any).exams?.courses?.subjects?.title_ar || subTitle;
    const type = (r as any).exams?.type || "exam";
    const key = subTitle;
    if (!subjectMap.has(key)) subjectMap.set(key, { title: subTitle, title_ar: subTitleAr, test: 0, exam: 0 });
    const entry = subjectMap.get(key)!;
    const score = Math.round(r.percentage || 0);
    if (type === "test") entry.test = Math.max(entry.test, Math.round(score * 0.3));
    else entry.exam = Math.max(entry.exam, Math.round(score * 0.7));
  });

  const subjectResults = Array.from(subjectMap.values());

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold">{t("Transcript", "كشف النتائج")}</h1>

      <div className="flex flex-wrap gap-4">
        <Select value={selectedStudent} onValueChange={setSelectedStudent}>
          <SelectTrigger className="w-64"><SelectValue placeholder={t("Select Student", "اختر الطالب")} /></SelectTrigger>
          <SelectContent>{students.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={term} onValueChange={setTerm}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="first">{t("First Term", "الفترة الأولى")}</SelectItem>
            <SelectItem value="second">{t("Second Term", "الفترة الثانية")}</SelectItem>
            <SelectItem value="third">{t("Third Term", "الفترة الثالثة")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selectedStudent && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              {studentProfile?.full_name || "Student"} — {term === "first" ? t("First Term", "الفترة الأولى") : term === "second" ? t("Second Term", "الفترة الثانية") : t("Third Term", "الفترة الثالثة")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full border-collapse text-sm" dir="rtl">
              <thead>
                <tr className="border-b">
                  <th className="text-start p-2">{t("Subject", "المادة")}</th>
                  <th className="p-2">{t("Test (30)", "التمرينات (٣٠)")}</th>
                  <th className="p-2">{t("Exam (70)", "الامتحانات (٧٠)")}</th>
                  <th className="p-2">{t("Total (100)", "المجموع (١٠٠)")}</th>
                  <th className="p-2">GP</th>
                  <th className="p-2">{t("Result", "النتيجة")}</th>
                </tr>
              </thead>
              <tbody>
                {subjectResults.map((s, i) => {
                  const total = s.test + s.exam;
                  const gp = gradePoint(total);
                  return (
                    <tr key={i} className="border-b">
                      <td className="p-2">{s.title_ar || s.title}</td>
                      <td className="p-2 text-center">{s.test}</td>
                      <td className="p-2 text-center">{s.exam}</td>
                      <td className="p-2 text-center font-bold">{total}</td>
                      <td className="p-2 text-center">{gp.toFixed(1)}</td>
                      <td className="p-2 text-center">{total >= 50 ? "✓" : "✗"}</td>
                    </tr>
                  );
                })}
                {subjectResults.length === 0 && <tr><td colSpan={6} className="text-center text-muted-foreground p-4">{t("No results for this term", "لا توجد نتائج لهذه الفترة")}</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TeacherTranscript;
