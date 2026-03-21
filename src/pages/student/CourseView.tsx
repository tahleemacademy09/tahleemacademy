import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle, Circle, Play, Clock, BookOpen } from "lucide-react";

const CourseView = () => {
  const { courseId } = useParams();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeLesson, setActiveLesson] = useState<string | null>(null);

  const { data: course, isLoading: loadingCourse } = useQuery({
    queryKey: ["course", courseId],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*, subjects(title, title_ar)").eq("id", courseId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: lessons, isLoading: loadingLessons } = useQuery({
    queryKey: ["course-lessons", courseId],
    queryFn: async () => {
      const { data, error } = await supabase.from("lessons").select("*").eq("course_id", courseId!).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: progress } = useQuery({
    queryKey: ["lesson-progress", courseId, user?.id],
    enabled: !!user && !!lessons?.length,
    queryFn: async () => {
      const lessonIds = (lessons || []).map((l: any) => l.id);
      if (lessonIds.length === 0) return [];
      const { data, error } = await supabase.from("lesson_progress").select("*").eq("user_id", user!.id).in("lesson_id", lessonIds);
      if (error) throw error;
      return data;
    },
  });

  const completedSet = new Set((progress || []).filter((p: any) => p.completed).map((p: any) => p.lesson_id));
  const totalLessons = lessons?.length || 0;
  const completedCount = completedSet.size;
  const progressPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  // Set first incomplete lesson as active
  useEffect(() => {
    if (lessons && !activeLesson) {
      const firstIncomplete = lessons.find((l: any) => !completedSet.has(l.id));
      setActiveLesson(firstIncomplete?.id || lessons[0]?.id || null);
    }
  }, [lessons, activeLesson, completedSet]);

  const activeLessonData = lessons?.find((l: any) => l.id === activeLesson);

  const markCompleteMutation = useMutation({
    mutationFn: async (lessonId: string) => {
      const { error } = await supabase.from("lesson_progress").upsert({
        user_id: user!.id,
        lesson_id: lessonId,
        completed: true,
        completed_at: new Date().toISOString(),
      }, { onConflict: "user_id,lesson_id" });
      if (error) throw error;
    },
    onSuccess: (_, lessonId) => {
      qc.invalidateQueries({ queryKey: ["lesson-progress", courseId] });
      qc.invalidateQueries({ queryKey: ["my-progress"] });
      toast({ title: t("Lesson completed! ✅", "تم إكمال الدرس! ✅") });
      // Auto-advance to next lesson
      if (lessons) {
        const currentIdx = lessons.findIndex((l: any) => l.id === lessonId);
        if (currentIdx < lessons.length - 1) {
          setActiveLesson(lessons[currentIdx + 1].id);
        }
      }
    },
  });

  if (loadingCourse || loadingLessons) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid md:grid-cols-3 gap-6">
          <Skeleton className="h-96 md:col-span-1" />
          <Skeleton className="h-96 md:col-span-2" />
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-bold">{t("Course not found", "الدورة غير موجودة")}</h2>
        <Link to="/student/courses"><Button className="mt-4">{t("Back to Courses", "العودة للدورات")}</Button></Link>
      </div>
    );
  }

  const subjectTitle = language === "ar" ? (course as any).subjects?.title_ar || (course as any).subjects?.title : (course as any).subjects?.title;

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Back + Header */}
      <div>
        <Link to="/student/courses" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-4 w-4 me-1" /> {t("Back to Courses", "العودة للدورات")}
        </Link>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <h1 className="text-xl md:text-2xl font-bold" style={{ fontFamily: language === "ar" ? "'Amiri', serif" : "'Playfair Display', serif", color: '#064E3B' }}>
            {language === "ar" ? course.title_ar || course.title : course.title}
          </h1>
          {course.level && <Badge variant="secondary">{course.level}</Badge>}
          {subjectTitle && <Badge variant="outline">{subjectTitle}</Badge>}
        </div>
        {(course.description || course.description_ar) && (
          <div className="mt-1 space-y-1">
            {course.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{course.description}</p>
            )}
            {course.description_ar && (
              <p className="text-sm text-muted-foreground leading-relaxed text-right"
                 style={{ fontFamily: "'Noto Naskh Arabic', 'Scheherazade New', 'Amiri', serif", fontSize: "0.95rem", direction: "rtl" }}>
                {course.description_ar}
              </p>
            )}
          </div>
        )}
        <div className="mt-3 flex items-center gap-4">
          <Progress value={progressPct} className="flex-1 h-2 max-w-xs" />
          <span className="text-sm text-muted-foreground">{completedCount}/{totalLessons} {t("completed", "مكتمل")}</span>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Lesson list */}
        <div className="md:col-span-1 space-y-2">
          <h3 className="font-semibold text-sm mb-3">{t("Lessons", "الدروس")}</h3>
          {(lessons || []).map((lesson: any, idx: number) => {
            const isCompleted = completedSet.has(lesson.id);
            const isActive = activeLesson === lesson.id;
            return (
              <button
                key={lesson.id}
                onClick={() => setActiveLesson(lesson.id)}
                className={`w-full text-left rounded-xl p-3 flex items-center gap-3 transition-all border ${
                  isActive ? 'border-primary bg-primary/5 shadow-sm' : 'border-transparent hover:bg-muted/50'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium truncate ${isCompleted ? 'text-muted-foreground' : ''}`}>
                    {idx + 1}. {language === "ar" ? lesson.title_ar || lesson.title : lesson.title}
                  </p>
                  {lesson.duration_minutes > 0 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3" /> {lesson.duration_minutes} {t("min", "د")}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
          {(!lessons || lessons.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-8">{t("No lessons yet", "لا توجد دروس بعد")}</p>
          )}
        </div>

        {/* Video + Content */}
        <div className="md:col-span-2">
          {activeLessonData ? (
            <Card className="overflow-hidden">
              {activeLessonData.video_url ? (
                <div className="aspect-video bg-black">
                  <iframe
                    src={activeLessonData.video_url}
                    className="w-full h-full"
                    allowFullScreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  />
                </div>
              ) : (
                <div className="aspect-video bg-muted flex items-center justify-center">
                  <div className="text-center">
                    <Play className="h-12 w-12 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">{t("No video for this lesson", "لا يوجد فيديو لهذا الدرس")}</p>
                  </div>
                </div>
              )}
              <CardContent className="p-5">
                <h2 className="text-lg font-bold mb-2">
                  {language === "ar" ? activeLessonData.title_ar || activeLessonData.title : activeLessonData.title}
                </h2>
                {!completedSet.has(activeLessonData.id) ? (
                  <Button
                    onClick={() => markCompleteMutation.mutate(activeLessonData.id)}
                    disabled={markCompleteMutation.isPending}
                    className="mt-2"
                  >
                    <CheckCircle className="h-4 w-4 me-2" />
                    {t("Mark as Complete", "تحديد كمكتمل")}
                  </Button>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-800 mt-2">
                    <CheckCircle className="h-3 w-3 me-1" />
                    {t("Completed", "مكتمل")}
                  </Badge>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              <p>{t("Select a lesson to begin", "اختر درسًا للبدء")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CourseView;
