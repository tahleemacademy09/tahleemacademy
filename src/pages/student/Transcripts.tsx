import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Download, GraduationCap, Eye } from "lucide-react";
import tahleemStamp from "@/assets/tahleem-stamp.png";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

interface GradedExam {
  exam_id: string;
  title: string;
  title_ar: string | null;
  score: number;
  total_points: number;
  percentage: number;
  passed: boolean;
  submitted_at: string;
  course_title?: string;
}

const gradePoint = (pct: number): number => {
  if (pct >= 85) return 4.0;
  if (pct >= 75) return 3.5;
  if (pct >= 65) return 3.0;
  if (pct >= 55) return 2.0;
  if (pct >= 45) return 1.0;
  return 0.0;
};

const gradeLabel = (gp: number): string => {
  if (gp >= 4.0) return "ممتاز";
  if (gp >= 3.5) return "جيد جداً";
  if (gp >= 3.0) return "جيد";
  if (gp >= 2.0) return "مقبول";
  if (gp >= 1.0) return "ناجح";
  return "راسب";
};

const gradeLabelEn = (gp: number): string => {
  if (gp >= 4.0) return "Excellent";
  if (gp >= 3.5) return "Very Good";
  if (gp >= 3.0) return "Good";
  if (gp >= 2.0) return "Satisfactory";
  if (gp >= 1.0) return "Pass";
  return "Fail";
};

const toArabicNum = (n: number | string): string => {
  return String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
};

