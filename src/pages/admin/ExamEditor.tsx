import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, GripVertical } from "lucide-react";

interface QuestionForm {
  id?: string;
  question_type: string;
  question_text: string;
  question_text_ar: string;
  options: any[];
  correct_answer: string;
  points: number;
  difficulty: string;
  sort_order: number;
  explanation: string;
  media_url: string;
}

const emptyQuestion = (): QuestionForm => ({
  question_type: "mcq",
  question_text: "",
  question_text_ar: "",
  options: [
    { id: "a", text: "", text_ar: "", is_correct: false },
    { id: "b", text: "", text_ar: "", is_correct: false },
    { id: "c", text: "", text_ar: "", is_correct: false },
    { id: "d", text: "", text_ar: "", is_correct: false },
  ],
  correct_answer: "",
  points: 1,
  difficulty: "medium",
  sort_order: 0,
  explanation: "",
  media_url: "",
});

const ExamEditor = () => {
  const { examId } = useParams<{ examId: string }>();
  const isEdit = !!examId;
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [examForm, setExamForm] = useState({
    title: "", title_ar: "", description: "", description_ar: "",
    time_limit_minutes: 60, passing_score: 50, max_attempts: 1,
    randomize_questions: false, randomize_answers: false,
    show_results_immediately: true, allow_review: true,
    display_mode: "one_at_a_time",
    guidelines: "", guidelines_ar: "",
    start_date: "", end_date: "",
  });
  const [questions, setQuestions] = useState<QuestionForm[]>([emptyQuestion()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    const load = async () => {
      const { data: exam } = await supabase.from("exams").select("*").eq("id", examId).single();
      if (exam) {
        setExamForm({
          title: exam.title || "", title_ar: exam.title_ar || "",
          description: exam.description || "", description_ar: exam.description_ar || "",
          time_limit_minutes: exam.time_limit_minutes || 60,
          passing_score: exam.passing_score || 50,
          max_attempts: exam.max_attempts || 1,
          randomize_questions: exam.randomize_questions || false,
          randomize_answers: exam.randomize_answers || false,
          show_results_immediately: exam.show_results_immediately ?? true,
          allow_review: exam.allow_review ?? true,
          display_mode: exam.display_mode || "one_at_a_time",
          guidelines: exam.guidelines || "", guidelines_ar: exam.guidelines_ar || "",
          start_date: exam.start_date ? new Date(exam.start_date).toISOString().slice(0, 16) : "",
          end_date: exam.end_date ? new Date(exam.end_date).toISOString().slice(0, 16) : "",
        });
      }
      const { data: qs } = await supabase.from("exam_questions").select("*").eq("exam_id", examId).order("sort_order");
      if (qs?.length) {
        setQuestions(qs.map((q) => ({
          id: q.id,
          question_type: q.question_type,
          question_text: q.question_text,
          question_text_ar: q.question_text_ar || "",
          options: (q.options as any[]) || [],
          correct_answer: q.correct_answer || "",
          points: q.points || 1,
          difficulty: q.difficulty || "medium",
          sort_order: q.sort_order || 0,
          explanation: q.explanation || "",
          media_url: q.media_url || "",
        })));
      }
    };
    load();
  }, [examId]);

  const handleSave = async () => {
    if (!examForm.title) { toast({ title: t("Error", "خطأ"), description: t("Title is required", "العنوان مطلوب"), variant: "destructive" }); return; }
    setSaving(true);

    let eid = examId;
    if (isEdit) {
      await supabase.from("exams").update({
        ...examForm,
        start_date: examForm.start_date || null,
        end_date: examForm.end_date || null,
      }).eq("id", examId);
    } else {
      const { data } = await supabase.from("exams").insert({
        ...examForm,
        created_by: user!.id,
        start_date: examForm.start_date || null,
        end_date: examForm.end_date || null,
      }).select("id").single();
      eid = data?.id;
    }

    if (eid) {
      // Delete old questions and re-insert (simplicity)
      if (isEdit) await supabase.from("exam_questions").delete().eq("exam_id", eid);
      const qInserts = questions.map((q, i) => ({
        exam_id: eid!,
        question_type: q.question_type,
        question_text: q.question_text,
        question_text_ar: q.question_text_ar || null,
        options: q.question_type === "mcq" ? q.options : null,
        correct_answer: q.correct_answer || null,
        points: q.points,
        difficulty: q.difficulty,
        sort_order: i,
        explanation: q.explanation || null,
        media_url: q.media_url || null,
      }));
      await supabase.from("exam_questions").insert(qInserts);
    }

    setSaving(false);
    toast({ title: t("Exam saved!", "تم حفظ الامتحان!") });
    navigate("/admin/exams");
  };

  const addQuestion = () => setQuestions([...questions, { ...emptyQuestion(), sort_order: questions.length }]);
  const removeQuestion = (idx: number) => setQuestions(questions.filter((_, i) => i !== idx));
  const updateQuestion = (idx: number, updates: Partial<QuestionForm>) => {
    const copy = [...questions];
    copy[idx] = { ...copy[idx], ...updates };
    setQuestions(copy);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">{isEdit ? t("Edit Exam", "تعديل الامتحان") : t("Create Exam", "إنشاء امتحان")}</h1>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {t("Save Exam", "حفظ الامتحان")}
        </Button>
      </div>

      {/* Exam settings */}
      <Card className="mb-6">
        <CardHeader><CardTitle>{t("Exam Settings", "إعدادات الامتحان")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>{t("Title (English)", "العنوان (إنجليزي)")}</Label>
              <Input value={examForm.title} onChange={(e) => setExamForm({ ...examForm, title: e.target.value })} />
            </div>
            <div>
              <Label>{t("Title (Arabic)", "العنوان (عربي)")}</Label>
              <Input value={examForm.title_ar} onChange={(e) => setExamForm({ ...examForm, title_ar: e.target.value })} dir="rtl" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>{t("Description", "الوصف")}</Label>
              <Textarea value={examForm.description} onChange={(e) => setExamForm({ ...examForm, description: e.target.value })} />
            </div>
            <div>
              <Label>{t("Description (Arabic)", "الوصف (عربي)")}</Label>
              <Textarea value={examForm.description_ar} onChange={(e) => setExamForm({ ...examForm, description_ar: e.target.value })} dir="rtl" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <Label>{t("Time Limit (min)", "الحد الزمني (دقيقة)")}</Label>
              <Input type="number" value={examForm.time_limit_minutes} onChange={(e) => setExamForm({ ...examForm, time_limit_minutes: +e.target.value })} />
            </div>
            <div>
              <Label>{t("Passing Score (%)", "درجة النجاح (%)")}</Label>
              <Input type="number" value={examForm.passing_score} onChange={(e) => setExamForm({ ...examForm, passing_score: +e.target.value })} />
            </div>
            <div>
              <Label>{t("Max Attempts", "أقصى محاولات")}</Label>
              <Input type="number" value={examForm.max_attempts} onChange={(e) => setExamForm({ ...examForm, max_attempts: +e.target.value })} />
            </div>
            <div>
              <Label>{t("Display Mode", "وضع العرض")}</Label>
              <Select value={examForm.display_mode} onValueChange={(v) => setExamForm({ ...examForm, display_mode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_at_a_time">{t("One at a time", "واحد في كل مرة")}</SelectItem>
                  <SelectItem value="all_at_once">{t("All at once", "الكل مرة واحدة")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>{t("Start Date", "تاريخ البدء")}</Label>
              <Input type="datetime-local" value={examForm.start_date} onChange={(e) => setExamForm({ ...examForm, start_date: e.target.value })} />
            </div>
            <div>
              <Label>{t("End Date", "تاريخ الانتهاء")}</Label>
              <Input type="datetime-local" value={examForm.end_date} onChange={(e) => setExamForm({ ...examForm, end_date: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            {[
              { key: "randomize_questions", label: t("Randomize Questions", "ترتيب عشوائي للأسئلة") },
              { key: "randomize_answers", label: t("Randomize Answers", "ترتيب عشوائي للإجابات") },
              { key: "show_results_immediately", label: t("Show Results Immediately", "عرض النتائج فورًا") },
              { key: "allow_review", label: t("Allow Review", "السماح بالمراجعة") },
            ].map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <Switch checked={(examForm as any)[s.key]} onCheckedChange={(v) => setExamForm({ ...examForm, [s.key]: v })} />
                <Label className="text-sm">{s.label}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{t("Questions", "الأسئلة")} ({questions.length})</h2>
          <Button variant="outline" onClick={addQuestion}>
            <Plus className="mr-2 h-4 w-4" />{t("Add Question", "إضافة سؤال")}
          </Button>
        </div>

        {questions.map((q, idx) => (
          <Card key={idx}>
            <CardContent className="p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="outline">{t("Question", "سؤال")} {idx + 1}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={q.question_type} onValueChange={(v) => updateQuestion(idx, { question_type: v })}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["mcq", "true_false", "short_answer", "essay", "fill_blank"].map((type) => (
                        <SelectItem key={type} value={type}>{type.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={q.difficulty} onValueChange={(v) => updateQuestion(idx, { difficulty: v })}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">{t("Easy", "سهل")}</SelectItem>
                      <SelectItem value="medium">{t("Medium", "متوسط")}</SelectItem>
                      <SelectItem value="hard">{t("Hard", "صعب")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" className="w-20" placeholder={t("Points", "نقاط")} value={q.points} onChange={(e) => updateQuestion(idx, { points: +e.target.value })} />
                  <Button variant="ghost" size="icon" onClick={() => removeQuestion(idx)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <Input placeholder={t("Question text (English)", "نص السؤال (إنجليزي)")} value={q.question_text} onChange={(e) => updateQuestion(idx, { question_text: e.target.value })} />
                <Input placeholder={t("Question text (Arabic)", "نص السؤال (عربي)")} value={q.question_text_ar} onChange={(e) => updateQuestion(idx, { question_text_ar: e.target.value })} dir="rtl" />

                {q.question_type === "mcq" && (
                  <div className="space-y-2">
                    {q.options.map((opt: any, oi: number) => (
                      <div key={opt.id} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${idx}`}
                          checked={opt.is_correct}
                          onChange={() => {
                            const newOpts = q.options.map((o: any, j: number) => ({ ...o, is_correct: j === oi }));
                            updateQuestion(idx, { options: newOpts });
                          }}
                        />
                        <Input
                          className="flex-1"
                          placeholder={`${t("Option", "خيار")} ${String.fromCharCode(65 + oi)}`}
                          value={opt.text}
                          onChange={(e) => {
                            const newOpts = [...q.options];
                            newOpts[oi] = { ...newOpts[oi], text: e.target.value };
                            updateQuestion(idx, { options: newOpts });
                          }}
                        />
                        <Input
                          className="flex-1"
                          placeholder={`${t("Option", "خيار")} ${String.fromCharCode(65 + oi)} (${t("Arabic", "عربي")})`}
                          value={opt.text_ar}
                          dir="rtl"
                          onChange={(e) => {
                            const newOpts = [...q.options];
                            newOpts[oi] = { ...newOpts[oi], text_ar: e.target.value };
                            updateQuestion(idx, { options: newOpts });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {(q.question_type === "true_false" || q.question_type === "fill_blank") && (
                  <Input
                    placeholder={t("Correct Answer", "الإجابة الصحيحة")}
                    value={q.correct_answer}
                    onChange={(e) => updateQuestion(idx, { correct_answer: e.target.value })}
                  />
                )}

                <Input
                  placeholder={t("Explanation (optional)", "التوضيح (اختياري)")}
                  value={q.explanation}
                  onChange={(e) => updateQuestion(idx, { explanation: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ExamEditor;
