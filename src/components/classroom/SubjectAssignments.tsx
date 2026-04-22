import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
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
import {
  ClipboardList, Plus, Upload, Clock, CheckCircle, AlertCircle, Send, Mic, MicOff,
  PenLine, Edit, Trash2, Save, Bell, ChevronDown, ChevronUp, User, Users, Eye,
  FileText, Play, Download,
} from "lucide-react";

const G    = "#064E3B";
const GOLD = "#C9A84C";

// ── localStorage helpers ──────────────────────────────────────
const markFeedbackRead = (id: string) => localStorage.setItem(`feedback-read-${id}`, "1");
const isFeedbackRead   = (id: string) => !!localStorage.getItem(`feedback-read-${id}`);
const LAST_SEEN_KEY    = (sid: string) => `tahleem-assign-seen-${sid}`;
const markAllSeen      = (sid: string) => localStorage.setItem(LAST_SEEN_KEY(sid), new Date().toISOString());
const getLastSeen      = (sid: string): Date | null => {
  const v = localStorage.getItem(LAST_SEEN_KEY(sid));
  return v ? new Date(v) : null;
};

// ── Student answer section ────────────────────────────────────
const AnswerSection = ({ assignment, subjectId, onSubmitted }: {
  assignment: any; subjectId: string; onSubmitted: () => void;
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [tab, setTab]             = useState<"text" | "voice" | "file">("text");
  const [comment, setComment]     = useState("");
  const [file, setFile]           = useState<File | null>(null);
  const [isRecording, setIsRec]   = useState(false);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const recRef   = useRef<MediaRecorder | null>(null);
  const chunks   = useRef<Blob[]>([]);
  const qc       = useQueryClient();

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      let fileUrl: string | null = null;
      if (tab === "file" && file) {
        const path = `submissions/${assignment.id}/${user.id}/${crypto.randomUUID()}-${file.name}`;
        const { error } = await storageSupabase.storage.from("subject-files").upload(path, file);
        if (error) throw error;
        fileUrl = path;
      } else if (tab === "voice" && voiceBlob) {
        const path = `submissions/${assignment.id}/${user.id}/${crypto.randomUUID()}-voice.webm`;
        const { error } = await storageSupabase.storage.from("subject-files").upload(path, voiceBlob);
        if (error) throw error;
        fileUrl = path;
      }
      const isLate = assignment.deadline ? new Date() > new Date(assignment.deadline) : false;
      const { error } = await supabase.from("assignment_submissions").insert({
        assignment_id: assignment.id, user_id: user.id,
        file_url: fileUrl, comment: comment || null, is_late: isLate,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-submissions", subjectId] });
      qc.invalidateQueries({ queryKey: ["all-submissions", subjectId] });
      setComment(""); setFile(null); setVoiceBlob(null);
      onSubmitted();
      toast({ title: t("Submitted!", "تم التسليم!") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = e => chunks.current.push(e.data);
      rec.onstop = () => {
        setVoiceBlob(new Blob(chunks.current, { type: "audio/webm" }));
        stream.getTracks().forEach(t => t.stop());
      };
      rec.start(); recRef.current = rec; setIsRec(true);
    } catch { toast({ title: t("Microphone access denied", "تم رفض الوصول للميكروفون"), variant: "destructive" }); }
  };
  const stopRec = () => { recRef.current?.stop(); setIsRec(false); };

  const canSubmit =
    (tab === "text" && comment.trim()) ||
    (tab === "voice" && voiceBlob) ||
    (tab === "file" && file);

  return (
    <div style={{ background: "#F0FDF4", borderRadius: 12, padding: "14px 16px", marginTop: 10, border: "1px solid #BBF7D0" }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: G, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
        <PenLine size={13} /> {t("Your Answer", "إجابتك")}
      </p>

      {/* Tab selector */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["text", "voice", "file"] as const).map(v => (
          <button key={v} onClick={() => setTab(v)}
            style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1.5px solid ${tab === v ? G : "#D1FAE5"}`, background: tab === v ? G : "#fff", color: tab === v ? "#fff" : G, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            {v === "text" ? <><PenLine size={12} /> Write</> : v === "voice" ? <><Mic size={12} /> Voice</> : <><Upload size={12} /> File</>}
          </button>
        ))}
      </div>

      {tab === "text" && (
        <Textarea value={comment} onChange={e => setComment(e.target.value)} rows={4}
          placeholder={t("Write your answer here…", "اكتب إجابتك هنا…")}
          style={{ fontSize: 13, resize: "vertical", marginBottom: 10 }} />
      )}

      {tab === "voice" && (
        <div style={{ textAlign: "center", padding: "14px 0", marginBottom: 10 }}>
          {!voiceBlob ? (
            <>
              <button onClick={isRecording ? stopRec : startRec}
                style={{ width: 68, height: 68, borderRadius: "50%", background: isRecording ? "#EF4444" : G, border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
                {isRecording ? <MicOff size={28} /> : <Mic size={28} />}
              </button>
              <p style={{ fontSize: 12, color: "#6B7280" }}>
                {isRecording ? "🔴 Recording… tap to stop" : "Tap to record your answer"}
              </p>
            </>
          ) : (
            <div>
              <Badge variant="outline" className="gap-1 mb-2"><CheckCircle className="h-3 w-3 text-green-500" /> Recording ready</Badge>
              <audio controls src={URL.createObjectURL(voiceBlob)} className="mx-auto block" />
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setVoiceBlob(null)}>Re-record</Button>
            </div>
          )}
        </div>
      )}

      {tab === "file" && (
        <div style={{ marginBottom: 10 }}>
          <input type="file" onChange={e => setFile(e.target.files?.[0] || null)}
            style={{ display: "block", fontSize: 12, color: "#374151", marginBottom: 6 }} />
          {file && <p style={{ fontSize: 11, color: "#6B7280" }}>{file.name} ({(file.size / 1024).toFixed(0)} KB)</p>}
          <Textarea value={comment} onChange={e => setComment(e.target.value)} rows={2}
            placeholder={t("Add a note (optional)", "أضف ملاحظة (اختياري)")} style={{ fontSize: 13, marginTop: 8 }} />
        </div>
      )}

      {tab !== "voice" && tab !== "file" ? null : tab === "file" ? null : (
        <Textarea value={comment} onChange={e => setComment(e.target.value)} rows={2}
          placeholder={t("Add a note (optional)", "أضف ملاحظة (اختياري)")} style={{ fontSize: 13, marginBottom: 10 }} />
      )}

      <button onClick={() => submitMut.mutate()} disabled={!canSubmit || submitMut.isPending}
        style={{ width: "100%", padding: "10px", borderRadius: 10, border: "none", background: canSubmit && !submitMut.isPending ? G : "#D1FAE5", color: canSubmit && !submitMut.isPending ? "#fff" : "#9CA3AF", fontWeight: 700, fontSize: 13, cursor: canSubmit && !submitMut.isPending ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Send size={14} /> {submitMut.isPending ? "Submitting…" : t("Submit Answer", "تسليم الإجابة")}
      </button>
    </div>
  );
};

// ── Teacher: all student submissions for one assignment ────────
const SubmissionsPanel = ({ assignment, allSubmissions, subjectId }: {
  assignment: any; allSubmissions: any[]; subjectId: string;
}) => {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const subs = allSubmissions.filter(s => s.assignment_id === assignment.id);
  const [gradingId, setGradingId]   = useState<string | null>(null);
  const [gradeVal, setGradeVal]     = useState("");
  const [feedbackVal, setFeedbackVal] = useState("");

  const gradeMut = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from("assignment_submissions").update({
        grade: gradeVal || null,
        feedback: feedbackVal || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-submissions", subjectId] });
      setGradingId(null);
      toast({ title: t("Grade saved", "تم حفظ الدرجة") });
    },
  });

  if (!subs.length) return (
    <div style={{ padding: "10px 0", fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>
      {t("No submissions yet", "لا توجد تسليمات بعد")}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
      {subs.map((s: any) => {
        const profile = s.profiles;
        const name = profile?.full_name || profile?.full_name_ar || "Student";
        const isGrading = gradingId === s.id;

        return (
          <div key={s.id} style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", border: "1px solid #E5E7EB" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: G, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <User size={14} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{name}</span>
                {profile?.student_id_number && <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 6 }}>#{profile.student_id_number}</span>}
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {s.is_late && <Badge variant="destructive" className="text-xs">Late</Badge>}
                {s.grade != null && <Badge className="text-xs">Grade: {s.grade}</Badge>}
                <span style={{ fontSize: 10, color: "#9CA3AF" }}>
                  {new Date(s.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            {s.comment && (
              <div style={{ fontSize: 12, color: "#374151", background: "#fff", padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", marginBottom: 6, lineHeight: 1.6 }}>
                {s.comment}
              </div>
            )}

            {s.file_url && (
              <a href={`#`} style={{ fontSize: 11, color: G, display: "flex", alignItems: "center", gap: 4, marginBottom: 6, textDecoration: "none" }}>
                <FileText size={12} /> View attachment
              </a>
            )}

            {s.feedback && (
              <div style={{ fontSize: 11, color: "#059669", background: "#F0FDF4", padding: "6px 8px", borderRadius: 6, border: "1px solid #BBF7D0", marginBottom: 6 }}>
                💬 {s.feedback}
              </div>
            )}

            {!isGrading ? (
              <button onClick={() => { setGradingId(s.id); setGradeVal(s.grade || ""); setFeedbackVal(s.feedback || ""); }}
                style={{ fontSize: 11, color: G, background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                {s.grade != null ? "Edit Grade" : "Give Grade & Feedback"}
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Input value={gradeVal} onChange={e => setGradeVal(e.target.value)} placeholder="Grade (e.g. 85/100, A, Excellent)" style={{ fontSize: 12 }} />
                <Textarea value={feedbackVal} onChange={e => setFeedbackVal(e.target.value)} rows={2} placeholder="Feedback for student…" style={{ fontSize: 12, resize: "none" }} />
                <div style={{ display: "flex", gap: 6 }}>
                  <Button size="sm" onClick={() => gradeMut.mutate({ id: s.id })} disabled={gradeMut.isPending} style={{ flex: 1 }}>
                    <Save size={12} className="mr-1" /> Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setGradingId(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ══ MAIN COMPONENT ════════════════════════════════════════════
const SubjectAssignments = ({ subjectId }: { subjectId: string }) => {
  const { t } = useLanguage();
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const isPrivileged = hasRole("admin") || hasRole("teacher");

  const [createOpen, setCreateOpen]   = useState(false);
  const [form, setForm]               = useState({ title: "", description: "", deadline: "" });
  const [file, setFile]               = useState<File | null>(null);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editForm, setEditForm]       = useState({ title: "", description: "", deadline: "" });
  const [deleteId, setDeleteId]       = useState<string | null>(null);
  const [expandedId, setExpandedId]   = useState<string | null>(null); // student answer section
  const [viewSubsId, setViewSubsId]   = useState<string | null>(null); // teacher view submissions
  const [readFeedbacks, setReadFeedbacks] = useState<Record<string, boolean>>({});

  // ── Queries ────────────────────────────────────────────────
  const { data: assignments, isLoading } = useQuery({
    queryKey: ["assignments", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("subject_assignments")
        .select("*").eq("subject_id", subjectId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: mySubmissions } = useQuery({
    queryKey: ["my-submissions", subjectId],
    enabled: !!user && !isPrivileged,
    queryFn: async () => {
      if (!user) return [];
      const assignmentIds = assignments?.map(a => a.id) || [];
      if (!assignmentIds.length) return [];
      const { data } = await supabase.from("assignment_submissions")
        .select("*").in("assignment_id", assignmentIds).eq("user_id", user.id);
      return data || [];
    },
  });

  // Teacher/admin: all submissions with student profiles
  const { data: allSubmissions } = useQuery({
    queryKey: ["all-submissions", subjectId],
    enabled: isPrivileged && !!assignments?.length,
    queryFn: async () => {
      const assignmentIds = assignments?.map(a => a.id) || [];
      if (!assignmentIds.length) return [];
      const { data } = await supabase.from("assignment_submissions")
        .select("*, profiles!user_id(full_name, full_name_ar, student_id_number, avatar_url)")
        .in("assignment_id", assignmentIds)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  // ── "New assignment" star indicator ────────────────────────
  const lastSeen = getLastSeen(subjectId);
  const hasNewAssignment = !isPrivileged && assignments?.some(a => {
    if (!lastSeen) return true;
    return new Date(a.created_at!) > lastSeen;
  });

  // Mark seen when entering
  useEffect(() => { markAllSeen(subjectId); }, [subjectId]);

  // Sync feedback-read map
  useEffect(() => {
    if (!mySubmissions) return;
    const map: Record<string, boolean> = {};
    mySubmissions.forEach((s: any) => {
      if (s.feedback) map[s.assignment_id] = isFeedbackRead(s.assignment_id);
    });
    setReadFeedbacks(map);
  }, [mySubmissions]);

  const unreadFeedback = mySubmissions?.filter((s: any) => s.feedback && !isFeedbackRead(s.assignment_id)).length || 0;

  // ── Helper ─────────────────────────────────────────────────
  const getMySubmission = (aId: string) => mySubmissions?.find(s => s.assignment_id === aId);
  const isOverdue       = (d: string) => d && new Date() > new Date(d);
  const submissionCount = (aId: string) => allSubmissions?.filter(s => s.assignment_id === aId).length || 0;

  // ── Mutations ─────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      let fileUrl: string | null = null;
      if (file) {
        const path = `assignments/${subjectId}/${crypto.randomUUID()}-${file.name}`;
        const { error } = await storageSupabase.storage.from("subject-files").upload(path, file);
        if (error) throw error;
        fileUrl = path;
      }
      const { data, error } = await supabase.from("subject_assignments").insert({
        subject_id: subjectId, title: form.title, description: form.description || null,
        deadline: form.deadline || null, file_url: fileUrl, created_by: user.id,
      }).select().single();
      if (error) throw error;

      // Notify all students enrolled in this subject's courses
      try {
        const { data: courses } = await supabase.from("courses").select("id").eq("subject_id", subjectId);
        const courseIds = courses?.map((c: any) => c.id) || [];
        if (courseIds.length) {
          const { data: enrollments } = await supabase.from("enrollments" as any).select("user_id").in("course_id", courseIds);
          const studentIds = [...new Set((enrollments || []).map((e: any) => e.user_id))].filter(id => id !== user.id);
          if (studentIds.length) {
            await supabase.from("notifications").insert(studentIds.map((sid: string) => ({
              user_id: sid,
              title: "📋 New Assignment",
              message: `New assignment posted: ${form.title}`,
              type: "assignment",
              reference_id: data?.id || null,
              sent_by: user.id,
            }))).catch(err => console.warn("Notification insert failed:", err?.message));
          }
        }
      } catch (e) { console.warn("Failed to send assignment notifications:", e); }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments", subjectId] });
      setCreateOpen(false); setForm({ title: "", description: "", deadline: "" }); setFile(null);
      toast({ title: t("Assignment created", "تم إنشاء الواجب"), description: "Students have been notified." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      const { error } = await supabase.from("subject_assignments").update({
        title: editForm.title, description: editForm.description || null,
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
      const a = assignments?.find(a => a.id === id);
      if (a?.file_url) await storageSupabase.storage.from("subject-files").remove([a.file_url]);
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

  if (isLoading) return <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}</div>;

  return (
    <div className="space-y-4">

      {/* Create button */}
      {isPrivileged && (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-3 w-3" />{t("Create Assignment", "إنشاء واجب")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("Create Assignment", "إنشاء واجب")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{t("Title", "العنوان")}</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
              <div>
                <Label>{t("Question / Instructions", "السؤال / التعليمات")}</Label>
                <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4}
                  placeholder="Write the full question or instructions for students here…" />
              </div>
              <div><Label>{t("Deadline", "الموعد النهائي")}</Label><Input type="datetime-local" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} /></div>
              <div><Label>{t("Attachment (optional)", "مرفق (اختياري)")}</Label><Input type="file" onChange={e => setFile(e.target.files?.[0] || null)} /></div>
              <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!form.title || createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : t("Create & Notify Students", "إنشاء وإشعار الطلاب")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Unread feedback banner (students) */}
      {!isPrivileged && unreadFeedback > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, background: "linear-gradient(135deg,#064E3B,#0a6644)", border: "1px solid rgba(201,168,76,0.3)" }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <Bell size={18} color={GOLD} />
            <span style={{ position: "absolute", top: -6, right: -6, width: 16, height: 16, borderRadius: "50%", background: "#ef4444", fontSize: 9, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{unreadFeedback}</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#e8f5e9", flex: 1 }}>
            {unreadFeedback === 1 ? "Your teacher left feedback on 1 assignment" : `Your teacher left feedback on ${unreadFeedback} assignments`}
          </p>
        </div>
      )}

      {/* Empty state */}
      {!assignments?.length ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-50" />
          {t("No assignments yet", "لا توجد واجبات بعد")}
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {assignments.map(a => {
            const mySub     = getMySubmission(a.id);
            const isExp     = expandedId === a.id;
            const isViewSub = viewSubsId === a.id;
            const subCount  = submissionCount(a.id);
            const hasNewSub = isPrivileged && subCount > 0;
            const isNew     = !isPrivileged && !lastSeen && true; // new for student if not seen
            const deadline  = a.deadline;
            const overdue   = isOverdue(deadline);

            return (
              <Card key={a.id} style={{ border: hasNewSub ? "1.5px solid #BBF7D0" : undefined }}>
                <CardContent className="p-0">

                  {/* Card header */}
                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>

                      {/* Icon + notification dot */}
                      <div style={{ position: "relative", flexShrink: 0, marginTop: 2 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F0FDF4", border: "1px solid #BBF7D0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <ClipboardList size={16} color={G} />
                        </div>
                        {/* NEW dot for student */}
                        {!isPrivileged && !mySub && (
                          <span style={{ position: "absolute", top: -3, right: -3, width: 10, height: 10, borderRadius: "50%", background: "#ef4444", border: "2px solid #fff" }} />
                        )}
                        {/* Submission count for teacher */}
                        {isPrivileged && subCount > 0 && (
                          <span style={{ position: "absolute", top: -5, right: -5, minWidth: 16, height: 16, borderRadius: 8, background: G, fontSize: 9, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
                            {subCount}
                          </span>
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                          <p style={{ fontWeight: 700, fontSize: 14, color: "#111", margin: 0 }}>{a.title}</p>
                          {mySub && <Badge variant="outline" className="text-xs gap-1"><CheckCircle className="h-3 w-3 text-green-500" />Submitted</Badge>}
                          {mySub?.is_late && <Badge variant="destructive" className="text-xs">Late</Badge>}
                          {mySub?.grade != null && <Badge className="text-xs">Grade: {mySub.grade}</Badge>}
                        </div>
                        {deadline && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: overdue ? "#EF4444" : "#9CA3AF" }}>
                            <Clock size={11} />
                            {t("Due:", "الموعد:")} {new Date(deadline).toLocaleString()}
                            {overdue && <AlertCircle size={11} color="#EF4444" />}
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                        {/* Student: expand to answer */}
                        {!isPrivileged && !mySub && (
                          <button onClick={() => setExpandedId(isExp ? null : a.id)}
                            style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 9, background: isExp ? "#F0FDF4" : G, border: isExp ? `1px solid #BBF7D0` : "none", color: isExp ? G : "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            {isExp ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            {isExp ? "Collapse" : "Answer"}
                          </button>
                        )}

                        {/* Teacher: view submissions */}
                        {isPrivileged && (
                          <button onClick={() => setViewSubsId(isViewSub ? null : a.id)}
                            style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 9, background: isViewSub ? "#F0FDF4" : "#F9FAFB", border: `1px solid ${isViewSub ? "#BBF7D0" : "#E5E7EB"}`, color: G, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            <Users size={13} />
                            {subCount} {subCount === 1 ? "Answer" : "Answers"}
                          </button>
                        )}

                        {isPrivileged && (
                          <div style={{ display: "flex", gap: 4 }}>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditForm({ title: a.title, description: a.description || "", deadline: a.deadline ? new Date(a.deadline).toISOString().slice(0, 16) : "" }); setEditingId(a.id); }}>
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(a.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Question body (expandable on click) */}
                    {a.description && (
                      <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: "#B45309", marginBottom: 4 }}>📋 Question</p>
                        <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{a.description}</p>
                      </div>
                    )}

                    {/* Teacher feedback on student's submission */}
                    {!isPrivileged && mySub?.feedback && (() => {
                      const isUnread = !readFeedbacks[a.id] && !isFeedbackRead(a.id);
                      return (
                        <div onClick={() => { markFeedbackRead(a.id); setReadFeedbacks(r => ({ ...r, [a.id]: true })); }}
                          style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer", background: isUnread ? "rgba(6,78,59,.07)" : "#F9FAFB", border: isUnread ? "1.5px solid #064E3B30" : "1px solid #F3F4F6" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            {isUnread && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />}
                            <span style={{ fontSize: 11, fontWeight: 700, color: isUnread ? G : "#6B7280" }}>
                              {isUnread ? "🔔 New teacher feedback" : t("Teacher feedback", "ملاحظات المعلم")}
                            </span>
                            {isUnread && <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: "auto" }}>tap to mark read</span>}
                          </div>
                          <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{mySub.feedback}</p>
                        </div>
                      );
                    })()}

                    {/* Already submitted status */}
                    {!isPrivileged && mySub && (
                      <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "#F0FDF4", border: "1px solid #BBF7D0", display: "flex", alignItems: "center", gap: 6 }}>
                        <CheckCircle size={14} color="#16A34A" />
                        <span style={{ fontSize: 12, color: "#16A34A", fontWeight: 600 }}>
                          You submitted this assignment on {new Date(mySub.created_at!).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* ── Student inline answer section ────────── */}
                  {isExp && !mySub && (
                    <div style={{ borderTop: "1px solid #E5E7EB", padding: "14px 16px 16px" }}>
                      <AnswerSection
                        assignment={a}
                        subjectId={subjectId}
                        onSubmitted={() => setExpandedId(null)}
                      />
                    </div>
                  )}

                  {/* ── Teacher: all submissions panel ────────── */}
                  {isViewSub && isPrivileged && (
                    <div style={{ borderTop: "1px solid #E5E7EB", padding: "14px 16px 16px", background: "#FAFAFA" }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: G, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                        <Users size={13} /> Student Submissions ({subCount})
                      </p>
                      <SubmissionsPanel assignment={a} allSubmissions={allSubmissions || []} subjectId={subjectId} />
                    </div>
                  )}

                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingId} onOpenChange={v => !v && setEditingId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Edit Assignment", "تعديل الواجب")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t("Title", "العنوان")}</Label><Input value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} /></div>
            <div><Label>{t("Question / Instructions", "السؤال")}</Label><Textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={4} /></div>
            <div><Label>{t("Deadline", "الموعد النهائي")}</Label><Input type="datetime-local" value={editForm.deadline} onChange={e => setEditForm({ ...editForm, deadline: e.target.value })} /></div>
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
            <AlertDialogTitle>{t("Delete Assignment?", "حذف الواجب؟")}</AlertDialogTitle>
            <AlertDialogDescription>{t("This will also remove all student submissions.", "سيتم حذف جميع تسليمات الطلاب.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel", "إلغاء")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground">
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
