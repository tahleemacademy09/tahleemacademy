import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

const TeacherAttendance = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data: subs } = await supabase.from("subjects").select("id, title").eq("teacher_id", user.id);
      const subjectIds = (subs || []).map(s => s.id);
      if (subjectIds.length > 0) {
        const { data } = await supabase.from("live_sessions").select("*, subjects(title)").in("subject_id", subjectIds).order("created_at", { ascending: false });
        setSessions(data || []);
      }
      setLoading(false);
    };
    fetch();
  }, [user]);

  const loadSessionAttendance = async (session: any) => {
    setSelectedSession(session);
    // Get enrolled students for this subject
    const { data: courses } = await supabase.from("courses").select("id").eq("subject_id", session.subject_id);
    const courseIds = (courses || []).map((c: any) => c.id);
    let enrolledStudents: any[] = [];
    if (courseIds.length > 0) {
      const { data: enrollments } = await supabase.from("enrollments").select("user_id").in("course_id", courseIds);
      const userIds = [...new Set((enrollments || []).map(e => e.user_id))];
      if (userIds.length > 0) {
        const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
        enrolledStudents = data || [];
      }
    }
    setStudents(enrolledStudents);

    // Load existing attendance
    const { data: existing } = await supabase.from("manual_attendance").select("student_id, status").eq("session_id", session.id);
    const map: Record<string, string> = {};
    (existing || []).forEach((a: any) => { map[a.student_id] = a.status; });
    enrolledStudents.forEach(s => { if (!map[s.user_id]) map[s.user_id] = "absent"; });
    setAttendance(map);
  };

  const saveAttendance = async () => {
    if (!selectedSession || !user) return;
    // Delete existing, then insert fresh
    await supabase.from("manual_attendance").delete().eq("session_id", selectedSession.id);
    const records = Object.entries(attendance).map(([student_id, status]) => ({
      session_id: selectedSession.id,
      student_id,
      subject_id: selectedSession.subject_id,
      teacher_id: user.id,
      status,
      date: selectedSession.created_at?.split("T")[0] || new Date().toISOString().split("T")[0],
    }));
    const { error } = await supabase.from("manual_attendance").insert(records);
    if (!error) toast({ title: t("Attendance saved!", "تم حفظ الحضور!") });
    else toast({ title: t("Error saving", "خطأ في الحفظ"), variant: "destructive" });
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  if (selectedSession) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Button variant="ghost" onClick={() => setSelectedSession(null)}>← {t("Back", "رجوع")}</Button>
        <h1 className="text-xl font-bold">{t("Mark Attendance", "تسجيل الحضور")} — {(selectedSession as any).subjects?.title}</h1>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Student", "الطالب")}</TableHead>
                  <TableHead>{t("Status", "الحالة")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map(s => (
                  <TableRow key={s.user_id}>
                    <TableCell>{s.full_name}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {["present", "absent", "late"].map(status => (
                          <Button key={status} size="sm"
                            variant={attendance[s.user_id] === status ? "default" : "outline"}
                            className={attendance[s.user_id] === status ? (status === "present" ? "bg-green-600" : status === "late" ? "bg-amber-500" : "bg-destructive") : ""}
                            onClick={() => setAttendance({ ...attendance, [s.user_id]: status })}>
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
        <Button onClick={saveAttendance} className="w-full md:w-auto">{t("Save Attendance", "حفظ الحضور")}</Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold">{t("Attendance", "الحضور")}</h1>
      <div className="space-y-3">
        {sessions.map(s => (
          <Card key={s.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => loadSessionAttendance(s)}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{(s as any).subjects?.title || "Session"}</p>
                <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()} • {s.total_participants || 0} {t("participants", "مشاركين")}</p>
              </div>
              <Badge variant={s.status === "ended" ? "outline" : "default"}>{s.status}</Badge>
            </CardContent>
          </Card>
        ))}
        {sessions.length === 0 && <p className="text-muted-foreground text-center py-8">{t("No sessions found", "لم يتم العثور على جلسات")}</p>}
      </div>
    </div>
  );
};

export default TeacherAttendance;
