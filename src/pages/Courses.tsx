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
import { storageSupabase } from "../integrations/supabase/storageClient";
import { toast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { BookOpen, Plus, Edit, Trash2, EyeOff, GraduationCap, Star, Search } from "lucide-react";

const LEVELS = ["beginner", "intermediate", "advanced"];

const LEVEL_CONFIG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  beginner:     { color: "#16A34A", bg: "#DCFCE7", label: "Beginner",     icon: "🌱" },
  intermediate: { color: "#D97706", bg: "#FEF3C7", label: "Intermediate", icon: "📗" },
  advanced:     { color: "#7C3AED", bg: "#EDE9FE", label: "Advanced",     icon: "🏆" },
};

const FALLBACK_GRADIENTS = [
  "linear-gradient(135deg, #064E3B 0%, #065F46 50%, #047857 100%)",
  "linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 60%, #2563EB 100%)",
  "linear-gradient(135deg, #7C2D12 0%, #9A3412 60%, #C2410C 100%)",
  "linear-gradient(135deg, #4A1D96 0%, #6D28D9 60%, #7C3AED 100%)",
  "linear-gradient(135deg, #065F46 0%, #D97706 100%)",
  "linear-gradient(135deg, #1E3A8A 0%, #059669 100%)",
];

const emptyCourseForm = {
  title: "", title_ar: "", description: "", description_ar: "",
  level: "beginner", category: "", image_url: "", is_published: false,
  instructor_name: "", sort_order: 0,
};

// Image with reliable error fallback using useState
const CourseImage = ({ url, title, index }: { url: string | null; title: string; index: number }) => {
  const [failed, setFailed] = useState(false);
  const gradient = FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length];

  if (!url || failed) {
    return (
      <div style={{ width: "100%", height: "100%", background: gradient, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <BookOpen style={{ width: 26, height: 26, color: "rgba(255,255,255,0.7)" }} />
        </div>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: 1, textTransform: "uppercase" }}>No Image</span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={title}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transition: "transform 0.4s ease" }}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
};