const Transcripts = () => {
  const { t, language } = useLanguage();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [exams, setExams] = useState<GradedExam[]>([]);
  const [loading, setLoading] = useState(true);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("exam_attempts")
        .select("exam_id, score, total_points, percentage, passed, submitted_at, exams(title, title_ar, course_id, courses(title))")
        .eq("user_id", user.id)
        .eq("status", "graded")
        .order("submitted_at", { ascending: true });

      const mapped = (data || []).map((a: any) => ({
        exam_id: a.exam_id,
        title: a.exams?.title || "Exam",
        title_ar: a.exams?.title_ar,
        score: Number(a.score) || 0,
        total_points: Number(a.total_points) || 0,
        percentage: Number(a.percentage) || 0,
        passed: a.passed,
        submitted_at: a.submitted_at,
        course_title: a.exams?.courses?.title,
      }));
      setExams(mapped);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const totalGP = exams.reduce((sum, e) => sum + gradePoint(e.percentage), 0);
  const cgpa = exams.length > 0 ? totalGP / exams.length : 0;

  const status = cgpa >= 3.5 ? "Good Standing" : cgpa >= 2.0 ? "Probation Warning" : cgpa > 0 ? "Academic Probation" : "No Data";
  const statusAr = cgpa >= 3.5 ? "وضع جيد" : cgpa >= 2.0 ? "تحذير أكاديمي" : cgpa > 0 ? "إنذار أكاديمي" : "لا توجد بيانات";
  const statusColor = cgpa >= 3.5 ? "default" : cgpa >= 2.0 ? "secondary" : "destructive";

  // Split exams into 2 semesters
  const mid = Math.ceil(exams.length / 2);
  const sem1 = exams.slice(0, mid);
  const sem2 = exams.slice(mid);
  const sem1GP = sem1.length > 0 ? sem1.reduce((s, e) => s + gradePoint(e.percentage), 0) / sem1.length : 0;
  const sem2GP = sem2.length > 0 ? sem2.reduce((s, e) => s + gradePoint(e.percentage), 0) / sem2.length : 0;

  const currentYear = new Date().getFullYear();
  const hijriYear = currentYear - 579;

  const downloadPDF = () => {
    // Use browser print to generate PDF — this ensures Arabic renders correctly
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({ title: t("Please allow popups to download PDF", "يرجى السماح بالنوافذ المنبثقة لتحميل PDF"), variant: "destructive" });
      return;
    }

    const totalObtainable = exams.length * 100;
    const totalObtained = exams.reduce((s, e) => s + Math.round(e.percentage), 0);
    const levelText = profile?.level === "beginner" ? "المبتدئة / Beginner" : profile?.level === "intermediate" ? "المتوسطة / Intermediate" : profile?.level || "---";
    const statusText = cgpa >= 2.0 ? "منتظمة / Regular" : "تحت المراقبة / Probation";
    const commentText = exams.length > 0 ? (cgpa >= 3.5 ? "طالب(ة) متميز(ة) / Outstanding" : cgpa >= 2.0 ? "طالب(ة) مجتهد(ة) / Hardworking" : "يحتاج تحسين / Needs improvement") : "";

    const examRows = exams.map((e) => {
      const cw = Math.round(e.percentage * 0.3);
      const fe = Math.round(e.percentage * 0.7);
      const total = cw + fe;
      const gp = gradePoint(e.percentage);
      const result = e.passed ? "Pass ✓" : "Fail ✗";
      const resultColor = e.passed ? "#2a7a2a" : "#c0392b";
      return `<tr>
        <td>${e.title_ar || e.title}</td>
        <td>${cw}</td><td>${fe}</td><td style="font-weight:700">${total}</td>
        <td>${total}%</td><td>${gp.toFixed(1)}</td>
        <td style="color:${resultColor};font-weight:700">${result}</td>
      </tr>`;
    }).join("");

    const emptyRows = Array.from({ length: Math.max(0, 10 - exams.length) })
      .map(() => `<tr>${"<td>&nbsp;</td>".repeat(7)}</tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>Transcript - ${profile?.full_name || "Student"}</title>
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Cairo','Amiri',sans-serif;background:#fff;padding:30px 40px}
.header{text-align:center;margin-bottom:14px}
.header .ar{font-family:'Amiri',serif;font-size:24px;font-weight:700}
.header .en{font-size:16px;font-weight:700;letter-spacing:3px}
.title-box{border:2px solid #2a7a2a;border-radius:4px;padding:6px 20px;margin:14px auto;width:fit-content;display:flex;gap:30px;align-items:center;justify-content:center}
.title-box span{font-size:14px;font-weight:600}
.info-grid{margin:16px 0}
.info-row{display:flex;justify-content:space-between;margin-bottom:8px;gap:24px}
.info-field{display:flex;align-items:baseline;flex:1;gap:4px}
.info-field label{font-weight:700;font-size:13px;white-space:nowrap}
.info-field .val{flex:1;border-bottom:1px solid #333;font-size:12px;text-align:right;padding:0 4px 1px}
.section-title{font-family:'Amiri',serif;font-size:18px;font-weight:700;text-align:left;margin:14px 0 8px}
table.main{width:100%;border-collapse:collapse;direction:rtl;margin-bottom:18px}
table.main th,table.main td{border:1.5px solid #333;padding:4px 5px;text-align:center;font-size:11px;vertical-align:middle}
table.main th .ar{display:block;font-family:'Amiri',serif;font-size:12px;font-weight:700}
table.main th .en{display:block;font-size:10px;font-weight:700}
table.main td{height:26px}
table.summary{width:100%;border-collapse:collapse;direction:ltr;margin-top:14px}
table.summary td{border:1.5px solid #333;padding:5px 8px;font-size:12px}
table.summary td.lbl{font-weight:700;width:18%}
@media print{body{padding:15px 20px}@page{size:A4;margin:8mm}}
</style>
</head>
<body>
<div class="header">
  <div class="ar">أكاديمية التعليم</div>
  <div class="en">TAHLEEM ACADEMY</div>
</div>
<div class="title-box">
  <span>كشف نتائج الطلبة</span>
  <span>Student Report Sheet.</span>
</div>
<div class="info-grid">
  <div class="info-row">
    <div class="info-field"><label>اسم الطالب(ة)</label><span class="val">${profile?.full_name || "---"}</span></div>
    <div class="info-field"><label>العام الدراسي</label><span class="val">${hijriYear} هـ / ${currentYear} م</span></div>
  </div>
  <div class="info-row">
    <div class="info-field"><label>المرحلة</label><span class="val">${levelText}</span></div>
    <div class="info-field"><label>عدد المواد</label><span class="val">${exams.length}</span></div>
  </div>
  <div class="info-row">
    <div class="info-field"><label>التاريخ</label><span class="val">${new Date().toLocaleDateString("ar-SA")}</span></div>
    <div class="info-field"><label>الحالة</label><span class="val">${statusText}</span></div>
  </div>
</div>
<div class="section-title">الفترة الأولى</div>
<table class="main">
  <thead><tr>
    <th><span class="ar">المواد</span><span class="en">Subject</span></th>
    <th><span class="ar">التمرينات (٣٠)</span><span class="en">Test</span></th>
    <th><span class="ar">الإمتحانات (٧٠)</span><span class="en">Exam</span></th>
    <th><span class="ar">المجموع الكلي (١٠٠)</span><span class="en">Total</span></th>
    <th><span class="ar">%</span><span class="en">%</span></th>
    <th><span class="ar">GP</span><span class="en">GP</span></th>
    <th><span class="ar">النتيجة</span><span class="en">Result</span></th>
  </tr></thead>
  <tbody>${examRows}${emptyRows}</tbody>
</table>
<table class="summary">
  <tr><td class="lbl">Marks Obtainable</td><td style="text-align:center">${totalObtainable || ""}</td><td class="lbl">Marks Obtained</td><td style="text-align:center">${totalObtained || ""}</td></tr>
  <tr><td class="lbl">Cgpa</td><td style="text-align:center">${exams.length > 0 ? cgpa.toFixed(2) : ""}</td><td class="lbl">Status</td><td style="text-align:center">${exams.length > 0 ? (cgpa >= 1.0 ? "Pass ✓" : "Fail ✗") : ""}</td></tr>
  <tr><td class="lbl">Comment</td><td style="text-align:center">${commentText}</td><td class="lbl">Signature</td><td style="text-align:center"></td></tr>
</table>
<script>
  window.onload = function() {
    setTimeout(function() { window.print(); }, 500);
  };
</script>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    toast({ title: t("Print dialog opened — save as PDF", "تم فتح نافذة الطباعة — احفظ كـ PDF") });
  };

  // CGPA gauge
  const gaugePercent = (cgpa / 4.0) * 100;
  const circumference = 2 * Math.PI * 60;
  const strokeDashoffset = circumference - (gaugePercent / 100) * circumference;

  // Transcript preview component
  const TranscriptPreview = () => {
    const totalObtainable = exams.length * 100;
    const totalObtained = exams.reduce((s, e) => s + Math.round(e.percentage), 0);

    return (
      <div ref={transcriptRef} className="bg-white p-8 md:p-10 min-h-[800px] relative overflow-hidden" dir="rtl" style={{ fontFamily: "'Cairo', 'Amiri', sans-serif" }}>
        {/* Watermark background */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" style={{ opacity: 0.04, transform: 'rotate(-30deg)' }}>
          <span className="text-[120px] font-bold whitespace-nowrap tracking-widest" style={{ fontFamily: "'Cairo', sans-serif", color: '#064E3B' }}>TAHLEEM ACADEMY</span>
        </div>
        {/* Header */}
        <div className="text-center mb-4">
          <h2 className="text-2xl font-bold" style={{ fontFamily: "'Amiri', serif" }}>أكاديمية التعليم</h2>
          <p className="text-lg font-bold tracking-widest">TAHLEEM ACADEMY</p>
        </div>

        {/* Title box */}
        <div className="border-2 border-[#2a7a2a] rounded px-6 py-2 mx-auto w-fit flex gap-10 items-center justify-center mb-5">
          <span className="text-base font-semibold">كشف نتائج الطلبة</span>
          <span className="text-base font-semibold">Student Report Sheet.</span>
        </div>

        {/* Info grid */}
        <div className="mb-5 space-y-2">
          <div className="flex justify-between gap-8">
            <div className="flex items-baseline gap-1 flex-1">
              <span className="font-bold text-sm whitespace-nowrap">اسم الطالب(ة)</span>
              <span className="flex-1 border-b border-black text-sm text-center">{profile?.full_name || "---"}</span>
            </div>
            <div className="flex items-baseline gap-1 flex-1">
              <span className="font-bold text-sm whitespace-nowrap">العام الدراسي</span>
              <span className="flex-1 border-b border-black text-sm text-center">{toArabicNum(hijriYear)} هـ / {toArabicNum(currentYear)} م</span>
            </div>
          </div>
          <div className="flex justify-between gap-8">
            <div className="flex items-baseline gap-1 flex-1">
              <span className="font-bold text-sm whitespace-nowrap">المرحلة</span>
              <span className="flex-1 border-b border-black text-sm text-center">{profile?.level === "beginner" ? "المبتدئة / Beginner" : profile?.level === "intermediate" ? "المتوسطة / Intermediate" : profile?.level || "---"}</span>
            </div>
            <div className="flex items-baseline gap-1 flex-1">
              <span className="font-bold text-sm whitespace-nowrap">عدد المواد</span>
              <span className="flex-1 border-b border-black text-sm text-center">{toArabicNum(exams.length)}</span>
            </div>
          </div>
          <div className="flex justify-between gap-8">
            <div className="flex items-baseline gap-1 flex-1">
              <span className="font-bold text-sm whitespace-nowrap">التاريخ</span>
              <span className="flex-1 border-b border-black text-sm text-center">{new Date().toLocaleDateString("ar-SA")}</span>
            </div>
            <div className="flex items-baseline gap-1 flex-1">
              <span className="font-bold text-sm whitespace-nowrap">الحالة</span>
              <span className="flex-1 border-b border-black text-sm text-center">{cgpa >= 2.0 ? "منتظمة / Regular" : "تحت المراقبة / Probation"}</span>
            </div>
          </div>
        </div>

        {/* Section title */}
        <h4 className="text-xl font-bold text-left mb-3" style={{ fontFamily: "'Amiri', serif" }}>الفترة الأولى</h4>

        {/* Main table */}
        <table className="w-full border-collapse mb-6" dir="rtl" style={{ borderColor: "#333" }}>
          <thead>
            <tr>
              <th className="border-[1.5px] border-[#333] p-1 text-center text-sm">
                <span className="block" style={{ fontFamily: "'Amiri', serif", fontWeight: 700 }}>المواد</span>
                <span className="block text-xs font-bold">Subject</span>
              </th>
              <th className="border-[1.5px] border-[#333] p-1 text-center text-sm">
                <span className="block" style={{ fontFamily: "'Amiri', serif", fontWeight: 700 }}>التمرينات (٣٠)</span>
                <span className="block text-xs font-bold">Test</span>
              </th>
              <th className="border-[1.5px] border-[#333] p-1 text-center text-sm">
                <span className="block" style={{ fontFamily: "'Amiri', serif", fontWeight: 700 }}>الإمتحانات (٧٠)</span>
                <span className="block text-xs font-bold">Exam</span>
              </th>
              <th className="border-[1.5px] border-[#333] p-1 text-center text-sm">
                <span className="block" style={{ fontFamily: "'Amiri', serif", fontWeight: 700 }}>المجموع الكلي (١٠٠)</span>
                <span className="block text-xs font-bold">Total</span>
              </th>
              <th className="border-[1.5px] border-[#333] p-1 text-center text-sm">
                <span className="block" style={{ fontFamily: "'Amiri', serif", fontWeight: 700 }}>%</span>
                <span className="block text-xs font-bold">%</span>
              </th>
              <th className="border-[1.5px] border-[#333] p-1 text-center text-sm">
                <span className="block" style={{ fontFamily: "'Amiri', serif", fontWeight: 700 }}>GP</span>
                <span className="block text-xs font-bold">GP</span>
              </th>
              <th className="border-[1.5px] border-[#333] p-1 text-center text-sm">
                <span className="block" style={{ fontFamily: "'Amiri', serif", fontWeight: 700 }}>النتيجة</span>
                <span className="block text-xs font-bold">Result</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {exams.map((e) => {
              const coursework = Math.round(e.percentage * 0.3);
              const finalExam = Math.round(e.percentage * 0.7);
              const total = coursework + finalExam;
              const gp = gradePoint(e.percentage);
              return (
                <tr key={e.exam_id + e.submitted_at}>
                  <td className="border-[1.5px] border-[#333] p-1 text-center text-sm">{e.title_ar || e.title}</td>
                  <td className="border-[1.5px] border-[#333] p-1 text-center text-sm">{coursework}</td>
                  <td className="border-[1.5px] border-[#333] p-1 text-center text-sm">{finalExam}</td>
                  <td className="border-[1.5px] border-[#333] p-1 text-center text-sm font-bold">{total}</td>
                  <td className="border-[1.5px] border-[#333] p-1 text-center text-sm">{total}%</td>
                  <td className="border-[1.5px] border-[#333] p-1 text-center text-sm">{gp.toFixed(1)}</td>
                  <td className={`border-[1.5px] border-[#333] p-1 text-center text-sm font-bold ${e.passed ? "text-[#2a7a2a]" : "text-destructive"}`}>
                    {e.passed ? "Pass ✓" : "Fail ✗"}
                  </td>
                </tr>
              );
            })}
            {/* Fill empty rows to make at least 10 */}
            {Array.from({ length: Math.max(0, 10 - exams.length) }).map((_, i) => (
              <tr key={`empty-${i}`}>
                {Array.from({ length: 7 }).map((_, j) => (
                  <td key={j} className="border-[1.5px] border-[#333] p-1 h-8" />
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary table */}
        <table className="w-full border-collapse" dir="ltr">
          <tbody>
            <tr>
              <td className="border-[1.5px] border-[#333] p-2 font-bold text-sm w-[18%]">Marks Obtainable</td>
              <td className="border-[1.5px] border-[#333] p-2 text-sm text-center">{totalObtainable || ""}</td>
              <td className="border-[1.5px] border-[#333] p-2 font-bold text-sm w-[18%]">Marks Obtained</td>
              <td className="border-[1.5px] border-[#333] p-2 text-sm text-center">{totalObtained || ""}</td>
            </tr>
            <tr>
              <td className="border-[1.5px] border-[#333] p-2 font-bold text-sm">Cgpa</td>
              <td className="border-[1.5px] border-[#333] p-2 text-sm text-center">{exams.length > 0 ? cgpa.toFixed(2) : ""}</td>
              <td className="border-[1.5px] border-[#333] p-2 font-bold text-sm">Status</td>
              <td className="border-[1.5px] border-[#333] p-2 text-sm text-center">{exams.length > 0 ? (cgpa >= 1.0 ? "Pass ✓" : "Fail ✗") : ""}</td>
            </tr>
            <tr>
              <td className="border-[1.5px] border-[#333] p-2 font-bold text-sm">Comment</td>
              <td className="border-[1.5px] border-[#333] p-2 text-sm text-center">
                {exams.length > 0 ? (cgpa >= 3.5 ? "طالب(ة) متميز(ة) / Outstanding" : cgpa >= 2.0 ? "طالب(ة) مجتهد(ة) / Hardworking" : "يحتاج تحسين / Needs improvement") : ""}
              </td>
              <td className="border-[1.5px] border-[#333] p-2 font-bold text-sm">Signature</td>
              <td className="border-[1.5px] border-[#333] p-2 text-sm text-center"></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{t("Academic Transcript", "السجل الأكاديمي")}</h1>
          <p className="text-muted-foreground">{t("Your complete academic record", "سجلك الأكاديمي الكامل")}</p>
        </div>
        <div className="flex gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={exams.length === 0}>
                <Eye className="mr-2 h-4 w-4" />
                {t("Preview", "معاينة")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto p-0">
              <TranscriptPreview />
            </DialogContent>
          </Dialog>
          <Button onClick={downloadPDF} disabled={exams.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            {t("Download PDF", "تحميل PDF")}
          </Button>
        </div>
      </div>

      {/* CGPA Gauge + Status */}
      <div className="mb-8 grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 flex flex-col items-center justify-center p-6">
          <div className="relative">
            <svg width="140" height="140" className="-rotate-90">
              <circle cx="70" cy="70" r="60" stroke="hsl(var(--muted))" strokeWidth="10" fill="none" />
              <circle cx="70" cy="70" r="60" stroke="hsl(var(--primary))" strokeWidth="10" fill="none" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className="transition-all duration-1000" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold">{cgpa.toFixed(2)}</span>
              <span className="text-xs text-muted-foreground">/4.00</span>
            </div>
          </div>
          <div className="mt-3 text-center">
            <p className="font-semibold">{t("CGPA", "المعدل التراكمي")}</p>
            <Badge variant={statusColor as any} className="mt-1">
              {language === "ar" ? statusAr : status}
            </Badge>
          </div>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              {t("Grade Summary", "ملخص الدرجات")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{exams.length}</div>
                <div className="text-xs text-muted-foreground">{t("Exams Graded", "امتحانات مصححة")}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{exams.filter(e => e.passed).length}</div>
                <div className="text-xs text-muted-foreground">{t("Passed", "ناجح")}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-destructive">{exams.filter(e => !e.passed).length}</div>
                <div className="text-xs text-muted-foreground">{t("Failed", "راسب")}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {exams.length > 0 ? (exams.reduce((s, e) => s + e.percentage, 0) / exams.length).toFixed(1) : 0}%
                </div>
                <div className="text-xs text-muted-foreground">{t("Average", "المعدل")}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Islamic Transcript Preview Card */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("Islamic Academic Result Sheet", "صحيفة النتائج الأكاديمية")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <TranscriptPreview />
        </CardContent>
      </Card>
    </div>
  );
};

export default Transcripts;
