import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Users, ClipboardList, BookOpen, TrendingUp, Plus, Settings } from "lucide-react";

const AdminDashboard = () => {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const [stats, setStats] = useState({ students: 0, exams: 0, courses: 0, attempts: 0 });

  useEffect(() => {
    const fetch = async () => {
      const [studentsRes, examsRes, coursesRes, attemptsRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("exams").select("id", { count: "exact", head: true }),
        supabase.from("courses").select("id", { count: "exact", head: true }),
        supabase.from("exam_attempts").select("id", { count: "exact", head: true }),
      ]);
      setStats({
        students: studentsRes.count || 0,
        exams: examsRes.count || 0,
        courses: coursesRes.count || 0,
        attempts: attemptsRes.count || 0,
      });
    };
    fetch();
  }, []);

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
        {[
          { icon: Users, label: t("Total Students", "إجمالي الطلاب"), value: stats.students, color: "text-primary" },
          { icon: ClipboardList, label: t("Exams", "الامتحانات"), value: stats.exams, color: "text-secondary" },
          { icon: BookOpen, label: t("Courses", "الدورات"), value: stats.courses, color: "text-emerald" },
          { icon: TrendingUp, label: t("Attempts", "المحاولات"), value: stats.attempts, color: "text-gold" },
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

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle>{t("Quick Actions", "إجراءات سريعة")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
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
  );
};

export default AdminDashboard;
