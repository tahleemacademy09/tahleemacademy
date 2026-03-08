import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, BookOpen, FileText, Download, Play, ExternalLink, Music, Video, Type, Lock, CheckCircle, Circle } from "lucide-react";

const materialTypeIcon: Record<string, any> = {
  PDF: FileText,
  Video: Video,
  Audio: Music,
  Link: ExternalLink,
  Text: Type,
};

const SubjectView = () => {
  const { subjectId } = useParams();
  const { t, language } = useLanguage();
  const { user, profile } = useAuth();
  const studentLevel = profile?.level || "beginner";

  const { data: subject, isLoading } = useQuery({
    queryKey: ["subject", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("*").eq("id", subjectId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: courses } = useQuery({
    queryKey: ["subject-courses", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*").eq("subject_id", subjectId!).eq("is_published", true).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: syllabus } = useQuery({
    queryKey: ["subject-syllabus", subjectId, studentLevel],
    queryFn: async () => {
      const { data, error } = await supabase.from("subject_syllabus").select("*").eq("subject_id", subjectId!).eq("level", studentLevel).order("week_number");
      if (error) throw error;
      return data;
    },
  });

  const { data: materials } = useQuery({
    queryKey: ["subject-materials", subjectId, studentLevel],
    queryFn: async () => {
      const { data, error } = await supabase.from("subject_materials").select("*").eq("subject_id", subjectId!).eq("level", studentLevel).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: lessons } = useQuery({
    queryKey: ["subject-all-lessons", subjectId],
    enabled: !!courses?.length,
    queryFn: async () => {
      const courseIds = (courses || []).map((c: any) => c.id);
      const { data, error } = await supabase.from("lessons").select("id, course_id").in("course_id", courseIds);
      if (error) throw error;
      return data;
    },
  });

  const { data: progressData } = useQuery({
    queryKey: ["subject-progress", subjectId, user?.id],
    enabled: !!user && !!lessons?.length,
    queryFn: async () => {
      const lessonIds = (lessons || []).map((l: any) => l.id);
      const { data, error } = await supabase.from("lesson_progress").select("lesson_id, completed").eq("user_id", user!.id).in("lesson_id", lessonIds).eq("completed", true);
      if (error) throw error;
      return data;
    },
  });

  const completedSet = new Set((progressData || []).map((p: any) => p.lesson_id));

  const getLessonCount = (courseId: string) => (lessons || []).filter((l: any) => l.course_id === courseId).length;
  const getCompletedCount = (courseId: string) => (lessons || []).filter((l: any) => l.course_id === courseId && completedSet.has(l.id)).length;

  const levelLabel = (level: string) => {
    const labels: Record<string, [string, string]> = { beginner: ["Beginner", "مبتدئ"], intermediate: ["Intermediate", "متوسط"], advanced: ["Advanced", "متقدم"] };
    const [en, ar] = labels[level] || [level, level];
    return t(en, ar);
  };

  if (isLoading) {
    return <div className="container mx-auto px-4 py-8"><Skeleton className="h-64" /></div>;
  }

  if (!subject) {
    return <div className="container mx-auto px-4 py-16 text-center"><h2>{t("Subject not found", "المادة غير موجودة")}</h2></div>;
  }

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 space-y-6">
      <Link to="/student/courses" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 me-1" /> {t("Back to Courses", "العودة للدورات")}
      </Link>

      <div>
        <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: language === "ar" ? "'Amiri', serif" : "'Playfair Display', serif", color: '#064E3B' }}>
          {language === "ar" ? subject.title_ar || subject.title : subject.title}
        </h1>
        {subject.description && <p className="text-sm text-muted-foreground mt-1">{language === "ar" ? subject.description_ar || subject.description : subject.description}</p>}
      </div>

      <Tabs defaultValue="courses">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="courses">{t("Courses", "الدورات")}</TabsTrigger>
          <TabsTrigger value="syllabus">{t("Syllabus", "المنهج الدراسي")}</TabsTrigger>
          <TabsTrigger value="materials">{t("Materials", "المواد التعليمية")}</TabsTrigger>
        </TabsList>

        {/* COURSES TAB */}
        <TabsContent value="courses" className="space-y-4 mt-4">
          {(courses || []).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>{t("No courses available", "لا توجد دورات متاحة")}</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {(courses || []).map((course: any) => {
                const accessible = course.level?.toLowerCase() === studentLevel?.toLowerCase() || !course.level;
                const total = getLessonCount(course.id);
                const completed = getCompletedCount(course.id);
                const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

                return (
                  <Card key={course.id} className={`${!accessible ? 'opacity-60' : ''}`}>
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{levelLabel(course.level || 'beginner')}</Badge>
                        <span className="text-xs text-muted-foreground">{total} {t("lessons", "درس")}</span>
                      </div>
                      <h3 className="font-semibold">{language === "ar" ? course.title_ar || course.title : course.title}</h3>
                      {accessible ? (
                        <>
                          {total > 0 && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{completed}/{total}</span><span>{pct}%</span>
                              </div>
                              <Progress value={pct} className="h-2" />
                            </div>
                          )}
                          <Link to={`/student/courses/${course.id}`}>
                            <Button size="sm" className="w-full"><Play className="h-3 w-3 me-1" />{completed > 0 ? t("Continue", "متابعة") : t("Start", "ابدأ")}</Button>
                          </Link>
                        </>
                      ) : (
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground mb-2">{t(`Upgrade to ${levelLabel(course.level || '')}`, `ارتقِ إلى ${levelLabel(course.level || '')}`)}</p>
                          <Button size="sm" variant="outline" disabled><Lock className="h-3 w-3 me-1" />{t("Locked", "مقفل")}</Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* SYLLABUS TAB */}
        <TabsContent value="syllabus" className="mt-4">
          <h3 className="font-bold text-lg mb-4" style={{ fontFamily: language === "ar" ? "'Amiri', serif" : "'Playfair Display', serif" }}>
            {t("Course Syllabus", "المنهج الدراسي")}
          </h3>
          {(syllabus || []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("No syllabus items for your level", "لا توجد عناصر منهج لمستواك")}</p>
          ) : (
            <div className="space-y-3">
              {(syllabus || []).map((item: any, idx: number) => (
                <Card key={item.id}>
                  <CardContent className="p-4 flex items-start gap-4">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-bold text-primary">
                      {item.week_number || idx + 1}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">{item.title}</h4>
                      {item.description && <p className="text-xs text-muted-foreground mt-1">{item.description}</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* MATERIALS TAB */}
        <TabsContent value="materials" className="mt-4">
          <h3 className="font-bold text-lg mb-4" style={{ fontFamily: language === "ar" ? "'Amiri', serif" : "'Playfair Display', serif" }}>
            {t("Course Materials", "المواد التعليمية")}
          </h3>
          {(materials || []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("No materials for your level", "لا توجد مواد لمستواك")}</p>
          ) : (
            <div className="space-y-2">
              {(materials || []).map((mat: any) => {
                const Icon = materialTypeIcon[mat.material_type] || FileText;
                return (
                  <Card key={mat.id}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate">{mat.title}</h4>
                        <p className="text-xs text-muted-foreground">{mat.material_type}</p>
                      </div>
                      <div className="flex gap-2">
                        {mat.file_url && (
                          <a href={mat.file_url} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline">
                              <ExternalLink className="h-3 w-3 me-1" />
                              {t("View", "عرض")}
                            </Button>
                          </a>
                        )}
                        {mat.is_downloadable && mat.file_url && (
                          <a href={mat.file_url} download>
                            <Button size="sm" variant="ghost">
                              <Download className="h-3 w-3" />
                            </Button>
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SubjectView;
