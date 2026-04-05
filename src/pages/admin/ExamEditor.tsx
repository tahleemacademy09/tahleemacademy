// src/pages/admin/ExamEditor.tsx
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
import { 
  Plus, Trash2, Save, GripVertical, Music, FileText, Calendar, Settings2, 
  Upload, Download, Image as ImageIcon, Loader2, Eye, Library, Clock, 
  AlertCircle, CheckCircle, XCircle, HelpCircle, Smartphone, Tablet, Monitor 
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import RichTextEditor from "@/components/exam/RichTextEditor";
import { sanitizeHtml } from "@/lib/sanitize";
import BulkQuestionFormatter, { DEFAULT_FORMAT, type ExamFormatSettings } from "@/components/exam/BulkQuestionFormatter";

// ── Interfaces ──
interface QuestionForm {
  id?: string;
  question_type: string;
  question_text: string;
  question_text_ar: string;
  options: Array<{
    id: string;
    text: string;
    text_ar: string;
    is_correct: boolean;
    image_url: string;
  }>;
  correct_answer: string;
  accepted_answers: string[];
  points: number;
  difficulty: string;
  sort_order: number;
  explanation: string;
  explanation_ar: string;
  feedback_incorrect: string;  media_url: string;
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
  title: string;
  title_ar: string;
  description: string;
  description_ar: string;
  time_limit_minutes: number;
  passing_score: number;
  max_attempts: number;
  randomize_questions: boolean;
  randomize_answers: boolean;
  show_results_immediately: boolean;
  allow_review: boolean;
  display_mode: string;
  guidelines: string;
  guidelines_ar: string;
  start_date: string;
  end_date: string;
  proctoring_enabled: boolean;
  fullscreen_required: boolean;
  webcam_required: boolean;
  mic_required: boolean;
  tab_switch_limit: number;
  max_warnings: number;
  auto_submit_on_violation: boolean;
  screenshot_interval_seconds: number;
  idle_timeout_seconds: number;
  blur_detection: boolean;
  face_detection: boolean;
  timezone: string;
  term: string;
  max_review_views: number;
  type: "exam" | "test";
  level: string;
}

// ── Constants ──
const emptyQuestion = (): QuestionForm => ({
  question_type: "mcq",  question_text: "",
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
  audio_response_type: "text",
});

const questionTypes = [
  { value: "mcq", label: "Multiple Choice", label_ar: "اختيار من متعدد", icon: "📝", cat: "Standard" },
  { value: "multi_select", label: "Multi-Select", label_ar: "اختيار متعدد", icon: "☑️", cat: "Standard" },
  { value: "true_false", label: "True / False", label_ar: "صح / خطأ", icon: "✓✗", cat: "Standard" },
  { value: "short_answer", label: "Short Answer", label_ar: "إجابة قصيرة", icon: "💬", cat: "Standard" },
  { value: "essay", label: "Essay", label_ar: "مقال", icon: "📄", cat: "Standard" },
  { value: "fill_blank", label: "Fill in the Blank", label_ar: "ملء الفراغ", icon: "___", cat: "Standard" },
  { value: "image_mcq", label: "Image Choice", label_ar: "اختيار بالصور", icon: "🖼️", cat: "Media" },
  { value: "audio", label: "Audio / Dictation", label_ar: "صوت / إملاء", icon: "🎧", cat: "Media" },
  { value: "drawing", label: "Drawing / Whiteboard", label_ar: "رسم / لوحة بيضاء", icon: "✏️", cat: "Media" },
  { value: "matching", label: "Matching (Drag & Drop)", label_ar: "مطابقة (سحب وإفلات)", icon: "🔗", cat: "Interactive" },
  { value: "ordering", label: "Ordering / Sequence", label_ar: "ترتيب / تسلسل", icon: "📋", cat: "Interactive" },
];

const toLocalDatetimeString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
};
// ── Helper: Mobile Detection Hook ──
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  
  return isMobile;
};

