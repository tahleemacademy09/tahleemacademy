import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Download, GraduationCap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  if (gp >= 4.0) return "Excellent / ممتاز";
  if (gp >= 3.5) return "Very Good / جيد جداً";
  if (gp >= 3.0) return "Good / جيد";
  if (gp >= 2.0) return "Satisfactory / مقبول";
  if (gp >= 1.0) return "Pass / ناجح";
  return "Fail / راسب";
};

const Transcripts = () => {
  const { t, language } = useLanguage();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [exams, setExams] = useState<GradedExam[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Calculate CGPA
  const totalGP = exams.reduce((sum, e) => sum + gradePoint(e.percentage), 0);
  const cgpa = exams.length > 0 ? totalGP / exams.length : 0;

  // Academic status
  const status = cgpa >= 3.5 ? "Good Standing" : cgpa >= 2.0 ? "Probation Warning" : cgpa > 0 ? "Academic Probation" : "No Data";
  const statusAr = cgpa >= 3.5 ? "وضع جيد" : cgpa >= 2.0 ? "تحذير أكاديمي" : cgpa > 0 ? "إنذار أكاديمي" : "لا توجد بيانات";
  const statusColor = cgpa >= 3.5 ? "default" : cgpa >= 2.0 ? "secondary" : "destructive";

  const downloadPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("Tahleem Academy — Academic Transcript", 14, 20);
    doc.setFontSize(11);
    doc.text(`Student: ${profile?.full_name || "Student"}`, 14, 30);
    doc.text(`Email: ${profile?.email || ""}`, 14, 36);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 42);
    doc.text(`CGPA: ${cgpa.toFixed(2)} — ${gradeLabel(cgpa)}`, 14, 48);
    doc.text(`Status: ${status}`, 14, 54);

    doc.setFontSize(10);
    let y = 66;
    doc.setFont("helvetica", "bold");
    doc.text("Subject", 14, y);
    doc.text("Score", 90, y);
    doc.text("%", 120, y);
    doc.text("GP", 140, y);
    doc.text("Result", 160, y);
    y += 6;
    doc.setFont("helvetica", "normal");

    exams.forEach((e) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(e.title.substring(0, 40), 14, y);
      doc.text(`${e.score}/${e.total_points}`, 90, y);
      doc.text(`${e.percentage.toFixed(1)}%`, 120, y);
      doc.text(`${gradePoint(e.percentage).toFixed(1)}`, 140, y);
      doc.text(e.passed ? "Pass" : "Fail", 160, y);
      y += 6;
    });

    doc.save(`Transcript-${profile?.full_name || "student"}.pdf`);
    toast({ title: t("PDF downloaded", "تم تحميل الملف") });
  };

  // CGPA gauge percentage (4.0 scale → 0-100%)
  const gaugePercent = (cgpa / 4.0) * 100;
  const circumference = 2 * Math.PI * 60;
  const strokeDashoffset = circumference - (gaugePercent / 100) * circumference;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("Academic Transcript", "السجل الأكاديمي")}</h1>
          <p className="text-muted-foreground">{t("Your complete academic record", "سجلك الأكاديمي الكامل")}</p>
        </div>
        <Button onClick={downloadPDF} disabled={exams.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          {t("Download PDF", "تحميل PDF")}
        </Button>
      </div>

      {/* CGPA Gauge + Status */}
      <div className="mb-8 grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 flex flex-col items-center justify-center p-6">
          <div className="relative">
            <svg width="140" height="140" className="-rotate-90">
              <circle cx="70" cy="70" r="60" stroke="hsl(var(--muted))" strokeWidth="10" fill="none" />
              <circle
                cx="70" cy="70" r="60"
                stroke="hsl(var(--primary))"
                strokeWidth="10"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-1000"
              />
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
                <div className="text-2xl font-bold text-emerald-600">
                  {exams.filter(e => e.passed).length}
                </div>
                <div className="text-xs text-muted-foreground">{t("Passed", "ناجح")}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-destructive">
                  {exams.filter(e => !e.passed).length}
                </div>
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

      {/* Transcript Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("Detailed Results", "النتائج التفصيلية")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">{t("Loading...", "جاري التحميل...")}</p>
          ) : exams.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("No graded exams yet.", "لا توجد امتحانات مصححة بعد.")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">{t("Subject", "المادة")}</th>
                    <th className="pb-2 font-medium">{t("Score", "الدرجة")}</th>
                    <th className="pb-2 font-medium">{t("Percentage", "النسبة")}</th>
                    <th className="pb-2 font-medium">{t("Grade Point", "نقاط")}</th>
                    <th className="pb-2 font-medium">{t("Grade", "التقدير")}</th>
                    <th className="pb-2 font-medium">{t("Date", "التاريخ")}</th>
                  </tr>
                </thead>
                <tbody>
                  {exams.map((e) => {
                    const gp = gradePoint(e.percentage);
                    return (
                      <tr key={e.exam_id + e.submitted_at} className="border-b last:border-0">
                        <td className="py-2 font-medium" dir="auto">
                          {language === "ar" ? e.title_ar || e.title : e.title}
                        </td>
                        <td className="py-2">{e.score}/{e.total_points}</td>
                        <td className="py-2">{e.percentage.toFixed(1)}%</td>
                        <td className="py-2">{gp.toFixed(1)}</td>
                        <td className="py-2">
                          <Badge variant={e.passed ? "default" : "destructive"} className="text-xs">
                            {e.passed ? t("Pass", "ناجح") : t("Fail", "راسب")}
                          </Badge>
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {e.submitted_at ? new Date(e.submitted_at).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Transcripts;
