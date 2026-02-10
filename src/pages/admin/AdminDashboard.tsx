import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Users, ClipboardList, BookOpen, TrendingUp, Plus, Settings, AlertTriangle } from "lucide-react";

const AdminDashboard = () => {
  const { t, language } = useLanguage();
  const { profile } = useAuth();
  const [stats, setStats] = useState({ students: 0, exams: 0, courses: 0, attempts: 0, pendingGrading: 0 });
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      const [studentsRes, examsRes, coursesRes, attemptsRes, pendingRes, recentRes, profilesRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("exams").select("id", { count: "exact", head: true }),
        supabase.from("courses").select("id", { count: "exact", head: true }),
        supabase.from("exam_attempts").select("id", { count: "exact", head: true }),
        supabase.from("exam_attempts").select("id", { count: "exact", head: true }).eq("status", "submitted"),
        supabase.from("exam_attempts").select("*, exams(title, title_ar)").eq("status", "submitted").order("submitted_at", { ascending: false }).limit(5),
        supabase.from("profiles").select("user_id, full_name, email"),
      ]);

      const profiles = profilesRes.data || [];
      const merged = (recentRes.data || []).map((a: any) => ({
        ...a,
        profiles: profiles.find((p) => p.user_id === a.user_id) || {},
      }));

      setStats({
        students: studentsRes.count || 0,
        exams: examsRes.count || 0,
        courses: coursesRes.count || 0,
        attempts: attemptsRes.count || 0,
        pendingGrading: pendingRes.count || 0,
      });
      setRecentSubmissions(merged);
    };
    fetchStats();
  }, []);

  const statCards = [
    { icon: Users, label: t("Total Students", "إجمالي الطلاب"), value: stats.students, color: "text-primary", to: "/admin/students" },
    { icon: ClipboardList, label: t("Exams", "الامتحانات"), value: stats.exams, color: "text-secondary", to: "/admin/exams" },
    { icon: BookOpen, label: t("Courses", "الدورات"), value: stats.courses, color: "text-emerald", to: "/admin/courses" },
    { icon: TrendingUp, label: t("Total Attempts", "المحاولات"), value: stats.attempts, color: "text-gold", to: "/admin/grading" },
  ];

  const quickLinks = [
    { to: "/admin/exams/create", icon: Plus, label: t("Create Exam", "إنشاء امتحان"), color: "text-primary" },
    { to: "/admin/exams", icon: ClipboardList, label: t("Manage Exams", "إدارة الامتحانات"), color: "text-secondary" },
    { to: "/admin/students", icon: Users, label: t("Students", "الطلاب"), color: "text-emerald" },
    { to: "/admin/grading", icon: Settings, label: t("Grading", "التصحيح"), color: "text-gold" },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t("Admin Dashboard", "لوحة تحكم المدير")}</h1>
        <p className="text-muted-foreground">{t("Welcome back", "مرحبًا بعودتك")}, {profile?.full_name || t("Admin", "المدير")}</p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-4 md:grid-cols-4">
        {statCards.map((s, i) => (
          <Link key={i} to={s.to}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="flex items-center gap-4 p-5">
                <s.icon className={`h-8 w-8 ${s.color}`} />
                <div>
                  <div className="text-2xl font-bold">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Pending Grading Alert */}
      {stats.pendingGrading > 0 && (
        <Card className="mb-6 border-secondary/50 bg-secondary/5">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-secondary" />
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

      {/* Recent Submissions + Quick Actions */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Submissions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t("Recent Submissions", "التقديمات الأخيرة")}</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/grading">{t("View All", "عرض الكل")}</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentSubmissions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("No pending submissions", "لا توجد تقديمات معلّقة")}</p>
            ) : (
              <div className="space-y-3">
                {recentSubmissions.map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="font-medium text-sm">
                        {language === "ar" ? sub.exams?.title_ar || sub.exams?.title : sub.exams?.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {sub.profiles?.full_name || sub.profiles?.email || "Unknown"} • {sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : ""}
                      </div>
                    </div>
                    <Badge variant="secondary">{t("Needs Grading", "يحتاج تصحيح")}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("Quick Actions", "إجراءات سريعة")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {quickLinks.map((link, i) => (
                <Button key={i} variant="outline" className="h-auto flex-col gap-2 p-4" asChild>
                  <Link to={link.to}>
                    <link.icon className={`h-6 w-6 ${link.color}`} />
                    <span className="text-sm">{link.label}</span>
                  </Link>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
