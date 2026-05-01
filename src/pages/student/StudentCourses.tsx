/*  src/pages/student/StudentCourses.tsx  */
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademicLevels, getLevelConfig, getLevelDisplay } from "@/hooks/useAcademicLevels";
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

  const { data: privateCourseIds } = useQuery({
    queryKey: ["private-course-ids", user?.id],
    enabled: isPrivateStudent && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("private_student_courses" as any).select("course_id").eq("student_id", user!.id);
      return new Set((data || []).map((r: any) => r.course_id));
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

  // Visibility filter — applied after fetch
  // Private student: sees subjects tagged 'all' OR 'private' (if assigned), never 'general'
  // General student: sees subjects tagged 'all' OR 'general', never 'private'
  const subjects = (() => {
    const raw = allSubjectsRaw || [];
    if (isPrivateStudent) {
      const assigned = privateSubjectIds ?? new Set<string>();
      return raw.filter((s: any) => {
        const v = s.visibility || "all";
        if (v === "general") return false;                   // never show 'general' to private
        if (v === "private") return assigned.has(s.id);     // 'private' only if explicitly assigned
        return true;                                         // 'all' → always visible
      });
    }
    // General student: hide private-only subjects
    return raw.filter((s: any) => (s.visibility || "all") !== "private");
  })();

  // 2. Fetch Courses - filtered by student level server-side
  const { data: courses, isLoading: loadingCourses } = useQuery({
    queryKey: ["all-courses-published", studentLevel],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title, title_ar, description, description_ar, subject_id, level, image_url, thumbnail, is_published, sort_order, visibility")
        .eq("is_published", true)
        .order("sort_order");
      if (error) throw error;
      const raw = (data || []).filter((c: any) => !c.level || c.level === "all" || c.level === studentLevel);
      if (isPrivateStudent) {
        const assigned = privateCourseIds ?? new Set<string>();
        return raw.filter((c: any) => {
          const v = c.visibility || "all";
          if (v === "general") return false;
          if (v === "private") return assigned.has(c.id);
          return true;
        });
      }
      return raw.filter((c: any) => (c.visibility || "all") !== "private");
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

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {subjectCourses.map((course: any) => {
                const lessonCount = getLessonCount(course.id);
                const completedCount = getCompletedCount(course.id);
                const progressPct = getProgressPercent(course.id);
                const imageUrl = getCourseImage(course);
                const lvl = course.level || "beginner";
                const lvlColors: Record<string, { bg: string; text: string; border: string }> = {
                  beginner:     { bg: "#F0FDF4", text: "#166534", border: "#86EFAC" },
                  intermediate: { bg: "#EFF6FF", text: "#1E40AF", border: "#93C5FD" },
                  advanced:     { bg: "#FDF4FF", text: "#6B21A8", border: "#D8B4FE" },
                };
                const lc = lvlColors[lvl] ?? lvlColors.beginner;
                return (
                  <div key={course.id} style={{ background: "#fff", borderRadius: 16, border: `1px solid ${lc.border}`, overflow: "hidden", display: "flex", height: 116, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", transition: "box-shadow .2s, transform .2s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 20px rgba(6,78,59,0.12)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 6px rgba(0,0,0,0.05)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}
                  >
                    {/* Image panel */}
                    <div style={{ position: "relative", width: 118, flexShrink: 0, overflow: "hidden", background: lc.bg }}>
                      {imageUrl ? (
                        <img src={imageUrl} alt={course.title} loading="lazy"
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <BookOpen style={{ width: 26, height: 26, color: lc.text, opacity: 0.3 }} />
                        </div>
                      )}
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, transparent 55%, rgba(255,255,255,0.9))", pointerEvents: "none" }} />
                    </div>

                    {/* Content panel */}
                    <div style={{ flex: 1, minWidth: 0, padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 2 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {course.title_ar && (
                              <p style={{ fontWeight: 700, fontSize: 13, color: "#111", margin: "0 0 1px", direction: "rtl", fontFamily: ARABIC_FONT, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{course.title_ar}</p>
                            )}
                            <p style={{ fontWeight: course.title_ar ? 500 : 700, fontSize: course.title_ar ? 11 : 13, color: course.title_ar ? "#6B7280" : "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{course.title}</p>
                          </div>
                          <span style={{ flexShrink: 0, padding: "2px 7px", borderRadius: 20, fontSize: 9, fontWeight: 700, background: lc.bg, color: lc.text, border: `1px solid ${lc.border}`, whiteSpace: "nowrap" }}>{levelLabel(lvl)}</span>
                        </div>
                        {(course.description_ar || course.description) && (
                          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "3px 0 0", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }}>
                            {language === "ar" ? (course.description_ar || course.description) : (course.description || course.description_ar)}
                          </p>
                        )}
                      </div>

                      {/* Progress + button row */}
                      <div style={{ marginTop: 6 }}>
                        {lessonCount > 0 && (
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9CA3AF", marginBottom: 3 }}>
                              <span>{completedCount}/{lessonCount} {language === "ar" ? "درس" : "lessons"}</span>
                              <span style={{ fontWeight: 700, color: "#064E3B" }}>{progressPct}%</span>
                            </div>
                            <div style={{ height: 4, borderRadius: 4, background: "#E5E7EB", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${progressPct}%`, background: "linear-gradient(90deg, #064E3B, #059669)", borderRadius: 4, transition: "width .4s ease" }} />
                            </div>
                          </div>
                        )}
                        <Link to={`/student/courses/${course.id}`} style={{ textDecoration: "none" }}>
                          <button style={{ width: "100%", padding: "6px 0", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #064E3B, #075E54)", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                            <Play style={{ width: 10, height: 10 }} />
                            {completedCount > 0 ? (language === "ar" ? "متابعة" : "Continue") : (language === "ar" ? "ابدأ" : "Start")}
                          </button>
                        </Link>
                      </div>
                    </div>
                  </div>
                );
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