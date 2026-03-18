
/*  src/pages/student/Transcripts.tsx
    ENHANCED — Animated CGPA ring, performance trend chart,
    per-term tabs, grade letter badges, improved PDF design
*/
import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Download, GraduationCap, TrendingUp, Award,
  CheckCircle, XCircle, BarChart2, BookOpen, Star
} from "lucide-react";
import tahleemStamp from "@/assets/tahleem-stamp.png";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Cell
} from "recharts";

const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c";

interface GradedExam {
  exam_id: string;
  attempt_id: string;
  title: string;
  title_ar: string | null;
  score: number;
  total_points: number;
  percentage: number;
  passed: boolean;
  submitted_at: string;
  course_title?: string;
  term: string;
  type: string;
}

const gradePoint = (pct: number) =>
  pct >= 85 ? 4.0 : pct >= 75 ? 3.5 : pct >= 65 ? 3.0 : pct >= 55 ? 2.0 : pct >= 45 ? 1.0 : 0.0;

const getLetterGrade = (pct: number) => {
  if (pct >= 90) return { letter: "A+", color: "#22c55e", bg: "#f0fff4", label: "Excellent",    labelAr: "ممتاز"   };
  if (pct >= 80) return { letter: "A",  color: "#16a34a", bg: "#dcfce7", label: "Very Good",   labelAr: "جيد جداً" };
  if (pct >= 70) return { letter: "B",  color: "#2563eb", bg: "#eff6ff", label: "Good",        labelAr: "جيد"     };
  if (pct >= 60) return { letter: "C",  color: GOLD,      bg: "#fffbeb", label: "Satisfactory",labelAr: "مقبول"   };
  if (pct >= 50) return { letter: "D",  color: "#ea580c", bg: "#fff7ed", label: "Pass",        labelAr: "ناجح"    };
  return               { letter: "F",   color: "#ef4444", bg: "#fff5f5", label: "Fail",        labelAr: "راسب"    };
};

const toArabicNum = (n: number | string) =>
  String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);

// ── Animated CGPA Ring ────────────────────────────────────────────
const CGPARing = ({ cgpa }: { cgpa: number }) => {
  const r = 54, circ = 2 * Math.PI * r;
  const [dash, setDash] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setDash((cgpa / 4) * circ), 200);
    return () => clearTimeout(timer);
  }, [cgpa, circ]);
  const color = cgpa >= 3.5 ? "#22c55e" : cgpa >= 2.0 ? GOLD : "#ef4444";
  const grade = getLetterGrade((cgpa / 4) * 100);
  return (
    <div style={{ position: "relative", width: 140, height: 140, margin: "0 auto" }}>
      <svg width={140} height={140} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={70} cy={70} r={r} fill="none" stroke="#f0f4f8" strokeWidth={12} />
        <circle cx={70} cy={70} r={r} fill="none" stroke={color} strokeWidth={12}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1.4s cubic-bezier(.4,0,.2,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: G, lineHeight: 1 }}>{cgpa.toFixed(2)}</div>
        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>/ 4.00</div>
        <div style={{ fontSize: 16, fontWeight: 900, color, marginTop: 2 }}>{grade.letter}</div>
      </div>
    </div>
  );
};

