import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { BookOpen, Clock, Users, Plus, Edit, Trash2, Eye, EyeOff, GraduationCap } from "lucide-react";
// Images served from /public/images — no import needed, use absolute paths below

const LEVELS = ["beginner", "intermediate", "advanced"];

const levelLabel = (l: string, t: (en: string, ar: string) => string) => {
  if (l === "beginner") return t("Beginner", "مبتدئ");
  if (l === "intermediate") return t("Intermediate", "متوسط");
  return t("Advanced", "متقدم");
};

const levelColor = (l: string) => {
  if (l === "beginner") return "bg-emerald/10 text-emerald";
  if (l === "intermediate") return "bg-secondary/20 text-secondary-foreground";
  return "bg-primary/10 text-primary";
};

const defaultImage = (category?: string | null) => {
  if (category?.toLowerCase().includes("tajweed") || category?.toLowerCase().includes("quran")) return "/images/quran-tajweed.jpeg";
  return "/images/arabic-language.jpeg";
};

const emptyCourseForm = {
  title: "", title_ar: "", description: "", description_ar: "",
  level: "beginner", category: "", image_url: "", is_published: false,
  instructor_name: "", sort_order: 0,
};

const Courses = () => {
  const { t, language } = useLanguage();
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const isAdmin = hasRole?.("admin") || hasRole?.("teacher");

  const [filter, setFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyCourseForm);

  // Fetch courses from DB
  const { data: courses, isLoading } = useQuery({
    queryKey: ["public-courses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch enrollment counts
  const { data: enrollmentCounts } = useQuery({
    queryKey: ["enrollment-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("course_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((e: any) => {
        counts[e.course_id] = (counts[e.course_id] || 0) + 1;
      });
      return counts;
    },
  });

  // Filter: admins see all, others see published only
  const visibleCourses = (courses || []).filter((c: any) => isAdmin || c.is_published);
  const filtered = filter === "all" ? visibleCourses : visibleCourses.filter((c: any) => c.level === filter);

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async (values: typeof emptyCourseForm) => {
      const payload = { ...values, created_by: user?.id };
      if (editId) {
        const { error } = await supabase.from("courses").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("courses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public-courses"] });
      closeDialog();
      toast({ title: t("Course saved successfully", "تم حفظ الدورة بنجاح") });
    },
    onError: (e: any) => toast({ title: t("Error", "خطأ"), description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public-courses"] });
      setDeleteId(null);
      toast({ title: t("Course deleted", "تم حذف الدورة") });
    },
    onError: (e: any) => toast({ title: t("Error", "خطأ"), description: e.message, variant: "destructive" }),
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
      const { error } = await supabase.from("courses").update({ is_published: published }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public-courses"] });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditId(null);
    setForm(emptyCourseForm);
  };

  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({
      title: c.title || "", title_ar: c.title_ar || "",
      description: c.description || "", description_ar: c.description_ar || "",
      level: c.level || "beginner", category: c.category || "",
      image_url: c.image_url || "", is_published: c.is_published || false,
      instructor_name: c.instructor_name || "", sort_order: c.sort_order || 0,
    });
    setDialogOpen(true);
  };

  const openAdd = () => {
    setEditId(null);
    setForm(emptyCourseForm);
    setDialogOpen(true);
  };

  return (
    <div className="container mx-auto px-4 py-16">
      <Helmet>
        <title>Islamic Courses | Arabic, Tajweed &amp; Quran — Tahleem Academy</title>
        <meta name="description" content="Browse Quran, Tajweed, Arabic Language, and Islamic Sciences courses at Tahleem Academy. Learn online with qualified scholars at every level." />
      </Helmet>
      <div className="mb-10 text-center">
        <h1 className="mb-3 text-4xl font-bold">{t("Our Courses", "دوراتنا")}</h1>
        <p className="text-muted-foreground">{t("Choose your path to Arabic mastery", "اختر طريقك لإتقان العربية")}</p>
      </div>

      {/* Admin Add Button */}
      {isAdmin && (
        <div className="mb-6 flex justify-center">
          <Button onClick={openAdd} size="lg">
            <Plus className="h-4 w-4 me-2" />
            {t("Add New Course", "إضافة دورة جديدة")}
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="mb-8 flex flex-wrap justify-center gap-2">
        {["all", ...LEVELS].map((l) => (
          <Button key={l} variant={filter === l ? "default" : "outline"} size="sm" onClick={() => setFilter(l)}>
            {l === "all" ? t("All Levels", "جميع المستويات") : levelLabel(l, t)}
          </Button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-16">
          <div className="h-10 w-10 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">{t("No courses available yet.", "لا توجد دورات متاحة بعد.")}</p>
        </div>
      )}

      {/* Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((course: any, i: number) => (
          <motion.div key={course.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="group h-full overflow-hidden hover:shadow-lg transition-shadow relative">
              {/* Unpublished indicator */}
              {!course.is_published && isAdmin && (
                <div className="absolute top-2 left-2 z-10">
                  <Badge variant="secondary" className="text-[10px]">{t("Draft", "مسودة")}</Badge>
                </div>
              )}
              <div className="h-40 overflow-hidden">
                <img
                  src={course.image_url || defaultImage(course.category)}
                  alt={language === "ar" ? course.title_ar || course.title : course.title}
                  className="h-full w-full object-cover group-hover:scale-110 transition-transform"
                />
              </div>
              <CardContent className="p-5">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="secondary" className={levelColor(course.level || "beginner")}>
                    {levelLabel(course.level || "beginner", t)}
                  </Badge>
                  {course.category && <span className="text-xs text-muted-foreground">{course.category}</span>}
                </div>
                <h3 className="mb-2 text-lg font-semibold">
                  {language === "ar" ? course.title_ar || course.title : course.title}
                </h3>
                <p className="mb-4 text-sm text-muted-foreground line-clamp-2">
                  {language === "ar" ? course.description_ar || course.description : course.description}
                </p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {enrollmentCounts?.[course.id] || 0} {t("students", "طالب")}
                  </div>
                  {course.instructor_name && (
                    <div className="flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      {course.instructor_name}
                    </div>
                  )}
                </div>

                {/* Admin actions */}
                {isAdmin && (
                  <div className="mt-3 pt-3 border-t border-border flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(course)}>
                      <Edit className="h-3 w-3 me-1" />{t("Edit", "تعديل")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => togglePublish.mutate({ id: course.id, published: !course.is_published })}>
                      {course.is_published ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleteId(course.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? t("Edit Course", "تعديل الدورة") : t("New Course", "دورة جديدة")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("Title (EN)", "العنوان (إنجليزي)")}</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>{t("Title (AR)", "العنوان (عربي)")}</Label><Input value={form.title_ar} onChange={(e) => setForm({ ...form, title_ar: e.target.value })} dir="rtl" /></div>
            </div>
            <div><Label>{t("Description (EN)", "الوصف (إنجليزي)")}</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>{t("Description (AR)", "الوصف (عربي)")}</Label><Textarea value={form.description_ar} onChange={(e) => setForm({ ...form, description_ar: e.target.value })} dir="rtl" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("Level", "المستوى")}</Label>
                <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVELS.map(l => <SelectItem key={l} value={l}>{levelLabel(l, t)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("Category", "التصنيف")}</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Tajweed, Arabic" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("Instructor Name", "اسم المعلم")}</Label><Input value={form.instructor_name} onChange={(e) => setForm({ ...form, instructor_name: e.target.value })} /></div>
              <div><Label>{t("Image URL", "رابط الصورة")}</Label><Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("Sort Order", "الترتيب")}</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} /></div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={form.is_published} onCheckedChange={(v) => setForm({ ...form, is_published: v })} />
                <Label>{t("Published", "منشور")}</Label>
              </div>
            </div>
            <Button className="w-full" onClick={() => saveMutation.mutate(form)} disabled={!form.title || saveMutation.isPending}>
              {saveMutation.isPending ? t("Saving...", "جاري الحفظ...") : t("Save Course", "حفظ الدورة")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete Course?", "حذف الدورة؟")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("This will permanently delete this course and all its lessons.", "سيتم حذف هذه الدورة ودروسها نهائياً.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel", "إلغاء")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("Delete", "حذف")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Courses;
