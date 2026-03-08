import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Lock, Play, ArrowRight, Layers, BookMarked, Moon, Scale } from "lucide-react";

const SUBJECT_ICONS: Record<string, any> = {
  BookOpen, Layers, BookMarked, Moon, Scale,
};

const SUBJECT_EMOJIS: Record<string, string> = {
  "Arabic Language": "📖",
  "Quran": "🕌",
  "Islamic Studies": "☪️",
  "Fiqh & Aqeedah": "📚",
};

const StudentCourses = () => {
  const { t, language } = useLanguage();
  const { user, profile } = useAuth();
  const studentLevel = profile?.level || "beginner";

  const { data: subjects, isLoading: loadingSubjects } = useQuery({
    queryKey: ["subjects-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("*").eq("is_active", true).order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: courses, isLoading: loadingCourses } = useQuery({
    queryKey: ["all-courses-published"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*").eq("is_published", true).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: lessons } = useQuery({
    queryKey: ["all-lessons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lessons").select("id, course_id").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: progress } = useQuery({
    queryKey: ["my-progress", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("lesson_progress").select("lesson_id, completed").eq("user_id", user!.id).eq("completed", true);
      if (error) throw error;
      return data;
    },
  });

  const isLoading = loadingSubjects || loadingCourses;
  const completedLessonIds = new Set((progress || []).map((p: any) => p.lesson_id));

  const getLessonCount = (courseId: string) => (lessons || []).filter((l: any) => l.course_id === courseId).length;
  const getCompletedCount = (courseId: string) => {
    const courseLessons = (lessons || []).filter((l: any) => l.course_id === courseId);
    return courseLessons.filter((l: any) => completedLessonIds.has(l.id)).length;
  };
  const getProgressPercent = (courseId: string) => {
    const total = getLessonCount(courseId);
    if (total === 0) return 0;
    return Math.round((getCompletedCount(courseId) / total) * 100);
  };

  const levelLabel = (level: string) => {
    const labels: Record<string, [string, string]> = {
      beginner: ["Beginner", "مبتدئ"],
      intermediate: ["Intermediate", "متوسط"],
      advanced: ["Advanced", "متقدم"],
    };
    const [en, ar] = labels[level] || [level, level];
    return t(en, ar);
  };

  const levelColor = (level: string) => {
    if (level === "beginner") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
    if (level === "intermediate") return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        {[1, 2, 3].map(i => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2].map(j => <Skeleton key={j} className="h-48 rounded-xl" />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: language === "ar" ? "'Amiri', serif" : "'Playfair Display', serif", color: '#064E3B' }}>
          {t("My Courses", "دوراتي")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t(`Your level: ${levelLabel(studentLevel)}`, `مستواك: ${levelLabel(studentLevel)}`)}
        </p>
      </div>

      {/* Courses grouped by subject */}
      {(subjects || []).map((subject: any) => {
        const subjectCourses = (courses || []).filter((c: any) => c.subject_id === subject.id);
        if (subjectCourses.length === 0) return null;

        const emoji = SUBJECT_EMOJIS[subject.title] || "📖";

        return (
          <div key={subject.id} className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">{emoji}</span>
              <h2 className="text-lg font-bold" style={{ fontFamily: language === "ar" ? "'Amiri', serif" : "'Playfair Display', serif" }}>
                {language === "ar" ? subject.title_ar || subject.title : subject.title}
              </h2>
              <Link to={`/student/subjects/${subject.id}`}>
                <Button variant="ghost" size="sm" className="text-xs">
                  {t("View All", "عرض الكل")} <ArrowRight className="h-3 w-3 ms-1" />
                </Button>
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {subjectCourses.map((course: any) => {
                const isAccessible = course.level?.toLowerCase() === studentLevel?.toLowerCase() || !course.level;
                const lessonCount = getLessonCount(course.id);
                const completedCount = getCompletedCount(course.id);
                const progressPct = getProgressPercent(course.id);

                return (
                  <Card key={course.id} className={`overflow-hidden transition-all ${isAccessible ? 'hover:shadow-lg' : 'opacity-70'}`}>
                    {/* Gradient header */}
                    <div className="h-28 bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center relative">
                      <BookOpen className="h-10 w-10 text-primary/40" />
                      {!isAccessible && (
                        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center">
                          <Lock className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={levelColor(course.level || 'beginner')} variant="secondary">
                          {levelLabel(course.level || 'beginner')}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {lessonCount} {t("lessons", "درس")}
                        </span>
                      </div>
                      <h3 className="font-semibold text-sm line-clamp-2">
                        {language === "ar" ? course.title_ar || course.title : course.title}
                      </h3>
                      {course.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {language === "ar" ? course.description_ar || course.description : course.description}
                        </p>
                      )}

                      {isAccessible ? (
                        <>
                          {lessonCount > 0 && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{completedCount}/{lessonCount}</span>
                                <span>{progressPct}%</span>
                              </div>
                              <Progress value={progressPct} className="h-2" />
                            </div>
                          )}
                          <Link to={`/student/courses/${course.id}`}>
                            <Button size="sm" className="w-full mt-1">
                              <Play className="h-3 w-3 me-1" />
                              {completedCount > 0 ? t("Continue", "متابعة") : t("Start", "ابدأ")}
                            </Button>
                          </Link>
                        </>
                      ) : (
                        <div className="text-center space-y-2 pt-1">
                          <p className="text-xs text-muted-foreground">
                            {t(`Upgrade to ${levelLabel(course.level || '')} to access`, `ارتقِ إلى ${levelLabel(course.level || '')} للوصول`)}
                          </p>
                          <Button size="sm" variant="outline" className="w-full" disabled>
                            <Lock className="h-3 w-3 me-1" />
                            {t("Locked", "مقفل")}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {(subjects || []).every((s: any) => (courses || []).filter((c: any) => c.subject_id === s.id).length === 0) && (
        <div className="text-center py-16">
          <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold">{t("No courses available yet", "لا توجد دورات متاحة بعد")}</h3>
          <p className="text-sm text-muted-foreground">{t("Check back soon!", "تحقق قريبًا!")}</p>
        </div>
      )}
    </div>
  );
};

export default StudentCourses;