const Courses = () => {
  const { t, language } = useLanguage();
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const isAdmin = hasRole?.("admin") || hasRole?.("teacher");

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyCourseForm);

  const { data: courses = [], isLoading } = useQuery({
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
  const filtered = visibleCourses.filter((c: any) => {
    const matchLevel = filter === "all" || c.level === filter;
    const matchSearch = !search || (c.title || "").toLowerCase().includes(search.toLowerCase()) || (c.description || "").toLowerCase().includes(search.toLowerCase());
    return matchLevel && matchSearch;
  });

  const closeDialog = () => { setDialogOpen(false); setEditId(null); setForm(emptyCourseForm); };
  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({ title: c.title || "", title_ar: c.title_ar || "", description: c.description || "", description_ar: c.description_ar || "", level: c.level || "beginner", category: c.category || "", image_url: c.image_url || "", is_published: !!c.is_published, instructor_name: c.instructor_name || "", sort_order: c.sort_order || 0 });
    setDialogOpen(true);
  };
  const openAdd = () => { setEditId(null); setForm(emptyCourseForm); setDialogOpen(true); };

  const resolveImageUrl = (url: string | null): string | null => {
    if (!url || url.trim() === "") return null;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    const { data } = storageSupabase.storage.from("subject-images").getPublicUrl(url);
    return data?.publicUrl || null;
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Cairo:wght@400;600;700&display=swap');
        .course-card-wrap { transition: transform 0.25s ease, box-shadow 0.25s ease; border-radius: 16px; overflow: hidden; background: #fff; border: 1px solid #f0f0f0; box-shadow: 0 2px 12px rgba(0,0,0,0.06); display: flex; flex-direction: column; }
        .course-card-wrap:hover { transform: translateY(-6px); box-shadow: 0 16px 40px rgba(0,0,0,0.12); }
        .course-card-wrap:hover .c-img img { transform: scale(1.06); }
        .filter-pill { border: 1.5px solid #e5e7eb; background: #fff; color: #555; cursor: pointer; padding: 7px 18px; border-radius: 30px; font-size: 13px; font-weight: 600; font-family: 'Cairo',sans-serif; display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
        .filter-pill.active { background: #064E3B; color: #fff; border-color: #064E3B; box-shadow: 0 2px 8px rgba(6,78,59,0.25); }
        .filter-pill:not(.active):hover { background: #f0fdf4; border-color: #064E3B; color: #064E3B; }
        @keyframes skeleton { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>

      <Helmet>
        <title>{t("Courses - Tahleem Academy", "الدروس - أكاديمية التعليم")}</title>
        <meta name="description" content="Browse Islamic courses offered by Tahleem Academy" />
      </Helmet>

      {/* HERO */}
      <div style={{ background: "linear-gradient(135deg, #064E3B 0%, #065F46 60%, #047857 100%)", padding: "48px 24px 40px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.06, backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l8.66 5v10L30 20l-8.66-5V5z' fill='%23D4A843'/%3E%3C/svg%3E\")" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-block", background: "rgba(212,168,67,0.15)", border: "1px solid rgba(212,168,67,0.4)", borderRadius: 30, padding: "4px 18px", fontSize: 11, color: "#D4A843", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14, fontWeight: 700 }}>
            ✦ Islamic Learning Excellence ✦
          </div>
          <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px,5vw,44px)", fontWeight: 700, color: "#fff", marginBottom: 8, lineHeight: 1.2 }}>
            {t("Our Courses", "دوراتنا")}
          </h1>
          <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 15, maxWidth: 480, margin: "0 auto" }}>
            {t("Structured Islamic learning for every level — from beginner to advanced", "تعليم إسلامي منظم لكل مستوى")}
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 28, flexWrap: "wrap" }}>
            {[["4", "Programs"], ["3", "Levels"], ["Live", "Classes"]].map(([n, l]) => (
              <div key={l} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 700, color: "#D4A843", lineHeight: 1 }}>{n}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2, letterSpacing: 0.5 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 20px 60px" }}>

        {/* FILTERS */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { key: "all", label: t("All", "الكل"), icon: "📚" },
              ...LEVELS.map(l => ({ key: l, label: LEVEL_CONFIG[l].label, icon: LEVEL_CONFIG[l].icon }))
            ].map(({ key, label, icon }) => (
              <button key={key} className={`filter-pill ${filter === key ? "active" : ""}`} onClick={() => setFilter(key)}>
                <span>{icon}</span> {label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "#9ca3af" }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("Search...", "بحث...")} style={{ paddingLeft: 32, paddingRight: 12, height: 38, borderRadius: 20, border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none", width: 160 }} />
            </div>
            {isAdmin && (
              <Button onClick={openAdd} style={{ borderRadius: 20, background: "#064E3B", gap: 6 }}>
                <Plus className="h-4 w-4" />{t("Add Course", "إضافة")}
              </Button>
            )}
          </div>
        </div>

        {/* SKELETON LOADING */}
        {isLoading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 24 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ borderRadius: 16, overflow: "hidden", background: "#f3f4f6", height: 340, animation: "skeleton 1.5s ease-in-out infinite" }} />
            ))}
          </div>
        )}

        {/* COURSE LIST — horizontal cards */}
        {!isLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map((course: any, i: number) => {
              const imgUrl = resolveImageUrl(course.image_url);
              const lvl = LEVEL_CONFIG[course.level] ?? LEVEL_CONFIG.beginner;
              return (
                <motion.div key={course.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  style={{ background: "#fff", borderRadius: 18, border: "1px solid #e5e7eb", overflow: "hidden", display: "flex", height: 130, boxShadow: "0 2px 10px rgba(0,0,0,0.06)", transition: "box-shadow .2s, transform .2s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 28px rgba(6,78,59,0.13)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 10px rgba(0,0,0,0.06)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}
                >
                  {/* Image panel */}
                  <div className="c-img" style={{ position: "relative", width: 150, flexShrink: 0, overflow: "hidden" }}>
                    <CourseImage url={imgUrl} title={course.title || ""} index={i} />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, transparent 55%, rgba(255,255,255,0.92))", pointerEvents: "none" }} />
                    {!course.is_published && isAdmin && (
                      <div style={{ position: "absolute", top: 8, left: 7, background: "#F59E0B", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>
                        <EyeOff style={{ width: 9, height: 9, display: "inline", marginRight: 3 }} />DRAFT
                      </div>
                    )}
                    {course.category && (
                      <div style={{ position: "absolute", bottom: 8, left: 7, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", color: "#fff", fontSize: 9, padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>
                        {course.category}
                      </div>
                    )}
                  </div>

                  {/* Content panel */}
                  <div style={{ flex: 1, minWidth: 0, padding: "14px 16px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {course.title_ar && (
                            <p style={{ fontFamily: "'Cairo',sans-serif", fontSize: 14, color: "#D4A843", direction: "rtl", margin: "0 0 2px", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{course.title_ar}</p>
                          )}
                          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#064E3B", margin: 0, lineHeight: 1.3, fontFamily: "'Cormorant Garamond',serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {language === "ar" ? (course.title_ar || course.title) : course.title}
                          </h3>
                        </div>
                        {course.level && (
                          <span style={{ flexShrink: 0, background: lvl.bg, color: lvl.color, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
                            {lvl.icon} {lvl.label}
                          </span>
                        )}
                      </div>
                      {course.instructor_name && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>
                          <GraduationCap style={{ width: 11, height: 11 }} />{course.instructor_name}
                        </div>
                      )}
                      <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.55, margin: 0, display: "-webkit-box" as any, WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }}>
                        {language === "ar" ? (course.description_ar || course.description || "") : (course.description || "")}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Star style={{ width: 11, height: 11, color: "#D4A843", fill: "#D4A843" }} />
                        <span style={{ fontSize: 10, color: "#9ca3af" }}>All Levels Welcome</span>
                      </div>
                      {isAdmin ? (
                        <div style={{ display: "flex", gap: 5 }}>
                          <button onClick={() => openEdit(course)} style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#F0FDF4", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 3, color: "#064E3B", fontWeight: 600 }}>
                            <Edit style={{ width: 10, height: 10 }} />{t("Edit", "تعديل")}
                          </button>
                          <button onClick={() => setDeleteId(course.id)} style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #fee2e2", background: "#fff5f5", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 3, color: "#ef4444", fontWeight: 600 }}>
                            <Trash2 style={{ width: 10, height: 10 }} />{t("Delete", "حذف")}
                          </button>
                        </div>
                      ) : (
                        <a href="/register" style={{ padding: "7px 18px", borderRadius: 8, background: "linear-gradient(135deg,#064E3B,#075E54)", color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
                          {t("Enroll", "التسجيل")} →
                        </a>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* EMPTY STATE */}
        {!isLoading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#f0fdf4", border: "2px solid #d1fae5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <BookOpen style={{ width: 36, height: 36, color: "#064E3B", opacity: 0.4 }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: "#374151", marginBottom: 8 }}>{t("No courses found", "لا توجد دورات")}</h3>
            <p style={{ fontSize: 14, color: "#9ca3af" }}>{search ? t("Try a different search", "جرب بحثاً مختلفاً") : t("Check back soon!", "تفقد قريباً!")}</p>
            {search && <button onClick={() => setSearch("")} style={{ marginTop: 14, padding: "8px 20px", borderRadius: 20, border: "1px solid #064E3B", color: "#064E3B", background: "#fff", cursor: "pointer", fontSize: 13 }}>Clear Search</button>}
          </div>
        )}
      </div>

      {/* EDIT/CREATE DIALOG */}
      <Dialog open={dialogOpen} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? t("Edit Course", "تعديل الدورة") : t("New Course", "دورة جديدة")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Title (English)</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>العنوان (عربي)</Label><Input value={form.title_ar} onChange={e => setForm({ ...form, title_ar: e.target.value })} dir="rtl" /></div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} /></div>
            <div><Label>الوصف (عربي)</Label><Textarea value={form.description_ar} onChange={e => setForm({ ...form, description_ar: e.target.value })} rows={3} dir="rtl" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Level</Label>
                <Select value={form.level} onValueChange={v => setForm({ ...form, level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Category</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
            </div>
            <div>
              <Label>Image URL or Storage Path</Label>
              <Input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="https://... or supabase storage path" />
              {form.image_url && (
                <div style={{ marginTop: 8, borderRadius: 8, overflow: "hidden", height: 90, background: "#f3f4f6" }}>
                  <img src={form.image_url.startsWith("http") ? form.image_url : storageSupabase.storage.from("subject-images").getPublicUrl(form.image_url).data.publicUrl} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }} />
                </div>
              )}
            </div>
            <div><Label>Instructor Name</Label><Input value={form.instructor_name} onChange={e => setForm({ ...form, instructor_name: e.target.value })} /></div>
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

      {/* DELETE CONFIRM */}
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
    </>
  );
};

export default Courses;
