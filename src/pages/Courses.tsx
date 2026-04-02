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
import { BookOpen, Users, Plus, Edit, Trash2, Eye, EyeOff, GraduationCap } from "lucide-react";

const LEVELS = ["beginner", "intermediate", "advanced"];

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

  const { data: courses = [], isLoading, isError } = useQuery({
    queryKey: ["public-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*").order("sort_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from("courses").update(form as any).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("courses").insert({ ...form, created_by: user?.id } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public-courses"] });
      closeDialog();
      toast({ title: editId ? "Course updated" : "Course created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public-courses"] });
      setDeleteId(null);
      toast({ title: "Course deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const visibleCourses = courses.filter((c: any) => isAdmin || c.is_published);
  const filtered = filter === "all"
    ? visibleCourses
    : visibleCourses.filter((c: any) => c.level === filter);

  const closeDialog = () => { setDialogOpen(false); setEditId(null); setForm(emptyCourseForm); };
  const openEdit = (c: any) => { setEditId(c.id); setForm({ title: c.title || "", title_ar: c.title_ar || "", description: c.description || "", description_ar: c.description_ar || "", level: c.level || "beginner", category: c.category || "", image_url: c.image_url || "", is_published: !!c.is_published, instructor_name: c.instructor_name || "", sort_order: c.sort_order || 0 }); setDialogOpen(true); };
  const openAdd = () => { setEditId(null); setForm(emptyCourseForm); setDialogOpen(true); };

  const resolveImageUrl = (url: string | null) => {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    // Storage path — get public URL from subject-images bucket
    const { data } = supabase.storage.from("subject-images").getPublicUrl(url);
    return data?.publicUrl || null;
  };

  const levelColor = (l: string) => l === "advanced" ? "bg-red-100 text-red-700" : l === "intermediate" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700";

  return (
    <div className="container mx-auto px-4 py-16">
      <Helmet>
        <title>{t("Courses - Tahleem Academy", "الدروس - أكاديمية التعليم")}</title>
        <meta name="description" content="Browse courses offered by Tahleem Academy" />
      </Helmet>

      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold" style={{ color: "#1a3d24", fontFamily: "'Playfair Display',serif" }}>
          {t("Our Courses", "دوراتنا")}
        </h1>
        <p className="text-muted-foreground mt-2">{t("Explore our Islamic studies curriculum", "استكشف مناهجنا الدراسية")}</p>
      </div>

      {/* Filter + Add */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div className="flex gap-2">
          {["all", ...LEVELS].map(l => (
            <Button key={l} variant={filter === l ? "default" : "outline"} size="sm" onClick={() => setFilter(l)}>
              {l === "all" ? t("All", "الكل") : l.charAt(0).toUpperCase() + l.slice(1)}
            </Button>
          ))}
        </div>
        {isAdmin && (
          <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />{t("Add Course", "إضافة دورة")}</Button>
        )}
      </div>

      {isLoading && <div className="text-center py-12 text-muted-foreground">{t("Loading courses...", "جارٍ التحميل...")}</div>}

      {!isError && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((course: any, i: number) => {
            const imgUrl = resolveImageUrl(course.image_url);
            return (
              <motion.div key={course.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="overflow-hidden h-full flex flex-col hover:shadow-lg transition-shadow">
                  {/* Image */}
                  <div className="relative h-48 bg-muted">
                    {imgUrl ? (
                      <img src={imgUrl} alt={course.title} className="w-full h-full object-cover" loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#1a3d24,#276749)" }}>
                        <BookOpen className="w-12 h-12 text-white/30" />
                      </div>
                    )}
                    {!course.is_published && isAdmin && (
                      <Badge className="absolute top-2 right-2 bg-yellow-500"><EyeOff className="w-3 h-3 mr-1" />Draft</Badge>
                    )}
                    {course.level && (
                      <Badge className={`absolute top-2 left-2 ${levelColor(course.level)}`}>
                        {course.level}
                      </Badge>
                    )}
                  </div>

                  <CardContent className="flex-1 flex flex-col p-5">
                    <h3 className="text-lg font-bold mb-1" style={{ color: "#1a3d24" }}>
                      {language === "ar" ? (course.title_ar || course.title) : course.title}
                    </h3>
                    {course.instructor_name && (
                      <p className="text-sm text-muted-foreground mb-2">
                        <GraduationCap className="w-3 h-3 inline mr-1" />{course.instructor_name}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground flex-1 line-clamp-3">
                      {language === "ar" ? (course.description_ar || course.description || "") : (course.description || "")}
                    </p>

                    {isAdmin && (
                      <div className="flex gap-2 mt-4 pt-3 border-t">
                        <Button size="sm" variant="outline" onClick={() => openEdit(course)}>
                          <Edit className="h-3 w-3 mr-1" />{t("Edit", "تعديل")}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setDeleteId(course.id)}>
                          <Trash2 className="h-3 w-3 mr-1" />{t("Delete", "حذف")}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>{t("No courses found", "لا توجد دورات")}</p>
        </div>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? t("Edit Course", "تعديل الدورة") : t("New Course", "دورة جديدة")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Title (English)</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <Label>العنوان (عربي)</Label>
                <Input value={form.title_ar} onChange={e => setForm({ ...form, title_ar: e.target.value })} dir="rtl" />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
            <div>
              <Label>الوصف (عربي)</Label>
              <Textarea value={form.description_ar} onChange={e => setForm({ ...form, description_ar: e.target.value })} rows={3} dir="rtl" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Level</Label>
                <Select value={form.level} onValueChange={v => setForm({ ...form, level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Image URL</Label>
              <Input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="https://... or storage path" />
            </div>
            <div>
              <Label>Instructor Name</Label>
              <Input value={form.instructor_name} onChange={e => setForm({ ...form, instructor_name: e.target.value })} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_published} onCheckedChange={v => setForm({ ...form, is_published: v })} />
              <Label>{t("Published", "منشور")}</Label>
            </div>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.title.trim()} className="w-full">
              {saveMutation.isPending ? "Saving..." : t("Save Course", "حفظ الدورة")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete this course?", "حذف هذه الدورة؟")}</AlertDialogTitle>
            <AlertDialogDescription>{t("This action cannot be undone.", "لا يمكن التراجع عن هذا الإجراء.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel", "إلغاء")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground">
              {t("Delete", "حذف")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Courses;
