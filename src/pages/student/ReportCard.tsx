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
import tahleemHeaderArt from "@/assets/tahleem-header-art.png";
import { useToast } from "@/hooks/use-toast";

const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c";

// Arabic-Indic digit conversion — used so subject scores read in Arabic numerals.
const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const toArabicDigits = (n: number | string) => String(n).replace(/[0-9]/g, (d) => AR_DIGITS[+d]);

// Student level is stored in English (beginner/intermediate/advanced) — shown in Arabic.
const LEVEL_AR: Record<string, string> = {
  beginner: "مبتدئ", intermediate: "متوسط", advanced: "متقدم",
};
const levelToArabic = (level?: string | null) => {
  if (!level) return "—";
  return LEVEL_AR[level.toLowerCase().trim()] || level;
};

// Simplified Arabic subject names (independent of the specific exam title/level)
// with a short English gloss shown alongside.
const SUBJECT_AR: Record<string, { ar: string; en: string }> = {
  tafsir:  { ar: "التفسير",      en: "Tafsir" },
  seerah:  { ar: "السيرة",       en: "Seerah" },
  arabic:  { ar: "اللغة العربية", en: "Arabic Language" },
};
const getSubjectDisplay = (row: { course: string; title: string; title_ar: string }) => {
  const key = `${row.course} ${row.title}`.toLowerCase();
  for (const k of Object.keys(SUBJECT_AR)) if (key.includes(k)) return SUBJECT_AR[k];
  return { ar: row.title_ar, en: row.title };
};

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

// Auto-generates Arabic teacher's/director's remarks from the term's actual
// average and pass rate — no manual data entry needed.
function generateRemarks(avg: number, passedCount: number, totalCount: number) {
  if (totalCount === 0) return {
    teacher: "لا توجد نتائج كافية بعد لتقييم أداء الطالب(ة) لهذه الفترة.",
    director: "ننتظر استكمال الاختبارات لتقديم تقييم شامل.",
  };
  if (avg >= 90) return {
    teacher: "أداء استثنائي يعكس التزاماً وجهداً متميزاً في جميع المواد. نثني على هذا المستوى الرفيع ونحث الطالب(ة) على المواصلة.",
    director: "نفخر بهذا التفوق اللافت، ونسأل الله أن يبارك في هذا الجهد ويزيده توفيقاً ورفعة.",
  };
  if (avg >= 80) return {
    teacher: "نتائج جيدة جداً تدل على جهد واضح والتزام بالمذاكرة. نشجع على الاستمرار بنفس الجدية والانتظام.",
    director: "أداء مشرف يستحق التقدير، والمزيد من العمل يوصل إلى الامتياز بإذن الله.",
  };
  if (avg >= 70) return {
    teacher: "أداء جيد بوجه عام، مع وجود مجال للتحسن في بعض المواد. ننصح بمزيد من المراجعة والمتابعة اليومية.",
    director: "مستوى مقبول يحتاج إلى دفعة إضافية من الجهد والانتظام للوصول إلى نتائج أفضل.",
  };
  if (avg >= 50) return {
    teacher: "النتائج تشير إلى حاجة الطالب(ة) لمزيد من التركيز والمذاكرة المنتظمة لتحسين المستوى في الفترة القادمة.",
    director: "نحث الطالب(ة) وولي الأمر على متابعة أقرب للدراسة خلال الفترة القادمة لتحقيق تقدم ملموس.",
  };
  return {
    teacher: "يحتاج الطالب(ة) إلى بذل جهد أكبر بشكل عاجل ومتابعة مكثفة لتدارك الضعف الظاهر في نتائج هذه الفترة.",
    director: "نأمل تكثيف المتابعة الأسرية والمدرسية لمساعدة الطالب(ة) على تجاوز هذه الفترة وتحقيق مستوى أفضل.",
  };
}

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

