import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate, Link } from "react-router-dom";
import {
  BookOpen, Flame, Clock, BarChart3, Calendar,
  Layers, FileText, StickyNote, Trophy, ArrowRight, AlertCircle, CheckCircle2
} from "lucide-react";
import { format, isToday, differenceInDays, startOfDay } from "date-fns";

const RevisionHub = () => {
  const { t, language } = useLanguage();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  // ✅ Use only 'level' since 'course_level' doesn't exist in your DB
  const studentLevel = (profile?.level || "beginner").toLowerCase();
  const isLevelAssigned = !!profile?.level;

  // ✅ Robust subject query with case-insensitive matching & guaranteed fallback
  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ["revision-subjects", studentLevel],
    enabled: !!user,
    queryFn: async () => {
      // 1. Try level_courses mapping (case-insensitive)
      const { data: levelCourses, error: lcErr } = await supabase
        .from("level_courses")
        .select("subject_id, level")
        .ilike("level", studentLevel);

      if (lcErr) console.warn("level_courses fetch warning:", lcErr);

      if (levelCourses && levelCourses.length > 0) {
        const subjectIds = levelCourses.map(lc => lc.subject_id).filter(Boolean);
        if (subjectIds.length > 0) {
          const { data, error } = await supabase
            .from("subjects")
            .select("*")
            .in("id", subjectIds)
            .eq("is_active", true);
          if (data && data.length > 0) return data;
        }
      }
      // 2. Fallback: Show ALL active subjects if mapping is empty/fails
      console.warn(`⚠️ No subjects found for level "${studentLevel}". Showing all active subjects.`);
      const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .eq("is_active", true);
      return (data || []) as any[];
    },
  });

  // Teacher profiles
  const teacherIds = [...new Set(subjects.map((s: any) => s.teacher_id).filter(Boolean))];
  const {  teachers = [] } = useQuery({
    queryKey: ["revision-teachers", teacherIds],
    enabled: teacherIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, full_name_ar").in("user_id", teacherIds);
      return (data || []) as any[];
    },
  });

  // Stats queries
  const {  flashcardProgress = [] } = useQuery({
    queryKey: ["revision-fc-progress", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("revision_flashcard_progress" as any).select("*").eq("student_id", user!.id);
      return (data || []) as any[];
    },
  });

  const {  quizSessions = [] } = useQuery({
    queryKey: ["revision-quizzes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("revision_quiz_sessions" as any).select("*").eq("student_id", user!.id).order("completed_at", { ascending: false }).limit(20);
      return (data || []) as any[];
    },
  });

  const {  todaySchedule = [] } = useQuery({
    queryKey: ["revision-schedule-today", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data } = await supabase.from("revision_schedule" as any).select("*").eq("student_id", user!.id).eq("scheduled_date", today).eq("is_completed", false);
      return (data || []) as any[];
    },
  });
  // Compute stats
  const knownToday = flashcardProgress.filter((p: any) => p.status === "known" && p.last_reviewed_at && isToday(new Date(p.last_reviewed_at))).length;
  const weekQuizzes = quizSessions.filter((q: any) => differenceInDays(new Date(), new Date(q.completed_at)) <= 7);
  const weekAvg = weekQuizzes.length > 0 ? Math.round(weekQuizzes.reduce((s: number, q: any) => s + Number(q.percentage || 0), 0) / weekQuizzes.length) : 0;

  const allDates = [
    ...flashcardProgress.filter((p: any) => p.last_reviewed_at).map((p: any) => startOfDay(new Date(p.last_reviewed_at)).getTime()),
    ...quizSessions.map((q: any) => startOfDay(new Date(q.completed_at)).getTime()),
  ];
  const uniqueDays = [...new Set(allDates)].sort((a, b) => b - a);
  let streak = 0;
  const todayStart = startOfDay(new Date()).getTime();
  for (let i = 0; i < uniqueDays.length; i++) {
    if (uniqueDays[i] === todayStart - i * 86400000) streak++;
    else break;
  }

  const getTeacher = (teacherId: string) => teachers.find((t: any) => t.user_id === teacherId);

  // ── UI States ──
  if (!user) return <div className="container mx-auto px-4 py-8"><Skeleton className="h-64 rounded-2xl" /></div>;
  if (isLoading) return <div className="container mx-auto px-4 py-8"><Skeleton className="h-64 rounded-2xl" /></div>;

  return (
    <div style={{ background: "#FAF6EE", minHeight: "100vh", fontFamily: "'Cairo', sans-serif" }}>
      <div className="container mx-auto px-4 py-6 md:py-8 space-y-8" style={{ maxWidth: 900 }}>
        
        {/* Header */}
        <div className="text-center space-y-2" style={{ background: "linear-gradient(135deg, #064E3B 0%, #075E54 100%)", padding: "28px 20px", borderRadius: 20, color: "#fff", boxShadow: "0 4px 20px rgba(6,78,59,0.15)" }}>
          <h1 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: language === "ar" ? "'Amiri', serif" : "'Playfair Display', serif" }}>
            {t("Revision Centre", "مركز المراجعة")}
          </h1>
          <p className="text-sm md:text-base opacity-80 font-arabic" dir="rtl" style={{ color: "#E8C070", marginTop: 6 }}>
            المراجعة تثبّت العلم — Review strengthens knowledge
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Layers, val: knownToday, label: t("Cards Mastered Today", "بطاقات أُتقنت اليوم"), color: "#064E3B", bg: "#F0FDF4" },
            { icon: BarChart3, val: `${weekAvg}%`, label: t("Quiz Avg This Week", "معدل الاختبارات هذا الأسبوع"), color: "#B45309", bg: "#FFFBEB" },
            { icon: Flame, val: streak, label: t("Day Streak", "أيام متتالية"), color: "#EA580C", bg: "#FFF7ED" },
            { icon: Clock, val: quizSessions.length, label: t("Total Quizzes", "إجمالي الاختبارات"), color: "#064E3B", bg: "#F0FDF4" },
          ].map((s, i) => (
            <Card key={i} className="hover:shadow-lg transition-all duration-200 border-0" style={{ background: s.bg, borderRadius: 16 }}>
              <CardContent className="p-5 text-center">
                <s.icon className="h-6 w-6 mx-auto mb-2" style={{ color: s.color }} />
                <p className="text-2xl font-bold" style={{ color: s.color }}>{s.val}</p>
                <p className="text-xs font-medium mt-1" style={{ color: "#6B7280" }}>{s.label}</p>              </CardContent>
            </Card>
          ))}
        </div>

        {/* Streak Badge */}
        {streak >= 3 && (
          <div className="flex items-center justify-center gap-2 py-1">
            <Badge className="bg-orange-100 text-orange-800 text-sm px-4 py-1.5 gap-1.5 shadow-sm" style={{ borderRadius: 20 }}>
              {"🔥".repeat(Math.min(Math.floor(streak / 7) + 1, 3))} {streak} {t("day streak!", "يوم متتالي!")}
              {streak >= 30 ? " سبحان الله" : streak >= 7 ? " ما شاء الله" : ""}
            </Badge>
          </div>
        )}

        {/* Today's Plan */}
        {todaySchedule.length > 0 && (
          <Card style={{ borderColor: "#E8C070", borderWidth: 1, borderRadius: 16, background: "#fff" }}>
            <CardContent className="p-5 space-y-3">
              <h2 className="font-semibold flex items-center gap-2 text-lg" style={{ color: "#064E3B" }}>
                <Calendar className="h-5 w-5" style={{ color: "#E8C070" }} />
                {t("Today's Revision Plan", "خطة مراجعة اليوم")}
              </h2>
              <div className="space-y-2">
                {todaySchedule.map((item: any) => {
                  const subj = subjects.find((s: any) => s.id === item.subject_id);
                  return (
                    <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-[#FAF6EE] border border-[#E8C070]/20">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "#064E3B" }}>{subj ? (language === "ar" ? subj.title_ar || subj.title : subj.title) : ""}</p>
                        <p className="text-xs text-gray-500">{item.revision_type} • {item.duration_minutes}m</p>
                      </div>
                      <Button size="sm" className="text-xs" style={{ background: "#064E3B", color: "#fff", borderRadius: 10 }} onClick={() => subj && navigate(`/student/revision/${subj.id}`)}>
                        {t("Start", "ابدأ")} <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Subject Cards */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: "#064E3B" }}>
            <BookOpen className="h-5 w-5" style={{ color: "#E8C070" }} />
            {t("Your Subjects", "موادك")}
          </h2>
                    {subjects.length === 0 ? (
            <Card className="border-0" style={{ background: "#fff", borderRadius: 18 }}>
              <CardContent className="p-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">{t("No subjects available", "لا توجد مواد متاحة")}</h3>
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                  {isLevelAssigned 
                    ? t("No subjects are currently mapped to your level. Contact your admin to configure level_courses.", "لا توجد مواد مرتبطة بمستواك حالياً. تواصل مع المشرف لضبط ربط المواد.")
                    : t("Your level hasn't been assigned yet. Please wait for admin approval.", "لم يتم تعيين مستواك بعد. يرجى انتظار موافقة المشرف.")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {subjects.map((subj: any) => {
                const teacher = subj.teacher_id ? getTeacher(subj.teacher_id) : null;
                const subjectQuizzes = quizSessions.filter((q: any) => q.subject_id === subj.id);
                const quizAvg = subjectQuizzes.length > 0 ? Math.round(subjectQuizzes.reduce((s: number, q: any) => s + Number(q.percentage || 0), 0) / subjectQuizzes.length) : 0;

                return (
                  <Card key={subj.id} className="hover:shadow-xl transition-all duration-200 cursor-pointer group border-0" style={{ background: "#fff", borderRadius: 18 }} onClick={() => navigate(`/student/revision/${subj.id}`)}>
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-sm group-hover:text-[#064E3B] transition-colors">
                            {language === "ar" ? subj.title_ar || subj.title : subj.title}
                          </h3>
                          {subj.title_ar && language !== "ar" && <p className="text-xs text-gray-500 font-arabic" dir="rtl">{subj.title_ar}</p>}
                        </div>
                        {subj.level && <Badge variant="secondary" className="text-xs" style={{ background: subj.level === "beginner" ? "#DCFCE7" : subj.level === "intermediate" ? "#FEF3C7" : "#FEE2E2", color: subj.level === "beginner" ? "#166534" : subj.level === "intermediate" ? "#92400E" : "#991B1B" }}>{subj.level}</Badge>}
                      </div>
                      {teacher && <p className="text-xs text-gray-500">{language === "ar" ? teacher.full_name_ar || teacher.full_name : teacher.full_name}</p>}

                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {t("Flashcards", "بطاقات")}</span>
                        <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {t("Summaries", "ملخصات")}</span>
                        {subjectQuizzes.length > 0 && <span className="font-medium">{t("Quiz avg", "معدل")}: {quizAvg}%</span>}
                      </div>

                      <div className="flex gap-2 pt-1">
                        {["flashcards", "quiz", "summaries"].map(tab => (
                          <Button key={tab} size="sm" variant="outline" className="text-xs h-7 gap-1 flex-1" style={{ borderRadius: 8, borderColor: "#E5E7EB" }} onClick={e => { e.stopPropagation(); navigate(`/student/revision/${subj.id}?tab=${tab}`); }}>
                            {tab === "flashcards" ? "🃏" : tab === "quiz" ? "📝" : "📄"} {t(tab.charAt(0).toUpperCase() + tab.slice(1), tab === "flashcards" ? "بطاقات" : tab === "quiz" ? "اختبار" : "ملخص")}
                          </Button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}            </div>
          )}
        </div>

        {/* Recent Activity */}
        {quizSessions.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2" style={{ color: "#064E3B" }}>
              <Trophy className="h-5 w-5" style={{ color: "#E8C070" }} />
              {t("Recent Activity", "النشاط الأخير")}
            </h2>
            <div className="space-y-2">
              {quizSessions.slice(0, 5).map((q: any) => {
                const subj = subjects.find((s: any) => s.id === q.subject_id);
                return (
                  <Card key={q.id} className="border-0" style={{ background: "#fff", borderRadius: 14 }}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "#064E3B" }}>{subj ? (language === "ar" ? subj.title_ar || subj.title : subj.title) : t("Quiz", "اختبار")}</p>
                        <p className="text-xs text-gray-500">{q.source} • {format(new Date(q.completed_at), "MMM d, h:mm a")}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm" style={{ color: Number(q.percentage) >= 70 ? "#059669" : "#DC2626" }}>{q.score}/{q.total}</p>
                        <p className="text-xs text-gray-500">{Math.round(q.percentage || 0)}%</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RevisionHub;