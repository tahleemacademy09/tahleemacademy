/*  src/pages/admin/SubjectManagement.tsx
    ENHANCED — Image upload per subject (stored in Supabase Storage),
    image preview in cards, better card design

    NOTE: Run this SQL first if image_url column doesn't exist:
    ALTER TABLE subjects ADD COLUMN IF NOT EXISTS image_url text;
*/
import { useState, useRef } from "react";
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
import {
  Plus, BookOpen, Trash2, Edit, Upload, Image, X, Loader2
} from "lucide-react";

const G    = "#0f2d1f";
const GOLD = "#c9a84c";

const SubjectManagement = () => {
  const { t }    = useLanguage();
  const { user } = useAuth();
  const qc       = useQueryClient();

  const [open, setOpen]       = useState(false);
  const [editId, setEditId]   = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: "", title_ar: "", description: "", description_ar: "",
    teacher_id: "", is_active: true, image_url: "",
  });

  // ── Queries ──────────────────────────────────────────────────
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
      const ids = teacherRoles.map(r => r.user_id);
      const { data } = await supabase.from("profiles").select("*").in("user_id", ids);
      return data || [];
    },
  });

  // ── Image upload ──────────────────────────────────────────────
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    // Upload to Supabase storage
    setUploading(true);
    try {
      const ext  = file.name.split(".").pop();
      const path = `subjects/${editId || crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("subject-images").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("subject-images").getPublicUrl(path);
      setForm(f => ({ ...f, image_url: urlData.publicUrl }));
      toast({ title: t("Image uploaded ✅", "تم رفع الصورة ✅") });
    } catch (err: any) {
      toast({ title: t("Upload failed", "فشل الرفع"), description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => {
    setImagePreview(null);
    setForm(f => ({ ...f, image_url: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Save mutation ─────────────────────────────────────────────
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
      closeDialog();
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

  const closeDialog = () => {
    setOpen(false);
    setEditId(null);
    setImagePreview(null);
    setForm({ title: "", title_ar: "", description: "", description_ar: "", teacher_id: "", is_active: true, image_url: "" });
  };

  const openEdit = (s: any) => {
    setEditId(s.id);
    setForm({
      title: s.title, title_ar: s.title_ar || "", description: s.description || "",
      description_ar: s.description_ar || "", teacher_id: s.teacher_id || "",
      is_active: s.is_active, image_url: s.image_url || "",
    });
    setImagePreview(s.image_url || null);
    setOpen(true);
  };

  // ── UI ────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("Subject Management", "إدارة المواد")}</h1>
          <p className="text-muted-foreground text-sm">{t("Create and manage subjects with cover images", "إنشاء وإدارة المواد مع صور الغلاف")}</p>
        </div>

        <Dialog open={open} onOpenChange={v => { if (!v) closeDialog(); else setOpen(true); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 me-2" />{t("Add Subject", "إضافة مادة")}</Button>
          </DialogTrigger>

          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? t("Edit Subject", "تعديل المادة") : t("New Subject", "مادة جديدة")}</DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              {/* ── Image upload ── */}
              <div>
                <Label className="mb-2 block">{t("Cover Image", "صورة الغلاف")}</Label>

                {imagePreview || form.image_url ? (
                  <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", height: 160 }}>
                    <img src={imagePreview || form.image_url} alt="Preview"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    {/* Overlay controls */}
                    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: 0, transition: "opacity .2s" }}
                      className="image-overlay-hover">
                      <button onClick={() => fileInputRef.current?.click()}
                        style={{ padding: "8px 16px", borderRadius: 8, background: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: G, display: "flex", alignItems: "center", gap: 6 }}>
                        <Upload style={{ width: 14, height: 14 }} />{t("Change", "تغيير")}
                      </button>
                      <button onClick={removeImage}
                        style={{ padding: "8px 16px", borderRadius: 8, background: "#ef4444", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                        <X style={{ width: 14, height: 14 }} />{t("Remove", "حذف")}
                      </button>
                    </div>
                    {uploading && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#fff", fontSize: 14, fontWeight: 700 }}>
                        <Loader2 style={{ width: 20, height: 20, animation: "spin .8s linear infinite" }} />
                        {t("Uploading…", "جارٍ الرفع…")}
                      </div>
                    )}
                    {/* Remove button always visible */}
                    <button onClick={removeImage}
                      style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,.6)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                      <X style={{ width: 14, height: 14 }} />
                    </button>
                    {/* Change button always visible */}
                    <button onClick={() => fileInputRef.current?.click()}
                      style={{ position: "absolute", bottom: 8, right: 8, padding: "5px 12px", borderRadius: 8, background: "rgba(0,0,0,.65)", border: "1px solid rgba(255,255,255,.3)", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 5 }}>
                      <Upload style={{ width: 11, height: 11 }} />{t("Change image", "تغيير الصورة")}
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{ height: 140, borderRadius: 12, border: "2px dashed #d1d5db", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", background: "#f8fafb", transition: "all .2s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = G; (e.currentTarget as HTMLElement).style.background = "#f0fff4"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#d1d5db"; (e.currentTarget as HTMLElement).style.background = "#f8fafb"; }}>
                    {uploading ? (
                      <>
                        <Loader2 style={{ width: 28, height: 28, color: G, animation: "spin .8s linear infinite" }} />
                        <span style={{ fontSize: 13, color: G, fontWeight: 600 }}>{t("Uploading…", "جارٍ الرفع…")}</span>
                      </>
                    ) : (
                      <>
                        <Image style={{ width: 32, height: 32, color: "#9ca3af" }} />
                        <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>{t("Click to upload image", "انقر لرفع صورة")}</span>
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>JPG, PNG, WebP • Max 5MB</span>
                      </>
                    )}
                  </div>
                )}

                {/* Or paste URL */}
                <div style={{ marginTop: 8 }}>
                  <Input
                    placeholder={t("Or paste image URL…", "أو الصق رابط الصورة…")}
                    value={form.image_url.startsWith("blob:") ? "" : form.image_url}
                    onChange={e => { setForm(f => ({ ...f, image_url: e.target.value })); setImagePreview(e.target.value || null); }}
                    className="text-sm"
                  />
                </div>

                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              </div>

              {/* Titles */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("Title (EN)", "العنوان (إنجليزي)")}</Label>
                  <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>{t("Title (AR)", "العنوان (عربي)")}</Label>
                  <Input value={form.title_ar} onChange={e => setForm({ ...form, title_ar: e.target.value })} dir="rtl" className="mt-1" />
                </div>
              </div>

              {/* Description */}
              <div>
                <Label>{t("Description (EN)", "الوصف (إنجليزي)")}</Label>
                <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1" />
              </div>
              <div>
                <Label>{t("Description (AR)", "الوصف (عربي)")}</Label>
                <Textarea value={form.description_ar} onChange={e => setForm({ ...form, description_ar: e.target.value })} dir="rtl" rows={2} className="mt-1" />
              </div>

              {/* Teacher */}
              <div>
                <Label>{t("Assign Teacher", "تعيين المعلم")}</Label>
                <Select value={form.teacher_id} onValueChange={v => setForm({ ...form, teacher_id: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder={t("Select teacher", "اختر المعلم")} /></SelectTrigger>
                  <SelectContent>
                    {teachers?.map(tc => (
                      <SelectItem key={tc.user_id} value={tc.user_id}>{tc.full_name || tc.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
                <Label>{t("Active", "نشط")}</Label>
              </div>

              <Button className="w-full" onClick={() => saveMutation.mutate(form)}
                disabled={!form.title || saveMutation.isPending || uploading}>
                {saveMutation.isPending ? t("Saving…", "جارٍ الحفظ…") : t("Save Subject", "حفظ المادة")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Subject cards grid */}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-52 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects?.map(s => (
            <div key={s.id} style={{ background: "#fff", borderRadius: 18, border: "1px solid #e5e7eb", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.06)" }}>
              {/* Image or gradient header */}
              <div style={{
                height: 140,
                background: (s as any).image_url
                  ? `linear-gradient(rgba(0,0,0,.3),rgba(0,0,0,.45)), url(${(s as any).image_url}) center/cover`
                  : `linear-gradient(135deg,${G},#1a4731)`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: "12px 14px",
                position: "relative"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <BookOpen style={{ width: 20, height: 20, color: "#fff" }} />
                  </div>
                  <Badge variant={s.is_active ? "default" : "secondary"} style={{ fontSize: 10 }}>
                    {s.is_active ? t("Active", "نشط") : t("Inactive", "غير نشط")}
                  </Badge>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#fff", marginBottom: 2 }}>{s.title}</div>
                  {s.title_ar && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }} dir="rtl">{s.title_ar}</div>}
                </div>

                {/* Image indicator */}
                {(s as any).image_url && (
                  <div style={{ position: "absolute", top: 12, right: 56, background: "rgba(0,0,0,.4)", borderRadius: 6, padding: "2px 7px", fontSize: 10, color: "rgba(255,255,255,.8)", display: "flex", alignItems: "center", gap: 3 }}>
                    <Image style={{ width: 10, height: 10 }} />image
                  </div>
                )}
              </div>

              {/* Body */}
              <div style={{ padding: "14px 16px" }}>
                <p style={{ fontSize: 13, color: "#7a9e88", marginBottom: 14, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden", minHeight: 38 }}>
                  {s.description || <span style={{ fontStyle: "italic", opacity: 0.5 }}>{t("No description", "لا يوجد وصف")}</span>}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(s)}>
                    <Edit className="h-3 w-3 me-1" />{t("Edit", "تعديل")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(s)} title={t("Upload image", "رفع صورة")}
                    style={{ borderColor: GOLD, color: GOLD }}>
                    <Upload className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => {
                    if (confirm(t("Delete this subject?", "حذف هذه المادة؟"))) deleteMutation.mutate(s.id);
                  }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {/* Empty state */}
          {!subjects?.length && (
            <div className="col-span-3 flex flex-col items-center justify-center py-20 text-muted-foreground">
              <BookOpen className="h-16 w-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">{t("No subjects yet", "لا توجد مواد بعد")}</p>
              <p className="text-sm">{t("Click 'Add Subject' to create one.", "انقر 'إضافة مادة' لإنشاء واحدة.")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SubjectManagement;
