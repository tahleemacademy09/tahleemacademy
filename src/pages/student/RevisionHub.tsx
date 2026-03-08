import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import {
  BookOpen, Flame, Clock, BarChart3, Calendar,
  Layers, FileText, StickyNote, Trophy
} from "lucide-react";
import { format, isToday, differenceInDays, startOfDay } from "date-fns";

const RevisionHub = () => {
  const { t, language } = useLanguage();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  // Get enrolled subjects via level_courses
  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ["revision-subjects", profile?.level],
    enabled: !!user,
    queryFn: async () => {
      const { data: levelCourses } = await supabase.from("level_courses").select("subject_id").eq("level", profile?.level || "beginner");
      if (!levelCourses?.length) {
        // Fallback: get all active subjects
        const { data } = await supabase.from("subjects").select("*").eq("is_active", true);
        return (data || []) as any[];
      }
      const subjectIds = levelCourses.map(lc => lc.subject_id).filter(Boolean);
      if (!subjectIds.length) return [];
      const { data } = await supabase.from("subjects").select("*").in("id", subjectIds as string[]);
      return (data || []) as any[];
    },
  });

  // Get teacher profiles for subjects
  const teacherIds = [...new Set(subjects.map((s: any) => s.teacher_id).filter(Boolean))];
  const { data: teachers = [] } = useQuery({
    queryKey: ["revision-teachers", teacherIds],
    enabled: teacherIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, full_name_ar").in("user_id", teacherIds);
      return (data || []) as any[];
    },
  });

  // Flashcard progress
  const { data: flashcardProgress = [] } = useQuery({
    queryKey: ["revision-fc-progress", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("revision_flashcard_progress" as any).select("*").eq("student_id", user!.id);
      return (data || []) as any[];
    },
  });

  // Quiz sessions
  const { data: quizSessions = [] } = useQuery({
    queryKey: ["revision-quizzes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("revision_quiz_sessions" as any).select("*").eq("student_id", user!.id).order("completed_at", { ascending: false }).limit(20);
      return (data || []) as any[];
    },
  });

  // Revision schedule for today
  const { data: todaySchedule = [] } = useQuery({
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
  const weekQuizzes = quizSessions.filter((q: any) => {
    const d = new Date(q.completed_at);
    return differenceInDays(new Date(), d) <= 7;
  });
  const weekAvg = weekQuizzes.length > 0 ? Math.round(weekQuizzes.reduce((s: number, q: any) => s + Number(q.percentage || 0), 0) / weekQuizzes.length) : 0;

  // Streak calculation (simplified: count consecutive days with quiz or flashcard activity)
  const allDates = [
    ...flashcardProgress.filter((p: any) => p.last_reviewed_at).map((p: any) => startOfDay(new Date(p.last_reviewed_at)).getTime()),
    ...quizSessions.map((q: any) => startOfDay(new Date(q.completed_at)).getTime()),
  ];
  const uniqueDays = [...new Set(allDates)].sort((a, b) => b - a);
  let streak = 0;
  const todayStart = startOfDay(new Date()).getTime();
  for (let i = 0; i < uniqueDays.length; i++) {
    const expected = todayStart - i * 86400000;
    if (uniqueDays[i] === expected) streak++;
    else break;
  }

  const levelColors: Record<string, string> = {
    beginner: "bg-green-100 text-green-800",
    intermediate: "bg-yellow-100 text-yellow-800",
    advanced: "bg-red-100 text-red-800",
  };

  const getTeacher = (teacherId: string) => teachers.find((t: any) => t.user_id === teacherId);

  if (isLoading) return <div className="container mx-auto px-4 py-8"><Skeleton className="h-64" /></div>;

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: language === "ar" ? "'Amiri', serif" : "'Playfair Display', serif", color: '#064E3B' }}>
          {t("Revision Centre", "مركز المراجعة")}
        </h1>
        <p className="text-muted-foreground font-arabic" dir="rtl" style={{ color: '#c9973a' }}>
          المراجعة تثبّت العلم — Review strengthens knowledge
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center">
          <Layers className="h-5 w-5 mx-auto mb-1" style={{ color: '#c9973a' }} />
          <p className="text-2xl font-bold" style={{ color: '#064E3B' }}>{knownToday}</p>
          <p className="text-xs text-muted-foreground">{t("Cards Mastered Today", "بطاقات أُتقنت اليوم")}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <BarChart3 className="h-5 w-5 mx-auto mb-1" style={{ color: '#c9973a' }} />
          <p className="text-2xl font-bold" style={{ color: '#064E3B' }}>{weekAvg}%</p>
          <p className="text-xs text-muted-foreground">{t("Quiz Avg This Week", "معدل الاختبارات هذا الأسبوع")}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Flame className="h-5 w-5 mx-auto mb-1 text-orange-500" />
          <p className="text-2xl font-bold" style={{ color: '#064E3B' }}>{streak}</p>
          <p className="text-xs text-muted-foreground">{t("Day Streak", "أيام متتالية")}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Clock className="h-5 w-5 mx-auto mb-1" style={{ color: '#c9973a' }} />
          <p className="text-2xl font-bold" style={{ color: '#064E3B' }}>{quizSessions.length}</p>
          <p className="text-xs text-muted-foreground">{t("Total Quizzes", "إجمالي الاختبارات")}</p>
        </CardContent></Card>
      </div>

      {/* Streak Badge */}
      {streak >= 3 && (
        <div className="flex items-center justify-center gap-2 py-2">
          <Badge className="bg-orange-100 text-orange-800 text-sm px-3 py-1 gap-1">
            {"🔥".repeat(Math.min(Math.floor(streak / 7) + 1, 3))} {streak} {t("day streak!", "يوم متتالي!")}
            {streak >= 30 ? " سبحان الله" : streak >= 7 ? " ما شاء الله" : ""}
          </Badge>
        </div>
      )}

      {/* Today's Plan */}
      {todaySchedule.length > 0 && (
        <Card style={{ borderColor: '#c9973a', borderWidth: 1 }}>
          <CardContent className="p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2" style={{ color: '#064E3B' }}>
              <Calendar className="h-5 w-5" style={{ color: '#c9973a' }} />
              {t("Today's Revision Plan", "خطة مراجعة اليوم")}
            </h2>
            <div className="space-y-2">
              {todaySchedule.map((item: any) => {
                const subj = subjects.find((s: any) => s.id === item.subject_id);
                return (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div>
                      <p className="text-sm font-medium">{subj ? (language === "ar" ? subj.title_ar || subj.title : subj.title) : ""}</p>
                      <p className="text-xs text-muted-foreground">{item.revision_type} • {item.duration_minutes}m</p>
                    </div>
                    <Button size="sm" onClick={() => subj && navigate(`/student/revision/${subj.id}`)}>
                      {t("Start", "ابدأ")}
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
        <h2 className="text-lg font-semibold mb-4" style={{ color: '#064E3B' }}>
          {t("Your Subjects", "موادك")}
        </h2>
        {subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{t("No subjects enrolled", "لم يتم التسجيل في أي مادة")}</p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjects.map((subj: any) => {
              const teacher = subj.teacher_id ? getTeacher(subj.teacher_id) : null;
              const subjectFlashcards = flashcardProgress.filter((p: any) => {
                // We don't have subject_id on progress directly, so show total for now
                return p.status === "known";
              });
              const subjectQuizzes = quizSessions.filter((q: any) => q.subject_id === subj.id);
              const quizAvg = subjectQuizzes.length > 0 ? Math.round(subjectQuizzes.reduce((s: number, q: any) => s + Number(q.percentage || 0), 0) / subjectQuizzes.length) : 0;

              return (
                <Card key={subj.id} className="hover:shadow-md transition-shadow cursor-pointer group" onClick={() => navigate(`/student/revision/${subj.id}`)}>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
                          {language === "ar" ? subj.title_ar || subj.title : subj.title}
                        </h3>
                        {subj.title_ar && language !== "ar" && <p className="text-xs text-muted-foreground font-arabic" dir="rtl">{subj.title_ar}</p>}
                      </div>
                      {subj.level && <Badge className={levelColors[subj.level] || ""} variant="secondary">{subj.level}</Badge>}
                    </div>
                    {teacher && <p className="text-xs text-muted-foreground">{language === "ar" ? teacher.full_name_ar || teacher.full_name : teacher.full_name}</p>}

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {t("Flashcards", "بطاقات")}</span>
                      <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {t("Summaries", "ملخصات")}</span>
                      {subjectQuizzes.length > 0 && <span>{t("Quiz avg", "معدل")}: {quizAvg}%</span>}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={e => { e.stopPropagation(); navigate(`/student/revision/${subj.id}?tab=flashcards`); }}>
                        🃏 {t("Flashcards", "بطاقات")}
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={e => { e.stopPropagation(); navigate(`/student/revision/${subj.id}?tab=quiz`); }}>
                        📝 {t("Quiz", "اختبار")}
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={e => { e.stopPropagation(); navigate(`/student/revision/${subj.id}?tab=summaries`); }}>
                        📄 {t("Summary", "ملخص")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      {quizSessions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3" style={{ color: '#064E3B' }}>{t("Recent Activity", "النشاط الأخير")}</h2>
          <div className="space-y-2">
            {quizSessions.slice(0, 5).map((q: any) => {
              const subj = subjects.find((s: any) => s.id === q.subject_id);
              return (
                <Card key={q.id}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{subj ? (language === "ar" ? subj.title_ar || subj.title : subj.title) : t("Quiz", "اختبار")}</p>
                      <p className="text-xs text-muted-foreground">{q.source} • {format(new Date(q.completed_at), "MMM d, h:mm a")}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm" style={{ color: Number(q.percentage) >= 70 ? '#059669' : '#DC2626' }}>{q.score}/{q.total}</p>
                      <p className="text-xs text-muted-foreground">{Math.round(q.percentage || 0)}%</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default RevisionHub;