// ── Print density tiers ──────────────────────────────────────────
// The printed page is a fixed A4 sheet, but the number of subjects on a
// term is open-ended (schools can add more at any time). Rather than let
// an 8th, 9th, 10th... subject overflow onto a second page, every
// size-sensitive measurement (table padding, font sizes, section
// margins, stamp size) is driven by how many subject rows are on the
// page, so the sheet quietly compresses itself to keep everything on
// one page no matter how many subjects get added.
const DENSITY_TIERS: { max: number; cls: string; css: string }[] = [
  { max: 5, cls: "dens-a", css: `
.page.dens-a table.main{margin:16px 0 8px}
.page.dens-a table.main th,.page.dens-a table.main td{padding:8px 8px;font-size:12.5px}
.page.dens-a table.main th{font-size:12px}
.page.dens-a .subject-cell .subject-ar{font-size:14px}
.page.dens-a .subject-cell .subject-en{font-size:10px}
.page.dens-a .summary-grid{margin-top:14px}
.page.dens-a table.small th,.page.dens-a table.small td{font-size:11.5px;padding:6px 8px}
.page.dens-a .grade-box-title{font-size:11px;padding:6px 10px}
.page.dens-a table.grade-table th{font-size:12px}
.page.dens-a table.grade-table td{font-size:13px}
.page.dens-a table.grade-table th,.page.dens-a table.grade-table td{padding:5px 4px}
.page.dens-a .legend{font-size:9.5px;padding:8px 10px 10px}
.page.dens-a .comments-grid{margin-top:16px}
.page.dens-a .comment-label{font-size:11.5px;padding:7px 14px}
.page.dens-a .comment-text{font-size:12.5px;padding:10px 14px;line-height:1.9}
.page.dens-a .stamp-center{margin-top:26px;gap:10px}
.page.dens-a .stamp-center img{width:130px}
.page.dens-a .footer{margin-top:14px;padding-top:8px}
.page.dens-a .info-box{margin:14px 0 16px;padding:8px 20px}` },
  { max: 8, cls: "dens-b", css: `
.page.dens-b table.main{margin:10px 0 6px}
.page.dens-b table.main th,.page.dens-b table.main td{padding:6px 7px;font-size:11.5px}
.page.dens-b table.main th{font-size:11px}
.page.dens-b .subject-cell .subject-ar{font-size:13px}
.page.dens-b .subject-cell .subject-en{font-size:9.5px}
.page.dens-b .summary-grid{margin-top:10px}
.page.dens-b table.small th,.page.dens-b table.small td{font-size:10.5px;padding:5px 7px}
.page.dens-b .grade-box-title{font-size:10.5px;padding:5px 9px}
.page.dens-b table.grade-table th{font-size:11px}
.page.dens-b table.grade-table td{font-size:12px}
.page.dens-b table.grade-table th,.page.dens-b table.grade-table td{padding:4px 3px}
.page.dens-b .legend{font-size:9px;padding:6px 9px 8px}
.page.dens-b .comments-grid{margin-top:10px}
.page.dens-b .comment-label{font-size:11px;padding:5px 12px}
.page.dens-b .comment-text{font-size:11.5px;padding:7px 12px;line-height:1.6}
.page.dens-b .stamp-center{margin-top:14px;gap:8px}
.page.dens-b .stamp-center img{width:105px}
.page.dens-b .footer{margin-top:8px;padding-top:6px}
.page.dens-b .info-box{margin:8px 0 10px;padding:6px 16px}` },
  { max: 12, cls: "dens-c", css: `
.page.dens-c table.main{margin:6px 0 4px}
.page.dens-c table.main th,.page.dens-c table.main td{padding:4px 5px;font-size:10.5px}
.page.dens-c table.main th{font-size:10px}
.page.dens-c .subject-cell .subject-ar{font-size:12px}
.page.dens-c .subject-cell .subject-en{font-size:8.5px}
.page.dens-c .summary-grid{margin-top:7px}
.page.dens-c table.small th,.page.dens-c table.small td{font-size:9.5px;padding:4px 6px}
.page.dens-c .grade-box-title{font-size:9.5px;padding:4px 8px}
.page.dens-c table.grade-table th{font-size:10px}
.page.dens-c table.grade-table td{font-size:11px}
.page.dens-c table.grade-table th,.page.dens-c table.grade-table td{padding:3px 2px}
.page.dens-c .legend{font-size:8px;padding:5px 8px 6px}
.page.dens-c .comments-grid{margin-top:7px}
.page.dens-c .comment-label{font-size:10px;padding:4px 10px}
.page.dens-c .comment-text{font-size:10.5px;padding:5px 10px;line-height:1.4}
.page.dens-c .stamp-center{margin-top:8px;gap:5px}
.page.dens-c .stamp-center img{width:82px}
.page.dens-c .footer{margin-top:5px;padding-top:4px}
.page.dens-c .info-box{margin:6px 0 7px;padding:5px 14px}` },
  { max: Infinity, cls: "dens-d", css: `
.page.dens-d table.main{margin:4px 0 3px}
.page.dens-d table.main th,.page.dens-d table.main td{padding:3px 4px;font-size:9.5px}
.page.dens-d table.main th{font-size:9px}
.page.dens-d .subject-cell .subject-ar{font-size:11px}
.page.dens-d .subject-cell .subject-en{font-size:8px}
.page.dens-d .summary-grid{margin-top:5px}
.page.dens-d table.small th,.page.dens-d table.small td{font-size:8.5px;padding:3px 5px}
.page.dens-d .grade-box-title{font-size:8.5px;padding:3px 7px}
.page.dens-d table.grade-table th{font-size:9px}
.page.dens-d table.grade-table td{font-size:10px}
.page.dens-d table.grade-table th,.page.dens-d table.grade-table td{padding:2px 2px}
.page.dens-d .legend{font-size:7.3px;padding:4px 7px 5px}
.page.dens-d .comments-grid{margin-top:5px}
.page.dens-d .comment-label{font-size:9px;padding:3px 8px}
.page.dens-d .comment-text{font-size:9.5px;padding:4px 8px;line-height:1.25}
.page.dens-d .stamp-center{margin-top:5px;gap:3px}
.page.dens-d .stamp-center img{width:66px}
.page.dens-d .footer{margin-top:4px;padding-top:3px}
.page.dens-d .info-box{margin:5px 0 6px;padding:4px 12px}` },
];
const densityClassFor = (subjectCount: number) =>
  (DENSITY_TIERS.find(t => subjectCount <= t.max) || DENSITY_TIERS[DENSITY_TIERS.length - 1]).cls;
