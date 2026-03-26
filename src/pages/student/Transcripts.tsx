/*  src/pages/student/Transcripts.tsx
    ENHANCED — ordered subjects, course grouping, rich analytics, clean PDF
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
  CheckCircle, XCircle, BarChart2, BookOpen, Star, Trophy, Calendar, Clock
} from "lucide-react";
import tahleemStamp from "@/assets/tahleem-stamp.png";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Cell, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from "recharts";

const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c", LIGHT = "#f0fff4";

interface GradedExam {
  exam_id: string; attempt_id: string;
  title: string; title_ar: string | null;
  score: number; total_points: number; percentage: number;
  passed: boolean; submitted_at: string;
  course_title?: string; course_id?: string;
  term: string; type: string;
}

interface SubjectRow {
  title: string; title_ar: string; course: string;
  test: number; exam: number; total: number;
  gp: number; grade: ReturnType<typeof getLetterGrade>;
  passed: boolean;
}

const gradePoint = (pct: number) =>
  pct >= 85 ? 4.0 : pct >= 75 ? 3.5 : pct >= 65 ? 3.0 : pct >= 55 ? 2.0 : pct >= 45 ? 1.0 : 0.0;

const getLetterGrade = (pct: number) => {
  if (pct >= 90) return { letter:"A+", color:"#22c55e", bg:"#f0fff4", label:"Excellent",    labelAr:"ممتاز"   };
  if (pct >= 80) return { letter:"A",  color:"#16a34a", bg:"#dcfce7", label:"Very Good",   labelAr:"جيد جداً" };
  if (pct >= 70) return { letter:"B",  color:"#2563eb", bg:"#eff6ff", label:"Good",        labelAr:"جيد"     };
  if (pct >= 60) return { letter:"C",  color:GOLD,      bg:"#fffbeb", label:"Satisfactory",labelAr:"مقبول"   };
  if (pct >= 50) return { letter:"D",  color:"#ea580c", bg:"#fff7ed", label:"Pass",        labelAr:"ناجح"    };
  return               { letter:"F",   color:"#ef4444", bg:"#fff5f5", label:"Fail",        labelAr:"راسب"    };
};

const toArabicNum = (n: number | string) =>
  String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);

// ── Animated CGPA Ring ─────────────────────────────────────────────
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
    <div style={{ position:"relative", width:140, height:140, margin:"0 auto" }}>
      <svg width={140} height={140} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={70} cy={70} r={r} fill="none" stroke="#f0f4f8" strokeWidth={12} />
        <circle cx={70} cy={70} r={r} fill="none" stroke={color} strokeWidth={12}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition:"stroke-dasharray 1.4s cubic-bezier(.4,0,.2,1)" }} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <div style={{ fontSize:28, fontWeight:900, color:G, lineHeight:1 }}>{cgpa.toFixed(2)}</div>
        <div style={{ fontSize:10, color:"#9ca3af", marginTop:2 }}>/ 4.00</div>
        <div style={{ fontSize:16, fontWeight:900, color, marginTop:2 }}>{grade.letter}</div>
      </div>
    </div>
  );
};

// ── Build subject rows from exam list ─────────────────────────────
function buildSubjectRows(exams: GradedExam[]): SubjectRow[] {
  const map = new Map<string, { title:string; title_ar:string; course:string; tests:number[]; exams:number[] }>();
  exams.forEach(e => {
    const key = e.title;
    if (!map.has(key)) map.set(key, { title:e.title, title_ar:e.title_ar||e.title, course:e.course_title||"", tests:[], exams:[] });
    const entry = map.get(key)!;
    if (e.type === "test") entry.tests.push(e.percentage);
    else entry.exams.push(e.percentage);
  });
  return Array.from(map.values()).map(r => {
    const testScore = r.tests.length ? Math.round(Math.max(...r.tests) * 0.3) : 0;
    const examScore = r.exams.length ? Math.round(Math.max(...r.exams) * 0.7) : 0;
    const total = testScore + examScore;
    const gp = gradePoint(total);
    const grade = getLetterGrade(total);
    return { title:r.title, title_ar:r.title_ar, course:r.course, test:testScore, exam:examScore, total, gp, grade, passed: total >= 50 };
  }).sort((a, b) => b.total - a.total); // order by total descending
}

// ── Per-Term Table ─────────────────────────────────────────────────
const TermTable = ({ exams, termLabel, language }: { exams:GradedExam[]; termLabel:string; language:string }) => {
  const rows = buildSubjectRows(exams);
  const termGPA = rows.length > 0 ? rows.reduce((s,r) => s + r.gp, 0) / rows.length : 0;
  const passed  = rows.filter(r => r.passed).length;

  if (rows.length === 0) return (
    <div style={{ textAlign:"center", padding:"40px 20px", color:"#9ca3af", fontSize:14 }}>
      <GraduationCap style={{ width:40, height:40, margin:"0 auto 12px", opacity:.4 }} />
      No results for {termLabel} yet.
    </div>
  );

  return (
    <div style={{ overflowX:"auto" }}>
      {/* Term header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px",
        background:"linear-gradient(90deg,#0f2d1f,#1a4731)", color:"#fff" }}>
        <div>
          <div style={{ fontSize:14, fontWeight:700 }}>{termLabel}</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,.65)", marginTop:1 }}>{rows.length} subjects</div>
        </div>
        <div style={{ display:"flex", gap:16, fontSize:12, color:"rgba(255,255,255,.8)" }}>
          <span>GPA <strong style={{ color:GOLD }}>{termGPA.toFixed(2)}</strong></span>
          <span>✅ {passed}/{rows.length}</span>
        </div>
      </div>

      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
        <thead>
          <tr style={{ background:"#f8fafb" }}>
            {["#","Subject","Course","Test (30)","Exam (70)","Total","Grade","Result"].map(h => (
              <th key={h} style={{ padding:"9px 10px", textAlign:"center", fontSize:11, fontWeight:700,
                color:"#6b7280", borderBottom:"1px solid #e5e7eb", whiteSpace:"nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom:"1px solid #f0f4f8", background: i%2===0 ? "#fff" : "#fafafa" }}>
              <td style={{ padding:"10px 10px", textAlign:"center", fontSize:12, color:"#9ca3af", fontWeight:600 }}>{i+1}</td>
              <td style={{ padding:"10px 14px", fontWeight:600, color:G }}>
                <div style={{ fontFamily:"'Amiri',serif", fontSize:15 }}>
                  {language==="ar" ? row.title_ar : row.title}
                </div>
              </td>
              <td style={{ padding:"10px 10px", textAlign:"center", fontSize:11, color:"#9ca3af" }}>
                {row.course || "—"}
              </td>
              <td style={{ padding:"10px 10px", textAlign:"center", color:"#374151" }}>
                <div style={{ display:"inline-block", padding:"2px 8px", borderRadius:6,
                  background: row.test > 0 ? "#f0fff4" : "#f8fafb",
                  color: row.test > 0 ? "#276749" : "#9ca3af", fontWeight:600 }}>
                  {row.test > 0 ? row.test : "—"}
                </div>
              </td>
              <td style={{ padding:"10px 10px", textAlign:"center", color:"#374151" }}>
                <div style={{ display:"inline-block", padding:"2px 8px", borderRadius:6,
                  background: row.exam > 0 ? "#eff6ff" : "#f8fafb",
                  color: row.exam > 0 ? "#1d4ed8" : "#9ca3af", fontWeight:600 }}>
                  {row.exam > 0 ? row.exam : "—"}
                </div>
              </td>
              <td style={{ padding:"10px 10px", textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:900, color:row.grade.color }}>{row.total}</div>
                <div style={{ fontSize:10, color:"#9ca3af" }}>/100</div>
              </td>
              <td style={{ padding:"10px 10px", textAlign:"center" }}>
                <span style={{ padding:"4px 12px", borderRadius:20, background:row.grade.bg, color:row.grade.color,
                  fontWeight:800, fontSize:13, display:"inline-block" }}>
                  {row.grade.letter}
                </span>
                <div style={{ fontSize:9, color:"#9ca3af", marginTop:2 }}>{row.grade.label}</div>
              </td>
              <td style={{ padding:"10px 10px", textAlign:"center" }}>
                {row.passed
                  ? <span style={{ color:"#22c55e", fontWeight:700, display:"flex", alignItems:"center", gap:3, justifyContent:"center" }}><CheckCircle style={{ width:14, height:14 }} />Pass</span>
                  : <span style={{ color:"#ef4444", fontWeight:700, display:"flex", alignItems:"center", gap:3, justifyContent:"center" }}><XCircle style={{ width:14, height:14 }} />Fail</span>}
              </td>
            </tr>
          ))}
        </tbody>
        {/* Summary row */}
        <tfoot>
          <tr style={{ background:"#f0f4f8", borderTop:"2px solid #e5e7eb" }}>
            <td colSpan={3} style={{ padding:"10px 14px", fontWeight:700, color:G, fontSize:13 }}>Term Summary</td>
            <td colSpan={2} style={{ textAlign:"center", padding:"10px", fontSize:12, color:"#6b7280" }}>
              {rows.reduce((s,r) => s + r.test, 0)} + {rows.reduce((s,r) => s + r.exam, 0)}
            </td>
            <td style={{ textAlign:"center", padding:"10px", fontSize:16, fontWeight:900, color:G }}>
              {rows.reduce((s,r) => s + r.total, 0)}
            </td>
            <td style={{ textAlign:"center", padding:"10px" }}>
              <div style={{ fontSize:13, fontWeight:800, color:GOLD }}>GPA {termGPA.toFixed(2)}</div>
            </td>
            <td style={{ textAlign:"center", padding:"10px", fontSize:12, fontWeight:700, color: passed === rows.length ? "#22c55e" : "#ea580c" }}>
              {passed}/{rows.length} passed
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
const Transcripts = () => {
  const { t, language } = useLanguage();
  const { user, profile } = useAuth();
  const { toast }        = useToast();
  const [exams, setExams]   = useState<GradedExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("exam_attempts")
      .select("id, exam_id, score, total_points, percentage, passed, submitted_at, exams(title, title_ar, type, term, course_id, courses(title))")
      .eq("user_id", user.id)
      .eq("status", "graded")
      .order("submitted_at", { ascending: true })
      .then(({ data }) => {
        setExams((data||[]).map((a:any) => ({
          exam_id:a.exam_id, attempt_id:a.id,
          title:a.exams?.title||"Exam", title_ar:a.exams?.title_ar,
          score:Number(a.score)||0, total_points:Number(a.total_points)||0,
          percentage:Number(a.percentage)||0, passed:a.passed,
          submitted_at:a.submitted_at,
          course_title:a.exams?.courses?.title,
          course_id:a.exams?.course_id,
          term:a.exams?.term||"first", type:a.exams?.type||"exam",
        })));
        setLoading(false);
      });
  }, [user]);

  // Derived stats
  const totalGP   = exams.reduce((s,e) => s + gradePoint(e.percentage), 0);
  const cgpa      = exams.length > 0 ? totalGP / exams.length : 0;
  const avgScore  = exams.length > 0 ? exams.reduce((s,e) => s + e.percentage, 0) / exams.length : 0;
  const cgpaGrade = getLetterGrade((cgpa/4)*100);

  const status   = cgpa >= 3.5 ? "Good Standing"    : cgpa >= 2.0 ? "Probation Warning" : cgpa > 0 ? "Academic Probation" : "No Data";
  const statusAr = cgpa >= 3.5 ? "وضع أكاديمي جيد" : cgpa >= 2.0 ? "تحذير أكاديمي"     : cgpa > 0 ? "إنذار أكاديمي"      : "لا توجد بيانات";

  // Terms — preserve proper ordering
  const term1 = exams.filter(e => e.term === "first");
  const term2 = exams.filter(e => e.term === "second");
  const term3 = exams.filter(e => e.term === "third");

  const trendData = exams.slice(-15).map((e, i) => ({
    name:  new Date(e.submitted_at).toLocaleDateString("en-GB", { day:"2-digit", month:"short" }),
    score: Math.round(e.percentage),
    subject: e.title,
  }));

  const termBarData = [
    { name:t("Term 1","الفترة 1"), avg: term1.length>0 ? Math.round(term1.reduce((s,e)=>s+e.percentage,0)/term1.length) : 0, count: term1.length },
    { name:t("Term 2","الفترة 2"), avg: term2.length>0 ? Math.round(term2.reduce((s,e)=>s+e.percentage,0)/term2.length) : 0, count: term2.length },
    { name:t("Term 3","الفترة 3"), avg: term3.length>0 ? Math.round(term3.reduce((s,e)=>s+e.percentage,0)/term3.length) : 0, count: term3.length },
  ];

  // Best & worst subjects
  const allRows = buildSubjectRows(exams);
  const bestSubject  = allRows.length > 0 ? allRows[0] : null;
  const worstSubject = allRows.length > 1 ? allRows[allRows.length - 1] : null;

  const currentYear = new Date().getFullYear();
  const hijriYear   = currentYear - 579;

  // ── PDF Download ──────────────────────────────────────────────
  const downloadPDF = async () => {
    const stampBase64 = await new Promise<string>(resolve => {
      const img = new Image(); img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        c.getContext("2d")!.drawImage(img, 0, 0);
        resolve(c.toDataURL("image/png"));
      };
      img.src = tahleemStamp;
    });

    const levelText = (profile as any)?.level || "—";
    const totalObtainable = allRows.length * 100;
    const totalObtained   = allRows.reduce((s,r) => s + r.total, 0);
    const cgpaComment = cgpa >= 3.5 ? "Excellent Academic Performance · أداء أكاديمي ممتاز"
      : cgpa >= 2.5 ? "Good Academic Standing · وضع أكاديمي جيد"
      : cgpa >= 2.0 ? "Satisfactory Progress · تقدم مقبول"
      : "Academic Support Required · يحتاج إلى دعم أكاديمي";

    const buildTermSection = (termExams: GradedExam[], arLabel: string, enLabel: string) => {
      const rows = buildSubjectRows(termExams);
      const gpa  = rows.length > 0 ? rows.reduce((s,r) => s + r.gp, 0) / rows.length : 0;
      return `
        <div class="term-section">
          <div class="term-header">${enLabel} / ${arLabel}</div>
          <table class="main">
            <thead><tr>
              <th style="width:5%">#</th>
              <th style="width:30%;text-align:right">المادة / Subject</th>
              <th>اختبار (30) / Test</th>
              <th>امتحان (70) / Exam</th>
              <th>المجموع / Total</th>
              <th>الدرجة / Grade</th>
              <th>النتيجة / Result</th>
            </tr></thead>
            <tbody>
              ${rows.map((r,i) => `
                <tr>
                  <td>${i+1}</td>
                  <td style="text-align:right;font-family:'Amiri',serif;font-size:14px">${r.title_ar} / ${r.title}</td>
                  <td>${r.test||"—"}</td>
                  <td>${r.exam||"—"}</td>
                  <td style="font-weight:800;font-size:15px">${r.total}</td>
                  <td style="font-weight:800;color:${r.grade.color}">${r.grade.letter}</td>
                  <td style="color:${r.passed?"#22c55e":"#ef4444"};font-weight:700">${r.passed?"Pass ✓":"Fail ✗"}</td>
                </tr>`).join("")}
            </tbody>
            <tfoot>
              <tr style="background:#f0f4f0;font-weight:800">
                <td colspan="4" style="text-align:right">Term GPA / معدل الفترة</td>
                <td>${rows.reduce((s,r)=>s+r.total,0)}</td>
                <td colspan="2">${gpa.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>`;
    };

    const pw = window.open("","_blank");
    if (!pw) { toast({ title: t("Allow popups to download PDF","السماح بالنوافذ المنبثقة"), variant:"destructive" }); return; }

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"><title>Transcript — ${profile?.full_name}</title>
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Amiri',serif;padding:18px 24px;color:#111;background:#fff;font-size:12px}
.watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);
  font-size:60px;font-weight:900;color:rgba(15,45,31,.06);z-index:-1;white-space:nowrap;font-family:Arial}
