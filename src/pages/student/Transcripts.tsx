import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Download, GraduationCap, Eye } from "lucide-react";
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

  const downloadPDF = async () => {
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      // Load Amiri font for Arabic support
      const fontUrl = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/amiri/Amiri-Regular.ttf";
      try {
        const response = await fetch(fontUrl);
        const buffer = await response.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        doc.addFileToVFS("Amiri-Regular.ttf", base64);
        doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
        doc.setFont("Amiri");
      } catch {
        toast({ title: t("Warning: Arabic font could not be loaded.", "تحذير: تعذر تحميل الخط العربي."), variant: "destructive" });
        doc.setFont("helvetica");
      }

      const pw = 210;
      const m = 20;
      const cw = pw - m * 2;
      let y = 20;

      // Header
      doc.setFontSize(20);
      doc.setTextColor(0, 0, 0);
      doc.text("أكاديمية التعليم", pw / 2, y, { align: "center" });
      y += 8;
      doc.setFontSize(14);
      doc.text("TAHLEEM ACADEMY", pw / 2, y, { align: "center" });
      y += 10;

      // Title box
      doc.setDrawColor(42, 122, 42);
      doc.setLineWidth(0.6);
      doc.rect(pw / 2 - 45, y - 5, 90, 12);
      doc.setFontSize(11);
      doc.text("كشف نتائج الطلبة", pw / 2 + 20, y + 2, { align: "center" });
      doc.text("Student Report Sheet.", pw / 2 - 20, y + 2, { align: "center" });
      y += 14;

      // Info fields
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      const infoR = pw - m;
      const drawInfoLine = (labelAr: string, value: string, x: number, yy: number) => {
        doc.text(labelAr, x, yy, { align: "right" });
        const labelW = doc.getTextWidth(labelAr);
        const lineStart = x - labelW - 2;
        doc.text(value, lineStart - 2, yy, { align: "right" });
        doc.setDrawColor(0);
        doc.setLineWidth(0.3);
        doc.line(lineStart - 60, yy + 1, lineStart - 1, yy + 1);
      };

      drawInfoLine("اسم الطالب(ة)", profile?.full_name || "---", infoR, y);
      drawInfoLine("العام الدراسي", `${hijriYear} هـ / ${currentYear} م`, pw / 2 - 5, y);
      y += 7;
      const levelText = profile?.level === "beginner" ? "المبتدئة" : profile?.level === "intermediate" ? "المتوسطة" : profile?.level || "---";
      drawInfoLine("المرحلة", levelText, infoR, y);
      drawInfoLine("عدد المواد", String(exams.length), pw / 2 - 5, y);
      y += 7;
      drawInfoLine("التاريخ", new Date().toLocaleDateString("ar-SA"), infoR, y);
      drawInfoLine("الحالة", cgpa >= 2.0 ? "منتظمة" : "تحت المراقبة", pw / 2 - 5, y);
      y += 12;

      // Section title
      doc.setFontSize(14);
      doc.text("الفترة الأولى", m + 5, y, { align: "left" });
      y += 8;

      // Table
      const colWidths = [45, 22, 22, 22, 16, 16, 22];
      const totalW = colWidths.reduce((a, b) => a + b, 0);
      const tableX = pw - m; // RTL start from right

      // Header row
      const headers = [
        ["المواد", "Subject"],
        ["التمرينات (٣٠)", "Test"],
        ["الإمتحانات (٧٠)", "Exam"],
        ["المجموع الكلي (١٠٠)", "Total"],
        ["%", "%"],
        ["GP", "GP"],
        ["النتيجة", "Result"],
      ];

      const rowH = 10;
      let cx = tableX;
      doc.setFontSize(7);
      doc.setDrawColor(51, 51, 51);
      doc.setLineWidth(0.4);

      // Draw header cells
      headers.forEach((h, i) => {
        const w = colWidths[i];
        doc.rect(cx - w, y, w, rowH);
        doc.text(h[0], cx - w / 2, y + 4, { align: "center" });
        doc.text(h[1], cx - w / 2, y + 8, { align: "center" });
        cx -= w;
      });
      y += rowH;

      // Data rows
      const dataRowH = 8;
      const rows = Math.max(10, exams.length);
      for (let i = 0; i < rows; i++) {
        cx = tableX;
        const e = exams[i];
        const coursework = e ? Math.round(e.percentage * 0.3) : "";
        const finalExam = e ? Math.round(e.percentage * 0.7) : "";
        const total = e ? Number(coursework) + Number(finalExam) : "";
        const gp = e ? gradePoint(e.percentage).toFixed(1) : "";
        const result = e ? (e.passed ? "Pass ✓" : "Fail ✗") : "";
        const pct = e ? `${total}%` : "";
        const subject = e ? (e.title_ar || e.title) : "";
        const vals = [subject, String(coursework), String(finalExam), String(total), pct, gp, result];

        vals.forEach((v, j) => {
          const w = colWidths[j];
          doc.rect(cx - w, y, w, dataRowH);
          if (v) {
            doc.setFontSize(7);
            if (j === 6 && e) {
              doc.setTextColor(e.passed ? 42 : 192, e.passed ? 122 : 57, e.passed ? 42 : 43);
            } else {
              doc.setTextColor(0, 0, 0);
            }
            doc.text(v, cx - w / 2, y + 5.5, { align: "center" });
          }
          cx -= w;
        });
        y += dataRowH;
      }
      doc.setTextColor(0, 0, 0);
      y += 6;

      // Summary table
      const totalObtainable = exams.length * 100;
      const totalObtained = exams.reduce((s, e) => s + Math.round(e.percentage), 0);
      const summaryRows = [
        ["Marks Obtainable", String(totalObtainable || ""), "Marks Obtained", String(totalObtained || "")],
        ["Cgpa", exams.length > 0 ? cgpa.toFixed(2) : "", "Status", exams.length > 0 ? (cgpa >= 1.0 ? "Pass ✓" : "Fail ✗") : ""],
        ["Comment", exams.length > 0 ? (cgpa >= 3.5 ? "Outstanding" : cgpa >= 2.0 ? "Hardworking" : "Needs improvement") : "", "Signature", ""],
      ];

      const sColW = cw / 4;
      doc.setFontSize(9);
      summaryRows.forEach((row) => {
        let sx = m;
        row.forEach((cell, ci) => {
          doc.rect(sx, y, sColW, 8);
          if (ci % 2 === 0) {
            doc.setFont("Amiri", "normal");
            doc.text(cell, sx + 3, y + 5.5);
          } else {
            doc.text(cell, sx + sColW / 2, y + 5.5, { align: "center" });
          }
          sx += sColW;
        });
        y += 8;
      });

      doc.save(`Transcript-${profile?.full_name || "student"}.pdf`);
      toast({ title: t("PDF downloaded successfully", "تم تحميل الملف بنجاح") });
    } catch (err: any) {
      toast({ title: t("Error generating PDF", "خطأ في إنشاء الملف"), description: err.message, variant: "destructive" });
    }
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
      <div ref={transcriptRef} className="bg-white p-8 md:p-10 min-h-[800px]" dir="rtl" style={{ fontFamily: "'Cairo', 'Amiri', sans-serif" }}>
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
