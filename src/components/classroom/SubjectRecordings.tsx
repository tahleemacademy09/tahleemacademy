import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Video, Play, Search, Clock, User, CheckCircle, Trash2, Edit, Save } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

const SubjectRecordings = ({ subjectId }: { subjectId: string }) => {
  const { t } = useLanguage();
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const isAdmin = hasRole("admin");
  const isTeacher = hasRole("teacher");
  const isPrivileged = isAdmin || isTeacher;

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ teacher_name: "", duration_seconds: 0 });

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: recordings, isLoading } = useQuery({
    queryKey: ["recordings", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("session_recordings")
        .select("*")
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: progressMap } = useQuery({
    queryKey: ["recording-progress", subjectId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const recIds = recordings?.map(r => r.id) || [];
      if (!recIds.length) return {};
      const { data } = await supabase
        .from("recording_watch_progress" as any)
        .select("*")
        .eq("student_id", user!.id)
        .in("recording_id", recIds);
      const map: Record<string, any> = {};
      (data || []).forEach((p: any) => { map[p.recording_id] = p; });
      return map;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, teacher_name, duration_seconds }: { id: string; teacher_name: string; duration_seconds: number }) => {
      const { error } = await supabase.from("session_recordings").update({ teacher_name, duration_seconds }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recordings", subjectId] });
      setEditingId(null);
      toast({ title: t("Recording updated", "تم تحديث التسجيل") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const rec = recordings?.find(r => r.id === id);
      if (rec?.file_url) {
        await supabase.storage.from("subject-files").remove([rec.file_url]);
      }
      const { error } = await supabase.from("session_recordings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recordings", subjectId] });
      setDeleteId(null);
      toast({ title: t("Recording deleted", "تم حذف التسجيل") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = recordings?.filter((r) =>
    (r.teacher_name || "").toLowerCase().includes(search.toLowerCase()) ||
    new Date(r.created_at!).toLocaleDateString().includes(search)
  );

  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
  };

  const openEdit = (r: any) => {
    setEditForm({ teacher_name: r.teacher_name || "", duration_seconds: r.duration_seconds || 0 });
    setEditingId(r.id);
  };

  if (isLoading) return (
    <div className="space-y-3">
      {[1, 2].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search recordings...", "بحث في التسجيلات...")} className="ps-9" />
        </div>
      </div>

      {!filtered?.length ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          <Video className="h-10 w-10 mx-auto mb-2 opacity-50" />
          {t("No recordings yet", "لا توجد تسجيلات بعد")}
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const prog = progressMap?.[r.id];
            const pct = prog && r.duration_seconds
              ? Math.min(100, Math.round((prog.progress_seconds / r.duration_seconds) * 100))
              : 0;
            const completed = prog?.completed;
            const started = prog && prog.progress_seconds > 0;

            return (
              <Card key={r.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-16 w-24 rounded-lg flex items-center justify-center shrink-0 relative overflow-hidden cursor-pointer"
                    style={{ background: "hsl(var(--primary) / 0.15)" }}
                    onClick={() => navigate(`/recordings/${r.id}`)}>
                    {r.thumbnail_url ? (
                      <img src={r.thumbnail_url} className="h-full w-full object-cover" alt="" />
                    ) : (
                      <Play className="h-6 w-6 text-primary" />
                    )}
                    {started && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                        <div className="h-full rounded-r-full" style={{ width: `${pct}%`, background: completed ? "hsl(var(--chart-2))" : "hsl(var(--accent-foreground))" }} />
                      </div>
                    )}
                    {completed && (
                      <div className="absolute top-1 right-1">
                        <CheckCircle className="h-4 w-4 text-green-500 bg-white rounded-full" />
                      </div>
                    )}
                    {!started && !completed && (
                      <div className="absolute top-1 left-1">
                        <Badge className="text-[9px] px-1 py-0 bg-accent text-accent-foreground">NEW</Badge>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/recordings/${r.id}`)}>
                    <p className="font-medium text-sm">
                      {new Date(r.created_at!).toLocaleDateString(undefined, {
                        weekday: "short", year: "numeric", month: "short", day: "numeric"
                      })}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                      <span className="flex items-center gap-1"><User className="h-3 w-3" />{r.teacher_name || "Teacher"}</span>
                      {r.duration_seconds != null && r.duration_seconds > 0 && (
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(r.duration_seconds)}</span>
                      )}
                    </div>
                    {started && !completed && (
                      <p className="text-xs mt-1 text-accent-foreground">{pct}% watched</p>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-1">
                    {isPrivileged && (
                      <>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(r); }}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteId(r.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/recordings/${r.id}`)}>
                      <Play className="h-3 w-3" />
                      {completed ? t("Rewatch", "إعادة") : started ? t("Continue", "متابعة") : t("Watch", "مشاهدة")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingId} onOpenChange={(v) => !v && setEditingId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Edit Recording", "تعديل التسجيل")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t("Teacher Name", "اسم المعلم")}</Label><Input value={editForm.teacher_name} onChange={(e) => setEditForm({ ...editForm, teacher_name: e.target.value })} /></div>
            <div><Label>{t("Duration (seconds)", "المدة (ثواني)")}</Label><Input type="number" value={editForm.duration_seconds} onChange={(e) => setEditForm({ ...editForm, duration_seconds: parseInt(e.target.value) || 0 })} /></div>
            <Button className="w-full gap-2" onClick={() => editingId && updateMutation.mutate({ id: editingId, ...editForm })} disabled={updateMutation.isPending}>
              <Save className="h-4 w-4" />{t("Save Changes", "حفظ التغييرات")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete Recording?", "حذف التسجيل؟")}</AlertDialogTitle>
            <AlertDialogDescription>{t("This action cannot be undone. The recording file will also be removed.", "لا يمكن التراجع عن هذا الإجراء. سيتم حذف ملف التسجيل أيضاً.")}</AlertDialogDescription>
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

export default SubjectRecordings;
