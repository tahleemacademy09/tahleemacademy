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
        toast({ title: t("Warning: Arabic font could not be loaded. Using fallback.", "تحذير: تعذر تحميل الخط العربي. سيتم استخدام خط بديل."), variant: "destructive" });
        doc.setFont("helvetica");
      }

      const pageWidth = 210;
      const margin = 15;
      let y = 15;

      // Background color
      doc.setFillColor(250, 250, 248);
      doc.rect(0, 0, pageWidth, 297, "F");

      // Header
      doc.setFontSize(12);
      doc.setTextColor(6, 78, 59);
      doc.text("بسم الله الرحمن الرحيم", pageWidth / 2, y, { align: "center" });
      y += 10;

      doc.setFontSize(16);
      doc.text("أكاديمية التعليم", pageWidth / 2, y, { align: "center" });
      y += 6;
      doc.setFontSize(11);
      doc.text("TAHLEEM ACADEMY", pageWidth / 2, y, { align: "center" });
      y += 8;

      // Gold line
      doc.setDrawColor(212, 175, 55);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      y += 6;

      doc.setFontSize(14);
      doc.text("صحيفة النتائج الأكاديمية", pageWidth / 2, y, { align: "center" });
      y += 5;
      doc.setFontSize(10);
      doc.text("(لفصلين دراسيين)", pageWidth / 2, y, { align: "center" });
      y += 10;

      // Student info grid
      doc.setFontSize(10);
      doc.setTextColor(30, 30, 30);
      const infoX = pageWidth - margin;
      doc.text(`اسم الطالب / الطالبة: ${profile?.full_name || "---"}`, infoX, y, { align: "right" });
      doc.text(`العام الدراسي: ${hijriYear} هـ / ${currentYear} م`, margin + 80, y);
      y += 6;
      doc.text(`المرحلة الدراسية / الصف: ---`, infoX, y, { align: "right" });
      doc.text(`عدد المقررات: ${exams.length}`, margin + 80, y);
      y += 10;

      // Helper to draw semester table
      const drawSemTable = (title: string, data: GradedExam[], startY: number): number => {
        let sy = startY;
        doc.setFontSize(11);
        doc.setTextColor(6, 78, 59);
        doc.text(title, pageWidth / 2, sy, { align: "center" });
        sy += 6;

        // Table header
        const cols = [
          { label: "المادة", x: pageWidth - margin, w: 45 },
          { label: "أعمال السنة (30)", x: pageWidth - margin - 45, w: 25 },
          { label: "الامتحان النهائي (70)", x: pageWidth - margin - 70, w: 25 },
          { label: "المجموع (100)", x: pageWidth - margin - 95, w: 20 },
          { label: "التقدير", x: pageWidth - margin - 115, w: 20 },
          { label: "النقاط (GP)", x: pageWidth - margin - 135, w: 20 },
        ];

        doc.setFillColor(6, 78, 59);
        doc.rect(margin, sy - 4, pageWidth - margin * 2, 7, "F");
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        cols.forEach(c => doc.text(c.label, c.x, sy, { align: "right" }));
        sy += 6;
        doc.setTextColor(30, 30, 30);

        data.forEach((e) => {
          if (sy > 270) { doc.addPage(); sy = 20; }
          const coursework = Math.round(e.percentage * 0.3);
          const finalExam = Math.round(e.percentage * 0.7);
          const gp = gradePoint(e.percentage);
          doc.setFontSize(8);
          doc.text(e.title_ar || e.title, cols[0].x, sy, { align: "right" });
          doc.text(String(coursework), cols[1].x, sy, { align: "right" });
          doc.text(String(finalExam), cols[2].x, sy, { align: "right" });
          doc.text(String(Math.round(e.percentage)), cols[3].x, sy, { align: "right" });
          doc.text(gradeLabel(gp), cols[4].x, sy, { align: "right" });
          doc.text(gp.toFixed(1), cols[5].x, sy, { align: "right" });
          sy += 5;
          doc.setDrawColor(230, 230, 225);
          doc.line(margin, sy - 2, pageWidth - margin, sy - 2);
        });

        if (data.length === 0) {
          doc.setFontSize(9);
          doc.text("لا توجد مقررات", pageWidth / 2, sy, { align: "center" });
          sy += 6;
        }

        return sy;
      };

      y = drawSemTable("الفصل الدراسي الأول", sem1, y);
      y += 4;
      doc.setFontSize(9);
      doc.text(`المعدل الفصلي: ${sem1GP.toFixed(2)}`, pageWidth - margin, y, { align: "right" });
      y += 5;
      doc.text(`ملاحظات: ${sem1GP >= 3.5 ? "ممتاز، واصل تقدمك" : sem1GP >= 2.0 ? "جيد، يمكنك تحسين مستواك" : "يحتاج تحسين"}`, pageWidth - margin, y, { align: "right" });
      y += 10;

      y = drawSemTable("الفصل الدراسي الثاني", sem2, y);
      y += 4;
      doc.setFontSize(9);
      doc.text(`المعدل الفصلي: ${sem2GP.toFixed(2)}`, pageWidth - margin, y, { align: "right" });
      y += 5;
      doc.text(`ملاحظات: ${sem2GP >= 3.5 ? "ممتاز، واصل تقدمك" : sem2GP >= 2.0 ? "جيد، يمكنك تحسين مستواك" : "يحتاج تحسين"}`, pageWidth - margin, y, { align: "right" });
      y += 12;

      // CGPA Section
      doc.setDrawColor(212, 175, 55);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;
      doc.setFontSize(12);
      doc.setTextColor(6, 78, 59);
      doc.text(`المعدل التراكمي العام (CGPA): ${cgpa.toFixed(2)}`, pageWidth / 2, y, { align: "center" });
      y += 7;
      doc.text(`النتيجة النهائية: ${gradeLabel(cgpa)}`, pageWidth / 2, y, { align: "center" });
      y += 14;

      // Signatures
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.text("توقيع رائد الفصل: _______________", pageWidth - margin, y, { align: "right" });
      doc.text("توقيع مدير الأكاديمية (مع الختم): _______________", margin, y);
      y += 14;

      // Closing dua
      doc.setFontSize(11);
      doc.setTextColor(6, 78, 59);
      doc.text("وبالله التوفيق", pageWidth / 2, y, { align: "center" });

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
  const TranscriptPreview = () => (
    <div ref={transcriptRef} className="bg-[#FAFAF8] p-6 md:p-10 font-arabic geometric-pattern min-h-[800px]" dir="rtl" style={{ fontFamily: "'Amiri', serif" }}>
      {/* Header */}
      <div className="text-center mb-6">
        <p className="text-sm text-muted-foreground mb-2">بسم الله الرحمن الرحيم</p>
        <h2 className="text-2xl font-bold" style={{ color: "#064E3B" }}>أكاديمية التعليم</h2>
        <p className="text-sm" style={{ color: "#064E3B" }}>TAHLEEM ACADEMY</p>
        <div className="h-px my-3 mx-auto w-3/4" style={{ background: "linear-gradient(to right, transparent, #D4AF37, transparent)" }} />
        <h3 className="text-lg font-bold" style={{ color: "#064E3B" }}>صحيفة النتائج الأكاديمية</h3>
        <p className="text-xs text-muted-foreground">(لفصلين دراسيين)</p>
      </div>

      {/* Student Info */}
      <div className="grid grid-cols-2 gap-3 mb-6 text-sm border rounded-lg p-4" style={{ borderColor: "#D4AF37" }}>
        <div><span className="font-bold" style={{ color: "#064E3B" }}>اسم الطالب / الطالبة:</span> {profile?.full_name || "---"}</div>
        <div><span className="font-bold" style={{ color: "#064E3B" }}>العام الدراسي:</span> {toArabicNum(hijriYear)} هـ / {toArabicNum(currentYear)} م</div>
        <div><span className="font-bold" style={{ color: "#064E3B" }}>المرحلة الدراسية / الصف:</span> ---</div>
        <div><span className="font-bold" style={{ color: "#064E3B" }}>عدد المقررات:</span> {toArabicNum(exams.length)}</div>
      </div>

      {/* Semester 1 */}
      <SemesterTable title="الفصل الدراسي الأول" data={sem1} gpa={sem1GP} />
      <div className="my-4" />
      {/* Semester 2 */}
      <SemesterTable title="الفصل الدراسي الثاني" data={sem2} gpa={sem2GP} />

      {/* Final Section */}
      <div className="mt-6 p-4 rounded-lg text-center" style={{ backgroundColor: "#064E3B", color: "#FAFAF8" }}>
        <p className="text-lg font-bold">المعدل التراكمي العام (CGPA): {toArabicNum(cgpa.toFixed(2))}</p>
        <p className="text-sm mt-1">النتيجة النهائية: {gradeLabel(cgpa)}</p>
      </div>

      {/* Signatures */}
      <div className="flex justify-between mt-8 text-sm px-4">
        <div className="text-center">
          <div className="border-b border-foreground/30 w-40 mb-1" />
          <p>توقيع رائد الفصل</p>
        </div>
        <div className="text-center">
          <div className="border-b border-foreground/30 w-40 mb-1" />
          <p>توقيع مدير الأكاديمية (مع الختم)</p>
        </div>
      </div>

      {/* Closing */}
      <p className="text-center mt-8 text-sm font-bold" style={{ color: "#064E3B" }}>وبالله التوفيق</p>
    </div>
  );

  const SemesterTable = ({ title, data, gpa }: { title: string; data: GradedExam[]; gpa: number }) => (
    <div>
      <h4 className="text-base font-bold mb-2" style={{ color: "#064E3B" }}>{title}</h4>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr style={{ backgroundColor: "#064E3B", color: "#FAFAF8" }}>
            <th className="p-2 text-right">المادة</th>
            <th className="p-2 text-center">أعمال السنة (30)</th>
            <th className="p-2 text-center">الامتحان النهائي (70)</th>
            <th className="p-2 text-center">المجموع (100)</th>
            <th className="p-2 text-center">التقدير</th>
            <th className="p-2 text-center">النقاط (GP)</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={6} className="text-center p-4 text-muted-foreground">لا توجد مقررات</td></tr>
          ) : data.map((e) => {
            const gp = gradePoint(e.percentage);
            const coursework = Math.round(e.percentage * 0.3);
            const finalExam = Math.round(e.percentage * 0.7);
            return (
              <tr key={e.exam_id + e.submitted_at} className="border-b" style={{ borderColor: "#E6E6E1" }}>
                <td className="p-2 text-right font-medium">{e.title_ar || e.title}</td>
                <td className="p-2 text-center">{toArabicNum(coursework)}</td>
                <td className="p-2 text-center">{toArabicNum(finalExam)}</td>
                <td className="p-2 text-center font-bold">{toArabicNum(Math.round(e.percentage))}</td>
                <td className="p-2 text-center">
                  <span className={`px-2 py-0.5 rounded text-xs ${e.passed ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                    {gradeLabel(gp)}
                  </span>
                </td>
                <td className="p-2 text-center">{toArabicNum(gp.toFixed(1))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex justify-between mt-2 text-sm px-2">
        <span style={{ color: "#064E3B" }} className="font-bold">المعدل الفصلي: {toArabicNum(gpa.toFixed(2))}</span>
        <span className="text-muted-foreground">ملاحظات: {gpa >= 3.5 ? "ممتاز، واصل تقدمك" : gpa >= 2.0 ? "جيد، يمكنك تحسين مستواك" : gpa > 0 ? "يحتاج تحسين" : "---"}</span>
      </div>
    </div>
  );

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
