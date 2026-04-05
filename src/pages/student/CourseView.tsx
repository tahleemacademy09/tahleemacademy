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
import { ArrowLeft, CheckCircle, Circle, Play, Clock, BookOpen, Video } from "lucide-react";

// ✅ Better Arabic font for screen readability
const ARABIC_FONT = "'Tajawal', 'Cairo', sans-serif";

const CourseView = () => {
  const { courseId } = useParams();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeLesson, setActiveLesson] = useState<string | null>(null);

  const { data: course, isLoading: loadingCourse } = useQuery({
    queryKey: ["course", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("*, subjects(title, title_ar)")
        .eq("id", courseId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: lessons, isLoading: loadingLessons } = useQuery({
    queryKey: ["course-lessons", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select("*")
        .eq("course_id", courseId!)
        .order("sort_order");
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
      const { data, error } = await supabase
        .from("lesson_progress")
        .select("*")
        .eq("user_id", user!.id)
        .in("lesson_id", lessonIds);
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
      const { error } = await supabase
        .from("lesson_progress")
        .upsert(
          {
            user_id: user!.id,
            lesson_id: lessonId,
            completed: true,
            completed_at: new Date().toISOString(),
          },
          { onConflict: "user_id,lesson_id" }
        );
      if (error) throw error;
    },
    onSuccess: (_, lessonId) => {
      qc.invalidateQueries({ queryKey: ["lesson-progress", courseId] });
      qc.invalidateQueries({ queryKey: ["my-progress"] });
      toast({ title: language === "ar" ? "تم إكمال الدرس! ✅" : "Lesson completed! ✅" });      // Auto-advance to next lesson
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
        <h2 className="text-xl font-bold" style={{ fontFamily: ARABIC_FONT }}>
          {language === "ar" ? "الدورة غير موجودة" : "Course not found"}
        </h2>
        <Link to="/student/courses">
          <Button className="mt-4">{language === "ar" ? "العودة للدورات" : "Back to Courses"}</Button>
        </Link>
      </div>
    );
  }

  const subjectTitle = language === "ar" 
    ? (course as any).subjects?.title_ar || (course as any).subjects?.title 
    : (course as any).subjects?.title;

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Back + Header */}
      <div className="text-center md:text-start">
        <Link 
          to="/student/courses" 
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4 me-1" /> 
          {language === "ar" ? "العودة للدورات" : "Back to Courses"}
        </Link>        
        <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-2">
          {/* ✅ Arabic Title First */}
          {course.title_ar && (
            <h1 
              className="text-xl md:text-2xl font-bold text-gray-900"
              style={{ fontFamily: ARABIC_FONT }}
              dir="rtl"
            >
              {course.title_ar}
            </h1>
          )}
          {/* ✅ English Title Below */}
          {course.title && (
            <h1 
              className="text-lg md:text-xl font-semibold text-gray-700"
              style={{ fontFamily: language === "ar" ? ARABIC_FONT : "'Playfair Display', serif" }}
            >
              {course.title}
            </h1>
          )}
          {course.level && <Badge variant="secondary">{course.level}</Badge>}
          {subjectTitle && <Badge variant="outline">{subjectTitle}</Badge>}
        </div>

        {/* ✅ Descriptions: Arabic first, then English */}
        {(course.description || course.description_ar) && (
          <div className="mt-3 space-y-2 max-w-2xl mx-auto md:mx-0">
            {course.description_ar && (
              <p 
                className="text-sm text-gray-600 leading-relaxed text-center md:text-start"
                style={{ fontFamily: ARABIC_FONT }}
                dir="rtl"
              >
                {course.description_ar}
              </p>
            )}
            {course.description && (
              <p className="text-sm text-gray-500 leading-relaxed text-center md:text-start">
                {course.description}
              </p>
            )}
          </div>
        )}

        {/* Progress */}
        <div className="mt-4 flex items-center justify-center md:justify-start gap-4">
          <Progress value={progressPct} className="flex-1 h-2 max-w-xs" />
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {completedCount}/{totalLessons} {language === "ar" ? "مكتمل" : "completed"}          </span>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Lesson list - WHITE BACKGROUND CARD */}
        <div className="md:col-span-1">
          <Card className="bg-white border-0 shadow-md">
            <CardContent className="p-4">
              <h3 
                className="font-semibold text-sm mb-3 text-center md:text-start"
                style={{ fontFamily: language === "ar" ? ARABIC_FONT : "inherit" }}
              >
                {language === "ar" ? "الدروس" : "Lessons"}
              </h3>
              
              <div className="space-y-2">
                {(lessons || []).map((lesson: any, idx: number) => {
                  const isCompleted = completedSet.has(lesson.id);
                  const isActive = activeLesson === lesson.id;
                  return (
                    <button
                      key={lesson.id}
                      onClick={() => setActiveLesson(lesson.id)}
                      className={`w-full text-left rounded-xl p-3 flex items-center gap-3 transition-all border ${
                        isActive 
                          ? 'border-primary bg-primary/5 shadow-sm' 
                          : 'border-transparent hover:bg-muted/50'
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        {/* ✅ Arabic lesson title first */}
                        {lesson.title_ar && (
                          <p 
                            className={`text-sm font-medium truncate text-center md:text-start ${
                              isCompleted ? 'text-muted-foreground' : 'text-gray-800'
                            }`}
                            style={{ fontFamily: ARABIC_FONT }}
                            dir="rtl"
                          >
                            {lesson.title_ar}
                          </p>
                        )}
                        {/* ✅ English lesson title below */}                        {lesson.title && (
                          <p 
                            className={`text-xs truncate text-center md:text-start ${
                              isCompleted ? 'text-muted-foreground' : 'text-gray-600'
                            }`}
                          >
                            {lesson.title}
                          </p>
                        )}
                        {lesson.duration_minutes > 0 && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 justify-center md:justify-start">
                            <Clock className="h-3 w-3" /> 
                            {lesson.duration_minutes} {language === "ar" ? "د" : "min"}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
                {(!lessons || lessons.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {language === "ar" ? "لا توجد دروس بعد" : "No lessons yet"}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Video + Content - WHITE BACKGROUND CARD */}
        <div className="md:col-span-2">
          <Card className="overflow-hidden bg-white border-0 shadow-md">
            {activeLessonData ? (
              <>
                {/* Video Section */}
                {activeLessonData.video_url ? (
                  <div className="aspect-video bg-black">
                    <iframe
                      src={activeLessonData.video_url}
                      className="w-full h-full"
                      allowFullScreen
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      title={activeLessonData.title}
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-muted flex items-center justify-center">
                    <div className="text-center">
                      <Play className="h-12 w-12 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">                        {language === "ar" ? "لا يوجد فيديو لهذا الدرس" : "No video for this lesson"}
                      </p>
                    </div>
                  </div>
                )}

                {/* Content Section */}
                <CardContent className="p-5 text-center">
                  {/* ✅ Arabic lesson title first */}
                  {activeLessonData.title_ar && (
                    <h2 
                      className="text-lg font-bold text-gray-900 mb-1"
                      style={{ fontFamily: ARABIC_FONT }}
                      dir="rtl"
                    >
                      {activeLessonData.title_ar}
                    </h2>
                  )}
                  {/* ✅ English lesson title below */}
                  {activeLessonData.title && (
                    <h3 className="text-base font-semibold text-gray-700 mb-3">
                      {activeLessonData.title}
                    </h3>
                  )}

                  {/* Description */}
                  {(activeLessonData.description || activeLessonData.description_ar) && (
                    <div className="space-y-2 mb-4">
                      {activeLessonData.description_ar && (
                        <p 
                          className="text-sm text-gray-600"
                          style={{ fontFamily: ARABIC_FONT }}
                          dir="rtl"
                        >
                          {activeLessonData.description_ar}
                        </p>
                      )}
                      {activeLessonData.description && (
                        <p className="text-sm text-gray-500">
                          {activeLessonData.description}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Action Button */}
                  {!completedSet.has(activeLessonData.id) ? (
                    <Button
                      onClick={() => markCompleteMutation.mutate(activeLessonData.id)}
                      disabled={markCompleteMutation.isPending}                      className="bg-emerald-800 hover:bg-emerald-900 text-white"
                    >
                      <CheckCircle className="h-4 w-4 me-2" />
                      {language === "ar" ? "تحديد كمكتمل" : "Mark as Complete"}
                    </Button>
                  ) : (
                    <Badge className="bg-emerald-100 text-emerald-800">
                      <CheckCircle className="h-3 w-3 me-1" />
                      {language === "ar" ? "مكتمل" : "Completed"}
                    </Badge>
                  )}
                </CardContent>
              </>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <p style={{ fontFamily: ARABIC_FONT }}>
                  {language === "ar" ? "اختر درسًا للبدء" : "Select a lesson to begin"}
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CourseView;