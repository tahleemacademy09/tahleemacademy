import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen, ClipboardList, Bell, TrendingUp, Calendar, CheckCircle, XCircle,
  GraduationCap, MessageCircle, ArrowRight, Video, Star
} from "lucide-react";

// Hijri date conversion (simplified Kuwaiti algorithm)
const toHijri = (date: Date) => {
  const jd = Math.floor((date.getTime() / 86400000) + 2440587.5);
  const l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l2 = l - 10631 * n + 354;
  const j = Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) + Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
  const l3 = l2 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const m = Math.floor((24 * l3) / 709);
  const d = l3 - Math.floor((709 * m) / 24);
  const y = 30 * n + j - 30;
  const months = ["محرم", "صفر", "ربيع الأول", "ربيع الثاني", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"];
  return { day: d, month: months[m - 1], year: y, full: `${d} ${months[m - 1]} ${y} هـ` };
};

// Daily Quranic verse rotation
const VERSES = [
  { ar: "إِنَّ مَعَ الْعُسْرِ يُسْرًا", en: "Indeed, with hardship comes ease.", ref: "Quran 94:6" },
  { ar: "وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ", en: "Whoever relies upon Allah, He is sufficient for him.", ref: "Quran 65:3" },
  { ar: "رَبِّ زِدْنِي عِلْمًا", en: "My Lord, increase me in knowledge.", ref: "Quran 20:114" },
  { ar: "وَاصْبِرْ فَإِنَّ اللَّهَ لَا يُضِيعُ أَجْرَ الْمُحْسِنِينَ", en: "Be patient, for Allah does not waste the reward of the righteous.", ref: "Quran 11:115" },
  { ar: "فَاذْكُرُونِي أَذْكُرْكُمْ", en: "Remember Me; I will remember you.", ref: "Quran 2:152" },
  { ar: "وَلَسَوْفَ يُعْطِيكَ رَبُّكَ فَتَرْضَىٰ", en: "And your Lord is going to give you, and you will be satisfied.", ref: "Quran 93:5" },
  { ar: "إِنَّ اللَّهَ مَعَ الصَّابِرِينَ", en: "Indeed, Allah is with the patient.", ref: "Quran 2:153" },
  { ar: "وَقُل رَّبِّ أَدْخِلْنِي مُدْخَلَ صِدْقٍ وَأَخْرِجْنِي مُخْرَجَ صِدْقٍ", en: "My Lord, cause me to enter a sound entrance and exit a sound exit.", ref: "Quran 17:80" },
  { ar: "وَعَسَىٰ أَن تَكْرَهُوا شَيْئًا وَهُوَ خَيْرٌ لَّكُمْ", en: "Perhaps you dislike something which is good for you.", ref: "Quran 2:216" },
  { ar: "إِنَّ اللَّهَ لَا يُغَيِّرُ مَا بِقَوْمٍ حَتَّىٰ يُغَيِّرُوا مَا بِأَنفُسِهِمْ", en: "Allah does not change a people until they change what is within themselves.", ref: "Quran 13:11" },
];

const gradePoint = (pct: number): number => {
  if (pct >= 85) return 4.0;
  if (pct >= 75) return 3.5;
  if (pct >= 65) return 3.0;
  if (pct >= 55) return 2.0;
  if (pct >= 45) return 1.0;
  return 0.0;
};

