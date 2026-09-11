/*  src/pages/student/ReportCard.tsx
    Single-term Report Card — subjects/grades table, RTL (Arabic-first).
    - Student route:  /student/report-card            (own report card)
    - Admin route:    /student/report-card/:userId     (any student's, admin/teacher only)
*/
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Download, GraduationCap } from "lucide-react";
import tahleemStamp from "@/assets/tahleem-stamp.png";
import { useToast } from "@/hooks/use-toast";

const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c";

interface GradedExam {
  title: string; title_ar: string | null;
  percentage: number; passed: boolean;
  term: string; type: string; course_title?: string;
}

interface SubjectRow {
  title: string; title_ar: string; course: string;
  test: number; exam: number; total: number;
  grade: ReturnType<typeof getLetterGrade>;
  passed: boolean;
}

const getLetterGrade = (pct: number) => {
  if (pct >= 90) return { letter: "A+", color: "#22c55e", bg: "#f0fff4", label: "Excellent",     labelAr: "ممتاز"    };
  if (pct >= 80) return { letter: "A",  color: "#16a34a", bg: "#dcfce7", label: "Very Good",     labelAr: "جيد جداً"  };
  if (pct >= 70) return { letter: "B",  color: "#2563eb", bg: "#eff6ff", label: "Good",          labelAr: "جيد"      };
  if (pct >= 60) return { letter: "C",  color: GOLD,      bg: "#fffbeb", label: "Satisfactory",  labelAr: "مقبول"    };
  if (pct >= 50) return { letter: "D",  color: "#ea580c", bg: "#fff7ed", label: "Pass",          labelAr: "ناجح"     };
  return                { letter: "F",  color: "#ef4444", bg: "#fff5f5", label: "Fail",          labelAr: "راسب"     };
};

function buildSubjectRows(exams: GradedExam[]): SubjectRow[] {
  const map = new Map<string, { title: string; title_ar: string; course: string; tests: number[]; exams: number[] }>();
  exams.forEach(e => {
    const key = e.title;
    if (!map.has(key)) map.set(key, { title: e.title, title_ar: e.title_ar || e.title, course: e.course_title || "", tests: [], exams: [] });
    const entry = map.get(key)!;
    if (e.type === "test") entry.tests.push(e.percentage);
    else entry.exams.push(e.percentage);
  });
  return Array.from(map.values()).map(r => {
    const testScore = r.tests.length ? Math.round(Math.max(...r.tests) * 0.3) : 0;
    const examScore = r.exams.length ? Math.round(Math.max(...r.exams) * 0.7) : 0;
    const total = testScore + examScore;
    return { title: r.title, title_ar: r.title_ar, course: r.course, test: testScore, exam: examScore, total, grade: getLetterGrade(total), passed: total >= 50 };
  }).sort((a, b) => b.total - a.total);
}

const TERMS = [
  { key: "first",  ar: "الفترة الأولى",  en: "First Term"  },
  { key: "second", ar: "الفترة الثانية", en: "Second Term" },
  { key: "third",  ar: "الفترة الثالثة", en: "Third Term"  },
];

