import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Clock, CheckCircle, XCircle, PlayCircle, Lock, AlertTriangle, ChevronDown, ChevronRight, Trash2 } from "lucide-react";

const StudentExams = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [assignedExams, setAssignedExams] = useState<any[]>([]);
  const [pastAttempts, setPastAttempts] = useState<any[]>([]);
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({});
  const [historyOpen, setHistoryOpen] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchExams();
    const interval = setInterval(fetchExams, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const fetchExams = async () => {
    const { data: assignments } = await supabase
      .from("exam_assignments")
      .select("exam_id, exams(*)")
      .eq("user_id", user!.id);

    const assignedExamsList = (assignments || [])
      .map((a: any) => a.exams)
      .filter((e: any) => e && e.is_published);

    setAssignedExams(assignedExamsList);

    const { data: attempts } = await supabase
      .from("exam_attempts")
      .select("*, exams(title, title_ar, max_attempts, type)")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

    setPastAttempts(attempts || []);

    const counts: Record<string, number> = {};
    (attempts || []).forEach((a: any) => {
      if (a.status !== "in_progress") {
        counts[a.exam_id] = (counts[a.exam_id] || 0) + 1;
      }
    });
    setAttemptCounts(counts);
  };

  const startExam = async (exam: any) => {
    const examId = exam.id;
    const maxAttempts = exam.max_attempts || 1;
    const completedCount = attemptCounts[examId] || 0;

    if (completedCount >= maxAttempts) {
      toast({
        title: t("Cannot retake", "لا يمكن الإعادة"),
        description: t(`You have used all ${maxAttempts} attempt(s).`, `لقد استخدمت جميع المحاولات (${maxAttempts}).`),
        variant: "destructive",
      });
      return;
    }

    const { data: existing } = await supabase
      .from("exam_attempts").select("id")
      .eq("exam_id", examId).eq("user_id", user!.id).eq("status", "in_progress").maybeSingle();

    if (existing) { navigate(`/student/exam/${existing.id}`); return; }

    const now = new Date();
    if (exam.start_date && new Date(exam.start_date) > now) {
      toast({ title: t("Not started yet", "لم يبدأ بعد"), variant: "destructive" });
      return;
    }
    if (exam.end_date && new Date(exam.end_date) < now) {
      toast({ title: t("Expired", "منتهي"), variant: "destructive" });
      return;
    }

    navigate(`/student/exam-verify/${examId}`);
  };

  const getExamStatus = (exam: any) => {
    const maxAttempts = exam.max_attempts || 1;
    const completedCount = attemptCounts[exam.id] || 0;
    const hasInProgress = pastAttempts.some(a => a.exam_id === exam.id && a.status === "in_progress");

    if (hasInProgress) return "in_progress";
    if (completedCount >= maxAttempts) return "exhausted";

    const nowMs = Date.now();
    if (exam.start_date && new Date(exam.start_date).getTime() > nowMs) return "not_started";
    if (exam.end_date && new Date(exam.end_date).getTime() < nowMs) return "expired";

    return "available";
  };

  const clearHistory = () => {
    setPastAttempts([]);
    toast({ title: t("History cleared", "تم مسح السجل") });
  };

  const renderExamCard = (exam: any) => {
    const status = getExamStatus(exam);
    const completedCount = attemptCounts[exam.id] || 0;
    const maxAttempts = exam.max_attempts || 1;
    const latestAttempt = pastAttempts.find(a => a.exam_id === exam.id && a.status !== "in_progress");
    const examType = (exam as any).type || "exam";
    const isTest = examType === "test";

    return (
      <Card key={exam.id} className="hover:shadow-md transition-shadow">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-lg font-semibold flex-1">
              {language === "ar" ? exam.title_ar || exam.title : exam.title}
            </h3>
            <Badge variant="outline" className={isTest ? "border-amber-500 text-amber-600 bg-amber-500/10 text-xs" : "border-primary text-primary bg-primary/10 text-xs"}>
              {isTest ? t("Test", "تمرين") : t("Exam", "امتحان")}
            </Badge>
          </div>
          <p className="mb-3 text-sm text-muted-foreground line-clamp-2">
            {language === "ar" ? exam.description_ar || exam.description : exam.description}
          </p>
          <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {exam.time_limit_minutes} {t("min", "دقيقة")}</span>
            <Badge variant="outline">{t("Pass", "نجاح")}: {exam.passing_score}%</Badge>
            <Badge variant="outline">{completedCount}/{maxAttempts} {t("attempts", "محاولات")}</Badge>
            <Badge variant="outline">{isTest ? "30" : "70"} {t("marks", "درجة")}</Badge>
          </div>

          {status === "exhausted" && latestAttempt && (
            <div className="mb-3 flex items-center gap-2">
              {latestAttempt.status === "graded" ? (
                <>
                  {latestAttempt.passed ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                  <span className="font-semibold text-sm">{Math.round(latestAttempt.percentage || 0)}%</span>
                  <Badge variant={latestAttempt.passed ? "default" : "destructive"} className="text-xs">
                    {latestAttempt.passed ? t("Passed", "ناجح") : t("Failed", "راسب")}
                  </Badge>
                </>
              ) : (
                <Badge variant="secondary" className="text-xs">{t("Awaiting Grade", "بانتظار التصحيح")}</Badge>
              )}
            </div>
          )}

          {status === "available" && (
            <Button size="sm" onClick={() => startExam(exam)} className="w-full">
              <PlayCircle className="mr-2 h-4 w-4" />
              {isTest ? t("Start Test", "بدء التمرين") : t("Start Exam", "بدء الامتحان")}
            </Button>
          )}
          {status === "in_progress" && (
            <Button size="sm" onClick={() => startExam(exam)} className="w-full" variant="secondary">
              <PlayCircle className="mr-2 h-4 w-4" />
              {t("Continue", "متابعة")}
            </Button>
          )}
          {status === "exhausted" && latestAttempt && (
            <Button size="sm" className="w-full" variant="outline" onClick={() => navigate(`/student/results/${latestAttempt.id}`)}>
              <CheckCircle className="mr-2 h-4 w-4" />
              {t("View Results", "عرض النتائج")}
            </Button>
          )}
          {status === "not_started" && (
            <div>
              <Button size="sm" disabled className="w-full" variant="outline">
                <Clock className="mr-2 h-4 w-4" />{t("Not started yet", "لم يبدأ بعد")}
              </Button>
              <p className="text-xs text-muted-foreground mt-1.5 text-center">
                {t("Opens", "يفتح")}: {new Date(exam.start_date).toLocaleString()}
              </p>
            </div>
          )}
          {status === "expired" && (
            <div>
              <Button size="sm" disabled className="w-full" variant="outline">
                <XCircle className="mr-2 h-4 w-4" />{t("Expired", "منتهي")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const terms = [
    { term: "first", label: t("First Term / الفصل الأول", "الفصل الأول") },
    { term: "second", label: t("Second Term / الفصل الثاني", "الفصل الثاني") },
    { term: "third", label: t("Third Term / الفصل الثالث", "الفصل الثالث") },
  ];

  const renderTermGroups = (examsList: any[]) => {
    if (examsList.length === 0) return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
        <p>{t("No items found.", "لا توجد عناصر.")}</p>
      </CardContent></Card>
    );

    return (
      <div className="space-y-6">
        {terms.map(({ term, label }) => {
          const termExams = examsList.filter((e: any) => (e.term || "first") === term);
          if (termExams.length === 0) return null;
          return (
            <div key={term}>
              <h3 className="text-lg font-semibold mb-3 border-b pb-2">{label}</h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{termExams.map(renderExamCard)}</div>
            </div>
          );
        })}
      </div>
    );
  };

  // Split by type
  const examsOnly = assignedExams.filter(e => ((e as any).type || "exam") === "exam");
  const testsOnly = assignedExams.filter(e => ((e as any).type || "exam") === "test");

  const availableExams = examsOnly.filter(e => getExamStatus(e) !== "exhausted");
  const completedExams = examsOnly.filter(e => getExamStatus(e) === "exhausted");
  const availableTests = testsOnly.filter(e => getExamStatus(e) !== "exhausted");
  const completedTests = testsOnly.filter(e => getExamStatus(e) === "exhausted");

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">{t("Exams & Tests", "الامتحانات والتمرينات")}</h1>

      <Tabs defaultValue="exams">
        <TabsList className="mb-6">
          <TabsTrigger value="exams">{t("Exams / الامتحانات", "الامتحانات")} ({examsOnly.length})</TabsTrigger>
          <TabsTrigger value="tests">{t("Tests / التمرينات", "التمرينات")} ({testsOnly.length})</TabsTrigger>
          <TabsTrigger value="history">{t("History", "السجل")} ({pastAttempts.length})</TabsTrigger>
        </TabsList>

        {/* Exams Tab */}
        <TabsContent value="exams" className="space-y-8">
          <div>
            <h2 className="text-xl font-semibold mb-4">{t("Available", "المتاحة")} ({availableExams.length})</h2>
            {renderTermGroups(availableExams)}
          </div>
          {completedExams.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">{t("Completed", "المكتملة")} ({completedExams.length})</h2>
              {renderTermGroups(completedExams)}
            </div>
          )}
        </TabsContent>

        {/* Tests Tab */}
        <TabsContent value="tests" className="space-y-8">
          <div>
            <h2 className="text-xl font-semibold mb-4">{t("Available", "المتاحة")} ({availableTests.length})</h2>
            {renderTermGroups(availableTests)}
          </div>
          {completedTests.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">{t("Completed", "المكتملة")} ({completedTests.length})</h2>
              {renderTermGroups(completedTests)}
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <div className="flex items-center justify-between mb-4">
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                {historyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {t("History", "السجل")} ({pastAttempts.length})
              </CollapsibleTrigger>
              {pastAttempts.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearHistory} className="text-destructive hover:text-destructive">
                  <Trash2 className="mr-1 h-3 w-3" />{t("Clear", "مسح")}
                </Button>
              )}
            </div>
            <CollapsibleContent>
              {pastAttempts.length === 0 ? (
                <p className="text-muted-foreground">{t("No history", "لا يوجد سجل")}</p>
              ) : (
                <div className="space-y-3">
                  {pastAttempts.map((attempt) => {
                    const attemptType = (attempt.exams as any)?.type || "exam";
                    const isTest = attemptType === "test";
                    return (
                      <Card key={attempt.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => {
                        if (attempt.status !== "in_progress") navigate(`/student/results/${attempt.id}`);
                      }}>
                        <CardContent className="flex items-center justify-between p-4 flex-wrap gap-2">
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {language === "ar" ? attempt.exams?.title_ar || attempt.exams?.title : attempt.exams?.title}
                              <Badge variant="outline" className={`text-[10px] ${isTest ? "border-amber-500 text-amber-600" : "border-primary text-primary"}`}>
                                {isTest ? t("Test", "تمرين") : t("Exam", "امتحان")}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(attempt.created_at).toLocaleDateString()}
                              {attempt.submitted_at && ` • ${new Date(attempt.submitted_at).toLocaleString()}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {attempt.status === "graded" && (
                              <div className="flex items-center gap-1">
                                {attempt.passed ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                                <span className="font-semibold">{Math.round(attempt.percentage || 0)}%</span>
                                <span className="text-xs text-muted-foreground">({attempt.score}/{attempt.total_points})</span>
                              </div>
                            )}
                            <Badge variant={
                              attempt.status === "graded" ? (attempt.passed ? "default" : "destructive") :
                              attempt.status === "submitted" ? "secondary" : "outline"
                            }>
                              {attempt.status === "in_progress" ? t("In Progress", "قيد التنفيذ") :
                               attempt.status === "submitted" ? t("Awaiting Grade", "بانتظار التصحيح") :
                               attempt.status === "graded" ? (attempt.passed ? t("Passed", "ناجح") : t("Failed", "راسب")) :
                               attempt.status}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StudentExams;
