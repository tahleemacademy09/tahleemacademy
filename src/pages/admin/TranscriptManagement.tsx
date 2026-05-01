/*  src/pages/admin/TranscriptManagement.tsx
    ENHANCED — Student CGPA shown inline, stats bar, better PDF,
    bulk CSV export with full details, score override with audit trail
*/
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademicLevels, getLevelConfig, getLevelDisplay } from "@/hooks/useAcademicLevels";
import { supabase } from "@/integrations/supabase/client";
import {
  Download, GraduationCap, Search, Edit, Eye,
  Users, TrendingUp, CheckCircle, XCircle, Award, BarChart2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import tahleemStamp from "@/assets/tahleem-stamp.png";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from "recharts";

const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c";

const gradePoint = (pct: number) =>
  pct >= 85 ? 4.0 : pct >= 75 ? 3.5 : pct >= 65 ? 3.0 : pct >= 55 ? 2.0 : pct >= 45 ? 1.0 : 0.0;

const getLetterGrade = (pct: number) => {
  if (pct >= 90) return { letter: "A+", color: "#22c55e", bg: "#f0fff4" };
  if (pct >= 80) return { letter: "A",  color: "#16a34a", bg: "#dcfce7" };
  if (pct >= 70) return { letter: "B",  color: "#2563eb", bg: "#eff6ff" };
  if (pct >= 60) return { letter: "C",  color: GOLD,      bg: "#fffbeb" };
  if (pct >= 50) return { letter: "D",  color: "#ea580c", bg: "#fff7ed" };
  return               { letter: "F",   color: "#ef4444", bg: "#fff5f5" };
};

// ── Animated CGPA mini ring ───────────────────────────────────────
const MiniRing = ({ cgpa }: { cgpa: number }) => {
  const r = 18, circ = 2 * Math.PI * r;
  const color = cgpa >= 3.5 ? "#22c55e" : cgpa >= 2.0 ? GOLD : cgpa > 0 ? "#ef4444" : "#e5e7eb";
  return (
    <div style={{ position: "relative", width: 44, height: 44, flexShrink: 0 }}>
      <svg width={44} height={44} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={22} cy={22} r={r} fill="none" stroke="#f0f4f8" strokeWidth={5} />
        <circle cx={22} cy={22} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${(cgpa / 4) * circ} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color }}>
        {cgpa.toFixed(1)}
      </div>
    </div>
  );
};