const DENSITY_CSS = DENSITY_TIERS.map(t => t.css).join("\n");

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
  const buildTermPage = (termKey: string, stampSrc: string, logoSrc: string) => {
    const tRows  = buildSubjectRows(exams.filter(e => e.term === termKey));
    const tLabel = TERMS.find(tm => tm.key === termKey)!;
    const tObtained    = tRows.reduce((s, r) => s + r.total, 0);
    const tObtainable  = tRows.length * 100;
    const tAvg         = tRows.length ? tObtained / tRows.length : 0;
    const tPassedCount = tRows.filter(r => r.passed).length;
    const tGradeCounts = (["A+", "A", "B", "C", "D", "F"] as const).map(letter => ({
      letter, count: tRows.filter(r => r.grade.letter === letter).length,
    }));
    const remarks = generateRemarks(tAvg, tPassedCount, tRows.length);
    return `
<div class="page ${densityClassFor(tRows.length)}">
<div class="watermark">TAHLEEM ACADEMY</div>
<div class="header-bar">
  <div class="header-title">
    <div class="header-ar">كشف الدرجات الفصلي</div>
    <div class="header-en">Term Report Card</div>
  </div>
  <div class="header-logo-wrap">
    <img src="${logoSrc}" alt="Tahleem Academy" class="header-logo-right" />
    <div class="header-logo-caption">TAHLEEM ACADEMY</div>
  </div>
</div>
<div class="page-inner">
<div class="info-box">
<div class="info-row">
  <div class="info-field"><label>اسم الطالب(ة)</label><span class="val">${profile?.full_name_ar || profile?.full_name || "—"}</span></div>
  <div class="info-field"><label>العام الدراسي</label><span class="val">${currentYear - 579} هـ / ${currentYear} م</span></div>
</div>
<div class="info-row">
  <div class="info-field"><label>المستوى</label><span class="val">${levelToArabic(profile?.level)}</span></div>
  <div class="info-field"><label>الفترة</label><span class="val">${tLabel.ar}</span></div>
</div>
</div>
<table class="main">
  <thead><tr>
    <th style="width:5%">#</th>
    <th style="width:32%;text-align:right">المادة</th>
    <th>اختبار (30)</th>
    <th>امتحان (70)</th>
    <th>المجموع</th>
    <th>الدرجة</th>
    <th>النتيجة</th>
  </tr></thead>
  <tbody>
    ${tRows.map((r, i) => { const subj = getSubjectDisplay(r); return `
      <tr>
        <td>${toArabicDigits(i + 1)}</td>
        <td style="text-align:right">
          <div class="subject-cell">
            <span class="subject-ar">${subj.ar}</span>
            <span class="subject-en">${subj.en}</span>
          </div>
        </td>
        <td>${r.test ? toArabicDigits(r.test) : "—"}</td>
        <td>${r.exam ? toArabicDigits(r.exam) : "—"}</td>
        <td style="font-weight:900">${toArabicDigits(r.total)}</td>
        <td style="font-weight:900;color:${r.grade.color}">${r.grade.letter}</td>
        <td style="color:${r.passed ? "#22c55e" : "#ef4444"};font-weight:800">${r.passed ? "ناجح ✓" : "راسب"}</td>
      </tr>`; }).join("")}
  </tbody>
</table>
<div class="summary-grid">
  <table class="small">
    <thead><tr><th colspan="2">ملخص الأداء / Performance Summary</th></tr></thead>
    <tbody>
      <tr><td>المجموع المحقق / Total Obtained</td><td>${toArabicDigits(tObtained)}</td></tr>
      <tr><td>المجموع الكلي / Total Obtainable</td><td>${toArabicDigits(tObtainable)}</td></tr>
      <tr><td>عدد المواد / Subjects</td><td>${toArabicDigits(tRows.length)}</td></tr>
      <tr><td>المتوسط / Average</td><td>${toArabicDigits(tAvg.toFixed(1))}%</td></tr>
    </tbody>
  </table>
  <div class="grade-box">
    <div class="grade-box-title">توزيع الدرجات / Grade Distribution</div>
    <table class="grade-table">
      <thead><tr>${["A+", "A", "B", "C", "D", "F"].map(l => `<th>${l}</th>`).join("")}</tr></thead>
      <tbody><tr>${tGradeCounts.map(g => `<td>${toArabicDigits(g.count)}</td>`).join("")}</tr></tbody>
    </table>
    <div class="legend">
      90-100 A+ (ممتاز) · 80-89 A (جيد جداً) · 70-79 B (جيد) · 60-69 C (مقبول) · 50-59 D (ناجح) · 0-49 F (راسب)
    </div>
  </div>
</div>

<div class="comments-grid">
  <div class="comment-box">
    <div class="comment-label">تعليق المعلم(ة) / Teacher's Comment</div>
    <div class="comment-text">${remarks.teacher}</div>
  </div>
  <div class="comment-box">
    <div class="comment-label">تعليق المدير / Director's Comment</div>
    <div class="comment-text">${remarks.director}</div>
  </div>
</div>

<div class="stamp-center">
  <img src="${stampSrc}" alt="Official Stamp" />
  <span>تاريخ الإصدار: ${new Date().toLocaleDateString("ar-SA")}</span>
</div>
<div class="footer">Official Term Report Card — Tahleem Academy — ${new Date().toLocaleDateString("en-GB")} — Confidential</div>
</div>
</div>`;
  };

  const downloadPDF = async (mode: "current" | "all" = "current") => {
    const toBase64 = (src: string) => new Promise<string>(resolve => {
      const img = new Image(); img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        c.getContext("2d")!.drawImage(img, 0, 0);
        resolve(c.toDataURL("image/png"));
      };
      img.src = src;
    });
    const [stampBase64, logoBase64] = await Promise.all([
      toBase64(tahleemStamp),
      toBase64(tahleemHeaderArt),
    ]);

    const pw = window.open("", "_blank");
    if (!pw) { toast({ title: t("Allow popups to download PDF", "السماح بالنوافذ المنبثقة"), variant: "destructive" }); return; }

    const termKeys = mode === "all" ? populatedTerms.map(tm => tm.key) : [term];
    const pagesHtml = termKeys.map(k => buildTermPage(k, stampBase64, logoBase64)).join("");

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"><title>كشف الدرجات — ${profile?.full_name || ""}</title>
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Aref+Ruqaa:wght@400;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
body{font-family:'Amiri',serif;color:#1a1a1a;background:#fdfcf8;font-size:12.5px;font-weight:600}
.page{padding:0 0 18px;position:relative;page-break-after:always;background:#fdfcf8}
.page:last-child{page-break-after:auto}
.watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);
  font-size:60px;font-weight:900;color:rgba(15,45,31,.05);z-index:0;white-space:nowrap;font-family:Arial}
