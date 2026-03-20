import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus, Trash2, Download, Calendar, Users, Clock, Edit, Video, Eye, Radio,
  BookOpen, FileText, ClipboardList, Megaphone, ExternalLink, Play, Search
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import SubjectRecordings from "@/components/classroom/SubjectRecordings";
import SubjectMaterials from "@/components/classroom/SubjectMaterials";
import SubjectSyllabus from "@/components/classroom/SubjectSyllabus";
import SubjectAssignments from "@/components/classroom/SubjectAssignments";
import SubjectAnnouncements from "@/components/classroom/SubjectAnnouncements";
import ClassroomView from "@/components/classroom/ClassroomView";

const LiveClassManagement = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Create/Edit dialog
  const [showCreate, setShowCreate] = useState(false);
  const [editingSession, setEditingSession] = useState<any>(null);
  const [form, setForm] = useState({
    subject_id: "",
    topic: "",
    topic_ar: "",
    scheduled_at: "",
    duration_minutes: 60,
    recording_enabled: true,
    chat_enabled: true,
    hand_raise_enabled: true,
    waiting_room_enabled: true,
    whiteboard_enabled: false,
    homework: "",
    homework_ar: "",
  });

  // Attendance dialog
  const [attendanceSession, setAttendanceSession] = useState<any>(null);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [manualAttendance, setManualAttendance] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [editAttendance, setEditAttendance] = useState<Record<string, string>>({});

  // Active classroom (when admin goes live)
  const [activeClassroom, setActiveClassroom] = useState<any | null>(null);

  // Subject detail view
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [{ data: subs }, { data: sess }] = await Promise.all([
      supabase.from("subjects").select("id, title, title_ar, teacher_id, is_active, livekit_room_name"),
      supabase.from("live_sessions").select("*, subjects(title, title_ar)").order("created_at", { ascending: false }),
    ]);
    setSubjects(subs || []);
    setSessions(sess || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = sessions.filter(s => {
    if (subjectFilter !== "all" && s.subject_id !== subjectFilter) return false;
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const subTitle = s.subjects?.title?.toLowerCase() || "";
      const topic = s.topic?.toLowerCase() || "";
      if (!subTitle.includes(q) && !topic.includes(q)) return false;
    }
    return true;
  });

  const resetForm = () => setForm({
    subject_id: "", topic: "", topic_ar: "", scheduled_at: "",
    duration_minutes: 60, recording_enabled: true, chat_enabled: true,
    hand_raise_enabled: true, waiting_room_enabled: true, whiteboard_enabled: false,
    homework: "", homework_ar: "",
  });

  const openCreate = () => {
    resetForm();
    setEditingSession(null);
    setShowCreate(true);
  };

  const openEdit = (s: any) => {
    setEditingSession(s);
    setForm({
      subject_id: s.subject_id || "",
      topic: s.topic || "",
      topic_ar: s.topic_ar || "",
      scheduled_at: s.scheduled_at ? s.scheduled_at.slice(0, 16) : "",
      duration_minutes: s.duration_minutes || 60,
      recording_enabled: s.recording_enabled ?? true,
      chat_enabled: s.chat_enabled ?? true,
      hand_raise_enabled: s.hand_raise_enabled ?? true,
      waiting_room_enabled: s.waiting_room_enabled ?? true,
      whiteboard_enabled: s.whiteboard_enabled ?? false,
      homework: s.homework || "",
      homework_ar: s.homework_ar || "",
    });
    setShowCreate(true);
  };

  const handleSave = async () => {
    if (!form.subject_id || !user) return;
    const sub = subjects.find(s => s.id === form.subject_id);
    const payload = {
      subject_id: form.subject_id,
      host_id: sub?.teacher_id || user.id,
      topic: form.topic || null,
      topic_ar: form.topic_ar || null,
      scheduled_at: form.scheduled_at || null,
      duration_minutes: form.duration_minutes || 60,
      recording_enabled: form.recording_enabled,
      chat_enabled: form.chat_enabled,
      hand_raise_enabled: form.hand_raise_enabled,
      waiting_room_enabled: form.waiting_room_enabled,
      whiteboard_enabled: form.whiteboard_enabled,
      homework: form.homework || null,
      homework_ar: form.homework_ar || null,
    };

    if (editingSession) {
      await supabase.from("live_sessions").update(payload).eq("id", editingSession.id);
      toast({ title: t("Class updated", "تم تحديث الحصة") });
    } else {
      await supabase.from("live_sessions").insert({ ...payload, status: "scheduled" });
      toast({ title: t("Class scheduled", "تم جدولة الحصة") });
    }
    setShowCreate(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("Delete this class session?", "حذف هذه الحصة؟"))) return;
    await supabase.from("live_sessions").delete().eq("id", id);
    setSessions(prev => prev.filter(s => s.id !== id));
    toast({ title: t("Class deleted", "تم حذف الحصة") });
  };

  const updateStatus = async (id: string, status: string) => {
    const updates: Record<string, unknown> = { status };
    if (status === "live") updates.actual_start_time = new Date().toISOString();
    if (status === "completed" || status === "ended") updates.actual_end_time = new Date().toISOString();
    if (status === "cancelled") updates.ended_at = new Date().toISOString();
    await supabase.from("live_sessions").update(updates).eq("id", id);
    toast({ title: t(`Class ${status}`, `الحصة ${status}`) });
    fetchData();
  };

  const goLiveAndJoin = async (session: any) => {
    try {
      // 1. Mark session as live
      await supabase.from("live_sessions").update({
        status: "live",
        actual_start_time: new Date().toISOString(),
        started_at: new Date().toISOString(),
      }).eq("id", session.id);

      // 2. Find the subject object so ClassroomView gets what it needs
      const subject = subjects.find(s => s.id === session.subject_id);
      if (!subject) {
        toast({ title: "Error", description: "Subject not found", variant: "destructive" });
        return;
      }

      // 3. Open ClassroomView inline — no navigation, no 404
      setActiveClassroom(subject);
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to start class", variant: "destructive" });
    }
  };

  const previewClass = (session: any) => {
    const subject = subjects.find(s => s.id === session.subject_id);
    if (subject) setActiveClassroom(subject);
    else navigate(`/admin/live-classes`);
  };

  // Attendance
  const viewAttendance = async (session: any) => {
    setAttendanceSession(session);
    const [{ data: logs }, { data: manual }] = await Promise.all([
      supabase.from("attendance_logs").select("*, profiles:user_id(full_name)").eq("session_id", session.id),
      supabase.from("manual_attendance").select("*, profiles:student_id(full_name)").eq("session_id", session.id),
    ]);
    setAttendanceLogs(logs || []);
    setManualAttendance(manual || []);

    const { data: courses } = await supabase.from("courses").select("id").eq("subject_id", session.subject_id);
    const courseIds = (courses || []).map((c: any) => c.id);
    if (courseIds.length > 0) {
      const { data: enrollments } = await supabase.from("enrollments").select("user_id").in("course_id", courseIds);
      const userIds = [...new Set((enrollments || []).map(e => e.user_id))];
      if (userIds.length > 0) {
        const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
        setStudents(data || []);
        const map: Record<string, string> = {};
        (manual || []).forEach((m: any) => { map[m.student_id] = m.status; });
        (data || []).forEach(s => { if (!map[s.user_id]) map[s.user_id] = "absent"; });
        setEditAttendance(map);
      }
    }
  };

  const saveAttendance = async () => {
    if (!attendanceSession || !user) return;
    await supabase.from("manual_attendance").delete().eq("session_id", attendanceSession.id);
    const records = Object.entries(editAttendance).map(([student_id, status]) => ({
      session_id: attendanceSession.id,
      student_id,
      subject_id: attendanceSession.subject_id,
      teacher_id: user.id,
      status,
      date: attendanceSession.created_at?.split("T")[0] || new Date().toISOString().split("T")[0],
    }));
    await supabase.from("manual_attendance").insert(records);
    toast({ title: t("Attendance saved", "تم حفظ الحضور") });
  };

  const exportAttendanceCSV = () => {
    const rows = [["Student", "Status", "Joined At", "Left At", "Duration (min)"].join(",")];
    attendanceLogs.forEach(l => {
      rows.push([
        (l as any).profiles?.full_name || l.user_id,
        "auto-logged",
        l.joined_at ? new Date(l.joined_at).toLocaleString() : "",
        l.left_at ? new Date(l.left_at).toLocaleString() : "",
        l.duration_seconds ? Math.round(l.duration_seconds / 60).toString() : "",
      ].join(","));
    });
    manualAttendance.forEach(m => {
      rows.push([
        (m as any).profiles?.full_name || m.student_id,
        m.status, "", "", "",
      ].join(","));
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "attendance.csv"; a.click();
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      live: "bg-red-500 text-white",
      scheduled: "bg-blue-500/10 text-blue-600 border-blue-200",
      completed: "bg-muted text-muted-foreground",
      ended: "bg-muted text-muted-foreground",
      cancelled: "bg-destructive/10 text-destructive",
    };
    return <Badge className={variants[status] || ""}>{status === "live" && "🔴 "}{status}</Badge>;
  };

  // ── Active classroom (full-screen takeover) ──
  if (activeClassroom) {
    return (
      <ClassroomView
        subject={activeClassroom}
        onLeave={() => { setActiveClassroom(null); fetchData(); }}
      />
    );
  }

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  // ---- Subject Detail View with Tabs ----
  if (selectedSubjectId) {
    const sub = subjects.find(s => s.id === selectedSubjectId);
    const subSessions = sessions.filter(s => s.subject_id === selectedSubjectId);
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedSubjectId(null)} className="mb-2">← {t("Back to All Classes", "العودة لكل الحصص")}</Button>
            <h1 className="text-2xl font-bold">{sub?.title || "Subject"}</h1>
            {sub?.title_ar && <p className="text-muted-foreground">{sub.title_ar}</p>}
          </div>
          <Button onClick={() => { setForm(f => ({ ...f, subject_id: selectedSubjectId })); setEditingSession(null); setShowCreate(true); }}>
            <Plus className="h-4 w-4 mr-2" />{t("Schedule Class", "جدولة حصة")}
          </Button>
        </div>

        {/* Sessions for this subject */}
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("Sessions", "الحصص")} ({subSessions.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("Topic", "الموضوع")}</TableHead>
                <TableHead>{t("Status", "الحالة")}</TableHead>
                <TableHead>{t("Scheduled", "الموعد")}</TableHead>
                <TableHead>{t("Duration", "المدة")}</TableHead>
                <TableHead>{t("Participants", "المشاركين")}</TableHead>
                <TableHead>{t("Actions", "الإجراءات")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {subSessions.map(s => (
                  <TableRow key={s.id}>
                    <TableCell>{s.topic || <span className="text-muted-foreground italic">No topic</span>}</TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell>{s.scheduled_at ? format(new Date(s.scheduled_at), "MMM d, h:mm a") : "-"}</TableCell>
                    <TableCell>{s.duration_minutes ? `${s.duration_minutes} min` : "-"}</TableCell>
                    <TableCell>{s.total_participants || s.participant_count || 0}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {s.status === "scheduled" && (
                          <Button size="sm" onClick={() => goLiveAndJoin(s)} className="bg-green-600 hover:bg-green-700 text-white">
                            <Video className="h-3 w-3 mr-1" /> {t("Go Live", "ابدأ")}
                          </Button>
                        )}
                        {s.status === "live" && (
                          <Button size="sm" onClick={() => previewClass(s)} className="bg-green-600 hover:bg-green-700 text-white">
                            <Play className="h-3 w-3 mr-1" /> {t("Join", "انضم")}
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => openEdit(s)} title="Edit"><Edit className="h-3 w-3" /></Button>
                        <Button size="sm" variant="outline" onClick={() => previewClass(s)} title="Preview"><Eye className="h-3 w-3" /></Button>
                        <Button size="sm" variant="outline" onClick={() => viewAttendance(s)} title="Attendance"><Users className="h-3 w-3" /></Button>
                        {s.status === "live" && (
                          <Button size="sm" variant="destructive" onClick={() => updateStatus(s.id, "completed")}>
                            {t("End", "إنهاء")}
                          </Button>
                        )}
                        {s.status === "scheduled" && (
                          <Button size="sm" variant="outline" onClick={() => updateStatus(s.id, "cancelled")}>
                            <Clock className="h-3 w-3" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(s.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {subSessions.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">{t("No sessions yet", "لا توجد حصص بعد")}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Subject resource tabs */}
        <Tabs defaultValue="recordings">
          <TabsList className="flex-wrap">
            <TabsTrigger value="recordings" className="gap-1"><Video className="h-3 w-3" />{t("Recordings", "التسجيلات")}</TabsTrigger>
            <TabsTrigger value="syllabus" className="gap-1"><BookOpen className="h-3 w-3" />{t("Syllabus", "المنهج")}</TabsTrigger>
            <TabsTrigger value="materials" className="gap-1"><FileText className="h-3 w-3" />{t("Materials", "المواد")}</TabsTrigger>
            <TabsTrigger value="assignments" className="gap-1"><ClipboardList className="h-3 w-3" />{t("Assignments", "الواجبات")}</TabsTrigger>
            <TabsTrigger value="announcements" className="gap-1"><Megaphone className="h-3 w-3" />{t("Announcements", "الإعلانات")}</TabsTrigger>
          </TabsList>
          <TabsContent value="recordings"><SubjectRecordings subjectId={selectedSubjectId} /></TabsContent>
          <TabsContent value="syllabus"><SubjectSyllabus subjectId={selectedSubjectId} /></TabsContent>
          <TabsContent value="materials"><SubjectMaterials subjectId={selectedSubjectId} /></TabsContent>
          <TabsContent value="assignments"><SubjectAssignments subjectId={selectedSubjectId} /></TabsContent>
          <TabsContent value="announcements"><SubjectAnnouncements subjectId={selectedSubjectId} /></TabsContent>
        </Tabs>

        {/* Reuse Create/Edit + Attendance dialogs rendered below */}
        {renderCreateEditDialog()}
        {renderAttendanceDialog()}
      </div>
    );
  }

  // ---- Attendance Detail View ----
  if (attendanceSession) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setAttendanceSession(null)}>← {t("Back", "رجوع")}</Button>
          <Button variant="outline" onClick={exportAttendanceCSV}><Download className="h-4 w-4 me-2" />{t("Export CSV", "تصدير CSV")}</Button>
        </div>
        <h1 className="text-xl font-bold">{t("Attendance", "الحضور")} — {attendanceSession.subjects?.title || attendanceSession.topic || "Session"}</h1>

        {attendanceLogs.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">{t("Auto-Logged Attendance", "الحضور التلقائي")}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t("Student", "الطالب")}</TableHead>
                  <TableHead>{t("Joined", "انضم")}</TableHead>
                  <TableHead>{t("Left", "غادر")}</TableHead>
                  <TableHead>{t("Duration", "المدة")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {attendanceLogs.map(l => (
                    <TableRow key={l.id}>
                      <TableCell>{(l as any).profiles?.full_name || "Student"}</TableCell>
                      <TableCell>{l.joined_at ? new Date(l.joined_at).toLocaleTimeString() : "-"}</TableCell>
                      <TableCell>{l.left_at ? new Date(l.left_at).toLocaleTimeString() : "-"}</TableCell>
                      <TableCell>{l.duration_seconds ? `${Math.round(l.duration_seconds / 60)} min` : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-sm">{t("Manual Attendance", "الحضور اليدوي")}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("Student", "الطالب")}</TableHead>
                <TableHead>{t("Status", "الحالة")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {students.map(s => (
                  <TableRow key={s.user_id}>
                    <TableCell>{s.full_name}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(["present", "absent", "late"] as const).map(status => (
                          <Button key={status} size="sm"
                            variant={editAttendance[s.user_id] === status ? "default" : "outline"}
                            className={editAttendance[s.user_id] === status ? (status === "present" ? "bg-green-600" : status === "late" ? "bg-amber-500" : "bg-destructive") : ""}
                            onClick={() => setEditAttendance({ ...editAttendance, [s.user_id]: status })}>
                            {status === "present" ? t("Present", "حاضر") : status === "late" ? t("Late", "متأخر") : t("Absent", "غائب")}
                          </Button>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Button onClick={saveAttendance}>{t("Save Attendance", "حفظ الحضور")}</Button>
      </div>
    );
  }

  // ---- Render helpers ----
  function renderCreateEditDialog() {
    return (
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSession ? t("Edit Class", "تعديل الحصة") : t("Schedule Class", "جدولة حصة")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("Subject", "المادة")} *</Label>
              <Select value={form.subject_id} onValueChange={v => setForm(f => ({ ...f, subject_id: v }))}>
                <SelectTrigger><SelectValue placeholder={t("Select subject", "اختر المادة")} /></SelectTrigger>
                <SelectContent>{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("Topic (EN)", "الموضوع")}</Label><Input value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} /></div>
              <div><Label>{t("Topic (AR)", "الموضوع بالعربي")}</Label><Input value={form.topic_ar} onChange={e => setForm(f => ({ ...f, topic_ar: e.target.value }))} dir="rtl" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("Scheduled At", "الموعد")}</Label><Input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} /></div>
              <div><Label>{t("Duration (min)", "المدة")}</Label><Input type="number" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 60 }))} /></div>
            </div>
            <div><Label>{t("Homework (EN)", "الواجب")}</Label><Textarea value={form.homework} onChange={e => setForm(f => ({ ...f, homework: e.target.value }))} rows={2} /></div>
            <div><Label>{t("Homework (AR)", "الواجب بالعربي")}</Label><Textarea value={form.homework_ar} onChange={e => setForm(f => ({ ...f, homework_ar: e.target.value }))} rows={2} dir="rtl" /></div>

            <div className="space-y-3 border-t pt-3">
              <p className="text-sm font-medium text-muted-foreground">{t("Settings", "الإعدادات")}</p>
              <div className="flex items-center justify-between"><Label>{t("Record Class", "تسجيل الحصة")}</Label><Switch checked={form.recording_enabled} onCheckedChange={v => setForm(f => ({ ...f, recording_enabled: v }))} /></div>
              <div className="flex items-center justify-between"><Label>{t("Enable Chat", "تفعيل المحادثة")}</Label><Switch checked={form.chat_enabled} onCheckedChange={v => setForm(f => ({ ...f, chat_enabled: v }))} /></div>
              <div className="flex items-center justify-between"><Label>{t("Hand Raising", "رفع اليد")}</Label><Switch checked={form.hand_raise_enabled} onCheckedChange={v => setForm(f => ({ ...f, hand_raise_enabled: v }))} /></div>
              <div className="flex items-center justify-between"><Label>{t("Waiting Room", "غرفة الانتظار")}</Label><Switch checked={form.waiting_room_enabled} onCheckedChange={v => setForm(f => ({ ...f, waiting_room_enabled: v }))} /></div>
            </div>

            <Button onClick={handleSave} className="w-full">{editingSession ? t("Save Changes", "حفظ التعديلات") : t("Create", "إنشاء")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  function renderAttendanceDialog() { return null; /* Attendance is a separate view above */ }

  // ---- Main List View ----
  const liveCount = sessions.filter(s => s.status === "live").length;
  const scheduledCount = sessions.filter(s => s.status === "scheduled").length;
  const completedCount = sessions.filter(s => s.status === "completed" || s.status === "ended").length;

  // Group sessions by subject for quick navigation
  const subjectSessionCounts = subjects.map(sub => ({
    ...sub,
    sessionCount: sessions.filter(s => s.subject_id === sub.id).length,
    liveCount: sessions.filter(s => s.subject_id === sub.id && s.status === "live").length,
  }));

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t("Live Class Management", "إدارة الفصول المباشرة")}</h1>
        <Button onClick={openCreate}><Plus className="h-4 w-4 me-2" />{t("Schedule Class", "جدولة حصة")}</Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-red-500">{liveCount}</div><p className="text-xs text-muted-foreground">{t("Live Now", "مباشر الآن")}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-blue-500">{scheduledCount}</div><p className="text-xs text-muted-foreground">{t("Scheduled", "مجدولة")}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-muted-foreground">{completedCount}</div><p className="text-xs text-muted-foreground">{t("Completed", "مكتملة")}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-primary">{subjects.length}</div><p className="text-xs text-muted-foreground">{t("Subjects", "المواد")}</p></CardContent></Card>
      </div>

      {/* Subject cards for quick access */}
      <div>
        <h2 className="text-lg font-semibold mb-3">{t("Subjects", "المواد")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {subjectSessionCounts.map(sub => (
            <Card key={sub.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedSubjectId(sub.id)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{sub.title}</h3>
                    {sub.title_ar && <p className="text-xs text-muted-foreground">{sub.title_ar}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {sub.liveCount > 0 && <Badge className="bg-red-500 text-white animate-pulse">🔴 Live</Badge>}
                    <Badge variant="secondary">{sub.sessionCount} {t("sessions", "حصص")}</Badge>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" className="text-xs" onClick={e => { e.stopPropagation(); setSelectedSubjectId(sub.id); }}>
                    <BookOpen className="h-3 w-3 mr-1" />{t("Manage", "إدارة")}
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs" onClick={e => { e.stopPropagation(); navigate(`/dashboard/subjects/${sub.id}`); }}>
                    <Eye className="h-3 w-3 mr-1" />{t("Preview", "معاينة")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Filters + Session table */}
      <div>
        <h2 className="text-lg font-semibold mb-3">{t("All Sessions", "كل الحصص")}</h2>
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("Search topic or subject...", "بحث...")} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder={t("All Subjects", "كل المواد")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All Subjects", "كل المواد")}</SelectItem>
              {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All Status", "كل الحالات")}</SelectItem>
              <SelectItem value="scheduled">{t("Scheduled", "مجدولة")}</SelectItem>
              <SelectItem value="live">{t("Live", "مباشر")}</SelectItem>
              <SelectItem value="completed">{t("Completed", "مكتملة")}</SelectItem>
              <SelectItem value="cancelled">{t("Cancelled", "ملغاة")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("Subject", "المادة")}</TableHead>
                <TableHead>{t("Topic", "الموضوع")}</TableHead>
                <TableHead>{t("Status", "الحالة")}</TableHead>
                <TableHead>{t("Scheduled", "الموعد")}</TableHead>
                <TableHead>{t("Participants", "المشاركين")}</TableHead>
                <TableHead>{t("Actions", "الإجراءات")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.subjects?.title || "-"}</TableCell>
                    <TableCell>{s.topic || <span className="text-muted-foreground italic">—</span>}</TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell>{s.scheduled_at ? format(new Date(s.scheduled_at), "MMM d, h:mm a") : "-"}</TableCell>
                    <TableCell>{s.total_participants || s.participant_count || 0}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {s.status === "scheduled" && (
                          <Button size="sm" onClick={() => goLiveAndJoin(s)} className="bg-green-600 hover:bg-green-700 text-white">
                            <Video className="h-3 w-3 mr-1" /> {t("Go Live", "ابدأ")}
                          </Button>
                        )}
                        {s.status === "live" && (
                          <Button size="sm" onClick={() => previewClass(s)} className="bg-green-600 hover:bg-green-700 text-white">
                            <Play className="h-3 w-3 mr-1" /> {t("Join", "انضم")}
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => openEdit(s)} title="Edit"><Edit className="h-3 w-3" /></Button>
                        <Button size="sm" variant="outline" onClick={() => previewClass(s)} title="Preview"><Eye className="h-3 w-3" /></Button>
                        <Button size="sm" variant="outline" onClick={() => viewAttendance(s)} title="Attendance"><Users className="h-3 w-3" /></Button>
                        {s.status === "live" && <Button size="sm" variant="destructive" onClick={() => updateStatus(s.id, "completed")}>{t("End", "إنهاء")}</Button>}
                        {s.status === "scheduled" && <Button size="sm" variant="outline" onClick={() => updateStatus(s.id, "cancelled")}><Clock className="h-3 w-3" /></Button>}
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(s.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("No classes found", "لم يتم العثور على حصص")}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {renderCreateEditDialog()}
    </div>
  );
};

export default LiveClassManagement;
