import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, BookOpen, ClipboardList, TrendingUp, GraduationCap,
  Calendar, Video, CheckCircle, XCircle, Eye, Mail, Phone
} from "lucide-react";

const ViewAsStudent = () => {
  const { userId } = useParams<{ userId: string }>();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [stats, setStats] = useState({ enrollments: 0, graded: 0, avg: 0, pending: 0 });

  useEffect(() => {
    if (!userId) return;
    const fetch = async () => {
      const [profileRes, enrollRes, attemptsRes, notifsRes, attendanceRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).single(),
        supabase.from("enrollments").select("*, courses(title, title_ar, subjects(title, title_ar))").eq("user_id", userId),
        supabase.from("exam_attempts").select("*, exams(title, title_ar, type, term)").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
        supabase.from("manual_attendance").select("*, subjects(title, title_ar)").eq("student_id", userId).order("date", { ascending: false }).limit(50),
      ]);

      setProfile(profileRes.data);
      setEnrollments(enrollRes.data || []);
      setAttempts(attemptsRes.data || []);
      setNotifications(notifsRes.data || []);
      setAttendance(attendanceRes.data || []);

      const graded = (attemptsRes.data || []).filter(a => a.status === "graded");
      const avg = graded.length > 0 ? graded.reduce((s, a) => s + (Number(a.percentage) || 0), 0) / graded.length : 0;
      const pending = (attemptsRes.data || []).filter(a => a.status === "submitted").length;
      setStats({ enrollments: enrollRes.data?.length || 0, graded: graded.length, avg: Math.round(avg), pending });
      setLoading(false);
    };
    fetch();
  }, [userId]);

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  if (!profile) return <div className="p-8 text-center text-muted-foreground">{t("Student not found", "لم يتم العثور على الطالب")}</div>;

  const presentCount = attendance.filter(a => a.status === "present" || a.status === "late").length;
  const attendancePct = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : null;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header with read-only banner */}
      <div className="rounded-lg border-2 border-dashed border-secondary/50 bg-secondary/5 p-3 flex items-center gap-3">
        <Eye className="h-5 w-5 text-secondary shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-secondary">{t("View as Student (Read Only)", "عرض كطالب (للقراءة فقط)")}</p>
          <p className="text-xs text-muted-foreground">{t("You are viewing this student's dashboard exactly as they see it", "أنت تشاهد لوحة تحكم هذا الطالب كما يراها")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/admin/students")}>
          <ArrowLeft className="h-3 w-3 me-1" />{t("Back", "رجوع")}
        </Button>
      </div>

      {/* Student Profile Card */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold">
              {(profile.full_name || "?")[0]}
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold flex items-center gap-2 flex-wrap">
                {profile.full_name || "—"}
                <Badge variant="outline" className="text-xs">{profile.level || "beginner"}</Badge>
                <Badge variant={profile.student_type === "private" ? "secondary" : "default"} className="text-xs">
                  {profile.student_type === "private" ? t("Private", "خاص") : t("Group", "مجموعة")}
                </Badge>
                <Badge variant={profile.status === "active" ? "default" : "destructive"} className="text-xs">
                  {profile.status === "active" ? t("Active", "نشط") : t("Inactive", "غير نشط")}
                </Badge>
              </h1>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1 flex-wrap">
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{profile.email || "—"}</span>
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{profile.phone || "—"}</span>
                <span className="flex items-center gap-1"><GraduationCap className="h-3 w-3" />{profile.student_id || "—"}</span>
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{t("Joined", "انضم")}: {profile.enrollment_date || profile.created_at?.split("T")[0]}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { icon: BookOpen, label: t("Enrollments", "التسجيلات"), value: stats.enrollments, color: "text-primary" },
          { icon: ClipboardList, label: t("Graded", "مُصحّحة"), value: stats.graded, color: "text-secondary" },
          { icon: TrendingUp, label: t("Avg Score", "المعدل"), value: `${stats.avg}%`, color: "text-primary" },
          { icon: Calendar, label: t("Attendance", "الحضور"), value: attendancePct !== null ? `${attendancePct}%` : "—", color: attendancePct !== null && attendancePct < 60 ? "text-destructive" : "text-primary" },
          { icon: ClipboardList, label: t("Pending", "بانتظار"), value: stats.pending, color: "text-destructive" },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="p-3 text-center">
              <s.icon className={`h-5 w-5 mx-auto mb-1 ${s.color}`} />
              <div className="text-lg font-bold">{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="subjects">
        <TabsList className="flex-wrap">
          <TabsTrigger value="subjects">{t("Enrolled Subjects", "المواد المسجلة")} ({enrollments.length})</TabsTrigger>
          <TabsTrigger value="exams">{t("Exam Results", "نتائج الامتحانات")} ({attempts.filter(a => (a.exams?.type || "exam") === "exam").length})</TabsTrigger>
          <TabsTrigger value="tests">{t("Test Results", "نتائج التمرينات")} ({attempts.filter(a => a.exams?.type === "test").length})</TabsTrigger>
          <TabsTrigger value="attendance">{t("Attendance", "الحضور")} ({attendance.length})</TabsTrigger>
          <TabsTrigger value="notifications">{t("Notifications", "الإشعارات")} ({notifications.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="subjects" className="mt-4 space-y-2">
          {enrollments.length === 0 && <p className="text-center text-muted-foreground py-6">{t("No enrollments", "لا توجد تسجيلات")}</p>}
          {enrollments.map(e => (
            <Card key={e.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{language === "ar" ? (e.courses as any)?.title_ar || (e.courses as any)?.title : (e.courses as any)?.title}</p>
                  <p className="text-xs text-muted-foreground">{t("Enrolled", "مسجل")}: {new Date(e.enrolled_at).toLocaleDateString()}</p>
                </div>
                <Badge variant="outline">{t("Progress", "التقدم")}: {e.progress || 0}%</Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {["exams", "tests"].map(tab => {
          const typeKey = tab === "tests" ? "test" : "exam";
          const items = attempts.filter(a => (a.exams?.type || "exam") === typeKey);
          return (
            <TabsContent key={tab} value={tab} className="mt-4 space-y-2">
              {items.length === 0 && <p className="text-center text-muted-foreground py-6">{t("No attempts", "لا توجد محاولات")}</p>}
              {items.map(a => (
                <Card key={a.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">{language === "ar" ? a.exams?.title_ar || a.exams?.title : a.exams?.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.exams?.term && <span className="me-2">{t("Term", "الفصل")}: {a.exams.term}</span>}
                        {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.status === "graded" && (
                        <>
                          {a.passed ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                          <span className="font-semibold">{a.score}/{a.total_points} ({Math.round(a.percentage || 0)}%)</span>
                        </>
                      )}
                      <Badge variant={a.status === "graded" ? (a.passed ? "default" : "destructive") : "secondary"} className="text-xs">
                        {a.status === "graded" ? (a.passed ? t("Passed", "ناجح") : t("Failed", "راسب")) : t(a.status, a.status)}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          );
        })}

        <TabsContent value="attendance" className="mt-4 space-y-2">
          {attendance.length === 0 && <p className="text-center text-muted-foreground py-6">{t("No attendance records", "لا توجد سجلات حضور")}</p>}
          {attendance.map(a => (
            <Card key={a.id}>
              <CardContent className="flex items-center justify-between p-3">
                <div>
                  <p className="font-medium text-sm">{language === "ar" ? a.subjects?.title_ar || a.subjects?.title : a.subjects?.title || "—"}</p>
                  <p className="text-xs text-muted-foreground">{new Date(a.date).toLocaleDateString()}</p>
                </div>
                <Badge variant={a.status === "present" ? "default" : a.status === "late" ? "secondary" : "destructive"} className="text-xs">
                  {a.status === "present" ? t("Present", "حاضر") : a.status === "late" ? t("Late", "متأخر") : t("Absent", "غائب")}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="notifications" className="mt-4 space-y-2">
          {notifications.length === 0 && <p className="text-center text-muted-foreground py-6">{t("No notifications", "لا توجد إشعارات")}</p>}
          {notifications.map(n => (
            <Card key={n.id}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.message}</p>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {new Date(n.created_at).toLocaleDateString()}
                    {!n.is_read && <Badge variant="destructive" className="ms-1 text-[9px]">{t("Unread", "غير مقروء")}</Badge>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ViewAsStudent;