.header-bar{display:flex;justify-content:space-between;align-items:center;direction:ltr;gap:14px;padding:14px 26px;border-bottom:2px solid #0f2d1f;position:relative;z-index:1;overflow:hidden}
.header-title{direction:rtl;text-align:right}
.header-title .header-ar{font-family:'Aref Ruqaa',serif;font-weight:700;font-size:26px;color:#0f2d1f;line-height:1.3;white-space:nowrap}
.header-title .header-en{font-weight:700;font-size:12px;color:#8a7434;letter-spacing:2px;text-transform:uppercase;margin-top:3px;white-space:nowrap}
.header-logo-wrap{display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0}
.header-logo-right{height:88px;width:auto;flex-shrink:0}
.header-logo-caption{font-weight:700;font-size:11px;color:#8a7434;letter-spacing:1.5px;white-space:nowrap}
.page-inner{padding:0 24px;position:relative;z-index:1}
.info-box{border:1px solid #d9dfd9;border-radius:8px;padding:8px 20px;margin:14px 0 16px;background:#fffdf7}
.info-row{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;padding:7px 0}
.info-row + .info-row{border-top:1px dashed #e3ddc8}
.info-field{display:flex;align-items:baseline;gap:5px}
.info-field label{font-weight:800;font-size:12.5px;white-space:nowrap;color:#0f2d1f}
.info-field label::after{content:":"}
.info-field .val{font-size:13px;font-weight:700;color:#1a1a1a}
table.main{width:100%;border-collapse:collapse;margin:16px 0 8px;box-shadow:0 1px 6px rgba(0,0,0,.06)}
table.main th,table.main td{border:1px solid #d9dfd9;padding:8px 8px;text-align:center;font-size:12.5px;font-weight:700;vertical-align:middle}
table.main th{background:#0f2d1f;color:#f5e9c8;font-weight:800;border-color:#0f2d1f;font-size:12px}
table.main tbody tr:nth-child(even){background:#f7faf7}
.subject-cell{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.subject-cell .subject-ar{font-family:'Amiri',serif;font-weight:800;font-size:14px;color:#0f2d1f;text-align:right}
.subject-cell .subject-en{font-size:10px;color:#6b7280;font-weight:600;direction:ltr;text-align:left;white-space:nowrap}
.summary-grid{display:grid;grid-template-columns:1fr 1.3fr;gap:14px;margin-top:14px;align-items:stretch}
table.small{width:100%;border-collapse:collapse}
table.small th,table.small td{border:1px solid #d9dfd9;padding:6px 8px;text-align:center;font-size:11.5px;font-weight:700}
table.small th{background:#0f2d1f;color:#f5e9c8;font-weight:800;border-color:#0f2d1f}
.grade-box{border:1px solid #d9dfd9;border-radius:8px;overflow:hidden;background:#fffdf7}
.grade-box-title{background:#0f2d1f;color:#f5e9c8;font-weight:800;font-size:11px;padding:6px 10px;text-align:center}
table.grade-table{width:100%;border-collapse:collapse;margin-top:0}
table.grade-table th,table.grade-table td{border:1px solid #d9dfd9;padding:5px 4px;text-align:center}
table.grade-table th{background:#0f2d1f;color:#f5e9c8;font-weight:800;font-size:12px;border-color:#0f2d1f}
table.grade-table td{font-weight:800;font-size:13px;color:#0f2d1f}
.legend{font-size:9.5px;color:#6b7280;padding:8px 10px 10px;line-height:1.7;text-align:center;font-weight:600}
.comments-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}
.comment-box{border:1.5px solid #c9a84c;border-radius:10px;overflow:hidden;background:linear-gradient(180deg,#fffdf7,#fff)}
.comment-label{background:#0f2d1f;color:#f5e9c8;font-weight:800;font-size:11.5px;padding:7px 14px;text-align:center}
.comment-text{font-size:12.5px;font-weight:700;line-height:1.9;color:#2b2b2b;padding:10px 14px}
.stamp-center{display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:26px}
.stamp-center img{width:130px;height:auto;opacity:.92}
.stamp-center span{font-size:14px;font-weight:800;color:#0f2d1f;background:#f5e9c8;padding:5px 16px;border-radius:20px;letter-spacing:.3px}
.footer{text-align:center;margin-top:14px;font-size:10px;font-weight:600;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px}
@media print{.page-inner{padding:0 16px}@page{size:A4;margin:8mm}}
${DENSITY_CSS}
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
    <div dir="rtl" style={{ fontFamily: "'Cairo',sans-serif" }}>
      {/* Header bar — title on the left, calligraphy logo (magnified) on the right */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", direction: "ltr", gap: 14, padding: "14px 24px", borderBottom: `2px solid ${G}`, background: "#fdfcf8", overflow: "hidden" }}>
        <div style={{ direction: "rtl", textAlign: "right" }}>
          <div style={{ fontFamily: "'Aref Ruqaa',serif", fontWeight: 700, fontSize: 26, color: G, whiteSpace: "nowrap" }}>كشف الدرجات الفصلي</div>
          <div style={{ fontWeight: 700, fontSize: 12, color: "#8a7434", letterSpacing: 2, textTransform: "uppercase", marginTop: 3, whiteSpace: "nowrap" }}>Term Report Card</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <img src={tahleemHeaderArt} alt="Tahleem Academy" style={{ height: 88, width: "auto", flexShrink: 0 }} />
          <div style={{ fontWeight: 700, fontSize: 11, color: "#8a7434", letterSpacing: 1.5, whiteSpace: "nowrap" }}>TAHLEEM ACADEMY</div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
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
          <div className="bg-white rounded-2xl shadow-sm border p-4 mb-4 grid grid-cols-2 gap-3 text-sm" style={{ borderColor: "#e8ddb8" }}>
            <div><span className="text-muted-foreground font-semibold">اسم الطالب(ة): </span><strong style={{ color: G }}>{profile?.full_name_ar || profile?.full_name || "—"}</strong></div>
            <div><span className="text-muted-foreground font-semibold">المستوى: </span><strong style={{ color: G }}>{levelToArabic(profile?.level)}</strong></div>
            <div><span className="text-muted-foreground font-semibold">الفترة: </span><strong style={{ color: G }}>{termLabel.ar}</strong></div>
            <div><span className="text-muted-foreground font-semibold">العام الدراسي: </span><strong style={{ color: G }}>{currentYear - 579} هـ / {currentYear} م</strong></div>
          </div>

          {/* Subjects table */}
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden mb-4">
            <div style={{ background: `linear-gradient(90deg,${G},${GM})`, color: "#fff", padding: "10px 16px", fontWeight: 800, fontSize: 14, letterSpacing: .5 }}>
              المواد الدراسية
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: G }}>
                    {["#", "المادة", "اختبار (30)", "امتحان (70)", "المجموع", "الدرجة", "النتيجة"].map(h => (
                      <th key={h} style={{ padding: "9px 10px", textAlign: "center", fontSize: 11, fontWeight: 800, color: "#f5e9c8", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const subj = getSubjectDisplay(row);
                    return (
                    <tr key={i} style={{ borderBottom: "1px solid #f0f4f8", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "10px", textAlign: "center", fontSize: 12, color: "#9ca3af", fontWeight: 700 }}>{toArabicDigits(i + 1)}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                          <span style={{ fontWeight: 800, color: G, fontFamily: "'Amiri',serif", fontSize: 15 }}>{subj.ar}</span>
                          <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, direction: "ltr" }}>{subj.en}</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px", textAlign: "center", fontWeight: 700 }}>{row.test ? toArabicDigits(row.test) : "—"}</td>
                      <td style={{ padding: "10px", textAlign: "center", fontWeight: 700 }}>{row.exam ? toArabicDigits(row.exam) : "—"}</td>
                      <td style={{ padding: "10px", textAlign: "center", fontWeight: 900, fontSize: 16, color: row.grade.color }}>{toArabicDigits(row.total)}</td>
                      <td style={{ padding: "10px", textAlign: "center" }}>
                        <span style={{ padding: "3px 10px", borderRadius: 20, background: row.grade.bg, color: row.grade.color, fontWeight: 800, fontSize: 12 }}>{row.grade.letter}</span>
                      </td>
                      <td style={{ padding: "10px", textAlign: "center", fontWeight: 800, color: row.passed ? "#22c55e" : "#ef4444" }}>{row.passed ? "ناجح" : "راسب"}</td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          </div>

          {/* Performance summary + grade distribution */}
          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
              <div style={{ background: G, color: "#f5e9c8", padding: "8px 14px", fontWeight: 800, fontSize: 13, textAlign: "center" }}>ملخص الأداء</div>
              <div className="p-4">
                {[
                  ["المجموع المحقق", toArabicDigits(totalObtained)],
                  ["المجموع الكلي", toArabicDigits(totalObtainable)],
                  ["عدد المواد", toArabicDigits(rows.length)],
                  ["المتوسط", `${toArabicDigits(avgScore.toFixed(1))}%`],
                ].map(([label, val]) => (
                  <div key={label as string} className="flex justify-between text-sm py-1.5 border-b last:border-0">
                    <span className="text-muted-foreground font-semibold">{label}</span><strong style={{ color: G }}>{val}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
              <div style={{ background: G, color: "#f5e9c8", padding: "8px 14px", fontWeight: 800, fontSize: 13, textAlign: "center" }}>توزيع الدرجات</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>{["A+", "A", "B", "C", "D", "F"].map(l => (
                    <th key={l} style={{ border: "1px solid #e5e7eb", padding: "5px", fontSize: 12, background: "#f7faf7", color: G, fontWeight: 800 }}>{l}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  <tr>{gradeCounts.map(g => (
                    <td key={g.letter} style={{ border: "1px solid #e5e7eb", padding: "6px", textAlign: "center", fontWeight: 800, color: G }}>{toArabicDigits(g.count)}</td>
                  ))}</tr>
                </tbody>
              </table>
              <div className="text-[10px] text-muted-foreground p-3 leading-relaxed text-center">
                90-100 A+ (ممتاز) · 80-89 A (جيد جداً) · 70-79 B (جيد) · 60-69 C (مقبول) · 50-59 D (ناجح) · 0-49 F (راسب)
              </div>
            </div>
          </div>

          {/* Auto-generated teacher / director comments */}
          <div className="grid gap-4 md:grid-cols-2 mb-4">
            {(() => {
              const remarks = generateRemarks(avgScore, rows.filter(r => r.passed).length, rows.length);
              return (
                <>
                  <div className="rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${GOLD}`, background: "linear-gradient(180deg,#fffdf7,#fff)" }}>
                    <div className="font-bold text-xs text-center" style={{ color: "#f5e9c8", background: G, padding: "7px 14px" }}>تعليق المعلم(ة)</div>
                    <p className="text-sm font-semibold leading-relaxed p-4" style={{ color: "#2b2b2b" }}>{remarks.teacher}</p>
                  </div>
                  <div className="rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${GOLD}`, background: "linear-gradient(180deg,#fffdf7,#fff)" }}>
                    <div className="font-bold text-xs text-center" style={{ color: "#f5e9c8", background: G, padding: "7px 14px" }}>تعليق المدير</div>
                    <p className="text-sm font-semibold leading-relaxed p-4" style={{ color: "#2b2b2b" }}>{remarks.director}</p>
                  </div>
                </>
              );
            })()}
          </div>
        </>
      )}
      </div>
    </div>
  );
};

export default ReportCard;