const StudentDashboard = () => {
  const { t, language } = useLanguage();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ enrollments: 0, attemptsDone: 0, avgScore: 0, pendingGrading: 0, cgpa: 0 });
  const [upcomingExams, setUpcomingExams] = useState<any[]>([]);
  const [recentResults, setRecentResults] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [liveSubjects, setLiveSubjects] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);

  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const dailyVerse = VERSES[dayOfYear % VERSES.length];
  const hijri = toHijri(new Date());

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [enrollRes, gradedAttemptsRes, pendingAttemptsRes, notifsRes, assignmentsRes, recentRes, allAttemptsRes, subjectsRes] = await Promise.all([
        supabase.from("enrollments").select("id").eq("user_id", user.id),
        supabase.from("exam_attempts").select("percentage").eq("user_id", user.id).eq("status", "graded"),
        supabase.from("exam_attempts").select("id").eq("user_id", user.id).eq("status", "submitted"),
        supabase.from("notifications").select("*").eq("user_id", user.id).eq("is_read", false).order("created_at", { ascending: false }).limit(5),
        supabase.from("exam_assignments").select("exam_id, exams(*)").eq("user_id", user.id),
        supabase.from("exam_attempts").select("*, exams(title, title_ar)").eq("user_id", user.id).in("status", ["graded", "submitted"]).order("submitted_at", { ascending: false }).limit(5),
        supabase.from("exam_attempts").select("exam_id, status, percentage").eq("user_id", user.id),
        supabase.from("subjects").select("*").eq("is_active", true).limit(4),
      ]);

      const gradedAttempts = gradedAttemptsRes.data || [];
      const avg = gradedAttempts.length > 0 ? gradedAttempts.reduce((s, a) => s + (Number(a.percentage) || 0), 0) / gradedAttempts.length : 0;

      const totalGP = gradedAttempts.reduce((sum, a) => sum + gradePoint(Number(a.percentage) || 0), 0);
      const cgpa = gradedAttempts.length > 0 ? totalGP / gradedAttempts.length : 0;

      const attemptCounts: Record<string, number> = {};
      (allAttemptsRes.data || []).forEach((a: any) => {
        if (a.status !== "in_progress") attemptCounts[a.exam_id] = (attemptCounts[a.exam_id] || 0) + 1;
      });

      const allAssigned = (assignmentsRes.data || []).map((a: any) => a.exams).filter((e: any) => e && e.is_published);
      const upcoming = allAssigned.filter((e: any) => (attemptCounts[e.id] || 0) < (e.max_attempts || 1));

      setStats({ enrollments: enrollRes.data?.length || 0, attemptsDone: gradedAttempts.length, avgScore: Math.round(avg), pendingGrading: pendingAttemptsRes.data?.length || 0, cgpa });
      setUpcomingExams(upcoming.slice(0, 5));
      setRecentResults(recentRes.data || []);
      setNotifications(notifsRes.data || []);
      setLiveSubjects(subjectsRes.data || []);
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const gaugePercent = (stats.cgpa / 4.0) * 100;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (gaugePercent / 100) * circumference;

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-20 w-full mb-6 rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-2 mb-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const today = new Date();
  const weekDays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const currentDay = today.getDay();

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* ─── Islamic Greeting ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-emerald-mid p-6 md:p-8 text-primary-foreground geometric-pattern">
        <div className="relative z-10 text-center">
          <p className="text-xs uppercase tracking-[0.3em] opacity-70 mb-2">
            بسم الله الرحمن الرحيم
          </p>
          <h1 className="text-3xl md:text-4xl font-bold font-arabic mb-1" dir="rtl" style={{ fontFamily: "'Amiri', serif" }}>
            السلام عليكم
          </h1>
          <h2 className="text-2xl md:text-3xl font-bold font-arabic mb-3" dir="rtl" style={{ fontFamily: "'Amiri', serif" }}>
            مَرْحَبًا
          </h2>
          <div className="ornament-divider mb-3 opacity-50">
            <span className="text-xs">✦</span>
          </div>
          <p className="text-lg md:text-xl opacity-90">
            {profile?.full_name || t("Student", "طالب")}
          </p>
          <div className="mt-3 flex items-center justify-center gap-4 text-xs opacity-70">
            <span>{today.toLocaleDateString(language === "ar" ? "ar-SA" : "en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            <span>•</span>
            <span dir="rtl">{hijri.full}</span>
          </div>
        </div>
        {/* Decorative circles */}
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/5" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5" />
      </div>

      {/* ─── 1. Notifications ─── */}
      {notifications.length > 0 && (
        <Card className="border-secondary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-secondary" />
              {t("Notifications", "الإشعارات")}
              <Badge variant="secondary" className="text-xs">{notifications.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {notifications.map((n) => (
                <div key={n.id} className="rounded-lg border p-3 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
                    <Bell className="h-3.5 w-3.5 text-secondary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── 2. Upcoming Classes ─── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Video className="h-4 w-4 text-primary" />
            {t("Upcoming Classes", "الفصول القادمة")}
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/student/live-classes" className="flex items-center gap-1 text-xs">
              {t("View All", "عرض الكل")} <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {liveSubjects.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t("No active classes", "لا توجد فصول نشطة")}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {liveSubjects.map((s) => (
                <Link to="/student/live-classes" key={s.id}>
                  <div className="rounded-lg border p-3 hover:bg-accent/30 transition-colors flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{s.title}</p>
                      {s.title_ar && <p className="text-xs text-muted-foreground font-arabic" dir="rtl">{s.title_ar}</p>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── 3. Quranic Text Section ─── */}
      <Card className="border-secondary/20 overflow-hidden">
        <div className="bg-gradient-to-r from-primary/5 via-secondary/5 to-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="h-4 w-4 text-secondary" />
              {t("Daily Quranic Reflection", "تأمل قرآني يومي")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-48">
              <div className="text-center py-4 space-y-3">
                <div className="ornament-divider mb-4">
                  <span className="text-secondary text-lg">✦</span>
                </div>
                <p className="text-2xl md:text-3xl font-arabic leading-[2] arabic-exam-text mx-auto max-w-lg" dir="rtl">
                  {dailyVerse.ar}
                </p>
                <div className="ornament-divider my-3">
                  <span className="text-secondary text-xs">❖</span>
                </div>
                <p className="text-sm text-muted-foreground italic max-w-md mx-auto">
                  "{dailyVerse.en}"
                </p>
                <p className="text-xs font-medium text-secondary">{dailyVerse.ref}</p>
              </div>
            </ScrollArea>
          </CardContent>
        </div>
      </Card>

      {/* ─── 4. Hijri Calendar ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            {t("Hijri Calendar", "التقويم الهجري")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {/* Large Hijri date display */}
            <div className="text-center bg-primary/5 rounded-xl p-4 flex-1">
              <p className="text-4xl font-bold text-primary font-arabic">{hijri.day}</p>
              <p className="text-lg font-arabic font-bold text-foreground" dir="rtl">{hijri.month}</p>
              <p className="text-sm text-muted-foreground font-arabic" dir="rtl">{hijri.year} هـ</p>
            </div>
            {/* Week strip */}
            <div className="flex-1">
              <div className="grid grid-cols-7 gap-1 text-center">
                {weekDays.map((day, i) => (
                  <div key={i} className={`rounded-lg p-2 text-xs ${i === currentDay ? "bg-primary text-primary-foreground font-bold" : "bg-muted text-muted-foreground"}`}>
                    <span className="font-arabic text-[10px]">{day.slice(0, 3)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-center">
                <p className="text-xs text-muted-foreground">
                  {today.toLocaleDateString(language === "ar" ? "ar-SA" : "en-US", { month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── 5. Upcoming Exams (Assignments) ─── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">{t("Upcoming Exams", "الامتحانات القادمة")}</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/student/exams" className="flex items-center gap-1 text-xs">
                {t("View All", "عرض الكل")} <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {upcomingExams.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t("No upcoming exams", "لا توجد امتحانات قادمة")}</p>
            ) : (
              <div className="space-y-2">
                {upcomingExams.map((exam) => (
                  <div key={exam.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate" dir="auto">{language === "ar" ? exam.title_ar || exam.title : exam.title}</div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <Calendar className="h-3 w-3" />
                        {exam.start_date ? new Date(exam.start_date).toLocaleDateString() : t("TBD", "غير محدد")}
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-xs">{exam.time_limit_minutes} {t("min", "د")}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Results */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">{t("Recent Results", "النتائج الأخيرة")}</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/student/transcripts" className="flex items-center gap-1 text-xs">
                {t("View All", "عرض الكل")} <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentResults.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t("No results yet", "لا توجد نتائج بعد")}</p>
            ) : (
              <div className="space-y-2">
                {recentResults.map((attempt) => (
                  <div key={attempt.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate" dir="auto">
                        {language === "ar" ? attempt.exams?.title_ar || attempt.exams?.title : attempt.exams?.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleDateString() : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {attempt.status === "graded" ? (
                        <>
                          {attempt.passed ? <CheckCircle className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}
                          <span className="font-semibold text-sm">{Math.round(attempt.percentage || 0)}%</span>
                        </>
                      ) : (
                        <Badge variant="secondary" className="text-xs">{t("Awaiting", "بانتظار")}</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Quick Actions ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("Quick Actions", "إجراءات سريعة")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { to: "/student/exams", icon: ClipboardList, label: t("My Exams", "امتحاناتي"), color: "text-primary" },
              { to: "/student/transcripts", icon: GraduationCap, label: t("Transcripts", "السجل"), color: "text-secondary" },
              { to: "/student/live-classes", icon: Video, label: t("Live Classes", "الفصول الحية"), color: "text-primary" },
              { to: "/student/majlis", icon: MessageCircle, label: t("Al-Majlis", "المجلس"), color: "text-secondary" },
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

      {/* ─── 6. CGPA (LAST) ─── */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative shrink-0">
              <svg width="100" height="100" className="-rotate-90">
                <circle cx="50" cy="50" r="45" stroke="hsl(var(--muted))" strokeWidth="8" fill="none" />
                <circle
                  cx="50" cy="50" r="45"
                  stroke="hsl(var(--primary))"
                  strokeWidth="8" fill="none" strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold">{stats.cgpa.toFixed(2)}</span>
                <span className="text-[10px] text-muted-foreground">{t("CGPA", "المعدل")}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
              {[
                { icon: BookOpen, label: t("Enrollments", "التسجيلات"), value: stats.enrollments, color: "text-primary" },
                { icon: ClipboardList, label: t("Graded", "مُصحّحة"), value: stats.attemptsDone, color: "text-secondary" },
                { icon: TrendingUp, label: t("Avg Score", "المعدل"), value: `${stats.avgScore}%`, color: "text-primary" },
                { icon: Bell, label: t("Pending", "بانتظار"), value: stats.pendingGrading, color: "text-destructive" },
              ].map((s, i) => (
                <div key={i} className="text-center">
                  <s.icon className={`h-5 w-5 mx-auto mb-1 ${s.color}`} />
                  <div className="text-lg font-bold">{s.value}</div>
                  <div className="text-[10px] text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentDashboard;
