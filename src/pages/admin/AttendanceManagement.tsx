import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Download, Search, AlertTriangle, Users, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const AttendanceManagement = () => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [students, setStudents] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const [{ data: studs }, { data: subs }, { data: att }] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, level, email").order("full_name"),
        supabase.from("subjects").select("id, title, title_ar"),
        supabase.from("manual_attendance").select("*").order("date", { ascending: false }).limit(1000),
      ]);
      setStudents(studs || []);
      setSubjects(subs || []);
      setAttendance(att || []);
      setLoading(false);
    };
    fetch();
  }, []);

  // Calculate attendance percentage per student
  const studentAttendanceMap = new Map<string, { present: number; total: number; name: string; level: string }>();
  const studentMap = new Map<string, any>();
  students.forEach(s => studentMap.set(s.user_id, s));

  attendance.forEach(a => {
    if (subjectFilter !== "all" && a.subject_id !== subjectFilter) return;
    const s = studentMap.get(a.student_id);
    if (!s) return;
    if (search && !(s.full_name || "").toLowerCase().includes(search.toLowerCase())) return;
    if (!studentAttendanceMap.has(a.student_id)) {
      studentAttendanceMap.set(a.student_id, { present: 0, total: 0, name: s.full_name || "", level: s.level || "" });
    }
    const entry = studentAttendanceMap.get(a.student_id)!;
    entry.total++;
    if (a.status === "present" || a.status === "late") entry.present++;
  });

  const attendanceSummary = Array.from(studentAttendanceMap.entries()).map(([userId, data]) => ({
    userId,
    ...data,
    percentage: data.total > 0 ? Math.round((data.present / data.total) * 100) : 0,
  })).sort((a, b) => a.percentage - b.percentage);

  const poorAttendance = attendanceSummary.filter(s => s.percentage < 60);

  const editAttendanceStatus = async (id: string, newStatus: string) => {
    await supabase.from("manual_attendance").update({ status: newStatus }).eq("id", id);
    setAttendance(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
    toast({ title: t("Attendance updated", "تم تحديث الحضور") });
  };

  const exportCSV = () => {
    const rows = [["Student", "Level", "Present", "Total", "Percentage"].join(",")];
    attendanceSummary.forEach(s => rows.push([s.name, s.level, s.present, s.total, `${s.percentage}%`].join(",")));
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "attendance-report.csv"; a.click();
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t("Attendance Management", "إدارة الحضور")}</h1>
        <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 me-2" />{t("Export CSV", "تصدير CSV")}</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{attendanceSummary.length}</p>
            <p className="text-sm text-muted-foreground">{t("Students Tracked", "الطلاب المتتبعين")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{poorAttendance.length}</p>
            <p className="text-sm text-muted-foreground">{t("Poor Attendance (<60%)", "حضور ضعيف (<60%)")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{attendance.length}</p>
            <p className="text-sm text-muted-foreground">{t("Total Records", "إجمالي السجلات")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder={t("All Subjects", "كل المواد")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Subjects", "كل المواد")}</SelectItem>
            {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("Search students...", "ابحث عن الطلاب...")} value={search} onChange={e => setSearch(e.target.value)} className="ps-9" />
        </div>
      </div>

      {/* Poor Attendance Alert */}
      {poorAttendance.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2 text-destructive"><AlertTriangle className="h-4 w-4" />{t("Students with Poor Attendance", "طلاب ذوي حضور ضعيف")}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {poorAttendance.slice(0, 10).map(s => (
              <div key={s.userId} className="flex items-center justify-between p-2 rounded bg-destructive/5">
                <span className="text-sm">{s.name}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">{s.percentage}%</Badge>
                  <Button size="sm" variant="outline" onClick={async () => {
                    await supabase.from("notifications").insert({
                      user_id: s.userId,
                      title: "⚠️ Attendance Warning",
                      message: `Your attendance is at ${s.percentage}%. Please improve your attendance to avoid academic probation.`,
                      type: "warning",
                    });
                    toast({ title: t("Warning sent", "تم إرسال التحذير") });
                  }}>{t("Send Warning", "إرسال تحذير")}</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Summary Table */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{t("Attendance Summary", "ملخص الحضور")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("Student", "الطالب")}</TableHead>
              <TableHead>{t("Level", "المستوى")}</TableHead>
              <TableHead>{t("Present", "حاضر")}</TableHead>
              <TableHead>{t("Total", "الإجمالي")}</TableHead>
              <TableHead>{t("Percentage", "النسبة")}</TableHead>
              <TableHead>{t("Status", "الحالة")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {attendanceSummary.map(s => (
                <TableRow key={s.userId}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell><Badge variant="outline">{s.level}</Badge></TableCell>
                  <TableCell>{s.present}</TableCell>
                  <TableCell>{s.total}</TableCell>
                  <TableCell>
                    <span className={s.percentage < 60 ? "text-destructive font-bold" : s.percentage < 80 ? "text-amber-600" : "text-green-600"}>
                      {s.percentage}%
                    </span>
                  </TableCell>
                  <TableCell>
                    {s.percentage < 60 ? <Badge variant="destructive">{t("Poor", "ضعيف")}</Badge>
                      : s.percentage < 80 ? <Badge variant="secondary">{t("Fair", "مقبول")}</Badge>
                      : <Badge>{t("Good", "جيد")}</Badge>}
                  </TableCell>
                </TableRow>
              ))}
              {attendanceSummary.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("No attendance records", "لا توجد سجلات حضور")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AttendanceManagement;
