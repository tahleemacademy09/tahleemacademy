import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, ClipboardList, Bell, TrendingUp, Calendar } from "lucide-react";

const StudentDashboard = () => {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({ enrollments: 0, attemptsDone: 0, avgScore: 0 });
  const [upcomingExams, setUpcomingExams] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      // Fetch assigned exams (upcoming) instead of all published exams
      const [enrollRes, attemptsRes, notifsRes, assignmentsRes] = await Promise.all([
        supabase.from("enrollments").select("id").eq("user_id", user.id),
        supabase.from("exam_attempts").select("percentage").eq("user_id", user.id).eq("status", "graded"),
        supabase.from("notifications").select("*").eq("user_id", user.id).eq("is_read", false).order("created_at", { ascending: false }).limit(5),
        supabase.from("exam_assignments").select("exam_id, exams(*)").eq("user_id", user.id),
      ]);
      
      const attempts = attemptsRes.data || [];
      const avg = attempts.length > 0 ? attempts.reduce((s, a) => s + (Number(a.percentage) || 0), 0) / attempts.length : 0;

      // Filter to upcoming published exams from assignments
      const now = new Date();
      const assignedExams = (assignmentsRes.data || [])
        .map((a: any) => a.exams)
        .filter((e: any) => e && e.is_published && (!e.end_date || new Date(e.end_date) >= now));

      setStats({ enrollments: enrollRes.data?.length || 0, attemptsDone: attempts.length, avgScore: Math.round(avg) });
      setUpcomingExams(assignedExams.slice(0, 5));
      setNotifications(notifsRes.data || []);
    };
    fetchData();
  }, [user]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          {t("Welcome back", "مرحبًا بعودتك")}, {profile?.full_name || t("Student", "طالب")}! 👋
        </h1>
        <p className="text-muted-foreground">{t("Here's your learning overview", "إليك نظرة عامة على تعلّمك")}</p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-4 md:grid-cols-4">
        {[
          { icon: BookOpen, label: t("Enrollments", "التسجيلات"), value: stats.enrollments, color: "text-primary" },
          { icon: ClipboardList, label: t("Exams Taken", "الامتحانات"), value: stats.attemptsDone, color: "text-secondary" },
          { icon: TrendingUp, label: t("Avg Score", "المعدل"), value: `${stats.avgScore}%`, color: "text-emerald" },
          { icon: Bell, label: t("Unread", "غير مقروءة"), value: notifications.length, color: "text-destructive" },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-4 p-5">
              <s.icon className={`h-8 w-8 ${s.color}`} />
              <div>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming Exams */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t("Upcoming Exams", "الامتحانات القادمة")}</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/student/exams">{t("View All", "عرض الكل")}</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {upcomingExams.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("No upcoming exams", "لا توجد امتحانات قادمة")}</p>
            ) : (
              <div className="space-y-3">
                {upcomingExams.map((exam) => (
                  <div key={exam.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="font-medium text-sm">{exam.title}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {exam.start_date ? new Date(exam.start_date).toLocaleDateString() : t("TBD", "غير محدد")}
                      </div>
                    </div>
                    <Badge variant="secondary">{exam.time_limit_minutes} {t("min", "دقيقة")}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("Notifications", "الإشعارات")}</CardTitle>
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("No new notifications", "لا توجد إشعارات جديدة")}</p>
            ) : (
              <div className="space-y-3">
                {notifications.map((n) => (
                  <div key={n.id} className="rounded-lg border p-3">
                    <div className="font-medium text-sm">{n.title}</div>
                    <div className="text-xs text-muted-foreground">{n.message}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StudentDashboard;