const ReportCard = () => {
  const { t } = useLanguage();
  const { user, profile: ownProfile } = useAuth();
  const { toast } = useToast();
  const { userId } = useParams<{ userId?: string }>();

  const [profile, setProfile] = useState<any>(null);
  const [exams, setExams]     = useState<GradedExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm]       = useState("first");

  const targetId = userId || user?.id;
  const isAdminView = !!userId;

  useEffect(() => {
    if (!targetId) return;
    (async () => {
      const [pRes, aRes] = await Promise.all([
        isAdminView
          ? supabase.from("profiles").select("*").eq("user_id", targetId).maybeSingle()
          : Promise.resolve({ data: ownProfile }),
        supabase.from("exam_attempts")
          .select("score, percentage, passed, exams(title, title_ar, type, term, subject_id, subjects(title))")
          .eq("user_id", targetId).eq("status", "released")
          .order("submitted_at", { ascending: true }),
      ]);
      setProfile(pRes.data);
      const rows = (aRes.data || []).map((a: any) => ({
        title: a.exams?.title || "Exam", title_ar: a.exams?.title_ar,
        percentage: Number(a.percentage) || 0, passed: a.passed,
        course_title: a.exams?.subjects?.title,
        term: a.exams?.term || "first", type: a.exams?.type || "exam",
      }));
      setExams(rows);
      // default to the most recent term that actually has results
      const populated = TERMS.map(tm => tm.key).filter(k => rows.some((r: any) => r.term === k));
      if (populated.length) setTerm(populated[populated.length - 1]);
      setLoading(false);
    })();
  }, [targetId, isAdminView]);

  const termExams = exams.filter(e => e.term === term);
  const rows       = buildSubjectRows(termExams);
  const totalObtainable = rows.length * 100;
  const totalObtained   = rows.reduce((s, r) => s + r.total, 0);
  const avgScore    = rows.length ? totalObtained / rows.length : 0;
  const gradeCounts = (["A+", "A", "B", "C", "D", "F"] as const).map(letter => ({
    letter, count: rows.filter(r => r.grade.letter === letter).length,
  }));
  const termLabel = TERMS.find(tm => tm.key === term)!;
  const currentYear = new Date().getFullYear();
  const populatedTerms = TERMS.filter(tm => exams.some(e => e.term === tm.key));

  // ── Print / PDF ──────────────────────────────────────────────
  // Builds one printed page's inner HTML for a given term. Used both for
  // the single-term download and, repeated per term, for the "all terms"
  // download — each page gets its own header/table/summary so it reads as
  // a standalone report, and `.page{page-break-after:always}` below makes
  // each one land on its own sheet when saved as PDF / printed.
  const buildTermPage = (termKey: string, stampSrc: string) => {
    const tRows  = buildSubjectRows(exams.filter(e => e.term === termKey));
    const tLabel = TERMS.find(tm => tm.key === termKey)!;
    const tObtained    = tRows.reduce((s, r) => s + r.total, 0);
    const tObtainable  = tRows.length * 100;
    const tAvg         = tRows.length ? tObtained / tRows.length : 0;
    const tGradeCounts = (["A+", "A", "B", "C", "D", "F"] as const).map(letter => ({
      letter, count: tRows.filter(r => r.grade.letter === letter).length,
    }));
    return `
<div class="page">
<div class="page-header">
  <div class="ar">أكاديمية التعليم</div>
  <div class="en">TAHLEEM ACADEMY</div>
</div>
<div class="title-box">
  <span>كشف الدرجات الفصلي</span>
  <span>${tLabel.en} Report Card</span>
</div>
<div class="info-row">
  <div class="info-field"><label>اسم الطالب(ة)</label><span class="val">${profile?.full_name_ar || profile?.full_name || "—"}</span></div>
  <div class="info-field"><label>العام الدراسي</label><span class="val">${currentYear - 579} هـ / ${currentYear} م</span></div>
</div>
<div class="info-row">
  <div class="info-field"><label>المستوى</label><span class="val">${profile?.level || "—"}</span></div>
  <div class="info-field"><label>الفترة</label><span class="val">${tLabel.ar}</span></div>
</div>
<table class="main">
  <thead><tr>
    <th style="width:5%">#</th>
    <th style="width:30%;text-align:right">المادة / Subject</th>
    <th>اختبار (30)</th>
    <th>امتحان (70)</th>
    <th>المجموع</th>
    <th>الدرجة</th>
    <th>النتيجة</th>
  </tr></thead>
  <tbody>
    ${tRows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td style="text-align:right;font-size:13px">${r.title_ar} / ${r.title}</td>
        <td>${r.test || "—"}</td>
        <td>${r.exam || "—"}</td>
        <td style="font-weight:800">${r.total}</td>
        <td style="font-weight:800;color:${r.grade.color}">${r.grade.letter}</td>
        <td style="color:${r.passed ? "#22c55e" : "#ef4444"};font-weight:700">${r.passed ? "ناجح ✓" : "راسب ✗"}</td>
      </tr>`).join("")}
  </tbody>
</table>
<div class="summary-grid">
  <table class="small">
    <thead><tr><th colspan="2">ملخص الأداء / Performance Summary</th></tr></thead>
    <tbody>
      <tr><td>المجموع المحقق / Total Obtained</td><td>${tObtained}</td></tr>
      <tr><td>المجموع الكلي / Total Obtainable</td><td>${tObtainable}</td></tr>
      <tr><td>عدد المواد / Subjects</td><td>${tRows.length}</td></tr>
      <tr><td>المتوسط / Average</td><td>${tAvg.toFixed(1)}%</td></tr>
    </tbody>
  </table>
  <table class="small">
    <thead><tr>${tGradeCounts.map(g => `<th>${g.letter}</th>`).join("")}</tr></thead>
    <tbody><tr>${tGradeCounts.map(g => `<td>${g.count}</td>`).join("")}</tr></tbody>
  </table>
