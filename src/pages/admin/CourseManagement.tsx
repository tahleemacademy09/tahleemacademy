import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Plus, BookOpen, Trash2, Edit, GripVertical, Video, Eye, EyeOff } from "lucide-react";

const LEVELS = ["beginner", "intermediate", "advanced"];

const CourseManagement = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const qc = useQueryClient();

  // State
  const [courseOpen, setCourseOpen] = useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [editCourseId, setEditCourseId] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [editLessonId, setEditLessonId] = useState<string | null>(null);

  const [courseForm, setCourseForm] = useState({
    title: "", title_ar: "", description: "", description_ar: "",
    level: "beginner", subject_id: "", is_published: false, sort_order: 0,
  });
  const [lessonForm, setLessonForm] = useState({
    title: "", title_ar: "", video_url: "", duration_minutes: 0, sort_order: 0,
  });

  // Queries
  const { data: subjects } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("*").order("title");
      if (error) throw error;
      return data;
    },
  });

  const { data: courses, isLoading } = useQuery({
    queryKey: ["admin-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*, subjects(title, title_ar)").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: lessons } = useQuery({
    queryKey: ["admin-lessons", selectedCourse],
    enabled: !!selectedCourse,
    queryFn: async () => {
      const { data, error } = await supabase.from("lessons").select("*").eq("course_id", selectedCourse!).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Mutations
  const saveCourse = useMutation({
    mutationFn: async (values: typeof courseForm) => {
      const payload = { ...values, created_by: user?.id, subject_id: values.subject_id || null };
      if (editCourseId) {
        const { error } = await supabase.from("courses").update(payload).eq("id", editCourseId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("courses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-courses"] });
      setCourseOpen(false);
      setEditCourseId(null);
      resetCourseForm();
      toast({ title: t("Course saved", "تم حفظ الدورة") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteCourse = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-courses"] });
      toast({ title: t("Course deleted", "تم حذف الدورة") });
    },
  });

  const saveLesson = useMutation({
    mutationFn: async (values: typeof lessonForm) => {
      const payload = { ...values, course_id: selectedCourse! };
      if (editLessonId) {
        const { error } = await supabase.from("lessons").update(payload).eq("id", editLessonId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("lessons").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-lessons", selectedCourse] });
      setLessonOpen(false);
      setEditLessonId(null);
      resetLessonForm();
      toast({ title: t("Lesson saved", "تم حفظ الدرس") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteLesson = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lessons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-lessons", selectedCourse] });
      toast({ title: t("Lesson deleted", "تم حذف الدرس") });
    },
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
      const { error } = await supabase.from("courses").update({ is_published: published }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-courses"] }),
  });

  const resetCourseForm = () => setCourseForm({ title: "", title_ar: "", description: "", description_ar: "", level: "beginner", subject_id: "", is_published: false, sort_order: 0 });
  const resetLessonForm = () => setLessonForm({ title: "", title_ar: "", video_url: "", duration_minutes: 0, sort_order: 0 });

  const openEditCourse = (c: any) => {
    setEditCourseId(c.id);
    setCourseForm({
      title: c.title, title_ar: c.title_ar || "", description: c.description || "", description_ar: c.description_ar || "",
      level: c.level || "beginner", subject_id: c.subject_id || "", is_published: c.is_published, sort_order: c.sort_order || 0,
    });
    setCourseOpen(true);
  };

  const openEditLesson = (l: any) => {
    setEditLessonId(l.id);
    setLessonForm({
      title: l.title, title_ar: l.title_ar || "", video_url: l.video_url || "",
      duration_minutes: l.duration_minutes || 0, sort_order: l.sort_order || 0,
    });
    setLessonOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("Course Management", "إدارة الدورات")}</h1>
          <p className="text-muted-foreground text-sm">{t("Create and manage courses, lessons, and content", "إنشاء وإدارة الدورات والدروس والمحتوى")}</p>
        </div>
        <Dialog open={courseOpen} onOpenChange={(v) => { setCourseOpen(v); if (!v) { setEditCourseId(null); resetCourseForm(); } }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 me-2" />{t("Add Course", "إضافة دورة")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editCourseId ? t("Edit Course", "تعديل الدورة") : t("New Course", "دورة جديدة")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("Title (EN)", "العنوان (إنجليزي)")}</Label><Input value={courseForm.title} onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })} /></div>
                <div><Label>{t("Title (AR)", "العنوان (عربي)")}</Label><Input value={courseForm.title_ar} onChange={(e) => setCourseForm({ ...courseForm, title_ar: e.target.value })} dir="rtl" /></div>
              </div>
              <div><Label>{t("Description", "الوصف")}</Label><Textarea value={courseForm.description} onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })} /></div>
              <div><Label>{t("Description (AR)", "الوصف (عربي)")}</Label><Textarea value={courseForm.description_ar} onChange={(e) => setCourseForm({ ...courseForm, description_ar: e.target.value })} dir="rtl" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("Level", "المستوى")}</Label>
                  <Select value={courseForm.level} onValueChange={(v) => setCourseForm({ ...courseForm, level: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEVELS.map(l => <SelectItem key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("Subject", "المادة")}</Label>
                  <Select value={courseForm.subject_id} onValueChange={(v) => setCourseForm({ ...courseForm, subject_id: v })}>
                    <SelectTrigger><SelectValue placeholder={t("Select", "اختر")} /></SelectTrigger>
                    <SelectContent>
                      {(subjects || []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("Sort Order", "الترتيب")}</Label><Input type="number" value={courseForm.sort_order} onChange={(e) => setCourseForm({ ...courseForm, sort_order: parseInt(e.target.value) || 0 })} /></div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={courseForm.is_published} onCheckedChange={(v) => setCourseForm({ ...courseForm, is_published: v })} />
                  <Label>{t("Published", "منشور")}</Label>
                </div>
              </div>
              <Button className="w-full" onClick={() => saveCourse.mutate(courseForm)} disabled={!courseForm.title || saveCourse.isPending}>
                {saveCourse.isPending ? t("Saving...", "جاري الحفظ...") : t("Save Course", "حفظ الدورة")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Courses Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(courses || []).map((course: any) => (
          <Card key={course.id} className={`cursor-pointer transition-all ${selectedCourse === course.id ? 'ring-2 ring-primary' : ''}`} onClick={() => setSelectedCourse(course.id)}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base truncate">{course.title}</CardTitle>
                  {course.title_ar && <p className="text-xs text-muted-foreground font-arabic" dir="rtl">{course.title_ar}</p>}
                </div>
                <Badge variant={course.is_published ? "default" : "secondary"} className="shrink-0 ms-2">
                  {course.is_published ? t("Published", "منشور") : t("Draft", "مسودة")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{course.level || "beginner"}</Badge>
                {(course as any).subjects?.title && <Badge variant="outline">{(course as any).subjects.title}</Badge>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openEditCourse(course); }}><Edit className="h-3 w-3 me-1" />{t("Edit", "تعديل")}</Button>
                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); togglePublish.mutate({ id: course.id, published: !course.is_published }); }}>
                  {course.is_published ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
                <Button size="sm" variant="destructive" onClick={(e) => { e.stopPropagation(); deleteCourse.mutate(course.id); }}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lessons Panel */}
      {selectedCourse && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t("Lessons", "الدروس")} — {(courses || []).find((c: any) => c.id === selectedCourse)?.title}</CardTitle>
            <Dialog open={lessonOpen} onOpenChange={(v) => { setLessonOpen(v); if (!v) { setEditLessonId(null); resetLessonForm(); } }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 me-1" />{t("Add Lesson", "إضافة درس")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editLessonId ? t("Edit Lesson", "تعديل الدرس") : t("New Lesson", "درس جديد")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>{t("Title (EN)", "العنوان")}</Label><Input value={lessonForm.title} onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })} /></div>
                    <div><Label>{t("Title (AR)", "العنوان (عربي)")}</Label><Input value={lessonForm.title_ar} onChange={(e) => setLessonForm({ ...lessonForm, title_ar: e.target.value })} dir="rtl" /></div>
                  </div>
                  <div><Label>{t("Video URL", "رابط الفيديو")}</Label><Input value={lessonForm.video_url} onChange={(e) => setLessonForm({ ...lessonForm, video_url: e.target.value })} placeholder="https://youtube.com/embed/..." /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>{t("Duration (min)", "المدة (دقيقة)")}</Label><Input type="number" value={lessonForm.duration_minutes} onChange={(e) => setLessonForm({ ...lessonForm, duration_minutes: parseInt(e.target.value) || 0 })} /></div>
                    <div><Label>{t("Sort Order", "الترتيب")}</Label><Input type="number" value={lessonForm.sort_order} onChange={(e) => setLessonForm({ ...lessonForm, sort_order: parseInt(e.target.value) || 0 })} /></div>
                  </div>
                  <Button className="w-full" onClick={() => saveLesson.mutate(lessonForm)} disabled={!lessonForm.title || saveLesson.isPending}>
                    {saveLesson.isPending ? t("Saving...", "جاري الحفظ...") : t("Save Lesson", "حفظ الدرس")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {(lessons || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("No lessons yet. Add your first lesson.", "لا توجد دروس بعد. أضف أول درس.")}</p>
            ) : (
              <div className="space-y-2">
                {(lessons || []).map((lesson: any, idx: number) => (
                  <div key={lesson.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <span className="text-sm font-bold text-muted-foreground w-6">{idx + 1}</span>
                    <Video className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{lesson.title}</p>
                      {lesson.duration_minutes > 0 && <p className="text-xs text-muted-foreground">{lesson.duration_minutes} min</p>}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => openEditLesson(lesson)}><Edit className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteLesson.mutate(lesson.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CourseManagement;
