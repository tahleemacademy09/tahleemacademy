import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Users, ClipboardList, BookOpen, TrendingUp, Plus, AlertTriangle,
  CheckSquare, BarChart, Shield, Activity, ArrowRight, UserCheck
} from "lucide-react";

const AdminDashboard = () => {
  const { t, language } = useLanguage();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    students: 0, exams: 0, courses: 0, attempts: 0, pendingGrading: 0,
    activeExams: 0, activeStudents: 0, violations: 0, privateStudents: 0, privateSessions: 0,
  });
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [privateStudentsList, setPrivateStudentsList] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      const [studentsRes, examsRes, coursesRes, attemptsRes, pendingRes, recentRes, profilesRes, activeRes, violationsRes, activityRes, privateStudentsRes, privateSessionsRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("exams").select("id", { count: "exact", head: true }),
        supabase.from("courses").select("id", { count: "exact", head: true }),
        supabase.from("exam_attempts").select("id", { count: "exact", head: true }),
        supabase.from("exam_attempts").select("id", { count: "exact", head: true }).eq("status", "submitted"),
        supabase.from("exam_attempts").select("*, exams(title, title_ar)").eq("status", "submitted").order("submitted_at", { ascending: false }).limit(5),
        supabase.from("profiles").select("user_id, full_name, email"),
        supabase.from("exam_attempts").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
        supabase.from("violations").select("id", { count: "exact", head: true }),
        supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(8),
        supabase.from("profiles").select("user_id, full_name, email, assigned_teacher_id, private_session_rate").eq("student_type", "private"),
        supabase.from("private_sessions").select("id", { count: "exact", head: true }),
      ]);

      const profiles = profilesRes.data || [];
      const merged = (recentRes.data || []).map((a: any) => ({
        ...a,
        profiles: profiles.find((p) => p.user_id === a.user_id) || {},
      }));

      // Map teacher names for private students
      const pvtStudents = (privateStudentsRes.data || []).map((s: any) => ({
        ...s,
        teacher_name: profiles.find(p => p.user_id === s.assigned_teacher_id)?.full_name || "—",
      }));

      setStats({
        students: studentsRes.count || 0,
        exams: examsRes.count || 0,
        courses: coursesRes.count || 0,
        attempts: attemptsRes.count || 0,
        pendingGrading: pendingRes.count || 0,
        activeExams: activeRes.count || 0,
        activeStudents: activeRes.count || 0,
        violations: violationsRes.count || 0,
        privateStudents: privateStudentsRes.data?.length || 0,
        privateSessions: privateSessionsRes.count || 0,
      });
      setRecentSubmissions(merged);
      setRecentActivity(activityRes.data || []);
      setPrivateStudentsList(pvtStudents);
      setLoading(false);
    };
    fetchStats();

    // Realtime subscription for live updates
    const channel = supabase
      .channel("admin-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "exam_attempts" }, () => {
        fetchStats();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "violations" }, () => {
        fetchStats();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const statCards = [
    { icon: Users, label: t("Students", "الطلاب"), value: stats.students, color: "text-primary", to: "/admin/students" },
    { icon: ClipboardList, label: t("Exams", "الامتحانات"), value: stats.exams, color: "text-secondary", to: "/admin/exams" },
    { icon: BookOpen, label: t("Courses", "الدورات"), value: stats.courses, color: "text-primary", to: "/admin/exams" },
    { icon: TrendingUp, label: t("Attempts", "المحاولات"), value: stats.attempts, color: "text-secondary", to: "/admin/grading" },
  ];

  const liveCards = [
    { icon: Activity, label: t("Active Exams", "امتحانات نشطة"), value: stats.activeExams, color: "text-primary" },
    { icon: Shield, label: t("Violations", "المخالفات"), value: stats.violations, color: "text-destructive" },
    { icon: AlertTriangle, label: t("Pending Grading", "بانتظار التصحيح"), value: stats.pendingGrading, color: "text-secondary" },
  ];

  return (
    <div className="container mx-auto px-4 py-6 md:py-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold font-display">{t("Admin Dashboard", "لوحة تحكم المدير")}</h1>
        <p className="text-muted-foreground text-sm">{t("Welcome back", "مرحبًا بعودتك")}, {profile?.full_name || t("Admin", "المدير")}</p>
      </div>

      {/* Main Stats */}
      <div className="mb-6 grid gap-3 grid-cols-2 md:grid-cols-4">
        {statCards.map((s, i) => (
          <Link key={i} to={s.to}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="flex items-center gap-3 p-4">
                <s.icon className={`h-7 w-7 ${s.color} shrink-0`} />
                <div>
                  <div className="text-2xl font-bold">{s.value}</div>
                  <div className="text-[10px] text-muted-foreground">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Live Monitor Strip */}
      <div className="mb-6 grid gap-3 grid-cols-3">
        {liveCards.map((s, i) => (
          <Card key={i} className="border-dashed">
            <CardContent className="flex items-center gap-2 p-3">
              <s.icon className={`h-5 w-5 ${s.color} shrink-0`} />
              <div>
                <div className="text-lg font-bold">{s.value}</div>
                <div className="text-[10px] text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pending Grading Alert */}
      {stats.pendingGrading > 0 && (
        <Card className="mb-6 border-secondary/50 bg-secondary/5">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-secondary shrink-0" />
              <div>
                <p className="font-semibold text-sm">{stats.pendingGrading} {t("exams awaiting grading", "امتحانات بانتظار التصحيح")}</p>
                <p className="text-xs text-muted-foreground">{t("Students are waiting for their results", "الطلاب ينتظرون نتائجهم")}</p>
              </div>
            </div>
            <Button size="sm" asChild>
              <Link to="/admin/grading">{t("Grade Now", "صحّح الآن")}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Private Students Overview */}
      {privateStudentsList.length > 0 && (
        <Card className="mb-6 border-[#D4AF37]/30 bg-[#D4AF37]/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-[#D4AF37]" />
              {t("Private Students Overview", "نظرة على الطلاب الخصوصيين")}
              <Badge className="bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/30 text-xs">{stats.privateStudents}</Badge>
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/private-sessions" className="flex items-center gap-1 text-xs">
                {t("Sessions", "الجلسات")} ({stats.privateSessions})
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {privateStudentsList.map(s => (
                <div key={s.user_id} className="flex items-center justify-between rounded-lg border p-2.5 bg-background">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{s.full_name || s.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("Teacher", "المعلم")}: {s.teacher_name}
                      {s.private_session_rate && <span className="ms-2">• {s.private_session_rate}</span>}
                    </div>
                  </div>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30 shrink-0">Private</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Submissions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">{t("Recent Submissions", "التقديمات الأخيرة")}</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/grading" className="flex items-center gap-1 text-xs">
                {t("View All", "عرض الكل")}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentSubmissions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t("No pending submissions", "لا توجد تقديمات معلّقة")}</p>
            ) : (
              <div className="space-y-2">
                {recentSubmissions.map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate" dir="auto">
                        {language === "ar" ? sub.exams?.title_ar || sub.exams?.title : sub.exams?.title}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {sub.profiles?.full_name || sub.profiles?.email || "Unknown"} • {sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : ""}
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-xs">{t("Needs Grading", "يحتاج تصحيح")}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("Quick Actions", "إجراءات سريعة")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 grid-cols-2">
              {[
                { to: "/admin/exams/create", icon: Plus, label: t("Create Exam", "إنشاء امتحان"), color: "text-primary" },
                { to: "/admin/exams", icon: ClipboardList, label: t("Manage Exams", "إدارة الامتحانات"), color: "text-secondary" },
                { to: "/admin/students", icon: Users, label: t("Students", "الطلاب"), color: "text-primary" },
                { to: "/admin/grading", icon: CheckSquare, label: t("Grading", "التصحيح"), color: "text-secondary" },
                { to: "/admin/proctoring", icon: BarChart, label: t("Proctoring", "المراقبة"), color: "text-primary" },
                { to: "/admin/question-bank", icon: BookOpen, label: t("Questions", "الأسئلة"), color: "text-secondary" },
              ].map((link, i) => (
                <Button key={i} variant="outline" className="h-auto flex-col gap-1.5 p-3" asChild>
                  <Link to={link.to}>
                    <link.icon className={`h-5 w-5 ${link.color}`} />
                    <span className="text-xs">{link.label}</span>
                  </Link>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Activity Feed */}
        {recentActivity.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                {t("Recent Activity", "النشاط الأخير")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentActivity.map((log) => (
                  <div key={log.id} className="flex items-center gap-3 text-sm rounded-lg border p-2.5">
                    <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{log.action}</span>
                      {log.entity_type && <span className="text-muted-foreground ms-1">({log.entity_type})</span>}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
