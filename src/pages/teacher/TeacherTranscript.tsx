/*  src/pages/teacher/TeacherTranscript.tsx
    ENHANCED — Student cards with CGPA rings, per-subject bars,
    add feedback inline, improved PDF with teacher signature
*/
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Download, GraduationCap, MessageSquare, Search,
  CheckCircle, XCircle, ChevronRight, Users
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import tahleemStamp from "@/assets/tahleem-stamp.png";

const G = "#0f2d1f", GOLD = "#c9a84c";

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

// ── Mini CGPA Ring ────────────────────────────────────────────────
const MiniRing = ({ cgpa }: { cgpa: number }) => {
  const r = 22, circ = 2 * Math.PI * r;
  const color = cgpa >= 3.5 ? "#22c55e" : cgpa >= 2.0 ? GOLD : cgpa > 0 ? "#ef4444" : "#e5e7eb";
  return (
    <div style={{ position: "relative", width: 54, height: 54, flexShrink: 0 }}>
      <svg width={54} height={54} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={27} cy={27} r={r} fill="none" stroke="#f0f4f8" strokeWidth={6} />
        <circle cx={27} cy={27} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${(cgpa / 4) * circ} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 10, fontWeight: 900, color, lineHeight: 1 }}>{cgpa.toFixed(1)}</div>
        <div style={{ fontSize: 7, color: "#9ca3af" }}>GPA</div>
      </div>
    </div>
  );
};

