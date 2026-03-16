import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen, ClipboardList, Bell, TrendingUp, Calendar, CheckCircle, XCircle,
  GraduationCap, MessageCircle, ArrowRight, Video, Star, ChevronLeft, ChevronRight, AlertTriangle, Info
} from "lucide-react";

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
  const [allExamsForCalendar, setAllExamsForCalendar] = useState<any[]>([]);
  const [subjectAssignments, setSubjectAssignments] = useState<any[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const dailyVerse = VERSES[dayOfYear % VERSES.length];
  const hijri = toHijri(new Date());

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [enrollRes, gradedAttemptsRes, pendingAttemptsRes, notifsRes, assignmentsRes, recentRes, allAttemptsRes, subjectsRes, calendarExamsRes, subAssignmentsRes] = await Promise.all([
        supabase.from("enrollments").select("id").eq("user_id", user.id),
        supabase.from("exam_attempts").select("percentage").eq("user_id", user.id).eq("status", "graded"),
        supabase.from("exam_attempts").select("id").eq("user_id", user.id).eq("status", "submitted"),
        supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("exam_assignments").select("exam_id, exams(*)").eq("user_id", user.id),
        supabase.from("exam_attempts").select("*, exams(title, title_ar)").eq("user_id", user.id).in("status", ["graded", "submitted"]).order("submitted_at", { ascending: false }).limit(5),
        supabase.from("exam_attempts").select("exam_id, status, percentage").eq("user_id", user.id),
        supabase.from("subjects").select("*").eq("is_active", true).limit(4),
        supabase.from("exams").select("id, title, title_ar, start_date, end_date, time_limit_minutes").eq("is_published", true),
        supabase.from("subject_assignments").select("id, title, deadline, subject_id, subjects(title, title_ar)"),
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
      setAllExamsForCalendar(calendarExamsRes.data || []);
      setSubjectAssignments(subAssignmentsRes.data || []);
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

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIdx = calendarMonth.getMonth();
  const daysInMonth = new Date(calendarYear, calendarMonthIdx + 1, 0).getDate();
  const firstDayOfWeek = new Date(calendarYear, calendarMonthIdx, 1).getDay();

  const getEventsForDay = (day: number) => {
    const dateStr = `${calendarYear}-${String(calendarMonthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const events: { type: 'exam' | 'assignment'; title: string; color: string }[] = [];
    allExamsForCalendar.forEach(e => {
      if (e.start_date && e.start_date.startsWith(dateStr)) {
        events.push({ type: 'exam', title: e.title_ar || e.title, color: 'bg-destructive' });
      }
    });
    subjectAssignments.forEach(a => {
      if (a.deadline && a.deadline.startsWith(dateStr)) {
        events.push({ type: 'assignment', title: a.title, color: 'bg-secondary' });
      }
    });
    return events;
  };

  const prevMonth = () => setCalendarMonth(new Date(calendarYear, calendarMonthIdx - 1, 1));
  const nextMonth = () => setCalendarMonth(new Date(calendarYear, calendarMonthIdx + 1, 1));

  const notifIcon = (type: string | null) => {
    if (type === 'warning') return <AlertTriangle className="h-3 w-3 text-secondary" />;
    if (type === 'exam') return <ClipboardList className="h-3 w-3 text-destructive" />;
    return <Info className="h-3 w-3 text-primary" />;
  };

  const today = new Date();

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 space-y-5">

      {/* WELCOME MESSAGE */}
      <div className={language === "ar" ? "text-right" : "text-left"}>
        <h1
          className="text-2xl md:text-3xl font-bold"
          style={{
            color: '#1a3a2a',
            fontFamily: language === "ar" ? "'Amiri', serif" : "'Playfair Display', serif",
          }}
          dir={language === "ar" ? "rtl" : "ltr"}
        >
          {language === "ar"
            ? `مرحباً بك يا ${profile?.full_name || "طالب"}! 👋`
            : `Marhaban, ${profile?.full_name || "Student"}! 👋`}
        </h1>
        <p className="text-base mt-1.5 font-medium" style={{ color: '#374151' }}>
          {t("Here's your learning overview", "إليك نظرة عامة على مسارك التعليمي")}
        </p>
      </div>

      {/* HEADER: Greeting + Hijri Pill */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-emerald-mid p-5 md:p-7 text-primary-foreground geometric-pattern">
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-[0.25em] opacity-60">
              بسم الله الرحمن الرحيم
            </p>
            <div className="bg-white/15 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-1.5">
              <Calendar className="h-3 w-3 opacity-70" />
              <span className="text-[11px] font-medium font-arabic" dir="rtl">{hijri.full}</span>
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-2xl md:text-3xl font-bold mb-0.5" dir="rtl" style={{ fontFamily: "'Amiri', serif" }}>
              السلام عليكم
            </h1>
            <p className="text-base md:text-lg opacity-90">
              {profile?.full_name || t("Student", "طالب")}
            </p>
            <p className="text-[11px] opacity-50 mt-1">
              {today.toLocaleDateString(language === "ar" ? "ar-SA" : "en-US", { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="absolute -top-10 -right-10 h-36 w-36 rounded-full bg-white/5" />
        <div className="absolute -bottom-8 -left-8 h-28 w-28 rounded-full bg-white/5" />
      </div>
    </div>

      {/* DAILY QURANIC REFLECTION */}
      <div className="rounded-2xl p-5 md:p-6 text-center shadow-[0_4px_20px_rgba(0,0,0,0.05)]" style={{ background: '#064E3B' }}>
        <div className="flex items-center justify-center gap-2 mb-3">
          <Star className="h-4 w-4" style={{ color: '#D4AF37' }} />
          <p className="text-sm font-medium" style={{ color: '#D4AF37', fontFamily: "'Playfair Display', serif" }}>
            {t("Daily Quranic Reflection", "تأمل قرآني يومي")}
          </p>
          <Star className="h-4 w-4" style={{ color: '#D4AF37' }} />
        </div>
        <div className="my-1 opacity-30">
          <span style={{ color: '#D4AF37' }}>✦ ─────── ✦</span>
        </div>
        <p
          className="text-xl md:text-2xl leading-[2.2] mx-auto max-w-lg my-4 font-arabic"
          dir="rtl"
          style={{ color: '#FFFFFF', fontFamily: "'Amiri', serif", fontSize: '22px', lineHeight: '2' }}
        >
          {dailyVerse.ar}
        </p>
        <div className="my-2 opacity-30">
          <span style={{ color: '#D4AF37' }}>❖</span>
        </div>
        <p className="text-sm italic max-w-md mx-auto mb-1" style={{ color: 'rgba(255,255,255,0.8)' }}>
          "{dailyVerse.en}"
        </p>
        <p className="text-xs font-semibold" style={{ color: '#D4AF37' }}>{dailyVerse.ref}</p>
      </div>

      {/* ACADEMIC SNAPSHOT: CGPA + 4 Stats */}
      <Card className="rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] border-0">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="relative shrink-0">
              <svg width="110" height="110" className="-rotate-90">
                <circle cx="55" cy="55" r="45" stroke="hsl(var(--muted))" strokeWidth="9" fill="none" />
                <circle
                  cx="55" cy="55" r="45"
                  stroke="#D4AF37"
                  strokeWidth="9" fill="none" strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>{stats.cgpa.toFixed(2)}</span>
                <span className="text-[10px] text-muted-foreground font-medium">{t("CGPA", "المعدل")}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1 w-full">
              {[
                { icon: BookOpen, label: t("Enrollments", "التسجيلات"), value: stats.enrollments, color: "text-primary" },
                { icon: ClipboardList, label: t("Graded", "مُصحّحة"), value: stats.attemptsDone, color: "text-secondary" },
                { icon: TrendingUp, label: t("Avg Score", "المعدل"), value: `${stats.avgScore}%`, color: "text-primary" },
                { icon: Bell, label: t("Pending", "بانتظار"), value: stats.pendingGrading, color: "text-destructive" },
              ].map((s, i) => (
                <div key={i} className="text-center rounded-xl bg-muted/40 p-3">
                  <s.icon className={`h-5 w-5 mx-auto mb-1.5 ${s.color}`} />
                  <div className="text-lg font-bold">{s.value}</div>
                  <div className="text-[10px] text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* QUICK ACTIONS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { to: "/student/exams", icon: ClipboardList, label: t("My Exams", "امتحاناتي") },
          { to: "/student/transcripts", icon: GraduationCap, label: t("Transcripts", "السجل") },
          { to: "/student/live-classes", icon: Video, label: t("Live Classes", "الفصول الحية") },
          { to: "/student/majlis", icon: MessageCircle, label: t("Al-Majlis", "المجلس") },
        ].map((link, i) => (
          <Link to={link.to} key={i}>
            <Card className="rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] border-0 hover:scale-[1.05] transition-transform duration-200 cursor-pointer">
              <CardContent className="flex flex-col items-center justify-center gap-2 p-4">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <link.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="text-xs font-medium text-center">{link.label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* NOTIFICATIONS */}
      <Card className="rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] border-0 border-l-4 border-l-secondary">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2" style={{ fontFamily: "'Playfair Display', serif" }}>
            <Bell className="h-4 w-4 text-secondary" />
            {t("Notifications", "الإشعارات")}
            {unreadCount > 0 && <Badge variant="destructive" className="text-[10px]">{unreadCount}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t("No notifications yet", "لا توجد إشعارات بعد")}</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`rounded-xl p-3 flex items-start gap-3 transition-colors cursor-pointer ${n.is_read ? 'bg-muted/20' : 'bg-secondary/10 border border-secondary/20'}`}
                  onClick={() => !n.is_read && markAsRead(n.id)}
                >
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${n.is_read ? 'bg-muted/40' : 'bg-secondary/20'}`}>
                    {notifIcon(n.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`font-medium text-sm ${!n.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>{n.title}</p>
                      {!n.is_read && <div className="h-2 w-2 rounded-full bg-secondary shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(n.created_at).toLocaleDateString(language === "ar" ? "ar-SA" : "en-US", { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ACADEMIC CALENDAR */}
      <Card className="rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] border-0">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2" style={{ fontFamily: "'Playfair Display', serif" }}>
              <Calendar className="h-4 w-4 text-primary" />
              {t("Academic Calendar", "التقويم الأكاديمي")}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center">
                <span className="text-sm font-medium block">
                  {calendarMonth.toLocaleDateString(language === "ar" ? "ar-SA" : "en-US", { month: 'long', year: 'numeric' })}
                </span>
                <span className="text-[10px] text-muted-foreground font-arabic" dir="rtl">
                  {(() => { const h = toHijri(new Date(calendarYear, calendarMonthIdx, 15)); return `${h.month} ${h.year} هـ`; })()}
                </span>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {(language === "ar"
              ? ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"]
              : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
            ).map(d => (
              <div key={d} className="text-[10px] text-muted-foreground text-center font-medium py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="h-12" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const events = getEventsForDay(day);
              const isToday = day === today.getDate() && calendarMonthIdx === today.getMonth() && calendarYear === today.getFullYear();
              const hijriDay = toHijri(new Date(calendarYear, calendarMonthIdx, day));
              return (
                <div
                  key={day}
                  className={`h-12 rounded-lg flex flex-col items-center justify-center relative text-xs transition-colors
                    ${isToday ? 'bg-primary text-primary-foreground font-bold' : 'hover:bg-muted/40'}
                    ${events.length > 0 ? 'font-semibold' : ''}`}
                  title={events.map(e => e.title).join(', ')}
                >
                  <span className="leading-none">{day}</span>
                  <span className={`text-[8px] leading-none mt-0.5 ${isToday ? 'text-primary-foreground/70' : 'text-muted-foreground/60'}`} dir="rtl">
                    {hijriDay.day}
                  </span>
                  {events.length > 0 && (
                    <div className="flex gap-0.5 absolute bottom-0.5">
                      {events.slice(0, 3).map((e, ei) => (
                        <div key={ei} className={`h-1 w-1 rounded-full ${e.color}`} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-2 border-t border-muted">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-destructive" />
              <span className="text-[10px] text-muted-foreground">{t("Exams", "امتحانات")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-secondary" />
              <span className="text-[10px] text-muted-foreground">{t("Assignments", "واجبات")}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ACTION AGENDA */}
      <Card className="rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] border-0">
        <Tabs defaultValue="classes" className="w-full">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm" style={{ fontFamily: "'Playfair Display', serif" }}>
                {t("Agenda", "الأجندة")}
              </CardTitle>
              <TabsList className="h-8 bg-muted/50">
                <TabsTrigger value="classes" className="text-[11px] px-2.5 h-6">{t("Classes", "الفصول")}</TabsTrigger>
                <TabsTrigger value="exams" className="text-[11px] px-2.5 h-6">{t("Exams", "الامتحانات")}</TabsTrigger>
                <TabsTrigger value="results" className="text-[11px] px-2.5 h-6">{t("Results", "النتائج")}</TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <TabsContent value="classes" className="mt-0">
              {liveSubjects.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">{t("No active classes", "لا توجد فصول نشطة")}</p>
              ) : (
                <div className="space-y-2">
                  {liveSubjects.map((s: any) => (
                    <Link to={`/student/subjects/${s.id}`} key={s.id}>
                      <div className="rounded-xl bg-muted/20 p-3 hover:bg-accent/30 transition-colors flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <BookOpen className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{s.title}</p>
                          {s.title_ar && <p className="text-xs text-muted-foreground font-arabic mt-0.5" dir="rtl">{s.title_ar}</p>}
                          {s.next_session_at && (
                            <p className="text-[10px] text-primary mt-0.5 flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {t("Next", "التالي")}: {new Date(s.next_session_at).toLocaleDateString(language === "ar" ? "ar-SA" : "en-US", { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                        {s.level && <Badge variant="secondary" className="text-[9px] shrink-0">{s.level}</Badge>}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              <div className="mt-3 text-center">
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/student/courses" className="text-xs text-primary">
                    {t("View All Subjects", "عرض كل المواد")} <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="exams" className="mt-0">
              {upcomingExams.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">{t("No upcoming exams", "لا توجد امتحانات قادمة")}</p>
              ) : (
                <div className="space-y-2">
                  {upcomingExams.map((exam) => (
                    <div key={exam.id} className="flex items-center justify-between rounded-xl bg-muted/20 p-3">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate" dir="auto">{language === "ar" ? exam.title_ar || exam.title : exam.title}</div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          <Calendar className="h-3 w-3" />
                          {exam.start_date ? new Date(exam.start_date).toLocaleDateString() : t("TBD", "غير محدد")}
                        </div>
                      </div>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">{exam.time_limit_minutes} {t("min", "د")}</Badge>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 text-center">
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/student/exams" className="text-xs text-primary">
                    {t("View All Exams", "عرض كل الامتحانات")} <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="results" className="mt-0">
              {recentResults.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">{t("No results yet", "لا توجد نتائج بعد")}</p>
              ) : (
                <div className="space-y-2">
                  {recentResults.map((attempt) => (
                    <div key={attempt.id} className="flex items-center justify-between rounded-xl bg-muted/20 p-3">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate" dir="auto">
                          {language === "ar" ? attempt.exams?.title_ar || attempt.exams?.title : attempt.exams?.title}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
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
                          <Badge variant="secondary" className="text-[10px]">{t("Awaiting", "بانتظار")}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 text-center">
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/student/transcripts" className="text-xs text-primary">
                    {t("View Transcripts", "عرض السجل")} <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              </div>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
};

export default StudentDashboard;