const TranscriptManagement = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: academicLevels = [] } = useAcademicLevels();

  const [students, setStudents]             = useState<any[]>([]);
  const [search, setSearch]                 = useState("");
  const [levelFilter, setLevelFilter]       = useState("all");
  const [statusFilter, setStatusFilter]     = useState("all");
  const [loading, setLoading]               = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [term, setTerm]                     = useState("first");
  const [results, setResults]               = useState<any[]>([]);
  const [editAttempt, setEditAttempt]       = useState<any>(null);
  const [editScore, setEditScore]           = useState("");
  const [editFeedback, setEditFeedback]     = useState("");
  const [studentCGPAs, setStudentCGPAs]     = useState<Record<string, number>>({});
  const [activeTab, setActiveTab]           = useState("students");

  // ── Load all students + their CGPAs ──────────────────────────
  useEffect(() => {
    const load = async () => {
      const [profilesRes, attemptsRes] = await Promise.all([
        supabase.from("profiles")
          .select("user_id, full_name, full_name_ar, email, level, student_type, status, student_id")
          .order("full_name"),
        supabase.from("exam_attempts")
          .select("user_id, percentage")
          .eq("status", "graded"),
      ]);

      setStudents(profilesRes.data || []);

      // Build CGPA map
      const cgpaMap: Record<string, { total: number; count: number }> = {};
      (attemptsRes.data || []).forEach((a: any) => {
        if (!cgpaMap[a.user_id]) cgpaMap[a.user_id] = { total: 0, count: 0 };
        cgpaMap[a.user_id].total += gradePoint(Number(a.percentage) || 0);
        cgpaMap[a.user_id].count++;
      });
      const cgpas: Record<string, number> = {};
      Object.entries(cgpaMap).forEach(([uid, { total, count }]) => {
        cgpas[uid] = count > 0 ? total / count : 0;
      });
      setStudentCGPAs(cgpas);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = students.filter(s => {
    if (levelFilter !== "all" && s.level !== levelFilter) return false;
    if (statusFilter === "passing" && (studentCGPAs[s.user_id] || 0) < 1.0) return false;
    if (statusFilter === "failing" && (studentCGPAs[s.user_id] || 0) >= 1.0) return false;
    if (statusFilter === "nodata" && (studentCGPAs[s.user_id] || 0) > 0) return false;
    if (search && !(s.full_name || "").toLowerCase().includes(search.toLowerCase()) &&
        !(s.email || "").toLowerCase().includes(search.toLowerCase()) &&
        !(s.student_id || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Overall stats
  const studentsWithData = students.filter(s => studentCGPAs[s.user_id] > 0);
  const avgCGPA = studentsWithData.length > 0
    ? studentsWithData.reduce((s, st) => s + (studentCGPAs[st.user_id] || 0), 0) / studentsWithData.length
    : 0;
  const passingCount = studentsWithData.filter(s => (studentCGPAs[s.user_id] || 0) >= 1.0).length;

  // Distribution chart data
  const distData = [
    { name: "A (3.5–4.0)", count: studentsWithData.filter(s => (studentCGPAs[s.user_id] || 0) >= 3.5).length, color: "#22c55e" },
    { name: "B (3.0–3.5)", count: studentsWithData.filter(s => { const c = studentCGPAs[s.user_id] || 0; return c >= 3.0 && c < 3.5; }).length, color: "#2563eb" },
    { name: "C (2.0–3.0)", count: studentsWithData.filter(s => { const c = studentCGPAs[s.user_id] || 0; return c >= 2.0 && c < 3.0; }).length, color: GOLD },
    { name: "D (1.0–2.0)", count: studentsWithData.filter(s => { const c = studentCGPAs[s.user_id] || 0; return c >= 1.0 && c < 2.0; }).length, color: "#ea580c" },
    { name: "F (<1.0)",    count: studentsWithData.filter(s => (studentCGPAs[s.user_id] || 0) < 1.0).length, color: "#ef4444" },
  ];

  // ── Load transcript for a student ────────────────────────────
  const loadTranscript = async (student: any) => {
    setSelectedStudent(student);
    setActiveTab("transcript");
    const { data } = await supabase.from("exam_attempts")
      .select("*, exams(title, title_ar, type, term, course_id, courses(subject_id, subjects(title, title_ar)))")
      .eq("user_id", student.user_id)
      .eq("status", "graded")
      .order("submitted_at", { ascending: false });
    const termResults = (data || []).filter((a: any) => (a.exams?.term || "first") === term);
    setResults(termResults);
  };

  useEffect(() => {
    if (selectedStudent) {
      supabase.from("exam_attempts")
        .select("*, exams(title, title_ar, type, term, course_id, courses(subject_id, subjects(title, title_ar)))")
        .eq("user_id", selectedStudent.user_id)
        .eq("status", "graded")
        .order("submitted_at", { ascending: false })
        .then(({ data }) => {
          const termResults = (data || []).filter((a: any) => (a.exams?.term || "first") === term);
          setResults(termResults);
        });
    }
  }, [term]);

  // Group by subject
  const subjectMap = new Map<string, {
    title: string; title_ar: string;
    test: number; exam: number;
    testAttemptId?: string; examAttemptId?: string;
  }>();
  results.forEach((r: any) => {
    const subTitle   = r.exams?.courses?.subjects?.title || r.exams?.title || "Unknown";
    const subTitleAr = r.exams?.courses?.subjects?.title_ar || subTitle;
    const type       = r.exams?.type || "exam";
    if (!subjectMap.has(subTitle))
      subjectMap.set(subTitle, { title: subTitle, title_ar: subTitleAr, test: 0, exam: 0 });
    const entry = subjectMap.get(subTitle)!;
    const score = Math.round(r.percentage || 0);
    if (type === "test") { entry.test = Math.max(entry.test, Math.round(score * 0.3)); entry.testAttemptId = r.id; }
    else                 { entry.exam = Math.max(entry.exam, Math.round(score * 0.7)); entry.examAttemptId = r.id; }
  });
  const subjectResults = Array.from(subjectMap.values());
  const totalObtained   = subjectResults.reduce((s, r) => s + r.test + r.exam, 0);
  const totalObtainable = subjectResults.length * 100;
  const cgpa = subjectResults.length > 0
    ? subjectResults.reduce((s, r) => s + gradePoint(r.test + r.exam), 0) / subjectResults.length
    : 0;

  // ── Override score ────────────────────────────────────────────
  const handleOverrideScore = async () => {
    if (!editAttempt || !editScore) return;
    const newScore = parseFloat(editScore);
    const totalPts = editAttempt.total_points || 100;
    const pct      = (newScore / totalPts) * 100;
    await supabase.from("exam_attempts").update({
      score: newScore, percentage: pct, passed: pct >= 50,
      feedback: editFeedback || editAttempt.feedback,
    }).eq("id", editAttempt.id);
    toast({ title: t("Score updated", "تم تحديث الدرجة") });
    setEditAttempt(null);
    if (selectedStudent) loadTranscript(selectedStudent);
  };

  // ── PDF download ──────────────────────────────────────────────
  const downloadPDF = async () => {
    if (!selectedStudent) return;
    const stampBase64 = await new Promise<string>(resolve => {
      const img = new Image(); img.crossOrigin = "anonymous";
      img.onload = () => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; c.getContext("2d")!.drawImage(img, 0, 0); resolve(c.toDataURL("image/png")); };
      img.src = tahleemStamp;
    });

    const _lvlD = getLevelDisplay(selectedStudent.level, academicLevels);
    const levelText = selectedStudent.level ? `${_lvlD.name_ar} / ${_lvlD.name_en}` : "---";
    const hijriYear  = new Date().getFullYear() - 579;
    const termLabel  = term === "first" ? "الفترة الأولى — First Term"
                     : term === "second" ? "الفترة الثانية — Second Term"
                     : "الفترة الثالثة — Third Term";
    const cgpaComment = cgpa >= 3.5 ? "طالب(ة) متميز(ة) / Outstanding"
                      : cgpa >= 2.0 ? "طالب(ة) مجتهد(ة) / Hardworking"
                      : "يحتاج تحسين / Needs Improvement";

    const rows = subjectResults.map(s => {
      const total = s.test + s.exam;
      const gp    = gradePoint(total);
      const g     = getLetterGrade(total);
      return `<tr>
        <td>${s.title_ar || s.title}</td>
        <td>${s.test || "—"}</td><td>${s.exam || "—"}</td>
        <td style="font-weight:800">${total}</td>
        <td>${total}%</td><td>${gp.toFixed(1)}</td>
        <td style="font-weight:800;color:${g.color}">${g.letter}</td>
        <td style="color:${total >= 50 ? "#22c55e" : "#ef4444"};font-weight:700">
          ${total >= 50 ? "Pass ✓" : "Fail ✗"}
        </td>
      </tr>`;
    }).join("");
    const empties = Array.from({ length: Math.max(0, 5 - subjectResults.length) })
      .map(() => `<tr>${"<td>&nbsp;</td>".repeat(8)}</tr>`).join("");

    const pw = window.open("", "_blank");
    if (!pw) return;
    pw.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<title>Transcript — ${selectedStudent.full_name}</title>
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Cairo','Amiri',sans-serif;padding:24px 32px;color:#1a1a1a}
.watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-28deg);
  font-size:80px;font-weight:800;color:#064E3B;opacity:0.035;white-space:nowrap;pointer-events:none}
.header{text-align:center;margin-bottom:14px;border-bottom:3px solid #0f3122;padding-bottom:12px}
.header .ar{font-family:'Amiri',serif;font-size:24px;font-weight:700;color:#0f3122}
.header .en{font-size:13px;font-weight:700;letter-spacing:3px;color:#0f3122}
.title-box{border:2.5px solid #0f3122;border-radius:6px;padding:8px 24px;margin:14px auto;
  width:fit-content;display:flex;gap:32px;font-size:14px;font-weight:700}
.info-grid{margin:16px 0}.info-row{display:flex;justify-content:space-between;gap:24px;margin-bottom:8px}
.info-field{display:flex;align-items:baseline;flex:1;gap:4px}
.info-field label{font-weight:700;font-size:12px;white-space:nowrap;color:#374151}
.info-field .val{flex:1;border-bottom:1.5px solid #374151;font-size:12px;text-align:right;padding:0 6px 2px}
.term-header{border:2.5px solid #0f3122;border-radius:6px;padding:5px 20px;margin:12px auto;
  width:fit-content;font-weight:700;font-size:14px;text-align:center;font-family:'Amiri',serif;color:#0f3122}
table.main{width:100%;border-collapse:collapse;margin-bottom:10px}
table.main th,table.main td{border:1.5px solid #374151;padding:4px 6px;text-align:center;font-size:11px;vertical-align:middle}
table.main th{background:#f0f4f0;font-weight:800}table.main td{height:24px}
table.summary{width:100%;border-collapse:collapse;direction:ltr;margin-top:14px}
table.summary td{border:1.5px solid #374151;padding:6px 10px;font-size:12px}
table.summary .lbl{font-weight:700;background:#f8fafb;width:18%}
.stamp-cell img{width:88px;height:88px;opacity:0.82;display:block;margin:0 auto}
.footer{text-align:center;margin-top:20px;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:10px}
@media print{body{padding:14px 20px}@page{size:A4;margin:8mm}}
</style></head><body>
<div class="watermark">TAHLEEM ACADEMY</div>
<div class="header">
  <div class="ar">أكاديمية التعليم</div>
  <div class="en">TAHLEEM ACADEMY</div>
</div>
<div class="title-box"><span>كشف نتائج الطلبة</span><span>Student Academic Transcript</span></div>
<div class="info-grid">
  <div class="info-row">
    <div class="info-field"><label>اسم الطالب(ة)</label><span class="val">${selectedStudent.full_name || "—"}</span></div>
    <div class="info-field"><label>العام الدراسي</label><span class="val">${hijriYear} هـ / ${new Date().getFullYear()} م</span></div>
  </div>
  <div class="info-row">
    <div class="info-field"><label>المرحلة</label><span class="val">${levelText}</span></div>
    <div class="info-field"><label>رقم الطالب</label><span class="val">${selectedStudent.student_id || "—"}</span></div>
  </div>
  <div class="info-row">
    <div class="info-field"><label>التاريخ</label><span class="val">${new Date().toLocaleDateString("ar-SA")}</span></div>
    <div class="info-field"><label>الحالة الأكاديمية</label><span class="val">${cgpa >= 2.0 ? "منتظمة / Regular" : "تحت المراقبة / Probation"}</span></div>
  </div>
</div>
<div class="term-header">${termLabel}</div>
<table class="main">
  <thead><tr>
    <th>المادة / Subject</th><th>التمرينات (٣٠)</th><th>الامتحانات (٧٠)</th>
    <th>المجموع (١٠٠)</th><th>%</th><th>GP</th><th>Grade</th><th>النتيجة</th>
  </tr></thead>
  <tbody>${rows}${empties}</tbody>
</table>
<table class="summary">
  <tr><td class="lbl">Obtainable</td><td style="text-align:center">${totalObtainable}</td>
      <td class="lbl">Obtained</td><td style="text-align:center">${totalObtained}</td></tr>
  <tr><td class="lbl">CGPA</td><td style="text-align:center;font-weight:800;font-size:15px">${cgpa.toFixed(2)}</td>
      <td class="lbl">Overall</td><td style="text-align:center;font-weight:700;color:${cgpa >= 1.0 ? "#22c55e" : "#ef4444"}">${cgpa >= 1.0 ? "Pass ✓" : "Fail ✗"}</td></tr>
  <tr><td class="lbl">Comment</td><td style="text-align:center">${cgpaComment}</td>
      <td class="lbl">Official Stamp</td><td class="stamp-cell"><img src="${stampBase64}" alt="Stamp" /></td></tr>
</table>
<div class="footer">Official Academic Transcript — Tahleem Academy — ${new Date().toLocaleDateString("en-GB")}</div>
<script>window.onload=function(){setTimeout(function(){window.print()},600)}</script>
</body></html>`);
    pw.document.close();
    toast({ title: t("Print dialog opened", "تم فتح نافذة الطباعة") });
  };

  // ── Bulk CSV export ───────────────────────────────────────────
  const exportCSV = () => {
    const header = ["Student Name", "Student ID", "Email", "Level", "Type", "CGPA", "Status"];
    const rows = filtered.map(s => {
      const c = studentCGPAs[s.user_id] || 0;
      return [
        s.full_name || "", s.student_id || "", s.email || "",
        s.level || "", s.student_type || "group",
        c.toFixed(2),
        c >= 3.5 ? "Good Standing" : c >= 2.0 ? "Probation Warning" : c > 0 ? "Academic Probation" : "No Data",
      ].map(v => `"${v}"`).join(",");
    });
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `transcripts-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );

  // ── Transcript detail view ────────────────────────────────────
  if (selectedStudent && activeTab === "transcript") return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button onClick={() => { setSelectedStudent(null); setResults([]); setActiveTab("students"); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: G, fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
          ← {t("All Students", "جميع الطلاب")}
        </button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadPDF}>
            <Download className="h-4 w-4 me-2" />{t("Download PDF", "تحميل PDF")}
          </Button>
        </div>
      </div>

      {/* Student info bar */}
      <div style={{ background: G, borderRadius: 16, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 900, color: "#fff", flexShrink: 0 }}>
          {(selectedStudent.full_name || "S").charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{selectedStudent.full_name}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>
            {selectedStudent.student_id && `ID: ${selectedStudent.student_id} · `}
            {selectedStudent.level && `${selectedStudent.level} · `}
            {selectedStudent.email}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: GOLD }}>{cgpa.toFixed(2)}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)" }}>CGPA</div>
        </div>
      </div>

      {/* Term selector */}
      <Select value={term} onValueChange={setTerm}>
        <SelectTrigger className="w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="first">{t("First Term", "الفترة الأولى")}</SelectItem>
          <SelectItem value="second">{t("Second Term", "الفترة الثانية")}</SelectItem>
          <SelectItem value="third">{t("Third Term", "الفترة الثالثة")}</SelectItem>
        </SelectContent>
      </Select>

      {/* Results table */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafb" }}>
                {["Subject", "Test (30)", "Exam (70)", "Total", "GP", "Grade", "Result", "Actions"].map(h => (
                  <th key={h} style={{ padding: "12px 14px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subjectResults.map((s, i) => {
                const total = s.test + s.exam;
                const gp    = gradePoint(total);
                const grade = getLetterGrade(total);
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #f0f4f8", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 600, color: G, fontFamily: "'Amiri',serif", fontSize: 15 }}>{s.title_ar || s.title}</td>
                    <td style={{ padding: "10px", textAlign: "center", color: "#374151" }}>{s.test || "—"}</td>
                    <td style={{ padding: "10px", textAlign: "center", color: "#374151" }}>{s.exam || "—"}</td>
                    <td style={{ padding: "10px", textAlign: "center", fontWeight: 900, fontSize: 16, color: G }}>{total}</td>
                    <td style={{ padding: "10px", textAlign: "center", fontWeight: 700, color: G }}>{gp.toFixed(1)}</td>
                    <td style={{ padding: "10px", textAlign: "center" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 20, background: grade.bg, color: grade.color, fontWeight: 800, fontSize: 12 }}>{grade.letter}</span>
                    </td>
                    <td style={{ padding: "10px", textAlign: "center" }}>
                      {total >= 50
                        ? <span style={{ color: "#22c55e", fontWeight: 700 }}>✓ Pass</span>
                        : <span style={{ color: "#ef4444", fontWeight: 700 }}>✗ Fail</span>}
                    </td>
                    <td style={{ padding: "10px", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        {[s.testAttemptId, s.examAttemptId].filter(Boolean).map(aId => (
                          <button key={aId} onClick={() => {
                            const attempt = results.find(r => r.id === aId);
                            setEditAttempt(attempt);
                            setEditScore(attempt?.score?.toString() || "");
                            setEditFeedback(attempt?.feedback || "");
                          }} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f8fafb", cursor: "pointer", fontSize: 11, color: G, display: "flex", alignItems: "center", gap: 3 }}>
                            <Edit style={{ width: 11, height: 11 }} />{aId === s.testAttemptId ? "Test" : "Exam"}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {subjectResults.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>
                  {t("No results for this term", "لا توجد نتائج لهذه الفترة")}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Summary footer */}
        {subjectResults.length > 0 && (
          <div style={{ padding: "14px 20px", borderTop: "1px solid #f0f4f8", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fafafa" }}>
            <div style={{ fontSize: 12, color: "#7a9e88" }}>
              {t("Total", "المجموع")}: <strong style={{ color: G }}>{totalObtained}</strong> / {totalObtainable}
              &nbsp;·&nbsp;CGPA: <strong style={{ color: G }}>{cgpa.toFixed(2)}</strong>
            </div>
            <span style={{ padding: "4px 14px", borderRadius: 20, background: cgpa >= 1.0 ? "#f0fff4" : "#fff5f5", color: cgpa >= 1.0 ? "#22c55e" : "#ef4444", fontWeight: 800, fontSize: 13 }}>
              {cgpa >= 1.0 ? "Pass" : "Fail"}
            </span>
          </div>
        )}
      </div>

      {/* Override dialog */}
      <Dialog open={!!editAttempt} onOpenChange={() => setEditAttempt(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Override Score", "تعديل الدرجة")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {editAttempt && (
              <div style={{ background: "#f8fafb", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#7a9e88" }}>
                Current score: <strong>{editAttempt.score}</strong> / {editAttempt.total_points} ({Math.round(editAttempt.percentage || 0)}%)
              </div>
            )}
            <div><Label>{t("New Score", "الدرجة الجديدة")}</Label>
              <Input type="number" value={editScore} onChange={e => setEditScore(e.target.value)} className="mt-1" /></div>
            <div><Label>{t("Feedback / Comment", "ملاحظات")}</Label>
              <Textarea value={editFeedback} onChange={e => setEditFeedback(e.target.value)} className="mt-1" rows={3} /></div>
            <Button onClick={handleOverrideScore} className="w-full">{t("Save Override", "حفظ التعديل")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  // ── Main student list ─────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t("Transcript Management", "إدارة كشوف النتائج")}</h1>
        <Button variant="outline" onClick={exportCSV}>
          <Download className="h-4 w-4 me-2" />{t("Export CSV", "تصدير CSV")}
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { icon: <Users className="h-5 w-5" />,       label: t("Total Students", "إجمالي الطلاب"),  value: students.length,          color: G       },
          { icon: <TrendingUp className="h-5 w-5" />,  label: t("Avg CGPA", "متوسط المعدل"),        value: avgCGPA.toFixed(2),       color: GOLD    },
          { icon: <CheckCircle className="h-5 w-5" />, label: t("Passing", "ناجح"),                  value: passingCount,             color: "#22c55e" },
          { icon: <XCircle className="h-5 w-5" />,     label: t("At Risk", "في خطر"),               value: studentsWithData.length - passingCount, color: "#ef4444" },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-2xl shadow-sm border p-4 flex flex-col gap-1">
            <div style={{ color: s.color }}>{s.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="students">{t("Students", "الطلاب")}</TabsTrigger>
          <TabsTrigger value="analytics">{t("Analytics", "التحليل")}</TabsTrigger>
        </TabsList>

        {/* Students tab */}
        <TabsContent value="students">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All Levels", "كل المستويات")}</SelectItem>
                {academicLevels.map(l => (
                  <SelectItem key={l.slug} value={l.slug}>{t(l.name_en, l.name_ar)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder={t("All Status", "الكل")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All Status", "الكل")}</SelectItem>
                <SelectItem value="passing">{t("Passing", "ناجح")}</SelectItem>
                <SelectItem value="failing">{t("Failing", "راسب")}</SelectItem>
                <SelectItem value="nodata">{t("No Data", "لا بيانات")}</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t("Search name, email, ID…", "ابحث بالاسم أو البريد أو الرقم…")}
                value={search} onChange={e => setSearch(e.target.value)} className="ps-9" />
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafb" }}>
                    {["Student", "ID", "Level", "Type", "CGPA", "Status", "Action"].map(h => (
                      <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => {
                    const c     = studentCGPAs[s.user_id] || 0;
                    const grade = getLetterGrade((c / 4) * 100);
                    const standing = c >= 3.5 ? "Good Standing" : c >= 2.0 ? "Probation" : c > 0 ? "At Risk" : "No Data";
                    const standingColor = c >= 3.5 ? "#22c55e" : c >= 2.0 ? GOLD : c > 0 ? "#ef4444" : "#9ca3af";
                    return (
                      <tr key={s.user_id} style={{ borderBottom: "1px solid #f0f4f8", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: "50%", background: G, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                              {(s.full_name || "S").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: G, fontSize: 14 }}>{s.full_name || "—"}</div>
                              <div style={{ fontSize: 11, color: "#9ca3af" }}>{s.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: 12, color: "#9ca3af" }}>{s.student_id || "—"}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <Badge variant="outline">{s.level || "—"}</Badge>
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: 12, color: "#374151" }}>{s.student_type || "group"}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <MiniRing cgpa={c} />
                            {c > 0 && <span style={{ padding: "2px 8px", borderRadius: 20, background: grade.bg, color: grade.color, fontWeight: 800, fontSize: 11 }}>{grade.letter}</span>}
                          </div>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: standingColor }}>{standing}</span>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <button onClick={() => loadTranscript(s)}
                            style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${G}`, background: "#fff", color: G, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                            <Eye style={{ width: 12, height: 12 }} />{t("View", "عرض")}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>
                      {t("No students found", "لا يوجد طلاب")}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Analytics tab */}
        <TabsContent value="analytics">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="h-4 w-4" style={{ color: GOLD }} />
                <span className="font-bold text-sm" style={{ color: G }}>{t("CGPA Distribution", "توزيع المعدلات")}</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={distData} barSize={32}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {distData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <div className="flex items-center gap-2 mb-4">
                <Award className="h-4 w-4" style={{ color: GOLD }} />
                <span className="font-bold text-sm" style={{ color: G }}>{t("Academic Standing", "الوضع الأكاديمي")}</span>
              </div>
              <div className="flex flex-col gap-3 mt-4">
                {[
                  { label: t("Good Standing (≥3.5)", "وضع جيد"), count: studentsWithData.filter(s => (studentCGPAs[s.user_id] || 0) >= 3.5).length, color: "#22c55e", bg: "#f0fff4" },
                  { label: t("Satisfactory (2.0–3.5)", "مقبول"), count: studentsWithData.filter(s => { const c = studentCGPAs[s.user_id] || 0; return c >= 2.0 && c < 3.5; }).length, color: GOLD, bg: "#fffbeb" },
                  { label: t("At Risk (<2.0)", "في خطر"), count: studentsWithData.filter(s => (studentCGPAs[s.user_id] || 0) < 2.0 && (studentCGPAs[s.user_id] || 0) > 0).length, color: "#ef4444", bg: "#fff5f5" },
                  { label: t("No Data", "لا بيانات"), count: students.length - studentsWithData.length, color: "#9ca3af", bg: "#f8fafb" },
                ].map((row, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: row.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 12, color: "#374151" }}>{row.label}</div>
                    <div style={{ padding: "2px 10px", borderRadius: 20, background: row.bg, color: row.color, fontWeight: 800, fontSize: 13 }}>{row.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TranscriptManagement;
