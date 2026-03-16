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
  const months = ["\u0645\u062d\u0631\u0645", "\u0635\u0641\u0631", "\u0631\u0628\u064a\u0639 \u0627\u0644\u0623\u0648\u0644", "\u0631\u0628\u064a\u0639 \u0627\u0644\u062b\u0627\u0646\u064a", "\u062c\u0645\u0627\u062f\u0649 \u0627\u0644\u0623\u0648\u0644\u0649", "\u062c\u0645\u0627\u062f\u0649 \u0627\u0644\u0622\u062e\u0631\u0629", "\u0631\u062c\u0628", "\u0634\u0639\u0628\u0627\u0646", "\u0631\u0645\u0636\u0627\u0646", "\u0634\u0648\u0627\u0644", "\u0630\u0648 \u0627\u0644\u0642\u0639\u062f\u0629", "\u0630\u0648 \u0627\u0644\u062d\u062c\u0629"];
  return { day: d, month: months[m - 1], year: y, full: `${d} ${months[m - 1]} ${y} \u0647\u0640` };
};

const VERSES = [
  { ar: "\u0625\u0650\u0646\u064e\u0651 \u0645\u064e\u0639\u064e \u0627\u0644\u0652\u0639\u064f\u0633\u0652\u0631\u0650 \u064a\u064f\u0633\u0652\u0631\u064b\u0627", en: "Indeed, with hardship comes ease.", ref: "Quran 94:6" },
  { ar: "\u0648\u064e\u0645\u064e\u0646 \u064a\u064e\u062a\u064e\u0648\u064e\u0643\u064e\u0651\u0644\u0652 \u0639\u064e\u0644\u064e\u0649 \u0627\u0644\u0644\u064e\u0651\u0647\u0650 \u0641\u064e\u0647\u064f\u0648\u064e \u062d\u064e\u0633\u0652\u0628\u064f\u0647\u064f", en: "Whoever relies upon Allah, He is sufficient for him.", ref: "Quran 65:3" },
  { ar: "\u0631\u064e\u0628\u0650\u0651 \u0632\u0650\u062f\u0652\u0646\u0650\u064a \u0639\u0650\u0644\u0652\u0645\u064b\u0627", en: "My Lord, increase me in knowledge.", ref: "Quran 20:114" },
  { ar: "\u0648\u064e\u0627\u0635\u0652\u0628\u0650\u0631\u0652 \u0641\u064e\u0625\u0650\u0646\u064e\u0651 \u0627\u0644\u0644\u064e\u0651\u0647\u064e \u0644\u064e\u0627 \u064a\u064f\u0636\u0650\u064a\u0639\u064f \u0623\u064e\u062c\u0652\u0631\u064e \u0627\u0644\u0652\u0645\u064f\u062d\u0652\u0633\u0650\u0646\u0650\u064a\u0646\u064e", en: "Be patient, for Allah does not waste the reward of the righteous.", ref: "Quran 11:115" },
  { ar: "\u0641\u064e\u0627\u0630\u0652\u0643\u064f\u0631\u064f\u0648\u0646\u0650\u064a \u0623\u064e\u0630\u0652\u0643\u064f\u0631\u0652\u0643\u064f\u0645\u0652", en: "Remember Me; I will remember you.", ref: "Quran 2:152" },
  { ar: "\u0648\u064e\u0644\u064e\u0633\u064e\u0648\u0652\u0641\u064e \u064a\u064f\u0639\u0652\u0637\u0650\u064a\u0643\u064e \u0631\u064e\u0628\u064f\u0651\u0643\u064e \u0641\u064e\u062a\u064e\u0631\u0652\u0636\u064e\u0649\u0670", en: "And your Lord is going to give you, and you will be satisfied.", ref: "Quran 93:5" },
  { ar: "\u0625\u0650\u0646\u064e\u0651 \u0627\u0644\u0644\u064e\u0651\u0647\u064e \u0645\u064e\u0639\u064e \u0627\u0644\u0635\u064e\u0651\u0627\u0628\u0650\u0631\u0650\u064a\u0646\u064e", en: "Indeed, Allah is with the patient.", ref: "Quran 2:153" },
  { ar: "\u0648\u064e\u0642\u064f\u0644 \u0631\u064e\u0651\u0628\u0650\u0651 \u0623\u064e\u062f\u0652\u062e\u0650\u0644\u0652\u0646\u0650\u064a \u0645\u064f\u062f\u0652\u062e\u064e\u0644\u064e \u0635\u0650\u062f\u0652\u0642\u064d \u0648\u064e\u0623\u064e\u062e\u0652\u0631\u0650\u062c\u0652\u0646\u0650\u064a \u0645\u064f\u062e\u0652\u0631\u064e\u062c\u064e \u0635\u0650\u062f\u0652\u0642\u064d", en: "My Lord, cause me to enter a sound entrance and exit a sound exit.", ref: "Quran 17:80" },
  { ar: "\u0648\u064e\u0639\u064e\u0633\u064e\u0649\u0670 \u0623\u064e\u0646 \u062a\u064e\u0643\u0652\u0631\u064e\u0647\u064f\u0648\u0627 \u0634\u064e\u064a\u0652\u0626\u064b\u0627 \u0648\u064e\u0647\u064f\u0648\u064e \u062e\u064e\u064a\u0652\u0631\u064c \u0644\u064e\u0651\u0643\u064f\u0645\u0652", en: "Perhaps you dislike something which is good for you.", ref: "Quran 2:216" },
  { ar: "\u0625\u0650\u0646\u064e\u0651 \u0627\u0644\u0644\u064e\u0651\u0647\u064e \u0644\u064e\u0627 \u064a\u064f\u063a\u064e\u064a\u0650\u0651\u0631\u064f \u0645\u064e\u0627 \u0628\u0650\u0642\u064e\u0648\u0652\u0645\u064d \u062d\u064e\u062a\u064e\u0651\u0649\u0670 \u064a\u064f\u063a\u064e\u064a\u0650\u0651\u0631\u064f\u0648\u0627 \u0645\u064e\u0627 \u0628\u0650\u0623\u064e\u0646\u0641\u064f\u0633\u0650\u0647\u0650\u0645\u0652", en: "Allah does not change a people until they change what is within themselves.", ref: "Quran 13:11" },
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
            ? `\u0645\u0631\u062d\u0628\u0627\u064b \u0628\u0643 \u064a\u0627 ${profile?.full_name || "\u0637\u0627\u0644\u0628"}! \ud83d\udc4b`
            : `Marhaban, ${profile?.full_name || "Student"}! \ud83d\udc4b`}
        </h1>
        <p className="text-base mt-1.5 font-medium" style={{ color: '#374151' }}>
          {t("Here's your learning overview", "\u0625\u0644\u064a\u0643 \u0646\u0638\u0631\u0629 \u0639\u0627\u0645\u0629 \u0639\u0644\u0649 \u0645\u0633\u0627\u0631\u0643 \u0627\u0644\u062a\u0639\u0644\u064a\u0645\u064a")}
        </p>
      </div>

      {/* HEADER: Greeting + Hijri Pill */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-emerald-mid p-5 md:p-7 text-primary-foreground geometric-pattern">
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-[0.25em] opacity-60">
              \u0628\u0633\u0645 \u0627\u0644\u0644\u0647 \u0627\u0644\u0631\u062d\u0645\u0646 \u0627\u0644\u0631\u062d\u064a\u0645
            </p>
            <div className="bg-white/15 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-1.5">
              <Calendar className="h-3 w-3 opacity-70" />
              <span className="text-[11px] font-medium font-arabic" dir="rtl">{hijri.full}</span>
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-2xl md:text-3xl font-bold mb-0.5" dir="rtl" style={{ fontFamily: "'Amiri', serif" }}>
              \u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u064a\u0643\u0645
            </h1>
            <p className="text-base md:text-lg opacity-90">
              {profile?.full_name || t("Student", "\u0637\u0627\u0644\u0628")}
            </p>
            <p className="text-[11px] opacity-50 mt-1">
              {today.toLocaleDateString(language === "ar" ? "ar-SA" : "en-US", { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="absolute -top-10 -right-10 h-36 w-36 rounded-full bg-white/5" />