</div>
<div class="legend">
  سلم الدرجات / Grade Scale: 90-100 A+ (ممتاز) · 80-89 A (جيد جداً) · 70-79 B (جيد) · 60-69 C (مقبول) · 50-59 D (ناجح) · 0-49 F (راسب)
</div>
<div class="stamp-row">
  <span style="font-size:11px;color:#6b7280">تاريخ الإصدار: ${new Date().toLocaleDateString("ar-SA")}</span>
  <img src="${stampSrc}" alt="Stamp" />
</div>
<div class="footer">Official Term Report Card — Tahleem Academy — ${new Date().toLocaleDateString("en-GB")} — Confidential</div>
</div>`;
  };

  const downloadPDF = async (mode: "current" | "all" = "current") => {
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

    const pw = window.open("", "_blank");
    if (!pw) { toast({ title: t("Allow popups to download PDF", "السماح بالنوافذ المنبثقة"), variant: "destructive" }); return; }

    const termKeys = mode === "all" ? populatedTerms.map(tm => tm.key) : [term];
    const pagesHtml = termKeys.map(k => buildTermPage(k, stampBase64)).join("");

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"><title>كشف الدرجات — ${profile?.full_name || ""}</title>
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Amiri',serif;color:#111;background:#fff;font-size:12px}
.page{padding:18px 24px;position:relative;page-break-after:always}
.page:last-child{page-break-after:auto}
.watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);
  font-size:60px;font-weight:900;color:rgba(15,45,31,.06);z-index:-1;white-space:nowrap;font-family:Arial}
.page-header{text-align:center;border-bottom:3px double #0f2d1f;padding-bottom:10px;margin-bottom:10px}
.page-header .ar{font-size:22px;font-weight:700;color:#0f2d1f}
.page-header .en{font-size:14px;color:#1a4731;letter-spacing:2px;margin-top:2px}
.title-box{border:2.5px solid #0f2d1f;border-radius:8px;padding:8px 20px;margin:10px auto;
  width:fit-content;font-weight:700;font-size:15px;text-align:center;color:#0f2d1f;display:flex;gap:16px}
.info-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:6px}
.info-field{display:flex;align-items:baseline;gap:6px}
.info-field label{font-weight:700;font-size:12px;white-space:nowrap;color:#374151;min-width:90px}
.info-field .val{flex:1;border-bottom:1.5px solid #374151;font-size:12px;text-align:right;padding:0 4px 2px}
table.main{width:100%;border-collapse:collapse;margin:14px 0 6px}
table.main th,table.main td{border:1px solid #d1d5db;padding:6px 8px;text-align:center;font-size:12px;vertical-align:middle}
table.main th{background:#f0f4f0;font-weight:800}
.summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
table.small{width:100%;border-collapse:collapse}
table.small th,table.small td{border:1px solid #d1d5db;padding:5px 8px;text-align:center;font-size:11px}
table.small th{background:#f0f4f0;font-weight:800}
.legend{font-size:10px;color:#6b7280;margin-top:10px;line-height:1.7}
.stamp-row{display:flex;justify-content:space-between;align-items:center;margin-top:18px}
.stamp-row img{width:70px;height:70px;opacity:.82}
.footer{text-align:center;margin-top:16px;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px}
@media print{.page{padding:10px 16px}@page{size:A4;margin:8mm}}
</style></head><body>
${pagesHtml}
<script>window.onload=function(){setTimeout(function(){window.print();},600);}</script>
</body></html>`;
    pw.document.write(html); pw.document.close();
    toast({ title: t("Print dialog opened — save as PDF", "تم فتح نافذة الطباعة") });
  };

  if (loading) return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );

  return (
    <div dir="rtl" className="container mx-auto px-4 py-6 max-w-4xl" style={{ fontFamily: "'Cairo',sans-serif" }}>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: G, fontFamily: "'Amiri',serif" }}>كشف الدرجات الفصلي</h1>
          <p className="text-sm text-muted-foreground mt-1">Term Report Card{profile?.full_name ? ` · ${profile.full_name}` : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => downloadPDF("current")} className="gap-2" style={{ background: G }}>
            <Download className="h-4 w-4" />تحميل الفترة الحالية
          </Button>
          {populatedTerms.length > 1 && (
            <Button onClick={() => downloadPDF("all")} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />تحميل جميع الفترات ({populatedTerms.length})
            </Button>
          )}
        </div>
      </div>

      {/* Term selector */}
      <div className="flex gap-2 mb-4">
        {TERMS.map(tm => (
          <button key={tm.key} onClick={() => setTerm(tm.key)}
            style={{
              padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
              border: `1.5px solid ${term === tm.key ? G : "#e5e7eb"}`,
              background: term === tm.key ? G : "#fff", color: term === tm.key ? "#fff" : "#6b7280",
            }}>
            {tm.ar}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-white rounded-2xl border">
          <GraduationCap className="h-12 w-12 mx-auto mb-3 opacity-30" />
          لا توجد نتائج لهذه الفترة بعد
        </div>
      ) : (
        <>
          {/* Student info */}
          <div className="bg-white rounded-2xl shadow-sm border p-4 mb-4 grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">اسم الطالب(ة): </span><strong style={{ color: G }}>{profile?.full_name_ar || profile?.full_name || "—"}</strong></div>
            <div><span className="text-muted-foreground">المستوى: </span><strong style={{ color: G }}>{profile?.level || "—"}</strong></div>
            <div><span className="text-muted-foreground">الفترة: </span><strong style={{ color: G }}>{termLabel.ar}</strong></div>
            <div><span className="text-muted-foreground">العام الدراسي: </span><strong style={{ color: G }}>{currentYear - 579} هـ / {currentYear} م</strong></div>
          </div>

          {/* Subjects table */}
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden mb-4">
            <div style={{ background: `linear-gradient(90deg,${G},${GM})`, color: "#fff", padding: "10px 16px", fontWeight: 700, fontSize: 14 }}>
              المواد الدراسية
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafb" }}>
                    {["#", "المادة", "اختبار (30)", "امتحان (70)", "المجموع", "الدرجة", "النتيجة"].map(h => (
                      <th key={h} style={{ padding: "9px 10px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#6b7280", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f0f4f8", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "10px", textAlign: "center", fontSize: 12, color: "#9ca3af", fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: G, fontFamily: "'Amiri',serif", fontSize: 15 }}>{row.title_ar}</td>
                      <td style={{ padding: "10px", textAlign: "center" }}>{row.test || "—"}</td>
                      <td style={{ padding: "10px", textAlign: "center" }}>{row.exam || "—"}</td>
                      <td style={{ padding: "10px", textAlign: "center", fontWeight: 900, fontSize: 16, color: row.grade.color }}>{row.total}</td>
                      <td style={{ padding: "10px", textAlign: "center" }}>
                        <span style={{ padding: "3px 10px", borderRadius: 20, background: row.grade.bg, color: row.grade.color, fontWeight: 800, fontSize: 12 }}>{row.grade.letter}</span>
                      </td>
                      <td style={{ padding: "10px", textAlign: "center", fontWeight: 700, color: row.passed ? "#22c55e" : "#ef4444" }}>{row.passed ? "ناجح" : "راسب"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Performance summary + grade analysis */}
          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="font-bold text-sm mb-3" style={{ color: G }}>ملخص الأداء</div>
              {[
                ["المجموع المحقق", totalObtained],
                ["المجموع الكلي", totalObtainable],
                ["عدد المواد", rows.length],
                ["المتوسط", `${avgScore.toFixed(1)}%`],
              ].map(([label, val]) => (
                <div key={label as string} className="flex justify-between text-sm py-1.5 border-b last:border-0">
                  <span className="text-muted-foreground">{label}</span><strong style={{ color: G }}>{val}</strong>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="font-bold text-sm mb-3" style={{ color: G }}>تحليل الدرجات</div>
              <div className="grid grid-cols-6 gap-1.5 text-center">
                {gradeCounts.map(g => (
                  <div key={g.letter}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: getLetterGrade(g.letter === "A+" ? 95 : g.letter === "A" ? 85 : g.letter === "B" ? 75 : g.letter === "C" ? 65 : g.letter === "D" ? 55 : 0).color }}>{g.letter}</div>
                    <div className="text-lg font-black" style={{ color: G }}>{g.count}</div>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
                90-100 A+ (ممتاز) · 80-89 A (جيد جداً) · 70-79 B (جيد) · 60-69 C (مقبول) · 50-59 D (ناجح) · 0-49 F (راسب)
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ReportCard;
