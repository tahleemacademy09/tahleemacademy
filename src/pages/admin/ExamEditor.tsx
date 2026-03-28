import { useEffect, useState, useRef } from "react";
import * as XLSX from "xlsx";
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
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, GripVertical, Music, FileText, Calendar, Settings2, Upload, Download, Image, Loader2, Eye, Library } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import RichTextEditor from "@/components/exam/RichTextEditor";
import { sanitizeHtml } from "@/lib/sanitize";
import BulkQuestionFormatter, { DEFAULT_FORMAT, type ExamFormatSettings } from "@/components/exam/BulkQuestionFormatter";

interface QuestionForm {
  id?: string;
  question_type: string;
  question_text: string;
  question_text_ar: string;
  options: any[];
  correct_answer: string;
  accepted_answers: string[];
  points: number;
  difficulty: string;
  sort_order: number;
  explanation: string;
  explanation_ar: string;
  feedback_incorrect: string;
  media_url: string;
  matching_pairs: { left: string; right: string }[];
  ordering_items: string[];
  partial_credit: boolean;
  case_sensitive: boolean;
  min_words: number;
  max_words: number;
  question_timer_seconds: number;
  background_image: string;
  audio_response_type: "text" | "audio";
}

const emptyQuestion = (): QuestionForm => ({
  question_type: "mcq",
  question_text: "",
  question_text_ar: "",
  options: [
    { id: "a", text: "", text_ar: "", is_correct: false, image_url: "" },
    { id: "b", text: "", text_ar: "", is_correct: false, image_url: "" },
    { id: "c", text: "", text_ar: "", is_correct: false, image_url: "" },
    { id: "d", text: "", text_ar: "", is_correct: false, image_url: "" },
  ],
  correct_answer: "",
  accepted_answers: [""],
  points: 1,
  difficulty: "medium",
  sort_order: 0,
  explanation: "",
  explanation_ar: "",
  feedback_incorrect: "",
  media_url: "",
  matching_pairs: [{ left: "", right: "" }, { left: "", right: "" }],
  ordering_items: ["", "", ""],
  partial_credit: false,
  case_sensitive: false,
  min_words: 0,
  max_words: 0,
  question_timer_seconds: 0,
  background_image: "",
  audio_response_type: "text" as "text" | "audio",
});

