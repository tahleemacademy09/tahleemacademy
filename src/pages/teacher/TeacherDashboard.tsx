import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Users, UserCheck, BookOpen, Video, ClipboardList, FileText, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

const TeacherDashboard = () => {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ students: 0, privateStudents: 0, subjects: 0, todayClasses: 0, pendingTests: 0, pendingExams: 0 });
  const [todaySessions, setTodaySessions] = useState<any[]>([]);
  const [todayPrivate, setTodayPrivate] = useState<any[]>([]);
  const [recentAttempts, setRecentAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      // Get teacher's subjects
      const { data: subjects } = await supabase.from("subjects").select("id, title, title_ar").eq("teacher_id", user.id);
      const subjectIds = (subjects || []).map(s => s.id);

      // Count students via enrollments -> courses -> subjects
      let studentCount = 0;
      if (subjectIds.length > 0) {
        const { data: courses } = await supabase.from("courses").select("id").in("subject_id", subjectIds);
        const courseIds = (courses || []).map(c => c.id);
        if (courseIds.length > 0) {
          const { count } = await supabase.from("enrollments").select("user_id", { count: "exact", head: true }).in("course_id", courseIds);
          studentCount = count || 0;
        }
      }

      // Private students
      const { count: privateCount } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("assigned_teacher_id", user.id).eq("student_type", "private");

      // Today's live sessions
      const today = new Date().toISOString().split("T")[0];
      let sessionsToday: any[] = [];
      if (subjectIds.length > 0) {
        const { data } = await supabase.from("live_sessions").select("*, subjects(title, title_ar)").in("subject_id", subjectIds).gte("created_at", today + "T00:00:00").lte("created_at", today + "T23:59:59");
        sessionsToday = data || [];
      }

      // Today's private sessions
      const { data: pvtSessions } = await supabase.from("private_sessions").select("*, profiles!private_sessions_student_id_fkey(full_name), subjects(title)").eq("teacher_id", user.id).eq("session_date", today);

      // Pending grading
      let pendingTests = 0, pendingExams = 0;
      if (subjectIds.length > 0) {
        const { data: exams } = await supabase.from("exams").select("id, type").in("course_id", (await supabase.from("courses").select("id").in("subject_id", subjectIds)).data?.map(c => c.id) || []);
        const examIds = (exams || []).filter(e => (e.type || "exam") === "exam").map(e => e.id);
        const testIds = (exams || []).filter(e => (e.type || "exam") === "test").map(e => e.id);
        if (examIds.length > 0) {
          const { count } = await supabase.from("exam_attempts").select("id", { count: "exact", head: true }).in("exam_id", examIds).eq("status", "submitted");
          pendingExams = count || 0;
        }
        if (testIds.length > 0) {
          const { count } = await supabase.from("exam_attempts").select("id", { count: "exact", head: true }).in("exam_id", testIds).eq("status", "submitted");
          pendingTests = count || 0;
        }
      }

      // Recent attempts
      const { data: recent } = await supabase.from("exam_attempts").select("*, profiles!exam_attempts_user_id_fkey(full_name), exams(title, type)").eq("status", "graded").order("submitted_at", { ascending: false }).limit(5);

      setStats({
        students: studentCount,
        privateStudents: privateCount || 0,
        subjects: subjectIds.length,
        todayClasses: sessionsToday.length,
        pendingTests,
        pendingExams,
      });
      setTodaySessions(sessionsToday);
      setTodayPrivate(pvtSessions || []);
      setRecentAttempts(recent || []);
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const statCards = [
    { icon: Users, label: t("My Students", "طلابي"), value: stats.students, color: "text-primary" },
    { icon: UserCheck, label: t("Private Students", "طلاب خاصون"), value: stats.privateStudents, color: "text-secondary" },
    { icon: BookOpen, label: t("My Subjects", "موادي"), value: stats.subjects, color: "text-primary" },
    { icon: Video, label: t("Today's Classes", "حصص اليوم"), value: stats.todayClasses, color: "text-blue-600" },
    { icon: FileText, label: t("Pending Tests", "تمرينات معلقة"), value: stats.pendingTests, color: "text-amber-600" },
    { icon: ClipboardList, label: t("Pending Exams", "امتحانات معلقة"), value: stats.pendingExams, color: "text-red-600" },
  ];

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t("Welcome back", "مرحباً بعودتك")}, {profile?.full_name || t("Teacher", "المعلم")} 👋
        </h1>
        <p className="text-muted-foreground text-sm">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((s, i) => (
          <Card key={i}>
            <CardContent className="p-4 text-center">
              <s.icon className={`h-6 w-6 mx-auto mb-2 ${s.color}`} />
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Today's Schedule */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> {t("Today's Schedule", "جدول اليوم")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {todaySessions.length === 0 && todayPrivate.length === 0 && (
              <p className="text-muted-foreground text-sm">{t("No classes scheduled today", "لا توجد حصص مجدولة اليوم")}</p>
            )}
            {todaySessions.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium text-sm">{s.subjects?.title || "Class"}</p>
                  <p className="text-xs text-muted-foreground">{t("Live Class", "حصة مباشرة")}</p>
                </div>
                <Button size="sm" onClick={() => navigate("/teacher/classes")}>{t("Join", "انضم")}</Button>
              </div>
            ))}
            {todayPrivate.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/10">
                <div>
                  <p className="font-medium text-sm">{(s as any).profiles?.full_name || "Student"}</p>
                  <p className="text-xs text-muted-foreground">{s.start_time} - {s.end_time}</p>
                </div>
                <Badge variant="secondary">{t("Private", "خاصة")}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader><CardTitle>{t("Recent Activity", "النشاط الأخير")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {recentAttempts.length === 0 && <p className="text-muted-foreground text-sm">{t("No recent activity", "لا يوجد نشاط حديث")}</p>}
            {recentAttempts.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium text-sm">{(a as any).profiles?.full_name || "Student"}</p>
                  <p className="text-xs text-muted-foreground">{(a as any).exams?.title} — {Math.round(a.percentage || 0)}%</p>
                </div>
                <Badge variant={a.passed ? "default" : "destructive"} className="text-xs">
                  {a.passed ? t("Pass", "ناجح") : t("Fail", "راسب")}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TeacherDashboard;
