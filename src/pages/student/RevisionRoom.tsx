import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Layers, FileText, StickyNote, BarChart3, Users,
  Video, Plus, CheckCircle, XCircle, RotateCcw, BookOpen, Flame
} from "lucide-react";
import { format } from "date-fns";

const RevisionRoom = () => {
  const { subjectId } = useParams();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "flashcards";
  const { t, language } = useLanguage();
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isTeacher = hasRole("teacher") || hasRole("admin");

  // Subject
  const { data: subject, isLoading } = useQuery({
    queryKey: ["revision-subject", subjectId],
    queryFn: async () => {
      const { data } = await supabase.from("subjects").select("*").eq("id", subjectId!).single();
      return data;
    },
  });

  // Flashcards
  const { data: flashcards = [] } = useQuery({
    queryKey: ["revision-flashcards", subjectId],
    queryFn: async () => {
      const { data } = await supabase.from("revision_flashcards" as any).select("*").eq("subject_id", subjectId!).order("order_index");
      return (data || []) as any[];
    },
  });

  // Flashcard progress
  const { data: fcProgress = [] } = useQuery({
    queryKey: ["revision-fc-progress-subject", subjectId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const fcIds = flashcards.map((f: any) => f.id);
      if (!fcIds.length) return [];
      const { data } = await supabase.from("revision_flashcard_progress" as any).select("*").eq("student_id", user!.id).in("flashcard_id", fcIds);
      return (data || []) as any[];
    },
  });

  // Summaries
  const { data: summaries = [] } = useQuery({
    queryKey: ["revision-summaries", subjectId],
    queryFn: async () => {
      const { data } = await supabase.from("revision_summaries" as any).select("*").eq("subject_id", subjectId!).order("created_at", { ascending: false });
      return (data || []) as any[];
    },
  });

  // Notes
  const { data: notes = [] } = useQuery({
    queryKey: ["revision-notes", subjectId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("revision_notes" as any).select("*").eq("student_id", user!.id).eq("subject_id", subjectId!).order("updated_at", { ascending: false });
      return (data || []) as any[];
    },
  });

  // Quiz sessions
  const { data: quizSessions = [] } = useQuery({
    queryKey: ["revision-quizzes-subject", subjectId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("revision_quiz_sessions" as any).select("*").eq("student_id", user!.id).eq("subject_id", subjectId!).order("completed_at", { ascending: false });
      return (data || []) as any[];
    },
  });

  // ─── FLASHCARD STUDY MODE ───
  const [studyMode, setStudyMode] = useState(false);
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [studyResults, setStudyResults] = useState<Record<string, string>>({});

  const startStudy = () => {
    setStudyMode(true);
    setCurrentCardIdx(0);
    setFlipped(false);
    setStudyResults({});
  };

  const markCard = async (status: "known" | "learning" | "new") => {
    const card = flashcards[currentCardIdx];
    if (!card || !user) return;

    setStudyResults(prev => ({ ...prev, [card.id]: status }));

    // Upsert progress
    const existing = fcProgress.find((p: any) => p.flashcard_id === card.id);
    if (existing) {
      await supabase.from("revision_flashcard_progress" as any).update({
        status,
        times_reviewed: (existing.times_reviewed || 0) + 1,
        last_reviewed_at: new Date().toISOString(),
      } as any).eq("id", existing.id);
    } else {
      await supabase.from("revision_flashcard_progress" as any).insert({
        student_id: user.id,
        flashcard_id: card.id,
        status,
        times_reviewed: 1,
        last_reviewed_at: new Date().toISOString(),
      } as any);
    }

    if (currentCardIdx < flashcards.length - 1) {
      setCurrentCardIdx(prev => prev + 1);
      setFlipped(false);
    } else {
      // End of deck
      setStudyMode(false);
      queryClient.invalidateQueries({ queryKey: ["revision-fc-progress-subject"] });
      toast({ title: t("Study session complete!", "اكتملت جلسة الدراسة!") });
    }
  };

  // ─── QUICK QUIZ ───
  const [quizMode, setQuizMode] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<any[]>([]);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizDone, setQuizDone] = useState(false);

  const startQuiz = (source: string) => {
    // Generate quiz from flashcards
    const cards = [...flashcards].sort(() => Math.random() - 0.5).slice(0, 10);
    const questions = cards.map((c: any) => ({
      id: c.id,
      question: language === "ar" ? c.front_text_ar || c.front_text : c.front_text,
      answer: language === "ar" ? c.back_text_ar || c.back_text : c.back_text,
      options: generateOptions(c, cards),
    }));
    setQuizQuestions(questions);
    setQuizIdx(0);
    setQuizAnswers({});
    setQuizDone(false);
    setQuizMode(true);
  };

  const generateOptions = (card: any, allCards: any[]) => {
    const correct = language === "ar" ? card.back_text_ar || card.back_text : card.back_text;
    const others = allCards
      .filter((c: any) => c.id !== card.id)
      .map((c: any) => language === "ar" ? c.back_text_ar || c.back_text : c.back_text)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const options = [correct, ...others].sort(() => Math.random() - 0.5);
    return options;
  };

  const submitQuizAnswer = (answer: string) => {
    setQuizAnswers(prev => ({ ...prev, [quizIdx]: answer }));
    if (quizIdx < quizQuestions.length - 1) {
      setQuizIdx(prev => prev + 1);
    } else {
      setQuizDone(true);
      // Save quiz session
      const score = quizQuestions.reduce((s, q, i) => {
        return s + (quizAnswers[i] === q.answer || (i === quizIdx && answer === q.answer) ? 1 : 0);
      }, 0);
      // Recalculate including last answer
      let finalScore = 0;
      const finalAnswers = { ...quizAnswers, [quizIdx]: answer };
      quizQuestions.forEach((q, i) => {
        if (finalAnswers[i] === q.answer) finalScore++;
      });
      if (user) {
        supabase.from("revision_quiz_sessions" as any).insert({
          student_id: user.id,
          subject_id: subjectId,
          source: "flashcard",
          score: finalScore,
          total: quizQuestions.length,
          percentage: Math.round((finalScore / quizQuestions.length) * 100),
          answers: finalAnswers,
        } as any).then(() => {
          queryClient.invalidateQueries({ queryKey: ["revision-quizzes-subject"] });
        });
      }
    }
  };

  const quizScore = quizDone ? quizQuestions.reduce((s, q, i) => s + (quizAnswers[i] === q.answer ? 1 : 0), 0) : 0;

  // ─── NOTES ───
  const [showNewNote, setShowNewNote] = useState(false);
  const [noteForm, setNoteForm] = useState({ title: "", content: "" });

  const saveNote = async () => {
    if (!user || !noteForm.content) return;
    await supabase.from("revision_notes" as any).insert({
      student_id: user.id,
      subject_id: subjectId,
      title: noteForm.title || t("Untitled Note", "ملاحظة بدون عنوان"),
      content: noteForm.content,
      is_private: true,
    } as any);
    setShowNewNote(false);
    setNoteForm({ title: "", content: "" });
    queryClient.invalidateQueries({ queryKey: ["revision-notes"] });
    toast({ title: t("Note saved!", "تم حفظ الملاحظة!") });
  };

  // ─── CREATE FLASHCARD (teacher) ───
  const [showNewCard, setShowNewCard] = useState(false);
  const [cardForm, setCardForm] = useState({ front: "", front_ar: "", back: "", back_ar: "", topic: "" });

  const saveFlashcard = async () => {
    if (!user || !cardForm.front || !cardForm.back) return;
    await supabase.from("revision_flashcards" as any).insert({
      subject_id: subjectId,
      front_text: cardForm.front,
      front_text_ar: cardForm.front_ar || null,
      back_text: cardForm.back,
      back_text_ar: cardForm.back_ar || null,
      topic: cardForm.topic || null,
      created_by: user.id,
      order_index: flashcards.length,
    } as any);
    setShowNewCard(false);
    setCardForm({ front: "", front_ar: "", back: "", back_ar: "", topic: "" });
    queryClient.invalidateQueries({ queryKey: ["revision-flashcards"] });
    toast({ title: t("Flashcard created!", "تم إنشاء البطاقة!") });
  };

  // Stats
  const knownCount = fcProgress.filter((p: any) => p.status === "known").length;
  const learningCount = fcProgress.filter((p: any) => p.status === "learning").length;
  const mastery = flashcards.length > 0 ? Math.round((knownCount / flashcards.length) * 100) : 0;
  const quizAvg = quizSessions.length > 0 ? Math.round(quizSessions.reduce((s: number, q: any) => s + Number(q.percentage || 0), 0) / quizSessions.length) : 0;

  if (isLoading) return <div className="container mx-auto px-4 py-8"><Skeleton className="h-64" /></div>;
  if (!subject) return <div className="container mx-auto px-4 py-16 text-center"><h2>{t("Subject not found", "المادة غير موجودة")}</h2></div>;

  // ─── FLASHCARD STUDY MODE UI ───
  if (studyMode && flashcards.length > 0) {
    const card = flashcards[currentCardIdx];
    return (
      <div className="container mx-auto px-4 py-8 max-w-lg space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setStudyMode(false)}><ArrowLeft className="h-4 w-4 me-1" />{t("Back", "رجوع")}</Button>
          <span className="text-sm text-muted-foreground">{currentCardIdx + 1} / {flashcards.length}</span>
        </div>
        <Progress value={((currentCardIdx + 1) / flashcards.length) * 100} className="h-2" />

        {/* Flip Card */}
        <div
          className="min-h-[250px] rounded-xl border-2 flex items-center justify-center p-8 cursor-pointer transition-all"
          style={{ borderColor: flipped ? '#c9973a' : '#064E3B', backgroundColor: flipped ? '#FFFBF0' : 'white' }}
          onClick={() => setFlipped(!flipped)}
        >
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-2">{flipped ? t("Answer", "الإجابة") : t("Question", "السؤال")}</p>
            <p className="text-xl font-semibold" style={{ fontFamily: "'Amiri', serif" }}>
              {flipped
                ? (language === "ar" ? card.back_text_ar || card.back_text : card.back_text)
                : (language === "ar" ? card.front_text_ar || card.front_text : card.front_text)
              }
            </p>
            {!flipped && <p className="text-xs text-muted-foreground mt-4">{t("Tap to flip", "اضغط لقلب البطاقة")}</p>}
          </div>
        </div>

        {flipped && (
          <div className="flex gap-3 justify-center">
            <Button variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => markCard("new")}>
              <XCircle className="h-4 w-4 me-1" /> {t("Still Learning", "لا أعرف")}
            </Button>
            <Button variant="outline" className="border-yellow-300 text-yellow-700 hover:bg-yellow-50" onClick={() => markCard("learning")}>
              🤔 {t("Almost", "تقريبًا")}
            </Button>
            <Button variant="outline" className="border-green-300 text-green-700 hover:bg-green-50" onClick={() => markCard("known")}>
              <CheckCircle className="h-4 w-4 me-1" /> {t("Know It", "أعرفها")}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ─── QUIZ MODE UI ───
  if (quizMode && quizQuestions.length > 0) {
    if (quizDone) {
      return (
        <div className="container mx-auto px-4 py-8 max-w-lg space-y-6 text-center">
          <h2 className="text-2xl font-bold" style={{ color: '#064E3B' }}>{t("Quiz Complete!", "انتهى الاختبار!")}</h2>
          <p className="text-4xl font-bold" style={{ color: quizScore >= quizQuestions.length * 0.7 ? '#059669' : '#DC2626' }}>
            {quizScore}/{quizQuestions.length}
          </p>
          <p className="text-muted-foreground">{Math.round((quizScore / quizQuestions.length) * 100)}%</p>
          <div className="space-y-2 text-left">
            {quizQuestions.map((q, i) => (
              <div key={i} className={`p-3 rounded-lg ${quizAnswers[i] === q.answer ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                <p className="text-sm font-medium">{q.question}</p>
                <p className="text-xs mt-1">{t("Your answer", "إجابتك")}: {quizAnswers[i]} {quizAnswers[i] === q.answer ? "✅" : `❌ → ${q.answer}`}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => startQuiz("flashcard")} className="gap-1"><RotateCcw className="h-4 w-4" />{t("Try Again", "أعد المحاولة")}</Button>
            <Button variant="outline" onClick={() => setQuizMode(false)}>{t("Done", "تم")}</Button>
          </div>
        </div>
      );
    }

    const q = quizQuestions[quizIdx];
    return (
      <div className="container mx-auto px-4 py-8 max-w-lg space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setQuizMode(false)}><ArrowLeft className="h-4 w-4 me-1" />{t("Exit Quiz", "خروج")}</Button>
          <span className="text-sm text-muted-foreground">{quizIdx + 1} / {quizQuestions.length}</span>
        </div>
        <Progress value={((quizIdx + 1) / quizQuestions.length) * 100} className="h-2" />
        <Card>
          <CardContent className="p-6 space-y-4">
            <p className="text-lg font-semibold" style={{ fontFamily: "'Amiri', serif" }}>{q.question}</p>
            <div className="space-y-2">
              {q.options.map((opt: string, oi: number) => (
                <Button key={oi} variant="outline" className="w-full justify-start text-left h-auto py-3" onClick={() => submitQuizAnswer(opt)}>
                  {opt}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── MAIN VIEW ───
  return (
    <div className="container mx-auto px-4 py-6 md:py-8 space-y-6">
      <Link to="/student/revision" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 me-1" /> {t("Back to Revision Hub", "العودة لمركز المراجعة")}
      </Link>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold" style={{ fontFamily: language === "ar" ? "'Amiri', serif" : "'Playfair Display', serif", color: '#064E3B' }}>
          {language === "ar" ? subject.title_ar || subject.title : subject.title} — {t("Revision", "مراجعة")}
        </h1>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="flashcards">🃏 {t("Flashcards", "بطاقات")}</TabsTrigger>
          <TabsTrigger value="quiz">📝 {t("Quick Quiz", "اختبار سريع")}</TabsTrigger>
          <TabsTrigger value="summaries">📄 {t("Summaries", "ملخصات")}</TabsTrigger>
          <TabsTrigger value="notes">📓 {t("My Notes", "ملاحظاتي")}</TabsTrigger>
          <TabsTrigger value="progress">📊 {t("Progress", "التقدم")}</TabsTrigger>
        </TabsList>

        {/* ═══ FLASHCARDS TAB ═══ */}
        <TabsContent value="flashcards" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{flashcards.length} {t("cards", "بطاقة")} • {mastery}% {t("mastered", "أُتقنت")}</p>
              <Progress value={mastery} className="h-2 w-40 mt-1" />
            </div>
            <div className="flex gap-2">
              {flashcards.length > 0 && (
                <Button onClick={startStudy} style={{ backgroundColor: '#064E3B' }} className="text-white gap-1">
                  <Layers className="h-4 w-4" /> {t("Study Cards", "ادرس البطاقات")}
                </Button>
              )}
              {(isTeacher || true) && (
                <Dialog open={showNewCard} onOpenChange={setShowNewCard}>
                  <DialogTrigger asChild><Button variant="outline" className="gap-1"><Plus className="h-4 w-4" />{t("Add Card", "أضف بطاقة")}</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>{t("New Flashcard", "بطاقة جديدة")}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div><Label>{t("Front (Question)", "الأمام (السؤال)")}</Label><Textarea value={cardForm.front} onChange={e => setCardForm(p => ({ ...p, front: e.target.value }))} /></div>
                      <div><Label>{t("Front Arabic", "الأمام بالعربي")}</Label><Textarea dir="rtl" value={cardForm.front_ar} onChange={e => setCardForm(p => ({ ...p, front_ar: e.target.value }))} /></div>
                      <div><Label>{t("Back (Answer)", "الخلف (الإجابة)")}</Label><Textarea value={cardForm.back} onChange={e => setCardForm(p => ({ ...p, back: e.target.value }))} /></div>
                      <div><Label>{t("Back Arabic", "الخلف بالعربي")}</Label><Textarea dir="rtl" value={cardForm.back_ar} onChange={e => setCardForm(p => ({ ...p, back_ar: e.target.value }))} /></div>
                      <div><Label>{t("Topic", "الموضوع")}</Label><Input value={cardForm.topic} onChange={e => setCardForm(p => ({ ...p, topic: e.target.value }))} /></div>
                      <Button onClick={saveFlashcard} className="w-full">{t("Save", "حفظ")}</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          {flashcards.length === 0 ? (
            <div className="text-center py-12">
              <Layers className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">{t("No flashcards yet. Add some to start studying!", "لا توجد بطاقات بعد. أضف بعضها لتبدأ الدراسة!")}</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {flashcards.map((card: any) => {
                const prog = fcProgress.find((p: any) => p.flashcard_id === card.id);
                const statusColors: Record<string, string> = { known: "bg-green-100 text-green-800", learning: "bg-yellow-100 text-yellow-800", new: "bg-muted text-muted-foreground" };
                return (
                  <Card key={card.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <p className="font-medium text-sm" style={{ fontFamily: "'Amiri', serif" }}>
                          {language === "ar" ? card.front_text_ar || card.front_text : card.front_text}
                        </p>
                        <Badge className={statusColors[prog?.status || "new"] || statusColors.new} variant="secondary">
                          {prog?.status || "new"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{language === "ar" ? card.back_text_ar || card.back_text : card.back_text}</p>
                      {card.topic && <Badge variant="outline" className="mt-2 text-xs">{card.topic}</Badge>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══ QUICK QUIZ TAB ═══ */}
        <TabsContent value="quiz" className="space-y-4 mt-4">
          <div className="text-center py-8 space-y-4">
            <h3 className="text-lg font-semibold" style={{ color: '#064E3B' }}>{t("Choose Quiz Source", "اختر مصدر الاختبار")}</h3>
            <div className="grid md:grid-cols-2 gap-3 max-w-md mx-auto">
              <Button variant="outline" className="h-20 flex-col gap-1" onClick={() => startQuiz("flashcard")} disabled={flashcards.length < 4}>
                🃏 <span className="text-xs">{t("From Flashcards", "من البطاقات")}</span>
                <span className="text-xs text-muted-foreground">{flashcards.length} {t("cards", "بطاقة")}</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-1" disabled>
                📋 <span className="text-xs">{t("From Past Exams", "من الامتحانات السابقة")}</span>
                <span className="text-xs text-muted-foreground">{t("Coming soon", "قريبًا")}</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-1" disabled>
                🧪 <span className="text-xs">{t("From Past Tests", "من التمرينات السابقة")}</span>
                <span className="text-xs text-muted-foreground">{t("Coming soon", "قريبًا")}</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-1" disabled>
                🎲 <span className="text-xs">{t("Mixed", "مختلط")}</span>
                <span className="text-xs text-muted-foreground">{t("Coming soon", "قريبًا")}</span>
              </Button>
            </div>
          </div>

          {/* Recent Quiz History */}
          {quizSessions.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3">{t("Quiz History", "سجل الاختبارات")}</h3>
              <div className="space-y-2">
                {quizSessions.slice(0, 5).map((q: any) => (
                  <Card key={q.id}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{q.source} {t("quiz", "اختبار")}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(q.completed_at), "MMM d, h:mm a")}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold" style={{ color: Number(q.percentage) >= 70 ? '#059669' : '#DC2626' }}>{q.score}/{q.total}</p>
                        <p className="text-xs text-muted-foreground">{Math.round(q.percentage || 0)}%</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══ SUMMARIES TAB ═══ */}
        <TabsContent value="summaries" className="space-y-4 mt-4">
          {summaries.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">{t("No summaries available yet", "لا توجد ملخصات بعد")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {summaries.map((s: any) => (
                <Card key={s.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-sm">{language === "ar" ? s.title_ar || s.title : s.title}</h4>
                        {s.topic && <Badge variant="outline" className="mt-1 text-xs">{s.topic}</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{s.type}</Badge>
                        {s.is_ai_generated && <Badge className="bg-purple-100 text-purple-800 text-xs">AI</Badge>}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {language === "ar" ? s.content_ar || s.content : s.content}
                    </p>
                    <p className="text-xs text-muted-foreground">{format(new Date(s.created_at), "MMM d, yyyy")}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══ MY NOTES TAB ═══ */}
        <TabsContent value="notes" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Dialog open={showNewNote} onOpenChange={setShowNewNote}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-1"><Plus className="h-4 w-4" />{t("New Note", "ملاحظة جديدة")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t("New Note", "ملاحظة جديدة")}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>{t("Title", "العنوان")}</Label><Input value={noteForm.title} onChange={e => setNoteForm(p => ({ ...p, title: e.target.value }))} /></div>
                  <div><Label>{t("Content", "المحتوى")}</Label><Textarea rows={6} value={noteForm.content} onChange={e => setNoteForm(p => ({ ...p, content: e.target.value }))} /></div>
                  <Button onClick={saveNote} className="w-full">{t("Save Note", "حفظ الملاحظة")}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {notes.length === 0 ? (
            <div className="text-center py-12">
              <StickyNote className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">{t("No notes yet. Start writing!", "لا توجد ملاحظات بعد. ابدأ الكتابة!")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((note: any) => (
                <Card key={note.id}>
                  <CardContent className="p-4">
                    <h4 className="font-medium text-sm">{note.title || t("Untitled", "بدون عنوان")}</h4>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{note.content}</p>
                    <p className="text-xs text-muted-foreground mt-2">{format(new Date(note.updated_at || note.created_at), "MMM d, yyyy h:mm a")}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══ PROGRESS TAB ═══ */}
        <TabsContent value="progress" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: '#064E3B' }}>{knownCount}/{flashcards.length}</p>
              <p className="text-xs text-muted-foreground">{t("Flashcards Mastered", "بطاقات أُتقنت")}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: '#064E3B' }}>{quizAvg}%</p>
              <p className="text-xs text-muted-foreground">{t("Quiz Average", "معدل الاختبارات")}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: '#064E3B' }}>{quizSessions.length}</p>
              <p className="text-xs text-muted-foreground">{t("Quizzes Taken", "اختبارات مُنجزة")}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: '#064E3B' }}>{notes.length}</p>
              <p className="text-xs text-muted-foreground">{t("Notes Written", "ملاحظات مكتوبة")}</p>
            </CardContent></Card>
          </div>

          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold">{t("Mastery Breakdown", "تفصيل الإتقان")}</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" />{t("Known", "معروفة")}</span><span>{knownCount}</span></div>
                <div className="flex justify-between text-sm"><span className="flex items-center gap-1">🤔 {t("Learning", "قيد التعلم")}</span><span>{learningCount}</span></div>
                <div className="flex justify-between text-sm"><span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-muted-foreground" />{t("New", "جديدة")}</span><span>{flashcards.length - knownCount - learningCount}</span></div>
              </div>
              <Progress value={mastery} className="h-3" />
              <p className="text-xs text-center text-muted-foreground">{mastery}% {t("mastered", "أُتقنت")}</p>
            </CardContent>
          </Card>

          {quizSessions.length > 0 && (
            <Card>
              <CardContent className="p-5 space-y-3">
                <h3 className="font-semibold">{t("Recent Quiz Scores", "نتائج الاختبارات الأخيرة")}</h3>
                <div className="space-y-2">
                  {quizSessions.slice(0, 10).map((q: any) => (
                    <div key={q.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{format(new Date(q.completed_at), "MMM d")}</span>
                      <div className="flex-1 mx-3"><Progress value={Number(q.percentage || 0)} className="h-2" /></div>
                      <span className="font-medium" style={{ color: Number(q.percentage) >= 70 ? '#059669' : '#DC2626' }}>{Math.round(q.percentage || 0)}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RevisionRoom;
