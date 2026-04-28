/*  src/pages/student/StudentCourses.tsx  */
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePrivateStudent } from "@/hooks/usePrivateStudent";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Play, ArrowRight } from "lucide-react";

// Subject mapping for UI display
const SUBJECT_EMOJIS: Record<string, string> = {
  "Arabic Language": "📖",
  "Quran": "🕌",
  "Islamic Studies": "☪️",
  "Fiqh & Aqeedah": "📚",
};

// Arabic font family for better readability
const ARABIC_FONT = "'Tajawal', 'Cairo', sans-serif";

const StudentCourses = () => {
  const { t, language } = useLanguage();
  const { user, profile } = useAuth();
  const studentLevel = profile?.level || "beginner";
  const { isPrivateStudent, allowGeneralAccess } = usePrivateStudent();

  // For private students: fetch their assigned subject IDs
  const { data: privateSubjectIds } = useQuery({
    queryKey: ["private-subject-ids", user?.id],
    enabled: isPrivateStudent && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("private_student_subjects" as any).select("subject_id").eq("student_id", user!.id);
      return new Set((data || []).map((r: any) => r.subject_id));
    },
  });

  // 1. Fetch Subjects - only those matching student level
  const { data: allSubjectsRaw, isLoading: loadingSubjects } = useQuery({
    queryKey: ["subjects-active", studentLevel],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .eq("is_active", true)
        .order("created_at");
      if (error) throw error;
      return (data || []).filter((s: any) => {
        const lv: string = s.level || "all";
        if (!lv || lv === "all") return true;
        return lv.split(",").map((l: string) => l.trim()).includes(studentLevel);
      });
    },
  });

  // Apply private filter: private students (without general access) see only assigned subjects
  const subjects = isPrivateStudent && !allowGeneralAccess
    ? (allSubjectsRaw || []).filter((s: any) => (privateSubjectIds ?? new Set()).has(s.id))
    : (allSubjectsRaw || []);

  // 2. Fetch Courses - filtered by student level server-side
  const { data: courses, isLoading: loadingCourses } = useQuery({
    queryKey: ["all-courses-published", studentLevel],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title, title_ar, description, description_ar, subject_id, level, image_url, thumbnail, is_published, sort_order")
        .eq("is_published", true)
        .order("sort_order");
      if (error) throw error;
      // Filter: show courses for this student's level OR courses set to "all"
      return (data || []).filter((c: any) => !c.level || c.level === "all" || c.level === studentLevel);
    },
  });

  // 3. Fetch Lessons
  const { data: lessons } = useQuery({
    queryKey: ["all-lessons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select("id, course_id")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // 4. Fetch User Progress
  const { data: progress } = useQuery({
    queryKey: ["my-progress", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_progress")
        .select("lesson_id, completed")
        .eq("user_id", user!.id)
        .eq("completed", true);
      if (error) throw error;
      return data;
    },
  });

  // ── Helpers ──────────────────────────────────────────────────────
  const isLoading = loadingSubjects || loadingCourses;
  const completedLessonIds = new Set((progress || []).map((p: any) => p.lesson_id));

  const getLessonCount = (courseId: string) => (lessons || []).filter((l: any) => l.course_id === courseId).length;
  
  const getCompletedCount = (courseId: string) => {
    const courseLessons = (lessons || []).filter((l: any) => l.course_id === courseId);
    return courseLessons.filter((l: any) => completedLessonIds.has(l.id)).length;
  };

  const getProgressPercent = (courseId: string) => {
    const total = getLessonCount(courseId);
    if (total === 0) return 0;    return Math.round((getCompletedCount(courseId) / total) * 100);
  };

  const getCourseImage = (course: any) => {
    return course.image_url || course.thumbnail || course.cover_image || null;
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

  // ── Loading State ────────────────────────────────────────────────
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

  // ── Main Render ──────────────────────────────────────────────────
  return (
    <div className="container mx-auto px-4 py-6 md:py-8 space-y-8">
      {/* Header */}
      <div className="text-center md:text-start">
        <h1 
          className="text-2xl md:text-3xl font-bold" 
          style={{ 
            fontFamily: language === "ar" ? ARABIC_FONT : "'Playfair Display', serif", 
            color: '#064E3B'           }}
        >
          {language === "ar" ? "دوراتي" : "My Courses"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {language === "ar" 
            ? `مستواك: ${levelLabel(studentLevel)}` 
            : `Your level: ${levelLabel(studentLevel)}`}
        </p>
      </div>

      {/* Courses grouped by subject - FILTERED BY STUDENT LEVEL */}
      {(subjects || []).map((subject: any) => {
        // Courses are already filtered by level — just match by subject_id
        const subjectCourses = (courses || []).filter((c: any) => c.subject_id === subject.id);
        
        if (subjectCourses.length === 0) return null;

        const emoji = SUBJECT_EMOJIS[subject.title] || "📖";

        return (
          <div key={subject.id} className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">{emoji}</span>
              <h2 
                className="text-lg font-bold" 
                style={{ fontFamily: language === "ar" ? ARABIC_FONT : "'Playfair Display', serif" }}
              >
                {language === "ar" ? subject.title_ar || subject.title : subject.title}
              </h2>
              <Link to={`/student/subjects/${subject.id}`}>
                <Button variant="ghost" size="sm" className="text-xs">
                  {language === "ar" ? "عرض الكل" : "View All"} <ArrowRight className="h-3 w-3 ms-1" />
                </Button>
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {subjectCourses.map((course: any) => {
                const lessonCount = getLessonCount(course.id);
                const completedCount = getCompletedCount(course.id);
                const progressPct = getProgressPercent(course.id);
                const imageUrl = getCourseImage(course);

                return (
                  <Card 
                    key={course.id}                     className="overflow-hidden transition-all hover:shadow-lg bg-white border-0 shadow-md"
                  >
                    {/* ✅ Image Section - NO TEXT OVERLAY */}
                    <div className="h-32 relative overflow-hidden bg-gradient-to-br from-primary/10 to-secondary/10">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={course.title}
                          className="w-full h-full object-cover transition-opacity duration-300"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            const fallback = e.currentTarget.parentElement?.querySelector('.fallback-icon');
                            if (fallback) fallback.classList.remove('hidden');
                          }}
                        />
                      ) : (
                        <div className="fallback-icon flex items-center justify-center w-full h-full">
                          <BookOpen className="h-12 w-12 text-primary/30" />
                        </div>
                      )}
                      {/* Hidden fallback icon container (shown via JS on error) */}
                      <div className="fallback-icon hidden absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 to-secondary/10">
                        <BookOpen className="h-12 w-12 text-primary/30" />
                      </div>
                    </div>

                    {/* ✅ Content Section - WHITE BACKGROUND, ARABIC FIRST, CENTERED */}
                    <CardContent className="p-4 space-y-3 text-center">
                      {/* Level Badge */}
                      <div className="flex justify-center">
                        <Badge className={levelColor(course.level || 'beginner')} variant="secondary">
                          {levelLabel(course.level || 'beginner')}
                        </Badge>
                      </div>

                      {/* ✅ Arabic Title First - Tajawal Font */}
                      {course.title_ar && (
                        <h3 
                          className="text-lg font-bold text-gray-800 leading-tight"
                          style={{ fontFamily: ARABIC_FONT }}
                          dir="rtl"
                        >
                          {course.title_ar}
                        </h3>
                      )}
                      
                      {/* ✅ English Title Below */}
                      {course.title && (
                        <h4 className="text-sm font-semibold text-gray-600">                          {course.title}
                        </h4>
                      )}

                      {/* ✅ Arabic Description First */}
                      {course.description_ar && (
                        <p 
                          className="text-xs text-gray-600 leading-relaxed line-clamp-2"
                          style={{ fontFamily: ARABIC_FONT }}
                          dir="rtl"
                        >
                          {course.description_ar}
                        </p>
                      )}

                      {/* ✅ English Description Below */}
                      {course.description && (
                        <p className="text-xs text-gray-500 line-clamp-2">
                          {course.description}
                        </p>
                      )}

                      {/* Lesson Count */}
                      <span className="text-xs text-muted-foreground block">
                        {lessonCount} {language === "ar" ? "درس" : "lessons"}
                      </span>

                      {/* Progress & Action Button */}
                      <>
                        {lessonCount > 0 && (
                          <div className="space-y-1">
                            <div className="flex justify-center text-xs text-muted-foreground gap-2">
                              <span>{completedCount}/{lessonCount}</span>
                              <span>•</span>
                              <span>{progressPct}%</span>
                            </div>
                            <Progress value={progressPct} className="h-1.5" />
                          </div>
                        )}
                        <Link to={`/student/courses/${course.id}`}>
                          <Button size="sm" className="w-full mt-2 bg-emerald-800 hover:bg-emerald-900 text-white">
                            <Play className="h-3 w-3 me-1" />
                            {completedCount > 0 
                              ? (language === "ar" ? "متابعة" : "Continue") 
                              : (language === "ar" ? "ابدأ" : "Start")}
                          </Button>
                        </Link>
                      </>
                    </CardContent>
                  </Card>                );
              })}
            </div>
          </div>
        );
      })}

      {/* Empty state - when no courses exist */}
      {(subjects || []).every((s: any) =>
        (courses || []).filter((c: any) => c.subject_id === s.id).length === 0
      ) && (
        <div className="text-center py-16">
          <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 
            className="text-lg font-semibold"
            style={{ fontFamily: ARABIC_FONT }}
          >
            {language === "ar" ? "لا توجد دورات متاحة حالياً" : "No courses available yet"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {language === "ar" ? "ترقّب المزيد من الدورات قريباً!" : "Check back soon for new courses!"}
          </p>
        </div>
      )}
    </div>
  );
};

export default StudentCourses;