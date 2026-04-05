import { useState, useRef, useEffect } from "react";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { ClipboardList, Plus, Upload, Clock, CheckCircle, AlertCircle, Send, Mic, MicOff, PenLine, Edit, Trash2, Save, Bell } from "lucide-react";

// Track read feedback in localStorage
const markFeedbackRead = (assignmentId: string) =>
  localStorage.setItem(`feedback-read-${assignmentId}`, "1");
const isFeedbackRead = (assignmentId: string) =>
  !!localStorage.getItem(`feedback-read-${assignmentId}`);

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
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Track which feedbacks have been "read" (acknowledged by user)
  const [readFeedbacks, setReadFeedbacks] = useState<Record<string, boolean>>({});

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", deadline: "" });

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
        subject_id: subjectId, title: form.title, description: form.description || null,
        deadline: form.deadline || null, file_url: fileUrl, created_by: user.id,
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

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      const { error } = await supabase.from("subject_assignments").update({
        title: editForm.title,
        description: editForm.description || null,
        deadline: editForm.deadline || null,
      }).eq("id", editingId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments", subjectId] });
      setEditingId(null);
      toast({ title: t("Assignment updated", "تم تحديث الواجب") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const assignment = assignments?.find(a => a.id === id);
      if (assignment?.file_url) {
        await supabase.storage.from("subject-files").remove([assignment.file_url]);
      }
      const { error } = await supabase.from("subject_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments", subjectId] });
      setDeleteId(null);
      toast({ title: t("Assignment deleted", "تم حذف الواجب") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const submitMutation = useMutation({
    mutationFn: async ({ assignmentId, mode }: { assignmentId: string; mode: string }) => {
      if (!user) throw new Error("Not authenticated");
      let fileUrl = null;
      if (mode === "file" && submitFile) {
        const path = `submissions/${assignmentId}/${user.id}/${crypto.randomUUID()}-${submitFile.name}`;
        const { error } = await supabase.storage.from("subject-files").upload(path, submitFile);
        if (error) throw error;
        fileUrl = path;
      } else if (mode === "voice" && voiceBlob) {
        const path = `submissions/${assignmentId}/${user.id}/${crypto.randomUUID()}-voice.webm`;
        const { error } = await supabase.storage.from("subject-files").upload(path, voiceBlob);
        if (error) throw error;
        fileUrl = path;
      }
      const assignment = assignments?.find((a) => a.id === assignmentId);
      const isLate = assignment?.deadline ? new Date() > new Date(assignment.deadline) : false;
      const { error } = await supabase.from("assignment_submissions").insert({
        assignment_id: assignmentId, user_id: user.id, file_url: fileUrl,
        comment: submitComment || null, is_late: isLate,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-submissions", subjectId] });
      setSubmitOpen(null);
      setSubmitFile(null);
      setSubmitComment("");
      setVoiceBlob(null);
      toast({ title: t("Submitted!", "تم التسليم!") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setVoiceBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecordingVoice(true);
    } catch {
      toast({ title: t("Microphone access denied", "تم رفض الوصول للميكروفون"), variant: "destructive" });
    }
  };

  const stopVoiceRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecordingVoice(false);
  };

  const getSubmission = (assignmentId: string) => submissions?.find((s) => s.assignment_id === assignmentId);
  const isOverdue = (deadline: string) => deadline && new Date() > new Date(deadline);

  // Build read-state map from localStorage whenever submissions load
  useEffect(() => {
    if (!submissions) return;
    const map: Record<string, boolean> = {};
    submissions.forEach((s: any) => {
      if (s.feedback) map[s.assignment_id] = isFeedbackRead(s.assignment_id);
    });
    setReadFeedbacks(map);
  }, [submissions]);

  // Count unread feedback notifications
  const unreadCount = submissions?.filter((s: any) => s.feedback && !isFeedbackRead(s.assignment_id)).length || 0;

  const openEdit = (a: any) => {
    setEditForm({
      title: a.title,
      description: a.description || "",
      deadline: a.deadline ? new Date(a.deadline).toISOString().slice(0, 16) : "",
    });
    setEditingId(a.id);
  };

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

      {/* Unread feedback notification banner */}
      {!isPrivileged && unreadCount > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
          borderRadius: 12, background: "linear-gradient(135deg,#064E3B,#0a6644)",
          border: "1px solid rgba(201,168,76,0.3)", marginBottom: 4,
        }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <Bell size={18} color="#C9A84C" />
            <span style={{
              position: "absolute", top: -6, right: -6, width: 16, height: 16,
              borderRadius: "50%", background: "#ef4444", fontSize: 9, fontWeight: 800,
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            }}>{unreadCount}</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#e8f5e9", flex: 1 }}>
            {unreadCount === 1
              ? "Your teacher left feedback on 1 assignment"
              : `Your teacher left feedback on ${unreadCount} assignments`}
          </p>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>↓ See below</span>
        </div>
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{a.title}</p>
                        {sub && <Badge variant="outline" className="text-xs gap-1"><CheckCircle className="h-3 w-3 text-green-500" />{t("Submitted", "تم التسليم")}</Badge>}
                        {sub?.is_late && <Badge variant="destructive" className="text-xs">{t("Late", "متأخر")}</Badge>}
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
                      {sub?.feedback && (() => {
                        const isUnread = !readFeedbacks[a.id] && !isFeedbackRead(a.id);
                        return (
                          <div
                            onClick={() => {
                              markFeedbackRead(a.id);
                              setReadFeedbacks(r => ({ ...r, [a.id]: true }));
                            }}
                            style={{
                              marginTop: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                              background: isUnread ? "linear-gradient(135deg,#064E3B0d,#064E3B18)" : "#F9FAFB",
                              border: isUnread ? "1.5px solid #064E3B30" : "1px solid #F3F4F6",
                              transition: "all 0.2s",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                              {isUnread && (
                                <span style={{
                                  width: 8, height: 8, borderRadius: "50%", background: "#ef4444",
                                  flexShrink: 0, animation: "pulse 1.5s infinite",
                                }} />
                              )}
                              <span style={{ fontSize: 11, fontWeight: 700, color: isUnread ? "#064E3B" : "#6B7280" }}>
                                {isUnread ? "🔔 New teacher feedback" : t("Teacher feedback", "ملاحظات المعلم")}
                              </span>
                              {isUnread && <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: "auto" }}>click to mark read</span>}
                            </div>
                            <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{sub.feedback}</p>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isPrivileged && (
                        <>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(a)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(a.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {!isPrivileged && !sub && (
                        <Dialog open={submitOpen === a.id} onOpenChange={(v) => { setSubmitOpen(v ? a.id : null); setVoiceBlob(null); setSubmitFile(null); setSubmitComment(""); }}>
                          <DialogTrigger asChild>
                            <Button size="sm" className="gap-1 shrink-0"><Send className="h-3 w-3" />{t("Submit", "تسليم")}</Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg">
                            <DialogHeader><DialogTitle>{t("Submit Assignment", "تسليم الواجب")}</DialogTitle></DialogHeader>
                            <Tabs defaultValue="text" className="w-full">
                              <TabsList className="w-full">
                                <TabsTrigger value="text" className="flex-1 gap-1"><PenLine className="h-3 w-3" />{t("Write", "كتابة")}</TabsTrigger>
                                <TabsTrigger value="voice" className="flex-1 gap-1"><Mic className="h-3 w-3" />{t("Voice", "صوتي")}</TabsTrigger>
                                <TabsTrigger value="file" className="flex-1 gap-1"><Upload className="h-3 w-3" />{t("File", "ملف")}</TabsTrigger>
                              </TabsList>
                              <TabsContent value="text" className="space-y-3 mt-3">
                                <div>
                                  <Label>{t("Your Answer", "إجابتك")}</Label>
                                  <Textarea value={submitComment} onChange={(e) => setSubmitComment(e.target.value)} rows={6} placeholder={t("Write your response here...", "اكتب إجابتك هنا...")} />
                                </div>
                                <Button className="w-full" onClick={() => submitMutation.mutate({ assignmentId: a.id, mode: "text" })}
                                  disabled={!submitComment.trim() || submitMutation.isPending}>
                                  <Send className="h-3 w-3 me-2" />{t("Submit Text", "تسليم النص")}
                                </Button>
                              </TabsContent>
                              <TabsContent value="voice" className="space-y-3 mt-3">
                                <div className="text-center py-6">
                                  {!voiceBlob ? (
                                    <Button variant={isRecordingVoice ? "destructive" : "outline"} size="lg" className="rounded-full h-20 w-20"
                                      onClick={isRecordingVoice ? stopVoiceRecording : startVoiceRecording}>
                                      {isRecordingVoice ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
                                    </Button>
                                  ) : (
                                    <div className="space-y-2">
                                      <Badge variant="outline" className="gap-1"><CheckCircle className="h-3 w-3 text-green-500" />{t("Recording ready", "التسجيل جاهز")}</Badge>
                                      <audio controls src={URL.createObjectURL(voiceBlob)} className="mx-auto" />
                                      <Button variant="ghost" size="sm" onClick={() => setVoiceBlob(null)}>{t("Re-record", "إعادة التسجيل")}</Button>
                                    </div>
                                  )}
                                  <p className="text-xs text-muted-foreground mt-2">
                                    {isRecordingVoice ? t("Recording... Click to stop", "جاري التسجيل... اضغط للإيقاف") : t("Click to start recording", "اضغط لبدء التسجيل")}
                                  </p>
                                </div>
                                <Textarea value={submitComment} onChange={(e) => setSubmitComment(e.target.value)} rows={2} placeholder={t("Add a note (optional)", "أضف ملاحظة (اختياري)")} />
                                <Button className="w-full" onClick={() => submitMutation.mutate({ assignmentId: a.id, mode: "voice" })}
                                  disabled={!voiceBlob || submitMutation.isPending}>
                                  <Send className="h-3 w-3 me-2" />{t("Submit Voice", "تسليم الصوت")}
                                </Button>
                              </TabsContent>
                              <TabsContent value="file" className="space-y-3 mt-3">
                                <div>
                                  <Label>{t("Upload File", "رفع ملف")}</Label>
                                  <Input type="file" onChange={(e) => setSubmitFile(e.target.files?.[0] || null)} />
                                  {submitFile && <p className="text-xs text-muted-foreground mt-1">{submitFile.name} ({(submitFile.size / 1024).toFixed(0)} KB)</p>}
                                </div>
                                <Textarea value={submitComment} onChange={(e) => setSubmitComment(e.target.value)} rows={2} placeholder={t("Add a note (optional)", "أضف ملاحظة (اختياري)")} />
                                <Button className="w-full" onClick={() => submitMutation.mutate({ assignmentId: a.id, mode: "file" })}
                                  disabled={!submitFile || submitMutation.isPending}>
                                  <Upload className="h-3 w-3 me-2" />{t("Upload & Submit", "رفع وتسليم")}
                                </Button>
                              </TabsContent>
                            </Tabs>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
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
          <DialogHeader><DialogTitle>{t("Edit Assignment", "تعديل الواجب")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t("Title", "العنوان")}</Label><Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></div>
            <div><Label>{t("Description", "الوصف")}</Label><Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} /></div>
            <div><Label>{t("Deadline", "الموعد النهائي")}</Label><Input type="datetime-local" value={editForm.deadline} onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })} /></div>
            <Button className="w-full gap-2" onClick={() => updateMutation.mutate()} disabled={!editForm.title || updateMutation.isPending}>
              <Save className="h-4 w-4" />{t("Save Changes", "حفظ التغييرات")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete Assignment?", "حذف الواجب؟")}</AlertDialogTitle>
            <AlertDialogDescription>{t("This will also remove all student submissions for this assignment.", "سيتم حذف جميع تسليمات الطلاب لهذا الواجب أيضاً.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel", "إلغاء")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("Delete", "حذف")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
};

export default SubjectAssignments;
