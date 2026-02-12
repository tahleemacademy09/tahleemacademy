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
  const [completedOpen, setCompletedOpen] = useState(true);
  const [availableOpen, setAvailableOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchExams();
    // Re-check every 30s so scheduled exams auto-become available
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
      .select("*, exams(title, title_ar, max_attempts)")
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
        title: t("Cannot retake this exam", "لا يمكن إعادة هذا الامتحان"),
        description: t(
          `You have used all ${maxAttempts} attempt(s) for this exam.`,
          `لقد استخدمت جميع المحاولات (${maxAttempts}) لهذا الامتحان.`
        ),
        variant: "destructive",
      });
      return;
    }

    const { data: existing } = await supabase
      .from("exam_attempts")
      .select("id")
      .eq("exam_id", examId)
      .eq("user_id", user!.id)
      .eq("status", "in_progress")
      .maybeSingle();

    if (existing) {
      navigate(`/student/exam/${existing.id}`);
      return;
    }

    const now = new Date();
    if (exam.start_date && new Date(exam.start_date) > now) {
      toast({ title: t("Exam not started yet", "الامتحان لم يبدأ بعد"), variant: "destructive" });
      return;
    }
    if (exam.end_date && new Date(exam.end_date) < now) {
      toast({ title: t("Exam expired", "انتهى الامتحان"), variant: "destructive" });
      return;
    }

    const { data, error } = await supabase
      .from("exam_attempts")
      .insert({ exam_id: examId, user_id: user!.id })
      .select("id")
      .single();

    if (error) {
      toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
      return;
    }
    if (data) navigate(`/student/exam/${data.id}`);
  };

  const getExamStatus = (exam: any) => {
    const maxAttempts = exam.max_attempts || 1;
    const completedCount = attemptCounts[exam.id] || 0;
    const hasInProgress = pastAttempts.some(a => a.exam_id === exam.id && a.status === "in_progress");

    if (hasInProgress) return "in_progress";
    if (completedCount >= maxAttempts) return "exhausted";

    const now = new Date();
    if (exam.start_date && new Date(exam.start_date) > now) return "not_started";
    if (exam.end_date && new Date(exam.end_date) < now) return "expired";

    return "available";
  };

  // Split exams into available (not completed) and completed
  const availableExams = assignedExams.filter(e => {
    const status = getExamStatus(e);
    return status !== "exhausted";
  });

  const completedExams = assignedExams.filter(e => {
    const status = getExamStatus(e);
    return status === "exhausted";
  });

  const clearHistory = () => {
    // We just hide them from UI (can't delete from DB due to RLS)
    setPastAttempts([]);
    toast({ title: t("History cleared", "تم مسح السجل") });
  };

  const renderExamCard = (exam: any) => {
    const status = getExamStatus(exam);
    const completedCount = attemptCounts[exam.id] || 0;
    const maxAttempts = exam.max_attempts || 1;

    // Get latest attempt for completed exams
    const latestAttempt = pastAttempts.find(a => a.exam_id === exam.id && a.status !== "in_progress");

    return (
      <Card key={exam.id} className="hover:shadow-md transition-shadow">
        <CardContent className="p-5">
          <h3 className="mb-2 text-lg font-semibold">
            {language === "ar" ? exam.title_ar || exam.title : exam.title}
          </h3>
          <p className="mb-3 text-sm text-muted-foreground line-clamp-2">
            {language === "ar" ? exam.description_ar || exam.description : exam.description}
          </p>
          <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {exam.time_limit_minutes} {t("min", "دقيقة")}</span>
            <Badge variant="outline">{t("Pass", "نجاح")}: {exam.passing_score}%</Badge>
            <Badge variant="outline">{completedCount}/{maxAttempts} {t("attempts", "محاولات")}</Badge>
          </div>

          {/* Show score for completed exams */}
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
              {t("Start Exam", "بدء الامتحان")}
            </Button>
          )}
          {status === "in_progress" && (
            <Button size="sm" onClick={() => startExam(exam)} className="w-full" variant="secondary">
              <PlayCircle className="mr-2 h-4 w-4" />
              {t("Continue Exam", "متابعة الامتحان")}
            </Button>
          )}
          {status === "exhausted" && latestAttempt && (
            <Button size="sm" className="w-full" variant="outline" onClick={() => navigate(`/student/results/${latestAttempt.id}`)}>
              <CheckCircle className="mr-2 h-4 w-4" />
              {t("View Results", "عرض النتائج")}
            </Button>
          )}
          {status === "not_started" && (
            <Button size="sm" disabled className="w-full" variant="outline">
              <Clock className="mr-2 h-4 w-4" />
              {t("Not started yet", "لم يبدأ بعد")}
            </Button>
          )}
          {status === "expired" && (
            <Button size="sm" disabled className="w-full" variant="outline">
              <XCircle className="mr-2 h-4 w-4" />
              {t("Expired", "منتهي")}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">{t("Exams", "الامتحانات")}</h1>

      <Tabs defaultValue="available">
        <TabsList>
          <TabsTrigger value="available">{t("Available", "المتاحة")} ({availableExams.length})</TabsTrigger>
          <TabsTrigger value="completed">{t("Completed", "المكتملة")} ({completedExams.length})</TabsTrigger>
          <TabsTrigger value="history">{t("History", "السجل")} ({pastAttempts.length})</TabsTrigger>
        </TabsList>

        {/* Available Exams Tab */}
        <TabsContent value="available" className="mt-6">
          <Collapsible open={availableOpen} onOpenChange={setAvailableOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 mb-4 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              {availableOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {t("Available Exams", "الامتحانات المتاحة")} ({availableExams.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              {availableExams.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p>{t("No available exams. All exams have been completed!", "لا توجد امتحانات متاحة. تم إكمال جميع الامتحانات!")}</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {availableExams.map(renderExamCard)}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </TabsContent>

        {/* Completed Exams Tab */}
        <TabsContent value="completed" className="mt-6">
          <Collapsible open={completedOpen} onOpenChange={setCompletedOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 mb-4 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              {completedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {t("Completed Exams", "الامتحانات المكتملة")} ({completedExams.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              {completedExams.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p>{t("No completed exams yet.", "لا توجد امتحانات مكتملة بعد.")}</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {completedExams.map(renderExamCard)}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <div className="flex items-center justify-between mb-4">
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                {historyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {t("Exam History", "سجل الامتحانات")} ({pastAttempts.length})
              </CollapsibleTrigger>
              {pastAttempts.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearHistory} className="text-destructive hover:text-destructive">
                  <Trash2 className="mr-1 h-3 w-3" />
                  {t("Clear History", "مسح السجل")}
                </Button>
              )}
            </div>
            <CollapsibleContent>
              {pastAttempts.length === 0 ? (
                <p className="text-muted-foreground">{t("No exam history", "لا يوجد سجل امتحانات")}</p>
              ) : (
                <div className="space-y-3">
                  {pastAttempts.map((attempt) => (
                    <Card key={attempt.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => {
                      if (attempt.status !== "in_progress") navigate(`/student/results/${attempt.id}`);
                    }}>
                      <CardContent className="flex items-center justify-between p-4 flex-wrap gap-2">
                        <div>
                          <div className="font-medium">
                            {language === "ar" ? attempt.exams?.title_ar || attempt.exams?.title : attempt.exams?.title}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(attempt.created_at).toLocaleDateString()}
                            {attempt.submitted_at && ` • ${t("Submitted", "مُقدم")}: ${new Date(attempt.submitted_at).toLocaleString()}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {attempt.status === "graded" && (
                            <div className="flex items-center gap-1">
                              {attempt.passed ? (
                                <CheckCircle className="h-4 w-4 text-emerald-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-destructive" />
                              )}
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
                          {attempt.tab_switches > 0 && (
                            <Badge variant="destructive" className="text-xs">{attempt.tab_switches} ⚠️</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
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