// ── Per-Term Table ────────────────────────────────────────────────
const TermTable = ({ exams, termLabel, language }: {
  exams: GradedExam[]; termLabel: string; language: string;
}) => {
  const subjectMap = new Map<string, { title: string; title_ar: string; test: number; exam: number }>();
  exams.forEach(e => {
    const key = e.title;
    if (!subjectMap.has(key))
      subjectMap.set(key, { title: e.title, title_ar: e.title_ar || e.title, test: 0, exam: 0 });
    const entry = subjectMap.get(key)!;
    if (e.type === "test") entry.test = Math.max(entry.test, Math.round(e.percentage * 0.3));
    else entry.exam = Math.max(entry.exam, Math.round(e.percentage * 0.7));
  });
  const rows = Array.from(subjectMap.values());
  const termGPA = rows.length > 0
    ? rows.reduce((s, r) => s + gradePoint(r.test + r.exam), 0) / rows.length
    : 0;

  if (rows.length === 0) return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: "#9ca3af", fontSize: 14 }}>
      <GraduationCap style={{ width: 40, height: 40, margin: "0 auto 12px", opacity: 0.4 }} />
      No results for {termLabel} yet.
    </div>
  );

  return (
    <div style={{ overflowX: "auto" }}>
      {/* Term header bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #f0f4f8", background: "#fafafa" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: G }}>{termLabel}</div>
        <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#7a9e88" }}>
          <span>Term GPA: <strong style={{ color: G }}>{termGPA.toFixed(2)}</strong></span>
          <span>{rows.filter(r => r.test + r.exam >= 50).length}/{rows.length} passed</span>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f8fafb" }}>
            {["Subject", "Test (30)", "Exam (70)", "Total", "%", "GP", "Grade", "Result"].map(h => (
              <th key={h} style={{ padding: "10px 14px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#6b7280", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const total = row.test + row.exam;
            const gp = gradePoint(total);
            const grade = getLetterGrade(total);
            return (
              <tr key={i} style={{ borderBottom: "1px solid #f0f4f8", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: G, fontFamily: "'Amiri',serif", fontSize: 15 }}>
                  {language === "ar" ? row.title_ar : row.title}
                </td>
                <td style={{ padding: "10px 14px", textAlign: "center", color: "#374151" }}>{row.test || "—"}</td>
                <td style={{ padding: "10px 14px", textAlign: "center", color: "#374151" }}>{row.exam || "—"}</td>
                <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 900, color: G, fontSize: 16 }}>{total}</td>
                <td style={{ padding: "10px 14px", textAlign: "center", color: "#374151" }}>{total}%</td>
                <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: G }}>{gp.toFixed(1)}</td>
                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                  <span style={{ padding: "4px 12px", borderRadius: 20, background: grade.bg, color: grade.color, fontWeight: 800, fontSize: 13, display: "inline-block" }}>
                    {grade.letter}
                  </span>
                </td>
                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                  {total >= 50
                    ? <span style={{ color: "#22c55e", fontWeight: 700, display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
                        <CheckCircle style={{ width: 14, height: 14 }} />Pass
                      </span>
                    : <span style={{ color: "#ef4444", fontWeight: 700, display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
                        <XCircle style={{ width: 14, height: 14 }} />Fail
                      </span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
const Transcripts = () => {
  const { t, language } = useLanguage();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [exams, setExams] = useState<GradedExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("exam_attempts")
        .select("id, exam_id, score, total_points, percentage, passed, submitted_at, exams(title, title_ar, type, term, course_id, courses(title))")
        .eq("user_id", user.id)
        .eq("status", "graded")
        .order("submitted_at", { ascending: true });

      setExams((data || []).map((a: any) => ({
        exam_id:       a.exam_id,
        attempt_id:    a.id,
        title:         a.exams?.title || "Exam",
        title_ar:      a.exams?.title_ar,
        score:         Number(a.score) || 0,
        total_points:  Number(a.total_points) || 0,
        percentage:    Number(a.percentage) || 0,
        passed:        a.passed,
        submitted_at:  a.submitted_at,
        course_title:  a.exams?.courses?.title,
        term:          a.exams?.term || "first",
        type:          a.exams?.type || "exam",
      })));
      setLoading(false);
    };
    load();
  }, [user]);

  // ── Derived stats ─────────────────────────────────────────────
  const totalGP  = exams.reduce((s, e) => s + gradePoint(e.percentage), 0);
  const cgpa     = exams.length > 0 ? totalGP / exams.length : 0;
  const avgScore = exams.length > 0 ? exams.reduce((s, e) => s + e.percentage, 0) / exams.length : 0;
  const cgpaGrade = getLetterGrade((cgpa / 4) * 100);

  const status   = cgpa >= 3.5 ? "Good Standing" : cgpa >= 2.0 ? "Probation Warning" : cgpa > 0 ? "Academic Probation" : "No Data";
  const statusAr = cgpa >= 3.5 ? "وضع جيد"       : cgpa >= 2.0 ? "تحذير أكاديمي"    : cgpa > 0 ? "إنذار أكاديمي"       : "لا توجد بيانات";

  const term1 = exams.filter(e => e.term === "first");
  const term2 = exams.filter(e => e.term === "second");
  const term3 = exams.filter(e => e.term === "third");

  // Chart data
  const trendData = exams.slice(-12).map((e, i) => ({
    name:  `Q${i + 1}`,
    score: Math.round(e.percentage),
  }));

  const termBarData = [
    { name: t("Term 1", "الفترة 1"), avg: term1.length > 0 ? Math.round(term1.reduce((s, e) => s + e.percentage, 0) / term1.length) : 0 },
    { name: t("Term 2", "الفترة 2"), avg: term2.length > 0 ? Math.round(term2.reduce((s, e) => s + e.percentage, 0) / term2.length) : 0 },
    { name: t("Term 3", "الفترة 3"), avg: term3.length > 0 ? Math.round(term3.reduce((s, e) => s + e.percentage, 0) / term3.length) : 0 },
  ];

  const currentYear = new Date().getFullYear();
  const hijriYear   = currentYear - 579;

  // ── PDF download ──────────────────────────────────────────────
  const downloadPDF = async () => {
    const stampBase64 = await new Promise<string>(resolve => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        c.getContext("2d")!.drawImage(img, 0, 0);
        resolve(c.toDataURL("image/png"));
      };
      img.src = tahleemStamp;
    });

    const pw = window.open("", "_blank");
    if (!pw) { toast({ title: t("Allow popups to download PDF", "السماح بالنوافذ المنبثقة"), variant: "destructive" }); return; }

    const levelText = profile?.level === "beginner"     ? "المبتدئة / Beginner"
                    : profile?.level === "intermediate"  ? "المتوسطة / Intermediate"
                    : profile?.level || "---";
    const cgpaComment = cgpa >= 3.5 ? "طالب(ة) متميز(ة) / Outstanding"
                      : cgpa >= 2.0 ? "طالب(ة) مجتهد(ة) / Hardworking"
                      : "يحتاج تحسين / Needs Improvement";

    const buildTermSection = (termExams: GradedExam[], nameAr: string, nameEn: string) => {
      const subMap = new Map<string, { title_ar: string; test: number; exam: number }>();
      termExams.forEach(e => {
        const key = e.title;
        if (!subMap.has(key)) subMap.set(key, { title_ar: e.title_ar || e.title, test: 0, exam: 0 });
        const entry = subMap.get(key)!;
        if (e.type === "test") entry.test = Math.max(entry.test, Math.round(e.percentage * 0.3));
        else entry.exam = Math.max(entry.exam, Math.round(e.percentage * 0.7));
      });
      const rows = Array.from(subMap.values());
      if (rows.length === 0) return "";

      const termObtained   = rows.reduce((s, r) => s + r.test + r.exam, 0);
      const termObtainable = rows.length * 100;
      const termGPA        = rows.reduce((s, r) => s + gradePoint(r.test + r.exam), 0) / rows.length;

      const tRows = rows.map(r => {
        const total = r.test + r.exam;
        const gp    = gradePoint(total);
        const g     = getLetterGrade(total);
        return `<tr>
          <td>${r.title_ar}</td>
          <td>${r.test || "—"}</td>
          <td>${r.exam || "—"}</td>
          <td style="font-weight:800">${total}</td>
          <td>${total}%</td>
          <td>${gp.toFixed(1)}</td>
          <td style="font-weight:800;color:${g.color}">${g.letter}</td>
          <td style="color:${total >= 50 ? "#22c55e" : "#ef4444"};font-weight:700">${total >= 50 ? "Pass ✓" : "Fail ✗"}</td>
        </tr>`;
      }).join("");
      const empties = Array.from({ length: Math.max(0, 5 - rows.length) })
        .map(() => `<tr>${"<td>&nbsp;</td>".repeat(8)}</tr>`).join("");

      return `
        <div class="term-section">
          <div class="term-header">${nameAr} — ${nameEn}</div>
          <table class="main">
            <thead><tr>
              <th>المادة / Subject</th>
              <th>التمرينات (٣٠)</th>
              <th>الامتحانات (٧٠)</th>
              <th>المجموع (١٠٠)</th>
              <th>%</th><th>GP</th><th>Grade</th><th>النتيجة</th>
            </tr></thead>
            <tbody>${tRows}${empties}</tbody>
          </table>
          <table class="summary">
            <tr>
              <td class="lbl">Obtainable</td><td>${termObtainable}</td>
              <td class="lbl">Obtained</td><td>${termObtained}</td>
            </tr>
            <tr>
              <td class="lbl">Term GPA</td><td>${termGPA.toFixed(2)}</td>
              <td class="lbl">Status</td>
              <td style="color:${termGPA >= 1.0 ? "#22c55e" : "#ef4444"};font-weight:700">
                ${termGPA >= 1.0 ? "Pass ✓" : "Fail ✗"}
              </td>
            </tr>
          </table>
        </div>`;
    };

    const totalObtained   = exams.reduce((s, e) => s + Math.round(e.percentage), 0);
    const totalObtainable = exams.length * 100;

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>Transcript — ${profile?.full_name || "Student"}</title>
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Cairo','Amiri',sans-serif;padding:24px 32px;color:#1a1a1a;background:#fff}
.watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-28deg);
  font-size:80px;font-weight:800;color:#064E3B;opacity:0.035;white-space:nowrap;
  pointer-events:none;font-family:'Cairo',sans-serif;z-index:0}
.page-header{text-align:center;margin-bottom:14px;border-bottom:3px solid #0f3122;padding-bottom:12px}
.page-header .ar{font-family:'Amiri',serif;font-size:24px;font-weight:700;color:#0f3122}
.page-header .en{font-size:13px;font-weight:700;letter-spacing:3px;color:#0f3122}
.title-box{border:2.5px solid #0f3122;border-radius:6px;padding:8px 24px;margin:14px auto;
  width:fit-content;display:flex;gap:32px;font-size:14px;font-weight:700}
.info-grid{margin:16px 0;display:flex;flex-direction:column;gap:8px}
.info-row{display:flex;justify-content:space-between;gap:24px}
.info-field{display:flex;align-items:baseline;flex:1;gap:4px}
.info-field label{font-weight:700;font-size:12px;white-space:nowrap;color:#374151}
.info-field .val{flex:1;border-bottom:1.5px solid #374151;font-size:12px;
  text-align:right;padding:0 6px 2px;min-width:60px}
.term-section{margin-bottom:20px}
.term-header{border:2.5px solid #0f3122;border-radius:6px;padding:5px 20px;margin:12px auto;
  width:fit-content;font-weight:700;font-size:14px;text-align:center;
  font-family:'Amiri',serif;color:#0f3122}
table.main{width:100%;border-collapse:collapse;margin-bottom:10px}
table.main th,table.main td{border:1.5px solid #374151;padding:4px 6px;
  text-align:center;font-size:11px;vertical-align:middle}
table.main th{background:#f0f4f0;font-weight:800;font-size:11px}
table.main td{height:24px}
table.summary{width:100%;border-collapse:collapse;direction:ltr;margin-top:10px}
table.summary td{border:1.5px solid #374151;padding:6px 10px;font-size:12px}
table.summary .lbl{font-weight:700;background:#f8fafb;width:18%}
.stamp-cell img{width:88px;height:88px;opacity:0.82;display:block;margin:0 auto}
.footer{text-align:center;margin-top:20px;font-size:10px;color:#9ca3af;
  border-top:1px solid #e5e7eb;padding-top:10px}
@media print{body{padding:14px 20px}@page{size:A4;margin:8mm}}
</style>
</head>
<body>
<div class="watermark">TAHLEEM ACADEMY</div>

<div class="page-header">
  <div class="ar">أكاديمية التعليم</div>
  <div class="en">TAHLEEM ACADEMY</div>
</div>

<div class="title-box">
  <span>كشف نتائج الطلبة</span>
  <span>Student Academic Transcript</span>
</div>

<div class="info-grid">
  <div class="info-row">
    <div class="info-field"><label>اسم الطالب(ة)</label><span class="val">${profile?.full_name || "—"}</span></div>
    <div class="info-field"><label>العام الدراسي</label><span class="val">${hijriYear} هـ / ${currentYear} م</span></div>
  </div>
  <div class="info-row">
    <div class="info-field"><label>المرحلة</label><span class="val">${levelText}</span></div>
    <div class="info-field"><label>عدد المواد</label><span class="val">${exams.length}</span></div>
  </div>
  <div class="info-row">
    <div class="info-field"><label>التاريخ</label><span class="val">${new Date().toLocaleDateString("ar-SA")}</span></div>
    <div class="info-field"><label>الحالة الأكاديمية</label>
      <span class="val">${cgpa >= 2.0 ? "منتظمة / Regular" : "تحت المراقبة / Probation"}</span>
    </div>
  </div>
</div>

${term1.length > 0 ? buildTermSection(term1, "الفترة الأولى",  "First Term")  : ""}
${term2.length > 0 ? buildTermSection(term2, "الفترة الثانية", "Second Term") : ""}
${term3.length > 0 ? buildTermSection(term3, "الفترة الثالثة","Third Term")  : ""}

<table class="summary" style="margin-top:20px">
  <tr>
    <td class="lbl">Total Obtainable</td><td style="text-align:center">${totalObtainable}</td>
    <td class="lbl">Total Obtained</td><td style="text-align:center">${totalObtained}</td>
  </tr>
  <tr>
    <td class="lbl">Cumulative GPA</td>
    <td style="text-align:center;font-weight:800;font-size:15px">${cgpa.toFixed(2)}</td>
    <td class="lbl">Overall Result</td>
    <td style="text-align:center;font-weight:700;color:${cgpa >= 1.0 ? "#22c55e" : "#ef4444"}">
      ${cgpa >= 1.0 ? "Pass ✓" : "Fail ✗"}
    </td>
  </tr>
  <tr>
    <td class="lbl">Comment</td>
    <td style="text-align:center">${cgpaComment}</td>
    <td class="lbl">Official Stamp</td>
    <td class="stamp-cell"><img src="${stampBase64}" alt="Stamp" /></td>
  </tr>
</table>

<div class="footer">
  Official Academic Transcript — Tahleem Academy — ${new Date().toLocaleDateString("en-GB")}
</div>

<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 600); }</script>
</body>
</html>`;

    pw.document.write(html);
    pw.document.close();
    toast({ title: t("Print dialog opened — save as PDF", "تم فتح نافذة الطباعة — احفظ كـ PDF") });
  };

  // ── Loading ───────────────────────────────────────────────────
  if (loading) return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );

  // ── Empty state ───────────────────────────────────────────────
  if (exams.length === 0) return (
    <div className="container mx-auto px-4 py-16 max-w-5xl">
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <GraduationCap className="h-20 w-20 mb-6 opacity-20" />
        <p className="text-xl font-semibold">{t("No graded exams yet", "لا توجد امتحانات مصححة بعد")}</p>
        <p className="text-sm mt-2">{t("Results will appear here once your teacher grades them.", "ستظهر النتائج هنا بعد تصحيح المعلم.")}</p>
      </div>
    </div>
  );

  // ── Main render ───────────────────────────────────────────────
  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{t("Academic Transcript", "السجل الأكاديمي")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Your complete academic record", "سجلك الأكاديمي الكامل")}
          </p>
        </div>
        <Button onClick={downloadPDF} className="gap-2">
          <Download className="h-4 w-4" />
          {t("Download PDF", "تحميل PDF")}
        </Button>
      </div>

      {/* Summary row */}
      <div className="grid gap-4 md:grid-cols-4 mb-8" style={{ animation: "fadeUp .4s ease" }}>

        {/* CGPA Ring card */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 flex flex-col items-center gap-4 md:col-span-1">
          <CGPARing cgpa={cgpa} />
          <div className="text-center">
            <div className="font-bold text-sm">{t("Cumulative GPA", "المعدل التراكمي")}</div>
            <span
              className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold"
              style={{ background: cgpaGrade.bg, color: cgpaGrade.color }}
            >
              {language === "ar" ? statusAr : status}
            </span>
          </div>
        </div>

        {/* Stat cards */}
        <div className="md:col-span-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { icon: <BookOpen className="h-5 w-5" />, label: t("Total Exams", "الامتحانات"),   value: exams.length,                                     color: G       },
            { icon: <CheckCircle className="h-5 w-5" />, label: t("Passed", "ناجح"),           value: exams.filter(e => e.passed).length,               color: "#22c55e" },
            { icon: <XCircle className="h-5 w-5" />,    label: t("Failed", "راسب"),            value: exams.filter(e => !e.passed).length,              color: "#ef4444" },
            { icon: <Star className="h-5 w-5" />,       label: t("Average Score", "معدل الدرجات"), value: `${avgScore.toFixed(1)}%`,                   color: GOLD    },
          ].map((stat, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border p-5 flex flex-col gap-2">
              <div style={{ color: stat.color }}>{stat.icon}</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6 w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">{t("All Terms", "جميع الفترات")}</TabsTrigger>
          <TabsTrigger value="term1">
            {t("Term 1", "الفترة الأولى")}
            {term1.length > 0 && <span className="ml-1 opacity-60">({term1.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="term2">
            {t("Term 2", "الفترة الثانية")}
            {term2.length > 0 && <span className="ml-1 opacity-60">({term2.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="term3">
            {t("Term 3", "الفترة الثالثة")}
            {term3.length > 0 && <span className="ml-1 opacity-60">({term3.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="analytics">{t("Analytics", "التحليل")}</TabsTrigger>
        </TabsList>

        {/* All terms overview */}
        <TabsContent value="overview">
          <div className="space-y-4">
            {[
              { termExams: term1, label: t("First Term",  "الفترة الأولى")  },
              { termExams: term2, label: t("Second Term", "الفترة الثانية") },
              { termExams: term3, label: t("Third Term",  "الفترة الثالثة") },
            ].map(({ termExams, label }) =>
              termExams.length > 0 && (
                <div key={label} className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                  <TermTable exams={termExams} termLabel={label} language={language} />
                </div>
              )
            )}
          </div>
        </TabsContent>

        {/* Individual term tabs */}
        {[
          { key: "term1", termExams: term1, label: t("First Term",  "الفترة الأولى")  },
          { key: "term2", termExams: term2, label: t("Second Term", "الفترة الثانية") },
          { key: "term3", termExams: term3, label: t("Third Term",  "الفترة الثالثة") },
        ].map(({ key, termExams, label }) => (
          <TabsContent key={key} value={key}>
            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
              <TermTable exams={termExams} termLabel={label} language={language} />
            </div>
          </TabsContent>
        ))}

        {/* Analytics tab */}
        <TabsContent value="analytics">
          <div className="grid gap-6 md:grid-cols-2">

            {/* Score trend line chart */}
            {trendData.length > 1 && (
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-4 w-4" style={{ color: GOLD }} />
                  <span className="font-bold text-sm" style={{ color: G }}>
                    {t("Score Trend", "مسار الدرجات")}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
                      tickFormatter={v => `${v}%`} />
                    <Tooltip formatter={(v: any) => `${v}%`}
                      contentStyle={{ borderRadius: 10, fontSize: 12, fontFamily: "'Cairo',sans-serif" }} />
                    <Line dataKey="score" stroke={G} strokeWidth={2.5}
                      dot={{ fill: G, r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Term average comparison bar chart */}
            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="h-4 w-4" style={{ color: GOLD }} />
                <span className="font-bold text-sm" style={{ color: G }}>
                  {t("Term Comparison", "مقارنة الفترات")}
                </span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={termBarData} barSize={36}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v: any) => `${v}%`}
                    contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                  <Bar dataKey="avg" radius={[8, 8, 0, 0]}>
                    {termBarData.map((_, i) => (
                      <Cell key={i} fill={[G, GOLD, GM][i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Grade distribution grid */}
            <div className="bg-white rounded-2xl shadow-sm border p-6 md:col-span-2">
              <div className="flex items-center gap-2 mb-5">
                <Award className="h-4 w-4" style={{ color: GOLD }} />
                <span className="font-bold text-sm" style={{ color: G }}>
                  {t("Grade Distribution", "توزيع الدرجات")}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {(["A+", "A", "B", "C", "D", "F"] as const).map(letter => {
                  const thresholds: Record<string, [number, number]> = {
                    "A+": [90, 101], "A": [80, 90], "B": [70, 80],
                    "C": [60, 70],  "D": [50, 60], "F": [0, 50],
                  };
                  const [lo, hi] = thresholds[letter];
                  const count = exams.filter(e => e.percentage >= lo && e.percentage < hi).length;
                  const grade = getLetterGrade(lo + (letter === "A+" ? 0 : 1));
                  return (
                    <div key={letter} style={{ background: grade.bg, border: `1px solid ${grade.color}33`, borderRadius: 16, padding: "16px 8px", textAlign: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 900, color: grade.color }}>{letter}</div>
                      <div style={{ fontSize: 26, fontWeight: 900, color: G, marginTop: 4 }}>{count}</div>
                      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>
                        {lo}–{letter === "A+" ? 100 : hi - 1}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Transcripts;
