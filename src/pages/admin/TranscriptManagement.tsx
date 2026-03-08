import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Download, GraduationCap, Search, Edit, Stamp, Send, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import tahleemStamp from "@/assets/tahleem-stamp.png";

const gradePoint = (pct: number) => pct >= 85 ? 4.0 : pct >= 75 ? 3.5 : pct >= 65 ? 3.0 : pct >= 55 ? 2.0 : pct >= 45 ? 1.0 : 0.0;

const TranscriptManagement = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [term, setTerm] = useState("first");
  const [results, setResults] = useState<any[]>([]);
  const [editAttempt, setEditAttempt] = useState<any>(null);
  const [editScore, setEditScore] = useState("");
  const [editFeedback, setEditFeedback] = useState("");

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, full_name_ar, email, level, student_type, status, student_id").order("full_name");
      setStudents(data || []);
      setLoading(false);
    };
    fetch();
  }, []);

  const filtered = students.filter(s => {
    if (levelFilter !== "all" && s.level !== levelFilter) return false;
    if (search && !(s.full_name || "").toLowerCase().includes(search.toLowerCase()) && !(s.email || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const loadTranscript = async (student: any) => {
    setSelectedStudent(student);
    const { data } = await supabase.from("exam_attempts")
      .select("*, exams(title, title_ar, type, term, course_id, courses(subject_id, subjects(title, title_ar)))")
      .eq("user_id", student.user_id)
      .eq("status", "graded")
      .order("submitted_at", { ascending: false });
    const termResults = (data || []).filter((a: any) => ((a as any).exams?.term || "first") === term);
    setResults(termResults);
  };

  useEffect(() => { if (selectedStudent) loadTranscript(selectedStudent); }, [term]);

  // Group by subject
  const subjectMap = new Map<string, { title: string; title_ar: string; test: number; exam: number; testAttemptId?: string; examAttemptId?: string }>();
  results.forEach((r: any) => {
    const subTitle = (r as any).exams?.courses?.subjects?.title || "Unknown";
    const subTitleAr = (r as any).exams?.courses?.subjects?.title_ar || subTitle;
    const type = (r as any).exams?.type || "exam";
    if (!subjectMap.has(subTitle)) subjectMap.set(subTitle, { title: subTitle, title_ar: subTitleAr, test: 0, exam: 0 });
    const entry = subjectMap.get(subTitle)!;
    const score = Math.round(r.percentage || 0);
    if (type === "test") { entry.test = Math.max(entry.test, Math.round(score * 0.3)); entry.testAttemptId = r.id; }
    else { entry.exam = Math.max(entry.exam, Math.round(score * 0.7)); entry.examAttemptId = r.id; }
  });
  const subjectResults = Array.from(subjectMap.values());

  const totalObtained = subjectResults.reduce((s, r) => s + r.test + r.exam, 0);
  const totalObtainable = subjectResults.length * 100;
  const cgpa = subjectResults.length > 0 ? subjectResults.reduce((s, r) => s + gradePoint(r.test + r.exam), 0) / subjectResults.length : 0;

  const handleOverrideScore = async () => {
    if (!editAttempt || !editScore) return;
    const newScore = parseFloat(editScore);
    const totalPts = editAttempt.total_points || 100;
    const pct = (newScore / totalPts) * 100;
    await supabase.from("exam_attempts").update({
      score: newScore,
      percentage: pct,
      passed: pct >= 50,
      feedback: editFeedback || editAttempt.feedback,
    }).eq("id", editAttempt.id);
    toast({ title: t("Score overridden", "تم تعديل الدرجة") });
    setEditAttempt(null);
    if (selectedStudent) loadTranscript(selectedStudent);
  };

  const downloadPDF = async () => {
    if (!selectedStudent) return;
    const stampBase64 = await new Promise<string>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; c.getContext("2d")!.drawImage(img, 0, 0); resolve(c.toDataURL("image/png")); };
      img.src = tahleemStamp;
    });

    const levelText = selectedStudent.level === "beginner" ? "المبتدئة / Beginner" : selectedStudent.level === "intermediate" ? "المتوسطة / Intermediate" : selectedStudent.level || "---";
    const hijriYear = new Date().getFullYear() - 579;
    const termLabel = term === "first" ? "الفترة الأولى — First Term" : term === "second" ? "الفترة الثانية — Second Term" : "الفترة الثالثة — Third Term";

    const rows = subjectResults.map(s => {
      const total = s.test + s.exam;
      const gp = gradePoint(total);
      return `<tr><td>${s.title_ar || s.title}</td><td>${s.test}</td><td>${s.exam}</td><td style="font-weight:700">${total}</td><td>${total}%</td><td>${gp.toFixed(1)}</td><td style="color:${total >= 50 ? '#2a7a2a' : '#c0392b'};font-weight:700">${total >= 50 ? 'Pass ✓' : 'Fail ✗'}</td></tr>`;
    }).join("");

    const pw = window.open("", "_blank");
    if (!pw) return;
    pw.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>Transcript - ${selectedStudent.full_name}</title>
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo','Amiri',sans-serif;padding:30px 40px;position:relative}
.watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:80px;font-weight:700;color:#064E3B;opacity:0.04;pointer-events:none}
.header{text-align:center;margin-bottom:10px}.header .ar{font-family:'Amiri',serif;font-size:22px;font-weight:700}.header .en{font-size:14px;font-weight:700;letter-spacing:3px}
.title-box{border:2px solid #2a7a2a;border-radius:4px;padding:6px 20px;margin:14px auto;width:fit-content;display:flex;gap:30px}
.info-row{display:flex;justify-content:space-between;margin-bottom:8px;gap:24px}.info-field{display:flex;flex:1;gap:4px;align-items:baseline}
.info-field label{font-weight:700;font-size:13px;white-space:nowrap}.info-field .val{flex:1;border-bottom:1px solid #333;font-size:12px;text-align:right;padding:0 4px}
table.main{width:100%;border-collapse:collapse;margin-bottom:10px}table.main th,table.main td{border:1.5px solid #333;padding:3px 4px;text-align:center;font-size:10px}
table.main th{font-size:11px;font-weight:700}
table.summary{width:100%;border-collapse:collapse;margin-top:14px;direction:ltr}table.summary td{border:1.5px solid #333;padding:5px 8px;font-size:12px}
table.summary .lbl{font-weight:700;width:18%}.stamp-cell img{width:90px;height:90px;opacity:0.8;display:block;margin:0 auto}
@media print{@page{size:A4;margin:8mm}}</style></head><body>
<div class="watermark">TAHLEEM ACADEMY</div>
<div class="header"><div class="ar">أكاديمية التعليم</div><div class="en">TAHLEEM ACADEMY</div></div>
<div class="title-box"><span>كشف نتائج الطلبة</span><span>Student Report Sheet</span></div>
<div style="margin:16px 0">
<div class="info-row"><div class="info-field"><label>اسم الطالب(ة)</label><span class="val">${selectedStudent.full_name || "---"}</span></div><div class="info-field"><label>العام الدراسي</label><span class="val">${hijriYear} هـ / ${new Date().getFullYear()} م</span></div></div>
<div class="info-row"><div class="info-field"><label>المرحلة</label><span class="val">${levelText}</span></div><div class="info-field"><label>عدد المواد</label><span class="val">${subjectResults.length}</span></div></div>
<div class="info-row"><div class="info-field"><label>التاريخ</label><span class="val">${new Date().toLocaleDateString("ar-SA")}</span></div><div class="info-field"><label>الحالة</label><span class="val">${cgpa >= 2.0 ? "منتظمة / Regular" : "تحت المراقبة / Probation"}</span></div></div>
</div>
<div style="border:2px solid #2a7a2a;border-radius:4px;padding:4px 16px;margin:8px auto;width:fit-content;font-weight:700;text-align:center">${termLabel}</div>
<table class="main"><thead><tr><th>المواد / Subject</th><th>التمرينات (٣٠)</th><th>الإمتحانات (٧٠)</th><th>المجموع (١٠٠)</th><th>%</th><th>GP</th><th>النتيجة</th></tr></thead><tbody>${rows}</tbody></table>
<table class="summary">
<tr><td class="lbl">Marks Obtainable</td><td style="text-align:center">${totalObtainable}</td><td class="lbl">Marks Obtained</td><td style="text-align:center">${totalObtained}</td></tr>
<tr><td class="lbl">CGPA</td><td style="text-align:center">${cgpa.toFixed(2)}</td><td class="lbl">Status</td><td style="text-align:center">${cgpa >= 1.0 ? "Pass ✓" : "Fail ✗"}</td></tr>
<tr><td class="lbl">Comment</td><td style="text-align:center">${cgpa >= 3.5 ? "Outstanding" : cgpa >= 2.0 ? "Hardworking" : "Needs improvement"}</td><td class="lbl">Signature</td><td class="stamp-cell"><img src="${stampBase64}" alt="Stamp" /></td></tr>
</table>
<div style="text-align:center;margin-top:20px;font-size:10px;color:#666">Official Transcript — Tahleem Academy</div>
<script>window.onload=function(){setTimeout(function(){window.print()},500)}</script></body></html>`);
    pw.document.close();
    toast({ title: t("Print dialog opened", "تم فتح نافذة الطباعة") });
  };

  const exportAllCSV = () => {
    const rows = [["Student", "Level", "Type", "Email"].join(",")];
    filtered.forEach(s => rows.push([s.full_name || "", s.level || "", s.student_type || "", s.email || ""].join(",")));
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "transcripts-list.csv"; a.click();
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  if (selectedStudent) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Button variant="ghost" onClick={() => { setSelectedStudent(null); setResults([]); }}>← {t("Back", "رجوع")}</Button>
          <div className="flex gap-2">
            <Button onClick={downloadPDF}><Download className="h-4 w-4 me-2" />{t("Download PDF", "تحميل PDF")}</Button>
          </div>
        </div>
        <h1 className="text-xl font-bold">{selectedStudent.full_name} — {t("Transcript", "كشف النتائج")}</h1>

        <Select value={term} onValueChange={setTerm}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="first">{t("First Term", "الفترة الأولى")}</SelectItem>
            <SelectItem value="second">{t("Second Term", "الفترة الثانية")}</SelectItem>
            <SelectItem value="third">{t("Third Term", "الفترة الثالثة")}</SelectItem>
          </SelectContent>
        </Select>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("Subject", "المادة")}</TableHead>
                <TableHead>{t("Test (30)", "التمرينات (٣٠)")}</TableHead>
                <TableHead>{t("Exam (70)", "الامتحانات (٧٠)")}</TableHead>
                <TableHead>{t("Total", "المجموع")}</TableHead>
                <TableHead>GP</TableHead>
                <TableHead>{t("Result", "النتيجة")}</TableHead>
                <TableHead>{t("Actions", "الإجراءات")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {subjectResults.map((s, i) => {
                  const total = s.test + s.exam;
                  const gp = gradePoint(total);
                  return (
                    <TableRow key={i}>
                      <TableCell>{s.title_ar || s.title}</TableCell>
                      <TableCell className="text-center">{s.test}</TableCell>
                      <TableCell className="text-center">{s.exam}</TableCell>
                      <TableCell className="text-center font-bold">{total}</TableCell>
                      <TableCell className="text-center">{gp.toFixed(1)}</TableCell>
                      <TableCell className="text-center">{total >= 50 ? <Badge>Pass</Badge> : <Badge variant="destructive">Fail</Badge>}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {s.testAttemptId && (
                            <Button size="sm" variant="ghost" onClick={() => {
                              const attempt = results.find(r => r.id === s.testAttemptId);
                              setEditAttempt(attempt);
                              setEditScore(attempt?.score?.toString() || "");
                              setEditFeedback(attempt?.feedback || "");
                            }}><Edit className="h-3 w-3" /></Button>
                          )}
                          {s.examAttemptId && (
                            <Button size="sm" variant="ghost" onClick={() => {
                              const attempt = results.find(r => r.id === s.examAttemptId);
                              setEditAttempt(attempt);
                              setEditScore(attempt?.score?.toString() || "");
                              setEditFeedback(attempt?.feedback || "");
                            }}><Edit className="h-3 w-3" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {subjectResults.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t("No results", "لا توجد نتائج")}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm"><strong>CGPA:</strong> {cgpa.toFixed(2)}</p>
              <p className="text-sm"><strong>{t("Total", "المجموع")}:</strong> {totalObtained}/{totalObtainable}</p>
            </div>
            <Badge variant={cgpa >= 2.0 ? "default" : "destructive"}>{cgpa >= 2.0 ? "Pass" : "Fail"}</Badge>
          </CardContent>
        </Card>

        {/* Override Dialog */}
        <Dialog open={!!editAttempt} onOpenChange={() => setEditAttempt(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("Override Score", "تعديل الدرجة")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>{t("New Score", "الدرجة الجديدة")}</Label><Input type="number" value={editScore} onChange={e => setEditScore(e.target.value)} /></div>
              <div><Label>{t("Comment / Feedback", "تعليق / ملاحظات")}</Label><Textarea value={editFeedback} onChange={e => setEditFeedback(e.target.value)} /></div>
              <Button onClick={handleOverrideScore} className="w-full">{t("Save Override", "حفظ التعديل")}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t("Transcript Management", "إدارة كشوف النتائج")}</h1>
        <Button variant="outline" onClick={exportAllCSV}><Download className="h-4 w-4 me-2" />{t("Export List", "تصدير القائمة")}</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Levels", "كل المستويات")}</SelectItem>
            <SelectItem value="beginner">{t("Beginner", "مبتدئ")}</SelectItem>
            <SelectItem value="intermediate">{t("Intermediate", "متوسط")}</SelectItem>
            <SelectItem value="advanced">{t("Advanced", "متقدم")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("Search students...", "ابحث عن الطلاب...")} value={search} onChange={e => setSearch(e.target.value)} className="ps-9" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("Student", "الطالب")}</TableHead>
              <TableHead>{t("ID", "الرقم")}</TableHead>
              <TableHead>{t("Level", "المستوى")}</TableHead>
              <TableHead>{t("Type", "النوع")}</TableHead>
              <TableHead>{t("Actions", "الإجراءات")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(s => (
                <TableRow key={s.user_id}>
                  <TableCell className="font-medium">{s.full_name || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.student_id || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{s.level || "—"}</Badge></TableCell>
                  <TableCell>{s.student_type || "group"}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => loadTranscript(s)}><Eye className="h-4 w-4 me-1" />{t("View", "عرض")}</Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t("No students", "لا يوجد طلاب")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default TranscriptManagement;
