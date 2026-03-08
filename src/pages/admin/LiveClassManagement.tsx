import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Download, Calendar, Users, Clock, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const LiveClassManagement = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createSubject, setCreateSubject] = useState("");
  const [attendanceSession, setAttendanceSession] = useState<any>(null);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [manualAttendance, setManualAttendance] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [editAttendance, setEditAttendance] = useState<Record<string, string>>({});

  const fetchData = async () => {
    const [{ data: subs }, { data: sess }] = await Promise.all([
      supabase.from("subjects").select("id, title, title_ar, teacher_id"),
      supabase.from("live_sessions").select("*, subjects(title, title_ar)").order("created_at", { ascending: false }),
    ]);
    setSubjects(subs || []);
    setSessions(sess || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = sessions.filter(s => {
    if (subjectFilter !== "all" && s.subject_id !== subjectFilter) return false;
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    return true;
  });

  const handleCreate = async () => {
    if (!createSubject || !user) return;
    const sub = subjects.find(s => s.id === createSubject);
    await supabase.from("live_sessions").insert({
      subject_id: createSubject,
      host_id: sub?.teacher_id || user.id,
      status: "scheduled",
    });
    setShowCreate(false);
    fetchData();
    toast({ title: t("Class scheduled", "تم جدولة الحصة") });
  };

  const handleCancel = async (id: string) => {
    await supabase.from("live_sessions").update({ status: "cancelled" }).eq("id", id);
    setSessions(prev => prev.map(s => s.id === id ? { ...s, status: "cancelled" } : s));
    toast({ title: t("Class cancelled", "تم إلغاء الحصة") });
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("Delete this class?", "حذف هذه الحصة؟"))) return;
    await supabase.from("live_sessions").delete().eq("id", id);
    setSessions(prev => prev.filter(s => s.id !== id));
    toast({ title: t("Class deleted", "تم حذف الحصة") });
  };

  const viewAttendance = async (session: any) => {
    setAttendanceSession(session);
    const [{ data: logs }, { data: manual }] = await Promise.all([
      supabase.from("attendance_logs").select("*, profiles:user_id(full_name)").eq("session_id", session.id),
      supabase.from("manual_attendance").select("*, profiles:student_id(full_name)").eq("session_id", session.id),
    ]);
    setAttendanceLogs(logs || []);
    setManualAttendance(manual || []);

    // Load enrolled students for editing
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
        m.status,
        "", "", "",
      ].join(","));
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "attendance.csv"; a.click();
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  if (attendanceSession) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setAttendanceSession(null)}>← {t("Back", "رجوع")}</Button>
          <Button variant="outline" onClick={exportAttendanceCSV}><Download className="h-4 w-4 me-2" />{t("Export CSV", "تصدير CSV")}</Button>
        </div>
        <h1 className="text-xl font-bold">{t("Attendance", "الحضور")} — {(attendanceSession as any).subjects?.title}</h1>

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

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t("Live Class Management", "إدارة الفصول المباشرة")}</h1>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 me-2" />{t("Schedule Class", "جدولة حصة")}</Button>
      </div>

      <div className="flex flex-wrap gap-3">
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
            <SelectItem value="active">{t("Active", "نشطة")}</SelectItem>
            <SelectItem value="ended">{t("Ended", "انتهت")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("Subject", "المادة")}</TableHead>
              <TableHead>{t("Status", "الحالة")}</TableHead>
              <TableHead>{t("Participants", "المشاركين")}</TableHead>
              <TableHead>{t("Date", "التاريخ")}</TableHead>
              <TableHead>{t("Actions", "الإجراءات")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{(s as any).subjects?.title || "-"}</TableCell>
                  <TableCell><Badge variant={s.status === "active" ? "default" : s.status === "scheduled" ? "secondary" : "outline"}>{s.status}</Badge></TableCell>
                  <TableCell>{s.total_participants || 0}</TableCell>
                  <TableCell>{new Date(s.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => viewAttendance(s)}><Users className="h-4 w-4" /></Button>
                      {(s.status === "scheduled" || s.status === "active") && (
                        <Button size="sm" variant="ghost" onClick={() => handleCancel(s.id)}>
                          <Clock className="h-4 w-4 text-amber-500" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t("No classes found", "لم يتم العثور على حصص")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Schedule Class", "جدولة حصة")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("Subject", "المادة")}</Label>
              <Select value={createSubject} onValueChange={setCreateSubject}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} className="w-full">{t("Create", "إنشاء")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LiveClassManagement;
