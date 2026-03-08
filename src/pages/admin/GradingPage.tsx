import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { sanitizeHtml } from "@/lib/sanitize";
import { CheckCircle, XCircle, Play, Pause, Volume2, Search, FileText, Image, Download } from "lucide-react";
import AdminAudioPlayer from "@/components/exam/AdminAudioPlayer";

const GradingPage = () => {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const [allAttempts, setAllAttempts] = useState<any[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<any>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [gradingTab, setGradingTab] = useState("pending");
  const [examFilter, setExamFilter] = useState("all");
  const [studentFilter, setStudentFilter] = useState("");
  const [examsList, setExamsList] = useState<any[]>([]);

  const fetchAttempts = async () => {
    const [attemptsRes, profilesRes, examsRes] = await Promise.all([
      supabase
        .from("exam_attempts")
        .select("*")
        .in("status", ["submitted", "graded"])
        .order("submitted_at", { ascending: false }),
      supabase.from("profiles").select("user_id, full_name, email"),
      supabase.from("exams").select("id, title, title_ar, passing_score, term, type"),
    ]);

    const profiles = profilesRes.data || [];
    const exams = examsRes.data || [];
    setExamsList(exams);

    const merged = (attemptsRes.data || []).map((a: any) => ({
      ...a,
      profiles: profiles.find((p) => p.user_id === a.user_id) || {},
      exams: exams.find((e) => e.id === a.exam_id) || {},
    }));
    setAllAttempts(merged);
  };

  useEffect(() => { fetchAttempts(); }, []);

  const filteredAttempts = allAttempts.filter((a) => {
    if (gradingTab === "pending" && a.status !== "submitted") return false;
    if (gradingTab === "graded" && a.status !== "graded") return false;
    if (examFilter !== "all" && a.exam_id !== examFilter) return false;
    if (studentFilter) {
      const name = (a.profiles?.full_name || "").toLowerCase();
      const email = (a.profiles?.email || "").toLowerCase();
      if (!name.includes(studentFilter.toLowerCase()) && !email.includes(studentFilter.toLowerCase())) return false;
    }
    return true;
  });

  const termLabels: Record<string, string> = {
    first: t("First Term / الفصل الأول", "الفصل الأول / First Term"),
    second: t("Second Term / الفصل الثاني", "الفصل الثاني / Second Term"),
    third: t("Third Term / الفصل الثالث", "الفصل الثالث / Third Term"),
  };

  const groupByTerm = (attempts: any[]) => {
    const groups: Record<string, any[]> = { first: [], second: [], third: [] };
    attempts.forEach((a) => {
      const term = (a.exams?.term || "first") as string;
      if (!groups[term]) groups[term] = [];
      groups[term].push(a);
    });
    return groups;
  };

  const pendingCount = allAttempts.filter((a) => a.status === "submitted").length;
  const gradedCount = allAttempts.filter((a) => a.status === "graded").length;

  const resignUrl = async (url: string): Promise<string> => {
    if (!url) return url;
    // Extract storage path from signed URL or raw path
    const match = url.match(/\/object\/sign\/([^?]+)/);
    if (match) {
      const bucketAndPath = decodeURIComponent(match[1]);
      const slashIdx = bucketAndPath.indexOf('/');
      const bucket = bucketAndPath.substring(0, slashIdx);
      const path = bucketAndPath.substring(slashIdx + 1);
      const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
      return data?.signedUrl || url;
    }
    return url;
  };

  const loadAttempt = async (attempt: any) => {
    setSelectedAttempt(attempt);
    const [answersRes, questionsRes] = await Promise.all([
      supabase.from("exam_answers").select("*").eq("attempt_id", attempt.id),
      supabase.from("exam_questions").select("*").eq("exam_id", attempt.exam_id).order("sort_order"),
    ]);

    // Re-sign media URLs for questions
    const qs = questionsRes.data || [];
    for (const q of qs) {
      if (q.media_url) q.media_url = await resignUrl(q.media_url);
    }

    // Re-sign audio/file URLs in answers
    const ans = answersRes.data || [];
    for (const a of ans) {
      if (a.answer_data && typeof a.answer_data === 'object') {
        const data = a.answer_data as any;
        if (data.audioUrl) data.audioUrl = await resignUrl(data.audioUrl);
        if (data.fileUrl) data.fileUrl = await resignUrl(data.fileUrl);
      }
    }

    setAnswers(ans);
    setQuestions(qs);
  };

  const updateGrade = (answerId: string, pointsAwarded: number, feedback: string) => {
    setAnswers((prev) =>
      prev.map((a) => (a.id === answerId ? { ...a, points_awarded: pointsAwarded, feedback, is_correct: pointsAwarded > 0 } : a))
    );
  };

  const autoGradeObjective = () => {
    setAnswers((prev) => prev.map((ans) => {
      const q = questions.find((qq) => qq.id === ans.question_id);
      if (!q) return ans;
      let isCorrect: boolean | null = null;
      let pts = 0;
      if ((q.question_type === "mcq" || q.question_type === "image_mcq") && q.options) {
        const correctOpts = (q.options as any[]).filter((o: any) => o.is_correct).map((o: any) => o.id);
        isCorrect = correctOpts.length === 1 && ans.answer_text === correctOpts[0];
        pts = isCorrect ? (q.points || 1) : 0;
      } else if (q.question_type === "true_false") {
        isCorrect = ans.answer_text?.toLowerCase() === q.correct_answer?.toLowerCase();
        pts = isCorrect ? (q.points || 1) : 0;
      } else if (q.question_type === "fill_blank") {
        isCorrect = ans.answer_text?.trim().toLowerCase() === q.correct_answer?.trim().toLowerCase();
        pts = isCorrect ? (q.points || 1) : 0;
      }
      if (isCorrect !== null) return { ...ans, is_correct: isCorrect, points_awarded: pts };
      return ans;
    }));
    toast({ title: t("Auto-graded objective questions", "تم التصحيح التلقائي للأسئلة الموضوعية") });
  };

  const submitGrading = async () => {
    for (const ans of answers) {
      await supabase.from("exam_answers").update({
        points_awarded: ans.points_awarded,
        feedback: ans.feedback,
        is_correct: ans.is_correct,
        graded_by: user!.id,
        graded_at: new Date().toISOString(),
      }).eq("id", ans.id);
    }

    const totalPoints = questions.reduce((s, q) => s + (q.points || 1), 0);
    const earnedPoints = answers.reduce((s, a) => s + (Number(a.points_awarded) || 0), 0);
    const percentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
    const passingScore = selectedAttempt?.exams?.passing_score || 50;

    await supabase.from("exam_attempts").update({
      status: "graded",
      score: earnedPoints,
      total_points: totalPoints,
      percentage,
      passed: percentage >= passingScore,
    }).eq("id", selectedAttempt.id);

    // Log grading activity
    try {
      await supabase.from("activity_logs").insert({
        user_id: user!.id,
        action: "exam_graded",
        entity_type: "exam_attempt",
        entity_id: selectedAttempt.id,
        metadata: {
          student_id: selectedAttempt.user_id,
          exam_id: selectedAttempt.exam_id,
          score: earnedPoints,
          total_points: totalPoints,
          percentage: Math.round(percentage),
          passed: percentage >= passingScore,
        },
      });
    } catch (e) {}

    toast({ title: t("✅ Grading submitted!", "✅ تم تقديم التصحيح!") });
    setSelectedAttempt(null);
    fetchAttempts();
  };

  // Grading detail view
  if (selectedAttempt) {
    const totalPts = questions.reduce((s, q) => s + (q.points || 1), 0);
    const earnedPts = answers.reduce((s, a) => s + (Number(a.points_awarded) || 0), 0);
    const pct = totalPts > 0 ? Math.round((earnedPts / totalPts) * 100) : 0;

    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold">{t("Grading", "التصحيح")}: {language === "ar" ? selectedAttempt.exams?.title_ar || selectedAttempt.exams?.title : selectedAttempt.exams?.title}</h1>
            <p className="text-sm text-muted-foreground">
              {t("Student", "الطالب")}: {selectedAttempt.profiles?.full_name || selectedAttempt.profiles?.email || "Unknown"}
              {selectedAttempt.submitted_at && ` • ${new Date(selectedAttempt.submitted_at).toLocaleString()}`}
              {selectedAttempt.tab_switches > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">{selectedAttempt.tab_switches} {t("tab switches", "تبديل")}</Badge>
              )}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setSelectedAttempt(null)}>{t("Back", "رجوع")}</Button>
            <Button variant="secondary" size="sm" onClick={autoGradeObjective}>{t("Auto-Grade", "تصحيح تلقائي")}</Button>
            <Button size="sm" onClick={submitGrading}>{t("Submit Grades", "تقديم الدرجات")}</Button>
          </div>
        </div>

        {/* Summary */}
        <Card className="mb-4">
          <CardContent className="flex items-center gap-6 p-3 text-sm flex-wrap">
            <div><span className="text-muted-foreground">{t("Total", "الإجمالي")}:</span> <strong>{totalPts}</strong></div>
            <div><span className="text-muted-foreground">{t("Earned", "المكتسبة")}:</span> <strong className={earnedPts > 0 ? "text-emerald" : ""}>{earnedPts}</strong></div>
            <div><span className="text-muted-foreground">{t("Percentage", "النسبة")}:</span> <strong className={pct >= (selectedAttempt?.exams?.passing_score || 50) ? "text-emerald" : "text-destructive"}>{pct}%</strong></div>
            <Badge variant={pct >= (selectedAttempt?.exams?.passing_score || 50) ? "default" : "destructive"}>
              {pct >= (selectedAttempt?.exams?.passing_score || 50) ? t("Passing", "ناجح") : t("Failing", "راسب")}
            </Badge>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {questions.map((q, i) => {
            const ans = answers.find((a) => a.question_id === q.id);
            return (
              <Card key={q.id} className={ans?.is_correct === true ? "border-emerald/30" : ans?.is_correct === false ? "border-destructive/30" : ""}>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">{t("Q", "س")} {i + 1}</Badge>
                    <Badge variant="secondary" className="text-xs">{q.question_type}</Badge>
                    <span className="text-xs text-muted-foreground">{q.points} {t("pts", "نقاط")}</span>
                    {ans?.is_correct === true && <CheckCircle className="h-4 w-4 text-emerald" />}
                    {ans?.is_correct === false && <XCircle className="h-4 w-4 text-destructive" />}
                  </div>

                  {q.question_text ? (
                    <div
                      className="mb-1 font-medium text-sm prose prose-sm max-w-none"
                      dir="auto"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text) }}
                    />
                  ) : null}
                  {q.question_text_ar && q.question_text_ar !== q.question_text ? (
                    <div
                      className="mb-2 arabic-exam-text prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text_ar) }}
                    />
                  ) : null}
                  {!q.question_text && !q.question_text_ar && (
                    <p className="mb-2 text-muted-foreground italic text-sm">Question text missing. Please contact administrator.</p>
                  )}

                  {q.correct_answer && (
                    <p className="mb-2 text-xs text-emerald">
                      {t("Correct Answer", "الإجابة الصحيحة")}: {q.correct_answer}
                    </p>
                  )}
                  {(q.question_type === "mcq" || q.question_type === "image_mcq") && q.options && (
                    <div className="mb-2 text-xs text-emerald">
                      {t("Correct", "صحيح")}: {(q.options as any[]).filter((o: any) => o.is_correct).map((o: any) => language === "ar" ? o.text_ar || o.text : o.text).join(", ")}
                    </div>
                  )}

                  {q.media_url && <MediaPreview src={q.media_url} label={t("Question Media", "وسائط السؤال")} />}

                  <div className="mb-3 rounded-lg bg-muted p-3">
                    <p className="text-xs font-medium mb-1">{t("Student's Answer", "إجابة الطالب")}:</p>
                    {(q.question_type === "mcq" || q.question_type === "image_mcq") && q.options ? (
                      <p className="text-sm">
                        {(() => {
                          const opt = (q.options as any[]).find((o: any) => o.id === ans?.answer_text);
                          return opt ? (language === "ar" ? opt.text_ar || opt.text : opt.text) : t("No answer", "لا إجابة");
                        })()}
                      </p>
                    ) : (
                      <p className="text-sm" dir="auto">{ans?.answer_text || t("No answer", "لا إجابة")}</p>
                    )}
                    {/* Render student attachments based on file type */}
                    {ans?.answer_data?.audioUrl && (
                      <div className="mt-2">
                        <MediaPreview src={ans.answer_data.audioUrl} label={t("Student's Recording", "تسجيل الطالب")} />
                      </div>
                    )}
                    {ans?.answer_data?.fileUrl && (
                      <div className="mt-2">
                        <MediaPreview src={ans.answer_data.fileUrl} label={t("Student's File", "ملف الطالب")} />
                      </div>
                    )}
                  </div>

                  <div className="flex items-start gap-3 flex-wrap">
                    <div>
                      <Label className="text-xs">{t("Points", "نقاط")}</Label>
                      <Input
                        type="number"
                        className="w-20 h-8 text-sm"
                        value={ans?.points_awarded ?? 0}
                        min={0}
                        max={q.points}
                        onChange={(e) => ans && updateGrade(ans.id, +e.target.value, ans.feedback || "")}
                      />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <Label className="text-xs">{t("Feedback", "ملاحظات")}</Label>
                      <Textarea
                        rows={2}
                        value={ans?.feedback || ""}
                        onChange={(e) => ans && updateGrade(ans.id, ans.points_awarded || 0, e.target.value)}
                        placeholder={t("Add feedback...", "أضف ملاحظات...")}
                        dir="auto"
                        className="text-sm"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // Attempts list view
  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">{t("Grading Dashboard", "لوحة التصحيح")}</h1>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-auto">
          <Label className="text-xs mb-1 block">{t("Filter by Exam", "تصفية حسب الامتحان")}</Label>
          <Select value={examFilter} onValueChange={setExamFilter}>
            <SelectTrigger className="w-full sm:w-[200px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All Exams", "جميع الامتحانات")}</SelectItem>
              {examsList.map((e) => (
                <SelectItem key={e.id} value={e.id}>{language === "ar" ? e.title_ar || e.title : e.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-auto">
          <Label className="text-xs mb-1 block">{t("Search Student", "البحث عن طالب")}</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-9 text-sm w-full sm:w-[200px]"
              placeholder={t("Name or email...", "الاسم أو البريد...")}
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Tabs value={gradingTab} onValueChange={setGradingTab}>
        <TabsList>
          <TabsTrigger value="pending">{t("Needs Grading", "يحتاج تصحيح")} ({pendingCount})</TabsTrigger>
          <TabsTrigger value="graded">{t("Graded", "مُصحح")} ({gradedCount})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {filteredAttempts.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">{t("No exams to grade", "لا توجد امتحانات للتصحيح")}</CardContent></Card>
          ) : (
            <div className="space-y-6">
              {(["first", "second", "third"] as const).map((term) => {
                const termAttempts = groupByTerm(filteredAttempts)[term];
                if (!termAttempts?.length) return null;
                return (
                  <div key={term}>
                    <h3 className="text-lg font-semibold mb-3 border-b pb-2">{termLabels[term]}</h3>
                    <div className="space-y-2">
                      {termAttempts.map((attempt: any) => (
                        <Card key={attempt.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => loadAttempt(attempt)}>
                          <CardContent className="flex items-center justify-between p-4 flex-wrap gap-2">
                            <div>
                              <div className="font-semibold text-sm">{language === "ar" ? attempt.exams?.title_ar || attempt.exams?.title : attempt.exams?.title}</div>
                              <div className="text-xs text-muted-foreground">
                                {attempt.profiles?.full_name || attempt.profiles?.email || "Unknown"} • {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : ""}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {attempt.tab_switches > 0 && <Badge variant="destructive" className="text-xs">{attempt.tab_switches} ⚠️</Badge>}
                              <Badge>{t("Needs Grading", "يحتاج تصحيح")}</Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="graded" className="mt-4">
          {filteredAttempts.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">{t("No graded exams yet", "لا توجد امتحانات مُصححة")}</CardContent></Card>
          ) : (
            <div className="space-y-6">
              {(["first", "second", "third"] as const).map((term) => {
                const termAttempts = groupByTerm(filteredAttempts)[term];
                if (!termAttempts?.length) return null;
                return (
                  <div key={term}>
                    <h3 className="text-lg font-semibold mb-3 border-b pb-2">{termLabels[term]}</h3>
                    <div className="space-y-2">
                      {termAttempts.map((attempt: any) => (
                        <Card key={attempt.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => loadAttempt(attempt)}>
                          <CardContent className="flex items-center justify-between p-4 flex-wrap gap-2">
                            <div>
                              <div className="font-semibold text-sm">{language === "ar" ? attempt.exams?.title_ar || attempt.exams?.title : attempt.exams?.title}</div>
                              <div className="text-xs text-muted-foreground">
                                {attempt.profiles?.full_name || attempt.profiles?.email || "Unknown"} • {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : ""}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {attempt.passed ? <CheckCircle className="h-4 w-4 text-emerald" /> : <XCircle className="h-4 w-4 text-destructive" />}
                              <span className="font-semibold text-sm">{Math.round(attempt.percentage || 0)}%</span>
                              <Badge variant={attempt.passed ? "default" : "destructive"}>
                                {attempt.passed ? t("Passed", "ناجح") : t("Failed", "راسب")}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Smart media preview component - detects file type and renders appropriately
const MediaPreview = ({ src, label }: { src: string; label: string }) => {
  const fileType = detectFileType(src);

  if (fileType === "image") {
    return (
      <div className="my-1">
        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Image className="h-3 w-3" />{label}</p>
        <img src={src} alt={label} className="max-h-48 rounded-lg border object-contain" />
      </div>
    );
  }

  if (fileType === "pdf" || fileType === "document") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-accent/50 p-2 my-1">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground flex-1">{label}</span>
        <a href={src} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline flex items-center gap-1">
          <Download className="h-3 w-3" />{fileType === "pdf" ? "View PDF" : "Download"}
        </a>
      </div>
    );
  }

  // Default: audio — use full AdminAudioPlayer
  return <AdminAudioPlayer src={src} label={label} />;
};

function detectFileType(url: string): "image" | "audio" | "pdf" | "document" | "unknown" {
  const lower = url.toLowerCase().split("?")[0];
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"].some((ext) => lower.endsWith(ext))) return "image";
  if ([".mp3", ".wav", ".ogg", ".webm", ".m4a", ".aac", ".flac"].some((ext) => lower.endsWith(ext))) return "audio";
  if (lower.endsWith(".pdf")) return "pdf";
  if ([".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".txt", ".csv"].some((ext) => lower.endsWith(ext))) return "document";
  return "audio"; // Default to audio for Supabase storage URLs without extensions
}

export default GradingPage;
