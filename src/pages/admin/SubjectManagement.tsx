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
import { toast } from "@/hooks/use-toast";
import { Plus, BookOpen, Users, Trash2, Edit, Video } from "lucide-react";

const SubjectManagement = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", title_ar: "", description: "", description_ar: "", teacher_id: "", is_active: true });

  const { data: subjects, isLoading } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: teachers } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => {
      const { data: teacherRoles } = await supabase.from("user_roles").select("user_id").in("role", ["teacher", "admin"]);
      if (!teacherRoles?.length) return [];
      const ids = teacherRoles.map((r) => r.user_id);
      const { data } = await supabase.from("profiles").select("*").in("user_id", ids);
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form) => {
      const payload = {
        ...values,
        teacher_id: values.teacher_id || null,
        livekit_room_name: `subject-${editId || crypto.randomUUID()}`,
        created_by: user?.id,
      };
      if (editId) {
        const { error } = await supabase.from("subjects").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subjects").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subjects"] });
      setOpen(false);
      setEditId(null);
      setForm({ title: "", title_ar: "", description: "", description_ar: "", teacher_id: "", is_active: true });
      toast({ title: t("Subject saved", "تم حفظ المادة") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subjects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subjects"] });
      toast({ title: t("Subject deleted", "تم حذف المادة") });
    },
  });

  const openEdit = (s: any) => {
    setEditId(s.id);
    setForm({ title: s.title, title_ar: s.title_ar || "", description: s.description || "", description_ar: s.description_ar || "", teacher_id: s.teacher_id || "", is_active: s.is_active });
    setOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("Subject Management", "إدارة المواد")}</h1>
          <p className="text-muted-foreground text-sm">{t("Create and manage live class subjects", "إنشاء وإدارة مواد الفصول الحية")}</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); setForm({ title: "", title_ar: "", description: "", description_ar: "", teacher_id: "", is_active: true }); } }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 me-2" />{t("Add Subject", "إضافة مادة")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editId ? t("Edit Subject", "تعديل المادة") : t("New Subject", "مادة جديدة")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("Title (EN)", "العنوان (إنجليزي)")}</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div><Label>{t("Title (AR)", "العنوان (عربي)")}</Label><Input value={form.title_ar} onChange={(e) => setForm({ ...form, title_ar: e.target.value })} dir="rtl" /></div>
              </div>
              <div><Label>{t("Description", "الوصف")}</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div>
                <Label>{t("Assign Teacher", "تعيين المعلم")}</Label>
                <Select value={form.teacher_id} onValueChange={(v) => setForm({ ...form, teacher_id: v })}>
                  <SelectTrigger><SelectValue placeholder={t("Select teacher", "اختر المعلم")} /></SelectTrigger>
                  <SelectContent>
                    {teachers?.map((tc) => (
                      <SelectItem key={tc.user_id} value={tc.user_id}>{tc.full_name || tc.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>{t("Active", "نشط")}</Label>
              </div>
              <Button className="w-full" onClick={() => saveMutation.mutate(form)} disabled={!form.title || saveMutation.isPending}>
                {saveMutation.isPending ? t("Saving...", "جاري الحفظ...") : t("Save", "حفظ")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects?.map((s) => (
            <Card key={s.id} className="card-premium">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{s.title}</CardTitle>
                      {s.title_ar && <p className="text-xs text-muted-foreground font-arabic" dir="rtl">{s.title_ar}</p>}
                    </div>
                  </div>
                  <Badge variant={s.is_active ? "default" : "secondary"}>{s.is_active ? t("Active", "نشط") : t("Inactive", "غير نشط")}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{s.description || t("No description", "لا يوجد وصف")}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(s)}><Edit className="h-3 w-3 me-1" />{t("Edit", "تعديل")}</Button>
                  <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(s.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default SubjectManagement;
