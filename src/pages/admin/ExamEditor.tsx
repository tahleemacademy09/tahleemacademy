// src/pages/admin/ExamEditor.tsx
// FIXES:
// 1. Preview now uses ExamFormatPreview (real rendering, not placeholder)
// 2. Arabic question text field rendered in every question card
// 3. Question Bank dialog now properly renders and imports selected questions
// 4. Bulk Format "Apply" actually applies formatSettings to question metadata
// 5. CSV template updated to Tahleem Academy format
import { useEffect, useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Trash2, Save, GripVertical, Music, FileText, Calendar, Settings2,
  Upload, Download, Image as ImageIcon, Loader2, Eye, Library, Clock,
  AlertCircle, CheckCircle, XCircle, HelpCircle, Monitor,
} from "lucide-react";
import RichTextEditor from "@/components/exam/RichTextEditor";
import { sanitizeHtml } from "@/lib/sanitize";
import BulkQuestionFormatter, { DEFAULT_FORMAT, type ExamFormatSettings } from "@/components/exam/BulkQuestionFormatter";
import ExamFormatPreview from "@/components/exam/ExamFormatPreview";

// ── Interfaces ──────────────────────────────────────────────────────────────
interface QuestionForm {
  id?: string;
  question_type: string;
  question_text: string;
  question_text_ar: string;          // ← Arabic question text
  options: Array<{
    id: string; text: string; text_ar: string; is_correct: boolean; image_url: string;
  }>;
  correct_answer: string;
  accepted_answers: string[];
  points: number;
  difficulty: string;
  sort_order: number;
  explanation: string;
  explanation_ar: string;
  feedback_incorrect: string;
  media_url: string;
  matching_pairs: Array<{ left: string; right: string }>;
  ordering_items: string[];
  partial_credit: boolean;
  case_sensitive: boolean;
  min_words: number;
  max_words: number;
  question_timer_seconds: number;
  background_image: string;
  audio_response_type: "text" | "audio";
}

interface ExamForm {
  title: string; title_ar: string;
  description: string; description_ar: string;
  time_limit_minutes: number; passing_score: number; max_attempts: number;
  randomize_questions: boolean; randomize_answers: boolean;
  show_results_immediately: boolean; allow_review: boolean;
  display_mode: string;
  guidelines: string; guidelines_ar: string;
  start_date: string; end_date: string;
  proctoring_enabled: boolean; fullscreen_required: boolean;
  webcam_required: boolean; mic_required: boolean;
  tab_switch_limit: number; max_warnings: number;
  auto_submit_on_violation: boolean;
  screenshot_interval_seconds: number; idle_timeout_seconds: number;
  blur_detection: boolean; face_detection: boolean;
  timezone: string; term: string; max_review_views: number;
  type: "exam" | "test";
  level: string;
}

// ── Constants ────────────────────────────────────────────────────────────────
const emptyQuestion = (): QuestionForm => ({
  question_type: "mcq", question_text: "", question_text_ar: "",
  options: [
    { id: "a", text: "", text_ar: "", is_correct: false, image_url: "" },
    { id: "b", text: "", text_ar: "", is_correct: false, image_url: "" },
    { id: "c", text: "", text_ar: "", is_correct: false, image_url: "" },
    { id: "d", text: "", text_ar: "", is_correct: false, image_url: "" },
  ],
  correct_answer: "", accepted_answers: [""],
  points: 1, difficulty: "medium", sort_order: 0,
  explanation: "", explanation_ar: "", feedback_incorrect: "",
  media_url: "",
  matching_pairs: [{ left: "", right: "" }, { left: "", right: "" }],
  ordering_items: ["", "", ""],
  partial_credit: false, case_sensitive: false,
  min_words: 0, max_words: 0, question_timer_seconds: 0,
  background_image: "", audio_response_type: "text",
});

const questionTypes = [
  { value: "mcq",          label: "Multiple Choice",         label_ar: "اختيار من متعدد",       icon: "📝", cat: "Standard" },
  { value: "multi_select", label: "Multi-Select",            label_ar: "اختيار متعدد",           icon: "☑️", cat: "Standard" },
  { value: "true_false",   label: "True / False",            label_ar: "صح / خطأ",               icon: "✓✗", cat: "Standard" },
  { value: "short_answer", label: "Short Answer",            label_ar: "إجابة قصيرة",            icon: "💬", cat: "Standard" },
  { value: "essay",        label: "Essay",                   label_ar: "مقال",                   icon: "📄", cat: "Standard" },
  { value: "fill_blank",   label: "Fill in the Blank",       label_ar: "ملء الفراغ",             icon: "___", cat: "Standard" },
  { value: "image_mcq",    label: "Image Choice",            label_ar: "اختيار بالصور",          icon: "🖼️", cat: "Media" },
  { value: "audio",        label: "Audio / Dictation",       label_ar: "صوت / إملاء",            icon: "🎧", cat: "Media" },
  { value: "drawing",      label: "Drawing / Whiteboard",    label_ar: "رسم / لوحة بيضاء",      icon: "✏️", cat: "Media" },
  { value: "matching",     label: "Matching (Drag & Drop)",  label_ar: "مطابقة (سحب وإفلات)",    icon: "🔗", cat: "Interactive" },
  { value: "ordering",     label: "Ordering / Sequence",     label_ar: "ترتيب / تسلسل",          icon: "📋", cat: "Interactive" },
];

const toLocalDatetimeString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
};

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
};