// ── Helper: Bulk Template Download Component ──
const BulkTemplateDownload = ({ className }: { className?: string }) => {
  const downloadTemplate = () => {
    const headers = [
      "question_type", "question_text", "question_text_ar",
      "option_a", "option_a_ar", "option_b", "option_b_ar",
      "option_c", "option_c_ar", "option_d", "option_d_ar",
      "correct_answer", "points", "difficulty", "explanation", "explanation_ar"
    ];
    
    const sampleRow = [
      "mcq",
      "Sample question in English",
      "سؤال مثال بالعربية",
      "Option A", "الخيار أ",
      "Option B", "الخيار ب", 
      "Option C", "الخيار ج",
      "Option D", "الخيار د",
      "A", "1", "medium",
      "Explanation in English",
      "شرح بالعربية"
    ];
    
    const csvContent = [
      headers.join(","),
      sampleRow.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "exam_questions_template.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);    link.click();
    document.body.removeChild(link);
  };

  return (
    <Button variant="outline" size="sm" onClick={downloadTemplate} className={cn("gap-2", className)}>
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">Download CSV Template</span>
      <span className="sm:hidden">Template</span>
    </Button>
  );
};

// ── Main Component ──
const ExamEditor = () => {
  const { examId } = useParams<{ examId: string }>();
  const isEdit = !!examId;
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  // ── State ──
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
    screenshot_interval_seconds: 0,
    idle_timeout_seconds: 300,
    blur_detection: false, face_detection: false,
    timezone: "UTC",
    term: "first",
    max_review_views: 1,
    type: "exam",
    level: "",
  });
  
  const [questions, setQuestions] = useState<QuestionForm[]>([emptyQuestion()]);
  const [formatSettings, setFormatSettings] = useState<ExamFormatSettings>({ ...DEFAULT_FORMAT });  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankQuestions, setBankQuestions] = useState<any[]>([]);
  const [bankSelected, setBankSelected] = useState<Set<string>>(new Set());
  const [bankSearch, setBankSearch] = useState("");
  const [bankLoading, setBankLoading] = useState(false);
  const [uploadingOptionImage, setUploadingOptionImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("settings");
  const [scheduleErrors, setScheduleErrors] = useState<{start?: string; end?: string}>({});
  const [proctoringPreview, setProctoringPreview] = useState(false);

  // ── Theme Colors ──
  const G = "#064E3B";
  const GOLD = "#c9a84c";

  // ── Tabs Configuration ──
  const tabs = [
    { value: "settings", icon: <Settings2 className="w-4 h-4"/>, label: t("Settings", "الإعدادات") },
    { value: "proctoring", icon: <AlertCircle className="w-4 h-4"/>, label: t("Proctoring", "المراقبة") },
    { value: "schedule", icon: <Calendar className="w-4 h-4"/>, label: t("Schedule", "الجدولة") },
    { value: "questions", icon: <FileText className="w-4 h-4"/>, label: `${t("Questions", "الأسئلة")} (${questions.length})` },
  ];

  // ── Question Management ──
  const addQuestion = () => setQuestions(q => [...q, { ...emptyQuestion(), sort_order: q.length }]);
  
  const removeQuestion = (idx: number) => setQuestions(q => q.filter((_, i) => i !== idx));
  
  const updateQuestion = (idx: number, updates: Partial<QuestionForm>) =>
    setQuestions(q => q.map((qq, i) => i === idx ? { ...qq, ...updates } : qq));

  // ── Media Upload ──
  const uploadMedia = async (file: File, idx: number) => {
    setUploadingMedia(idx);
    try {
      const path = `exam-media/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("exam-media").upload(path, file);
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage.from("exam-media").getPublicUrl(path);
      updateQuestion(idx, { media_url: publicUrl });
      toast({ title: "✅ Media uploaded", variant: "default" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
    setUploadingMedia(null);
  };
  // ── Bulk Import Logic (CSV/Excel) ──
  const parseCSVRow = (row: string[]): Partial<QuestionForm> => {
    const [
      question_type, question_text, question_text_ar,
      optA, optA_ar, optB, optB_ar, optC, optC_ar, optD, optD_ar,
      correct_answer, points, difficulty, explanation, explanation_ar
    ] = row.map(cell => String(cell || "").trim());
    
    const options = [
      { id: "a", text: optA || "", text_ar: optA_ar || "", is_correct: correct_answer?.toUpperCase() === "A", image_url: "" },
      { id: "b", text: optB || "", text_ar: optB_ar || "", is_correct: correct_answer?.toUpperCase() === "B", image_url: "" },
      { id: "c", text: optC || "", text_ar: optC_ar || "", is_correct: correct_answer?.toUpperCase() === "C", image_url: "" },
      { id: "d", text: optD || "", text_ar: optD_ar || "", is_correct: correct_answer?.toUpperCase() === "D", image_url: "" },
    ].filter(opt => opt.text || opt.text_ar);
    
    // Ensure at least 2 options for MCQ
    const finalOptions = options.length >= 2 ? options : emptyQuestion().options.slice(0, Math.max(2, options.length));
    
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

  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const fileName = file.name.toLowerCase();
      let importedQuestions: QuestionForm[] = [];
      
      if (fileName.endsWith(".csv")) {
        const text = await file.text();
        const lines = text.split("\n")
          .map(line => line.trim())
          .filter(line => line && !line.toLowerCase().startsWith("question_type"));
        
        importedQuestions = lines.map((line, index) => {
          // CSV parser with quote handling
          const row: string[] = [];
          let current = "";
          let inQuotes = false;          
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === "," && !inQuotes) {
              row.push(current.trim());
              current = "";
            } else {
              current += char;
            }
          }
          row.push(current.trim());
          
          return {
            ...emptyQuestion(),
            ...parseCSVRow(row),
            sort_order: questions.length + index
          };
        });
        
      } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        importedQuestions = jsonData
          .slice(1)
          .filter((row: any) => row[0])
          .map((row: any[], index: number) => ({
            ...emptyQuestion(),
            ...parseCSVRow(row.map(cell => String(cell || ""))),
            sort_order: questions.length + index
          }));
      } else {
        throw new Error("Unsupported format. Use .csv or .xlsx");
      }
      
      if (importedQuestions.length === 0) {
        throw new Error("No valid questions found");
      }
      
      setQuestions(prev => [...prev, ...importedQuestions]);
      toast({
        title: "✅ Import Successful",
        description: `Added ${importedQuestions.length} questions`,
      });
          } catch (error: any) {
      console.error("Import error:", error);
      toast({
        title: "❌ Import Failed",
        description: error.message || "Check file format",
        variant: "destructive",
      });
    }
    
    if (bulkFileInputRef.current) bulkFileInputRef.current.value = "";
  };

  // ── Schedule Validation ──
  const validateSchedule = () => {
    const errors: {start?: string; end?: string} = {};
    const { start_date, end_date } = examForm;
    
    if (start_date && end_date) {
      const start = new Date(start_date);
      const end = new Date(end_date);
      
      if (start >= end) errors.end = "End must be after start";
      if (start < new Date()) errors.start = "Start cannot be in past";
    }
    
    setScheduleErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Save Exam ──
  const handleSave = async () => {
    if (!examForm.title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    
    if (examForm.start_date && examForm.end_date && !validateSchedule()) {
      toast({ title: "Invalid schedule", description: "Check date settings", variant: "destructive" });
      return;
    }
    
    setSaving(true);
    try {
      const examPayload: any = {
        title: examForm.title, title_ar: examForm.title_ar || null,
        description: examForm.description || null, description_ar: examForm.description_ar || null,
        time_limit_minutes: examForm.time_limit_minutes, passing_score: examForm.passing_score,
        max_attempts: examForm.max_attempts,
        randomize_questions: examForm.randomize_questions, randomize_answers: examForm.randomize_answers,
        show_results_immediately: examForm.show_results_immediately, allow_review: examForm.allow_review,        display_mode: examForm.display_mode,
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
        timezone: examForm.timezone,
        term: examForm.term, max_review_views: examForm.max_review_views,
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
      
      // Save questions
      if (isEdit) {
        await supabase.from("exam_questions").delete().eq("exam_id", savedExamId);
      }
      
      const qPayloads = questions.map((q, i) => ({
        exam_id: savedExamId!, question_type: q.question_type, question_text: sanitizeHtml(q.question_text),
        question_text_ar: q.question_text_ar ? sanitizeHtml(q.question_text_ar) : null,
        options: q.options?.length ? q.options : null, correct_answer: q.correct_answer || null,
        points: q.points || 1, difficulty: q.difficulty || "medium", sort_order: i,
        explanation: q.explanation || null, media_url: q.media_url || null,
        partial_credit: q.partial_credit, case_sensitive: q.case_sensitive,
        min_words: q.min_words || null, max_words: q.max_words || null,
        question_timer_seconds: q.question_timer_seconds || null,
        background_image: q.background_image || null, audio_response_type: q.audio_response_type || null,
      }));
      
      if (qPayloads.length) {
        const { error } = await supabase.from("exam_questions").insert(qPayloads);
        if (error) throw error;      }
      
      toast({ title: isEdit ? "✅ Exam updated" : "✅ Exam created" });
      navigate("/admin/exams");
      
    } catch (e: any) {
      console.error("Save error:", e);
      toast({ title: "❌ Save failed", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  // ── Question Bank ──
  const openQuestionBank = async () => {
    setBankOpen(true); setBankLoading(true);
    try {
      const { data } = await supabase
        .from("exam_questions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      setBankQuestions(data || []);
    } catch (e) {
      toast({ title: "Failed to load bank", variant: "destructive" });
    }
    setBankLoading(false);
  };

  // ── Load Existing Exam ──
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
          randomize_questions: exam.randomize_questions || false, randomize_answers: exam.randomize_answers || false,
          show_results_immediately: exam.show_results_immediately ?? true, allow_review: exam.allow_review ?? true,
          display_mode: exam.display_mode || "one_at_a_time",
          guidelines: exam.guidelines || "", guidelines_ar: exam.guidelines_ar || "",
          start_date: exam.start_date ? toLocalDatetimeString(new Date(exam.start_date)) : "",
          end_date: exam.end_date ? toLocalDatetimeString(new Date(exam.end_date)) : "",
          proctoring_enabled: exam.proctoring_enabled || false,
          fullscreen_required: exam.fullscreen_required || false,
          webcam_required: exam.webcam_required || false,
          mic_required: exam.mic_required || false,          tab_switch_limit: exam.tab_switch_limit || 3, max_warnings: exam.max_warnings || 3,
          auto_submit_on_violation: exam.auto_submit_on_violation || false,
          screenshot_interval_seconds: exam.screenshot_interval_seconds || 0,
          idle_timeout_seconds: exam.idle_timeout_seconds || 300,
          blur_detection: exam.blur_detection || false,
          face_detection: exam.face_detection || false,
          timezone: exam.timezone || "UTC",
          term: exam.term || "first", max_review_views: exam.max_review_views || 1,
          type: (exam.type as "exam" | "test") || "exam", level: exam.level || "",
        });
      }
      
      const { data: qs } = await supabase
        .from("exam_questions")
        .select("*")
        .eq("exam_id", examId)
        .order("sort_order");
      
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
          background_image: q.background_image || "", audio_response_type: (q.audio_response_type as "text" | "audio") || "text",
        })));
      }
    })();
  }, [examId]);

  // ── Render ──
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white font-['Cairo'] pb-24">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap');`}</style>

      {/* ── Sticky Header ── */}
      <div 
        className={cn(
          "sticky top-0 z-50 transition-all shadow-lg backdrop-blur-md",
          "border-b border-white/10"
        )}
        style={{ background: "linear-gradient(135deg, #064E3B 0%, #083320 100%)" }}      >
        <div className={cn(
          "mx-auto px-3 sm:px-6 pt-3 sm:pt-5 pb-2",
          isMobile ? "max-w-full" : "max-w-6xl"
        )}>
          {/* Top Bar */}
          <div className={cn(
            "flex items-start sm:items-center justify-between gap-3 sm:gap-4 mb-3",
            isMobile ? "flex-col" : "flex-row"
          )}>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={() => navigate("/admin/exams")}
                className="bg-white/10 hover:bg-white/20 transition-colors border-0 rounded-xl px-3 sm:px-4 py-2 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shrink-0"
              >
                ← <span className="hidden sm:inline">{t("Back", "رجوع")}</span>
              </button>
              
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-lg sm:text-xl">{examForm.type === "test" ? "📋" : "📝"}</span>
                  <h1 className="text-lg sm:text-xl font-black text-white m-0 tracking-tight truncate">
                    {isEdit ? t("Edit Exam", "تعديل الامتحان") : t("Create Exam", "إنشاء امتحان")}
                  </h1>
                </div>
                {examForm.title && (
                  <p className="text-[10px] sm:text-xs text-white/70 m-0 font-medium truncate">
                    {examForm.title}{examForm.title_ar ? ` · ${examForm.title_ar}` : ""}
                  </p>
                )}
              </div>
            </div>

            {/* Stats & Save */}
            <div className={cn(
              "flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0",
              isMobile ? "justify-center" : "justify-end"
            )}>
              {[
                { label: "Q's", value: questions.length, color: GOLD },
                { label: "Pts", value: questions.reduce((s,q) => s + (q.points||1), 0), color: "text-green-300" },
                { label: "Min", value: examForm.time_limit_minutes, color: "text-blue-300" },
              ].map((stat, i) => (
                <div key={i} className="bg-white/10 rounded-lg sm:rounded-xl px-2 sm:px-4 py-1.5 sm:py-2 text-center min-w-[50px] sm:min-w-[70px]">
                  <div className={cn("text-sm sm:text-lg font-black leading-none", stat.color)}>{stat.value}</div>
                  <div className="text-[8px] sm:text-[10px] text-white/60 font-bold uppercase tracking-wider mt-0.5">{t(stat.label, stat.label)}</div>
                </div>
              ))}
              
              <button                onClick={handleSave}
                disabled={saving}
                className={cn(
                  "border-0 rounded-xl px-4 sm:px-6 py-2 text-xs sm:text-sm font-black flex items-center gap-1.5 sm:gap-2 shadow-lg transition-all active:scale-95 shrink-0",
                  saving ? "bg-white/20 text-white/60 cursor-not-allowed" : "cursor-pointer hover:shadow-xl hover:-translate-y-0.5"
                )}
                style={{ background: saving ? undefined : GOLD, color: saving ? undefined : "#064E3B" }}
              >
                {saving ? (
                  <><Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin"/> <span className="hidden sm:inline">{t("Saving…", "حفظ…")}</span></>
                ) : (
                  <><Save className="w-3 h-3 sm:w-4 sm:h-4"/> <span className="hidden sm:inline">{examForm.type === "test" ? t("Save Test", "حفظ التمرين") : t("Save Exam", "حفظ الامتحان")}</span></>
                )}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 overflow-x-auto hide-scrollbar -mx-1 px-1">
            {tabs.map(tab => (
              <button 
                key={tab.value} 
                onClick={() => setActiveTab(tab.value)} 
                className={cn(
                  "flex-1 min-w-[80px] sm:min-w-[120px] px-2 sm:px-4 py-2.5 sm:py-3 border-0 cursor-pointer rounded-t-lg sm:rounded-t-xl text-[10px] sm:text-sm font-bold flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-2 transition-all relative overflow-hidden",
                  activeTab === tab.value 
                    ? "bg-slate-50 text-emerald-900 shadow-[0_-2px_10px_rgba(0,0,0,0.1)]" 
                    : "bg-transparent text-white/70 hover:bg-white/5 hover:text-white"
                )}
              >
                <span className="text-base sm:text-base">{tab.icon}</span>
                <span className="truncate">{tab.label}</span>
                {activeTab === tab.value && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 sm:h-1" style={{ background: GOLD }} />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className={cn(
        "mx-auto px-3 sm:px-6 pt-4 sm:pt-8",
        isMobile ? "max-w-full" : "max-w-6xl"
      )}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-0">
          <TabsList className="hidden" />

          {/* ✅ Settings Tab */}          <TabsContent value="settings" className="m-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
              <CardHeader className={cn(
                "border-b border-slate-100 pb-4",
                isMobile ? "px-4 py-3" : "px-6 py-4",
                "bg-gradient-to-r from-slate-50 to-white"
              )}>
                <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                  <Settings2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-700"/>
                  {t("General Information", "المعلومات العامة")}
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-1">
                  {t("Configure basic exam settings", "تكوين إعدادات الامتحان الأساسية")}
                </CardDescription>
              </CardHeader>
              <CardContent className={cn("space-y-6", isMobile ? "p-4" : "p-6")}>
                
                {/* Assessment Type */}
                <div className="space-y-3">
                  <Label className="text-sm font-bold text-slate-700">{t("Assessment Type", "نوع التقييم")}</Label>
                  <div className={cn("grid gap-3", isMobile ? "grid-cols-1" : "grid-cols-2")}>
                    {[
                      { value: "exam" as const, label: t("Exam", "امتحان"), sub: t("Max 70 marks", "70 درجة كحد أقصى"), icon: "📝", color: "border-emerald-600 bg-emerald-50 text-emerald-900" },
                      { value: "test" as const, label: t("Test", "تمرين"), sub: t("Max 30 marks", "30 درجة كحد أقصى"), icon: "📋", color: "border-amber-500 bg-amber-50 text-amber-900" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setExamForm({ ...examForm, type: opt.value })}
                        className={cn(
                          "rounded-xl border-2 p-3 sm:p-4 text-start transition-all flex items-center gap-3",
                          examForm.type === opt.value ? opt.color : "border-slate-200 hover:border-slate-300 bg-white text-slate-600"
                        )}
                      >
                        <span className="text-xl">{opt.icon}</span>
                        <div>
                          <p className="font-bold text-sm sm:text-base">{opt.label}</p>
                          <p className="text-[10px] sm:text-[11px] opacity-80 mt-0.5">{opt.sub}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Level & Term */}
                <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-2")}>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold text-slate-700">{t("Target Level", "المستوى المستهدف")}</Label>
                    <Select value={examForm.level || "none"} onValueChange={(v) => setExamForm({ ...examForm, level: v === "none" ? "" : v })}>
                      <SelectTrigger className="h-11 rounded-lg"><SelectValue placeholder={t("Select level", "اختر المستوى")} /></SelectTrigger>                      <SelectContent>
                        <SelectItem value="none">{t("All Levels", "جميع المستويات")}</SelectItem>
                        <SelectItem value="beginner">{t("Beginner", "مبتدئ")}</SelectItem>
                        <SelectItem value="intermediate">{t("Intermediate", "متوسط")}</SelectItem>
                        <SelectItem value="advanced">{t("Advanced", "متقدم")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold text-slate-700">{t("Term", "الفصل")}</Label>
                    <Select value={examForm.term} onValueChange={(v) => setExamForm({ ...examForm, term: v })}>
                      <SelectTrigger className="h-11 rounded-lg"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="first">{t("First Term", "الفصل الأول")}</SelectItem>
                        <SelectItem value="second">{t("Second Term", "الفصل الثاني")}</SelectItem>
                        <SelectItem value="third">{t("Third Term", "الفصل الثالث")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Titles */}
                <div className="space-y-4">
                  <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-2")}>
                    <div className="space-y-2">
                      <Label className="font-semibold text-slate-700 text-sm">{t("Title (English)", "العنوان (إنجليزي)")}</Label>
                      <Input value={examForm.title} onChange={(e) => setExamForm({ ...examForm, title: e.target.value })} className="rounded-lg bg-slate-50/50 h-10" placeholder="Enter exam title" />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-semibold text-slate-700 text-sm">{t("Title (Arabic)", "العنوان (عربي)")}</Label>
                      <Input value={examForm.title_ar} onChange={(e) => setExamForm({ ...examForm, title_ar: e.target.value })} dir="rtl" className="rounded-lg bg-slate-50/50 h-10" placeholder="أدخل عنوان الامتحان" />
                    </div>
                  </div>
                  <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-2")}>
                    <div className="space-y-2">
                      <Label className="font-semibold text-slate-700 text-sm">{t("Description", "الوصف")}</Label>
                      <Textarea value={examForm.description} onChange={(e) => setExamForm({ ...examForm, description: e.target.value })} className="rounded-lg bg-slate-50/50 min-h-[80px]" placeholder="Brief description..." />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-semibold text-slate-700 text-sm">{t("Description (Arabic)", "الوصف (عربي)")}</Label>
                      <Textarea value={examForm.description_ar} onChange={(e) => setExamForm({ ...examForm, description_ar: e.target.value })} dir="rtl" className="rounded-lg bg-slate-50/50 min-h-[80px]" placeholder="وصف مختصر..." />
                    </div>
                  </div>
                </div>

                {/* Logistics */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <Label className="text-xs font-bold text-slate-500 uppercase mb-3 block">{t("Exam Logistics", "لوجستيات الامتحان")}</Label>
                  <div className={cn("grid gap-3", isMobile ? "grid-cols-2" : "grid-cols-4")}>
                    {[                      { label: t("Time (min)", "الوقت (د)"), key: "time_limit_minutes", type: "number", min: 1, max: 300 },
                      { label: t("Passing %", "نسبة النجاح"), key: "passing_score", type: "number", min: 0, max: 100 },
                      { label: t("Attempts", "محاولات"), key: "max_attempts", type: "number", min: 1, max: 10 },
                      { label: t("Max Review", "الحد الأقصى للمراجعة"), key: "max_review_views", type: "number", min: 1, max: 5 },
                    ].map((field) => (
                      <div key={field.key} className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase">{field.label}</Label>
                        <Input 
                          type={field.type} min={field.min} max={field.max}
                          value={(examForm as any)[field.key]} 
                          onChange={(e) => setExamForm({ ...examForm, [field.key]: parseInt(e.target.value) || field.min })} 
                          className="rounded-lg h-9 text-sm text-center font-semibold" 
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Display Options */}
                <div className="bg-gradient-to-br from-emerald-50/50 to-white border border-emerald-100 rounded-2xl overflow-hidden">
                  <div className="p-3 sm:p-4 bg-emerald-100/30 border-b border-emerald-100">
                    <h3 className="text-sm font-bold text-emerald-900 flex items-center gap-2">
                      <Eye className="w-4 h-4"/>
                      {t("Display & Behavior", "العرض والسلوك")}
                    </h3>
                  </div>
                  <div className={cn("p-4 grid gap-3", isMobile ? "grid-cols-1" : "grid-cols-2")}>
                    {[
                      { key: "randomize_questions", label: t("Randomize Questions", "ترتيب عشوائي للأسئلة"), desc: t("Shuffle question order", "خلط ترتيب الأسئلة") },
                      { key: "randomize_answers", label: t("Randomize Answers", "ترتيب عشوائي للإجابات"), desc: t("Shuffle options per question", "خلط الخيارات لكل سؤال") },
                      { key: "show_results_immediately", label: t("Show Results Immediately", "عرض النتائج فورًا"), desc: t("Display score after submission", "عرض الدرجة بعد الإرسال") },
                      { key: "allow_review", label: t("Allow Review", "السماح بالمراجعة"), desc: t("Let students review answers", "السماح للطلاب بمراجعة الإجابات") },
                    ].map((toggle) => (
                      <div key={toggle.key} className="flex items-center justify-between gap-3 p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                        <div>
                          <Label className="text-sm font-semibold cursor-pointer block">{toggle.label}</Label>
                          <p className="text-[10px] text-slate-400 mt-0.5">{toggle.desc}</p>
                        </div>
                        <Switch 
                          checked={(examForm as any)[toggle.key]} 
                          onCheckedChange={(v) => setExamForm({ ...examForm, [toggle.key]: v })} 
                          className="data-[state=checked]:bg-emerald-600"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          {/* ✅ Proctoring Tab */}
          <TabsContent value="proctoring" className="m-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardHeader className={cn(
                "border-b border-slate-100 pb-4",
                isMobile ? "px-4 py-3" : "px-6 py-4",
                "bg-gradient-to-r from-amber-50/50 to-white"
              )}>
                <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600"/>
                  {t("Proctoring Settings", "إعدادات المراقبة")}
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-1">
                  {t("Enable anti-cheating measures", "تفعيل إجراءات منع الغش")}
                </CardDescription>
              </CardHeader>
              <CardContent className={cn("space-y-6", isMobile ? "p-4" : "p-6")}>
                
                {/* Proctoring Toggle */}
                <div className="flex items-center justify-between p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <div>
                    <Label className="text-base font-bold text-amber-900 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4"/>
                      {t("Enable Proctoring", "تفعيل المراقبة")}
                    </Label>
                    <p className="text-sm text-amber-700 mt-1">
                      {t("Monitor students during exam", "مراقبة الطلاب أثناء الامتحان")}
                    </p>
                  </div>
                  <Switch 
                    checked={examForm.proctoring_enabled} 
                    onCheckedChange={(v) => setExamForm({ ...examForm, proctoring_enabled: v })}
                    className="data-[state=checked]:bg-amber-600"
                  />
                </div>

                {examForm.proctoring_enabled && (
                  <div className="space-y-5 animate-in fade-in slide-in-from-top-2">
                    
                    {/* Device Requirements */}
                    <div className="space-y-3">
                      <Label className="text-sm font-bold text-slate-700">{t("Device Requirements", "متطلبات الجهاز")}</Label>
                      <div className={cn("grid gap-3", isMobile ? "grid-cols-1" : "grid-cols-3")}>
                        {[
                          { key: "fullscreen_required", label: t("Fullscreen Mode", "وضع ملء الشاشة"), icon: <Monitor className="w-4 h-4"/>, desc: t("Require full-screen browser", "تطلب متصفح ملء الشاشة") },
                          { key: "webcam_required", label: t("Webcam Access", "وصول الكاميرا"), icon: <ImageIcon className="w-4 h-4"/>, desc: t("Monitor via camera", "المراقبة عبر الكاميرا") },
                          { key: "mic_required", label: t("Microphone Access", "وصول الميكروفون"), icon: <Music className="w-4 h-4"/>, desc: t("Detect ambient sounds", "كشف الأصوات المحيطة") },
                        ].map((req) => (
                          <div key={req.key} className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-200">                            <div className="p-2 bg-slate-100 rounded-lg text-slate-600">{req.icon}</div>
                            <div className="flex-1">
                              <Label className="text-sm font-semibold cursor-pointer flex items-center gap-2">
                                {req.label}
                                <Switch 
                                  checked={(examForm as any)[req.key] || false} 
                                  onCheckedChange={(v) => setExamForm({ ...examForm, [req.key]: v })} 
                                  className="ml-auto"
                                />
                              </Label>
                              <p className="text-[10px] text-slate-400 mt-0.5">{req.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Violation Limits */}
                    <div className="space-y-3">
                      <Label className="text-sm font-bold text-slate-700">{t("Violation Limits", "حدود الانتهاكات")}</Label>
                      <div className={cn("grid gap-4 p-4 bg-slate-50 rounded-xl", isMobile ? "grid-cols-2" : "grid-cols-4")}>
                        {[
                          { key: "tab_switch_limit", label: t("Tab Switches", "تبديل التبويبات"), min: 0, max: 10 },
                          { key: "max_warnings", label: t("Max Warnings", "الحد الأقصى للتحذيرات"), min: 1, max: 10 },
                          { key: "screenshot_interval_seconds", label: t("Screenshot Interval", "فترة اللقطات"), min: 0, max: 300, step: 10, suffix: "sec" },
                          { key: "idle_timeout_seconds", label: t("Idle Timeout", "مهلة الخمول"), min: 0, max: 600, step: 30, suffix: "sec" },
                        ].map((field) => (
                          <div key={field.key} className="space-y-1.5">
                            <Label className="text-[10px] font-bold text-slate-400 uppercase">{field.label}</Label>
                            <div className="relative">
                              <Input 
                                type="number" min={field.min} max={field.max} step={field.step || 1}
                                value={(examForm as any)[field.key] || 0} 
                                onChange={(e) => setExamForm({ ...examForm, [field.key]: parseInt(e.target.value) || 0 })} 
                                className="rounded-lg h-9 text-sm text-center font-semibold pr-8" 
                              />
                              {field.suffix && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">{field.suffix}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Auto-Actions */}
                    <div className="space-y-3">
                      <Label className="text-sm font-bold text-slate-700">{t("Auto-Actions", "الإجراءات التلقائية")}</Label>
                      <div className="space-y-2">
                        {[                          { key: "auto_submit_on_violation", label: t("Auto-submit on violation", "إرسال تلقائي عند الانتهاك"), desc: t("End exam after max warnings", "إنهاء الامتحان بعد التحذيرات القصوى") },
                          { key: "blur_detection", label: t("Blur Detection", "كشف ضبابية الكاميرا"), desc: t("Alert if camera is covered", "تنبيه إذا تم تغطية الكاميرا") },
                          { key: "face_detection", label: t("Face Detection", "كشف الوجه"), desc: t("Require face in frame", "تطلب وجود وجه في الإطار") },
                        ].map((action) => (
                          <div key={action.key} className="flex items-center justify-between gap-3 p-3 bg-white rounded-xl border border-slate-100">
                            <div>
                              <Label className="text-sm font-semibold cursor-pointer block">{action.label}</Label>
                              <p className="text-[10px] text-slate-400 mt-0.5">{action.desc}</p>
                            </div>
                            <Switch 
                              checked={(examForm as any)[action.key] || false} 
                              onCheckedChange={(v) => setExamForm({ ...examForm, [action.key]: v })} 
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Preview */}
                    <div className="pt-2">
                      <Button 
                        variant="outline" size="sm" onClick={() => setProctoringPreview(true)}
                        className="gap-2 w-full sm:w-auto"
                      >
                        <Eye className="h-4 w-4"/>
                        {t("Preview Proctoring View", "معاينة عرض المراقبة")}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ✅ Schedule Tab */}
          <TabsContent value="schedule" className="m-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardHeader className={cn(
                "border-b border-slate-100 pb-4",
                isMobile ? "px-4 py-3" : "px-6 py-4",
                "bg-gradient-to-r from-blue-50/50 to-white"
              )}>
                <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                  <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600"/>
                  {t("Schedule & Availability", "الجدولة والتوفر")}
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-1">
                  {t("Set exam dates and time windows", "تعيين تواريخ الامتحان ونوافذ الوقت")}
                </CardDescription>
              </CardHeader>              <CardContent className={cn("space-y-6", isMobile ? "p-4" : "p-6")}>
                
                {/* Date Pickers */}
                <div className="space-y-4">
                  <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-2")}>
                    <div className="space-y-2">
                      <Label className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-green-600"/>
                        {t("Start Date & Time", "تاريخ ووقت البدء")}
                      </Label>
                      <Input 
                        type="datetime-local" 
                        value={examForm.start_date} 
                        onChange={(e) => {
                          setExamForm({ ...examForm, start_date: e.target.value });
                          if (scheduleErrors.start) setScheduleErrors(prev => ({ ...prev, start: undefined }));
                        }} 
                        className={cn("rounded-lg bg-slate-50/50 h-11", scheduleErrors.start && "border-red-300 focus-visible:ring-red-500")}
                      />
                      {scheduleErrors.start && (
                        <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                          <XCircle className="w-3 h-3"/> {scheduleErrors.start}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-red-600"/>
                        {t("End Date & Time", "تاريخ ووقت الانتهاء")}
                      </Label>
                      <Input 
                        type="datetime-local" 
                        value={examForm.end_date} 
                        onChange={(e) => {
                          setExamForm({ ...examForm, end_date: e.target.value });
                          if (scheduleErrors.end) setScheduleErrors(prev => ({ ...prev, end: undefined }));
                        }} 
                        className={cn("rounded-lg bg-slate-50/50 h-11", scheduleErrors.end && "border-red-300 focus-visible:ring-red-500")}
                      />
                      {scheduleErrors.end && (
                        <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                          <XCircle className="w-3 h-3"/> {scheduleErrors.end}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Quick Schedule */}
                  <div className="flex flex-wrap gap-2">
                    {[                      { label: t("Now", "الآن"), value: new Date().toISOString().slice(0, 16) },
                      { label: t("+1 Hour", "+ساعة"), value: new Date(Date.now() + 3600000).toISOString().slice(0, 16) },
                      { label: t("Tomorrow", "غدًا"), value: new Date(Date.now() + 86400000).toISOString().slice(0, 16) },
                      { label: t("+1 Week", "+أسبوع"), value: new Date(Date.now() + 604800000).toISOString().slice(0, 16) },
                    ].map((quick) => (
                      <Button
                        key={quick.label}
                        variant="outline" size="sm"
                        onClick={() => setExamForm({ ...examForm, start_date: quick.value })}
                        className="text-xs h-8 rounded-lg"
                      >
                        {quick.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Availability Window */}
                <div className="space-y-3">
                  <Label className="text-sm font-bold text-slate-700">{t("Availability Window", "نافذة التوفر")}</Label>
                  <div className={cn("grid gap-3 p-4 bg-slate-50 rounded-xl", isMobile ? "grid-cols-1" : "grid-cols-3")}>
                    {[
                      { key: "available_days", label: t("Available Days", "الأيام المتاحة"), options: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
                      { key: "available_hours_start", label: t("Start Hour", "ساعة البدء"), type: "time" },
                      { key: "available_hours_end", label: t("End Hour", "ساعة الانتهاء"), type: "time" },
                    ].map((field) => (
                      <div key={field.key} className="space-y-2">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase">{field.label}</Label>
                        {field.options ? (
                          <div className="flex flex-wrap gap-1">
                            {field.options.map((day) => (
                              <Button
                                key={day} variant="outline" size="sm"
                                className="h-7 text-xs px-2 rounded-md"
                              >
                                {day}
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <Input type={field.type} className="rounded-lg h-9 text-sm" placeholder={field.label} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Timezone */}
                <div className="space-y-2">
                  <Label className="text-sm font-bold text-slate-700">{t("Timezone", "المنطقة الزمنية")}</Label>                  <Select defaultValue="UTC" value={examForm.timezone} onValueChange={(v) => setExamForm({ ...examForm, timezone: v })}>
                    <SelectTrigger className="rounded-lg h-11"><SelectValue placeholder={t("Select timezone", "اختر المنطقة الزمنية")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC">UTC (Coordinated Universal Time)</SelectItem>
                      <SelectItem value="Asia/Riyadh">Asia/Riyadh (GMT+3)</SelectItem>
                      <SelectItem value="Asia/Dubai">Asia/Dubai (GMT+4)</SelectItem>
                      <SelectItem value="Africa/Cairo">Africa/Cairo (GMT+2)</SelectItem>
                      <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                      <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {t("All times converted to student's local time", "سيتم تحويل جميع الأوقات إلى التوقيت المحلي للطالب")}
                  </p>
                </div>

                {/* Validation */}
                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                  <Button variant="outline" size="sm" onClick={validateSchedule} className="gap-2 w-full sm:w-auto">
                    <CheckCircle className="h-4 w-4"/>
                    {t("Validate Schedule", "التحقق من الجدول")}
                  </Button>
                  {Object.keys(scheduleErrors).length === 0 && examForm.start_date && examForm.end_date && (
                    <Badge variant="secondary" className="bg-green-100 text-green-800 px-3 py-1 h-auto">
                      <CheckCircle className="w-3 h-3 mr-1"/> {t("Schedule Valid", "الجدول صالح")}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ✅ Questions Tab */}
          <TabsContent value="questions" className="m-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-4">
              
              {/* Action Bar */}
              <div className={cn(
                "flex items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl shadow-sm border border-slate-200 sticky top-20 sm:top-24 z-40",
                isMobile ? "flex-wrap overflow-x-auto pb-2" : "flex-nowrap"
              )}>
                <h2 className="text-lg font-black text-emerald-900 flex items-center gap-2 shrink-0">
                  <FileText className="w-5 h-5"/>
                  {t("Questions", "الأسئلة")} 
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 ml-1 text-xs">{questions.length}</Badge>
                </h2>
                
                <div className="flex items-center gap-2 flex-wrap">
                  <input ref={bulkFileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleBulkImport} />
                                    <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5 sm:gap-2 rounded-xl bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm h-9">
                        <Upload className="h-4 w-4" /><span className="hidden sm:inline">{t("Bulk Import", "استيراد جماعي")}</span><span className="sm:hidden">Import</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className={cn("max-w-[95vw] sm:max-w-lg", isMobile ? "p-4" : "p-6")}>
                      <DialogHeader>
                        <DialogTitle className="text-lg">{t("Bulk Import Questions", "استيراد أسئلة جماعي")}</DialogTitle>
                        <DialogDescription className="text-sm">
                          {t("Upload a CSV or Excel file with your questions", "رفع ملف CSV أو Excel يحتوي على أسئلتك")}
                        </DialogDescription>
                      </DialogHeader>
                      
                      <div className="space-y-4 py-4">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <BulkTemplateDownload />
                          <Button variant="outline" size="sm" onClick={() => bulkFileInputRef.current?.click()} className="gap-2 flex-1 sm:flex-initial">
                            <Upload className="h-4 w-4"/>
                            {t("Choose File", "اختر ملف")}
                          </Button>
                        </div>
                        
                        <div className="text-xs text-slate-500 space-y-1 bg-slate-50 p-3 rounded-lg">
                          <p><strong>{t("Required columns", "الأعمدة المطلوبة")}:</strong></p>
                          <code className="block bg-slate-100 p-2 rounded text-[10px] overflow-x-auto">
                            question_type, question_text, correct_answer, points, difficulty
                          </code>
                          <p className="mt-2"><strong>{t("Supported formats", "التنسيقات المدعومة")}:</strong> CSV, XLSX, XLS</p>
                          <p><strong>{t("Max file size", "الحد الأقصى لحجم الملف")}:</strong> 10MB</p>
                        </div>
                        
                        {questions.length > 0 && (
                          <div className="text-xs text-emerald-600 bg-emerald-50 p-3 rounded-lg flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0"/>
                            <span>{t("Tip: Preview questions before saving", "نصيحة: معاينة الأسئلة قبل الحفظ")}</span>
                          </div>
                        )}
                      </div>
                      
                      <DialogFooter>
                        <Button variant="outline" onClick={() => {}}>{t("Cancel", "إلغاء")}</Button>
                        <Button onClick={() => {}} disabled={!bulkFileInputRef.current?.files?.length}>
                          {t("Import", "استيراد")}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Button variant="outline" size="sm" onClick={openQuestionBank} className="gap-1.5 sm:gap-2 rounded-xl bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm h-9">                    <Library className="h-4 w-4" /><span className="hidden sm:inline">{t("Question Bank", "بنك الأسئلة")}</span><span className="sm:hidden">Bank</span>
                  </Button>
                  
                  <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} className="gap-1.5 sm:gap-2 rounded-xl bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm h-9">
                    <Eye className="h-4 w-4" /><span className="hidden sm:inline">{t("Preview", "معاينة")}</span><span className="sm:hidden">View</span>
                  </Button>
                  
                  <Button onClick={addQuestion} className="gap-1.5 sm:gap-2 rounded-xl shadow-md hover:shadow-lg transition-transform active:scale-95 font-bold text-xs sm:text-sm px-3 sm:px-4 h-9" style={{ background: "#064E3B", color: GOLD }}>
                    <Plus className="h-4 w-4" /><span className="hidden sm:inline">{t("Add Question", "إضافة سؤال")}</span><span className="sm:hidden">Add</span>
                  </Button>
                </div>
              </div>

              {/* Bulk Formatter */}
              <details className="group bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <summary className="flex items-center justify-between p-4 cursor-pointer list-none bg-slate-50 hover:bg-slate-100 transition-colors">
                  <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Settings2 className="w-4 h-4"/>
                    {t("Bulk Formatting Options", "خيارات التنسيق الجماعي")}
                  </span>
                  <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="p-4 border-t border-slate-100">
                  <BulkQuestionFormatter 
                    format={formatSettings} 
                    onChange={setFormatSettings} 
                    onApply={() => toast({ title: t(`✅ Formatting applied`, `✅ تم تطبيق التنسيق`) })} 
                    questions={questions} 
                    examTitle={examForm.title} 
                    examTitleAr={examForm.title_ar} 
                  />
                </div>
              </details>

              {/* Questions List */}
              {questions.map((q, idx) => (
                <Card key={idx} className={cn(
                  "border-slate-200 shadow-md rounded-2xl overflow-hidden transition-all hover:shadow-lg focus-within:ring-2 focus-within:ring-emerald-500/20",
                  isMobile ? "mb-3" : "mb-4"
                )}>
                  {/* Header */}
                  <div className={cn(
                    "bg-slate-100/80 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-200 flex items-center justify-between gap-2",
                    isMobile ? "flex-wrap" : "flex-nowrap"
                  )}>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="cursor-grab text-slate-400 hover:text-slate-600 p-0.5 shrink-0">
                        <GripVertical className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                      <div className="min-w-0">                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                          {t("Q", "س")} {idx + 1}
                        </span>
                        <Badge variant="outline" className="bg-white border-slate-300 text-slate-700 shadow-sm mt-0.5 text-[10px] sm:text-xs px-1.5 py-0 h-5">
                          {questionTypes.find(t => t.value === q.question_type)?.icon} 
                          <span className="ml-1 hidden sm:inline">{language === "ar" ? questionTypes.find(t => t.value === q.question_type)?.label_ar : questionTypes.find(t => t.value === q.question_type)?.label}</span>
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <Select value={q.question_type} onValueChange={(v) => updateQuestion(idx, { question_type: v })}>
                        <SelectTrigger className="w-[100px] sm:w-[140px] h-8 sm:h-9 text-[10px] sm:text-xs rounded-lg bg-white border-slate-300 font-semibold"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {questionTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value} className="text-xs">
                              {type.icon} {language === "ar" ? type.label_ar : type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <Select value={q.difficulty} onValueChange={(v) => updateQuestion(idx, { difficulty: v })}>
                        <SelectTrigger className="w-[70px] sm:w-[90px] h-8 sm:h-9 text-[10px] sm:text-xs rounded-lg bg-white border-slate-300 font-semibold"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="easy">{t("Easy", "سهل")}</SelectItem>
                          <SelectItem value="medium">{t("Medium", "متوسط")}</SelectItem>
                          <SelectItem value="hard">{t("Hard", "صعب")}</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <div className="relative flex items-center">
                        <Input type="number" className="w-[50px] sm:w-[70px] h-8 sm:h-9 pr-6 sm:pr-8 text-[10px] sm:text-xs font-bold rounded-lg text-center" placeholder={t("Pts", "ن")} value={q.points} onChange={(e) => updateQuestion(idx, { points: +e.target.value })} />
                        <span className="absolute right-1.5 sm:right-3 text-[8px] sm:text-[10px] text-slate-400 font-bold uppercase">{t("Pts", "ن")}</span>
                      </div>
                      
                      <Button variant="ghost" size="icon" onClick={() => removeQuestion(idx)} className="h-8 w-8 sm:h-9 sm:w-9 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg shrink-0">
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </div>

                  <CardContent className={cn("space-y-4 bg-white", isMobile ? "p-3" : "p-5 sm:p-6")}>
                    {/* Question Text */}
                    <div className="space-y-2">
                      <Label className="text-xs sm:text-sm font-black text-slate-800">
                        {t("Question", "السؤال")} <span className="text-slate-400 font-normal ml-1 text-[10px] sm:text-xs">({t("EN/AR", "إنجليزي/عربي")})</span>
                      </Label>
                      <div className="rounded-lg sm:rounded-xl border border-slate-200 shadow-sm overflow-hidden focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
                        <RichTextEditor                          placeholder={t("Type question...", "اكتب السؤال...")}
                          value={q.question_text}
                          onChange={(val) => updateQuestion(idx, { question_text: val })}
                          dir="auto"
                          className="min-h-[80px] sm:min-h-[100px]"
                        />
                      </div>
                    </div>

                    {/* Media */}
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 transition-colors hover:border-emerald-300">
                      <Label className="flex items-center gap-1.5 mb-2 text-xs font-bold text-slate-700">
                        {q.question_type === "audio" ? <Music className="h-3.5 w-3.5 text-emerald-600" /> : <ImageIcon className="h-3.5 w-3.5 text-emerald-600" />}
                        {t("Media", "وسائط")}
                      </Label>

                      {q.media_url ? (
                        <div className="space-y-2 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                          <div className="flex items-center justify-between gap-2 text-[10px] text-slate-600">
                            <span className="truncate flex-1 font-mono">{q.media_url.split("/").pop()?.substring(0, 20)}...</span>
                            <Button variant="ghost" size="sm" className="text-red-500 h-6 px-1.5 hover:bg-red-50 text-[10px]" onClick={() => updateQuestion(idx, { media_url: "" })}>
                              {t("Remove", "حذف")}
                            </Button>
                          </div>
                          {q.media_url.match(/\.(mp3|wav|ogg)$/i) ? (
                            <audio controls src={q.media_url} className="w-full h-8" />
                          ) : q.media_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                            <img src={q.media_url} alt="Media" className="max-h-32 rounded mx-auto" />
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            variant="secondary" size="sm"
                            className="gap-1.5 rounded-lg font-bold bg-white border border-slate-200 shadow-sm hover:bg-slate-50 text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3"
                            disabled={uploadingMedia === idx}
                            onClick={() => {
                              const input = document.createElement("input");
                              input.type = "file";
                              input.accept = "audio/*,image/*";
                              input.onchange = (e: any) => { const f = e.target.files?.[0]; if (f) uploadMedia(f, idx); };
                              input.click();
                            }}
                          >
                            {uploadingMedia === idx ? <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin text-emerald-600" /> : <Upload className="h-3 w-3 sm:h-4 sm:w-4 text-emerald-600" />}
                            {t("Upload", "رفع")}
                          </Button>
                          <Input
                            placeholder="URL..."
                            value={q.media_url}                            onChange={(e) => updateQuestion(idx, { media_url: e.target.value })}
                            className="flex-1 min-w-[120px] h-7 sm:h-9 rounded-lg text-[10px] sm:text-sm"
                          />
                        </div>
                      )}
                    </div>

                    {/* MCQ Options */}
                    {(q.question_type === "mcq" || q.question_type === "image_mcq") && (
                      <div className="space-y-2 pt-1">
                        <Label className="text-xs sm:text-sm font-black text-slate-800">{t("Options", "الخيارات")}</Label>
                        <div className="grid gap-2">
                          {q.options.slice(0, 4).map((opt: any, oi: number) => (
                            <div 
                              key={opt.id} 
                              className={cn(
                                "flex items-start gap-2 rounded-lg border p-2 transition-all",
                                opt.is_correct ? "border-emerald-500 bg-emerald-50/50" : "border-slate-200 bg-white hover:border-slate-300"
                              )}
                            >
                              <div className="pt-1.5">
                                <div className="relative flex items-center justify-center cursor-pointer">
                                  <input
                                    type="radio" name={`correct-${idx}`} checked={opt.is_correct}
                                    onChange={() => {
                                      const newOpts = q.options.map((o: any, j: number) => ({ ...o, is_correct: j === oi }));
                                      updateQuestion(idx, { options: newOpts, correct_answer: newOpts[oi].id });
                                    }}
                                    className="peer h-4 w-4 appearance-none rounded-full border-2 border-slate-300 checked:border-emerald-600 checked:bg-emerald-600 transition-all"
                                  />
                                  <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100">
                                    <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                                  </div>
                                </div>
                              </div>
                              <Input
                                className={cn("h-8 text-sm font-medium rounded-lg border-slate-200 flex-1", opt.is_correct ? "bg-white border-emerald-200" : "")}
                                placeholder={`${String.fromCharCode(65 + oi)}.`}
                                value={opt.text} dir="auto"
                                onChange={(e) => {
                                  const newOpts = [...q.options];
                                  newOpts[oi] = { ...newOpts[oi], text: e.target.value };
                                  updateQuestion(idx, { options: newOpts });
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}                  </CardContent>

                  {/* Footer */}
                  <div className={cn("bg-slate-50/80 p-3 border-t border-slate-100", isMobile ? "px-3 py-2" : "px-4 py-3")}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-slate-400" />
                        <span className="text-[10px] sm:text-sm font-semibold text-slate-700">{t("Timer", "مؤقت")}</span>
                        <Input type="number" min={0} step={5} className="w-14 h-6 sm:h-8 text-center text-[10px] sm:text-sm font-bold bg-white rounded border-slate-200" value={q.question_timer_seconds||0} onChange={e=>updateQuestion(idx,{question_timer_seconds:+e.target.value})}/>
                        <span className="text-[8px] sm:text-[10px] text-slate-400">{t("sec", "ث")}</span>
                      </div>
                      
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-[10px] sm:text-xs h-7 gap-1">
                            <HelpCircle className="w-3 h-3 sm:w-4 sm:h-4"/>
                            {t("Feedback", "تعليق")}
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle>{t("Feedback Messages", "رسائل التعليق")}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-3 py-2">
                            <div>
                              <Label className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3"/> {t("Correct", "صحيح")}
                              </Label>
                              <Input className="h-8 text-sm mt-1" placeholder={t("Great job!", "أحسنت!")} value={q.explanation||""} onChange={e=>updateQuestion(idx,{explanation:e.target.value})} dir="auto"/>
                            </div>
                            <div>
                              <Label className="text-xs font-bold text-red-700 flex items-center gap-1">
                                <XCircle className="w-3 h-3"/> {t("Incorrect", "خطأ")}
                              </Label>
                              <Input className="h-8 text-sm mt-1" placeholder={t("Review this...", "راجع هذا...")} value={q.feedback_incorrect||""} onChange={e=>updateQuestion(idx,{feedback_incorrect:e.target.value})} dir="auto"/>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </Card>
              ))}
              
              {/* Empty State */}
              {questions.length === 0 && (
                <Card className="border-dashed border-2 border-slate-300 bg-slate-50/50">
                  <CardContent className="p-8 text-center">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3"/>
                    <p className="text-slate-500 font-medium">{t("No questions added yet", "لم تتم إضافة أسئلة بعد")}</p>                    <Button onClick={addQuestion} variant="outline" className="mt-4 gap-2">
                      <Plus className="w-4 h-4"/> {t("Add Your First Question", "أضف سؤالك الأول")}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Preview Modal */}
      {previewOpen && (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("Exam Preview", "معاينة الامتحان")}</DialogTitle>
            </DialogHeader>
            <div className="p-4 text-center text-slate-500">
              {t("Preview functionality coming soon", "ميزة المعاينة قادمة قريبًا")}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Proctoring Preview Modal */}
      {proctoringPreview && (
        <Dialog open={proctoringPreview} onOpenChange={setProctoringPreview}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600"/>
                {t("Proctoring Preview", "معاينة المراقبة")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="aspect-video bg-slate-100 rounded-lg flex items-center justify-center border-2 border-dashed border-slate-300">
                <div className="text-center">
                  <ImageIcon className="w-12 h-12 text-slate-400 mx-auto mb-2"/>
                  <p className="text-sm text-slate-500">{t("Webcam preview area", "منطقة معاينة الكاميرا")}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="font-bold text-amber-900">{t("Active Monitoring", "مراقبة نشطة")}</p>
                  <p className="text-amber-700 text-xs mt-1">{examForm.tab_switch_limit} tab switches allowed</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="font-bold text-blue-900">{t("Auto-Actions", "إجراءات تلقائية")}</p>
                  <p className="text-blue-700 text-xs mt-1">{examForm.auto_submit_on_violation ? "Auto-submit enabled" : "Manual review"}</p>                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setProctoringPreview(false)}>{t("Close", "إغلاق")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default ExamEditor;