.page-header{text-align:center;border-bottom:3px double #0f2d1f;padding-bottom:10px;margin-bottom:10px}
.page-header .ar{font-size:22px;font-weight:700;color:#0f2d1f}
.page-header .en{font-size:14px;color:#1a4731;letter-spacing:2px;margin-top:2px}
.title-box{border:2.5px solid #0f2d1f;border-radius:8px;padding:8px 20px;margin:10px auto;
  width:fit-content;font-weight:700;font-size:15px;text-align:center;color:#0f2d1f;display:flex;gap:16px}
.info-grid{margin:12px 0;display:grid;grid-template-columns:1fr;gap:6px}
.info-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.info-field{display:flex;align-items:baseline;gap:6px;flex:1}
.info-field label{font-weight:700;font-size:12px;white-space:nowrap;color:#374151;min-width:90px}
.info-field .val{flex:1;border-bottom:1.5px solid #374151;font-size:12px;text-align:right;padding:0 4px 2px}
.term-section{margin-bottom:18px}
.term-header{background:linear-gradient(90deg,#0f2d1f,#1a4731);color:#fff;border-radius:6px;padding:6px 20px;
  margin:10px 0;font-weight:700;font-size:13px;display:flex;justify-content:space-between}
table.main{width:100%;border-collapse:collapse;margin-bottom:6px}
table.main th,table.main td{border:1px solid #d1d5db;padding:5px 8px;text-align:center;font-size:11px;vertical-align:middle}
table.main th{background:#f0f4f0;font-weight:800}
table.summary{width:100%;border-collapse:collapse;direction:ltr;margin-top:12px}
table.summary td{border:1.5px solid #374151;padding:7px 12px;font-size:12px}
table.summary .lbl{font-weight:700;background:#f8fafb;width:20%}
.stamp-cell img{width:80px;height:80px;opacity:.82;display:block;margin:0 auto}
.footer{text-align:center;margin-top:16px;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px}
@media print{body{padding:10px 16px}@page{size:A4;margin:8mm}}
</style></head><body>
<div class="watermark">TAHLEEM ACADEMY</div>
<div class="page-header">
  <div class="ar">أكاديمية تعليم</div>
  <div class="en">TAHLEEM ACADEMY</div>
</div>
<div class="title-box">
  <span>كشف نتائج الطلبة</span>
  <span>Student Academic Transcript</span>
</div>
<div class="info-grid">
  <div class="info-row">
    <div class="info-field"><label>اسم الطالب(ة)</label><span class="val">${profile?.full_name||"—"}</span></div>
    <div class="info-field"><label>العام الدراسي</label><span class="val">${hijriYear} هـ / ${currentYear} م</span></div>
  </div>
  <div class="info-row">
    <div class="info-field"><label>المرحلة</label><span class="val">${levelText}</span></div>
    <div class="info-field"><label>عدد المواد</label><span class="val">${allRows.length} مادة / ${allRows.length} subjects</span></div>
  </div>
  <div class="info-row">
    <div class="info-field"><label>تاريخ الإصدار</label><span class="val">${new Date().toLocaleDateString("ar-SA")}</span></div>
    <div class="info-field"><label>الحالة الأكاديمية</label>
      <span class="val">${cgpa>=2.0?"منتظمة / Regular":"تحت المراقبة / Probation"}</span>
    </div>
  </div>
</div>
${term1.length>0 ? buildTermSection(term1,"الفترة الأولى","First Term")  : ""}
${term2.length>0 ? buildTermSection(term2,"الفترة الثانية","Second Term") : ""}
${term3.length>0 ? buildTermSection(term3,"الفترة الثالثة","Third Term")  : ""}
<table class="summary">
  <tr>
    <td class="lbl">المجموع الكلي المحتسب / Total Obtainable</td><td style="text-align:center">${totalObtainable}</td>
    <td class="lbl">المجموع المحقق / Total Obtained</td><td style="text-align:center">${totalObtained}</td>
  </tr>
  <tr>
    <td class="lbl">المعدل التراكمي / Cumulative GPA</td>
    <td style="text-align:center;font-weight:800;font-size:16px">${cgpa.toFixed(2)} / 4.00</td>
    <td class="lbl">النتيجة الإجمالية / Overall Result</td>
    <td style="text-align:center;font-weight:700;color:${cgpa>=1.0?"#22c55e":"#ef4444"}">${cgpa>=1.0?"ناجح / Pass ✓":"راسب / Fail ✗"}</td>
  </tr>
  <tr>
    <td class="lbl">التقدير / Comment</td>
    <td style="text-align:center">${cgpaComment}</td>
    <td class="lbl">الختم الرسمي / Official Stamp</td>
    <td class="stamp-cell"><img src="${stampBase64}" alt="Stamp" /></td>
  </tr>
</table>
<div class="footer">
  Official Academic Transcript — Tahleem Academy — ${new Date().toLocaleDateString("en-GB")} — Confidential
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},600);}</script>
</body></html>`;
    pw.document.write(html); pw.document.close();
    toast({ title: t("Print dialog opened — save as PDF","تم فتح نافذة الطباعة") });
  };

  if (loading) return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );

  if (exams.length === 0) return (
    <div className="container mx-auto px-4 py-16 max-w-5xl">
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <GraduationCap className="h-20 w-20 mb-6 opacity-20" />
        <p className="text-xl font-semibold">{t("No graded exams yet","لا توجد امتحانات مصححة بعد")}</p>
        <p className="text-sm mt-2">{t("Results will appear here once your teacher grades them.","ستظهر النتائج هنا بعد تصحيح المعلم.")}</p>
      </div>
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: G }}>{t("Academic Transcript","السجل الأكاديمي")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Your complete academic record","سجلك الأكاديمي الكامل")}
            {" · "}{exams.length} {t("exams","امتحانات")}
          </p>
        </div>
        <Button onClick={downloadPDF} className="gap-2" style={{ background: G }}>
          <Download className="h-4 w-4" />
          {t("Download PDF","تحميل PDF")}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6" style={{ animation:"fadeUp .4s ease" }}>
        {/* CGPA Ring */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 flex flex-col items-center gap-4 md:col-span-1">
          <CGPARing cgpa={cgpa} />
          <div className="text-center">
            <div className="font-bold text-sm" style={{ color: G }}>{t("Cumulative GPA","المعدل التراكمي")}</div>
            <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold"
              style={{ background: cgpaGrade.bg, color: cgpaGrade.color }}>
              {language==="ar" ? statusAr : status}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="md:col-span-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { icon:<BookOpen className="h-5 w-5"/>,    label:t("Total Exams","الامتحانات"), value:exams.length,                              color:G     },
            { icon:<CheckCircle className="h-5 w-5"/>, label:t("Passed","ناجح"),            value:exams.filter(e=>e.passed).length,          color:"#22c55e" },
            { icon:<XCircle className="h-5 w-5"/>,    label:t("Failed","راسب"),             value:exams.filter(e=>!e.passed).length,         color:"#ef4444" },
            { icon:<Star className="h-5 w-5"/>,        label:t("Average Score","متوسط"),     value:`${avgScore.toFixed(1)}%`,                 color:GOLD  },
          ].map((s,i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border p-5 flex flex-col gap-2">
              <div style={{ color:s.color }}>{s.icon}</div>
              <div style={{ fontSize:30, fontWeight:900, color:s.color, lineHeight:1 }}>{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Best/Worst Subject Banner */}
      {(bestSubject || worstSubject) && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          {bestSubject && (
            <div className="bg-white rounded-2xl shadow-sm border p-4" style={{ borderLeft:`4px solid #22c55e` }}>
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="h-4 w-4" style={{ color:"#22c55e" }} />
                <span className="text-xs font-bold" style={{ color:"#22c55e" }}>Best Subject</span>
              </div>
              <div className="font-bold text-sm" style={{ color:G }}>{bestSubject.title}</div>
              <div className="text-2xl font-black mt-1" style={{ color:"#22c55e" }}>{bestSubject.total}%</div>
              <div className="text-xs text-muted-foreground">{bestSubject.grade.label}</div>
            </div>
          )}
          {worstSubject && (
            <div className="bg-white rounded-2xl shadow-sm border p-4" style={{ borderLeft:`4px solid ${worstSubject.passed?"#ea580c":"#ef4444"}` }}>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4" style={{ color:"#ea580c" }} />
                <span className="text-xs font-bold" style={{ color:"#ea580c" }}>Needs Attention</span>
              </div>
              <div className="font-bold text-sm" style={{ color:G }}>{worstSubject.title}</div>
              <div className="text-2xl font-black mt-1" style={{ color: worstSubject.passed ? "#ea580c" : "#ef4444" }}>{worstSubject.total}%</div>
              <div className="text-xs text-muted-foreground">{worstSubject.grade.label}</div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6 w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">{t("All Terms","جميع الفترات")}</TabsTrigger>
          <TabsTrigger value="term1">
            {t("Term 1","الفترة الأولى")}
            {term1.length>0 && <span className="ml-1 opacity-60">({buildSubjectRows(term1).length})</span>}
          </TabsTrigger>
          <TabsTrigger value="term2">
            {t("Term 2","الفترة الثانية")}
            {term2.length>0 && <span className="ml-1 opacity-60">({buildSubjectRows(term2).length})</span>}
          </TabsTrigger>
          <TabsTrigger value="term3">
            {t("Term 3","الفترة الثالثة")}
            {term3.length>0 && <span className="ml-1 opacity-60">({buildSubjectRows(term3).length})</span>}
          </TabsTrigger>
          <TabsTrigger value="analytics">{t("Analytics","التحليل")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-4">
            {[
              { termExams:term1, label:t("First Term","الفترة الأولى")   },
              { termExams:term2, label:t("Second Term","الفترة الثانية") },
              { termExams:term3, label:t("Third Term","الفترة الثالثة")  },
            ].map(({ termExams, label }) => termExams.length>0 && (
              <div key={label} className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                <TermTable exams={termExams} termLabel={label} language={language} />
              </div>
            ))}
          </div>
        </TabsContent>

        {[
          { key:"term1", termExams:term1, label:t("First Term","الفترة الأولى")   },
          { key:"term2", termExams:term2, label:t("Second Term","الفترة الثانية") },
          { key:"term3", termExams:term3, label:t("Third Term","الفترة الثالثة")  },
        ].map(({ key, termExams, label }) => (
          <TabsContent key={key} value={key}>
            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
              <TermTable exams={termExams} termLabel={label} language={language} />
            </div>
          </TabsContent>
        ))}

        <TabsContent value="analytics">
          <div className="grid gap-6 md:grid-cols-2">

            {/* Score trend */}
            {trendData.length > 1 && (
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-4 w-4" style={{ color:GOLD }} />
                  <span className="font-bold text-sm" style={{ color:G }}>{t("Score Trend","مسار الدرجات")}</span>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
                    <XAxis dataKey="name" tick={{ fontSize:10 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0,100]} tick={{ fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>`${v}%`} />
                    <Tooltip formatter={(v:any) => [`${v}%`,"Score"]}
                      contentStyle={{ borderRadius:10, fontSize:12, fontFamily:"'Cairo',sans-serif" }} />
                    <Line dataKey="score" stroke={G} strokeWidth={2.5} dot={{ fill:G, r:4 }} activeDot={{ r:6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Term comparison */}
            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="h-4 w-4" style={{ color:GOLD }} />
                <span className="font-bold text-sm" style={{ color:G }}>{t("Term Comparison","مقارنة الفترات")}</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={termBarData} barSize={44}>
                  <XAxis dataKey="name" tick={{ fontSize:12 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0,100]} tick={{ fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>`${v}%`} />
                  <Tooltip formatter={(v:any) => [`${v}%`,"Average"]}
                    contentStyle={{ borderRadius:10, fontSize:12 }} />
                  <Bar dataKey="avg" radius={[8,8,0,0]}>
                    {termBarData.map((_,i) => <Cell key={i} fill={[G,GOLD,GM][i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Grade distribution */}
            <div className="bg-white rounded-2xl shadow-sm border p-6 md:col-span-2">
              <div className="flex items-center gap-2 mb-5">
                <Award className="h-4 w-4" style={{ color:GOLD }} />
                <span className="font-bold text-sm" style={{ color:G }}>{t("Grade Distribution","توزيع الدرجات")}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {(["A+","A","B","C","D","F"] as const).map(letter => {
                  const thresholds: Record<string,[number,number]> = {
                    "A+":[90,101],"A":[80,90],"B":[70,80],"C":[60,70],"D":[50,60],"F":[0,50]
                  };
                  const [lo,hi] = thresholds[letter];
                  const count = exams.filter(e => e.percentage>=lo && e.percentage<hi).length;
                  const grade = getLetterGrade(lo+(letter==="A+"?0:1));
                  return (
                    <div key={letter} style={{ background:grade.bg, border:`1px solid ${grade.color}33`, borderRadius:16, padding:"16px 8px", textAlign:"center" }}>
                      <div style={{ fontSize:24, fontWeight:900, color:grade.color }}>{letter}</div>
                      <div style={{ fontSize:26, fontWeight:900, color:G, marginTop:4 }}>{count}</div>
                      <div style={{ fontSize:9, color:"#9ca3af", marginTop:4 }}>{lo}–{letter==="A+"?100:hi-1}%</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Subject ranking */}
            {allRows.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border p-6 md:col-span-2">
                <div className="flex items-center gap-2 mb-4">
                  <Trophy className="h-4 w-4" style={{ color:GOLD }} />
                  <span className="font-bold text-sm" style={{ color:G }}>Subject Ranking · ترتيب المواد</span>
                </div>
                <div className="space-y-3">
                  {allRows.map((row, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div style={{ width:28, height:28, borderRadius:"50%", background: i===0?G:i===1?"#276749":"#f0f4f0",
                        display:"flex", alignItems:"center", justifyContent:"center", fontSize:11,
                        fontWeight:700, color:i<2?"#fff":"#7a9e88", flexShrink:0 }}>
                        {i+1}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-semibold truncate" style={{ color:G }}>{row.title}</span>
                          <span className="text-sm font-black ml-2" style={{ color:row.grade.color }}>{row.total}%</span>
                        </div>
                        <div style={{ height:6, borderRadius:3, background:"#f0f4f0", overflow:"hidden" }}>
                          <div style={{ width:`${row.total}%`, height:"100%", borderRadius:3, background:row.grade.color, transition:"width .6s" }} />
                        </div>
                      </div>
                      <span style={{ padding:"3px 10px", borderRadius:20, background:row.grade.bg, color:row.grade.color, fontWeight:800, fontSize:12, flexShrink:0 }}>
                        {row.grade.letter}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Transcripts;