const questionTypes = [
  // Standard
  { value: "mcq",          label: "Multiple Choice",      label_ar: "اختيار من متعدد",         icon: "📝" },
  { value: "multi_select", label: "Multi-Select",         label_ar: "اختيار متعدد",             icon: "☑️" },
  { value: "true_false",   label: "True / False",         label_ar: "صح / خطأ",                icon: "✓✗" },
  { value: "short_answer", label: "Short Answer",         label_ar: "إجابة قصيرة",             icon: "💬" },
  { value: "essay",        label: "Essay",                label_ar: "مقال",                    icon: "📄" },
  { value: "fill_blank",   label: "Fill in the Blank",    label_ar: "ملء الفراغ",              icon: "___" },
  // Media
  { value: "image_mcq",   label: "Image Choice",          label_ar: "اختيار بالصور",            icon: "🖼️" },
  { value: "audio",        label: "Audio / Dictation",    label_ar: "صوت / إملاء",             icon: "🎧" },
  { value: "drawing",      label: "Drawing / Whiteboard", label_ar: "رسم / لوحة بيضاء",        icon: "✏️" },
  // Interactive
  { value: "matching",     label: "Matching (Drag & Drop)",label_ar: "مطابقة (سحب وإفلات)",    icon: "🔗" },
  { value: "ordering",     label: "Ordering / Sequence",  label_ar: "ترتيب / تسلسل",           icon: "📋" },
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
    term: "first",
    max_review_views: 1,
    type: "exam" as "exam" | "test",
    level: "" as string,
  });
  const [questions, setQuestions] = useState<QuestionForm[]>([emptyQuestion()]);
  const [formatSettings, setFormatSettings] = useState<ExamFormatSettings>({ ...DEFAULT_FORMAT });
  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankQuestions, setBankQuestions] = useState<any[]>([]);
  const [bankSelected, setBankSelected] = useState<Set<string>>(new Set());
  const [bankSearch, setBankSearch] = useState("");
  const [bankLoading, setBankLoading] = useState(false);

  const openQuestionBank = async () => {
    setBankOpen(true);
    setBankLoading(true);
    setBankSelected(new Set());
    setBankSearch("");
    const { data } = await supabase.from("exam_questions").select("*, exams(title, title_ar)").order("created_at", { ascending: false });
    setBankQuestions(data || []);
    setBankLoading(false);
  };

  const importFromBank = () => {
    const selected = bankQuestions.filter((q) => bankSelected.has(q.id));
    const newQs: QuestionForm[] = selected.map((q, i) => ({
      question_type: q.question_type,
      question_text: q.question_text,
      question_text_ar: q.question_text_ar || "",
      options: (q.options as any[]) || [],
      correct_answer: q.correct_answer || "",
      points: q.points || 1,
      difficulty: q.difficulty || "medium",
      sort_order: questions.length + i,
      explanation: q.explanation || "",
      explanation_ar: q.explanation_ar || "",
      media_url: q.media_url || "",
    }));
    setQuestions((prev) => [...prev, ...newQs]);
    setBankOpen(false);
    toast({ title: t(`✅ Imported ${newQs.length} questions from bank!`, `✅ تم استيراد ${newQs.length} سؤال من البنك!`) });
  };

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
          term: (exam as any).term || "first",
          max_review_views: (exam as any).max_review_views ?? 1,
          type: (exam as any).type || "exam",
          level: (exam as any).level || "",
        });
        // Load formatting settings
        setFormatSettings({
          question_font_size: (exam as any).question_font_size ?? 16,
          question_font_family: (exam as any).question_font_family ?? "Cairo",
          question_alignment: (exam as any).question_alignment ?? "left",
          question_bold: (exam as any).question_bold ?? false,
          question_italic: (exam as any).question_italic ?? false,
          options_font_size: (exam as any).options_font_size ?? 14,
          options_bold: (exam as any).options_bold ?? false,
          options_alignment: (exam as any).options_alignment ?? "left",
          question_color: (exam as any).question_color ?? "#1a1a1a",
          question_line_height: (exam as any).question_line_height ?? 1.7,
          question_padding: (exam as any).question_padding ?? 16,
          show_question_numbers: (exam as any).show_question_numbers ?? true,
          show_marks_per_question: (exam as any).show_marks_per_question ?? true,
          rtl_mode: (exam as any).rtl_mode ?? false,
        });
      }
      const { data: qs, error: qErr } = await supabase
        .from("exam_questions")
        .select("*")
        .eq("exam_id", examId)
        .order("sort_order");
      if (qErr) console.error("ExamEditor: failed to load questions", qErr);
      // Always set — removes the qs?.length guard that was hiding questions
      setQuestions((qs || []).map((q: any) => ({
        id: q.id,
        question_type: q.question_type || "mcq",
        question_text: q.question_text || "",
        question_text_ar: q.question_text_ar || "",
        options: Array.isArray(q.options) ? q.options : [],
        correct_answer: q.correct_answer || "",
        accepted_answers: Array.isArray(q.accepted_answers) ? q.accepted_answers : [""],
        points: q.points || 10,
        difficulty: q.difficulty || "medium",
        sort_order: q.sort_order ?? 0,
        explanation: q.explanation || "",
        explanation_ar: q.explanation_ar || "",
        feedback_incorrect: q.feedback_incorrect || "",
        media_url: q.media_url || "",
        matching_pairs: Array.isArray(q.matching_pairs) ? q.matching_pairs : [{left:"",right:""},{left:"",right:""}],
        ordering_items: Array.isArray(q.ordering_items) ? q.ordering_items : ["","",""],
        partial_credit: q.partial_credit || false,
        case_sensitive: q.case_sensitive || false,
        min_words: q.min_words || 0,
        max_words: q.max_words || 0,
        question_timer_seconds: q.question_timer_seconds || 0,
        background_image: q.background_image || "",
        audio_response_type: q.audio_response_type || "text",
      })));
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
          ...formatSettings,
          start_date: examForm.start_date ? new Date(examForm.start_date).toISOString() : null,
          end_date: examForm.end_date ? new Date(examForm.end_date).toISOString() : null,
        } as any).eq("id", examId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("exams").insert({
          ...examForm,
          ...formatSettings,
          created_by: user!.id,
          start_date: examForm.start_date ? new Date(examForm.start_date).toISOString() : null,
          end_date: examForm.end_date ? new Date(examForm.end_date).toISOString() : null,
        } as any).select("id").single();
        if (error) throw error;
        eid = data?.id;
      }

      if (eid) {
        if (isEdit) await supabase.from("exam_questions").delete().eq("exam_id", eid);
        const qInserts = questions.map((q, i) => ({
          exam_id: eid!,
          question_type: q.question_type,
          question_text: sanitizeHtml(q.question_text),
          question_text_ar: q.question_text_ar ? sanitizeHtml(q.question_text_ar) : sanitizeHtml(q.question_text),
          options: ["mcq","image_mcq","multi_select"].includes(q.question_type) ? q.options : null,
          correct_answer: q.correct_answer || null,
          accepted_answers: q.accepted_answers?.filter(Boolean) || null,
          points: q.points,
          difficulty: q.difficulty,
          sort_order: i,
          explanation: q.explanation || null,
          explanation_ar: q.explanation_ar || null,
          feedback_incorrect: (q as any).feedback_incorrect || null,
          media_url: q.media_url || null,
          matching_pairs: q.matching_pairs?.filter((p:any)=>p.left||p.right) || null,
          ordering_items: q.ordering_items?.filter(Boolean) || null,
          partial_credit: q.partial_credit || false,
          case_sensitive: q.case_sensitive || false,
          min_words: q.min_words || 0,
          max_words: q.max_words || 0,
          question_timer_seconds: (q as any).question_timer_seconds || 0,
          background_image: (q as any).background_image || null,
          audio_response_type: (q as any).audio_response_type || "text",
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

    const { data: urlData } = await supabase.storage.from("exam-media").createSignedUrl(path, 3600);
    updateQuestion(questionIdx, { media_url: urlData?.signedUrl || '' });
    toast({ title: t("✅ File uploaded!", "✅ تم رفع الملف!") });
    setUploadingMedia(null);
  };

  // Upload image for an MCQ/image_mcq option
  const [uploadingOptionImage, setUploadingOptionImage] = useState<string | null>(null);
  const uploadOptionImage = async (file: File, questionIdx: number, optionIdx: number) => {
    const key = `${questionIdx}-${optionIdx}`;
    setUploadingOptionImage(key);
    const ext = file.name.split(".").pop();
    const path = `questions/options/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { data, error } = await supabase.storage.from("exam-media").upload(path, file);
    if (error) {
      toast({ title: t("Upload failed", "فشل الرفع"), description: error.message, variant: "destructive" });
      setUploadingOptionImage(null);
      return;
    }

    const { data: urlData } = await supabase.storage.from("exam-media").createSignedUrl(path, 3600);
    const newOpts = [...questions[questionIdx].options];
    newOpts[optionIdx] = { ...newOpts[optionIdx], image_url: urlData?.signedUrl || '' };
    updateQuestion(questionIdx, { options: newOpts });
    toast({ title: t("✅ Image uploaded!", "✅ تم رفع الصورة!") });
    setUploadingOptionImage(null);
  };

  // Parse CSV line handling quoted fields (supports commas and Arabic inside quotes)
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++; // skip escaped quote
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          result.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    result.push(current.trim());
    return result;
  };

  // Map the QuestionType string from XLSX to our internal type
  const mapQuestionType = (raw: string): string => {
    if (!raw) return "mcq";
    const lower = raw.toLowerCase().trim();
    if (lower.includes("multiple choice") || lower.includes("radiobutton") || lower.includes("dropdown")) return "mcq";
    if (lower.includes("multiple correct") || lower.includes("all correct")) return "mcq";
    if (lower.includes("true") || lower.includes("false") || lower.includes("yes/no")) return "true_false";
    if (lower.includes("fill in") || lower.includes("fill_blank")) return "fill_blank";
    if (lower.includes("essay")) return "essay";
    if (lower.includes("audio")) return "audio";
    if (lower.includes("short") || lower.includes("matching") || lower.includes("drag")) return "short_answer";
    return "mcq";
  };

  // Map DifficultyLevel number to string
  const mapDifficulty = (raw: any): string => {
    const val = String(raw).trim();
    if (val === "1") return "easy";
    if (val === "2") return "medium";
    if (val === "3") return "hard";
    if (["easy", "medium", "hard"].includes(val)) return val;
    return "medium";
  };

  // Convert XLSX row (Question.xlsx format) to QuestionForm
  const mapXlsxRow = (item: any, index: number): QuestionForm => {
    const q = emptyQuestion();
    // Map question type from XLSX column names
    const qType = item["QuestionType"] || item["question_type"] || item["type"] || "";
    q.question_type = mapQuestionType(qType);
    q.question_text = item["Question"] || item["question_text"] || item["question"] || "";
    q.question_text_ar = item["Question_ar"] || item["question_text_ar"] || item["question_ar"] || "";
    q.explanation = item["Explanation"] || item["explanation"] || "";
    q.explanation_ar = item["Explanation_ar"] || item["explanation_ar"] || "";
    q.points = Number(item["Marks"] || item["points"] || 1) || 1;
    q.difficulty = mapDifficulty(item["DifficultyLevel"] || item["difficulty"]);
    q.sort_order = index;

    // Collect answers from Answer1..Answer8 columns
    const answers: string[] = [];
    for (let i = 1; i <= 8; i++) {
      const val = item[`Answer${i}`] || item[`answer${i}`] || "";
      if (String(val).trim()) answers.push(String(val).trim());
    }

    // Parse correct answer index(es) — "1" means Answer1, "1, 3" means multiple
    const correctRaw = String(item["correctanswer"] || item["correct_answer"] || item["answer"] || "").trim();

    if (q.question_type === "mcq" && answers.length > 0) {
      const opts = answers.map((text, ai) => ({
        id: String.fromCharCode(97 + ai), // a, b, c, d...
        text,
        text_ar: item[`Answer${ai + 1}_ar`] || "",
        is_correct: false,
      }));
      // Mark correct answers
      const correctIndices = correctRaw.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      correctIndices.forEach(ci => {
        if (ci >= 1 && ci <= opts.length) opts[ci - 1].is_correct = true;
      });
      q.options = opts;
      // Set correct_answer letter for first correct
      const firstCorrect = opts.findIndex(o => o.is_correct);
      q.correct_answer = firstCorrect >= 0 ? opts[firstCorrect].id : "";
    } else if (q.question_type === "true_false") {
      // Answer1 = TRUE, Answer2 = FALSE; correctanswer = 1 means TRUE
      const ci = parseInt(correctRaw);
      if (ci === 1) q.correct_answer = "true";
      else if (ci === 2) q.correct_answer = "false";
      else q.correct_answer = correctRaw.toLowerCase();
    } else if (q.question_type === "fill_blank" || q.question_type === "short_answer") {
      // For fill in the blank, Answer1 is the correct answer
      q.correct_answer = answers[0] || correctRaw || "";
    }

    return q;
  };

  // Bulk question import
  const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isExcel = file.name.match(/\.xlsx?$/i);

    if (isExcel) {
      // XLSX import using SheetJS
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows: any[] = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

          // Filter out empty rows (no Question text)
          const validRows = rows.filter(r => r["Question"] || r["question_text"] || r["question"]);
          const newQuestions = validRows.map((row, i) => mapXlsxRow(row, questions.length + i));

          if (newQuestions.length === 0) {
            toast({ title: t("No questions found", "لم يتم العثور على أسئلة"), description: t("Make sure your file has a 'Question' column", "تأكد أن الملف يحتوي على عمود 'Question'"), variant: "destructive" });
            return;
          }

          setQuestions(prev => [...prev, ...newQuestions]);
          toast({ title: t(`✅ Imported ${newQuestions.length} questions!`, `✅ تم استيراد ${newQuestions.length} سؤال!`) });
        } catch (err: any) {
          console.error("XLSX import error:", err);
          toast({ title: t("Import failed", "فشل الاستيراد"), description: err.message, variant: "destructive" });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV / JSON import
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const text = ev.target?.result as string;
          let imported: any[];

          if (file.name.endsWith(".json")) {
            imported = JSON.parse(text);
          } else {
            const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
            const headers = parseCSVLine(lines[0]);
            imported = lines.slice(1).map(line => {
              const vals = parseCSVLine(line);
              const obj: any = {};
              headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
              return obj;
            });
          }

          const newQuestions: QuestionForm[] = imported.map((item: any, i: number) => mapXlsxRow(item, questions.length + i));

          setQuestions(prev => [...prev, ...newQuestions]);
          toast({ title: t(`✅ Imported ${newQuestions.length} questions!`, `✅ تم استيراد ${newQuestions.length} سؤال!`) });
        } catch (err: any) {
          console.error("Bulk import error:", err);
          toast({ title: t("Import failed", "فشل الاستيراد"), description: err.message || t("Invalid file format", "تنسيق الملف غير صالح"), variant: "destructive" });
        }
      };
      reader.readAsText(file, "UTF-8");
    }
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
      const csv = `question_type,question_text,question_text_ar,option_a,option_a_ar,option_b,option_b_ar,option_c,option_c_ar,option_d,option_d_ar,correct_answer,points,difficulty,explanation,explanation_ar
mcq,"What is 'book' in Arabic?","ما هي كلمة 'كتاب' بالعربية؟","كِتَاب","كِتَاب","قَلَم","قَلَم","بَاب","بَاب","مَاء","مَاء",a,1,easy,"كِتَاب means book","كِتَاب تعني كتاب"
true_false,"Arabic is written right to left.","العربية تُكتب من اليمين لليسار.",,,,,,,,,,true,1,easy,"",""
fill_blank,"The word for 'water' is ___.","كلمة 'ماء' هي ___.",,,,,,,,,,مَاء,2,medium,"",""`;
      const bom = "\uFEFF"; // UTF-8 BOM for Excel Arabic support
      const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
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
          {examForm.type === "test" ? t("Save Test", "حفظ التمرين") : t("Save Exam", "حفظ الامتحان")}
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
              {/* Type Selector */}
              <div className="rounded-lg border-2 border-dashed p-4">
                <Label className="text-base font-semibold mb-3 block">{t("Type", "النوع")}</Label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "exam" as const, label: t("Exam / امتحان", "امتحان / Exam"), marks: 70, color: "border-primary bg-primary/5" },
                    { value: "test" as const, label: t("Test / تمرين", "تمرين / Test"), marks: 30, color: "border-amber-500 bg-amber-500/5" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setExamForm({ ...examForm, type: opt.value })}
                      className={`rounded-lg border-2 p-4 text-start transition-all ${examForm.type === opt.value ? opt.color : "border-border hover:border-muted-foreground/30"}`}
                    >
                      <p className="font-semibold text-sm">{opt.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{t(`Max ${opt.marks} marks`, `${opt.marks} درجة كحد أقصى`)}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Level Selector */}
              <div>
                <Label>{t("Level", "المستوى")}</Label>
                <Select value={examForm.level || "none"} onValueChange={(v) => setExamForm({ ...examForm, level: v === "none" ? "" : v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder={t("Select level", "اختر المستوى")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("All Levels", "جميع المستويات")}</SelectItem>
                    <SelectItem value="beginner">{t("Beginner / مبتدئ", "مبتدئ / Beginner")}</SelectItem>
                    <SelectItem value="intermediate">{t("Intermediate / متوسط", "متوسط / Intermediate")}</SelectItem>
                    <SelectItem value="advanced">{t("Advanced / متقدم", "متقدم / Advanced")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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
              <div className="grid gap-4 md:grid-cols-5">
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
                <div>
                  <Label>{t("Term", "الفصل الدراسي")}</Label>
                  <Select value={examForm.term} onValueChange={(v) => setExamForm({ ...examForm, term: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first">{t("First Term / الفصل الأول", "الفصل الأول / First Term")}</SelectItem>
                      <SelectItem value="second">{t("Second Term / الفصل الثاني", "الفصل الثاني / Second Term")}</SelectItem>
                      <SelectItem value="third">{t("Third Term / الفصل الثالث", "الفصل الثالث / Third Term")}</SelectItem>
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
              {examForm.allow_review && (
                <div className="flex items-center gap-3 pt-2">
                  <Label className="text-sm whitespace-nowrap">{t("Max Review Views", "الحد الأقصى لمرات المراجعة")}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    className="w-24"
                    value={examForm.max_review_views}
                    onChange={(e) => setExamForm({ ...examForm, max_review_views: parseInt(e.target.value) || 1 })}
                  />
                  <span className="text-xs text-muted-foreground">{t("times", "مرات")}</span>
                </div>
              )}
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
                <input ref={bulkFileInputRef} type="file" accept=".csv,.json,.xlsx,.xls" className="hidden" onChange={handleBulkImport} />
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
                          "Upload your questions file. Supports Excel (.xlsx), CSV, and JSON formats. Use the exact column format: QuestionType, Question, Answer1-Answer8, correctanswer, Marks, DifficultyLevel, Explanation, Tags.",
                          "ارفع ملف الأسئلة. يدعم صيغ Excel (.xlsx) و CSV و JSON. استخدم تنسيق الأعمدة: QuestionType, Question, Answer1-Answer8, correctanswer, Marks, DifficultyLevel, Explanation, Tags."
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

                <Button variant="outline" onClick={openQuestionBank} className="gap-1">
                  <Library className="h-4 w-4" />{t("Import from Bank", "استيراد من البنك")}
                </Button>
                <Button variant="outline" onClick={() => setPreviewOpen(true)} className="gap-1">
                  <Eye className="h-4 w-4" />{t("Preview", "معاينة")}
                </Button>
                <Button variant="outline" onClick={addQuestion} className="gap-1">
                  <Plus className="h-4 w-4" />{t("Add Question", "إضافة سؤال")}
                </Button>
              </div>
            </div>

            {/* Bulk Question Formatter */}
            <BulkQuestionFormatter
              format={formatSettings}
              onChange={setFormatSettings}
              onApply={() => {
                toast({ title: t(`✅ Formatting applied to all ${questions.length} questions`, `✅ تم تطبيق التنسيق على كل ${questions.length} سؤال`) });
              }}
              questions={questions}
              examTitle={examForm.title}
              examTitleAr={examForm.title_ar}
            />

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
                    <div>
                      <Label className="text-sm mb-1 block">{t("Question Text (supports mixed English & Arabic)", "نص السؤال (يدعم الإنجليزية والعربية معاً)")}</Label>
                      <RichTextEditor
                        placeholder={t("Type your question here in any language...", "اكتب سؤالك هنا بأي لغة...")}
                        value={q.question_text}
                        onChange={(val) => updateQuestion(idx, { question_text: val })}
                        dir="auto"
                      />
                    </div>

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

                    {/* MCQ / Image Choice options */}
                    {(q.question_type === "mcq" || q.question_type === "image_mcq") && (
                      <div className="space-y-2">
                        {q.options.map((opt: any, oi: number) => (
                          <div key={opt.id} className="flex items-start gap-2 rounded-lg border p-2">
                            <input
                              type="radio"
                              name={`correct-${idx}`}
                              checked={opt.is_correct}
                              onChange={() => {
                                const newOpts = q.options.map((o: any, j: number) => ({ ...o, is_correct: j === oi }));
                                updateQuestion(idx, { options: newOpts });
                              }}
                              className="accent-primary mt-2.5"
                            />
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <Input
                                  className="flex-1"
                                  placeholder={`${t("Option", "خيار")} ${String.fromCharCode(65 + oi)} ${t("(any language)", "(أي لغة)")}`}
                                  value={opt.text}
                                  dir="auto"
                                  onChange={(e) => {
                                    const newOpts = [...q.options];
                                    newOpts[oi] = { ...newOpts[oi], text: e.target.value };
                                    updateQuestion(idx, { options: newOpts });
                                  }}
                                />
                              </div>
                              {/* Option image */}
                              <div className="flex items-center gap-2">
                                {opt.image_url ? (
                                  <div className="flex items-center gap-2">
                                    <img src={opt.image_url} alt={`Option ${String.fromCharCode(65 + oi)}`} className="h-16 w-16 object-cover rounded-md border" />
                                    <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => {
                                      const newOpts = [...q.options];
                                      newOpts[oi] = { ...newOpts[oi], image_url: "" };
                                      updateQuestion(idx, { options: newOpts });
                                    }}>
                                      {t("Remove", "إزالة")}
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1 text-xs"
                                    disabled={uploadingOptionImage === `${idx}-${oi}`}
                                    onClick={() => {
                                      const input = document.createElement("input");
                                      input.type = "file";
                                      input.accept = "image/*";
                                      input.onchange = (e: any) => {
                                        const file = e.target.files?.[0];
                                        if (file) uploadOptionImage(file, idx, oi);
                                      };
                                      input.click();
                                    }}
                                  >
                                    {uploadingOptionImage === `${idx}-${oi}` ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Image className="h-3 w-3" />
                                    )}
                                    {t("Add Image", "إضافة صورة")}
                                  </Button>
                                )}
                              </div>
                            </div>
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

                    {/* Multi-Select */}
                    {q.question_type === "multi_select" && (
                      <div className="space-y-2">
                        <Label className="text-sm">☑️ {t("Options — check ALL correct answers", "الخيارات — حدد كل الإجابات الصحيحة")}</Label>
                        {q.options.map((opt: any, oi: number) => (
                          <div key={opt.id} className="flex items-center gap-2 rounded-lg border p-2" style={{ borderColor: opt.is_correct ? "#064E3B" : undefined, background: opt.is_correct ? "#F0FDF4" : undefined }}>
                            <input type="checkbox" checked={opt.is_correct} onChange={e => { const o=[...q.options]; o[oi]={...o[oi],is_correct:e.target.checked}; updateQuestion(idx,{options:o}); }} className="w-4 h-4 accent-primary" />
                            <Input className="flex-1" placeholder={`${t("Option","خيار")} ${String.fromCharCode(65+oi)} (EN)`} value={opt.text} dir="ltr" onChange={e=>{const o=[...q.options];o[oi]={...o[oi],text:e.target.value};updateQuestion(idx,{options:o});}} />
                            <Input className="w-36" placeholder="العربية" dir="rtl" value={opt.text_ar||""} onChange={e=>{const o=[...q.options];o[oi]={...o[oi],text_ar:e.target.value};updateQuestion(idx,{options:o});}} />
                            <Button variant="ghost" size="icon" onClick={()=>updateQuestion(idx,{options:q.options.filter((_:any,j:number)=>j!==oi)})}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                          </div>
                        ))}
                        <Button variant="outline" size="sm" className="gap-1" onClick={()=>updateQuestion(idx,{options:[...q.options,{id:Math.random().toString(36).slice(2),text:"",text_ar:"",is_correct:false}]})}><Plus className="h-3 w-3"/>{t("Add Option","إضافة خيار")}</Button>
                      </div>
                    )}

                    {/* Short Answer */}
                    {q.question_type === "short_answer" && (
                      <div className="space-y-2">
                        <Label className="text-sm">💬 {t("Accepted Answers (all valid forms)","الإجابات المقبولة (كل الأشكال الصحيحة)")}</Label>
                        {(q.accepted_answers||[""]).map((ans:string,ai:number)=>(
                          <div key={ai} className="flex gap-2">
                            <Input value={ans} placeholder={`${t("Accepted answer","إجابة مقبولة")} ${ai+1}`} dir="auto" onChange={e=>{const a=[...(q.accepted_answers||[""])];a[ai]=e.target.value;updateQuestion(idx,{accepted_answers:a,correct_answer:a[0]});}}/>
                            {ai>0&&<Button variant="ghost" size="icon" onClick={()=>updateQuestion(idx,{accepted_answers:(q.accepted_answers||[]).filter((_:any,j:number)=>j!==ai)})}><Trash2 className="h-4 w-4 text-destructive"/></Button>}
                          </div>
                        ))}
                        <Button variant="outline" size="sm" className="gap-1" onClick={()=>updateQuestion(idx,{accepted_answers:[...(q.accepted_answers||[]),""]})}><Plus className="h-3 w-3"/>{t("Add Variation","إضافة صيغة")}</Button>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <input type="checkbox" checked={q.case_sensitive||false} onChange={e=>updateQuestion(idx,{case_sensitive:e.target.checked})}/>
                          <span>{t("Case Sensitive","حساس لحالة الأحرف")}</span>
                        </div>
                      </div>
                    )}

                    {/* Essay */}
                    {q.question_type === "essay" && (
                      <div className="rounded-lg border bg-accent/20 p-3 text-sm text-muted-foreground space-y-2">
                        <p>📄 {t("Essay — student types a long response. Requires manual grading.","مقال — يتطلب تصحيحاً يدوياً.")}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div><Label className="text-xs">{t("Min Words","الحد الأدنى")}</Label><Input type="number" min={0} value={q.min_words||0} onChange={e=>updateQuestion(idx,{min_words:+e.target.value})} className="mt-1"/></div>
                          <div><Label className="text-xs">{t("Max Words","الحد الأقصى")}</Label><Input type="number" min={0} value={q.max_words||0} onChange={e=>updateQuestion(idx,{max_words:+e.target.value})} className="mt-1"/></div>
                        </div>
                      </div>
                    )}

                    {/* Matching */}
                    {q.question_type === "matching" && (
                      <div className="space-y-2">
                        <Label className="text-sm">🔗 {t("Matching Pairs — Left / Right","أزواج المطابقة — يسار / يمين")}</Label>
                        {(q.matching_pairs||[]).map((pair:any,pi:number)=>(
                          <div key={pi} className="grid grid-cols-2 gap-2 items-center">
                            <Input placeholder={`${t("Left","يسار")} ${pi+1}`} value={pair.left} onChange={e=>{const p=[...(q.matching_pairs||[])];p[pi]={...p[pi],left:e.target.value};updateQuestion(idx,{matching_pairs:p});}} style={{borderColor:"#93C5FD"}}/>
                            <div className="flex gap-2">
                              <Input placeholder={`${t("Right","يمين")} ${pi+1}`} value={pair.right} onChange={e=>{const p=[...(q.matching_pairs||[])];p[pi]={...p[pi],right:e.target.value};updateQuestion(idx,{matching_pairs:p});}} style={{borderColor:"#C4B5FD"}}/>
                              <Button variant="ghost" size="icon" onClick={()=>updateQuestion(idx,{matching_pairs:(q.matching_pairs||[]).filter((_:any,j:number)=>j!==pi)})}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                            </div>
                          </div>
                        ))}
                        <Button variant="outline" size="sm" className="gap-1" onClick={()=>updateQuestion(idx,{matching_pairs:[...(q.matching_pairs||[]),{left:"",right:""}]})}><Plus className="h-3 w-3"/>{t("Add Pair","إضافة زوج")}</Button>
                      </div>
                    )}

                    {/* Ordering */}
                    {q.question_type === "ordering" && (
                      <div className="space-y-2">
                        <Label className="text-sm">📋 {t("Items in Correct Order (shuffled for student)","العناصر بالترتيب الصحيح — ستُخلط للطالب")}</Label>
                        {(q.ordering_items||[]).map((item:string,oi:number)=>(
                          <div key={oi} className="flex gap-2 items-center">
                            <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">{oi+1}</div>
                            <Input value={item} placeholder={`${t("Item","عنصر")} ${oi+1}`} dir="auto" onChange={e=>{const it=[...(q.ordering_items||[])];it[oi]=e.target.value;updateQuestion(idx,{ordering_items:it,correct_answer:it.join("|")});}}/>
                            <Button variant="ghost" size="icon" onClick={()=>{const it=(q.ordering_items||[]).filter((_:any,j:number)=>j!==oi);updateQuestion(idx,{ordering_items:it,correct_answer:it.join("|")});}}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                          </div>
                        ))}
                        <Button variant="outline" size="sm" className="gap-1" onClick={()=>updateQuestion(idx,{ordering_items:[...(q.ordering_items||[]),""];})}><Plus className="h-3 w-3"/>{t("Add Item","إضافة عنصر")}</Button>
                      </div>
                    )}

                    {/* Drawing */}
                    {q.question_type === "drawing" && (
                      <div className="rounded-lg border border-dashed p-3 space-y-2">
                        <Label className="text-sm">✏️ {t("Drawing / Whiteboard — student draws on canvas","رسم — الطالب يرسم على لوحة")}</Label>
                        <p className="text-xs text-muted-foreground">{t("Requires manual grading. Upload a background image (map/diagram) or leave blank for white canvas.","يتطلب تصحيحاً يدوياً.")}</p>
                        {q.background_image
                          ? <div className="flex gap-2 items-center"><img src={q.background_image} className="h-20 rounded border" alt="bg"/><Button variant="ghost" size="sm" className="text-destructive" onClick={()=>updateQuestion(idx,{background_image:""})}>{t("Remove","حذف")}</Button></div>
                          : <Button variant="outline" size="sm" className="gap-1" onClick={()=>{const el=document.createElement("input");el.type="file";el.accept="image/*";el.onchange=(e:any)=>{const f=e.target.files?.[0];if(f)uploadMedia(f,idx);};el.click();}}><Image className="h-3 w-3"/>{t("Upload Background (optional)","رفع خلفية (اختياري)")}</Button>}
                      </div>
                    )}

                    {/* Feedback + per-question timer */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <Label className="text-xs text-muted-foreground">✅ {t("Correct Feedback","تغذية راجعة — صحيح")}</Label>
                        <Input className="mt-1 text-xs" placeholder={t("Message when correct...","رسالة عند الإجابة الصحيحة...")} value={q.explanation||""} onChange={e=>updateQuestion(idx,{explanation:e.target.value})} dir="auto"/>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">❌ {t("Wrong Feedback","تغذية راجعة — خطأ")}</Label>
                        <Input className="mt-1 text-xs" placeholder={t("Hint when wrong...","تلميح عند الخطأ...")} value={(q as any).feedback_incorrect||""} onChange={e=>updateQuestion(idx,{feedback_incorrect:e.target.value} as any)} dir="auto"/>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>⏱️ {t("Per-question timer (0 = use exam timer)","مؤقت السؤال (0 = مؤقت الامتحان)")}</span>
                      <Input type="number" min={0} step={30} className="w-24 h-7 text-xs" value={(q as any).question_timer_seconds||0} onChange={e=>updateQuestion(idx,{question_timer_seconds:+e.target.value} as any)}/>
                      <span>s</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("Exam Preview", "معاينة الامتحان")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {examForm.title && (
              <div className="text-center border-b pb-4">
                <h2 className="text-2xl font-bold">{examForm.title}</h2>
                {examForm.title_ar && <p className="text-lg text-muted-foreground mt-1" dir="rtl">{examForm.title_ar}</p>}
                {examForm.description && <p className="text-sm text-muted-foreground mt-2">{examForm.description}</p>}
              </div>
            )}
            {questions.map((q, idx) => (
              <div key={idx} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                    {idx + 1}
                  </span>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary">{questionTypes.find(t => t.value === q.question_type)?.label || q.question_type}</Badge>
                      <Badge variant="outline">{q.points} {t("pts", "نقطة")}</Badge>
                      <Badge variant={q.difficulty === "easy" ? "default" : q.difficulty === "hard" ? "destructive" : "secondary"}>
                        {q.difficulty}
                      </Badge>
                    </div>
                    <div
                      className="text-base prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text) || `<span class="text-muted-foreground italic">${t("No question text", "لا يوجد نص")}</span>` }}
                    />
                    {q.question_text_ar && (
                      <div
                        className="text-base prose prose-sm max-w-none text-muted-foreground"
                        dir="rtl"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text_ar) }}
                      />
                    )}

                    {/* Media preview */}
                    {q.media_url && (
                      <div className="mt-2">
                        {q.media_url.match(/\.(mp3|wav|ogg|webm|m4a)$/i) ? (
                          <audio controls src={q.media_url} className="w-full" />
                        ) : q.media_url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) ? (
                          <img src={q.media_url} alt="Question media" className="max-h-40 rounded-lg" />
                        ) : null}
                      </div>
                    )}

                    {/* MCQ / Image Choice options preview */}
                    {(q.question_type === "mcq" || q.question_type === "image_mcq") && (
                      <div className={q.question_type === "image_mcq" ? "grid grid-cols-2 gap-2 mt-2" : "space-y-1.5 mt-2"}>
                        {q.options.map((opt: any, oi: number) => (
                          <div
                            key={opt.id}
                            className={cn(
                              "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                              opt.is_correct ? "border-primary bg-primary/10 font-medium" : "border-input"
                            )}
                          >
                            <span className="font-mono text-xs w-5">{String.fromCharCode(65 + oi)}.</span>
                            <div className="flex-1">
                              {opt.image_url && (
                                <img src={opt.image_url} alt={`Option ${String.fromCharCode(65 + oi)}`} className="h-20 w-full object-contain rounded mb-1" />
                              )}
                              {opt.text && <span>{opt.text}</span>}
                              {opt.text_ar && <span className="text-muted-foreground ml-2" dir="rtl">{opt.text_ar}</span>}
                            </div>
                            {opt.is_correct && <Badge className="ml-2 text-xs" variant="default">✓</Badge>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* True/False preview */}
                    {q.question_type === "true_false" && q.correct_answer && (
                      <p className="text-sm"><strong>{t("Answer", "الإجابة")}:</strong> {q.correct_answer === "true" ? t("True", "صح") : t("False", "خطأ")}</p>
                    )}

                    {/* Fill blank / short answer preview */}
                    {(q.question_type === "fill_blank" || q.question_type === "short_answer") && q.correct_answer && (
                      <p className="text-sm"><strong>{t("Answer", "الإجابة")}:</strong> {q.correct_answer}</p>
                    )}

                    {/* Explanation */}
                    {q.explanation && (
                      <p className="text-xs text-muted-foreground mt-2">💡 {q.explanation}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Question Bank Import Dialog */}
      <Dialog open={bankOpen} onOpenChange={setBankOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Library className="h-5 w-5" />
              {t("Import from Question Bank", "استيراد من بنك الأسئلة")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder={t("Search questions...", "البحث في الأسئلة...")}
              value={bankSearch}
              onChange={(e) => setBankSearch(e.target.value)}
            />
            {bankLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <div className="text-xs text-muted-foreground">
                  {bankSelected.size} {t("selected", "محدد")} • {bankQuestions.filter((q) => {
                    if (!bankSearch) return true;
                    const s = bankSearch.toLowerCase();
                    return (q.question_text || "").toLowerCase().includes(s) || (q.question_text_ar || "").toLowerCase().includes(s);
                  }).length} {t("questions", "سؤال")}
                </div>
                <div className="max-h-[400px] overflow-y-auto space-y-1.5">
                  {bankQuestions.filter((q) => {
                    if (!bankSearch) return true;
                    const s = bankSearch.toLowerCase();
                    return (q.question_text || "").toLowerCase().includes(s) || (q.question_text_ar || "").toLowerCase().includes(s);
                  }).map((q) => {
                    const strip = (html: string) => {
                      const doc = new DOMParser().parseFromString(html || "", "text/html");
                      return doc.body.textContent || "";
                    };
                    return (
                      <div
                        key={q.id}
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${bankSelected.has(q.id) ? "border-primary bg-primary/5" : "hover:bg-accent/50"}`}
                        onClick={() => {
                          setBankSelected((prev) => {
                            const next = new Set(prev);
                            next.has(q.id) ? next.delete(q.id) : next.add(q.id);
                            return next;
                          });
                        }}
                      >
                        <Checkbox checked={bankSelected.has(q.id)} className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex gap-1.5 flex-wrap mb-1">
                            <Badge variant="secondary" className="text-[10px]">{q.question_type?.replace("_", " ")}</Badge>
                            <Badge variant="outline" className="text-[10px]">{q.difficulty}</Badge>
                            <Badge variant="outline" className="text-[10px]">{q.points} pts</Badge>
                            {q.exams?.title && (
                              <span className="text-[10px] text-muted-foreground">
                                {language === "ar" ? q.exams?.title_ar || q.exams?.title : q.exams?.title}
                              </span>
                            )}
                          </div>
                          <p className="text-sm truncate" dir="auto">{strip(q.question_text)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Button onClick={importFromBank} disabled={bankSelected.size === 0} className="w-full gap-2">
                  <Plus className="h-4 w-4" />
                  {t(`Import ${bankSelected.size} Questions`, `استيراد ${bankSelected.size} سؤال`)}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExamEditor;
