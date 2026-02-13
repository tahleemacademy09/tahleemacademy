import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, GripVertical, Music, FileText, Calendar, Settings2, Upload, Download, Image, Loader2 } from "lucide-react";

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
  explanation_ar: string;
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
  explanation_ar: "",
  media_url: "",
});

const questionTypes = [
  { value: "mcq", label: "Multiple Choice", label_ar: "اختيار من متعدد", icon: "📝" },
  { value: "true_false", label: "True / False", label_ar: "صح / خطأ", icon: "✓✗" },
  { value: "short_answer", label: "Short Answer", label_ar: "إجابة قصيرة", icon: "📝" },
  { value: "essay", label: "Essay", label_ar: "مقال", icon: "📄" },
  { value: "fill_blank", label: "Fill in Blank", label_ar: "ملء الفراغ", icon: "___" },
  { value: "audio", label: "Audio / Dictation", label_ar: "صوت / إملاء", icon: "🎧" },
];

// Convert a Date to local datetime-local input format (YYYY-MM-DDTHH:MM)
const toLocalDatetimeString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
};

const ExamEditor = () => {
  const { examId } = useParams<{ examId: string }>();
  const isEdit = !!examId;
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  const [examForm, setExamForm] = useState({
    title: "", title_ar: "", description: "", description_ar: "",
    time_limit_minutes: 60, passing_score: 50, max_attempts: 1,
    randomize_questions: false, randomize_answers: false,
    show_results_immediately: true, allow_review: true,
    display_mode: "one_at_a_time",
    guidelines: "", guidelines_ar: "",
    start_date: "", end_date: "",
    proctoring_enabled: false, fullscreen_required: false,
    tab_switch_limit: 3, max_warnings: 3,
    auto_submit_on_violation: false,
    screenshot_interval_seconds: 0,
  });
  const [questions, setQuestions] = useState<QuestionForm[]>([emptyQuestion()]);
  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState<number | null>(null);

  useEffect(() => {
    if (!isEdit) return;
    const load = async () => {
      const { data: exam } = await supabase.from("exams").select("*").eq("id", examId).maybeSingle();
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
          start_date: exam.start_date ? toLocalDatetimeString(new Date(exam.start_date)) : "",
          end_date: exam.end_date ? toLocalDatetimeString(new Date(exam.end_date)) : "",
          proctoring_enabled: (exam as any).proctoring_enabled || false,
          fullscreen_required: (exam as any).fullscreen_required || false,
          tab_switch_limit: (exam as any).tab_switch_limit || 3,
          max_warnings: (exam as any).max_warnings || 3,
          auto_submit_on_violation: (exam as any).auto_submit_on_violation || false,
          screenshot_interval_seconds: (exam as any).screenshot_interval_seconds || 0,
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
          explanation_ar: q.explanation_ar || "",
          media_url: q.media_url || "",
        })));
      }
    };
    load();
  }, [examId]);

  const handleSave = async () => {
    if (!examForm.title) {
      toast({ title: t("Error", "خطأ"), description: t("Title is required", "العنوان مطلوب"), variant: "destructive" });
      return;
    }
    setSaving(true);

    try {
      let eid = examId;
      if (isEdit) {
        const { error } = await supabase.from("exams").update({
          ...examForm,
          start_date: examForm.start_date ? new Date(examForm.start_date).toISOString() : null,
          end_date: examForm.end_date ? new Date(examForm.end_date).toISOString() : null,
        }).eq("id", examId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("exams").insert({
          ...examForm,
          created_by: user!.id,
          start_date: examForm.start_date ? new Date(examForm.start_date).toISOString() : null,
          end_date: examForm.end_date ? new Date(examForm.end_date).toISOString() : null,
        }).select("id").single();
        if (error) throw error;
        eid = data?.id;
      }

      if (eid) {
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
          explanation_ar: q.explanation_ar || null,
          media_url: q.media_url || null,
        }));
        const { error } = await supabase.from("exam_questions").insert(qInserts);
        if (error) throw error;
      }

      toast({ title: t("✅ Exam saved!", "✅ تم حفظ الامتحان!") });
      navigate("/admin/exams");
    } catch (err: any) {
      toast({ title: t("Error saving exam", "خطأ في حفظ الامتحان"), description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addQuestion = () => setQuestions([...questions, { ...emptyQuestion(), sort_order: questions.length }]);
  const removeQuestion = (idx: number) => setQuestions(questions.filter((_, i) => i !== idx));
  const updateQuestion = (idx: number, updates: Partial<QuestionForm>) => {
    const copy = [...questions];
    copy[idx] = { ...copy[idx], ...updates };
    setQuestions(copy);
  };

  // Media upload handler
  const uploadMedia = async (file: File, questionIdx: number) => {
    setUploadingMedia(questionIdx);
    const ext = file.name.split(".").pop();
    const path = `questions/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { data, error } = await supabase.storage.from("exam-media").upload(path, file);
    if (error) {
      toast({ title: t("Upload failed", "فشل الرفع"), description: error.message, variant: "destructive" });
      setUploadingMedia(null);
      return;
    }

    const { data: urlData } = supabase.storage.from("exam-media").getPublicUrl(path);
    updateQuestion(questionIdx, { media_url: urlData.publicUrl });
    toast({ title: t("✅ File uploaded!", "✅ تم رفع الملف!") });
    setUploadingMedia(null);
  };

  // Bulk question import
  const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        let imported: any[];

        if (file.name.endsWith(".json")) {
          imported = JSON.parse(text);
        } else {
          // CSV parsing
          const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
          const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
          imported = lines.slice(1).map(line => {
            const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
            const obj: any = {};
            headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
            return obj;
          });
        }

        const newQuestions: QuestionForm[] = imported.map((item: any, i: number) => {
          const q = emptyQuestion();
          q.question_type = item.question_type || item.type || "mcq";
          q.question_text = item.question_text || item.question || "";
          q.question_text_ar = item.question_text_ar || item.question_ar || "";
          q.correct_answer = item.correct_answer || item.answer || "";
          q.points = Number(item.points) || 1;
          q.difficulty = item.difficulty || "medium";
          q.sort_order = questions.length + i;
          q.explanation = item.explanation || "";
          q.explanation_ar = item.explanation_ar || "";

          // Parse MCQ options
          if (q.question_type === "mcq") {
            const opts = [];
            for (const key of ["a", "b", "c", "d"]) {
              if (item[`option_${key}`] || item[key]) {
                opts.push({
                  id: key,
                  text: item[`option_${key}`] || item[key] || "",
                  text_ar: item[`option_${key}_ar`] || "",
                  is_correct: q.correct_answer.toLowerCase() === key,
                });
              }
            }
            if (opts.length > 0) q.options = opts;
          }

          return q;
        });

        setQuestions(prev => [...prev, ...newQuestions]);
        toast({ title: t(`✅ Imported ${newQuestions.length} questions!`, `✅ تم استيراد ${newQuestions.length} سؤال!`) });
      } catch (err) {
        toast({ title: t("Import failed", "فشل الاستيراد"), description: t("Invalid file format", "تنسيق الملف غير صالح"), variant: "destructive" });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Download template
  const downloadTemplate = (format: "csv" | "json") => {
    if (format === "json") {
      const template = [
        {
          question_type: "mcq",
          question_text: "What is the Arabic word for 'book'?",
          question_text_ar: "ما هي الكلمة العربية لـ 'كتاب'؟",
          option_a: "كِتَاب", option_a_ar: "كِتَاب",
          option_b: "قَلَم", option_b_ar: "قَلَم",
          option_c: "بَاب", option_c_ar: "بَاب",
          option_d: "مَاء", option_d_ar: "مَاء",
          correct_answer: "a",
          points: 1, difficulty: "easy",
          explanation: "كِتَاب means book", explanation_ar: "كِتَاب تعني كتاب"
        },
        {
          question_type: "true_false",
          question_text: "The Arabic alphabet has 28 letters.",
          question_text_ar: "الأبجدية العربية تتكون من 28 حرفًا.",
          correct_answer: "true",
          points: 1, difficulty: "easy",
          explanation: "", explanation_ar: ""
        },
        {
          question_type: "fill_blank",
          question_text: "The word for 'peace' in Arabic is ___.",
          question_text_ar: "كلمة 'سلام' بالعربية هي ___.",
          correct_answer: "سَلَام",
          points: 2, difficulty: "medium",
          explanation: "", explanation_ar: ""
        },
        {
          question_type: "short_answer",
          question_text: "Write a sentence using the word 'مَدْرَسَة'.",
          question_text_ar: "اكتب جملة باستخدام كلمة 'مَدْرَسَة'.",
          correct_answer: "",
          points: 3, difficulty: "medium",
          explanation: "", explanation_ar: ""
        }
      ];
      const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "questions_template.json"; a.click();
    } else {
      const csv = `question_type,question_text,question_text_ar,option_a,option_b,option_c,option_d,correct_answer,points,difficulty,explanation,explanation_ar
mcq,"What is 'book' in Arabic?","ما هي كلمة 'كتاب' بالعربية؟","كِتَاب","قَلَم","بَاب","مَاء",a,1,easy,"كِتَاب means book",""
true_false,"Arabic is written right to left.","العربية تُكتب من اليمين لليسار.",,,,,true,1,easy,"",""
fill_blank,"The word for 'water' is ___.","كلمة 'ماء' هي ___.",,,,,مَاء,2,medium,"",""`;
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "questions_template.csv"; a.click();
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold">{isEdit ? t("Edit Exam", "تعديل الامتحان") : t("Create Exam", "إنشاء امتحان")}</h1>
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {t("Save Exam", "حفظ الامتحان")}
        </Button>
      </div>

      <Tabs defaultValue="settings" className="space-y-6">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="settings" className="gap-2"><Settings2 className="h-4 w-4" />{t("Settings", "الإعدادات")}</TabsTrigger>
          <TabsTrigger value="proctoring" className="gap-2">🛡️ {t("Proctoring", "المراقبة")}</TabsTrigger>
          <TabsTrigger value="schedule" className="gap-2"><Calendar className="h-4 w-4" />{t("Schedule", "الجدولة")}</TabsTrigger>
          <TabsTrigger value="questions" className="gap-2"><FileText className="h-4 w-4" />{t("Questions", "الأسئلة")} ({questions.length})</TabsTrigger>
        </TabsList>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <Card>
            <CardHeader><CardTitle>{t("Exam Details", "تفاصيل الامتحان")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>{t("Title (English)", "العنوان (إنجليزي)")}</Label>
                  <Input value={examForm.title} onChange={(e) => setExamForm({ ...examForm, title: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>{t("Title (Arabic)", "العنوان (عربي)")}</Label>
                  <Input value={examForm.title_ar} onChange={(e) => setExamForm({ ...examForm, title_ar: e.target.value })} dir="rtl" className="mt-1" />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>{t("Description", "الوصف")}</Label>
                  <Textarea value={examForm.description} onChange={(e) => setExamForm({ ...examForm, description: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>{t("Description (Arabic)", "الوصف (عربي)")}</Label>
                  <Textarea value={examForm.description_ar} onChange={(e) => setExamForm({ ...examForm, description_ar: e.target.value })} dir="rtl" className="mt-1" />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <Label>{t("Time Limit (min)", "الحد الزمني (دقيقة)")}</Label>
                  <Input type="number" value={examForm.time_limit_minutes} onChange={(e) => setExamForm({ ...examForm, time_limit_minutes: +e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>{t("Passing Score (%)", "درجة النجاح (%)")}</Label>
                  <Input type="number" value={examForm.passing_score} onChange={(e) => setExamForm({ ...examForm, passing_score: +e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>{t("Max Attempts", "أقصى محاولات")}</Label>
                  <Input type="number" value={examForm.max_attempts} onChange={(e) => setExamForm({ ...examForm, max_attempts: +e.target.value })} className="mt-1" min={1} />
                </div>
                <div>
                  <Label>{t("Display Mode", "وضع العرض")}</Label>
                  <Select value={examForm.display_mode} onValueChange={(v) => setExamForm({ ...examForm, display_mode: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one_at_a_time">{t("One at a time", "واحد في كل مرة")}</SelectItem>
                      <SelectItem value="all_at_once">{t("All at once", "الكل مرة واحدة")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>{t("Guidelines (English)", "الإرشادات (إنجليزي)")}</Label>
                  <Textarea value={examForm.guidelines} onChange={(e) => setExamForm({ ...examForm, guidelines: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>{t("Guidelines (Arabic)", "الإرشادات (عربي)")}</Label>
                  <Textarea value={examForm.guidelines_ar} onChange={(e) => setExamForm({ ...examForm, guidelines_ar: e.target.value })} dir="rtl" className="mt-1" />
                </div>
              </div>
              <div className="flex flex-wrap gap-6 pt-2">
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
        </TabsContent>

        {/* Proctoring Tab */}
        <TabsContent value="proctoring">
          <Card>
            <CardHeader><CardTitle>🛡️ {t("Proctoring Settings", "إعدادات المراقبة")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-6">
                {[
                  { key: "proctoring_enabled", label: t("Enable Proctoring", "تفعيل المراقبة") },
                  { key: "fullscreen_required", label: t("Require Fullscreen", "إلزام ملء الشاشة") },
                  { key: "auto_submit_on_violation", label: t("Auto-Submit on Max Violations", "تقديم تلقائي عند الحد الأقصى") },
                ].map((s) => (
                  <div key={s.key} className="flex items-center gap-2">
                    <Switch checked={(examForm as any)[s.key]} onCheckedChange={(v) => setExamForm({ ...examForm, [s.key]: v })} />
                    <Label className="text-sm">{s.label}</Label>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label>{t("Tab Switch Limit", "حد تبديل النوافذ")}</Label>
                  <Input type="number" value={examForm.tab_switch_limit} onChange={(e) => setExamForm({ ...examForm, tab_switch_limit: +e.target.value })} className="mt-1" min={1} />
                </div>
                <div>
                  <Label>{t("Max Warnings", "أقصى تحذيرات")}</Label>
                  <Input type="number" value={examForm.max_warnings} onChange={(e) => setExamForm({ ...examForm, max_warnings: +e.target.value })} className="mt-1" min={1} />
                </div>
                <div>
                  <Label>{t("Screenshot Interval (sec, 0=off)", "فترة لقطة الشاشة (ثانية، 0=إيقاف)")}</Label>
                  <Input type="number" value={examForm.screenshot_interval_seconds} onChange={(e) => setExamForm({ ...examForm, screenshot_interval_seconds: +e.target.value })} className="mt-1" min={0} />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {t(
                  "When proctoring is enabled, students will be monitored for tab switches, fullscreen exits, copy/paste, right-click, and developer tools usage. All violations are logged with timestamps.",
                  "عند تفعيل المراقبة، ستتم مراقبة الطلاب لتبديل النوافذ، الخروج من ملء الشاشة، النسخ/اللصق، النقر بزر الماوس الأيمن، واستخدام أدوات المطور. يتم تسجيل جميع المخالفات مع الطوابع الزمنية."
                )}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Schedule Tab */}
        <TabsContent value="schedule">
          <Card>
            <CardHeader><CardTitle>{t("Exam Schedule", "جدول الامتحان")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>{t("Start Date & Time", "تاريخ ووقت البدء")}</Label>
                  <Input type="datetime-local" value={examForm.start_date} onChange={(e) => setExamForm({ ...examForm, start_date: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>{t("End Date & Time", "تاريخ ووقت الانتهاء")}</Label>
                  <Input type="datetime-local" value={examForm.end_date} onChange={(e) => setExamForm({ ...examForm, end_date: e.target.value })} className="mt-1" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {t(
                  "Set the window during which students can take this exam. Leave blank for no restrictions. Times are in your local timezone.",
                  "حدد النافذة الزمنية التي يمكن للطلاب فيها أداء هذا الامتحان. اتركها فارغة بدون قيود. الأوقات بتوقيتك المحلي."
                )}
              </p>
              {(examForm.start_date || examForm.end_date) && (
                <div className="rounded-lg border bg-accent/30 p-3 text-sm space-y-1">
                  <p className="font-medium text-xs text-muted-foreground">{t("Student visibility preview:", "معاينة ظهور الامتحان للطلاب:")}</p>
                  {examForm.start_date && (
                    <p>✅ {t("Opens", "يفتح")}: <strong>{new Date(examForm.start_date).toLocaleString()}</strong> ({t("your local time", "توقيتك المحلي")})</p>
                  )}
                  {examForm.end_date && (
                    <p>🔒 {t("Closes", "يغلق")}: <strong>{new Date(examForm.end_date).toLocaleString()}</strong></p>
                  )}
                  {examForm.start_date && new Date(examForm.start_date).getTime() > Date.now() && (
                    <p className="text-xs text-muted-foreground">{t("⏳ Exam is not yet open for students", "⏳ الامتحان لم يفتح للطلاب بعد")}</p>
                  )}
                  {examForm.start_date && examForm.end_date && new Date(examForm.start_date).getTime() <= Date.now() && new Date(examForm.end_date).getTime() >= Date.now() && (
                    <p className="text-xs text-primary font-medium">{t("🟢 Exam is currently open for students", "🟢 الامتحان مفتوح حاليًا للطلاب")}</p>
                  )}
                  {examForm.end_date && new Date(examForm.end_date).getTime() < Date.now() && (
                    <p className="text-xs text-destructive font-medium">{t("🔴 Exam window has passed", "🔴 انتهت فترة الامتحان")}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Questions Tab */}
        <TabsContent value="questions">
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xl font-semibold">{t("Questions", "الأسئلة")} ({questions.length})</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Bulk import */}
                <input ref={bulkFileInputRef} type="file" accept=".csv,.json" className="hidden" onChange={handleBulkImport} />
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1">
                      <Upload className="h-3 w-3" />{t("Bulk Import", "استيراد جماعي")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("Bulk Import Questions", "استيراد أسئلة جماعي")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        {t(
                          "Download a template, fill in your questions, then upload the file. Supports CSV and JSON formats.",
                          "قم بتنزيل قالب، ثم املأ أسئلتك وارفع الملف. يدعم صيغ CSV و JSON."
                        )}
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => downloadTemplate("csv")} className="gap-1">
                          <Download className="h-3 w-3" /> CSV {t("Template", "قالب")}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => downloadTemplate("json")} className="gap-1">
                          <Download className="h-3 w-3" /> JSON {t("Template", "قالب")}
                        </Button>
                      </div>
                      <Button onClick={() => bulkFileInputRef.current?.click()} className="w-full gap-1">
                        <Upload className="h-4 w-4" /> {t("Upload Questions File", "رفع ملف الأسئلة")}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Button variant="outline" onClick={addQuestion} className="gap-1">
                  <Plus className="h-4 w-4" />{t("Add Question", "إضافة سؤال")}
                </Button>
              </div>
            </div>

            {questions.map((q, idx) => (
              <Card key={idx} className="border-2">
                <CardContent className="p-4">
                  <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <Badge variant="outline">{t("Question", "سؤال")} {idx + 1}</Badge>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Select value={q.question_type} onValueChange={(v) => updateQuestion(idx, { question_type: v })}>
                        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {questionTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.icon} {language === "ar" ? type.label_ar : type.label}
                            </SelectItem>
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

                    {/* Media upload section */}
                    <div className="rounded-lg border border-dashed border-primary/30 bg-accent/30 p-3">
                      <Label className="flex items-center gap-2 mb-2 text-sm">
                        {q.question_type === "audio" ? <Music className="h-4 w-4 text-primary" /> : <Image className="h-4 w-4 text-primary" />}
                        {t("Media (Audio/Image)", "وسائط (صوت/صورة)")}
                      </Label>

                      {q.media_url ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="truncate flex-1">{q.media_url.split("/").pop()}</span>
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => updateQuestion(idx, { media_url: "" })}>
                              {t("Remove", "إزالة")}
                            </Button>
                          </div>
                          {q.media_url.match(/\.(mp3|wav|ogg|webm|m4a)$/i) ? (
                            <audio controls src={q.media_url} className="w-full" />
                          ) : q.media_url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) ? (
                            <img src={q.media_url} alt="Question media" className="max-h-40 rounded-lg" />
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            disabled={uploadingMedia === idx}
                            onClick={() => {
                              const input = document.createElement("input");
                              input.type = "file";
                              input.accept = "audio/*,image/*";
                              input.onchange = (e: any) => {
                                const file = e.target.files?.[0];
                                if (file) uploadMedia(file, idx);
                              };
                              input.click();
                            }}
                          >
                            {uploadingMedia === idx ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Upload className="h-3 w-3" />
                            )}
                            {t("Upload File", "رفع ملف")}
                          </Button>
                          <span className="text-xs text-muted-foreground">{t("or paste URL:", "أو الصق الرابط:")}</span>
                          <Input
                            placeholder="https://example.com/audio.mp3"
                            value={q.media_url}
                            onChange={(e) => updateQuestion(idx, { media_url: e.target.value })}
                            className="flex-1 min-w-[200px]"
                          />
                        </div>
                      )}
                    </div>

                    {/* MCQ options */}
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
                              className="accent-primary"
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

                    {/* Correct answer for true_false, fill_blank, short_answer */}
                    {(q.question_type === "true_false" || q.question_type === "fill_blank" || q.question_type === "short_answer") && (
                      <div>
                        <Label className="text-sm">{t("Correct Answer (for auto-grading)", "الإجابة الصحيحة (للتصحيح التلقائي)")}</Label>
                        {q.question_type === "true_false" ? (
                          <Select value={q.correct_answer} onValueChange={(v) => updateQuestion(idx, { correct_answer: v })}>
                            <SelectTrigger className="mt-1"><SelectValue placeholder={t("Select", "اختر")} /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">{t("True", "صح")}</SelectItem>
                              <SelectItem value="false">{t("False", "خطأ")}</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            className="mt-1"
                            placeholder={t("Correct Answer", "الإجابة الصحيحة")}
                            value={q.correct_answer}
                            onChange={(e) => updateQuestion(idx, { correct_answer: e.target.value })}
                            dir="auto"
                          />
                        )}
                      </div>
                    )}

                    {/* Explanation */}
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input
                        placeholder={t("Explanation (optional)", "التوضيح (اختياري)")}
                        value={q.explanation}
                        onChange={(e) => updateQuestion(idx, { explanation: e.target.value })}
                      />
                      <Input
                        placeholder={t("Explanation Arabic (optional)", "التوضيح عربي (اختياري)")}
                        value={q.explanation_ar}
                        onChange={(e) => updateQuestion(idx, { explanation_ar: e.target.value })}
                        dir="rtl"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ExamEditor;
