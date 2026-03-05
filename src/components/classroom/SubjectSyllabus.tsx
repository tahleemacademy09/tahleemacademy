import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Calendar, Plus, Download, Target } from "lucide-react";

const SubjectSyllabus = ({ subjectId }: { subjectId: string }) => {
  const { t } = useLanguage();
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const isPrivileged = hasRole("admin") || hasRole("teacher");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ week_number: 1, title: "", description: "", objectives: "" });

  const { data: syllabus, isLoading } = useQuery({
    queryKey: ["syllabus", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("subject_syllabus")
        .select("*").eq("subject_id", subjectId).order("week_number");
      if (error) throw error;
      return data;
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
      setForm({ week_number: (syllabus?.length || 0) + 2, title: "", description: "", objectives: "" });
      toast({ title: t("Syllabus entry added", "تمت إضافة بند المنهج") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}</div>;

  return (
    <div className="space-y-4">
      {isPrivileged && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-3 w-3" />{t("Add Week", "إضافة أسبوع")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("Add Syllabus Entry", "إضافة بند للمنهج")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{t("Week Number", "رقم الأسبوع")}</Label><Input type="number" value={form.week_number} onChange={(e) => setForm({ ...form, week_number: parseInt(e.target.value) || 1 })} /></div>
              <div><Label>{t("Title", "العنوان")}</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>{t("Description", "الوصف")}</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>{t("Learning Objectives (one per line)", "أهداف التعلم (واحد لكل سطر)")}</Label><Textarea value={form.objectives} onChange={(e) => setForm({ ...form, objectives: e.target.value })} /></div>
              <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={!form.title || saveMutation.isPending}>
                {t("Save", "حفظ")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {!syllabus?.length ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          <Calendar className="h-10 w-10 mx-auto mb-2 opacity-50" />
          {t("No syllabus entries yet", "لا يوجد منهج بعد")}
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {syllabus.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 font-bold text-primary text-sm">
                    W{s.week_number}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{s.title}</p>
                    {s.description && <p className="text-sm text-muted-foreground mt-1">{s.description}</p>}
                    {s.objectives && (s.objectives as string[]).length > 0 && (
                      <div className="mt-2 space-y-1">
                        {(s.objectives as string[]).map((obj, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Target className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                            <span>{obj}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default SubjectSyllabus;
