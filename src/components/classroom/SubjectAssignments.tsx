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
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { ClipboardList, Plus, Upload, Clock, CheckCircle, AlertCircle, Send } from "lucide-react";

const SubjectAssignments = ({ subjectId }: { subjectId: string }) => {
  const { t } = useLanguage();
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const isPrivileged = hasRole("admin") || hasRole("teacher");
  const [createOpen, setCreateOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", deadline: "" });
  const [file, setFile] = useState<File | null>(null);
  const [submitFile, setSubmitFile] = useState<File | null>(null);
  const [submitComment, setSubmitComment] = useState("");

  const { data: assignments, isLoading } = useQuery({
    queryKey: ["assignments", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("subject_assignments")
        .select("*").eq("subject_id", subjectId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: submissions } = useQuery({
    queryKey: ["my-submissions", subjectId],
    queryFn: async () => {
      if (!user) return [];
      const assignmentIds = assignments?.map((a) => a.id) || [];
      if (!assignmentIds.length) return [];
      const { data } = await supabase.from("assignment_submissions")
        .select("*").in("assignment_id", assignmentIds).eq("user_id", user.id);
      return data || [];
    },
    enabled: !!assignments?.length && !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      let fileUrl = null;
      if (file) {
        const path = `assignments/${subjectId}/${crypto.randomUUID()}-${file.name}`;
        const { error } = await supabase.storage.from("subject-files").upload(path, file);
        if (error) throw error;
        fileUrl = path;
      }
      const { error } = await supabase.from("subject_assignments").insert({
        subject_id: subjectId,
        title: form.title,
        description: form.description || null,
        deadline: form.deadline || null,
        file_url: fileUrl,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments", subjectId] });
      setCreateOpen(false);
      setForm({ title: "", description: "", deadline: "" });
      setFile(null);
      toast({ title: t("Assignment created", "تم إنشاء الواجب") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const submitMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      if (!user) throw new Error("Not authenticated");
      let fileUrl = null;
      if (submitFile) {
        const path = `submissions/${assignmentId}/${user.id}/${crypto.randomUUID()}-${submitFile.name}`;
        const { error } = await supabase.storage.from("subject-files").upload(path, submitFile);
        if (error) throw error;
        fileUrl = path;
      }
      const assignment = assignments?.find((a) => a.id === assignmentId);
      const isLate = assignment?.deadline ? new Date() > new Date(assignment.deadline) : false;
      const { error } = await supabase.from("assignment_submissions").insert({
        assignment_id: assignmentId,
        user_id: user.id,
        file_url: fileUrl,
        comment: submitComment || null,
        is_late: isLate,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-submissions", subjectId] });
      setSubmitOpen(null);
      setSubmitFile(null);
      setSubmitComment("");
      toast({ title: t("Submitted!", "تم التسليم!") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const getSubmission = (assignmentId: string) => submissions?.find((s) => s.assignment_id === assignmentId);
  const isOverdue = (deadline: string) => deadline && new Date() > new Date(deadline);

  if (isLoading) return <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}</div>;

  return (
    <div className="space-y-4">
      {isPrivileged && (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-3 w-3" />{t("Create Assignment", "إنشاء واجب")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("Create Assignment", "إنشاء واجب")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{t("Title", "العنوان")}</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>{t("Description", "الوصف")}</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>{t("Deadline", "الموعد النهائي")}</Label><Input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
              <div><Label>{t("Attachment (optional)", "مرفق (اختياري)")}</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
              <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!form.title || createMutation.isPending}>
                {t("Create", "إنشاء")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {!assignments?.length ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-50" />
          {t("No assignments yet", "لا توجد واجبات بعد")}
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            const sub = getSubmission(a.id);
            return (
              <Card key={a.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{a.title}</p>
                        {sub && <Badge variant="outline" className="text-xs gap-1"><CheckCircle className="h-3 w-3 text-green-500" />{t("Submitted", "تم التسليم")}</Badge>}
                        {sub?.grade !== null && sub?.grade !== undefined && <Badge className="text-xs">Grade: {sub.grade}</Badge>}
                      </div>
                      {a.description && <p className="text-sm text-muted-foreground mt-1">{a.description}</p>}
                      {a.deadline && (
                        <div className="flex items-center gap-1 mt-2 text-xs">
                          <Clock className="h-3 w-3" />
                          <span className={isOverdue(a.deadline) ? "text-destructive" : "text-muted-foreground"}>
                            {t("Due:", "الموعد:")} {new Date(a.deadline).toLocaleString()}
                          </span>
                          {isOverdue(a.deadline) && <AlertCircle className="h-3 w-3 text-destructive" />}
                        </div>
                      )}
                      {sub?.feedback && <p className="text-xs mt-2 p-2 bg-muted rounded">{t("Feedback:", "الملاحظات:")} {sub.feedback}</p>}
                    </div>
                    {!isPrivileged && !sub && (
                      <Dialog open={submitOpen === a.id} onOpenChange={(v) => setSubmitOpen(v ? a.id : null)}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="gap-1 shrink-0"><Send className="h-3 w-3" />{t("Submit", "تسليم")}</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>{t("Submit Assignment", "تسليم الواجب")}</DialogTitle></DialogHeader>
                          <div className="space-y-3">
                            <div><Label>{t("File", "الملف")}</Label><Input type="file" onChange={(e) => setSubmitFile(e.target.files?.[0] || null)} /></div>
                            <div><Label>{t("Comment (optional)", "تعليق (اختياري)")}</Label><Textarea value={submitComment} onChange={(e) => setSubmitComment(e.target.value)} /></div>
                            <Button className="w-full" onClick={() => submitMutation.mutate(a.id)} disabled={submitMutation.isPending}>
                              {t("Submit", "تسليم")}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SubjectAssignments;
