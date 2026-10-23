import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Target, Edit, Trash2, Save, ChevronDown, ChevronUp, BookOpen } from "lucide-react";

const SubjectSyllabus = ({ subjectId }: { subjectId: string }) => {
  const { t } = useLanguage();
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const isPrivileged = hasRole("admin") || hasRole("teacher");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ week_number: 1, title: "", description: "", objectives: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ week_number: 1, title: "", description: "", objectives: "" });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: syllabus = [], isLoading } = useQuery({
    queryKey: ["syllabus", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("subject_syllabus")
        .select("*").eq("subject_id", subjectId).order("week_number");
      if (error) throw error;
      return data as any[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("subject_syllabus").insert({
        subject_id: subjectId,
        week_number: form.week_number,
        title: form.title,
        description: form.description || null,
        objectives: form.objectives ? form.objectives.split("\n").filter(Boolean) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["syllabus", subjectId] });
      setOpen(false);
      setForm({ week_number: (syllabus.length || 0) + 2, title: "", description: "", objectives: "" });
      toast({ title: t("Week added", "تمت الإضافة") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      const { error } = await supabase.from("subject_syllabus").update({
        week_number: editForm.week_number,
        title: editForm.title,
        description: editForm.description || null,
        objectives: editForm.objectives ? editForm.objectives.split("\n").filter(Boolean) : null,
      }).eq("id", editingId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["syllabus", subjectId] });
      setEditingId(null);
      toast({ title: t("Updated", "تم التحديث") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subject_syllabus").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["syllabus", subjectId] });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const openEdit = (s: any) => {
    setEditForm({
      week_number: s.week_number,
      title: s.title,
      description: s.description || "",
      objectives: s.objectives ? (s.objectives as string[]).join("\n") : "",
    });
    setEditingId(s.id);
  };

  if (isLoading) return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-2xl" />)}
    </div>
  );

  const weekColors = [
    { bg: "#EFF6FF", border: "#BFDBFE", badge: "#1D4ED8", text: "#1E40AF" },
    { bg: "#F0FDF4", border: "#BBF7D0", badge: "#15803D", text: "#166534" },
    { bg: "#FDF4FF", border: "#E9D5FF", badge: "#7C3AED", text: "#6D28D9" },
    { bg: "#FFF7ED", border: "#FED7AA", badge: "#C2410C", text: "#9A3412" },
    { bg: "#FFF1F2", border: "#FECDD3", badge: "#BE123C", text: "#9F1239" },
    { bg: "#ECFDF5", border: "#A7F3D0", badge: "#065F46", text: "#064E3B" },
  ];

  return (
    <div className="space-y-4">
      {isPrivileged && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2 rounded-xl">
                <Plus className="h-4 w-4" />{t("Add Week", "إضافة أسبوع")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("Add Syllabus Week", "إضافة أسبوع للمنهج")}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>{t("Week Number", "رقم الأسبوع")}</Label><Input type="number" value={form.week_number} onChange={e => setForm({ ...form, week_number: parseInt(e.target.value) || 1 })} /></div>
                <div><Label>{t("Title", "العنوان")}</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Surah Al-Fatiha (1–7)" /></div>
                <div><Label>{t("Description", "الوصف")}</Label><Textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                <div><Label>{t("Learning Objectives (one per line)", "أهداف التعلم")}</Label><Textarea rows={4} value={form.objectives} onChange={e => setForm({ ...form, objectives: e.target.value })} /></div>
                <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={!form.title || saveMutation.isPending}>
                  {t("Save", "حفظ")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {syllabus.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="h-8 w-8 text-primary/50" />
          </div>
          <p className="text-muted-foreground font-medium">{t("No syllabus yet", "لا يوجد منهج بعد")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("The teacher will add weekly content soon.", "سيضيف المعلم المحتوى الأسبوعي قريبًا.")}</p>
        </div>
      ) : (
        /* Timeline layout */
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[22px] top-8 bottom-8 w-0.5 bg-gradient-to-b from-primary/30 via-primary/20 to-transparent" />

          <div className="space-y-3">
            {syllabus.map((s, idx) => {
              const color = weekColors[idx % weekColors.length];
              const isOpen = expanded.has(s.id);
              const hasDetail = s.description || (s.objectives && (s.objectives as string[]).length > 0);

              return (
                <div key={s.id} className="relative flex gap-4">
                  {/* Week badge on timeline */}
                  <div className="relative z-10 shrink-0">
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center font-black text-xs shadow-sm border-2"
                      style={{ background: color.badge, borderColor: color.badge, color: "#fff" }}
                    >
                      W{s.week_number}
                    </div>
                  </div>

                  {/* Card */}
                  <div
                    className="flex-1 rounded-2xl border overflow-hidden shadow-sm transition-shadow hover:shadow-md"
                    style={{ background: color.bg, borderColor: color.border }}
                  >
                    {/* Header row */}
                    <button
                      className="w-full flex items-center justify-between p-4 text-left"
                      onClick={() => hasDetail && toggleExpand(s.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm leading-snug" style={{ color: color.text }}>{s.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: color.text, opacity: 0.65 }}>
                          Week {s.week_number}
                          {s.objectives ? ` · ${(s.objectives as string[]).length} objective${(s.objectives as string[]).length !== 1 ? "s" : ""}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {isPrivileged && (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={e => { e.stopPropagation(); openEdit(s); }}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-destructive" onClick={e => { e.stopPropagation(); setDeleteId(s.id); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {hasDetail && (
                          <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ color: color.badge }}>
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        )}
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isOpen && hasDetail && (
                      <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: color.border }}>
                        {s.description && (
                          <p className="text-sm leading-relaxed pt-3 text-justify" style={{ color: color.text, opacity: 0.85 }}>
                            {s.description}
                          </p>
                        )}
                        {s.objectives && (s.objectives as string[]).length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: color.badge }}>
                              {t("Learning Objectives", "أهداف التعلم")}
                            </p>
                            {(s.objectives as string[]).map((obj, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-white text-xs font-bold" style={{ background: color.badge }}>
                                  {i + 1}
                                </div>
                                <span className="text-sm leading-relaxed text-justify" style={{ color: color.text, opacity: 0.9 }}>{obj}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingId} onOpenChange={v => !v && setEditingId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Edit Week", "تعديل الأسبوع")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t("Week Number", "رقم الأسبوع")}</Label><Input type="number" value={editForm.week_number} onChange={e => setEditForm({ ...editForm, week_number: parseInt(e.target.value) || 1 })} /></div>
            <div><Label>{t("Title", "العنوان")}</Label><Input value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} /></div>
            <div><Label>{t("Description", "الوصف")}</Label><Textarea rows={3} value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} /></div>
            <div><Label>{t("Learning Objectives (one per line)", "أهداف التعلم")}</Label><Textarea rows={4} value={editForm.objectives} onChange={e => setEditForm({ ...editForm, objectives: e.target.value })} /></div>
            <Button className="w-full gap-2" onClick={() => updateMutation.mutate()} disabled={!editForm.title || updateMutation.isPending}>
              <Save className="h-4 w-4" />{t("Save Changes", "حفظ التغييرات")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete this week?", "حذف هذا الأسبوع؟")}</AlertDialogTitle>
            <AlertDialogDescription>{t("This cannot be undone.", "لا يمكن التراجع.")}</AlertDialogDescription>
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

export default SubjectSyllabus;