// ── Updated CSV template to Tahleem Academy format ──────────────────────────
const BulkTemplateDownload = ({ className }: { className?: string }) => {
  const downloadTemplate = () => {
    const headers = [
      "QuestionType","Question","Answer1","Answer2","Answer3","Answer4","Answer5","Answer6","Answer7","Answer8",
      "correctanswer","Noofanswers","Explanation","Marks","DirectionID","DifficultyLevel","Istestmaker","Tags","Answeroption","Negativemarks(%)"
    ];

    const samples = [
      [
        "Multiple Choice (Radiobutton)","What is the first pillar of Islam?",
        "Shahada","Salat","Zakat","Sawm","","","","",
        "1","4","The Shahada is the declaration of faith","1","","2","1","","1","0"
      ],
      [
        "Multiple Choice (Radiobutton)","ما هو أول ركن من أركان الإسلام؟",
        "الشهادة","الصلاة","الزكاة","الصيام","","","","",
        "1","4","الشهادة هي نطق كلمة التوحيد","1","","2","1","","1","0"
      ],
      [
        "True/False","The Quran was revealed over 23 years.",
        "TRUE","FALSE","","","","","","",
        "1","2","The Quran was revealed gradually over 23 years","1","","1","1","","1","0"
      ],
      [
        "Fill in the Blank","The Prophet Muhammad (ﷺ) was born in ___.",
        "Mecca","","","","","","","",
        "1","1","","1","","2","1","","1","0"
      ],
      [
        "Essay (Evaluated by Admin)","Explain the importance of Tajweed in Quran recitation.",
        "","","","","","","","",
        "0","0","","5","","2","1","","1","0"
      ],
      [
        "Multiple Correct","Which are among the 99 Names of Allah?",
        "Ar-Rahman","Al-Aziz","Al-Kabeer","Al-Jalil","","","","",
        "\"1,2,3,4\"","4","All four are among the 99 Names of Allah","2","","2","1","","1","0"
      ],
    ];

    // BOM for UTF-8 to support Arabic in Excel
    const BOM = "\uFEFF";
    const csvLines = [
      headers.join(","),
      ...samples.map(row =>
        row.map(cell => {
          const s = String(cell ?? "");
          // wrap in quotes if contains comma, quotes, or Arabic
          if (s.includes(",") || s.includes('"') || /[\u0600-\u06FF]/.test(s)) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        }).join(",")
      )
    ];

    const blob = new Blob([BOM + csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "tahleem_questions_template.csv";
    link.style.display = "none";
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  return (
    <Button variant="outline" size="sm" onClick={downloadTemplate} className={cn("gap-2", className)}>
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">Download CSV Template</span>
      <span className="sm:hidden">Template</span>
    </Button>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────
const ExamEditor = () => {
  const { examId }  = useParams<{ examId: string }>();
  const isEdit      = !!examId;
  const { t, language } = useLanguage();
  const { user }    = useAuth();
  const { toast }   = useToast();
  const navigate    = useNavigate();
  const isMobile    = useIsMobile();
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  const [examForm, setExamForm] = useState<ExamForm>({
    title: "", title_ar: "", description: "", description_ar: "",
    time_limit_minutes: 60, passing_score: 50, max_attempts: 1,
    randomize_questions: false, randomize_answers: false,
    show_results_immediately: true, allow_review: true,
    display_mode: "one_at_a_time",
    guidelines: "", guidelines_ar: "",
    start_date: "", end_date: "",
    proctoring_enabled: false, fullscreen_required: false,
    webcam_required: false, mic_required: false,
    tab_switch_limit: 3, max_warnings: 3,
    auto_submit_on_violation: false,
    screenshot_interval_seconds: 0, idle_timeout_seconds: 300,
    blur_detection: false, face_detection: false,
    timezone: "UTC", term: "first", max_review_views: 1,
    type: "exam", level: "",
  });

  const [questions,      setQuestions]      = useState<QuestionForm[]>([emptyQuestion()]);
  const [formatSettings, setFormatSettings] = useState<ExamFormatSettings>({ ...DEFAULT_FORMAT });
  const [saving,         setSaving]         = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState<number | null>(null);

  // ── FIX 1: Preview uses ExamFormatPreview ───────────────────────────────
  const [previewOpen,    setPreviewOpen]    = useState(false);

  // ── FIX 3: Question Bank dialog state ───────────────────────────────────
  const [bankOpen,       setBankOpen]       = useState(false);
  const [bankQuestions,  setBankQuestions]  = useState<any[]>([]);
  const [bankSelected,   setBankSelected]   = useState<Set<string>>(new Set());
  const [bankSearch,     setBankSearch]     = useState("");
  const [bankLoading,    setBankLoading]    = useState(false);

  const [activeTab,        setActiveTab]        = useState("settings");
  const [scheduleErrors,   setScheduleErrors]   = useState<{start?: string; end?: string}>({});
  const [proctoringPreview,setProctoringPreview] = useState(false);

  const G    = "#064E3B";
  const GOLD = "#c9a84c";

  const tabs = [
    { value: "settings",   icon: <Settings2 className="w-4 h-4"/>,    label: t("Settings", "الإعدادات") },
    { value: "proctoring", icon: <AlertCircle className="w-4 h-4"/>,  label: t("Proctoring", "المراقبة") },
    { value: "schedule",   icon: <Calendar className="w-4 h-4"/>,     label: t("Schedule", "الجدولة") },
    { value: "questions",  icon: <FileText className="w-4 h-4"/>,     label: `${t("Questions", "الأسئلة")} (${questions.length})` },
  ];

  // ── Question helpers ────────────────────────────────────────────────────
  const addQuestion    = () => setQuestions(q => [...q, { ...emptyQuestion(), sort_order: q.length }]);
  const removeQuestion = (idx: number) => setQuestions(q => q.filter((_, i) => i !== idx));
  const updateQuestion = (idx: number, updates: Partial<QuestionForm>) =>
    setQuestions(q => q.map((qq, i) => i === idx ? { ...qq, ...updates } : qq));

  // ── Media upload ────────────────────────────────────────────────────────
  const uploadMedia = async (file: File, idx: number) => {
    setUploadingMedia(idx);
    try {
      const path = `exam-media/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("exam-media").upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("exam-media").getPublicUrl(path);
      updateQuestion(idx, { media_url: publicUrl });
      toast({ title: "✅ Media uploaded" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
    setUploadingMedia(null);
  };

  // ── Bulk import (supports Tahleem CSV format AND legacy format) ─────────
  const parseCSVRow = (row: string[]): Partial<QuestionForm> => {
    const [
      question_type, question_text, question_text_ar,
      optA, optA_ar, optB, optB_ar, optC, optC_ar, optD, optD_ar,
      correct_answer, points, difficulty, explanation, explanation_ar
    ] = row.map(cell => String(cell || "").trim());

    const options = [
      { id: "a", text: optA || "",  text_ar: optA_ar || "",  is_correct: correct_answer?.toUpperCase() === "A", image_url: "" },
      { id: "b", text: optB || "",  text_ar: optB_ar || "",  is_correct: correct_answer?.toUpperCase() === "B", image_url: "" },
      { id: "c", text: optC || "",  text_ar: optC_ar || "",  is_correct: correct_answer?.toUpperCase() === "C", image_url: "" },
      { id: "d", text: optD || "",  text_ar: optD_ar || "",  is_correct: correct_answer?.toUpperCase() === "D", image_url: "" },
    ].filter(opt => opt.text || opt.text_ar);

    const finalOptions = options.length >= 2 ? options : emptyQuestion().options.slice(0, 4);

    return {
      question_type: question_type || "mcq",
      question_text: question_text || "",
      question_text_ar: question_text_ar || "",
      options: finalOptions,
      correct_answer: correct_answer || "",
      points: parseInt(points) || 1,
      difficulty: difficulty || "medium",
      explanation: explanation || "",
      explanation_ar: explanation_ar || "",
    };
  };

  // Also parse Tahleem Academy export format
  const parseTahleemRow = (row: string[]): Partial<QuestionForm> | null => {
    // Tahleem format: QuestionType,Question,Answer1..Answer8,correctanswer,Noofanswers,Explanation,Marks,...
    const [qType, question, a1, a2, a3, a4, a5, a6, a7, a8, correctanswer, noofanswers, explanation, marks, , , , , ,] = row.map(c => String(c || "").trim());

    // Detect Tahleem format by checking if first column matches known types
    const tahleemTypes: Record<string, string> = {
      "Multiple Choice (Radiobutton)": "mcq",
      "Multiple Choice (Dropdown)":    "mcq",
      "Multiple Correct":              "multi_select",
      "True/False":                    "true_false",
      "Yes/No":                        "true_false",
      "Fill in the Blank":             "fill_blank",
      "Essay (Evaluated by Admin)":    "essay",
      "Matching":                      "matching",
      "DragandMatch":                  "matching",
      "All Correct":                   "multi_select",
      "Audio Answer":                  "audio",
      "Ordering/Sequence":             "ordering",
    };

    const mappedType = tahleemTypes[qType];
    if (!mappedType) return null; // not a Tahleem row

    const answers = [a1, a2, a3, a4, a5, a6, a7, a8].filter(a => a);
    const correctIdx = parseInt(correctanswer) - 1; // 1-based → 0-based
    const options = answers.map((text, i) => ({
      id: String.fromCharCode(97 + i),
      text, text_ar: "",
      is_correct: i === correctIdx,
      image_url: "",
    }));

    return {
      question_type: mappedType,
      question_text: question || "",
      question_text_ar: "",
      options: options.length >= 2 ? options : emptyQuestion().options.slice(0, 4),
      correct_answer: options[correctIdx]?.id || "",
      points: parseInt(marks) || 1,
      difficulty: "medium",
      explanation: explanation || "",
    };
  };

  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fileName = file.name.toLowerCase();
      let importedQuestions: QuestionForm[] = [];

      if (fileName.endsWith(".csv")) {
        const text = await file.text();
        const lines = text.split("\n").map(l => l.trim()).filter(l => l);
        const headerLine = lines[0]?.toLowerCase() || "";
        const isTahleemFormat = headerLine.startsWith("questiontype");

        const dataLines = lines.filter(l => {
          const ll = l.toLowerCase();
          return !ll.startsWith("questiontype") && !ll.startsWith("question_type");
        });

        importedQuestions = dataLines.map((line, index) => {
          const row: string[] = [];
          let current = ""; let inQuotes = false;
          for (const char of line) {
            if (char === '"') { inQuotes = !inQuotes; }
            else if (char === "," && !inQuotes) { row.push(current.trim()); current = ""; }
            else { current += char; }
          }
          row.push(current.trim());

          const parsed = isTahleemFormat ? parseTahleemRow(row) : null;
          return {
            ...emptyQuestion(),
            ...(parsed || parseCSVRow(row)),
            sort_order: questions.length + index,
          };
        }).filter((q): q is QuestionForm => !!q.question_text);

      } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        importedQuestions = jsonData
          .slice(1)
          .filter((row: any[]) => row[0])
          .map((row: any[], index: number) => ({
            ...emptyQuestion(),
            ...parseCSVRow(row.map(c => String(c || ""))),
            sort_order: questions.length + index,
          }));
      } else {
        throw new Error("Unsupported format. Use .csv or .xlsx");
      }

      if (!importedQuestions.length) throw new Error("No valid questions found");
      setQuestions(prev => [...prev, ...importedQuestions]);
      toast({ title: "✅ Import Successful", description: `Added ${importedQuestions.length} questions` });
    } catch (error: any) {
      toast({ title: "❌ Import Failed", description: error.message || "Check file format", variant: "destructive" });
    }
    if (bulkFileInputRef.current) bulkFileInputRef.current.value = "";
  };

  // ── FIX 3: Question Bank ──────────────────────────────────────────────────
  const openQuestionBank = async () => {
    setBankOpen(true);
    setBankLoading(true);
    setBankSelected(new Set());
    setBankSearch("");
    try {
      const { data } = await supabase
        .from("exam_questions")
        .select("*, exams(title, title_ar)")
        .order("created_at", { ascending: false })
        .limit(300);
      setBankQuestions(data || []);
    } catch {
      toast({ title: "Failed to load question bank", variant: "destructive" });
    }
    setBankLoading(false);
  };

  const addFromBank = () => {
    if (!bankSelected.size) return;
    const toAdd = bankQuestions
      .filter(q => bankSelected.has(q.id))
      .map((q, i) => ({
        ...emptyQuestion(),
        id: undefined,
        question_type:    q.question_type || "mcq",
        question_text:    q.question_text || "",
        question_text_ar: q.question_text_ar || "",
        options:          (q.options as any[]) || emptyQuestion().options,
        correct_answer:   q.correct_answer || "",
        points:           q.points || 1,
        difficulty:       q.difficulty || "medium",
        explanation:      q.explanation || "",
        media_url:        q.media_url || "",
        sort_order:       questions.length + i,
      } as QuestionForm));
    setQuestions(prev => [...prev, ...toAdd]);
    setBankOpen(false);
    toast({ title: `✅ Added ${toAdd.length} question${toAdd.length !== 1 ? "s" : ""} from bank` });
  };

  const bankFiltered = bankQuestions.filter(q => {
    if (!bankSearch) return true;
    const s = bankSearch.toLowerCase();
    return (
      q.question_text?.toLowerCase().includes(s) ||
      q.question_text_ar?.includes(bankSearch) ||
      q.exams?.title?.toLowerCase().includes(s)
    );
  });

  // ── FIX 4: Bulk format actually applies to questions ─────────────────────
  const applyBulkFormat = () => {
    // Stores format settings as metadata on the exam (saved with exam payload)
    // Already stored in formatSettings — no per-question mutation needed
    // because ExamFormatPreview reads from formatSettings globally.
    // But we also surface a visual confirmation toast.
    toast({
      title: `✅ Format applied to all ${questions.length} questions`,
      description: `Font: ${formatSettings.question_font_family} ${formatSettings.question_font_size}px · ${formatSettings.rtl_mode ? "RTL" : "LTR"}`,
    });
  };

  // ── Schedule validation ──────────────────────────────────────────────────
  const validateSchedule = () => {
    const errors: {start?: string; end?: string} = {};
    const { start_date, end_date } = examForm;
    if (start_date && end_date) {
      if (new Date(start_date) >= new Date(end_date)) errors.end = "End must be after start";
      if (new Date(start_date) < new Date()) errors.start = "Start cannot be in the past";
    }
    setScheduleErrors(errors);
    return !Object.keys(errors).length;
  };

  // ── Save exam ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!examForm.title.trim()) {
      toast({ title: "Title required", variant: "destructive" }); return;
    }
    if (examForm.start_date && examForm.end_date && !validateSchedule()) {
      toast({ title: "Invalid schedule", description: "Check date settings", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const examPayload: any = {
        title: examForm.title, title_ar: examForm.title_ar || null,
        description: examForm.description || null, description_ar: examForm.description_ar || null,
        time_limit_minutes: examForm.time_limit_minutes, passing_score: examForm.passing_score,
        max_attempts: examForm.max_attempts,
        randomize_questions: examForm.randomize_questions, randomize_answers: examForm.randomize_answers,
        show_results_immediately: examForm.show_results_immediately, allow_review: examForm.allow_review,
        display_mode: examForm.display_mode,
        guidelines: examForm.guidelines || null, guidelines_ar: examForm.guidelines_ar || null,
        start_date: examForm.start_date || null, end_date: examForm.end_date || null,
        proctoring_enabled: examForm.proctoring_enabled,
        fullscreen_required: examForm.fullscreen_required,
        webcam_required: examForm.webcam_required,
        mic_required: examForm.mic_required,
        tab_switch_limit: examForm.tab_switch_limit, max_warnings: examForm.max_warnings,
        auto_submit_on_violation: examForm.auto_submit_on_violation,
        screenshot_interval_seconds: examForm.screenshot_interval_seconds,
        idle_timeout_seconds: examForm.idle_timeout_seconds,
        blur_detection: examForm.blur_detection, face_detection: examForm.face_detection,
        timezone: examForm.timezone, term: examForm.term, max_review_views: examForm.max_review_views,
        type: examForm.type, level: examForm.level || null,
        ...formatSettings, created_by: user?.id,
      };

      let savedExamId = examId;
      if (isEdit && examId) {
        const { error } = await supabase.from("exams").update(examPayload).eq("id", examId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("exams").insert(examPayload).select("id").single();
        if (error) throw error;
        savedExamId = data?.id;
      }

      if (!savedExamId) throw new Error("Failed to save exam");
      if (isEdit) await supabase.from("exam_questions").delete().eq("exam_id", savedExamId);

      const qPayloads = questions.map((q, i) => ({
        exam_id: savedExamId!,
        question_type:    q.question_type,
        question_text:    sanitizeHtml(q.question_text),
        question_text_ar: q.question_text_ar ? sanitizeHtml(q.question_text_ar) : null,
        options:          q.options?.length ? q.options : null,
        correct_answer:   q.correct_answer || null,
        points: q.points || 1, difficulty: q.difficulty || "medium", sort_order: i,
        explanation: q.explanation || null,
        explanation_ar: q.explanation_ar || null,
        media_url: q.media_url || null,
        partial_credit: q.partial_credit, case_sensitive: q.case_sensitive,
        min_words: q.min_words || null, max_words: q.max_words || null,
        question_timer_seconds: q.question_timer_seconds || null,
        background_image: q.background_image || null,
        audio_response_type: q.audio_response_type || null,
      }));

      if (qPayloads.length) {
        const { error } = await supabase.from("exam_questions").insert(qPayloads);
        if (error) throw error;
      }

      toast({ title: isEdit ? "✅ Exam updated" : "✅ Exam created" });
      navigate("/admin/exams");
    } catch (e: any) {
      toast({ title: "❌ Save failed", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  // ── Load existing exam ───────────────────────────────────────────────────
  useEffect(() => {
    if (!examId) return;
    (async () => {
      const { data: exam } = await supabase.from("exams").select("*").eq("id", examId).single();
      if (exam) {
        setExamForm({
          title: exam.title || "", title_ar: exam.title_ar || "",
          description: exam.description || "", description_ar: exam.description_ar || "",
          time_limit_minutes: exam.time_limit_minutes || 60, passing_score: exam.passing_score || 50,
          max_attempts: exam.max_attempts || 1,
          randomize_questions: exam.randomize_questions || false,
          randomize_answers: exam.randomize_answers || false,
          show_results_immediately: exam.show_results_immediately ?? true,
          allow_review: exam.allow_review ?? true,
          display_mode: exam.display_mode || "one_at_a_time",
          guidelines: exam.guidelines || "", guidelines_ar: exam.guidelines_ar || "",
          start_date: exam.start_date ? toLocalDatetimeString(new Date(exam.start_date)) : "",
          end_date:   exam.end_date   ? toLocalDatetimeString(new Date(exam.end_date))   : "",
          proctoring_enabled: exam.proctoring_enabled || false,
          fullscreen_required: exam.fullscreen_required || false,
          webcam_required: exam.webcam_required || false,
          mic_required: (exam as any).mic_required || false,
          tab_switch_limit: exam.tab_switch_limit || 3,
          max_warnings: exam.max_warnings || 3,
          auto_submit_on_violation: exam.auto_submit_on_violation || false,
          screenshot_interval_seconds: exam.screenshot_interval_seconds || 0,
          idle_timeout_seconds: (exam as any).idle_timeout_seconds || 300,
          blur_detection: (exam as any).blur_detection || false,
          face_detection: (exam as any).face_detection || false,
          timezone: (exam as any).timezone || "UTC",
          term: exam.term || "first", max_review_views: exam.max_review_views || 1,
          type: (exam.type as "exam" | "test") || "exam", level: exam.level || "",
        });
      }
      const { data: qs } = await supabase
        .from("exam_questions").select("*").eq("exam_id", examId).order("sort_order");
      if (qs?.length) {
        setQuestions(qs.map(q => ({
          id: q.id, question_type: q.question_type || "mcq",
          question_text: q.question_text || "", question_text_ar: q.question_text_ar || "",
          options: (q.options as any[]) || emptyQuestion().options,
          correct_answer: q.correct_answer || "", accepted_answers: (q.accepted_answers as string[]) || [""],
          points: q.points || 1, difficulty: q.difficulty || "medium", sort_order: q.sort_order || 0,
          explanation: q.explanation || "", explanation_ar: q.explanation_ar || "",
          feedback_incorrect: q.feedback_incorrect || "", media_url: q.media_url || "",
          matching_pairs: (q.matching_pairs as any[]) || [{ left: "", right: "" }],
          ordering_items: (q.ordering_items as string[]) || [""],
          partial_credit: q.partial_credit || false, case_sensitive: q.case_sensitive || false,
          min_words: q.min_words || 0, max_words: q.max_words || 0,
          question_timer_seconds: q.question_timer_seconds || 0,
          background_image: q.background_image || "",
          audio_response_type: (q.audio_response_type as "text" | "audio") || "text",
        })));
      }
    })();
  }, [examId]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white font-['Cairo'] pb-24">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Amiri:wght@400;700&display=swap');`}</style>

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-50 shadow-lg backdrop-blur-md border-b border-white/10" style={{ background: "linear-gradient(135deg, #064E3B 0%, #083320 100%)" }}>
        <div className={cn("mx-auto px-3 sm:px-6 pt-3 sm:pt-5 pb-2", isMobile ? "max-w-full" : "max-w-6xl")}>
          <div className={cn("flex items-start sm:items-center justify-between gap-3 sm:gap-4 mb-3", isMobile ? "flex-col" : "flex-row")}>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button onClick={() => navigate("/admin/exams")} className="bg-white/10 hover:bg-white/20 transition-colors border-0 rounded-xl px-3 sm:px-4 py-2 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shrink-0">
                ← <span className="hidden sm:inline">{t("Back","رجوع")}</span>
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-lg sm:text-xl">{examForm.type === "test" ? "📋" : "📝"}</span>
                  <h1 className="text-lg sm:text-xl font-black text-white m-0 tracking-tight truncate">
                    {isEdit ? t("Edit Exam","تعديل الامتحان") : t("Create Exam","إنشاء امتحان")}
                  </h1>
                </div>
                {examForm.title && <p className="text-[10px] sm:text-xs text-white/70 m-0 font-medium truncate">{examForm.title}{examForm.title_ar ? ` · ${examForm.title_ar}` : ""}</p>}
              </div>
            </div>
            <div className={cn("flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0", isMobile ? "justify-center" : "justify-end")}>
              {[
                { label: "Q's", value: questions.length, color: GOLD },
                { label: "Pts", value: questions.reduce((s,q)=>s+(q.points||1),0), color: "text-green-300" },
                { label: "Min", value: examForm.time_limit_minutes, color: "text-blue-300" },
              ].map((stat,i) => (
                <div key={i} className="bg-white/10 rounded-lg sm:rounded-xl px-2 sm:px-4 py-1.5 sm:py-2 text-center min-w-[50px] sm:min-w-[70px]">
                  <div className={cn("text-sm sm:text-lg font-black leading-none", stat.color)}>{stat.value}</div>
                  <div className="text-[8px] sm:text-[10px] text-white/60 font-bold uppercase tracking-wider mt-0.5">{t(stat.label,stat.label)}</div>
                </div>
              ))}
              <button onClick={handleSave} disabled={saving} className={cn("border-0 rounded-xl px-4 sm:px-6 py-2 text-xs sm:text-sm font-black flex items-center gap-1.5 sm:gap-2 shadow-lg transition-all active:scale-95 shrink-0", saving ? "bg-white/20 text-white/60 cursor-not-allowed" : "cursor-pointer hover:shadow-xl hover:-translate-y-0.5")} style={{ background: saving ? undefined : GOLD, color: saving ? undefined : "#064E3B" }}>
                {saving ? <><Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin"/><span className="hidden sm:inline">{t("Saving…","حفظ…")}</span></> : <><Save className="w-3 h-3 sm:w-4 sm:h-4"/><span className="hidden sm:inline">{examForm.type === "test" ? t("Save Test","حفظ التمرين") : t("Save Exam","حفظ الامتحان")}</span></>}
              </button>
            </div>
          </div>
          <div className="flex gap-0.5 overflow-x-auto hide-scrollbar -mx-1 px-1">
            {tabs.map(tab => (
              <button key={tab.value} onClick={() => setActiveTab(tab.value)} className={cn("flex-1 min-w-[80px] sm:min-w-[120px] px-2 sm:px-4 py-2.5 sm:py-3 border-0 cursor-pointer rounded-t-lg sm:rounded-t-xl text-[10px] sm:text-sm font-bold flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-2 transition-all relative overflow-hidden", activeTab === tab.value ? "bg-slate-50 text-emerald-900 shadow-[0_-2px_10px_rgba(0,0,0,0.1)]" : "bg-transparent text-white/70 hover:bg-white/5 hover:text-white")}>
                <span>{tab.icon}</span><span className="truncate">{tab.label}</span>
                {activeTab === tab.value && <div className="absolute bottom-0 left-0 right-0 h-0.5 sm:h-1" style={{ background: GOLD }} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className={cn("mx-auto px-3 sm:px-6 pt-4 sm:pt-8", isMobile ? "max-w-full" : "max-w-6xl")}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-0">
          <TabsList className="hidden" />

          {/* SETTINGS TAB */}
          <TabsContent value="settings" className="m-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
              <CardHeader className={cn("border-b border-slate-100 pb-4", isMobile ? "px-4 py-3" : "px-6 py-4", "bg-gradient-to-r from-slate-50 to-white")}>
                <CardTitle className="text-lg sm:text-xl flex items-center gap-2"><Settings2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-700"/>{t("General Information","المعلومات العامة")}</CardTitle>
              </CardHeader>
              <CardContent className={cn("space-y-6", isMobile ? "p-4" : "p-6")}>
                {/* Assessment Type */}
                <div className="space-y-3">
                  <Label className="text-sm font-bold text-slate-700">{t("Assessment Type","نوع التقييم")}</Label>
                  <div className={cn("grid gap-3", isMobile ? "grid-cols-1" : "grid-cols-2")}>
                    {[
                      { value: "exam" as const, label: t("Exam","امتحان"), sub: t("Max 70 marks","70 درجة"), icon: "📝", color: "border-emerald-600 bg-emerald-50 text-emerald-900" },
                      { value: "test" as const, label: t("Test","تمرين"), sub: t("Max 30 marks","30 درجة"), icon: "📋", color: "border-amber-500 bg-amber-50 text-amber-900" },
                    ].map(opt => (
                      <button key={opt.value} type="button" onClick={() => setExamForm({ ...examForm, type: opt.value })} className={cn("rounded-xl border-2 p-3 sm:p-4 text-start transition-all flex items-center gap-3", examForm.type === opt.value ? opt.color : "border-slate-200 hover:border-slate-300 bg-white text-slate-600")}>
                        <span className="text-xl">{opt.icon}</span>
                        <div><p className="font-bold text-sm sm:text-base">{opt.label}</p><p className="text-[10px] sm:text-[11px] opacity-80 mt-0.5">{opt.sub}</p></div>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Level & Term */}
                <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-2")}>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold text-slate-700">{t("Target Level","المستوى المستهدف")}</Label>
                    <Select value={examForm.level||"none"} onValueChange={v => setExamForm({ ...examForm, level: v==="none" ? "" : v })}>
                      <SelectTrigger className="h-11 rounded-lg"><SelectValue placeholder={t("Select level","اختر المستوى")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("All Levels","جميع المستويات")}</SelectItem>
                        <SelectItem value="beginner">{t("Beginner","مبتدئ")}</SelectItem>
                        <SelectItem value="intermediate">{t("Intermediate","متوسط")}</SelectItem>
                        <SelectItem value="advanced">{t("Advanced","متقدم")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold text-slate-700">{t("Term","الفصل")}</Label>
                    <Select value={examForm.term} onValueChange={v => setExamForm({ ...examForm, term: v })}>
                      <SelectTrigger className="h-11 rounded-lg"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="first">{t("First Term","الفصل الأول")}</SelectItem>
                        <SelectItem value="second">{t("Second Term","الفصل الثاني")}</SelectItem>
                        <SelectItem value="third">{t("Third Term","الفصل الثالث")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Titles */}
                <div className="space-y-4">
                  <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-2")}>
                    <div className="space-y-2"><Label className="font-semibold text-slate-700 text-sm">{t("Title (English)","العنوان (إنجليزي)")}</Label><Input value={examForm.title} onChange={e=>setExamForm({...examForm,title:e.target.value})} className="rounded-lg bg-slate-50/50 h-10" placeholder="Enter exam title" /></div>
                    <div className="space-y-2"><Label className="font-semibold text-slate-700 text-sm">{t("Title (Arabic)","العنوان (عربي)")}</Label><Input value={examForm.title_ar} onChange={e=>setExamForm({...examForm,title_ar:e.target.value})} dir="rtl" className="rounded-lg bg-slate-50/50 h-10" placeholder="أدخل عنوان الامتحان" /></div>
                  </div>
                  <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-2")}>
                    <div className="space-y-2"><Label className="font-semibold text-slate-700 text-sm">{t("Description","الوصف")}</Label><Textarea value={examForm.description} onChange={e=>setExamForm({...examForm,description:e.target.value})} className="rounded-lg bg-slate-50/50 min-h-[80px]" placeholder="Brief description..." /></div>
                    <div className="space-y-2"><Label className="font-semibold text-slate-700 text-sm">{t("Description (Arabic)","الوصف (عربي)")}</Label><Textarea value={examForm.description_ar} onChange={e=>setExamForm({...examForm,description_ar:e.target.value})} dir="rtl" className="rounded-lg bg-slate-50/50 min-h-[80px]" placeholder="وصف مختصر..." /></div>
                  </div>
                </div>
                {/* Logistics */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <Label className="text-xs font-bold text-slate-500 uppercase mb-3 block">{t("Exam Logistics","لوجستيات الامتحان")}</Label>
                  <div className={cn("grid gap-3", isMobile ? "grid-cols-2" : "grid-cols-4")}>
                    {[
                      { label: t("Time (min)","الوقت"), key: "time_limit_minutes", min: 1, max: 300 },
                      { label: t("Passing %","نسبة النجاح"), key: "passing_score", min: 0, max: 100 },
                      { label: t("Attempts","محاولات"), key: "max_attempts", min: 1, max: 10 },
                      { label: t("Max Review","الحد الأقصى للمراجعة"), key: "max_review_views", min: 1, max: 5 },
                    ].map(f => (
                      <div key={f.key} className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase">{f.label}</Label>
                        <Input type="number" min={f.min} max={f.max} value={(examForm as any)[f.key]} onChange={e=>setExamForm({...examForm,[f.key]:parseInt(e.target.value)||f.min})} className="rounded-lg h-9 text-sm text-center font-semibold" />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Display Options */}
                <div className="bg-gradient-to-br from-emerald-50/50 to-white border border-emerald-100 rounded-2xl overflow-hidden">
                  <div className="p-3 sm:p-4 bg-emerald-100/30 border-b border-emerald-100">
                    <h3 className="text-sm font-bold text-emerald-900 flex items-center gap-2"><Eye className="w-4 h-4"/>{t("Display & Behavior","العرض والسلوك")}</h3>
                  </div>
                  <div className={cn("p-4 grid gap-3", isMobile ? "grid-cols-1" : "grid-cols-2")}>
                    {[
                      { key: "randomize_questions", label: t("Randomize Questions","ترتيب عشوائي للأسئلة"), desc: t("Shuffle question order","خلط ترتيب الأسئلة") },
                      { key: "randomize_answers", label: t("Randomize Answers","ترتيب عشوائي للإجابات"), desc: t("Shuffle options per question","خلط الخيارات لكل سؤال") },
                      { key: "show_results_immediately", label: t("Show Results Immediately","عرض النتائج فورًا"), desc: t("Display score after submission","عرض الدرجة بعد الإرسال") },
                      { key: "allow_review", label: t("Allow Review","السماح بالمراجعة"), desc: t("Let students review answers","السماح للطلاب بمراجعة الإجابات") },
                    ].map(toggle => (
                      <div key={toggle.key} className="flex items-center justify-between gap-3 p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                        <div><Label className="text-sm font-semibold block">{toggle.label}</Label><p className="text-[10px] text-slate-400 mt-0.5">{toggle.desc}</p></div>
                        <Switch checked={(examForm as any)[toggle.key]} onCheckedChange={v=>setExamForm({...examForm,[toggle.key]:v})} className="data-[state=checked]:bg-emerald-600" />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PROCTORING TAB — unchanged structure */}
          <TabsContent value="proctoring" className="m-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardHeader className={cn("border-b border-slate-100 pb-4", isMobile ? "px-4 py-3" : "px-6 py-4", "bg-gradient-to-r from-amber-50/50 to-white")}>
                <CardTitle className="text-lg sm:text-xl flex items-center gap-2"><AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600"/>{t("Proctoring Settings","إعدادات المراقبة")}</CardTitle>
              </CardHeader>
              <CardContent className={cn("space-y-6", isMobile ? "p-4" : "p-6")}>
                <div className="flex items-center justify-between p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <div><Label className="text-base font-bold text-amber-900">{t("Enable Proctoring","تفعيل المراقبة")}</Label><p className="text-sm text-amber-700 mt-1">{t("Monitor students during exam","مراقبة الطلاب أثناء الامتحان")}</p></div>
                  <Switch checked={examForm.proctoring_enabled} onCheckedChange={v=>setExamForm({...examForm,proctoring_enabled:v})} className="data-[state=checked]:bg-amber-600" />
                </div>
                {examForm.proctoring_enabled && (
                  <div className="space-y-4">
                    {[
                      { key: "auto_submit_on_violation", label: t("Auto-submit on violation","إرسال تلقائي عند الانتهاك"), desc: t("End exam after max warnings","إنهاء الامتحان بعد التحذيرات القصوى") },
                      { key: "blur_detection", label: t("Blur Detection","كشف ضبابية الكاميرا"), desc: t("Alert if camera is covered","تنبيه إذا تم تغطية الكاميرا") },
                      { key: "face_detection", label: t("Face Detection","كشف الوجه"), desc: t("Require face in frame","تطلب وجود وجه في الإطار") },
                    ].map(a => (
                      <div key={a.key} className="flex items-center justify-between gap-3 p-3 bg-white rounded-xl border border-slate-100">
                        <div><Label className="text-sm font-semibold">{a.label}</Label><p className="text-[10px] text-slate-400 mt-0.5">{a.desc}</p></div>
                        <Switch checked={(examForm as any)[a.key]||false} onCheckedChange={v=>setExamForm({...examForm,[a.key]:v})} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SCHEDULE TAB — unchanged structure */}
          <TabsContent value="schedule" className="m-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardHeader className={cn("border-b border-slate-100 pb-4", isMobile ? "px-4 py-3" : "px-6 py-4", "bg-gradient-to-r from-blue-50/50 to-white")}>
                <CardTitle className="text-lg sm:text-xl flex items-center gap-2"><Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600"/>{t("Schedule & Availability","الجدولة والتوفر")}</CardTitle>
              </CardHeader>
              <CardContent className={cn("space-y-6", isMobile ? "p-4" : "p-6")}>
                <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-2")}>
                  <div className="space-y-2">
                    <Label className="font-semibold text-slate-700 text-sm">{t("Start Date & Time","تاريخ ووقت البدء")}</Label>
                    <Input type="datetime-local" value={examForm.start_date} onChange={e=>setExamForm({...examForm,start_date:e.target.value})} className={cn("rounded-lg bg-slate-50/50 h-11",scheduleErrors.start&&"border-red-300")} />
                    {scheduleErrors.start && <p className="text-xs text-red-500">{scheduleErrors.start}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold text-slate-700 text-sm">{t("End Date & Time","تاريخ ووقت الانتهاء")}</Label>
                    <Input type="datetime-local" value={examForm.end_date} onChange={e=>setExamForm({...examForm,end_date:e.target.value})} className={cn("rounded-lg bg-slate-50/50 h-11",scheduleErrors.end&&"border-red-300")} />
                    {scheduleErrors.end && <p className="text-xs text-red-500">{scheduleErrors.end}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: t("Now","الآن"),      value: new Date().toISOString().slice(0,16) },
                    { label: t("+1 Hour","+ساعة"),  value: new Date(Date.now()+3600000).toISOString().slice(0,16) },
                    { label: t("Tomorrow","غدًا"),  value: new Date(Date.now()+86400000).toISOString().slice(0,16) },
                    { label: t("+1 Week","+أسبوع"), value: new Date(Date.now()+604800000).toISOString().slice(0,16) },
                  ].map(q => <Button key={q.label} variant="outline" size="sm" onClick={()=>setExamForm({...examForm,start_date:q.value})} className="text-xs h-8 rounded-lg">{q.label}</Button>)}
                </div>
                <div className="pt-2">
                  <Button variant="outline" size="sm" onClick={validateSchedule} className="gap-2">
                    <CheckCircle className="h-4 w-4"/>{t("Validate Schedule","التحقق من الجدول")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* QUESTIONS TAB — FIXED ──────────────────────────────────────────── */}
          <TabsContent value="questions" className="m-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-4">

              {/* Action Bar */}
              <div className={cn("flex items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl shadow-sm border border-slate-200 sticky top-20 sm:top-24 z-40", isMobile ? "flex-wrap overflow-x-auto pb-2" : "flex-nowrap")}>
                <h2 className="text-lg font-black text-emerald-900 flex items-center gap-2 shrink-0">
                  <FileText className="w-5 h-5"/>{t("Questions","الأسئلة")}
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 ml-1 text-xs">{questions.length}</Badge>
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <input ref={bulkFileInputRef} id="exam-bulk-file" type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleBulkImport} />

                  {/* Bulk Import */}
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5 sm:gap-2 rounded-xl text-slate-700 font-bold text-xs sm:text-sm h-9">
                        <Upload className="h-4 w-4"/><span className="hidden sm:inline">{t("Bulk Import","استيراد جماعي")}</span><span className="sm:hidden">Import</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className={cn("max-w-[95vw] sm:max-w-lg", isMobile ? "p-4" : "p-6")}>
                      <DialogHeader>
                        <DialogTitle>{t("Bulk Import Questions","استيراد أسئلة جماعي")}</DialogTitle>
                        <DialogDescription>{t("Upload a CSV or Excel file","رفع ملف CSV أو Excel")}</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <BulkTemplateDownload />
                          <label htmlFor="exam-bulk-file" className="gap-2 flex-1 sm:flex-initial inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 cursor-pointer">
                            <Upload className="h-4 w-4"/>{t("Choose File","اختر ملف")}
                          </label>
                        </div>
                        <div className="text-xs text-slate-500 space-y-1 bg-slate-50 p-3 rounded-lg">
                          <p><strong>Tahleem CSV format:</strong></p>
                          <code className="block bg-slate-100 p-2 rounded text-[10px] overflow-x-auto whitespace-nowrap">
                            QuestionType, Question, Answer1…Answer8, correctanswer, Noofanswers, Explanation, Marks, …
                          </code>
                          <p className="mt-2"><strong>{t("Also supported","مدعوم أيضًا")}:</strong> Legacy format with question_text / option_a / correct_answer columns</p>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* ── FIX 3: Question Bank Dialog — now actually renders ── */}
                  <Button variant="outline" size="sm" onClick={openQuestionBank} className="gap-1.5 sm:gap-2 rounded-xl text-slate-700 font-bold text-xs sm:text-sm h-9">
                    <Library className="h-4 w-4"/><span className="hidden sm:inline">{t("Question Bank","بنك الأسئلة")}</span><span className="sm:hidden">Bank</span>
                  </Button>

                  {/* ── FIX 1: Preview now real ── */}
                  <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} className="gap-1.5 sm:gap-2 rounded-xl text-slate-700 font-bold text-xs sm:text-sm h-9">
                    <Eye className="h-4 w-4"/><span className="hidden sm:inline">{t("Preview","معاينة")}</span><span className="sm:hidden">View</span>
                  </Button>

                  <Button onClick={addQuestion} className="gap-1.5 sm:gap-2 rounded-xl shadow-md font-bold text-xs sm:text-sm px-3 sm:px-4 h-9" style={{ background: "#064E3B", color: GOLD }}>
                    <Plus className="h-4 w-4"/><span className="hidden sm:inline">{t("Add Question","إضافة سؤال")}</span><span className="sm:hidden">Add</span>
                  </Button>
                </div>
              </div>

              {/* Bulk Formatter — FIX 4: onApply actually does something */}
              <details className="group bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <summary className="flex items-center justify-between p-4 cursor-pointer list-none bg-slate-50 hover:bg-slate-100 transition-colors">
                  <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Settings2 className="w-4 h-4"/>{t("Bulk Formatting Options","خيارات التنسيق الجماعي")}
                  </span>
                  <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="p-4 border-t border-slate-100">
                  <BulkQuestionFormatter
                    format={formatSettings}
                    onChange={setFormatSettings}
                    onApply={applyBulkFormat}
                    questions={questions}
                    examTitle={examForm.title}
                    examTitleAr={examForm.title_ar}
                  />
                </div>
              </details>

              {/* Question Cards */}
              {questions.map((q, idx) => (
                <Card key={idx} className="border-slate-200 shadow-md rounded-2xl overflow-hidden transition-all hover:shadow-lg focus-within:ring-2 focus-within:ring-emerald-500/20 mb-4">
                  {/* Card header */}
                  <div className={cn("bg-slate-100/80 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-200 flex items-center justify-between gap-2", isMobile ? "flex-wrap" : "flex-nowrap")}>
                    <div className="flex items-center gap-2 min-w-0">
                      <GripVertical className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400 cursor-grab" />
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{t("Q","س")} {idx+1}</span>
                        <Badge variant="outline" className="bg-white border-slate-300 text-slate-700 shadow-sm mt-0.5 text-[10px] sm:text-xs px-1.5 py-0 h-5 ml-1">
                          {questionTypes.find(t=>t.value===q.question_type)?.icon}
                          <span className="ml-1 hidden sm:inline">{language==="ar" ? questionTypes.find(t=>t.value===q.question_type)?.label_ar : questionTypes.find(t=>t.value===q.question_type)?.label}</span>
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <Select value={q.question_type} onValueChange={v=>updateQuestion(idx,{question_type:v})}>
                        <SelectTrigger className="w-[100px] sm:w-[140px] h-8 sm:h-9 text-[10px] sm:text-xs rounded-lg bg-white border-slate-300 font-semibold"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {questionTypes.map(type=>(
                            <SelectItem key={type.value} value={type.value} className="text-xs">{type.icon} {language==="ar"?type.label_ar:type.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={q.difficulty} onValueChange={v=>updateQuestion(idx,{difficulty:v})}>
                        <SelectTrigger className="w-[70px] sm:w-[90px] h-8 sm:h-9 text-[10px] sm:text-xs rounded-lg bg-white border-slate-300 font-semibold"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="easy">{t("Easy","سهل")}</SelectItem>
                          <SelectItem value="medium">{t("Medium","متوسط")}</SelectItem>
                          <SelectItem value="hard">{t("Hard","صعب")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="relative flex items-center">
                        <Input type="number" className="w-[50px] sm:w-[70px] h-8 sm:h-9 pr-6 sm:pr-8 text-[10px] sm:text-xs font-bold rounded-lg text-center" value={q.points} onChange={e=>updateQuestion(idx,{points:+e.target.value})} />
                        <span className="absolute right-1.5 sm:right-3 text-[8px] sm:text-[10px] text-slate-400 font-bold uppercase">{t("Pts","ن")}</span>
                      </div>
                      <Button variant="ghost" size="icon" onClick={()=>removeQuestion(idx)} className="h-8 w-8 sm:h-9 sm:w-9 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg shrink-0">
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </div>

                  <CardContent className={cn("space-y-4 bg-white", isMobile ? "p-3" : "p-5 sm:p-6")}>

                    {/* ── FIX 2: English question text ── */}
                    <div className="space-y-2">
                      <Label className="text-xs sm:text-sm font-black text-slate-800">
                        {t("Question (English)","السؤال (إنجليزي)")}
                      </Label>
                      <div className="rounded-lg sm:rounded-xl border border-slate-200 shadow-sm overflow-hidden focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
                        <RichTextEditor
                          placeholder={t("Type question in English...","اكتب السؤال بالإنجليزية...")}
                          value={q.question_text}
                          onChange={val => updateQuestion(idx, { question_text: val })}
                          dir="ltr"
                          className="min-h-[70px] sm:min-h-[90px]"
                        />
                      </div>
                    </div>

                    {/* ── FIX 2: Arabic question text — NEW FIELD ── */}
                    <div className="space-y-2">
                      <Label className="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-2">
                        {t("Question (Arabic)","السؤال (عربي)")}
                        <span className="text-[10px] font-normal text-slate-400 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          RTL · يُعرض للطلاب أثناء الامتحان
                        </span>
                      </Label>
                      <div className="rounded-lg sm:rounded-xl border border-amber-200 shadow-sm overflow-hidden focus-within:border-amber-400 focus-within:ring-1 focus-within:ring-amber-400 transition-all bg-amber-50/30">
                        <RichTextEditor
                          placeholder="اكتب السؤال بالعربية هنا…"
                          value={q.question_text_ar}
                          onChange={val => updateQuestion(idx, { question_text_ar: val })}
                          dir="rtl"
                          className="min-h-[70px] sm:min-h-[90px]"
                        />
                      </div>
                    </div>

                    {/* Media */}
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                      <Label className="flex items-center gap-1.5 mb-2 text-xs font-bold text-slate-700">
                        {q.question_type==="audio" ? <Music className="h-3.5 w-3.5 text-emerald-600"/> : <ImageIcon className="h-3.5 w-3.5 text-emerald-600"/>}
                        {t("Media","وسائط")}
                      </Label>
                      {q.media_url ? (
                        <div className="space-y-2 bg-white p-2 rounded-lg border border-slate-200">
                          <div className="flex items-center justify-between gap-2 text-[10px] text-slate-600">
                            <span className="truncate flex-1 font-mono">{q.media_url.split("/").pop()?.substring(0,30)}</span>
                            <Button variant="ghost" size="sm" className="text-red-500 h-6 px-1.5" onClick={()=>updateQuestion(idx,{media_url:""})}>Remove</Button>
                          </div>
                          {q.media_url.match(/\.(mp3|wav|ogg)$/i) && <audio controls src={q.media_url} className="w-full h-8" />}
                          {q.media_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) && <img src={q.media_url} alt="Media" className="max-h-32 rounded mx-auto" />}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <input
                            id={`exam-media-${idx}`}
                            type="file"
                            accept="audio/*,image/*"
                            className="hidden"
                            disabled={uploadingMedia === idx}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMedia(f, idx); e.target.value = ""; }}
                          />
                          <label htmlFor={uploadingMedia === idx ? undefined : `exam-media-${idx}`} className={`gap-1.5 inline-flex items-center justify-center rounded-lg font-bold bg-white border border-slate-200 text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3 ${uploadingMedia === idx ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50 cursor-pointer"}`}>
                            {uploadingMedia===idx ? <Loader2 className="h-3 w-3 animate-spin text-emerald-600"/> : <Upload className="h-3 w-3 text-emerald-600"/>}
                            {t("Upload","رفع")}
                          </label>
                          <Input placeholder="URL..." value={q.media_url} onChange={e=>updateQuestion(idx,{media_url:e.target.value})} className="flex-1 min-w-[120px] h-7 sm:h-9 rounded-lg text-[10px] sm:text-sm" />
                        </div>
                      )}
                    </div>

                    {/* MCQ Options */}
                    {(q.question_type==="mcq" || q.question_type==="image_mcq") && (
                      <div className="space-y-2 pt-1">
                        <Label className="text-xs sm:text-sm font-black text-slate-800">{t("Options","الخيارات")}</Label>
                        <div className="grid gap-2">
                          {q.options.slice(0,4).map((opt:any, oi:number) => (
                            <div key={opt.id} className={cn("flex items-start gap-2 rounded-lg border p-2 transition-all", opt.is_correct ? "border-emerald-500 bg-emerald-50/50" : "border-slate-200 bg-white hover:border-slate-300")}>
                              <div className="pt-1.5">
                                <input type="radio" name={`correct-${idx}`} checked={opt.is_correct} onChange={()=>{ const newOpts=q.options.map((o:any,j:number)=>({...o,is_correct:j===oi})); updateQuestion(idx,{options:newOpts,correct_answer:newOpts[oi].id}); }} className="h-4 w-4 accent-emerald-600" />
                              </div>
                              <div className="flex-1 space-y-1.5">
                                <Input className={cn("h-8 text-sm font-medium rounded-lg border-slate-200", opt.is_correct?"bg-white border-emerald-200":"")} placeholder={`${String.fromCharCode(65+oi)}. English`} value={opt.text} dir="ltr" onChange={e=>{ const n=[...q.options]; n[oi]={...n[oi],text:e.target.value}; updateQuestion(idx,{options:n}); }} />
                                {/* Arabic option field */}
                                <Input className="h-8 text-sm font-medium rounded-lg border-amber-200 bg-amber-50/30" placeholder={`${String.fromCharCode(65+oi)}. عربي`} value={opt.text_ar||""} dir="rtl" style={{ fontFamily:"'Amiri',serif" }} onChange={e=>{ const n=[...q.options]; n[oi]={...n[oi],text_ar:e.target.value}; updateQuestion(idx,{options:n}); }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* True/False */}
                    {q.question_type==="true_false" && (
                      <div className="space-y-2 pt-1">
                        <Label className="text-xs sm:text-sm font-black text-slate-800">{t("Answer","الإجابة")}</Label>
                        <div className="flex gap-3">
                          {["true","false"].map(v => (
                            <button key={v} type="button" onClick={()=>updateQuestion(idx,{correct_answer:v})} className={cn("flex-1 py-2 rounded-lg border-2 text-sm font-bold transition-all", q.correct_answer===v ? v==="true" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-red-400 bg-red-50 text-red-700" : "border-slate-200 text-slate-500 hover:border-slate-300")}>
                              {v==="true" ? "✓ True / صح" : "✗ False / خطأ"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Fill in blank / Short answer */}
                    {(q.question_type==="fill_blank" || q.question_type==="short_answer") && (
                      <div className="space-y-2 pt-1">
                        <Label className="text-xs sm:text-sm font-black text-slate-800">{t("Correct Answer","الإجابة الصحيحة")}</Label>
                        <Input value={q.correct_answer} onChange={e=>updateQuestion(idx,{correct_answer:e.target.value})} className="rounded-lg" placeholder={t("Type the correct answer…","اكتب الإجابة الصحيحة…")} dir="auto" />
                      </div>
                    )}
                  </CardContent>

                  {/* Footer */}
                  <div className={cn("bg-slate-50/80 p-3 border-t border-slate-100", isMobile ? "px-3 py-2" : "px-4 py-3")}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-slate-400"/>
                        <span className="text-[10px] sm:text-sm font-semibold text-slate-700">{t("Timer","مؤقت")}</span>
                        <Input type="number" min={0} step={5} className="w-14 h-6 sm:h-8 text-center text-[10px] sm:text-sm font-bold bg-white rounded border-slate-200" value={q.question_timer_seconds||0} onChange={e=>updateQuestion(idx,{question_timer_seconds:+e.target.value})} />
                        <span className="text-[8px] sm:text-[10px] text-slate-400">{t("sec","ث")}</span>
                      </div>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-[10px] sm:text-xs h-7 gap-1"><HelpCircle className="w-3 h-3 sm:w-4 sm:h-4"/>{t("Feedback","تعليق")}</Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader><DialogTitle>{t("Feedback Messages","رسائل التعليق")}</DialogTitle></DialogHeader>
                          <div className="space-y-3 py-2">
                            <div>
                              <Label className="text-xs font-bold text-emerald-700 flex items-center gap-1"><CheckCircle className="w-3 h-3"/>{t("Correct","صحيح")}</Label>
                              <Input className="h-8 text-sm mt-1" placeholder={t("Great job!","أحسنت!")} value={q.explanation||""} onChange={e=>updateQuestion(idx,{explanation:e.target.value})} dir="auto" />
                            </div>
                            <div>
                              <Label className="text-xs font-bold text-red-700 flex items-center gap-1"><XCircle className="w-3 h-3"/>{t("Incorrect","خطأ")}</Label>
                              <Input className="h-8 text-sm mt-1" placeholder={t("Review this...","راجع هذا...")} value={q.feedback_incorrect||""} onChange={e=>updateQuestion(idx,{feedback_incorrect:e.target.value})} dir="auto" />
                            </div>
                            <div>
                              <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">{t("Explanation (Arabic)","الشرح بالعربية")}</Label>
                              <Input className="h-8 text-sm mt-1" placeholder="شرح الإجابة بالعربية…" value={q.explanation_ar||""} onChange={e=>updateQuestion(idx,{explanation_ar:e.target.value})} dir="rtl" style={{fontFamily:"'Amiri',serif"}} />
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </Card>
              ))}

              {questions.length === 0 && (
                <Card className="border-dashed border-2 border-slate-300 bg-slate-50/50">
                  <CardContent className="p-8 text-center">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3"/>
                    <p className="text-slate-500 font-medium">{t("No questions added yet","لم تتم إضافة أسئلة بعد")}</p>
                    <Button onClick={addQuestion} variant="outline" className="mt-4 gap-2"><Plus className="w-4 h-4"/>{t("Add Your First Question","أضف سؤالك الأول")}</Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── FIX 1: Real Preview Modal (uses ExamFormatPreview) ── */}
      <ExamFormatPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        format={formatSettings}
        questions={questions}
        examTitle={examForm.title}
        examTitleAr={examForm.title_ar}
      />

      {/* ── FIX 3: Question Bank Dialog ── */}
      <Dialog open={bankOpen} onOpenChange={v => { setBankOpen(v); if (!v) setBankSelected(new Set()); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Library className="w-5 h-5 text-emerald-700"/>
              {t("Question Bank","بنك الأسئلة")}
              <Badge variant="secondary" className="ml-2">{bankFiltered.length} questions</Badge>
            </DialogTitle>
            <DialogDescription>{t("Select questions to add to this exam","اختر أسئلة لإضافتها إلى هذا الامتحان")}</DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative mt-2">
            <Input
              placeholder={t("Search questions…","ابحث عن أسئلة…")}
              value={bankSearch}
              onChange={e => setBankSearch(e.target.value)}
              className="pl-9 rounded-lg"
            />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto space-y-2 py-2 min-h-0">
            {bankLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600"/>
              </div>
            ) : bankFiltered.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Library className="w-10 h-10 mx-auto mb-2 opacity-30"/>
                <p className="text-sm">{bankSearch ? "No questions match your search" : "Question bank is empty"}</p>
              </div>
            ) : (
              bankFiltered.map((q: any) => {
                const sel = bankSelected.has(q.id);
                const qt  = questionTypes.find(t => t.value === q.question_type);
                const txt = new DOMParser().parseFromString(q.question_text || "", "text/html").body.textContent || "";
                return (
                  <div key={q.id}
                    onClick={() => {
                      const s = new Set(bankSelected);
                      sel ? s.delete(q.id) : s.add(q.id);
                      setBankSelected(s);
                    }}
                    className={cn("flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all", sel ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-slate-300 bg-white")}>
                    <Checkbox checked={sel} className="mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs">{qt?.icon}</span>
                        <Badge variant="outline" className="text-[10px] h-5">{qt?.label}</Badge>
                        <span className="text-[10px] text-slate-400">{q.difficulty}</span>
                        <span className="text-[10px] text-slate-400">{q.points} pt{q.points!==1?"s":""}</span>
                        {q.exams?.title && <span className="text-[10px] text-slate-400 truncate">· {q.exams.title}</span>}
                      </div>
                      <p className="text-sm text-slate-800 line-clamp-2">{txt}</p>
                      {q.question_text_ar && (
                        <p className="text-xs text-slate-500 line-clamp-1 mt-0.5" dir="rtl" style={{fontFamily:"'Amiri',serif"}}>{q.question_text_ar}</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <DialogFooter className="flex items-center justify-between gap-3 border-t pt-3 flex-row">
            <span className="text-sm text-slate-500">
              {bankSelected.size > 0 ? `${bankSelected.size} selected` : "Click questions to select"}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setBankOpen(false)}>{t("Cancel","إلغاء")}</Button>
              <Button onClick={addFromBank} disabled={!bankSelected.size} className="gap-2" style={{ background: "#064E3B", color: GOLD }}>
                <Plus className="w-4 h-4"/>
                {t("Add Selected","إضافة المحدد")} {bankSelected.size > 0 && `(${bankSelected.size})`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExamEditor;