// ── Score Bar ─────────────────────────────────────────────────────
const ScoreBar = ({ value, max = 100 }: { value: number; max?: number }) => {
  const pct   = Math.min(100, (value / max) * 100);
  const color = pct >= 70 ? "#22c55e" : pct >= 50 ? GOLD : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
      <div style={{ flex: 1, height: 6, background: "#f0f4f8", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width .8s ease" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 28, textAlign: "right" }}>{value}</span>
    </div>
  );
};

const TeacherTranscript = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();

  const [students, setStudents]             = useState<any[]>([]);
  const [search, setSearch]                 = useState("");
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [term, setTerm]                     = useState("first");
  const [results, setResults]               = useState<any[]>([]);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [loading, setLoading]               = useState(true);
  const [showComment, setShowComment]       = useState(false);
  const [commentAttemptId, setCommentAttemptId] = useState("");
  const [commentText, setCommentText]       = useState("");
  const [studentCGPAs, setStudentCGPAs]     = useState<Record<string, number>>({});

  // ── Load students ─────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const allStudents: any[] = [];

      const { data: subs } = await supabase.from("subjects").select("id").eq("teacher_id", user.id);
      const subjectIds = (subs || []).map(s => s.id);
      if (subjectIds.length > 0) {
        const { data: courses } = await supabase.from("courses").select("id").in("subject_id", subjectIds);
        const courseIds = (courses || []).map((c: any) => c.id);
        if (courseIds.length > 0) {
          const { data: enrollments } = await supabase.from("enrollments").select("user_id").in("course_id", courseIds);
          const uids = [...new Set((enrollments || []).map(e => e.user_id))];
          if (uids.length > 0) {
            const { data } = await supabase.from("profiles").select("user_id, full_name, full_name_ar, level, email, student_id").in("user_id", uids);
            allStudents.push(...(data || []));
          }
        }
      }

      // Private students
      const { data: pvt } = await supabase.from("profiles").select("user_id, full_name, full_name_ar, level, email, student_id").eq("assigned_teacher_id", user.id);
      if (pvt) {
        const existing = new Set(allStudents.map(s => s.user_id));
        allStudents.push(...pvt.filter(p => !existing.has(p.user_id)));
      }

      setStudents(allStudents);

      // Build CGPA per student
      if (allStudents.length > 0) {
        const uids = allStudents.map(s => s.user_id);
        const { data: attempts } = await supabase.from("exam_attempts").select("user_id, percentage").eq("status", "graded").in("user_id", uids);
        const cgpaMap: Record<string, { total: number; count: number }> = {};
        (attempts || []).forEach((a: any) => {
          if (!cgpaMap[a.user_id]) cgpaMap[a.user_id] = { total: 0, count: 0 };
          cgpaMap[a.user_id].total += gradePoint(Number(a.percentage) || 0);
          cgpaMap[a.user_id].count++;
        });
        const cgpas: Record<string, number> = {};
        Object.entries(cgpaMap).forEach(([uid, { total, count }]) => { cgpas[uid] = count > 0 ? total / count : 0; });
        setStudentCGPAs(cgpas);
      }

      setLoading(false);
    };
    load();
  }, [user]);

  // ── Load transcript ───────────────────────────────────────────
  const loadTranscript = async (student: any) => {
    setSelectedStudent(student);
    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", student.user_id).maybeSingle();
    setStudentProfile(profile);
    const { data } = await supabase.from("exam_attempts")
      .select("*, exams(title, title_ar, type, term, course_id, courses(subject_id, subjects(title, title_ar)))")
      .eq("user_id", student.user_id).eq("status", "graded")
      .order("submitted_at", { ascending: false });
    const termResults = (data || []).filter((a: any) => (a.exams?.term || "first") === term);
    setResults(termResults);
  };

  useEffect(() => {
    if (selectedStudent) loadTranscript(selectedStudent);
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
  const cgpa = subjectResults.length > 0
    ? subjectResults.reduce((s, r) => s + gradePoint(r.test + r.exam), 0) / subjectResults.length
    : 0;
  const totalObtained   = subjectResults.reduce((s, r) => s + r.test + r.exam, 0);
  const totalObtainable = subjectResults.length * 100;

  const filteredStudents = students.filter(s =>
    !search ||
    (s.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (s.email || "").toLowerCase().includes(search.toLowerCase()) ||
    (s.student_id || "").toLowerCase().includes(search.toLowerCase())
  );

  // ── PDF ───────────────────────────────────────────────────────
  const downloadPDF = async () => {
    const stampBase64 = await new Promise<string>(resolve => {
      const img = new Image(); img.crossOrigin = "anonymous";
      img.onload = () => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; c.getContext("2d")!.drawImage(img, 0, 0); resolve(c.toDataURL("image/png")); };
      img.src = tahleemStamp;
    });

    const termLabel  = term === "first" ? "الفترة الأولى — First Term"
                     : term === "second" ? "الفترة الثانية — Second Term"
                     : "الفترة الثالثة — Third Term";
    const levelText  = studentProfile?.level === "beginner" ? "المبتدئة / Beginner"
                     : studentProfile?.level === "intermediate" ? "المتوسطة / Intermediate"
                     : studentProfile?.level || "---";
    const hijriYear  = new Date().getFullYear() - 579;
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

    const pw = window.open("", "_blank"); if (!pw) return;
    pw.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<title>Transcript — ${studentProfile?.full_name}</title>
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
.sig-line{border-bottom:1.5px solid #374151;min-width:140px;display:inline-block;margin-top:30px}
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
    <div class="info-field"><label>اسم الطالب(ة)</label><span class="val">${studentProfile?.full_name || "—"}</span></div>
    <div class="info-field"><label>العام الدراسي</label><span class="val">${hijriYear} هـ / ${new Date().getFullYear()} م</span></div>
  </div>
  <div class="info-row">
    <div class="info-field"><label>المرحلة</label><span class="val">${levelText}</span></div>
    <div class="info-field"><label>اسم المعلم</label><span class="val">___________________</span></div>
  </div>
  <div class="info-row">
    <div class="info-field"><label>التاريخ</label><span class="val">${new Date().toLocaleDateString("ar-SA")}</span></div>
    <div class="info-field"><label>الحالة</label><span class="val">${cgpa >= 2.0 ? "منتظمة / Regular" : "تحت المراقبة / Probation"}</span></div>
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
      <td class="lbl">Result</td><td style="text-align:center;font-weight:700;color:${cgpa >= 1.0 ? "#22c55e" : "#ef4444"}">${cgpa >= 1.0 ? "Pass ✓" : "Fail ✗"}</td></tr>
  <tr><td class="lbl">Comment</td><td style="text-align:center">${cgpaComment}</td>
      <td class="lbl">Official Stamp</td><td class="stamp-cell"><img src="${stampBase64}" alt="Stamp" /></td></tr>
</table>
<div style="display:flex;justify-content:flex-end;margin-top:24px;gap:60px;direction:ltr">
  <div style="text-align:center"><div class="sig-line"></div><div style="font-size:11px;margin-top:4px;color:#374151">Teacher Signature</div></div>
  <div style="text-align:center"><div class="sig-line"></div><div style="font-size:11px;margin-top:4px;color:#374151">Principal Signature</div></div>
</div>
<div class="footer">Official Academic Transcript — Tahleem Academy — ${new Date().toLocaleDateString("en-GB")}</div>
<script>window.onload=function(){setTimeout(function(){window.print()},600)}</script>
</body></html>`);
    pw.document.close();
    toast({ title: t("Print dialog opened", "تم فتح نافذة الطباعة") });
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );

  // ── Transcript detail ─────────────────────────────────────────
  if (selectedStudent) return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button onClick={() => { setSelectedStudent(null); setResults([]); setStudentProfile(null); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: G, fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
          ← {t("All Students", "جميع الطلاب")}
        </button>
        <Button variant="outline" onClick={downloadPDF}>
          <Download className="h-4 w-4 me-2" />{t("Download PDF", "تحميل PDF")}
        </Button>
      </div>

      {/* Student info */}
      <div style={{ background: G, borderRadius: 16, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 900, color: "#fff", flexShrink: 0 }}>
          {(selectedStudent.full_name || "S").charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{selectedStudent.full_name}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>
            {selectedStudent.level && `${selectedStudent.level} · `}{selectedStudent.email}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: GOLD }}>{cgpa.toFixed(2)}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)" }}>CGPA</div>
        </div>
      </div>

      {/* Term selector */}
      <Select value={term} onValueChange={setTerm}>
        <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="first">{t("First Term", "الفترة الأولى")}</SelectItem>
          <SelectItem value="second">{t("Second Term", "الفترة الثانية")}</SelectItem>
          <SelectItem value="third">{t("Third Term", "الفترة الثالثة")}</SelectItem>
        </SelectContent>
      </Select>

      {/* Results */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        {subjectResults.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#9ca3af" }}>
            <GraduationCap style={{ width: 40, height: 40, margin: "0 auto 12px", opacity: 0.3 }} />
            {t("No results for this term.", "لا توجد نتائج لهذه الفترة.")}
          </div>
        ) : (
          <>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #f0f4f8", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fafafa" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: G }}>
                {term === "first" ? t("First Term", "الفترة الأولى") : term === "second" ? t("Second Term", "الفترة الثانية") : t("Third Term", "الفترة الثالثة")}
              </span>
              <span style={{ fontSize: 12, color: "#7a9e88" }}>
                {subjectResults.filter(r => r.test + r.exam >= 50).length}/{subjectResults.length} {t("passed", "ناجح")}
              </span>
            </div>

            <div className="divide-y">
              {subjectResults.map((s, i) => {
                const total = s.test + s.exam;
                const gp    = gradePoint(total);
                const grade = getLetterGrade(total);
                return (
                  <div key={i} style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontWeight: 700, color: G, fontSize: 15, fontFamily: "'Amiri',serif", marginBottom: 6 }}>
                        {s.title_ar || s.title}
                      </div>
                      <div style={{ display: "flex", gap: 20, fontSize: 12, color: "#7a9e88", marginBottom: 6 }}>
                        <span>Test: <strong>{s.test || "—"}</strong></span>
                        <span>Exam: <strong>{s.exam || "—"}</strong></span>
                        <span>Total: <strong style={{ color: G, fontSize: 14 }}>{total}</strong></span>
                      </div>
                      <ScoreBar value={total} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      <span style={{ padding: "4px 12px", borderRadius: 20, background: grade.bg, color: grade.color, fontWeight: 900, fontSize: 15 }}>
                        {grade.letter}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: G }}>{gp.toFixed(1)} GP</span>
                      {total >= 50
                        ? <CheckCircle style={{ width: 18, height: 18, color: "#22c55e" }} />
                        : <XCircle    style={{ width: 18, height: 18, color: "#ef4444" }} />}
                    </div>
                    {/* Feedback buttons */}
                    <div style={{ display: "flex", gap: 6 }}>
                      {[s.testAttemptId, s.examAttemptId].filter(Boolean).map(aId => (
                        <button key={aId} onClick={() => {
                          setCommentAttemptId(aId!);
                          const attempt = results.find(r => r.id === aId);
                          setCommentText(attempt?.feedback || "");
                          setShowComment(true);
                        }} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f8fafb", cursor: "pointer", fontSize: 11, color: G, display: "flex", alignItems: "center", gap: 4 }}>
                          <MessageSquare style={{ width: 11, height: 11 }} />
                          {aId === s.testAttemptId ? "Test" : "Exam"}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary footer */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid #f0f4f8", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fafafa" }}>
              <div style={{ fontSize: 13, color: "#7a9e88" }}>
                {t("Total", "المجموع")}: <strong style={{ color: G }}>{totalObtained}</strong> / {totalObtainable}
                &nbsp;·&nbsp; CGPA: <strong style={{ color: G }}>{cgpa.toFixed(2)}</strong>
              </div>
              <span style={{ padding: "4px 14px", borderRadius: 20, background: cgpa >= 1.0 ? "#f0fff4" : "#fff5f5", color: cgpa >= 1.0 ? "#22c55e" : "#ef4444", fontWeight: 800, fontSize: 13 }}>
                {cgpa >= 1.0 ? "Pass ✓" : "Fail ✗"}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Feedback dialog */}
      <Dialog open={showComment} onOpenChange={setShowComment}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Add / Edit Feedback", "إضافة / تعديل ملاحظة")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("Teacher Feedback", "ملاحظة المعلم")}</Label>
              <Textarea value={commentText} onChange={e => setCommentText(e.target.value)} rows={4} className="mt-1"
                placeholder={t("Write your feedback for this student…", "اكتب ملاحظتك لهذا الطالب…")} />
            </div>
            <Button className="w-full" onClick={async () => {
              if (!commentAttemptId) return;
              await supabase.from("exam_attempts").update({ feedback: commentText }).eq("id", commentAttemptId);
              toast({ title: t("Feedback saved", "تم حفظ الملاحظة") });
              setShowComment(false);
              if (selectedStudent) loadTranscript(selectedStudent);
            }}>{t("Save Feedback", "حفظ الملاحظة")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  // ── Student list ──────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t("Transcript", "كشف النتائج")}</h1>
        <Badge variant="outline" className="gap-1">
          <Users className="h-3 w-3" />{students.length} {t("students", "طالب")}
        </Badge>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder={t("Search by name, email or ID…", "ابحث بالاسم أو البريد أو الرقم…")}
          value={search} onChange={e => setSearch(e.target.value)} className="ps-9" />
      </div>

      {filteredStudents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Users className="h-14 w-14 mb-4 opacity-20" />
          <p>{t("No students found", "لا يوجد طلاب")}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredStudents.map(s => {
            const c     = studentCGPAs[s.user_id] || 0;
            const grade = getLetterGrade((c / 4) * 100);
            const standing = c >= 3.5 ? "Good Standing" : c >= 2.0 ? "Probation" : c > 0 ? "At Risk" : "No Data";
            const standColor = c >= 3.5 ? "#22c55e" : c >= 2.0 ? GOLD : c > 0 ? "#ef4444" : "#9ca3af";
            return (
              <div key={s.user_id} onClick={() => loadTranscript(s)} style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", padding: "16px", cursor: "pointer", transition: "all .2s", display: "flex", alignItems: "center", gap: 14 }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,.1)")}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: G, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: "#fff", flexShrink: 0 }}>
                  {(s.full_name || "S").charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: G, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.full_name}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{s.level || "—"}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: standColor, marginTop: 3 }}>{standing}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <MiniRing cgpa={c} />
                  {c > 0 && <span style={{ padding: "2px 8px", borderRadius: 20, background: grade.bg, color: grade.color, fontWeight: 800, fontSize: 11 }}>{grade.letter}</span>}
                </div>
                <ChevronRight style={{ width: 16, height: 16, color: "#d1d5db", flexShrink: 0 }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TeacherTranscript;
